import * as React from "react";

import { cn } from "../lib/cn";

export function AppShell({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-text)]", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function AppShellContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex-1 overflow-y-auto pb-24", className)} {...props}>
      {children}
    </div>
  );
}
