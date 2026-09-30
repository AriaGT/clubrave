import * as React from "react";

import { Button } from "../base/Button";
import { Sheet, SheetContent } from "../composition/Sheet";
import { PriceBreakdown } from "./PriceBreakdown";

export interface CartSheetLine {
  id: string;
  name: string;
  quantity: number;
  subtotal: string;
}

export interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: CartSheetLine[];
  subtotal: string;
  total: string;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
}

/** Hoja inferior con líneas, desglose y total fijo (§11.3, §11.5). */
export function CartSheet({
  open,
  onOpenChange,
  lines,
  subtotal,
  total,
  onContinue,
  continueLabel = "Continuar",
  continueDisabled,
}: CartSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Tu carrito">
        <div className="flex flex-col gap-4">
          {lines.length === 0 ? (
            <p className="text-[var(--color-text-muted)]">Todavía no elegiste entradas.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lines.map((line) => (
                <li key={line.id} className="flex justify-between text-sm">
                  <span>
                    {line.quantity}× {line.name}
                  </span>
                  <span className="font-mono">S/ {line.subtotal}</span>
                </li>
              ))}
            </ul>
          )}
          <PriceBreakdown subtotal={subtotal} total={total} />
          <Button size="lg" disabled={continueDisabled || lines.length === 0} onClick={onContinue}>
            {continueLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
