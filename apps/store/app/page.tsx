import type { ApiComponents } from "@repo/api-client";
import { EmptyState, EventCard } from "@repo/ui";
import Link from "next/link";

import { serverFetch } from "@/lib/server-api";

type PaginatedEvents = { results: ApiComponents["schemas"]["EventPublicList"][] };

export const revalidate = 60;

export default async function HomePage() {
  const data = await serverFetch<PaginatedEvents>("/api/events/");
  const events = data?.results ?? [];

  return (
    <main className="mx-auto flex max-w-[var(--container-max)] flex-col gap-6 p-[var(--space-6)]">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">Club Rave</h1>
        <p className="text-[var(--color-text-muted)]">Asegura tu entrada para los próximos eventos.</p>
      </header>

      {events.length === 0 && (
        <EmptyState title="No hay eventos por ahora" description="Vuelve pronto: se publican seguido." />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <Link key={event.id} href={`/e/${event.slug}`}>
            <EventCard
              title={event.title}
              coverImage={event.cover_image}
              dateLabel={new Date(event.starts_at).toLocaleDateString("es-PE", {
                dateStyle: "medium",
              })}
              venueLabel={event.city}
              status="PUBLISHED"
            />
          </Link>
        ))}
      </div>
    </main>
  );
}
