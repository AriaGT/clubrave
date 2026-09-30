import * as React from "react";

import { cn } from "../lib/cn";

/** Etiquetas legibles de las acciones registradas en la bitácora (H14). */
export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  EVENT_PUBLISHED: "Evento publicado",
  EVENT_UNPUBLISHED: "Evento despublicado",
  EVENT_UPDATED: "Información editada",
  EVENT_CANCELLED: "Evento cancelado",
  EVENT_DELETED: "Evento eliminado",
  EVENT_SALES_PAUSED: "Venta pausada",
  EVENT_SALES_RESUMED: "Venta reanudada",
  EVENT_ANNOUNCED: "Comunicado enviado",
  IMAGE_DELETED: "Imagen eliminada",
  ORDER_VOIDED: "Orden anulada",
  ORDER_REFUND_MARKED: "Reembolso marcado",
  TICKETS_RESENT: "Entradas reenviadas",
  TICKET_VOIDED: "Entrada anulada",
  CHECKIN_UNDONE: "Ingreso deshecho",
  EMPLOYEE_CREATED: "Empleado creado",
  EMPLOYEE_UPDATED: "Empleado editado",
  EMPLOYEE_DEACTIVATED: "Empleado desactivado",
  EMPLOYEE_REACTIVATED: "Empleado reactivado",
  EMPLOYEE_PASSWORD_RESET: "Contraseña de empleado cambiada",
  EMPLOYEE_DELETED: "Empleado eliminado",
  TICKET_CHECKED_IN: "Ingreso validado por seguridad",
};

const LIMA_FORMATTER = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Lima",
});

export function formatActivityDate(value: string): string {
  return LIMA_FORMATTER.format(new Date(value));
}

function recipientsLabel(metadata: Record<string, unknown> | null | undefined): string | null {
  const recipients = metadata?.recipients;
  if (typeof recipients !== "number") return null;
  return `${recipients} ${recipients === 1 ? "comprador" : "compradores"} por email`;
}

export interface ActivityItemProps {
  action: string;
  createdAt: string;
  actorEmail?: string | null;
  targetLabel?: string;
  reason?: string;
  metadata?: Record<string, unknown> | null;
  actionLabel?: string;
  className?: string;
}

/** Una línea de bitácora: acción, autor, objetivo, motivo y fecha (H14). */
export function ActivityItem({
  action,
  createdAt,
  actorEmail,
  targetLabel,
  reason,
  metadata,
  actionLabel,
  className,
}: ActivityItemProps) {
  const extra = action === "EVENT_ANNOUNCED" ? recipientsLabel(metadata) : null;
  return (
    <li
      className={cn(
        "flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-[var(--color-text)]">
          {actionLabel ?? ACTIVITY_ACTION_LABELS[action] ?? action}
        </span>
        <time className="text-xs text-[var(--color-text-muted)]" dateTime={createdAt}>
          {formatActivityDate(createdAt)}
        </time>
      </div>
      <span className="text-sm text-[var(--color-text-muted)]">
        {actorEmail || "Sistema"}
        {targetLabel ? ` · ${targetLabel}` : ""}
      </span>
      {reason && <p className="text-sm text-[var(--color-text-muted)]">{reason}</p>}
      {extra && <p className="text-xs text-[var(--color-text-muted)]">{extra}</p>}
    </li>
  );
}
