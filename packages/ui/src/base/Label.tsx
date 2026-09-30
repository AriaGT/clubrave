import * as LabelPrimitive from "@radix-ui/react-label";
import * as React from "react";

import { cn } from "../lib/cn";

/** Etiquetas reales (`<label for>`), nunca solo `placeholder` (ver §9.10). */
export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn("text-sm font-medium text-[var(--color-text)]", className)}
    {...props}
  />
));
Label.displayName = "Label";

export interface FieldErrorProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children?: React.ReactNode;
}

/** Errores anunciados con `aria-live="polite"`, asociados al campo por `id` (§9.10). */
export const FieldError = React.forwardRef<HTMLParagraphElement, FieldErrorProps>(
  ({ className, children, ...props }, ref) => {
    if (!children) return null;
    return (
      <p
        ref={ref}
        role="alert"
        aria-live="polite"
        className={cn("text-sm text-[var(--color-danger)]", className)}
        {...props}
      >
        {children}
      </p>
    );
  }
);
FieldError.displayName = "FieldError";
