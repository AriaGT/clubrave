"use client";

import { Badge, IconButton } from "@repo/ui";
import { CalendarDays, Check, Copy, ExternalLink, MapPin } from "lucide-react";
import { useEffect, useState } from "react";

import { copyText } from "@/features/guests/share";
import { PUBLIC_STORE_URL } from "@/lib/env";

import type { OrganizerEvent } from "./types";

const STATUS: Record<OrganizerEvent["status"], { label: string; variant: "mint" | "neutral" | "danger" }> = {
  PUBLISHED: { label: "Publicado", variant: "mint" },
  DRAFT: { label: "Borrador", variant: "neutral" },
  CANCELLED: { label: "Cancelado", variant: "danger" },
};

/** «Hoy», «Mañana», «En 5 días», «Finalizado»: cuánto falta, de un vistazo. */
function countdownLabel(startsAt: string): string {
  const start = new Date(startsAt);
  const today = new Date();
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = Math.round((startDay - todayDay) / 86_400_000);
  if (days < 0) return "Finalizado";
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `En ${days} días`;
}

/** Identidad del evento: estado, cuándo, dónde y su enlace público. */
export function EventPanelHeader({ event }: { event: OrganizerEvent }) {
  const [copied, setCopied] = useState(false);
  const status = STATUS[event.status];
  const publicUrl = `${PUBLIC_STORE_URL}/e/${event.slug}`;
  const isPublished = event.status === "PUBLISHED";

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const dateLabel = new Date(event.starts_at).toLocaleString("es-PE", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status.variant}>{status.label}</Badge>
        {isPublished && event.sales_paused && <Badge variant="warning">Venta pausada</Badge>}
        {event.status !== "CANCELLED" && <Badge variant="accent">{countdownLabel(event.starts_at)}</Badge>}
      </div>

      <div className="flex flex-col gap-1.5 text-sm text-[var(--color-text-muted)]">
        <span className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-[var(--color-text-subtle)]" aria-hidden />
          <span className="first-letter:uppercase">{dateLabel}</span>
        </span>
        {event.venue_name && (
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-[var(--color-text-subtle)]" aria-hidden />
            <span className="truncate">
              {event.venue_name}
              {event.city ? ` · ${event.city}` : ""}
            </span>
          </span>
        )}
      </div>

      {isPublished && (
        <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] py-1 pl-3 pr-1">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--color-text-muted)]">
            {publicUrl.replace(/^https?:\/\//, "")}
          </span>
          <IconButton
            size="sm"
            label={copied ? "Enlace copiado" : "Copiar enlace de venta"}
            onClick={async () => setCopied(await copyText(publicUrl))}
          >
            {copied ? <Check className="h-4 w-4 text-[var(--color-mint-text)]" /> : <Copy className="h-4 w-4" />}
          </IconButton>
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Abrir la página pública"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-full)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      )}
    </section>
  );
}
