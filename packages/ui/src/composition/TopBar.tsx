import { ChevronLeft } from "lucide-react";
import * as React from "react";

import { IconButton } from "../base/IconButton";
import { cn } from "../lib/cn";

export interface TopBarProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  onBack?: () => void;
  action?: React.ReactNode;
}

export function TopBar({ title, onBack, action, className, ...props }: TopBarProps) {
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
      <h1 className="flex-1 truncate font-display text-lg font-semibold">{title}</h1>
      {action}
    </header>
  );
}
