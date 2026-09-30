import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
  {
    variants: {
      variant: {
        neutral: "bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)]",
        accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]",
        mint: "bg-[var(--color-mint-soft)] text-[var(--color-mint-text)]",
        warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
        danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
));
Badge.displayName = "Badge";
