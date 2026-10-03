"use client";

import { Button, cn, PriceBreakdown, Skeleton, useAsyncAction } from "@repo/ui";
import { ArrowLeft, ChevronRight, FlaskConical } from "lucide-react";
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
import { CheckoutShell, HoldCountdown, SummaryCard } from "@/features/checkout/CheckoutShell";
import { CheckoutSteps } from "@/features/checkout/CheckoutSteps";
import { PaymentForm } from "@/features/checkout/PaymentForm";
import { ProviderLogo, ProviderPanel } from "@/features/checkout/ProviderPanel";
import { BRAND_NAME } from "@/lib/site";

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
 *
 * Cada pasarela se muestra dentro de su `ProviderPanel`, con su logo y su
 * formulario oficial, aunque haya un solo medio habilitado.
 */
const METHOD_HINTS: Record<string, string> = {
  izipay: "Pagas aquí mismo, sin salir de la página",
  mercadopago: "Tarjeta, Yape o tu cuenta de Mercado Pago",
};

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
  // Paso 1: elegir medio. Paso 2: pagar con el elegido. El 3 es la pantalla
  // de éxito. Sin sesión abierta se está en el paso 1 aunque la lista de
  // medios aún no haya llegado; con un solo medio, se abre sola.
  const showPicker = isPending && !submitted && (choosing || !paymentSession);
  const step = showPicker ? 1 : 2;
  // Con un solo medio no hay nada que elegir: el paso 1 no existiría para el
  // comprador, así que el indicador solo aparece si hay varios.
  const hasChoice = (methods?.length ?? 0) > 1;

  const summary = (
    <SummaryCard title="Resumen de tu compra">
      <p className="text-sm text-[var(--color-text-muted)]">
        Orden <span className="font-mono text-[var(--color-text)]">{order.code}</span>
      </p>
      <PriceBreakdown subtotal={order.subtotal} serviceFee={order.service_fee} total={order.total} />
      {isPending && <HoldCountdown expiresAt={order.expires_at} />}
    </SummaryCard>
  );

  return (
    <CheckoutShell header={hasChoice ? <CheckoutSteps current={step} /> : undefined} aside={summary}>
      <h1 className="font-display text-2xl font-bold">
        {showPicker ? "¿Cómo quieres pagar?" : isPending ? "Completa tu pago" : "Estado de tu pago"}
      </h1>

      {showPicker && !methods && (
        <div className="flex flex-col gap-3" aria-busy>
          <Skeleton className="h-[4.75rem] w-full" />
          <Skeleton className="h-[4.75rem] w-full" />
        </div>
      )}

      {showPicker && methods && methods.length === 0 && (
        <p className="text-sm text-[var(--color-danger)]">
          No hay medios de pago disponibles por ahora. Intenta de nuevo en unos minutos.
        </p>
      )}

      {showPicker && methods && methods.length === 1 && (
        <p className="text-sm text-[var(--color-text-muted)]">Preparando tu pago…</p>
      )}

      {showPicker && methods && methods.length > 1 && (
        <div className="flex flex-col gap-3">
          {methods.map((m) => {
            const current = paymentGateway === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={openSession.isPending}
                onClick={() => (current ? setChoosing(false) : void chooseMethod(m.id).catch(() => undefined))}
                className={cn(
                  "group flex items-center gap-3 rounded-[var(--radius-md)] border p-4 text-left transition-colors duration-[var(--duration-fast)]",
                  "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-60",
                  current
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong,var(--color-border))] hover:bg-[var(--color-surface-hover)]"
                )}
              >
                {/* Los logos están hechos para fondo claro. */}
                <span className="flex h-11 w-24 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-white px-2.5 text-[#1f2937]">
                  <ProviderLogo
                    provider={m.id}
                    className="max-h-6 max-w-full"
                    fallback={<FlaskConical className="h-5 w-5" aria-label="Simulador" />}
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{m.label}</span>
                  {METHOD_HINTS[m.id] && (
                    <span className="text-sm text-[var(--color-text-muted)]">{METHOD_HINTS[m.id]}</span>
                  )}
                </span>
                {openSession.isPending && openSession.variables === m.id ? (
                  <span className="text-sm text-[var(--color-text-muted)]">Abriendo…</span>
                ) : (
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-[var(--color-text-subtle)] transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
          {openSession.isError && (
            <p className="text-sm text-[var(--color-danger)]">
              Ese medio de pago no está disponible ahora. Prueba con otro.
            </p>
          )}
          {paymentSession && (
            <button
              type="button"
              onClick={() => setChoosing(false)}
              className="flex items-center gap-1.5 self-start text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Volver al pago
            </button>
          )}
        </div>
      )}

      {!showPicker && isPending && canSwitch && paymentSession && (
        <button
          type="button"
          onClick={() => setChoosing(true)}
          className="-mt-2 flex items-center gap-1.5 self-start text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Cambiar medio de pago
        </button>
      )}

      {!showPicker && isPending && isRedirectGateway && !mpReturn && checkoutUrl && (
        <ProviderPanel
          provider="mercadopago"
          note={`Pagas en el sitio de Mercado Pago. ${BRAND_NAME} nunca ve los datos de tu tarjeta ni de tu cuenta.`}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[#4b5563]">
              Te estamos llevando a Mercado Pago para completar el pago…
            </p>
            {/* Botón con los colores de marca de Mercado Pago. */}
            <a
              href={checkoutUrl}
              className="flex min-h-12 items-center justify-center rounded-[var(--radius-md)] bg-[#009ee3] px-4 font-semibold text-white transition-colors hover:bg-[#0089c7] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#009ee3]/30"
            >
              Continuar a Mercado Pago
            </a>
          </div>
        </ProviderPanel>
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
          <ProviderPanel
            provider="izipay"
            note={`Los datos de tu tarjeta los recibe directamente Izipay. ${BRAND_NAME} nunca los ve ni los guarda.`}
          >
            <PaymentForm session={paymentSession} onSubmitted={handleRealSubmit} onError={setFormError} />
          </ProviderPanel>
          {formError && <p className="text-sm text-[var(--color-danger)]">{formError}</p>}
          {submitted && (
            <p className="text-sm text-[var(--color-text-muted)]">
              Estamos confirmando tu pago con el banco…
            </p>
          )}
        </>
      )}

      {!showPicker && isPending && paymentSession?.gateway === "fake" && (
        <ProviderPanel provider="fake" note="Entorno de pruebas: no se cobra nada.">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[#4b5563]">Simula el resultado del banco.</p>
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
        </ProviderPanel>
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
    </CheckoutShell>
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
