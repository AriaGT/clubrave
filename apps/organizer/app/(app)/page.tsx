"use client";

import { ActionGroup, ActionRow, Button, EmptyState, Skeleton, TopBar } from "@repo/ui";
import { CalendarDays, CalendarPlus, CirclePause, FilePen, List, Plus } from "lucide-react";
import Link from "next/link";

import { countdownLabel, isUpcomingOrOngoing, shortDateLabel } from "@/features/events/format";
import { useEvents } from "@/features/events/hooks";
import { NextEventCard } from "@/features/home/NextEventCard";

const MAX_UPCOMING = 4;

/**
 * Inicio: el próximo evento con sus números, lo que requiere atención
 * (borradores sin publicar, ventas pausadas) y el resto de la agenda.
 */
export default function HomePage() {
  const { data: published, isLoading: publishedLoading } = useEvents("PUBLISHED");
  const { data: drafts, isLoading: draftsLoading } = useEvents("DRAFT");
  const isLoading = publishedLoading || draftsLoading;

  // La API ordena por fecha ascendente e incluye los ya realizados.
  const upcoming = (published?.results ?? []).filter(isUpcomingOrOngoing);
  const [nextEvent, ...later] = upcoming;
  const pendingDrafts = (drafts?.results ?? []).filter(isUpcomingOrOngoing);
  const pausedLater = later.filter((e) => e.sales_paused);
  const needsAttention = pendingDrafts.length > 0 || pausedLater.length > 0;

  const todayLabel = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <TopBar
        title="Inicio"
        subtitle={todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
        action={
          <Button asChild size="sm" variant="secondary">
            <Link href="/events/new">
              <Plus className="h-4 w-4" aria-hidden /> Nuevo evento
            </Link>
          </Button>
        }
      />
      <div className="mx-auto grid w-full max-w-5xl gap-6 p-[var(--space-4)] lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-8">
        {isLoading ? (
          <>
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-col gap-5">
              {nextEvent ? (
                <NextEventCard event={nextEvent} />
              ) : (
                <EmptyState
                  icon={<CalendarPlus className="h-10 w-10" />}
                  title={pendingDrafts.length > 0 ? "No tienes eventos a la venta" : "Crea tu primer evento"}
                  description={
                    pendingDrafts.length > 0
                      ? "Termina y publica uno de tus borradores para empezar a vender."
                      : "En menos de 5 minutos: datos, tipos de entrada y flyer."
                  }
                  action={
                    pendingDrafts.length > 0 ? (
                      <Button asChild>
                        <Link href={`/events/${pendingDrafts[0].id}`}>
                          <FilePen className="h-4 w-4" aria-hidden /> Continuar borrador
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild>
                        <Link href="/events/new">
                          <Plus className="h-4 w-4" aria-hidden /> Nuevo evento
                        </Link>
                      </Button>
                    )
                  }
                />
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              {needsAttention && (
                <ActionGroup title="Requiere tu atención">
                  {pendingDrafts.map((event) => (
                    <ActionRow
                      key={event.id}
                      icon={<FilePen />}
                      tone="accent"
                      title={event.title}
                      description={`Borrador · ${shortDateLabel(event.starts_at)} · complétalo y publícalo`}
                      href={`/events/${event.id}`}
                      linkComponent={Link}
                    />
                  ))}
                  {pausedLater.map((event) => (
                    <ActionRow
                      key={event.id}
                      icon={<CirclePause />}
                      title={event.title}
                      description="Venta pausada: nadie puede comprar"
                      href={`/events/${event.id}`}
                      linkComponent={Link}
                    />
                  ))}
                </ActionGroup>
              )}

              {later.length > 0 && (
                <ActionGroup title="Más adelante">
                  {later.slice(0, MAX_UPCOMING).map((event) => (
                    <ActionRow
                      key={event.id}
                      icon={<CalendarDays />}
                      title={event.title}
                      description={`${shortDateLabel(event.starts_at)}${event.venue_name ? ` · ${event.venue_name}` : ""}`}
                      meta={countdownLabel(event.starts_at)}
                      href={`/events/${event.id}`}
                      linkComponent={Link}
                    />
                  ))}
                </ActionGroup>
              )}

              <ActionGroup>
                <ActionRow
                  icon={<List />}
                  title="Todos los eventos"
                  description="Activos, borradores y cancelados"
                  href="/events"
                  linkComponent={Link}
                />
              </ActionGroup>
            </div>
          </>
        )}
      </div>
    </>
  );
}
