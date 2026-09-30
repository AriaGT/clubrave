import * as React from "react";

import { cn } from "../lib/cn";

export interface PriceBreakdownProps {
  subtotal: string;
  serviceFee?: string;
  total: string;
  currency?: string;
  className?: string;
}

/** Subtotal, cargo por servicio, total. Preparado para comisiones futuras. */
export function PriceBreakdown({ subtotal, serviceFee, total, currency = "S/", className }: PriceBreakdownProps) {
  return (
    <div className={cn("flex flex-col gap-1.5 font-mono text-sm", className)}>
      <div className="flex justify-between text-[var(--color-text-muted)]">
        <span>Subtotal</span>
        <span>
          {currency} {subtotal}
        </span>
      </div>
      {serviceFee && serviceFee !== "0.00" && (
        <div className="flex justify-between text-[var(--color-text-muted)]">
          <span>Cargo por servicio</span>
          <span>
            {currency} {serviceFee}
          </span>
        </div>
      )}
      <div className="flex justify-between border-t border-[var(--color-border-subtle)] pt-1.5 text-base font-semibold text-[var(--color-text)]">
        <span>Total</span>
        <span>
          {currency} {total}
        </span>
      </div>
    </div>
  );
}
