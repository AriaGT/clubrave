import * as React from "react";

import { Spinner } from "../base/Spinner";
import { cn } from "../lib/cn";

export interface LoadingStateProps {
  /** Qué se está cargando, en palabras del usuario ("Cargando tus entradas…"). */
  label?: string;
  className?: string;
}

/** Espera de una sección o pantalla completa cuando no hay un Skeleton con la
 * forma del contenido. Se anuncia con `role="status"`. */
export function LoadingState({ label = "Cargando…", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-3 py-16 text-sm text-[var(--color-text-muted)]",
        className
      )}
    >
      <Spinner size="lg" className="text-[var(--color-accent-text)]" />
      {label}
    </div>
  );
}
