"use client";

import { ActionGroup, ActionRow, ConfirmDialog } from "@repo/ui";
import { Ban, ChevronDown, EyeOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  apiErrorMessage,
  useChangeImpact,
  useDeleteEvent,
  useUnpublishEvent,
} from "@/features/events/hooks";

import type { EventStats, OrganizerEvent } from "./types";

/**
 * Cambios de estado delicados, plegados por defecto para que no compitan con
 * el día a día. Cada fila explica su consecuencia y, si el backend la va a
 * rechazar (p. ej. despublicar con ventas), se muestra deshabilitada con el porqué.
 */
export function EventAdvancedActions({ event, stats }: { event: OrganizerEvent; stats?: EventStats }) {
  const router = useRouter();
  const { data: impact } = useChangeImpact(event.id);
  const unpublish = useUnpublishEvent(event.id);
  const deleteEvent = useDeleteEvent(event.id);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isPublished = event.status === "PUBLISHED";
  const hasPaidOrders = (impact?.paid_orders ?? 0) > 0;
  const hasSales = (stats?.tickets.sold ?? 0) > 0;

  return (
    <>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-[var(--radius-md)] px-1 py-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] [&::-webkit-details-marker]:hidden">
          Más opciones
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <ActionGroup className="mt-2">
          {isPublished && (
            <ActionRow
              icon={<EyeOff />}
              title="Despublicar"
              description={
                hasPaidOrders
                  ? "No disponible: ya hay ventas. Pausa la venta o cancela el evento."
                  : "Lo oculta de la tienda y vuelve a borrador. Puedes publicarlo de nuevo."
              }
              disabled={hasPaidOrders}
              loading={unpublish.isPending}
              onClick={() => setUnpublishOpen(true)}
            />
          )}
          {isPublished && (
            <ActionRow
              icon={<Ban />}
              tone="danger"
              title="Cancelar evento"
              description="Anula todas las entradas y avisa a los compradores. No se puede deshacer."
              href={`/events/${event.id}/cancel`}
              linkComponent={Link}
            />
          )}
          <ActionRow
            icon={<Trash2 />}
            tone="danger"
            title="Eliminar evento"
            description={
              hasSales
                ? "No disponible: el evento tiene ventas. Si no se realizará, cancélalo."
                : "Lo borra junto con sus imágenes. No se puede deshacer."
            }
            disabled={hasSales}
            loading={deleteEvent.isPending}
            onClick={() => setDeleteOpen(true)}
          />
        </ActionGroup>
        {unpublish.error && (
          <p className="mt-2 text-sm text-[var(--color-danger)]">{apiErrorMessage(unpublish.error)}</p>
        )}
        {deleteEvent.error && (
          <p className="mt-2 text-sm text-[var(--color-danger)]">{apiErrorMessage(deleteEvent.error)}</p>
        )}
      </details>

      <ConfirmDialog
        open={unpublishOpen}
        onOpenChange={setUnpublishOpen}
        title="¿Despublicar el evento?"
        description="Dejará de verse en la tienda y volverá a borrador hasta que lo publiques otra vez."
        impact="Las compras que ya estén en curso pueden terminar; no se podrán iniciar nuevas."
        reasons={[
          { value: "NO_MORE_SALES", label: "No quiero más ventas" },
          { value: "ORGANIZER_ERROR", label: "Error del organizador" },
          { value: "OTHER", label: "Otro" },
        ]}
        confirmLabel="Despublicar"
        loading={unpublish.isPending}
        onConfirm={({ reasonCode, reason }) => {
          const detail = [reasonCode, reason].filter(Boolean).join(": ");
          setUnpublishOpen(false);
          unpublish.mutate({ reason: detail });
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Eliminar el evento"
        destructive
        description="Se borrará el evento y sus imágenes. Solo puedes borrar eventos sin ventas."
        impact="Esta acción no se puede deshacer."
        reasons={[
          { value: "DUPLICATED", label: "Cargado por duplicado" },
          { value: "ORGANIZER_ERROR", label: "Error del organizador" },
          { value: "OTHER", label: "Otro" },
        ]}
        confirmPhrase={event.title}
        confirmLabel="Eliminar evento"
        loading={deleteEvent.isPending}
        onConfirm={({ reasonCode, reason }) => {
          const detail = [reasonCode, reason].filter(Boolean).join(": ");
          deleteEvent.mutate(
            { reason: detail || "Sin motivo", confirm_title: event.title },
            { onSuccess: () => router.push("/events") }
          );
        }}
      />
    </>
  );
}
