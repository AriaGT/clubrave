"use client";

import {
  Badge,
  Button,
  ConfirmDialog,
  DangerZone,
  Skeleton,
  StatTile,
  Switch,
  TopBar,
} from "@repo/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import {
  apiErrorMessage,
  useChangeImpact,
  useDeleteEvent,
  useEvent,
  useEventStats,
  usePauseSales,
  usePublishEvent,
  useUnpublishEvent,
} from "@/features/events/hooks";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: event, isLoading } = useEvent(id);
  const { data: stats } = useEventStats(id);
  const { data: impact } = useChangeImpact(id);
  const pauseSales = usePauseSales(id);
  const unpublish = useUnpublishEvent(id);
  const publish = usePublishEvent(id);
  const deleteEvent = useDeleteEvent(id);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isCancelled = event?.status === "CANCELLED";
  const isPublished = event?.status === "PUBLISHED";
  const isDraft = event?.status === "DRAFT";

  function handleTogglePause() {
    if (!event || pauseSales.isPending) return;
    pauseSales.mutate(!event.sales_paused);
  }

  if (isLoading || !event) {
    return (
      <>
        <TopBar title="Evento" onBack={() => router.push("/events")} />
        <div className="flex flex-col gap-4 p-[var(--space-4)]">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title={event.title} onBack={() => router.push("/events")} />
      <div className="flex flex-col gap-6 p-[var(--space-4)]">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={event.status === "PUBLISHED" ? "mint" : event.status === "DRAFT" ? "neutral" : "danger"}>
            {event.status === "PUBLISHED" ? "Publicado" : event.status === "DRAFT" ? "Borrador" : "Cancelado"}
          </Badge>
          {event.sales_paused && <Badge variant="warning">Venta pausada</Badge>}
          <span className="text-sm text-[var(--color-text-muted)]">
            {new Date(event.starts_at).toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" })}
          </span>
        </div>

        {isCancelled && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4 text-sm">
            Este evento fue cancelado y no se modificará más.
            {event.cancellation_reason && <p className="mt-1 text-[var(--color-danger)]">{event.cancellation_reason}</p>}
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Recaudado" value={`S/ ${stats.revenue.gross}`} hint={`${stats.revenue.orders_paid} órdenes`} />
            <StatTile label="Vendidas" value={`${stats.tickets.sold}/${stats.tickets.capacity}`} />
            <StatTile label="Ingresaron" value={stats.tickets.checked_in} />
            <StatTile label="Últimas 24h" value={stats.last_24h.tickets} hint={`${stats.last_24h.orders} órdenes`} />
          </div>
        )}

        {isPublished && (
          <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">Venta de entradas</span>
                <span className="text-sm text-[var(--color-text-muted)]">
                  {event.sales_paused
                    ? "Pausada: los compradores no pueden empezar una compra."
                    : "Activa: los compradores pueden comprar entrada."}
                </span>
              </div>
              <Switch
                checked={pauseSales.isPending ? !!pauseSales.variables : event.sales_paused}
                disabled={pauseSales.isPending}
                aria-busy={pauseSales.isPending || undefined}
                onCheckedChange={handleTogglePause}
                aria-label="Pausar o reanudar la venta"
              />
            </div>
            {pauseSales.error && (
              <p className="text-sm text-[var(--color-danger)]">{apiErrorMessage(pauseSales.error)}</p>
            )}
          </div>
        )}

        {isPublished && (
          <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">Impacto de un cambio</span>
              <span className="text-sm text-[var(--color-text-muted)]">
                {impact ? (
                  <>
                    {impact.paid_orders} órdenes pagadas · {impact.distinct_buyers} compradores distintos
                  </>
                ) : (
                  "Consultando…"
                )}
              </span>
            </div>
            {impact && impact.paid_orders > 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Si despublicas, las compras en curso pueden terminar; no se pueden crear otras nuevas.
              </p>
            )}
          </div>
        )}

        {stats && stats.by_ticket_type.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="font-display text-base font-semibold">Por tipo de entrada</h3>
            {stats.by_ticket_type.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
              >
                <span>{t.name}</span>
                <span className="font-mono text-sm text-[var(--color-text-muted)]">
                  {t.sold}/{t.total} · S/ {t.revenue}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {!isCancelled && (
            <Link href={`/events/${id}/edit`}>
              <Button variant="secondary" className="w-full">
                Editar
              </Button>
            </Link>
          )}
          {!isCancelled && (
            <Link href={`/events/${id}/images`}>
              <Button variant="secondary" className="w-full">
                Imágenes
              </Button>
            </Link>
          )}
          <Link href={`/events/${id}/activity`}>
            <Button variant="secondary" className="w-full">
              Actividad
            </Button>
          </Link>
          <Link href={`/events/${id}/tickets`}>
            <Button variant="secondary" className="w-full">
              Entradas
            </Button>
          </Link>
          <Link href={`/events/${id}/sales`}>
            <Button variant="secondary" className="w-full">
              Ventas
            </Button>
          </Link>
          <Link href={`/events/${id}/attendees`}>
            <Button variant="secondary" className="w-full">
              Asistentes
            </Button>
          </Link>
        </div>

        {isDraft && (
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              className="w-full"
              loading={publish.isPending}
              onClick={() => publish.mutate()}
            >
              Publicar
            </Button>
            {publish.error && (
              <p className="text-sm text-[var(--color-danger)]">{apiErrorMessage(publish.error)}</p>
            )}
          </div>
        )}

        {isPublished && (
          <div className="flex flex-col gap-3">
            <Link href={`/events/${id}/announce`}>
              <Button variant="secondary" className="w-full">
                Enviar comunicado
              </Button>
            </Link>
            <Link href={`/scan/${id}`}>
              <Button variant="primary" className="w-full">
                Escanear
              </Button>
            </Link>
          </div>
        )}

        {!isCancelled && (
          <DangerZone description="Estas acciones no se pueden deshacer.">
            {isPublished && (
              <Button
                variant="danger"
                className="w-full"
                loading={unpublish.isPending}
                onClick={() => setUnpublishOpen(true)}
              >
                Despublicar
              </Button>
            )}
            {isPublished && (
              <Link href={`/events/${id}/cancel`}>
                <Button variant="danger" className="w-full">
                  Cancelar evento
                </Button>
              </Link>
            )}
            <Button
              variant="danger"
              className="w-full"
              loading={deleteEvent.isPending}
              onClick={() => setDeleteOpen(true)}
            >
              Eliminar evento
            </Button>
            {unpublish.error && (
              <p className="text-sm text-[var(--color-danger)]">{apiErrorMessage(unpublish.error)}</p>
            )}
            {deleteEvent.error && (
              <p className="text-sm text-[var(--color-danger)]">{apiErrorMessage(deleteEvent.error)}</p>
            )}
          </DangerZone>
        )}
      </div>

      <ConfirmDialog
        open={unpublishOpen}
        onOpenChange={setUnpublishOpen}
        title="¿Despublicar el evento?"
        description="Estará oculto para los compradores hasta que lo vuelvas a publicar."
        impact={
          impact
            ? `${impact.paid_orders} órdenes pagadas · ${impact.distinct_buyers} compradores distintos`
            : undefined
        }
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
