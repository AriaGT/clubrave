"use client";

import { isApiError } from "@repo/api-client";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  FieldError,
  Input,
  Label,
  Skeleton,
  useAsyncAction,
} from "@repo/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useMe } from "@/features/account/hooks";
import { useRequestCode } from "@/features/checkout/hooks";
import { useEventDetail } from "@/features/events/hooks";
import { useSession } from "@/lib/session";

import { formatGuestCode, useRedeemGuestCode, useValidateGuestCode, type GuestCodeInfo } from "./hooks";

const emailSchema = z.string().email("Escribe un email válido.");

// Los mismos datos del asistente que en el checkout normal.
const attendeeSchema = z.object({
  full_name: z.string().min(2, "Falta tu nombre."),
  document_id: z.string().optional(),
  phone: z.string().optional(),
  terms: z.boolean().refine((v) => v === true, { message: "Debes aceptar los términos." }),
});

type AttendeeValues = z.infer<typeof attendeeSchema>;

/**
 * Canje de un código de invitado: mismo recorrido que el checkout (email →
 * código OTP → datos del asistente) pero sin pasarela de pago. Al confirmar,
 * el backend redime el código, emite la entrada y la envía por email.
 */
export function GuestRedeemFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const slug = params.get("evento") ?? "";
  const rawCode = params.get("codigo") ?? "";

  const { data: event, isLoading: eventLoading } = useEventDetail(slug);
  const { status: sessionStatus, verify, rememberedEmail } = useSession();
  const { data: me } = useMe();
  const validate = useValidateGuestCode();
  const requestCode = useRequestCode();
  const redeem = useRedeemGuestCode();

  const [info, setInfo] = useState<GuestCodeInfo | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [step, setStep] = useState<"email" | "otp" | "details">("email");
  const [email, setEmail] = useState(rememberedEmail ?? "");
  const [otp, setOtp] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  useEffect(() => {
    if (!event?.id || !rawCode) return;
    validate
      .mutateAsync({ code: rawCode, eventId: event.id })
      .then(setInfo)
      .catch((err) =>
        setCodeError(isApiError(err) ? err.error.message : "No pudimos validar el código.")
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, rawCode]);

  useEffect(() => {
    if (rememberedEmail) setEmail(rememberedEmail);
  }, [rememberedEmail]);

  useEffect(() => {
    if (sessionStatus === "authenticated") setStep("details");
  }, [sessionStatus]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AttendeeValues>({ resolver: zodResolver(attendeeSchema) });

  useEffect(() => {
    if (me?.full_name) setValue("full_name", me.full_name);
    if (me?.document_id) setValue("document_id", me.document_id);
    if (me?.phone) setValue("phone", me.phone);
  }, [me, setValue]);

  async function handleSendCode() {
    setAuthError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setAuthError(parsed.error.issues[0].message);
      return;
    }
    try {
      await requestCode.mutateAsync(email);
      setStep("otp");
    } catch (err) {
      setAuthError(isApiError(err) ? err.error.message : "No pudimos enviar el código.");
    }
  }

  const verifyOtp = useAsyncAction(async () => {
    setAuthError(null);
    try {
      await verify({ email, code: otp });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Código inválido.");
    }
  });

  const onConfirm = handleSubmit(async (values) => {
    if (!event) return;
    setRedeemError(null);
    try {
      const order = await redeem.mutateAsync({
        code: rawCode,
        eventId: event.id,
        buyer: {
          email: me?.email ?? email,
          full_name: values.full_name,
          phone: values.phone,
          document_id: values.document_id,
        },
      });
      router.push(`/checkout/${order.code}/success`);
    } catch (err) {
      setRedeemError(isApiError(err) ? err.error.message : "No se pudo canjear el código.");
    }
  });

  if (!slug || !rawCode) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 p-[var(--space-6)]">
        <EmptyState
          title="Falta el código"
          description="Abre el enlace de tu invitación o ingresa el código en la página del evento."
          action={
            <Link href="/">
              <Button variant="secondary">Ver eventos</Button>
            </Link>
          }
        />
      </main>
    );
  }

  if (eventLoading || (event && !info && !codeError)) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-[var(--space-6)]">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </main>
    );
  }

  if (!event || codeError || !info) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 p-[var(--space-6)]">
        <EmptyState
          title="Este código no se puede usar"
          description={codeError ?? "No encontramos el evento de esta invitación."}
          action={
            <Link href={event ? `/e/${event.slug}` : "/"}>
              <Button variant="secondary">{event ? "Volver al evento" : "Ver eventos"}</Button>
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-[var(--space-6)]">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold">Canjea tu invitación</h1>
        <p className="text-[var(--color-text-muted)]">{event.title}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-sm text-[var(--color-text-muted)]">Entrada / zona</span>
            <span className="font-display text-lg font-semibold">{info.ticket_type.name}</span>
          </div>
          <Badge variant="accent">Invitado</Badge>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-mono tracking-wider">{formatGuestCode(info.code)}</span>
          <span className="font-medium text-[var(--color-mint-text)]">Sin costo</span>
        </div>
      </div>

      {redeemError && (
        <p className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
          {redeemError}
        </p>
      )}

      {step === "email" && (
        <div className="flex flex-col gap-3">
          <Label htmlFor="guest-email">¿A qué email enviamos tu entrada?</Label>
          <Input
            id="guest-email"
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

      {step === "otp" && (
        <div className="flex flex-col gap-3">
          <Label htmlFor="guest-otp">Escribe el código de 6 dígitos que te enviamos</Label>
          <Input
            id="guest-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="text-center font-mono text-lg tracking-[0.3em]"
          />
          <FieldError>{authError}</FieldError>
          <Button loading={verifyOtp.pending} onClick={() => verifyOtp.run()} disabled={otp.length !== 6}>
            Verificar
          </Button>
          <button type="button" className="text-sm text-[var(--color-text-muted)]" onClick={() => setStep("email")}>
            Cambiar email
          </button>
        </div>
      )}

      {step === "details" && (
        <form onSubmit={onConfirm} className="flex flex-col gap-4">
          {me?.email && (
            <p className="text-sm text-[var(--color-text-muted)]">
              Enviaremos tu entrada a <strong className="text-[var(--color-text)]">{me.email}</strong>.
            </p>
          )}
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
              {info.event.min_age} años.
            </Label>
          </div>
          <FieldError>{errors.terms?.message}</FieldError>
          <Button type="submit" size="lg" loading={redeem.isPending}>
            Confirmar invitación
          </Button>
        </form>
      )}
    </main>
  );
}
