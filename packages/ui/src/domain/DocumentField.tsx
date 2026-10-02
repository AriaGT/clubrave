import * as React from "react";

import { Input } from "../base/Input";
import { FieldError, Label } from "../base/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../base/Select";
import { cn } from "../lib/cn";

/** Mismas reglas que `backend/apps/orders/documents.py`. */
export type DocumentType = "DNI" | "CE" | "PASSPORT";

export const DOCUMENT_TYPES: { value: DocumentType; label: string; short: string }[] = [
  { value: "DNI", label: "DNI", short: "DNI" },
  { value: "CE", label: "Carné de extranjería", short: "CE" },
  { value: "PASSPORT", label: "Pasaporte", short: "Pasaporte" },
];

const FORMATS: Record<DocumentType, { pattern: RegExp; message: string; inputMode: "numeric" | "text" }> = {
  DNI: { pattern: /^\d{8}$/, message: "El DNI tiene 8 dígitos.", inputMode: "numeric" },
  CE: { pattern: /^[A-Z0-9]{8,12}$/, message: "El carné de extranjería tiene entre 8 y 12 caracteres.", inputMode: "text" },
  PASSPORT: { pattern: /^[A-Z0-9]{6,15}$/, message: "El pasaporte tiene entre 6 y 15 letras o números.", inputMode: "text" },
};

export function normalizeDocument(number: string): string {
  return number.replace(/[\s.-]/g, "").toUpperCase();
}

/** Mensaje de error o `undefined` si el documento es válido. */
export function documentError(type: DocumentType, number: string): string | undefined {
  const cleaned = normalizeDocument(number);
  if (!cleaned) return "El documento de identidad es obligatorio.";
  const format = FORMATS[type];
  return format.pattern.test(cleaned) ? undefined : format.message;
}

export function documentLabel(type: string | null | undefined): string {
  return DOCUMENT_TYPES.find((d) => d.value === type)?.short ?? "Documento";
}

export interface DocumentFieldProps {
  id?: string;
  type: DocumentType;
  onTypeChange: (type: DocumentType) => void;
  /** Props del input del número (p. ej. el `register()` de react-hook-form). */
  inputProps: React.ComponentProps<typeof Input>;
  error?: string;
  label?: string;
  hint?: string;
  className?: string;
}

/** Tipo + número de documento en una fila. DNI por defecto. */
export function DocumentField({
  id = "document_id",
  type,
  onTypeChange,
  inputProps,
  error,
  label = "Documento de identidad",
  hint,
  className,
}: DocumentFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Select value={type} onValueChange={(v) => onTypeChange(v as DocumentType)}>
          <SelectTrigger className="w-36 shrink-0" aria-label="Tipo de documento">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOCUMENT_TYPES.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={id}
          inputMode={FORMATS[type].inputMode}
          autoComplete="off"
          invalid={!!error}
          placeholder={type === "DNI" ? "12345678" : undefined}
          {...inputProps}
        />
      </div>
      {hint && !error && <span className="text-xs text-[var(--color-text-subtle)]">{hint}</span>}
      <FieldError>{error}</FieldError>
    </div>
  );
}
