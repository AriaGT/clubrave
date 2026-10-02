"use client";

import { Button, Card, CardContent, cn, useAsyncAction } from "@repo/ui";
import { CreditCard, Wallet } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { useCartStore } from "@/features/cart/store";
import {
  useConfirmPayment,
  useOpenPaymentSession,
  useOrderStatus,
  usePaymentMethods,
} from "@/features/checkout/pay-hooks";
import {
  loadPaymentSession,
  savePaymentSession,
  type StoredPaymentSession,
} from "@/features/checkout/payment-session-storage";
import { PaymentForm } from "@/features/checkout/PaymentForm";

/**
 * Tres formas de cobrar detrás de la misma pantalla:
 *
 * - `mercadopago` — Checkout Pro: se redirige al comprador al entorno de
 *   Mercado Pago y vuelve a esta misma URL con `?mp=success|failure|pending`.
 *   Ese parámetro **no decide nada**: al volver se le pide al backend que
 *   reconsulte el cobro a Mercado Pago (ver `confirm_from_browser`).
 * - `izipay` — formulario incrustado real (`PaymentForm`).
 * - `fake` — simulador de desarrollo, que ejercita el mismo camino de código.
 *
 * Si el panel tiene varios medios habilitados, la orden llega sin sesión y el
 * comprador elige aquí cómo pagar; también puede cambiar de medio si el
 * primero le falla, sin perder la orden ni la reserva de entradas.
 */
const METHOD_ICONS: Record<string, typeof CreditCard> = { izipay: CreditCard, mercadopago: Wallet };

function PayScreen() {
  const { orderCode } = useParams<{ orderCode: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [submitted, setSubmitted] = useState(false);
  const [paymentSession, setPaymentSession] = useState<StoredPaymentSession | null>(() =>
    loadPaymentSession(orderCode)
  );
  const [choosing, setChoosing] = useState(false);
  const { data: methods } = usePaymentMethods();
  const openSession = useOpenPaymentSession(orderCode);
  const paymentGateway = paymentSession?.gateway;
  // Con el formulario incrustado el pago no existe hasta que el comprador lo
  // envía: sondear antes solo golpea el backend sin nada que esperar.
  const { data: order, refetch } = useOrderStatus(orderCode, {
    pollUntilPaid: paymentGateway !== "izipay" || submitted,
  });
  const confirm = useConfirmPayment(orderCode);
  const clearCart = useCartStore((s) => s.clear);
  const eventSlug = useCartStore((s) => s.eventSlug);
  const [formError, setFormError] = useState<string | null>(null);

  const mpReturn = searchParams.get("mp");
  const isRedirectGateway = paymentSession?.gateway === "mercadopago";
  const isEmbeddedGateway = paymentSession?.gateway === "izipay";
  const checkoutUrl = paymentSession?.checkout_url ?? "";

  useEffect(() => {
    if (order?.status === "PAID") {
      clearCart();
      router.replace(`/checkout/${orderCode}/success`);
    }
  }, [order?.status, orderCode, router, clearCart]);

  // Ida al checkout de Mercado Pago. Se omite cuando el comprador *vuelve*
  // de allí, o la pantalla entraría en un bucle de redirecciones.
  useEffect(() => {
    if (!order || order.status !== "PENDING") return;
    if (!isRedirectGateway || mpReturn || !checkoutUrl) return;
    window.location.href = checkoutUrl;
  }, [order, isRedirectGateway, mpReturn, checkoutUrl]);

  // Vuelta del checkout: una sola llamada para que el backend reconsulte el
  // cobro. Si falla, el webhook cierra la orden igual y el sondeo lo refleja.
  const alreadyConfirmed = useRef(false);
  useEffect(() => {
    if (!isRedirectGateway || !mpReturn || alreadyConfirmed.current) return;
    alreadyConfirmed.current = true;
    confirm
      .mutateAsync({})
      .catch(() => undefined)
      .finally(() => refetch());
  }, [isRedirectGateway, mpReturn, confirm, refetch]);

  const [decision, setDecision] = useState<boolean | null>(null);
  const decide = useAsyncAction(async (approved: boolean) => {
    setDecision(approved);
    await confirm.mutateAsync({ order_code: orderCode, approved });
    await refetch();
  });

  async function handleRealSubmit(rawResponse: Record<string, unknown>) {
    setFormError(null);
    setSubmitted(true);
    try {
      await confirm.mutateAsync(rawResponse);
    } catch {
      // No es autoritativo (§7.2): si falla el feedback, el IPN igual
      // cerrará la orden y el polling de abajo lo reflejará.
    }
    await refetch();
  }

  async function chooseMethod(method: string) {
    const session = await openSession.mutateAsync(method);
    savePaymentSession(orderCode, session);
    setFormError(null);
    setChoosing(false);
    setPaymentSession(session);
  }

  // Sin sesión y con un único medio (p. ej. la página se abrió en otra
  // pestaña y no hay sesión guardada): se abre sola, no hay nada que elegir.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (paymentSession || !methods || methods.length !== 1 || autoOpened.current) return;
    if (order?.status !== "PENDING") return;
    autoOpened.current = true;
    void chooseMethod(methods[0]!.id).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentSession, methods, order?.status]);

  if (!order) return null;

  const isPending = order.status === "PENDING";
  const canSwitch = (methods?.length ?? 0) > 1 && !submitted;
  const showPicker = isPending && canSwitch && (choosing || !paymentSession);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-[var(--space-6)]">
      <h1 className="font-display text-2xl font-bold">Pago</h1>
      <Card>
        <CardContent className="flex flex-col gap-2 pt-4">
          <p className="text-[var(--color-text-muted)]">Orden {order.code}</p>
          <p className="font-mono text-2xl font-semibold">S/ {order.total}</p>
        </CardContent>
      </Card>

      {showPicker && methods && (
        <div className="flex flex-col gap-3">
          <p className="font-medium">¿Cómo quieres pagar?</p>
          {methods.map((m) => {
            const Icon = METHOD_ICONS[m.id] ?? CreditCard;
            const current = paymentGateway === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={openSession.isPending}
                onClick={() => (current ? setChoosing(false) : void chooseMethod(m.id).catch(() => undefined))}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-md)] border p-4 text-left transition-colors duration-[var(--duration-fast)]",
                  "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-60",
                  current
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]"
                )}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex-1 font-medium">{m.label}</span>
                {openSession.isPending && openSession.variables === m.id && (
                  <span className="text-sm text-[var(--color-text-muted)]">Abriendo…</span>
                )}
              </button>
            );
          })}
          {openSession.isError && (
            <p className="text-sm text-[var(--color-danger)]">
              Ese medio de pago no está disponible ahora. Prueba con otro.
            </p>
          )}
        </div>
      )}

      {!showPicker && isPending && canSwitch && paymentSession && (
        <button
          type="button"
          onClick={() => setChoosing(true)}
          className="-mt-3 self-start text-sm text-[var(--color-accent-text)] underline-offset-4 hover:underline"
        >
          Pagar con otro medio
        </button>
      )}

      {!showPicker && isPending && isRedirectGateway && !mpReturn && checkoutUrl && (
        <div className="flex flex-col gap-3">
          <p className="text-[var(--color-text-muted)]">
            Te estamos llevando a Mercado Pago para completar el pago…
          </p>
          <Button size="lg" onClick={() => (window.location.href = checkoutUrl)}>
            Continuar a Mercado Pago
          </Button>
        </div>
      )}

      {isPending && isRedirectGateway && mpReturn === "pending" && (
        <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3">
          <span className="font-medium text-[var(--color-warning)]">Pago pendiente de confirmación</span>
          <span className="text-sm text-[var(--color-text-muted)]">
            Elegiste un medio de pago que se acredita en unos minutos. Cuando Mercado Pago lo confirme,
            te enviamos las entradas por correo. Puedes cerrar esta página.
          </span>
        </div>
      )}

      {isPending && isRedirectGateway && (mpReturn === "success" || mpReturn === "failure") && (
        <p className="text-[var(--color-text-muted)]">Estamos confirmando tu pago con Mercado Pago…</p>
      )}

      {isPending && isRedirectGateway && !checkoutUrl && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--color-danger)]">
            No se encontró la sesión de pago en este navegador. Si ya pagaste, te enviaremos las
            entradas por correo en cuanto Mercado Pago lo confirme.
          </p>
          <Button onClick={() => router.push(eventSlug ? `/e/${eventSlug}` : "/")}>
            Volver al evento
          </Button>
        </div>
      )}

      {!showPicker && isPending && isEmbeddedGateway && paymentSession && (
        <>
          <PaymentForm session={paymentSession} onSubmitted={handleRealSubmit} onError={setFormError} />
          {formError && <p className="text-sm text-[var(--color-danger)]">{formError}</p>}
          {submitted && (
            <p className="text-sm text-[var(--color-text-muted)]">
              Estamos confirmando tu pago con el banco…
            </p>
          )}
        </>
      )}

      {!showPicker && isPending && paymentSession?.gateway === "fake" && (
        <div className="flex flex-col gap-3">
          <p className="text-[var(--color-text-muted)]">
            Entorno de pruebas: simula el resultado del banco.
          </p>
          <Button
            size="lg"
            loading={decide.pending && decision === true}
            disabled={decide.pending}
            onClick={() => decide.run(true)}
          >
            Simular pago aprobado
          </Button>
          <Button
            variant="secondary"
            loading={decide.pending && decision === false}
            disabled={decide.pending}
            onClick={() => decide.run(false)}
          >
            Simular pago rechazado
          </Button>
        </div>
      )}

      {order.status === "FAILED" && (
        <div className="flex flex-col gap-3">
          <p className="text-[var(--color-danger)]">Tu pago fue rechazado.</p>
          <Button onClick={() => router.push(eventSlug ? `/e/${eventSlug}` : "/")}>
            Volver a intentar
          </Button>
        </div>
      )}

      {order.status === "EXPIRED" && (
        <div className="flex flex-col gap-3">
          <p className="text-[var(--color-danger)]">
            Esta orden venció antes de completarse el pago.
          </p>
          <Button onClick={() => router.push(eventSlug ? `/e/${eventSlug}` : "/")}>
            Volver a intentar
          </Button>
        </div>
      )}

      {order.status === "PAID" && <p className="text-[var(--color-mint-text)]">Confirmando…</p>}
    </main>
  );
}

export default function PayPage() {
  // `useSearchParams` obliga a un límite de Suspense para el prerender.
  return (
    <Suspense fallback={null}>
      <PayScreen />
    </Suspense>
  );
}
