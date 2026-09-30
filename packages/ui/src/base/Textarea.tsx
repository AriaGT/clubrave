import * as React from "react";

import { cn } from "../lib/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "w-full rounded-[var(--radius-md)] border bg-[var(--color-surface-sunken)] px-3 py-2 text-base text-[var(--color-text)]",
        "placeholder:text-[var(--color-text-subtle)] transition-colors duration-[var(--duration-fast)] resize-y",
        "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        invalid ? "border-[var(--color-danger)]" : "border-[var(--color-border)]",
        className
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
