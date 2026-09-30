import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "../lib/cn";

const iconButtonVariants = cva(
  [
    "inline-flex items-center justify-center rounded-[var(--radius-full)]",
    "transition-[transform,background-color] duration-[var(--duration-fast)] ease-out active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]",
        secondary: "bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]",
        ghost: "bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
      },
      size: {
        sm: "h-9 w-9",
        md: "h-11 w-11", // 44px: área táctil mínima
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  }
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  label: string; // obligatorio: un botón de solo ícono siempre necesita nombre accesible
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, label, children, ...props }, ref) => (
    <button ref={ref} type="button" aria-label={label} className={cn(iconButtonVariants({ variant, size }), className)} {...props}>
      {children}
    </button>
  )
);
IconButton.displayName = "IconButton";
