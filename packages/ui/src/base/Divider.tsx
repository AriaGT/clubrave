import * as React from "react";

import { cn } from "../lib/cn";

export interface DividerProps extends React.HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
}

export const Divider = React.forwardRef<HTMLHRElement, DividerProps>(
  ({ className, orientation = "horizontal", ...props }, ref) => (
    <hr
      ref={ref}
      className={cn(
        "border-[var(--color-border-subtle)]",
        orientation === "horizontal" ? "w-full border-t" : "h-full border-l",
        className
      )}
      {...props}
    />
  )
);
Divider.displayName = "Divider";
