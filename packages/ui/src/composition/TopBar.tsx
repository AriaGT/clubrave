import { ChevronLeft } from "lucide-react";
import * as React from "react";

import { IconButton } from "../base/IconButton";
import { cn } from "../lib/cn";

export interface TopBarProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  /** Contexto pequeño sobre el título (p. ej. el evento al que pertenece la subpantalla). */
  subtitle?: string;
  onBack?: () => void;
  action?: React.ReactNode;
}

export function TopBar({ title, subtitle, onBack, action, className, ...props }: TopBarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[var(--color-border)]",
        "bg-[var(--color-bg-elevated)] px-[var(--space-4)]",
        className
      )}
      {...props}
    >
      {onBack && (
        <IconButton label="Volver" variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {subtitle && (
          <span className="truncate text-xs leading-tight text-[var(--color-text-subtle)]">{subtitle}</span>
        )}
        <h1 className="truncate font-display text-lg font-semibold leading-tight">{title}</h1>
      </div>
      {action}
    </header>
  );
}
