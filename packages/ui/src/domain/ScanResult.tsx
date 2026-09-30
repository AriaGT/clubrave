import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import * as React from "react";

import { Button } from "../base/Button";
import { cn } from "../lib/cn";

export type ScanOutcome = "valid" | "already_used" | "invalid";

export interface ScanResultProps {
  outcome: ScanOutcome;
  title: string;
  subtitle?: string;
  details?: { label: string; value: string }[];
  /** Etiqueta destacada sobre el título, p. ej. "Invitado". */
  tag?: string;
  onDismiss: () => void;
  /** Solo en la variante ámbar `already_used`: permite deshacer el ingreso (H13). */
  onUndo?: () => void;
}

const OUTCOME_STYLES: Record<ScanOutcome, { icon: React.ElementType; bg: string; text: string }> = {
  valid: { icon: CheckCircle2, bg: "bg-[var(--color-mint-soft)]", text: "text-[var(--color-mint-text)]" },
  already_used: { icon: AlertTriangle, bg: "bg-[var(--color-warning-soft)]", text: "text-[var(--color-warning)]" },
  invalid: { icon: XCircle, bg: "bg-[var(--color-danger-soft)]", text: "text-[var(--color-danger)]" },
};

/**
 * Pantalla completa de resultado: verde/ámbar/rojo con icono, texto y
 * datos. El color nunca va solo (ver §9.2): icono + texto siempre lo
 * acompañan.
 */
export function ScanResult({ outcome, title, subtitle, details, tag, onDismiss, onUndo }: ScanResultProps) {
  const { icon: Icon, bg, text } = OUTCOME_STYLES[outcome];
  return (
    <div
      className={cn("flex min-h-screen flex-col items-center justify-center gap-6 p-[var(--space-6)] text-center", bg)}
      role="status"
    >
      <Icon className={cn("h-24 w-24", text)} aria-hidden />
      {tag && (
        <span className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-1.5 font-display text-xl font-bold uppercase tracking-widest text-white">
          {tag}
        </span>
      )}
      <div className="flex flex-col gap-2">
        <h2 className={cn("font-display text-3xl font-bold", text)}>{title}</h2>
        {subtitle && <p className="text-lg text-[var(--color-text)]">{subtitle}</p>}
      </div>
      {details && details.length > 0 && (
        <dl className="flex flex-col gap-1 text-[var(--color-text-muted)]">
          {details.map((d) => (
            <div key={d.label} className="flex gap-2">
              <dt className="font-medium">{d.label}:</dt>
              <dd>{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-col items-stretch gap-2">
        {outcome === "already_used" && onUndo && (
          <Button variant="secondary" size="lg" onClick={onUndo}>
            Deshacer ingreso
          </Button>
        )}
        <Button variant="secondary" size="lg" onClick={onDismiss}>
          Seguir escaneando
        </Button>
      </div>
    </div>
  );
}
