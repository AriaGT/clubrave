import * as React from "react";

import { AlertDialog, AlertDialogContent } from "../base/AlertDialog";
import { Button } from "../base/Button";
import { Input } from "../base/Input";
import { FieldError, Label } from "../base/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../base/Select";
import { Textarea } from "../base/Textarea";

export interface ConfirmReason {
  value: string;
  label: string;
}

export interface ConfirmDialogValues {
  reasonCode: string;
  reason: string;
  phrase: string;
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Consecuencia de la acción, en lenguaje llano (cuántas entradas, etc.). */
  impact?: React.ReactNode;
  /** Nivel 2: motivo de una lista cerrada. Se exige elegir uno. */
  reasons?: ConfirmReason[];
  /** Nivel 3: frase exacta que hay que escribir (p. ej. el título del evento). */
  confirmPhrase?: string;
  destructive?: boolean;
  confirmLabel?: string;
  loading?: boolean;
  error?: React.ReactNode;
  /** Contenido extra entre el motivo y los botones (p. ej. un `Switch`). */
  children?: React.ReactNode;
  onConfirm: (values: ConfirmDialogValues) => void;
}

/**
 * Confirma acciones irreversibles con intensidad proporcional al daño (H15):
 * sin motivos ni frase es un simple «¿Seguro?»; con `reasons` exige un motivo;
 * con `confirmPhrase` obliga a escribir la frase. Nunca se cierra tocando fuera.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  impact,
  reasons,
  confirmPhrase,
  destructive,
  confirmLabel = "Confirmar",
  loading,
  error,
  children,
  onConfirm,
}: ConfirmDialogProps) {
  const [reasonCode, setReasonCode] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [phrase, setPhrase] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setReasonCode("");
      setReason("");
      setPhrase("");
    }
  }, [open]);

  const reasonsOk = !reasons || reasons.length === 0 || reasonCode !== "";
  const phraseOk = !confirmPhrase || phrase.trim() === confirmPhrase;
  const canConfirm = reasonsOk && phraseOk && !loading;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        title={title}
        description={description}
        onOpenAutoFocus={(event) => {
          if (reasons || confirmPhrase) event.preventDefault();
        }}
      >
        {impact && (
          <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] p-[var(--space-3)] text-sm text-[var(--color-text)]">
            {impact}
          </div>
        )}

        {reasons && reasons.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-reason">Motivo</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger id="confirm-reason">
                <SelectValue placeholder="Elige un motivo" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              aria-label="Detalle del motivo (opcional)"
              placeholder="Detalle (opcional)"
              rows={2}
              value={reason}
              maxLength={200}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        )}

        {confirmPhrase && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-phrase">
              Escribe <span className="font-semibold">{confirmPhrase}</span> para confirmar
            </Label>
            <Input
              id="confirm-phrase"
              value={phrase}
              autoComplete="off"
              onChange={(event) => setPhrase(event.target.value)}
            />
          </div>
        )}

        {children}

        <FieldError>{error}</FieldError>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant={destructive ? "danger" : "primary"}
            loading={loading}
            disabled={!canConfirm}
            onClick={() => onConfirm({ reasonCode, reason, phrase })}
          >
            {confirmLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
