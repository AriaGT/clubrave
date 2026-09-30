import * as React from "react";

import { cn } from "../lib/cn";
import { QuantityStepper } from "./QuantityStepper";

export interface TicketTypeRowProps {
  name: string;
  description?: string;
  price: string;
  available: number;
  quantity: number;
  maxPerOrder: number;
  onQuantityChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

/** Nombre, precio, disponibilidad y selector de cantidad (tienda del comprador). */
export function TicketTypeRow({
  name,
  description,
  price,
  available,
  quantity,
  maxPerOrder,
  onQuantityChange,
  disabled = false,
  className,
}: TicketTypeRowProps) {
  const soldOut = available <= 0;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b border-[var(--color-border-subtle)] py-[var(--space-4)] last:border-0",
        disabled && "opacity-60",
        className
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{name}</span>
        {description && <span className="text-sm text-[var(--color-text-muted)]">{description}</span>}
        <span className="font-mono text-sm text-[var(--color-text-muted)]">S/ {price}</span>
        {disabled ? (
          <span className="text-xs uppercase tracking-wide text-[var(--color-warning)]">Venta pausada</span>
        ) : soldOut ? (
          <span className="text-xs uppercase tracking-wide text-[var(--color-danger)]">Agotado</span>
        ) : available <= 10 ? (
          <span className="text-xs uppercase tracking-wide text-[var(--color-warning)]">
            Quedan {available}
          </span>
        ) : null}
      </div>
      {!soldOut && !disabled && (
        <QuantityStepper
          value={quantity}
          max={Math.min(maxPerOrder, available)}
          onChange={onQuantityChange}
        />
      )}
    </div>
  );
}
