import * as React from "react";

import { cn } from "../lib/cn";

export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Ícono discreto junto a la etiqueta. */
  icon?: React.ReactNode;
}

/** Métrica grande + etiqueta + variación. Usado en el resumen del evento. */
export const StatTile = React.forwardRef<HTMLDivElement, StatTileProps>(
  ({ label, value, hint, icon, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)]",
        className
      )}
      {...props}
    >
      <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-[var(--color-text-subtle)] [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
        {label}
      </span>
      <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-sm text-[var(--color-text-muted)]">{hint}</span>}
      {children}
    </div>
  )
);
StatTile.displayName = "StatTile";
