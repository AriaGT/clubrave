import * as React from "react";

import { cn } from "../lib/cn";

export interface EventHeroProps {
  coverImage: string | null;
  dateLabel: string;
  title: string;
  venueLabel: string;
  className?: string;
}

/** Portada a sangre con degradado inferior y datos superpuestos (§11.3). */
export function EventHero({ coverImage, dateLabel, title, venueLabel, className }: EventHeroProps) {
  return (
    <div className={cn("relative aspect-[4/5] w-full sm:aspect-video", className)}>
      {coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[var(--color-surface-sunken)]" />
      )}
      <div className="absolute inset-0 bg-[var(--gradient-scrim)]" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-[var(--space-6)]">
        <span className="w-fit rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-white">
          {dateLabel}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="text-[var(--color-text-muted)]">{venueLabel}</p>
      </div>
    </div>
  );
}
