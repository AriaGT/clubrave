"use client";

import { Badge, EmptyState, Input, Skeleton, TopBar } from "@repo/ui";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { useEventAttendees } from "@/features/events/hooks";
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

  return (
    <>
      <TopBar title="Asistentes" onBack={() => router.push(`/events/${id}`)} />
      <div className="flex flex-col gap-3 p-[var(--space-4)]">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, código o comprador"
          aria-label="Buscar asistentes"
        />
        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && data?.results?.length === 0 && (
          <EmptyState
            title={q ? "Sin resultados" : "Todavía no hay asistentes"}
            description={
              q
                ? "Prueba con otro nombre o código de entrada."
                : "Aparecerán aquí en cuanto se paguen órdenes."
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
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="font-medium">{ticket.holder_name || "Sin nombre"}</span>
                  <span className="text-sm text-[var(--color-text-muted)]">
                    {ticket.ticket_type_name}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {ticket.is_guest && <Badge variant="accent">Invitado</Badge>}
                </div>
              </div>
              <div className="flex justify-end">
                <TicketActions code={ticket.code} status={ticket.status} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
