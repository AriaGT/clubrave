import * as React from "react";

import { cn } from "../lib/cn";

export interface FilterChipOption<T extends string | undefined> {
  value: T;
  label: string;
  count?: number;
}

export interface FilterChipsProps<T extends string | undefined> {
  options: FilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label"?: string;
  className?: string;
}

/**
 * Filtros en píldora para listas (ventas, invitados…). Se desplazan en
 * horizontal en pantallas angostas en vez de partir la línea.
 */
export function FilterChips<T extends string | undefined>({
  options,
  value,
  onChange,
  className,
  ...props
}: FilterChipsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={props["aria-label"]}
      className={cn("-mx-[var(--space-4)] flex gap-2 overflow-x-auto px-[var(--space-4)] [scrollbar-width:none]", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-full)] px-3 py-1.5 text-sm font-medium",
              "transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
              selected
                ? "bg-[var(--color-accent)] text-white"
                : "border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
            )}
          >
            {option.label}
            {typeof option.count === "number" && (
              <span className={cn("font-mono text-xs tabular-nums", selected ? "text-white/80" : "text-[var(--color-text-subtle)]")}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
