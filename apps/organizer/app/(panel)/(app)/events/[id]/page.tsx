"use client";

import { ActionGroup, ActionRow, Skeleton, TopBar } from "@repo/ui";
import {
  FileText,
  Gift,
  History,
  ImageIcon,
  Megaphone,
  QrCode,
  Receipt,
  ScanLine,
  Ticket,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { downloadDoorPoster } from "@/features/events/doorPoster";
import { useEvent, useEventStats } from "@/features/events/hooks";
import { EventAdvancedActions } from "@/features/events/panel/EventAdvancedActions";
import { EventPanelHeader } from "@/features/events/panel/EventPanelHeader";
import { EventSummary } from "@/features/events/panel/EventSummary";
import { PublishChecklist } from "@/features/events/panel/PublishChecklist";
import { SalesControl } from "@/features/events/panel/SalesControl";
import { PUBLIC_STORE_URL } from "@/lib/env";

/**
 * Panel del evento. Arriba lo que se mira (estado, venta, números); debajo lo
 * que se hace, agrupado por tarea: vender y atender al público, la puerta, la
 * configuración y, plegado al final, los cambios de estado delicados.
 */
export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: event, isLoading } = useEvent(id);
  const { data: stats } = useEventStats(id);
  const [posterBusy, setPosterBusy] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);

  if (isLoading || !event) {
    return (
      <>
        <TopBar title="Evento" onBack={() => router.push("/events")} />
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-[var(--space-4)]">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </>
    );
  }

  const base = `/events/${id}`;
  const isCancelled = event.status === "CANCELLED";
  const isPublished = event.status === "PUBLISHED";
  const isDraft = event.status === "DRAFT";
  const issued = stats ? stats.tickets.sold + stats.tickets.guests : 0;

  async function handlePoster() {
    if (!event) return;
    setPosterBusy(true);
    setPosterError(null);
    try {
      await downloadDoorPoster({
        url: `${PUBLIC_STORE_URL}/e/${event.slug}`,
        slug: event.slug,
        title: event.title,
        startsAt: event.starts_at,
        venue: event.venue_name,
      });
    } catch {
      setPosterError("No se pudo generar la imagen. Inténtalo de nuevo.");
    } finally {
      setPosterBusy(false);
    }
  }

  return (
    <>
      <TopBar title={event.title} subtitle="Panel del evento" onBack={() => router.push("/events")} />
      <div className="mx-auto grid w-full max-w-5xl gap-6 p-[var(--space-4)] lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
          <EventPanelHeader event={event} />

          {isCancelled && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] p-[var(--space-4)] text-sm">
              <p className="font-medium text-[var(--color-danger)]">Este evento fue cancelado</p>
              <p className="mt-1 text-[var(--color-text-muted)]">
                Las entradas quedaron anuladas y ya no admite cambios.
                {event.cancellation_reason ? ` Motivo: ${event.cancellation_reason}` : ""}
              </p>
            </div>
          )}
          {isDraft && <PublishChecklist event={event} />}
          {isPublished && <SalesControl event={event} />}

          <EventSummary eventId={id} stats={stats} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <ActionGroup title="Ventas y asistentes">
            <ActionRow
              icon={<Receipt />}
              title="Ventas"
              description="Órdenes, reembolsos y reenvío de entradas"
              meta={stats && stats.revenue.orders_paid > 0 ? stats.revenue.orders_paid : undefined}
              href={`${base}/sales`}
              linkComponent={Link}
            />
            <ActionRow
              icon={<Users />}
              title="Asistentes"
              description="Quién tiene entrada y quién ya ingresó"
              meta={stats && issued > 0 ? `${stats.tickets.checked_in}/${issued}` : undefined}
              href={`${base}/attendees`}
              linkComponent={Link}
            />
            <ActionRow
              icon={<Gift />}
              title="Invitados"
              description="Códigos de cortesía para prensa, DJs o listas"
              meta={stats && stats.guest_codes.total > 0 ? stats.guest_codes.total : undefined}
              href={`${base}/guests`}
              linkComponent={Link}
            />
            {isPublished && (
              <ActionRow
                icon={<Megaphone />}
                title="Enviar comunicado"
                description="Email a todos los compradores"
                href={`${base}/announce`}
                linkComponent={Link}
              />
            )}
          </ActionGroup>

          {isPublished && (
            <div className="flex flex-col gap-2">
              <ActionGroup title="Día del evento">
                <ActionRow
                  icon={<ScanLine />}
                  tone="accent"
                  title="Escanear entradas"
                  description="Valida los QR en la puerta"
                  href={`/scan/${id}`}
                  linkComponent={Link}
                />
                <ActionRow
                  icon={<QrCode />}
                  title="Afiche con QR de venta"
                  description="Para imprimir: quien lo escanea compra su entrada"
                  loading={posterBusy}
                  onClick={handlePoster}
                />
              </ActionGroup>
              {posterError && <p className="px-1 text-sm text-[var(--color-danger)]">{posterError}</p>}
            </div>
          )}

          <ActionGroup title="Configuración">
            {!isCancelled && (
              <ActionRow
                icon={<FileText />}
                title="Información del evento"
                description="Nombre, fecha, lugar y descripción"
                href={`${base}/edit`}
                linkComponent={Link}
              />
            )}
            <ActionRow
              icon={<Ticket />}
              title="Tipos de entrada"
              description="Precios, cupos y zonas"
              meta={event.ticket_types.length > 0 ? event.ticket_types.length : undefined}
              href={`${base}/tickets`}
              linkComponent={Link}
            />
            {!isCancelled && (
              <ActionRow
                icon={<ImageIcon />}
                title="Imágenes"
                description="Flyer, mapa de zonas y ubicación"
                href={`${base}/images`}
                linkComponent={Link}
              />
            )}
            <ActionRow
              icon={<History />}
              title="Historial de cambios"
              description="Quién hizo qué y cuándo"
              href={`${base}/activity`}
              linkComponent={Link}
            />
          </ActionGroup>

          {!isCancelled && <EventAdvancedActions event={event} stats={stats} />}
        </div>
      </div>
    </>
  );
}
