import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";

import * as React from "react";

import { cn } from "../lib/cn";
import { Spinner } from "./Spinner";

/**
 * El acento se gana: `primary` es violeta y solo debe haber una acción
 * principal por pantalla (ver §9.1 y §9.2 del plan).
 */
export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)]",
    "font-medium transition-[transform,background-color,border-color,color] duration-[var(--duration-fast)] ease-out",
    "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]",
        secondary:
          "bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]",
        ghost: "bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface)]",
        danger: "bg-transparent text-[var(--color-danger)] border border-[var(--color-danger)]/40 hover:bg-[var(--color-danger-soft)]",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-base", // 44px: área táctil mínima
        lg: "h-13 px-6 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Spinner size="sm" />}
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";
