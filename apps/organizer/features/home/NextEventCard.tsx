"use client";

import { selectedImageOfKind } from "@repo/api-client";
import { Badge, Button, Img, Progress, Skeleton, cn } from "@repo/ui";
import { ArrowRight, CalendarDays, CalendarHeart, MapPin, ScanLine } from "lucide-react";
import Link from "next/link";
import type * as React from "react";

import { countdownLabel, isToday, shortDateLabel } from "@/features/events/format";
import { useEventStats } from "@/features/events/hooks";
import type { OrganizerEvent } from "@/features/events/panel/types";

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-[var(--color-text-subtle)]">{label}</span>
      <span className="truncate font-mono text-xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="truncate text-xs text-[var(--color-text-muted)]">{hint}</span>}
    </div>
  );
}

/**
 * El evento que viene: qué tan vendido está y el acceso a su panel. El día
 * del evento la acción principal pasa a ser escanear en la puerta.
 */
export function NextEventCard({ event }: { event: OrganizerEvent }) {
  const { data: stats } = useEventStats(event.id);
  const flyer = selectedImageOfKind(event.images, "FLYER")?.image;
  const today = isToday(event.starts_at);
  const issued = stats ? stats.tickets.sold + stats.tickets.guests : 0;

  return (
    <section
      aria-label="Próximo evento"
      className={cn(
        "flex flex-col gap-4 rounded-[var(--radius-lg)] border bg-[var(--color-surface)] p-[var(--space-4)]",
        today ? "border-[var(--color-accent)]/50" : "border-[var(--color-border)]"
      )}
    >
      <div className="flex gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)]">
          {flyer ? (
            <Img src={flyer} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--color-text-subtle)]">
              <CalendarHeart className="h-6 w-6" aria-hidden />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--color-text-subtle)]">
            {today ? "Tu evento es hoy" : "Próximo evento"}
          </span>
          <Link
            href={`/events/${event.id}`}
            className="truncate font-display text-xl font-semibold leading-tight hover:underline"
          >
            {event.title}
          </Link>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="accent">{countdownLabel(event.starts_at)}</Badge>
            <Badge variant={event.sales_paused ? "warning" : "mint"}>
              {event.sales_paused ? "Venta pausada" : "Venta abierta"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-sm text-[var(--color-text-muted)]">
        <span className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-[var(--color-text-subtle)]" aria-hidden />
          <span className="first-letter:uppercase">{shortDateLabel(event.starts_at)}</span>
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

      {stats ? (
        <div className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-4">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Recaudado" value={`S/ ${stats.revenue.gross}`} />
            <Metric
              label="Vendidas"
              value={
                <>
                  {stats.tickets.sold}
                  <span className="text-sm text-[var(--color-text-subtle)]">/{stats.tickets.capacity}</span>
                </>
              }
              hint={stats.last_24h.tickets > 0 ? `+${stats.last_24h.tickets} en 24 h` : undefined}
            />
            <Metric
              label="Ingresaron"
              value={stats.tickets.checked_in}
              hint={issued > 0 ? `de ${issued}` : undefined}
            />
          </div>
          <Progress value={issued} max={stats.tickets.capacity} label="Ocupación del aforo" />
        </div>
      ) : (
        <Skeleton className="h-20 w-full" />
      )}

      {today ? (
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="secondary">
            <Link href={`/events/${event.id}`}>Abrir panel</Link>
          </Button>
          <Button asChild>
            <Link href={`/scan/${event.id}`}>
              <ScanLine className="h-4 w-4" aria-hidden /> Escanear
            </Link>
          </Button>
        </div>
      ) : (
        <Button asChild>
          <Link href={`/events/${event.id}`}>
            Abrir panel del evento <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      )}
    </section>
  );
}
