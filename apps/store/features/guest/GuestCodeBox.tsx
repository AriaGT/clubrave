"use client";

import { isApiError } from "@repo/api-client";
import { Badge, Button, FieldError, Input, Label } from "@repo/ui";
import { Ticket } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { formatGuestCode, normalizeGuestCode, useValidateGuestCode, type GuestCodeInfo } from "./hooks";

/**
 * «¿Tienes un código? Ingrésalo aquí» dentro de la sección de entradas. Si el
 * enlace trae `?codigo=`, se abre precargado y se valida solo.
 */
export function GuestCodeBox({ eventId, eventSlug }: { eventId: string; eventSlug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preloaded = searchParams.get("codigo") ?? "";
  const validate = useValidateGuestCode();

  const [open, setOpen] = useState(!!preloaded);
  const [code, setCode] = useState(preloaded ? formatGuestCode(preloaded) : "");
  const [info, setInfo] = useState<GuestCodeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoValidated = useRef(false);

  async function handleValidate(raw = code) {
    setError(null);
    setInfo(null);
    if (normalizeGuestCode(raw).length < 4) {
      setError("Escribe el código completo.");
      return;
    }
    try {
      setInfo(await validate.mutateAsync({ code: raw, eventId }));
    } catch (err) {
      setError(isApiError(err) ? err.error.message : "No pudimos validar el código. Intenta de nuevo.");
    }
  }

  useEffect(() => {
    if (preloaded && !autoValidated.current) {
      autoValidated.current = true;
      handleValidate(preloaded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloaded]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-3 text-left text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)]"
      >
        <Ticket className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
        <span>
          ¿Tienes un código? <span className="font-medium text-[var(--color-text)] underline">Ingrésalo aquí</span>
        </span>
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="guest-code">¿Tienes un código? Ingrésalo aquí</Label>
        <div className="flex gap-2">
          <Input
            id="guest-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setInfo(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleValidate();
            }}
            placeholder="XXXX-XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono uppercase tracking-wider"
          />
          <Button variant="secondary" loading={validate.isPending} onClick={() => handleValidate()}>
            Validar
          </Button>
        </div>
        <FieldError>{error}</FieldError>
      </div>

      {info && (
        <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-sm text-[var(--color-text-muted)]">Tu código te da una entrada</span>
              <span className="font-display text-lg font-semibold">{info.ticket_type.name}</span>
            </div>
            <Badge variant="accent">Invitado</Badge>
          </div>
          {info.ticket_type.description && (
            <p className="text-sm text-[var(--color-text-muted)]">{info.ticket_type.description}</p>
          )}
          <Button
            onClick={() =>
              router.push(
                `/invitado?evento=${encodeURIComponent(eventSlug)}&codigo=${encodeURIComponent(normalizeGuestCode(code))}`
              )
            }
          >
            Continuar sin pagar →
          </Button>
        </div>
      )}
    </div>
  );
}
