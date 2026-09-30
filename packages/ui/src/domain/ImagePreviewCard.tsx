import { Maximize2 } from "lucide-react";
import * as React from "react";

import { Img } from "../base/Img";
import { ImageLightbox } from "../composition/ImageLightbox";
import { cn } from "../lib/cn";

export interface ImagePreviewCardProps {
  src: string;
  alt: string;
  /** Título del visor a pantalla completa, p. ej. "Zonas". */
  title: string;
  className?: string;
}

/**
 * Miniatura que se amplía a pantalla completa (zonas, mapa de ubicación).
 * Borde de 1 px sobre superficie, sin sombras difusas (§9.5); el recorte es
 * solo de la vista previa, el visor muestra la imagen entera.
 */
export function ImagePreviewCard({ src, alt, title, className }: ImagePreviewCardProps) {
  return (
    <ImageLightbox src={src} alt={alt} title={title}>
      <button
        type="button"
        aria-label={`Ampliar ${title.toLowerCase()}`}
        className={cn(
          "group relative block w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)]",
          "transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-strong)]",
          "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
          className
        )}
      >
        <Img src={src} alt={alt} className="aspect-video w-full object-cover" />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--color-bg-elevated)]/90 px-2.5 py-1 text-xs font-medium text-[var(--color-text)]">
          <Maximize2 className="h-3.5 w-3.5" />
          Ampliar
        </span>
      </button>
    </ImageLightbox>
  );
}
