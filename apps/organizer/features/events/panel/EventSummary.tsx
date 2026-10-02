"use client";

import { Progress, Skeleton, StatTile } from "@repo/ui";
import { DoorOpen, Ticket, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";

import type { EventStats } from "./types";

function pct(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : "0%";
}

/** Métricas clave y ocupación por tipo de entrada. Se refresca cada 30 s. */
export function EventSummary({ eventId, stats }: { eventId: string; stats?: EventStats }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  const { revenue, tickets, last_24h, by_ticket_type } = stats;
  const issued = tickets.sold + tickets.guests;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          icon={<Wallet aria-hidden />}
          label="Recaudado"
          value={`S/ ${revenue.gross}`}
          hint={`${revenue.orders_paid} ${revenue.orders_paid === 1 ? "venta pagada" : "ventas pagadas"}`}
        />
        <StatTile
          icon={<Ticket aria-hidden />}
          label="Vendidas"
          value={
            <>
              {tickets.sold}
              <span className="text-base text-[var(--color-text-subtle)]">/{tickets.capacity}</span>
            </>
          }
          hint={tickets.guests > 0 ? `+${tickets.guests} de invitados` : `${pct(tickets.sold, tickets.capacity)} del aforo`}
        >
          <Progress className="mt-1" value={issued} max={tickets.capacity} label="Ocupación del aforo" />
        </StatTile>
        <StatTile
          icon={<DoorOpen aria-hidden />}
          label="Ingresaron"
          value={tickets.checked_in}
          hint={issued > 0 ? `${pct(tickets.checked_in, issued)} de las entradas` : "Aún sin entradas"}
        >
          {issued > 0 && (
            <Progress className="mt-1" tone="mint" value={tickets.checked_in} max={issued} label="Ingresos" />
          )}
        </StatTile>
        <StatTile
          icon={<TrendingUp aria-hidden />}
          label="Últimas 24 h"
          value={last_24h.tickets}
          hint={`${last_24h.tickets === 1 ? "entrada" : "entradas"} en ${last_24h.orders} ${last_24h.orders === 1 ? "venta" : "ventas"}`}
        />
      </div>

      {by_ticket_type.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-subtle)]">
              Por tipo de entrada
            </h2>
            <Link
              href={`/events/${eventId}/tickets`}
              className="text-sm font-medium text-[var(--color-accent-text)] hover:underline"
            >
              Gestionar
            </Link>
          </div>
          <ul className="flex flex-col divide-y divide-[var(--color-border-subtle)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            {by_ticket_type.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 px-[var(--space-4)] py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{t.name}</span>
                  <span className="shrink-0 font-mono text-sm tabular-nums">S/ {t.revenue}</span>
                </div>
                <Progress value={t.sold + t.guests} max={t.total} label={`Ocupación de ${t.name}`} />
                <span className="font-mono text-xs tabular-nums text-[var(--color-text-muted)]">
                  {t.sold}/{t.total} vendidas
                  {t.guests > 0 ? ` · ${t.guests} invitados` : ""} · {t.available} libres
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
