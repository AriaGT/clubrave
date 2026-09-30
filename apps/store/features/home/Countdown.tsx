"use client";

import { useEffect, useState } from "react";

import { cn } from "@repo/ui";

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return [
    { label: "días", value: Math.floor(total / 86400) },
    { label: "horas", value: Math.floor((total % 86400) / 3600) },
    { label: "min", value: Math.floor((total % 3600) / 60) },
    { label: "seg", value: total % 60 },
  ];
}

/** Cuenta regresiva al inicio del evento. Hasta montar en el cliente muestra
 * guiones: la hora del servidor no coincide con la del navegador. */
export function Countdown({ target, className }: { target: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = now === null ? null : new Date(target).getTime() - now;

  if (remaining !== null && remaining <= 0) {
    return (
      <p className={cn("flex items-center gap-2 font-display text-xl font-bold text-[var(--color-mint-text)]", className)}>
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--color-mint)]" />
        ¡Es hoy! Ya empezó
      </p>
    );
  }

  return (
    <div className={cn("flex gap-2 sm:gap-3", className)} role="timer" aria-label="Tiempo para el inicio del evento">
      {parts(remaining ?? 0).map(({ label, value }) => (
        <div
          key={label}
          className="flex min-w-16 flex-col items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-3 py-2 backdrop-blur-sm"
        >
          <span className="font-mono text-2xl font-bold tabular-nums sm:text-3xl">
            {remaining === null ? "--" : String(value).padStart(2, "0")}
          </span>
          <span className="text-2xs uppercase tracking-wide text-[var(--color-text-muted)]">{label}</span>
        </div>
      ))}
    </div>
  );
}
