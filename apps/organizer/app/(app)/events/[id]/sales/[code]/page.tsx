"use client";

import {
  ActionGroup,
  ActionRow,
  Badge,
  Button,
  ConfirmDialog,
  FieldError,
  Input,
  Label,
  Sheet,
  SheetContent,
  Skeleton,
  Switch,
  TopBar,
  type ConfirmDialogValues,
} from "@repo/ui";
import { Ban, CircleCheck, CreditCard, Gift, Receipt, Send, Ticket, Undo2, User } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type * as React from "react";

import {
  apiErrorMessage,
  useEvent,
  useEventOrder,
  useMarkRefunded,
  useResendTickets,
  useVoidOrder,
  type OrderVoidReasonCode,
} from "@/features/events/hooks";
import { TicketActions } from "@/features/events/TicketActions";

const STATUS_VARIANT: Record<string, "neutral" | "mint" | "danger" | "warning"> = {
  PENDING: "warning",
  PAID: "mint",
  FAILED: "danger",
  EXPIRED: "neutral",
  CANCELLED: "danger",
  REFUNDED: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  PAID: "Pagada",
  FAILED: "Fallida",
  EXPIRED: "Vencida",
  CANCELLED: "Cancelada",
  REFUNDED: "Reembolsada",
};

const TICKET_STATUS_LABEL: Record<string, string> = {
  VALID: "Válida",
  CHECKED_IN: "Ingresó",
  VOID: "Anulada",
};

const VOID_REASONS: { value: OrderVoidReasonCode; label: string }[] = [
  { value: "FRAUD", label: "Fraude / contracargo" },
  { value: "DUPLICATE", label: "Compra duplicada" },
  { value: "BUYER_REQUEST", label: "Pedido del comprador" },
  { value: "ORGANIZER_ERROR", label: "Error del organizador" },
  { value: "OTHER", label: "Otro" },
];

const RESEND_LIMIT_PER_DAY = 5;

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatCode(code: string): string {
  return code.match(/.{1,4}/g)?.join(" ") ?? code;
}

/** Tarjeta de sección con un ícono discreto en el encabezado. */
function Section({
  icon,
  title,
  aside,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-[var(--color-text-subtle)]">
          {icon}
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function OrderDetailPage() {
  const { id, code } = useParams<{ id: string; code: string }>();
  const router = useRouter();
  const { data: order, isLoading } = useEventOrder(id, code);
  const { data: event } = useEvent(id);

  const voidOrder = useVoidOrder(code);
  const markRefunded = useMarkRefunded(code);
  const resendTickets = useResendTickets(code);

  const [voidOpen, setVoidOpen] = useState(false);
  const [restock, setRestock] = useState(true);
  const [voidSuccess, setVoidSuccess] = useState(false);

  const [refundSheetOpen, setRefundSheetOpen] = useState(false);
  const [refundReference, setRefundReference] = useState("");
  const [refundSuccess, setRefundSuccess] = useState(false);

  const [resendSentAt, setResendSentAt] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState(false);

  const checkedIn = useMemo(
    () => order?.tickets.filter((t) => t.status === "CHECKED_IN").length ?? 0,
    [order]
  );

  if (isLoading || !order) {
    return (
      <>
        <TopBar title="Venta" subtitle={event?.title} onBack={() => router.push(`/events/${id}/sales`)} />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-[var(--space-4)]">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </>
    );
  }

  async function handleVoid(values: ConfirmDialogValues) {
    await voidOrder.mutateAsync(
      { reason_code: values.reasonCode as OrderVoidReasonCode, reason: values.reason, restock },
      {
        onSuccess: () => {
          setVoidOpen(false);
          setVoidSuccess(true);
        },
      }
    );
  }

  async function handleRefund() {
    await markRefunded.mutateAsync(
      { refund_reference: refundReference },
      {
        onSuccess: () => {
          setRefundSheetOpen(false);
          setRefundReference("");
          setRefundSuccess(true);
        },
      }
    );
  }

  async function handleResend() {
    await resendTickets.mutateAsync(undefined, {
      onSuccess: () => {
        setResendSentAt(new Date().toISOString());
        setResendNotice(true);
      },
    });
  }

  const voidable = order.status === "PAID" || order.status === "PENDING";
  const canResend = order.status === "PAID";

  return (
    <>
      <TopBar
        title={`Venta ${order.code}`}
        subtitle={event?.title}
        onBack={() => router.push(`/events/${id}/sales`)}
        action={
          <Badge variant={STATUS_VARIANT[order.status ?? ""] ?? "neutral"}>
            {STATUS_LABEL[order.status ?? ""] ?? order.status}
          </Badge>
        }
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-[var(--space-4)]">
        {voidSuccess && (
          <p role="status" className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
            Venta anulada. El comprador fue notificado por email y las entradas quedaron inválidas.
          </p>
        )}
        {refundSuccess && (
          <p role="status" className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
            Reembolso registrado. La venta pasó a <strong>Reembolsada</strong>.
          </p>
        )}
        {resendNotice && resendSentAt && (
          <p role="status" className="rounded-[var(--radius-md)] border border-[var(--color-mint)]/40 bg-[var(--color-mint-soft)] p-3 text-sm">
            Entradas reenviadas al email del comprador ({formatDate(resendSentAt)}).
          </p>
        )}
        {order.is_guest && (
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-3 text-sm">
            <Gift className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent-text)]" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">Entrada de cortesía, sin pago</span>
              {order.guest_code && (
                <span className="text-[var(--color-text-muted)]">
                  Código usado: <span className="font-mono">{order.guest_code.match(/.{1,4}/g)?.join("-")}</span>
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-end justify-between gap-3 px-1">
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-display text-xl font-semibold">{order.buyer_name || order.buyer_email}</span>
            <span className="text-sm text-[var(--color-text-muted)]">{formatDate(order.created_at)}</span>
          </div>
          {!order.is_guest && (
            <span className="shrink-0 font-mono text-2xl font-semibold tabular-nums">S/ {order.total}</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <ActionGroup title="Acciones">
            <ActionRow
              icon={<Send />}
              title="Reenviar entradas"
              description={
                canResend
                  ? `Al email del comprador · ${order.resends_today} de ${RESEND_LIMIT_PER_DAY} reenvíos usados hoy`
                  : "Solo se puede reenviar en ventas pagadas"
              }
              disabled={!canResend}
              loading={resendTickets.isPending}
              hideChevron
              onClick={handleResend}
            />
            {order.status === "CANCELLED" && (
              <ActionRow
                icon={<Undo2 />}
                title="Marcar como reembolsada"
                description="Registra un reembolso hecho fuera de la plataforma"
                onClick={() => setRefundSheetOpen(true)}
              />
            )}
            {voidable && (
              <ActionRow
                icon={<Ban />}
                tone="danger"
                title="Anular venta"
                description="Invalida sus entradas y avisa al comprador"
                onClick={() => setVoidOpen(true)}
              />
            )}
          </ActionGroup>
          {resendTickets.error && (
            <p className="px-1 text-sm text-[var(--color-danger)]">{apiErrorMessage(resendTickets.error)}</p>
          )}
        </div>

        <Section icon={<User aria-hidden />} title="Comprador">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-[var(--color-text-muted)]">Nombre</dt>
            <dd>{order.buyer_name}</dd>
            <dt className="text-[var(--color-text-muted)]">Email</dt>
            <dd className="break-all">{order.buyer_email}</dd>
            <dt className="text-[var(--color-text-muted)]">Teléfono</dt>
            <dd>{order.buyer_phone || "—"}</dd>
            <dt className="text-[var(--color-text-muted)]">Documento</dt>
            <dd>{order.buyer_document || "—"}</dd>
          </dl>
        </Section>

        <Section icon={<Receipt aria-hidden />} title="Detalle">
          <div className="flex flex-col gap-2">
            {order.items.map((item) => (
              <div key={item.ticket_type_name} className="flex items-center justify-between text-sm">
                <span>
                  {item.quantity} × {item.ticket_type_name}
                </span>
                <span className="font-mono">S/ {item.subtotal}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-2 text-sm">
              <span className="text-[var(--color-text-muted)]">Subtotal</span>
              <span className="font-mono">S/ {order.subtotal}</span>
            </div>
            {order.service_fee ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Comisión</span>
                <span className="font-mono">S/ {order.service_fee}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between text-base font-medium">
              <span>Total</span>
              <span className="font-mono">S/ {order.total}</span>
            </div>
          </div>
        </Section>

        {(order.gateway || order.gateway_reference || order.paid_at) && (
          <Section icon={<CreditCard aria-hidden />} title="Pago">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-[var(--color-text-muted)]">Pasarela</dt>
              <dd>{order.gateway || "—"}</dd>
              <dt className="text-[var(--color-text-muted)]">Referencia</dt>
              <dd className="break-all font-mono">{order.gateway_reference || "—"}</dd>
              <dt className="text-[var(--color-text-muted)]">Pagada</dt>
              <dd>{formatDate(order.paid_at)}</dd>
            </dl>
          </Section>
        )}

        {(order.voided_at || order.refund_reference) && (
          <Section icon={<CircleCheck aria-hidden />} title="Anulación y reembolso">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {order.void_reason && (
                <>
                  <dt className="text-[var(--color-text-muted)]">Motivo</dt>
                  <dd>{order.void_reason}</dd>
                </>
              )}
              <dt className="text-[var(--color-text-muted)]">Anulada</dt>
              <dd>{formatDate(order.voided_at)}</dd>
              <dt className="text-[var(--color-text-muted)]">Referencia de reembolso</dt>
              <dd>{order.refund_reference || "—"}</dd>
            </dl>
          </Section>
        )}

        <Section
          icon={<Ticket aria-hidden />}
          title={`Entradas (${order.tickets.length})`}
          aside={
            <span className="text-right text-xs text-[var(--color-text-muted)]">
              Último envío: {formatDate(order.tickets_email_sent_at)}
            </span>
          }
        >
          <div className="flex flex-col gap-2">
            {order.tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="flex flex-col gap-2 border-b border-[var(--color-border-subtle)] pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-mono text-sm">{formatCode(ticket.code)}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {TICKET_STATUS_LABEL[ticket.status ?? ""] ?? ticket.status}
                    </span>
                  </div>
                  <TicketActions code={ticket.code} status={ticket.status} />
                </div>
                {ticket.status === "CHECKED_IN" && (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Esta persona ya ingresó el {formatDate(ticket.checked_in_at)} · {ticket.checked_in_by_email}
                  </p>
                )}
                {ticket.status === "VOID" && (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Anulada el {formatDate(ticket.voided_at)}
                    {ticket.void_reason ? ` · ${ticket.void_reason}` : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      </div>

      {voidable && (
        <ConfirmDialog
          open={voidOpen}
          onOpenChange={setVoidOpen}
          title="¿Anular esta venta?"
          destructive
          description="Las entradas de esta venta quedarán inválidas y el comprador recibirá un aviso."
          impact={
            checkedIn > 0
              ? `${checkedIn} de estas ${order.tickets.length} ${
                  checkedIn === 1 ? "entrada ya ingresó" : "entradas ya ingresaron"
                }. Anular la venta no las saca del local.`
              : undefined
          }
          reasons={VOID_REASONS}
          confirmLabel="Anular venta"
          loading={voidOrder.isPending}
          error={voidOrder.error ? apiErrorMessage(voidOrder.error) : undefined}
          onConfirm={handleVoid}
        >
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium">Devolver los cupos a la venta</span>
              <span className="text-xs text-[var(--color-text-muted)]">Apagado, los cupos quedan consumidos.</span>
            </div>
            <Switch checked={restock} onCheckedChange={setRestock} />
          </div>
        </ConfirmDialog>
      )}

      {order.status === "CANCELLED" && (
        <Sheet open={refundSheetOpen} onOpenChange={setRefundSheetOpen}>
          <SheetContent title="Marcar como reembolsada">
            <div className="flex flex-col gap-4">
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
                <strong>Esto no devuelve dinero.</strong> Registra que el reembolso ya se hizo fuera de la
                plataforma, para que la contabilidad cuadre.
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="refund-reference">Referencia (opcional)</Label>
                <Input
                  id="refund-reference"
                  value={refundReference}
                  maxLength={120}
                  onChange={(e) => setRefundReference(e.target.value)}
                  placeholder="Ej.: Yape 12/03, operación #12345"
                />
              </div>
              {markRefunded.error && <FieldError>{apiErrorMessage(markRefunded.error)}</FieldError>}
              <Button className="self-end" onClick={handleRefund} loading={markRefunded.isPending}>
                Marcar como reembolsada
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
