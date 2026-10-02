"use client";

import { cn } from "@repo/ui";
import { Clock } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

export interface CheckoutShellProps {
  /** Pasos u otra cabecera centrada sobre las dos columnas. */
  header?: ReactNode;
  /** Columna principal (formulario, medios de pago…). */
  children: ReactNode;
  /** Resumen de la compra. En el teléfono va arriba; en PC, a la derecha. */
  aside?: ReactNode;
  className?: string;
}

/**
 * Estructura común de las pantallas de compra: una columna en el teléfono y
 * dos en PC (contenido + resumen fijo). `min-w-0` evita que un formulario de
 * ancho fijo, como el de Izipay, ensanche la página en pantallas estrechas.
 */
export function CheckoutShell({ header, children, aside, className }: CheckoutShellProps) {
  return (
    <main className={cn("mx-auto w-full max-w-5xl px-[var(--space-4)] py-[var(--space-6)] sm:px-[var(--space-6)] lg:py-10", className)}>
      {header && <div className="mx-auto mb-6 w-full max-w-xl lg:mb-10">{header}</div>}
      <div
        className={cn(
          "grid gap-6",
          aside && "lg:grid-cols-[minmax(0,32rem)_22rem] lg:items-start lg:justify-center lg:gap-10"
        )}
      >
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
        {aside && <aside className="order-first min-w-0 lg:sticky lg:top-6 lg:order-last">{aside}</aside>}
      </div>
    </main>
  );
}

/** Tarjeta del resumen lateral. */
export function SummaryCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] sm:p-[var(--space-5)]">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function remaining(expiresAt: string, now: number): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
}

/** Tiempo que queda de la reserva de las entradas mientras se paga. */
export function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = remaining(expiresAt, now);
  const label = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const urgent = seconds > 0 && seconds <= 120;
  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] px-3 py-2 text-sm",
        urgent ? "text-[var(--color-warning)]" : "text-[var(--color-text-muted)]"
      )}
    >
      <Clock className="h-4 w-4 shrink-0" aria-hidden />
      {seconds > 0 ? (
        <span>
          Entradas reservadas por <span className="font-mono font-semibold">{label}</span>
        </span>
      ) : (
        <span>La reserva terminó.</span>
      )}
    </p>
  );
}
