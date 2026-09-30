import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import * as React from "react";

import { cn } from "../lib/cn";

export const RadioGroup = RadioGroupPrimitive.Root;

export const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "h-5 w-5 shrink-0 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)]",
      "data-[state=checked]:border-[var(--color-accent)]",
      "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50",
      className
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex h-full w-full items-center justify-center">
      <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = "RadioGroupItem";
