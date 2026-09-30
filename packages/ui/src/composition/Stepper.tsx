import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/cn";

export interface StepperStep {
  key: string;
  label: string;
  complete?: boolean;
}

export interface StepperProps {
  steps: StepperStep[];
  activeKey: string;
  onStepClick?: (key: string) => void;
}

/**
 * Los pasos incompletos se marcan, no se bloquean: se puede saltar de un
 * paso a otro libremente (ver §10.3).
 */
export function Stepper({ steps, activeKey, onStepClick }: StepperProps) {
  return (
    <ol className="flex items-center gap-1 sm:gap-2">
      {steps.map((step, index) => {
        const isActive = step.key === activeKey;
        return (
          <li key={step.key} className="flex flex-1 items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => onStepClick?.(step.key)}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-full)] text-sm font-semibold",
                "transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                isActive
                  ? "bg-[var(--color-accent)] text-white"
                  : step.complete
                    ? "bg-[var(--color-mint-soft)] text-[var(--color-mint-text)]"
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
              )}
              aria-current={isActive ? "step" : undefined}
            >
              {step.complete && !isActive ? <Check className="h-4 w-4" /> : index + 1}
            </button>
            <span
              className={cn(
                "hidden text-sm sm:inline",
                isActive ? "text-[var(--color-text)] font-medium" : "text-[var(--color-text-muted)]"
              )}
            >
              {step.label}
            </span>
            {index < steps.length - 1 && <span className="h-px flex-1 bg-[var(--color-border)]" />}
          </li>
        );
      })}
    </ol>
  );
}
