import { buttonVariants, cn } from "@repo/ui";
import Link from "next/link";

import { getSiteSettings, whatsappLink } from "@/lib/site";
import { serverFetch } from "@/lib/server-api";
import { EventMarquee } from "@/features/home/EventMarquee";
import { FeaturedEvent } from "@/features/home/FeaturedEvent";
import { HeroSlider } from "@/features/home/HeroSlider";
import { PosterCard } from "@/features/home/PosterCard";
import type { EventDetail, EventListItem } from "@/features/home/types";

type PaginatedEvents = { results: EventListItem[] };

export const revalidate = 60;

/** Cuántos eventos entran al carrusel; el resto solo aparece en la grilla. */
const SLIDER_LIMIT = 5;

export default async function HomePage() {
  const data = await serverFetch<PaginatedEvents>("/api/events/");
  const events = data?.results ?? [];

  if (events.length === 0) return <NoEvents />;

  if (events.length === 1) {
    const [event] = events;
    const detail = await serverFetch<EventDetail>(`/api/events/${event.slug}/`);
    return (
      <main className="flex flex-col">
        <FeaturedEvent event={event} detail={detail} />
        <EventMarquee events={events} />
      </main>
    );
  }

  return (
    <main className="flex flex-col">
      <HeroSlider events={events.slice(0, SLIDER_LIMIT)} />
      <EventMarquee events={events} />
      <section
        id="eventos"
        className="mx-auto flex w-full max-w-[var(--container-max)] scroll-mt-20 flex-col gap-6 px-[var(--space-6)] py-12"
      >
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-text)]">
              Cartelera
            </span>
            <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Próximos eventos</h2>
          </div>
          <span className="whitespace-nowrap text-sm text-[var(--color-text-muted)]">{events.length} eventos</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {events.map((event) => (
            <PosterCard key={event.id} event={event} />
          ))}
        </div>
      </section>
    </main>
  );
}

/** Sin eventos publicados: se mantiene la marca y se invita a seguir las redes. */
async function NoEvents() {
  const settings = await getSiteSettings();
  const follow = settings?.instagram_url || settings?.tiktok_url;

  return (
    <main className="relative isolate flex flex-1 flex-col items-center justify-center gap-5 overflow-hidden px-[var(--space-6)] py-24 text-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.3),transparent_60%)]"
      />
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-text)]">
        Muy pronto
      </span>
      <h1 className="max-w-2xl font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
        Estamos preparando la próxima noche
      </h1>
      <p className="max-w-md text-[var(--color-text-muted)]">
        No hay eventos a la venta ahora mismo. Anunciamos las fechas primero en redes.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {follow && (
          <a
            href={follow}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants(), "shadow-[var(--glow-accent)]")}
          >
            Síguenos para enterarte
          </a>
        )}
        {settings?.whatsapp && (
          <a
            href={whatsappLink(settings.whatsapp)}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "secondary" })}
          >
            Escríbenos por WhatsApp
          </a>
        )}
        <Link href="/account/tickets" className={buttonVariants({ variant: "ghost" })}>
          Ver mis entradas
        </Link>
      </div>
    </main>
  );
}
