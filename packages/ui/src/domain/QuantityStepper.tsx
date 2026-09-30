import { Minus, Plus } from "lucide-react";
import * as React from "react";

import { IconButton } from "../base/IconButton";
import { cn } from "../lib/cn";

export interface QuantityStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  className?: string;
}

/** `−` / cifra / `+`, con áreas táctiles de 44 px y tope por límite de compra. */
export function QuantityStepper({ value, min = 0, max = 99, onChange, className }: QuantityStepperProps) {
  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <IconButton
        label="Restar"
        variant="secondary"
        size="sm"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="h-4 w-4" />
      </IconButton>
      <span className="w-6 text-center font-mono text-base tabular-nums" aria-live="polite">
        {value}
      </span>
      <IconButton
        label="Sumar"
        variant="secondary"
        size="sm"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="h-4 w-4" />
      </IconButton>
    </div>
  );
}
