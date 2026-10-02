import { cn } from "@repo/ui";
import { Check } from "lucide-react";

const STEPS = ["Medio de pago", "Pago", "Listo"] as const;

export interface CheckoutStepsProps {
  /** Paso en curso (1 = medio de pago, 2 = pago, 3 = listo). */
  current: 1 | 2 | 3;
  /** Compra terminada: los tres pasos quedan marcados. */
  complete?: boolean;
  className?: string;
}

/**
 * Las tres etapas de la compra después de los datos del comprador: elegir
 * medio de pago, pagar y listo. Es solo orientación; no navega.
 */
export function CheckoutSteps({ current, complete = false, className }: CheckoutStepsProps) {
  return (
    <ol className={cn("flex w-full items-start", className)} aria-label="Progreso de la compra">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const done = complete || number < current;
        const active = !complete && number === current;
        const last = index === STEPS.length - 1;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
          >
            {/* Tramo hacia el paso siguiente: se llena al completar este. */}
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-4 left-[calc(50%+1.5rem)] right-[calc(-50%+1.5rem)] h-0.5 rounded-full transition-colors duration-[var(--duration-base,200ms)]",
                  done ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
                )}
              />
            )}
            <span
              className={cn(
                "relative flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold transition-colors duration-[var(--duration-base,200ms)]",
                done && "border-[var(--color-accent)] bg-[var(--color-accent)] text-white",
                active &&
                  "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-text)] shadow-[0_0_0_4px_var(--color-accent-ring)]",
                !done && !active && "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-subtle)]"
              )}
            >
              {done ? <Check className="h-4 w-4" aria-hidden /> : number}
            </span>
            <span
              className={cn(
                "text-xs leading-tight sm:text-sm",
                active || done ? "font-medium text-[var(--color-text)]" : "text-[var(--color-text-subtle)]"
              )}
            >
              {label}
              <span className="sr-only">{done ? " (completado)" : active ? " (paso actual)" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
