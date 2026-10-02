"use client";

import { Switch, cn } from "@repo/ui";
import { ShoppingBag } from "lucide-react";

import { apiErrorMessage, usePauseSales } from "@/features/events/hooks";

import type { OrganizerEvent } from "./types";

/**
 * Interruptor de la venta online. Encendido = venta abierta (el estado
 * normal); apagado = pausada. Pausar es reversible y no toca lo ya vendido.
 */
export function SalesControl({ event }: { event: OrganizerEvent }) {
  const pauseSales = usePauseSales(event.id);
  const paused = pauseSales.isPending ? !!pauseSales.variables : event.sales_paused;
  const open = !paused;

  return (
    <section
      className={cn(
        "flex flex-col gap-2 rounded-[var(--radius-lg)] border p-[var(--space-4)] transition-colors",
        open
          ? "border-[var(--color-border)] bg-[var(--color-surface)]"
          : "border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)]"
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]",
            open
              ? "bg-[var(--color-mint-soft)] text-[var(--color-mint-text)]"
              : "bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
          )}
        >
          <ShoppingBag className="h-[18px] w-[18px]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <label htmlFor="sales-open" className="font-medium">
            {open ? "Venta abierta" : "Venta pausada"}
          </label>
          <span className="text-sm text-[var(--color-text-muted)]">
            {open
              ? "Cualquiera puede comprar entradas en la tienda."
              : "Nadie puede iniciar compras nuevas. Lo vendido sigue válido."}
          </span>
        </div>
        <Switch
          id="sales-open"
          checked={open}
          disabled={pauseSales.isPending}
          aria-busy={pauseSales.isPending || undefined}
          onCheckedChange={(checked) => pauseSales.mutate(!checked)}
        />
      </div>
      {pauseSales.error && <p className="text-sm text-[var(--color-danger)]">{apiErrorMessage(pauseSales.error)}</p>}
    </section>
  );
}
