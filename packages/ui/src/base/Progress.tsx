import * as React from "react";

import { cn } from "../lib/cn";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max: number;
  /** `mint` para lo ya completado (ingresos), `accent` para avance de ventas. */
  tone?: "accent" | "mint";
  label?: string;
}

/** Barra de avance fina (ocupación, ingresos). Sin texto propio: acompaña a un número. */
export function Progress({ value, max, tone = "accent", label, className, ...props }: ProgressProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-1.5 w-full overflow-hidden rounded-[var(--radius-full)] bg-[var(--color-surface-sunken)]", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-[var(--radius-full)] transition-[width] duration-[var(--duration-slow)]",
          tone === "mint" ? "bg-[var(--color-mint)]" : "bg-[var(--color-accent)]"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
