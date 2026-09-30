import * as React from "react";

import { cn } from "../lib/cn";

export interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
  withWordmark?: boolean;
}

/** El mark de Club Rave: cuatro esquinas de visor, un punto al centro. */
export const Logo = React.forwardRef<HTMLDivElement, LogoProps>(
  ({ size = 32, withWordmark, className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center gap-2", className)} {...props}>
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Club Rave">
        <rect width="100" height="100" rx="22" fill="var(--color-bg)" />
        <g stroke="var(--color-accent)" strokeWidth="7" strokeLinecap="round" fill="none">
          <path d="M28 20 H20 V28" />
          <path d="M72 20 H80 V28" />
          <path d="M28 80 H20 V72" />
          <path d="M72 80 H80 V72" />
        </g>
        <rect x="44" y="44" width="12" height="12" rx="2" fill="var(--color-accent)" />
      </svg>
      {withWordmark && <span className="font-display text-lg font-semibold tracking-tight">Club Rave</span>}
    </div>
  )
);
Logo.displayName = "Logo";
