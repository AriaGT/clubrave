"use client";

import { Button, Card, CardContent } from "@repo/ui";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useCartStore } from "@/features/cart/store";
import { useConfirmPayment, useOrderStatus } from "@/features/checkout/pay-hooks";
import { loadPaymentSession } from "@/features/checkout/payment-session-storage";
import { PaymentForm } from "@/features/checkout/PaymentForm";

/**
 * Con `PAYMENT_GATEWAY=fake` (por defecto en desarrollo) esta pantalla
 * simula el formulario de la pasarela: aprobar/rechazar llama a `/confirm/`
 * con el mismo payload que usaría el navegador real, ejercitando el camino
 * de código completo (§8.2). Con `PAYMENT_GATEWAY=izipay` se monta el
 * formulario incrustado real (`PaymentForm`) — ver docs/izipay-activacion.md
 * para activarlo con credenciales reales.
 */
export default function PayPage() {
  const { orderCode } = useParams<{ orderCode: string }>();
  const router = useRouter();
  const { data: order, refetch } = useOrderStatus(orderCode, { pollUntilPaid: true });
  const confirm = useConfirmPayment(orderCode);
  const clearCart = useCartStore((s) => s.clear);
  const eventSlug = useCartStore((s) => s.eventSlug);
  const [formError, setFormError] = useState<string | null>(null);

  const paymentSession = loadPaymentSession(orderCode);

  useEffect(() => {
    if (order?.status === "PAID") {
      clearCart();
      router.replace(`/checkout/${orderCode}/success`);
    }
  }, [order?.status, orderCode, router, clearCart]);

  async function handleFakeDecision(approved: boolean) {
    await confirm.mutateAsync({ order_code: orderCode, approved });
    await refetch();
  }

  async function handleRealSubmit(rawResponse: Record<string, unknown>) {
    setFormError(null);
    try {
      await confirm.mutateAsync(rawResponse);
    } catch {
      // No es autoritativo (§7.2): si falla el feedback, el IPN igual
      // cerrará la orden y el polling de abajo lo reflejará.
    }
    await refetch();
  }

  if (!order) return null;

  const isRealGateway = paymentSession?.gateway === "izipay";

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-[var(--space-6)]">
      <h1 className="font-display text-2xl font-bold">Pago</h1>
      <Card>
        <CardContent className="flex flex-col gap-2 pt-4">
          <p className="text-[var(--color-text-muted)]">Orden {order.code}</p>
          <p className="font-mono text-2xl font-semibold">S/ {order.total}</p>
        </CardContent>
      </Card>

      {order.status === "PENDING" && isRealGateway && paymentSession && (
        <>
          <PaymentForm session={paymentSession} onSubmitted={handleRealSubmit} onError={setFormError} />
          {formError && <p className="text-sm text-[var(--color-danger)]">{formError}</p>}
          <p className="text-sm text-[var(--color-text-muted)]">
            Estamos confirmando tu pago con el banco…
          </p>
        </>
      )}

      {order.status === "PENDING" && !isRealGateway && (
        <div className="flex flex-col gap-3">
          <p className="text-[var(--color-text-muted)]">
            Entorno de pruebas: simula el resultado del banco.
          </p>
          <Button size="lg" loading={confirm.isPending} onClick={() => handleFakeDecision(true)}>
            Simular pago aprobado
          </Button>
          <Button variant="secondary" loading={confirm.isPending} onClick={() => handleFakeDecision(false)}>
            Simular pago rechazado
          </Button>
        </div>
      )}

      {order.status === "PENDING" && isRealGateway && !paymentSession && (
        <p className="text-sm text-[var(--color-danger)]">
          No se encontró la sesión de pago. Vuelve a intentar la compra desde el evento.
        </p>
      )}

      {order.status === "FAILED" && (
        <div className="flex flex-col gap-3">
          <p className="text-[var(--color-danger)]">Tu pago fue rechazado.</p>
          <Button onClick={() => router.push(eventSlug ? `/e/${eventSlug}` : "/")}>
            Volver a intentar
          </Button>
        </div>
      )}

      {order.status === "PAID" && <p className="text-[var(--color-mint-text)]">Confirmando…</p>}
    </main>
  );
}
