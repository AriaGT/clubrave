import * as React from "react";

import { cn } from "../lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/**
 * `text-base` (16px) evita el zoom automático de iOS al enfocar el campo.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-[var(--radius-md)] border bg-[var(--color-surface-sunken)] px-3 text-base text-[var(--color-text)]",
        "placeholder:text-[var(--color-text-subtle)] transition-colors duration-[var(--duration-fast)]",
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
Input.displayName = "Input";
