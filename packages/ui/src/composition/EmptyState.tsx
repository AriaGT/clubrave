import * as React from "react";

import { cn } from "../lib/cn";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** Un componente sin `EmptyState` definido no se considera terminado (§9.8). */
export function EmptyState({ icon, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-[var(--space-8)] text-center",
        className
      )}
      {...props}
    >
      {icon && <div className="text-[var(--color-text-subtle)]">{icon}</div>}
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-sm text-[var(--color-text-muted)]">{description}</p>}
      {action}
    </div>
  );
}
