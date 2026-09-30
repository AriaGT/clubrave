"use client";

import type { ApiComponents } from "@repo/api-client";
import {
  Button,
  FieldError,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  TopBar,
} from "@repo/ui";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import {
  apiErrorMessage,
  useCancelEvent,
  useCancelPreview,
  useEvent,
} from "@/features/events/hooks";

const REASON_CODES = [
  { value: "VENUE_ISSUE", label: "Problema con el local" },
  { value: "CAPACITY", label: "Aforo insuficiente" },
  { value: "ARTIST_CANCELLED", label: "Cancelación del artista" },
  { value: "WEATHER", label: "Clima" },
  { value: "OTHER", label: "Otro" },
];

export default function CancelEventPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: event } = useEvent(id);
  const { data: preview, isLoading: previewLoading } = useCancelPreview(id);
  const cancelEvent = useCancelEvent(id);

  const [reasonCode, setReasonCode] = useState<ApiComponents["schemas"]["CancelEventReasonCodeEnum"]>("OTHER");
  const [reason, setReason] = useState("");
  const [confirmTitle, setConfirmTitle] = useState("");
  const [cancelled, setCancelled] = useState(false);

  if (!event) {
    return <TopBar title="Cancelar evento" onBack={() => router.push(`/events/${id}`)} />;
  }

  async function handleCancel() {
    await cancelEvent.mutateAsync(
      { reason_code: reasonCode, reason, confirm_title: confirmTitle },
      { onSuccess: () => setCancelled(true) }
    );
  }

  return (
    <>
      <TopBar title="Cancelar evento" onBack={() => router.push(`/events/${id}`)} />
      <div className="flex flex-col gap-5 p-[var(--space-4)]">
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] p-4">
          <p className="font-medium text-[var(--color-danger)]">Esto anula todas las entradas vendidas.</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Cada comprador recibe un email con el motivo y el contacto de la organización para coordinar
            el reembolso. No se puede deshacer.
          </p>
        </div>

        {previewLoading || !preview ? (
          <p className="text-sm text-[var(--color-text-muted)]">Calculando el impacto…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <span className="block text-[var(--color-text-muted)]">Órdenes pagadas</span>
              <span className="font-mono text-lg">{preview.paid_orders}</span>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <span className="block text-[var(--color-text-muted)]">Compradores distintos</span>
              <span className="font-mono text-lg">{preview.distinct_buyers}</span>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <span className="block text-[var(--color-text-muted)]">Entradas a anular</span>
              <span className="font-mono text-lg">{preview.tickets_to_void}</span>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <span className="block text-[var(--color-text-muted)]">Ya ingresaron</span>
              <span className="font-mono text-lg">{preview.tickets_already_checked_in}</span>
            </div>
            <div className="col-span-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <span className="block text-[var(--color-text-muted)]">Monto a devolver</span>
              <span className="font-mono text-lg">{preview.gross} {preview.currency}</span>
            </div>
          </div>
        )}

        {cancelled ? (
          <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
            <p className="font-medium">Evento cancelado.</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              Los compradores ya recibieron el aviso con el motivo y el contacto de tu organización.
            </p>
            <Button className="self-end" onClick={() => router.push(`/events/${id}`)}>
              Volver al evento
            </Button>
          </div>
        ) : (
          <>
            {cancelEvent.error && (
              <p className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
                {apiErrorMessage(cancelEvent.error)}
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reason_code">Motivo de la cancelación</Label>
              <Select
                value={reasonCode}
                onValueChange={(v) => setReasonCode(v as ApiComponents["schemas"]["CancelEventReasonCodeEnum"])}
              >
                <SelectTrigger id="reason_code">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASON_CODES.map((code) => (
                    <SelectItem key={code.value} value={code.value}>
                      {code.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reason">Detalle que verán los compradores (opcional)</Label>
              <Textarea
                id="reason"
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej.: el artista suspendió su gira por motivos de salud."
                rows={3}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm_title">Escribe el título del evento para confirmar</Label>
              <Input
                id="confirm_title"
                value={confirmTitle}
                onChange={(e) => setConfirmTitle(e.target.value)}
                placeholder={event.title}
              />
              <span className="text-xs text-[var(--color-text-muted)]">
                Debe coincidir con “{event.title}”.
              </span>
            </div>
            {cancelEvent.error && <FieldError>{apiErrorMessage(cancelEvent.error)}</FieldError>}
            <Button
              variant="danger"
              className="self-end"
              onClick={handleCancel}
              disabled={confirmTitle !== event.title}
              loading={cancelEvent.isPending}
            >
              Cancelar el evento
            </Button>
          </>
        )}
      </div>
    </>
  );
}