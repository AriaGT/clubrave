"use client";

import { Badge, EmptyState, Input, Progress, Skeleton, TopBar } from "@repo/ui";
import { Search, Users } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { useEvent, useEventAttendees, useEventStats } from "@/features/events/hooks";
import { TicketActions } from "@/features/events/TicketActions";

const TICKET_BADGE: Record<string, { variant: "mint" | "neutral" | "danger"; label: string }> = {
  VALID: { variant: "neutral", label: "No ha ingresado" },
  CHECKED_IN: { variant: "mint", label: "Ingresó" },
  VOID: { variant: "danger", label: "Anulada" },
};

export default function EventAttendeesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [q, setQ] = useState("");
  const { data, isLoading } = useEventAttendees(id, q);
  const { data: event } = useEvent(id);
  const { data: stats } = useEventStats(id);
  const issued = stats ? stats.tickets.sold + stats.tickets.guests : 0;

  return (
    <>
      <TopBar title="Asistentes" subtitle={event?.title} onBack={() => router.push(`/events/${id}`)} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-[var(--space-4)]">
        {stats && issued > 0 && (
          <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-[var(--color-text-muted)]">Ingresaron</span>
              <span className="font-mono text-lg font-semibold tabular-nums">
                {stats.tickets.checked_in}
                <span className="text-sm text-[var(--color-text-subtle)]">/{issued}</span>
              </span>
            </div>
            <Progress tone="mint" value={stats.tickets.checked_in} max={issued} label="Ingresos" />
          </div>
        )}

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
            aria-hidden
          />
          <Input
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, código o comprador"
            aria-label="Buscar asistentes"
          />
        </div>
        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && data?.results?.length === 0 && (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={q ? "Sin resultados" : "Todavía no hay asistentes"}
            description={
              q
                ? "Prueba con otro nombre o código de entrada."
                : "Aparecerán aquí en cuanto se paguen órdenes o se canjeen invitaciones."
            }
          />
        )}
        {data?.results?.map((ticket) => {
          const badge = TICKET_BADGE[ticket.status ?? "VALID"] ?? TICKET_BADGE.VALID;
          return (
            <div
              key={ticket.id}
              className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{ticket.holder_name || "Sin nombre"}</span>
                  <span className="text-sm text-[var(--color-text-muted)]">{ticket.ticket_type_name}</span>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {ticket.is_guest && <Badge variant="accent">Invitado</Badge>}
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
              </div>
              {ticket.status !== "VOID" && (
                <div className="flex justify-end">
                  <TicketActions code={ticket.code} status={ticket.status} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
