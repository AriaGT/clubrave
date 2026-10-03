"use client";

import { isApiError } from "@repo/api-client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  DocumentField,
  type DocumentType,
  documentError,
  FieldError,
  Input,
  Label,
  normalizeDocument,
  QuantityStepper,
  Skeleton,
  Switch,
  TopBar,
  cn,
} from "@repo/ui";
import { useParams, useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";

import { apiErrorMessage, useEvent } from "@/features/events/hooks";
import { MANUAL_PAYMENT_METHODS, type ManualPaymentMethod, useCreateManualSale } from "@/features/sales/hooks";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-[var(--color-text-muted)]">{description}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function money(value: number): string {
  return value.toFixed(2);
}

/**
 * Venta fuera de la web (WhatsApp, en persona). La orden sale pagada con sus
 * entradas emitidas; después se entregan como PDF, imagen o correo desde el
 * detalle de la venta.
 */
export default function ManualSalePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: event, isLoading } = useEvent(id);
  const createSale = useCreateManualSale(id);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [fullName, setFullName] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("DNI");
  const [documentId, setDocumentId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [method, setMethod] = useState<ManualPaymentMethod>("YAPE_PLIN");
  const [reference, setReference] = useState("");
  const [charged, setCharged] = useState<string | null>(null); // null = precio de lista
  const [errors, setErrors] = useState<Record<string, string>>({});

  const ticketTypes = useMemo(() => event?.ticket_types ?? [], [event]);
  const listTotal = useMemo(
    () => ticketTypes.reduce((sum, tt) => sum + Number(tt.price) * (quantities[tt.id] ?? 0), 0),
    [ticketTypes, quantities]
  );
  const ticketCount = Object.values(quantities).reduce((a, b) => a + b, 0);
  const emailValid = EMAIL_RE.test(email.trim());
  const chargedValue = charged ?? money(listTotal);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (ticketCount === 0) next.items = "Elige al menos una entrada.";
    if (fullName.trim().length < 2) next.full_name = "Escribe el nombre del cliente.";
    const docError = documentError(documentType, documentId);
    if (docError) next.document_id = docError;
    if (email.trim() && !emailValid) next.email = "Email inválido.";
    if (!/^\d+(\.\d{1,2})?$/.test(chargedValue.trim())) next.total = "Monto inválido.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    const order = await createSale.mutateAsync({
      items: Object.entries(quantities)
        .filter(([, q]) => q > 0)
        .map(([ticket_type_id, quantity]) => ({ ticket_type_id, quantity })),
      buyer: {
        full_name: fullName.trim(),
        document_type: documentType,
        document_id: normalizeDocument(documentId),
        phone: phone.trim(),
        email: email.trim(),
      },
      payment_method: method,
      payment_reference: reference.trim(),
      total: charged === null ? undefined : chargedValue.trim(),
      send_email: sendEmail && emailValid,
    });
    router.replace(`/events/${id}/sales/${order.code}?nueva=1`);
  }

  const apiFieldErrors = isApiError(createSale.error)
    ? (createSale.error.error.details as Record<string, unknown> | undefined)
    : undefined;

  return (
    <>
      <TopBar title="Venta manual" subtitle={event?.title} onBack={() => router.push(`/events/${id}/sales`)} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-[var(--space-4)] pb-32">
        <p className="text-sm text-[var(--color-text-muted)]">
          Para ventas fuera de la web (WhatsApp, en persona). La venta queda pagada y las entradas se emiten al
          instante; después las compartes como PDF, imagen o por correo.
        </p>

        {isLoading && <Skeleton className="h-64" />}

        {event && (
          <>
            <Section title="Entradas" description="Se descuentan del stock igual que una venta web.">
              {ticketTypes.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)]">Este evento no tiene tipos de entrada.</p>
              )}
              {ticketTypes.map((tt) => (
                <div key={tt.id} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {tt.name}
                      {tt.is_active === false && <Badge variant="neutral">Oculta</Badge>}
                    </span>
                    <span className="text-sm text-[var(--color-text-muted)]">
                      S/ {tt.price} · {tt.available} disponibles
                    </span>
                  </div>
                  <QuantityStepper
                    value={quantities[tt.id] ?? 0}
                    max={tt.available}
                    onChange={(q) => setQuantities({ ...quantities, [tt.id]: q })}
                  />
                </div>
              ))}
              <FieldError>{errors.items}</FieldError>
            </Section>

            <Section title="Cliente" description="El documento es obligatorio: se revisa en la puerta.">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="full_name">Nombre completo</Label>
                <Input
                  id="full_name"
                  value={fullName}
                  invalid={!!errors.full_name}
                  onChange={(e) => setFullName(e.target.value)}
                />
                <FieldError>{errors.full_name}</FieldError>
              </div>
              <DocumentField
                type={documentType}
                onTypeChange={setDocumentType}
                inputProps={{ value: documentId, onChange: (e) => setDocumentId(e.target.value) }}
                error={errors.document_id}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phone">Teléfono (opcional)</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email (opcional)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    invalid={!!errors.email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <FieldError>{errors.email}</FieldError>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Enviar las entradas por correo</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {emailValid ? `A ${email.trim()}` : "Escribe un email para activarlo. Si no, compártelas tú."}
                  </span>
                </div>
                <Switch checked={sendEmail && emailValid} disabled={!emailValid} onCheckedChange={setSendEmail} />
              </div>
            </Section>

            <Section title="Pago" description="Cómo te pagó el cliente. No pasa por la pasarela.">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {MANUAL_PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={cn(
                      "rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
                      "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                      method === m.value
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]"
                        : "border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="charged">Monto cobrado (S/)</Label>
                  <Input
                    id="charged"
                    inputMode="decimal"
                    value={chargedValue}
                    invalid={!!errors.total}
                    onChange={(e) => setCharged(e.target.value)}
                  />
                  <span className="text-xs text-[var(--color-text-subtle)]">
                    Precio de lista: S/ {money(listTotal)}
                    {charged !== null && (
                      <>
                        {" · "}
                        <button type="button" className="underline" onClick={() => setCharged(null)}>
                          usar precio de lista
                        </button>
                      </>
                    )}
                  </span>
                  <FieldError>{errors.total}</FieldError>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reference">Referencia (opcional)</Label>
                  <Input
                    id="reference"
                    placeholder="N.º de operación, comentario…"
                    maxLength={100}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </div>
              </div>
            </Section>
          </>
        )}
      </div>

      {event && (
        <div
          style={{ bottom: "calc(var(--density-row, 44px) + 20px + env(safe-area-inset-bottom))" }}
          className="fixed inset-x-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-[var(--space-3)]"
        >
          <div className="mx-auto flex max-w-[var(--container-max)] items-center justify-end gap-3">
            <span className="text-sm text-[var(--color-text-muted)]" aria-live="polite">
              {createSale.isError
                ? <span className="text-[var(--color-danger)]">{apiFieldErrors ? "Revisa los datos." : apiErrorMessage(createSale.error)}</span>
                : `${ticketCount} ${ticketCount === 1 ? "entrada" : "entradas"} · S/ ${chargedValue || "0.00"}`}
            </span>
            <Button type="button" loading={createSale.isPending} disabled={ticketCount === 0} onClick={submit}>
              Registrar venta
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
