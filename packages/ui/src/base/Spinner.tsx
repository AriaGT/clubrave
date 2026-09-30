import { Loader2 } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/cn";

export interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  size?: "sm" | "md" | "lg";
  /** Si se indica, se anuncia a lectores de pantalla; si no, es decorativo. */
  label?: string;
}

const SIZE = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-8 w-8" } as const;

/** Indicador de espera. Una sola fuente para botones, tarjetas y páginas. */
export function Spinner({ size = "md", label, className, ...props }: SpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin", SIZE[size], className)}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...props}
    />
  );
}
