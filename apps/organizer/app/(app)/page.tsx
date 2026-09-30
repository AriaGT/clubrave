"use client";

import { Button, Card, CardContent, EmptyState, Skeleton, StatTile, TopBar } from "@repo/ui";
import { Calendar, Plus } from "lucide-react";
import Link from "next/link";

import { useEvents, useEventStats } from "@/features/events/hooks";

export default function HomePage() {
  const { data: events, isLoading } = useEvents("PUBLISHED");
  const nextEvent = events?.results?.[0];
  const { data: stats } = useEventStats(nextEvent?.id);

  return (
    <>
      <TopBar title="Inicio" />
      <div className="flex flex-col gap-6 p-[var(--space-4)]">
        {isLoading && <Skeleton className="h-40 w-full" />}

        {!isLoading && !nextEvent && (
          <EmptyState
            icon={<Calendar className="h-10 w-10" />}
            title="Aún no tienes eventos publicados"
            description="Crea tu primer evento en menos de 5 minutos."
            action={
              <Link href="/events/new">
                <Button>
                  <Plus className="h-4 w-4" /> Nuevo evento
                </Button>
              </Link>
            }
          />
        )}

        {nextEvent && (
          <Card>
            <CardContent className="flex flex-col gap-2 pt-4">
              <span className="text-xs uppercase tracking-wide text-[var(--color-text-subtle)]">
                Próximo evento
              </span>
              <Link href={`/events/${nextEvent.id}`} className="font-display text-xl font-semibold hover:underline">
                {nextEvent.title}
              </Link>
              <span className="text-sm text-[var(--color-text-muted)]">
                {new Date(nextEvent.starts_at).toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" })}
              </span>
            </CardContent>
          </Card>
        )}

        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Recaudado" value={`S/ ${stats.revenue.gross}`} />
            <StatTile label="Vendidas" value={`${stats.tickets.sold}/${stats.tickets.capacity}`} />
            <StatTile label="Ingresaron" value={stats.tickets.checked_in} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link href="/events/new">
            <Button variant="secondary" className="w-full">
              <Plus className="h-4 w-4" /> Nuevo evento
            </Button>
          </Link>
          <Link href="/scan">
            <Button variant="secondary" className="w-full">
              Escanear
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
