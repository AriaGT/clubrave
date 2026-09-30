"use client";

import { Button, EmptyState, EventCard, Skeleton, TopBar } from "@repo/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useEvents } from "@/features/events/hooks";

const TABS = [
  { key: "PUBLISHED", label: "Activos" },
  { key: "DRAFT", label: "Borradores" },
  { key: "CANCELLED", label: "Cancelados" },
] as const;

function coverImageOf(event: { images: { image: string; is_cover?: boolean }[] }) {
  return event.images.find((i) => i.is_cover)?.image ?? event.images[0]?.image ?? null;
}

export default function EventsListPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("PUBLISHED");
  const { data, isLoading } = useEvents(tab);

  return (
    <>
      <TopBar
        title="Eventos"
        action={
          <Link href="/events/new">
            <Button size="sm">
              <Plus className="h-4 w-4" /> Nuevo
            </Button>
          </Link>
        }
      />
      <div className="flex flex-col gap-4 p-[var(--space-4)]">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                tab === t.key
                  ? "rounded-[var(--radius-full)] bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white"
                  : "rounded-[var(--radius-full)] border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-muted)]"
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="aspect-video w-full" />
          </div>
        )}

        {!isLoading && data?.results?.length === 0 && (
          <EmptyState title="No hay eventos aquí" description="Cuando crees uno, aparecerá en esta lista." />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data?.results?.map((event) => (
            <Link key={event.id} href={`/events/${event.id}`}>
              <EventCard
                title={event.title}
                coverImage={coverImageOf(event)}
                dateLabel={new Date(event.starts_at).toLocaleDateString("es-PE", { dateStyle: "medium" })}
                venueLabel={event.venue_name}
                status={event.status}
              />
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
