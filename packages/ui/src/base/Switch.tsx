import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";

import { cn } from "../lib/cn";

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-7 w-12 shrink-0 rounded-[var(--radius-full)] bg-[var(--color-surface-sunken)] border border-[var(--color-border)]",
      "transition-colors duration-[var(--duration-fast)] data-[state=checked]:bg-[var(--color-accent)] data-[state=checked]:border-[var(--color-accent)]",
      "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50",
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "block h-5 w-5 translate-x-1 rounded-full bg-white transition-transform duration-[var(--duration-fast)]",
        "data-[state=checked]:translate-x-[22px]"
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
