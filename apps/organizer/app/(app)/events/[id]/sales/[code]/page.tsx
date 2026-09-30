"use client";

import {
  Badge,
  Button,
  ConfirmDialog,
  FieldError,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetTrigger,
  Skeleton,
  Switch,
  TopBar,
  type ConfirmDialogValues,
} from "@repo/ui";
import { RefreshCw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  apiErrorMessage,
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

export default function OrderDetailPage() {
  const { id, code } = useParams<{ id: string; code: string }>();
  const router = useRouter();
  const { data: order, isLoading } = useEventOrder(id, code);

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
        <TopBar
          title="Venta"
          onBack={() => router.push(`/events/${id}/sales`)}
        />
        <div className="flex flex-col gap-3 p-[var(--space-4)]">
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

  const voidable = order.status === "PAID" || order.status === "PENDING";
  const canResend = order.status === "PAID";

  return (
    <>
      <TopBar
        title={`Venta ${order.code}`}
        onBack={() => router.push(`/events/${id}/sales`)}
        action={<Badge variant={STATUS_VARIANT[order.status ?? ""] ?? "neutral"}>{STATUS_LABEL[order.status ?? ""] ?? order.status}</Badge>}
      />
      <div className="flex flex-col gap-4 p-[var(--space-4)]">
        {voidSuccess && (
          <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
            Venta anulada. El comprador fue notificado por email y las entradas quedaron inválidas.
          </p>
        )}
        {refundSuccess && (
          <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
            Reembolso registrado. La venta pasó a <strong>Reembolsada</strong>.
          </p>
        )}
        {resendNotice && resendSentAt && (
          <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
            Entradas reenviadas al email del comprador ({formatDate(resendSentAt)}).
          </p>
        )}

        <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
          <h2 className="font-display text-base font-semibold">Comprador</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-[var(--color-text-muted)]">Nombre</dt>
            <dd>{order.buyer_name}</dd>
            <dt className="text-[var(--color-text-muted)]">Email</dt>
            <dd>{order.buyer_email}</dd>
            <dt className="text-[var(--color-text-muted)]">Teléfono</dt>
            <dd>{order.buyer_phone || "—"}</dd>
            <dt className="text-[var(--color-text-muted)]">Documento</dt>
            <dd>{order.buyer_document || "—"}</dd>
            <dt className="text-[var(--color-text-muted)]">Fecha</dt>
            <dd>{formatDate(order.created_at)}</dd>
          </dl>
        </section>

        <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
          <h2 className="font-display text-base font-semibold">Detalle</h2>
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
        </section>

        {(order.gateway || order.gateway_reference || order.paid_at) && (
          <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
            <h2 className="font-display text-base font-semibold">Pago</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-[var(--color-text-muted)]">Pasarela</dt>
              <dd>{order.gateway || "—"}</dd>
              <dt className="text-[var(--color-text-muted)]">Referencia</dt>
              <dd className="font-mono">{order.gateway_reference || "—"}</dd>
              <dt className="text-[var(--color-text-muted)]">Pagada</dt>
              <dd>{formatDate(order.paid_at)}</dd>
            </dl>
          </section>
        )}

        {(order.voided_at || order.refund_reference) && (
          <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
            <h2 className="font-display text-base font-semibold">Anulación y reembolso</h2>
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
          </section>
        )}

        <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Entradas emitidas</h2>
            <span className="text-xs text-[var(--color-text-muted)]">
              Último envío: {formatDate(order.tickets_email_sent_at)}
            </span>
          </div>
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
                    Esta persona ya ingresó el {formatDate(ticket.checked_in_at)} ·{" "}
                    {ticket.checked_in_by_email}
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
        </section>

        {voidable && (
          <>
            <Button variant="danger" onClick={() => setVoidOpen(true)}>
              Anular venta
            </Button>
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
          </>
        )}

        {order.status === "CANCELLED" && (
          <Sheet open={refundSheetOpen} onOpenChange={setRefundSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="secondary">Marcar como reembolsada</Button>
            </SheetTrigger>
            <SheetContent title="Marcar como reembolsada">
              <div className="flex flex-col gap-4">
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
                  <strong>Esto no devuelve dinero.</strong> Registra que el reembolso ya se hizo fuera de la
                  plataforma, para que la contabilidad cuadre.
                </div>
                {markRefunded.error && (
                  <p className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
                    {apiErrorMessage(markRefunded.error)}
                  </p>
                )}
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
                {markRefunded.error && (
                  <FieldError>{apiErrorMessage(markRefunded.error)}</FieldError>
                )}
                <Button className="self-end" onClick={handleRefund} loading={markRefunded.isPending}>
                  Marcar como reembolsada
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        )}

        <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
          <Button
            variant="secondary"
            onClick={async () => {
              await resendTickets.mutateAsync(undefined, {
                onSuccess: () => {
                  setResendSentAt(new Date().toISOString());
                  setResendNotice(true);
                },
              });
            }}
            loading={resendTickets.isPending}
            disabled={!canResend}
          >
            <RefreshCw className="h-4 w-4" /> Reenviar entradas
          </Button>
          <p className="text-xs text-[var(--color-text-muted)]">
            {canResend
              ? `${order.resends_today} de ${RESEND_LIMIT_PER_DAY} reenvíos usados hoy. Se envía siempre al email del comprador.`
              : "Solo se puede reenviar en ventas pagadas."}
          </p>
          {resendTickets.error && (
            <p className="text-sm text-[var(--color-danger)]">{apiErrorMessage(resendTickets.error)}</p>
          )}
        </div>
      </div>
    </>
  );
}