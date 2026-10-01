"use client";

import { isApiError } from "@repo/api-client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Checkbox, FieldError, Input, Label, PriceBreakdown, useAsyncAction } from "@repo/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useMe } from "@/features/account/hooks";
import { useCartStore } from "@/features/cart/store";
import { useCreateOrder, useRequestCode } from "@/features/checkout/hooks";
import { savePaymentSession } from "@/features/checkout/payment-session-storage";
import { useEventDetail } from "@/features/events/hooks";
import { useSession } from "@/lib/session";

const emailSchema = z.string().email("Escribe un email válido.");

const buyerSchema = z.object({
  full_name: z.string().min(2, "Falta tu nombre."),
  document_id: z.string().optional(),
  phone: z.string().optional(),
  terms: z.boolean().refine((v) => v === true, { message: "Debes aceptar los términos." }),
});

type BuyerValues = z.infer<typeof buyerSchema>;

export default function CheckoutPage() {
  const router = useRouter();
  const { eventId, eventSlug, lines } = useCartStore();
  const { status: sessionStatus, verify, rememberedEmail } = useSession();
  const { data: event } = useEventDetail(eventSlug ?? "");
  const { data: me } = useMe();
  const requestCode = useRequestCode();
  const createOrder = useCreateOrder();

  const [step, setStep] = useState<"email" | "code" | "details">("email");
  const [email, setEmail] = useState(rememberedEmail ?? "");
  const [code, setCode] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const paymentsDisabled = event?.payments_disabled === true;
  const salesPaused = event?.sales_paused === true || paymentsDisabled;

  useEffect(() => {
    if (rememberedEmail) setEmail(rememberedEmail);
  }, [rememberedEmail]);

  useEffect(() => {
    if (sessionStatus === "authenticated") setStep("details");
  }, [sessionStatus]);

  useEffect(() => {
    if (!eventId || Object.keys(lines).length === 0) router.replace("/");
  }, [eventId, lines, router]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<BuyerValues>({ resolver: zodResolver(buyerSchema) });

  useEffect(() => {
    if (me?.full_name) setValue("full_name", me.full_name);
    if (me?.document_id) setValue("document_id", me.document_id);
    if (me?.phone) setValue("phone", me.phone);
  }, [me, setValue]);

  const cartLines = useMemo(() => {
    if (!event) return [];
    return event.ticket_types
      .filter((tt) => (lines[tt.id] ?? 0) > 0)
      .map((tt) => ({ ...tt, quantity: lines[tt.id] }));
  }, [event, lines]);

  const subtotal = cartLines.reduce((sum, l) => sum + Number(l.price) * l.quantity, 0);

  async function handleSendCode() {
    setAuthError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setAuthError(parsed.error.issues[0].message);
      return;
    }
    await requestCode.mutateAsync(email);
    setStep("code");
  }

  const verifyCode = useAsyncAction(async () => {
    setAuthError(null);
    try {
      await verify({ email, code });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Código inválido.");
    }
  });

  const onSubmitBuyer = handleSubmit(async (values) => {
    if (!eventId) return;
    setOrderError(null);
    let order;
    try {
      order = await createOrder.mutateAsync({
        eventId,
        items: Object.entries(lines).map(([ticket_type_id, quantity]) => ({ ticket_type_id, quantity })),
        buyer: {
          email,
          full_name: values.full_name,
          phone: values.phone,
          document_id: values.document_id,
        },
        termsAccepted: true,
      });
    } catch (err) {
      if (isApiError(err)) {
        setOrderError(err.error.message);
        if (err.error.code === "SALES_PAUSED" || err.error.code === "PAYMENT_DISABLED") setStep("email");
      } else {
        setOrderError(err instanceof Error ? err.message : "No se pudo completar la compra.");
      }
      return;
    }
    savePaymentSession(order.order.code, order.payment);
    // El carrito se vacía en la pantalla de pago, no aquí: vaciarlo antes de
    // navegar dispara el guard de "carrito vacío → inicio" de esta misma
    // página y cancela la navegación a /pay en pleno vuelo.
    router.push(`/checkout/${order.order.code}/pay`);
  });

  if (!event) return null;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-[var(--space-6)]">
      <h1 className="font-display text-2xl font-bold">Checkout</h1>
      <p className="text-[var(--color-text-muted)]">{event.title}</p>

      <PriceBreakdown subtotal={subtotal.toFixed(2)} total={subtotal.toFixed(2)} />

      {salesPaused && (
        <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3">
          <span className="font-medium text-[var(--color-warning)]">
            {paymentsDisabled ? "Compras deshabilitadas temporalmente" : "Venta pausada temporalmente"}
          </span>
          <span className="text-sm text-[var(--color-text-muted)]">
            {paymentsDisabled
              ? "Estamos presentando problemas técnicos y no se pueden completar compras por ahora. Vuelve a intentarlo en un rato."
              : "No se pueden completar compras hasta que el organizador reanude la venta."}
          </span>
        </div>
      )}

      {orderError && (
        <p className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
          {orderError}
        </p>
      )}

      {step === "email" && (
        <div className="flex flex-col gap-3">
          <Label htmlFor="checkout-email">¿A qué email enviamos tus entradas?</Label>
          <Input
            id="checkout-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ana@correo.pe"
            autoComplete="email"
          />
          <FieldError>{authError}</FieldError>
          <Button loading={requestCode.isPending} onClick={handleSendCode}>
            Enviar código
          </Button>
        </div>
      )}

      {step === "code" && (
        <div className="flex flex-col gap-3">
          <Label htmlFor="checkout-code">Escribe el código de 6 dígitos</Label>
          <Input
            id="checkout-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="text-center font-mono text-lg tracking-[0.3em]"
          />
          <FieldError>{authError}</FieldError>
          <Button loading={verifyCode.pending} onClick={() => verifyCode.run()} disabled={code.length !== 6}>
            Verificar
          </Button>
          <button type="button" className="text-sm text-[var(--color-text-muted)]" onClick={() => setStep("email")}>
            Cambiar email
          </button>
        </div>
      )}

      {step === "details" && (
        <form onSubmit={onSubmitBuyer} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="full_name">Nombre completo</Label>
            <Input id="full_name" {...register("full_name")} />
            <FieldError>{errors.full_name?.message}</FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="document_id">DNI (opcional)</Label>
            <Input id="document_id" {...register("document_id")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Teléfono (opcional)</Label>
            <Input id="phone" {...register("phone")} />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="terms" onCheckedChange={(v) => setValue("terms", v === true)} />
            <Label htmlFor="terms" className="font-normal">
              Acepto los <Link href="/terms" className="underline">términos</Link> y confirmo ser mayor de{" "}
              {event.min_age} años.
            </Label>
          </div>
          <FieldError>{errors.terms?.message}</FieldError>
          <Button type="submit" size="lg" loading={createOrder.isPending} disabled={salesPaused}>
            Pagar S/ {subtotal.toFixed(2)}
          </Button>
        </form>
      )}
    </main>
  );
}
