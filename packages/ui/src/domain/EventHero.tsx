import { Maximize2 } from "lucide-react";
import * as React from "react";

import { Img } from "../base/Img";
import { ImageLightbox } from "../composition/ImageLightbox";
import { cn } from "../lib/cn";

export interface EventHeroProps {
  coverImage: string | null;
  dateLabel: string;
  title: string;
  venueLabel: string;
  /** Si se indica (p. ej. "Flyer"), la portada se puede ver completa: el
   * encuadre del hero la recorta y un flyer suele llevar el line-up. */
  coverExpandTitle?: string;
  className?: string;
}

/** Portada a sangre con degradado inferior y datos superpuestos (§11.3). */
export function EventHero({
  coverImage,
  dateLabel,
  title,
  venueLabel,
  coverExpandTitle,
  className,
}: EventHeroProps) {
  return (
    <div className={cn("relative aspect-[4/5] w-full sm:aspect-video", className)}>
      {coverImage ? (
        <Img src={coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[var(--color-surface-sunken)]" />
      )}
      <div className="absolute inset-0 bg-[image:var(--gradient-scrim-hero)]" />
      {coverImage && coverExpandTitle && (
        <ImageLightbox src={coverImage} alt={`${coverExpandTitle} de ${title}`} title={coverExpandTitle}>
          <button
            type="button"
            className="absolute right-[var(--space-4)] top-[var(--space-4)] inline-flex items-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--color-bg)]/70 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg)]/90 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <Maximize2 className="h-4 w-4" />
            Ver {coverExpandTitle.toLowerCase()}
          </button>
        </ImageLightbox>
      )}
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
