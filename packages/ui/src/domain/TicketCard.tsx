import { Sun } from "lucide-react";
import * as React from "react";

import { Badge } from "../base/Badge";
import { Button } from "../base/Button";
import { cn } from "../lib/cn";

export type TicketCardStatus = "active" | "used" | "expired" | "void";

export interface TicketCardProps {
  /** Ausente en una entrada anulada: su QR no debe renderizarse (H16). */
  qrDataUrl?: string;
  code: string;
  eventTitle: string;
  dateLabel: string;
  ticketTypeName: string;
  holderName: string;
  status: TicketCardStatus;
  checkedInAtLabel?: string;
  /** Motivo y contacto de la organización, solo para entradas anuladas (H16). */
  voidReasonLabel?: string;
  organizationName?: string;
  organizationContactEmail?: string;
  onMaxBrightness?: () => void;
  className?: string;
}

const STATUS_META: Record<TicketCardStatus, { label: string; badge: "mint" | "warning" | "neutral" | "danger" }> = {
  active: { label: "Activa", badge: "mint" },
  used: { label: "Ingresaste", badge: "warning" },
  expired: { label: "Vencida", badge: "neutral" },
  void: { label: "Anulada", badge: "danger" },
};

/** Código en bloques de 4 para poder dictarlo si la cámara falla (§11.4). */
function formatCode(code: string) {
  return code.match(/.{1,4}/g)?.join(" ") ?? code;
}

export function TicketCard({
  qrDataUrl,
  code,
  eventTitle,
  dateLabel,
  ticketTypeName,
  holderName,
  status,
  checkedInAtLabel,
  voidReasonLabel,
  organizationName,
  organizationContactEmail,
  onMaxBrightness,
  className,
}: TicketCardProps) {
  const meta = STATUS_META[status];
  const dimmed = status !== "active" && status !== "void";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border p-[var(--space-6)] text-center",
        status === "active"
          ? "border-[var(--color-mint)]/40 bg-[var(--color-surface)] shadow-[var(--glow-mint)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)]",
        className
      )}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex flex-col text-left">
          <span className="font-display text-base font-semibold">{eventTitle}</span>
          <span className="text-sm text-[var(--color-text-muted)]">{dateLabel}</span>
        </div>
        <Badge variant={meta.badge}>{meta.label}</Badge>
      </div>

      {status === "void" ? (
        <div className="flex w-full flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] p-3 text-left text-sm">
          <span className="font-medium text-[var(--color-danger)]">Entrada anulada</span>
          {voidReasonLabel && (
            <span className="text-[var(--color-text-muted)]">Motivo: {voidReasonLabel}</span>
          )}
          {organizationContactEmail && (
            <span className="text-[var(--color-text-muted)]">
              ¿Dudas? {organizationName ? `${organizationName}: ` : ""}
              {organizationContactEmail}
            </span>
          )}
        </div>
      ) : (
        qrDataUrl && (
          <div className={cn("relative", dimmed && "opacity-40 grayscale")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt={`Código QR de la entrada ${code}`} width={220} height={220} />
          </div>
        )
      )}

      <div className="flex flex-col gap-1">
        <span className="text-sm text-[var(--color-text-muted)]">
          {ticketTypeName} · {holderName}
        </span>
        <span className="font-mono text-lg tracking-wider">{formatCode(code)}</span>
        {status === "used" && checkedInAtLabel && (
          <span className="text-sm text-[var(--color-warning)]">Ingresaste · {checkedInAtLabel}</span>
        )}
      </div>

      {status === "active" && onMaxBrightness && (
        <Button variant="secondary" onClick={onMaxBrightness}>
          <Sun className="h-4 w-4" /> Brillo máximo
        </Button>
      )}
    </div>
  );
}
