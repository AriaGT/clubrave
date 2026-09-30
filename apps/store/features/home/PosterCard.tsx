import { Img } from "@repo/ui";
import Link from "next/link";

import { dayNumber, monthShort, priceLabel, timeLabel, weekdayShort } from "./format";
import type { EventListItem } from "./types";

/** Tarjeta vertical (4:5, la proporción de un flyer) con bloque de fecha. */
export function PosterCard({ event }: { event: EventListItem }) {
  const price = priceLabel(event.price_from, event.currency);

  return (
    <Link
      href={`/e/${event.slug}`}
      className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] transition-[border-color,box-shadow,transform] duration-[var(--duration-base)] ease-[var(--ease-out)] hover:-translate-y-1 hover:border-[var(--color-accent)] hover:shadow-[var(--glow-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
    >
      {event.cover_image && (
        <Img
          src={event.cover_image}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out)] group-hover:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-[image:var(--gradient-scrim-hero)]" />

      <div className="absolute left-3 top-3 flex flex-col items-center rounded-[var(--radius-md)] bg-[var(--color-bg)]/80 px-2.5 py-1.5 leading-none backdrop-blur-sm">
        <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--color-accent-text)]">
          {monthShort(event.starts_at)}
        </span>
        <span className="font-display text-2xl font-extrabold">{dayNumber(event.starts_at)}</span>
      </div>

      <div className="relative flex flex-col gap-1 p-3 sm:gap-1.5 sm:p-4">
        <h3 className="line-clamp-2 font-display text-base font-bold sm:text-xl leading-tight text-white">{event.title}</h3>
        <p className="line-clamp-2 text-xs first-letter:uppercase text-[var(--color-text-muted)] sm:text-sm">
          {weekdayShort(event.starts_at)} · {timeLabel(event.starts_at)}
          {event.venue_name ? ` · ${event.venue_name}` : ""}
        </p>
        {price && (
          <span className="mt-1 w-fit rounded-[var(--radius-full)] bg-[var(--color-accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-accent-text)]">
            {price}
          </span>
        )}
      </div>
    </Link>
  );
}
