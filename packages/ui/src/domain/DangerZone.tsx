import { AlertTriangle } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/cn";

export interface DangerZoneProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  description?: string;
}

/**
 * Zona visualmente separada para acciones destructivas: nunca junto a los
 * botones de navegación (H15).
 */
export function DangerZone({
  title = "Zona de riesgo",
  description,
  className,
  children,
  ...props
}: DangerZoneProps) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)]/40 p-[var(--space-4)]",
        className
      )}
      {...props}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-danger)]" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-base font-semibold text-[var(--color-text)]">{title}</h2>
          {description && <p className="text-sm text-[var(--color-text-muted)]">{description}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
