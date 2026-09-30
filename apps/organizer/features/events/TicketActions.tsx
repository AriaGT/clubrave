"use client";

import { Button, ConfirmDialog, Switch, type ConfirmDialogValues } from "@repo/ui";
import { useState } from "react";

import {
  apiErrorMessage,
  useUndoCheckIn,
  useVoidTicket,
  type OrderVoidReasonCode,
  type UndoCheckInReasonCode,
} from "./hooks";

const VOID_REASONS: { value: OrderVoidReasonCode; label: string }[] = [
  { value: "FRAUD", label: "Fraude / contracargo" },
  { value: "DUPLICATE", label: "Compra duplicada" },
  { value: "BUYER_REQUEST", label: "Pedido del comprador" },
  { value: "ORGANIZER_ERROR", label: "Error del organizador" },
  { value: "OTHER", label: "Otro" },
];

const UNDO_REASONS: { value: UndoCheckInReasonCode; label: string }[] = [
  { value: "MISTAKE", label: "Escaneo por error" },
  { value: "DOUBLE_SCAN", label: "Doble escaneo" },
  { value: "OTHER", label: "Otro" },
];

/**
 * Acciones por entrada (H12/H13): anular una entrada `VALID` o deshacer el
 * ingreso de una `CHECKED_IN`. Cada fila confirma con motivo (H15, nivel 2).
 */
export function TicketActions({ code, status }: { code: string; status?: string }) {
  const voidTicket = useVoidTicket();
  const undoCheckIn = useUndoCheckIn();

  const [voidOpen, setVoidOpen] = useState(false);
  const [restock, setRestock] = useState(true);
  const [undoOpen, setUndoOpen] = useState(false);

  if (status === "VOID") return null;

  if (status === "CHECKED_IN") {
    return (
      <>
        <Button variant="secondary" size="sm" onClick={() => setUndoOpen(true)}>
          Deshacer ingreso
        </Button>
        <ConfirmDialog
          open={undoOpen}
          onOpenChange={setUndoOpen}
          title="Deshacer el ingreso"
          description="La entrada volverá a ser válida. El ingreso anterior (hora y quién) queda en la bitácora."
          reasons={UNDO_REASONS}
          confirmLabel="Deshacer ingreso"
          loading={undoCheckIn.isPending}
          error={undoCheckIn.error ? apiErrorMessage(undoCheckIn.error) : undefined}
          onConfirm={(values: ConfirmDialogValues) => {
            undoCheckIn.mutate(
              {
                code,
                body: { reason_code: values.reasonCode as UndoCheckInReasonCode, reason: values.reason },
              },
              { onSuccess: () => setUndoOpen(false) }
            );
          }}
        />
      </>
    );
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setVoidOpen(true)}>
        Anular entrada
      </Button>
      <ConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title="¿Anular esta entrada?"
        destructive
        description="Solo se anula esta entrada. La venta sigue como está y el comprador verá el motivo."
        reasons={VOID_REASONS}
        confirmLabel="Anular entrada"
        loading={voidTicket.isPending}
        error={voidTicket.error ? apiErrorMessage(voidTicket.error) : undefined}
        onConfirm={(values: ConfirmDialogValues) => {
          voidTicket.mutate(
            {
              code,
              body: { reason_code: values.reasonCode as OrderVoidReasonCode, reason: values.reason, restock },
            },
            { onSuccess: () => setVoidOpen(false) }
          );
        }}
      >
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Devolver este cupo a la venta</span>
            <span className="text-xs text-[var(--color-text-muted)]">
              Apagado, el cupo queda consumido.
            </span>
          </div>
          <Switch checked={restock} onCheckedChange={setRestock} />
        </div>
      </ConfirmDialog>
    </>
  );
}
