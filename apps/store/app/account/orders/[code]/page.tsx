"use client";

import { Badge, Button, Skeleton } from "@repo/ui";
import { useParams } from "next/navigation";

import { useMyOrder } from "@/features/account/hooks";
import { PUBLIC_API_URL } from "@/lib/env";
import { useSession } from "@/lib/session";

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

export default function AccountOrderDetailPage() {
  const { code } = useParams<{ code: string }>();
  const { data: order, isLoading } = useMyOrder(code);
  const { accessToken } = useSession();

  async function downloadPdf() {
    const res = await fetch(`${PUBLIC_API_URL}/api/me/orders/${code}/tickets.pdf`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `entradas-${code}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!order) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-xl font-semibold">{order.code}</h1>
        <Badge variant={STATUS_VARIANT[order.status ?? ""] ?? "neutral"}>
          {STATUS_LABEL[order.status ?? ""] ?? order.status}
        </Badge>
      </div>

      <ul className="flex flex-col gap-2">
        {order.items?.map((item, i) => (
          <li key={i} className="flex justify-between text-sm">
            <span>
              {item.quantity}× {item.ticket_type_name}
            </span>
            <span className="font-mono">S/ {item.subtotal}</span>
          </li>
        ))}
      </ul>

      <div className="flex justify-between border-t border-[var(--color-border-subtle)] pt-2 font-semibold">
        <span>Total</span>
        <span className="font-mono">S/ {order.total}</span>
      </div>

      {(order.status === "CANCELLED" || order.status === "REFUNDED") && (
        <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
          <span className="font-medium">
            Esta compra fue {order.status === "REFUNDED" ? "reembolsada" : "cancelada"}.
          </span>
          {order.void_reason && (
            <span className="text-[var(--color-text-muted)]">Motivo: {order.void_reason}</span>
          )}
          {order.refund_reference && (
            <span className="text-[var(--color-text-muted)]">
              Referencia del reembolso: {order.refund_reference}
            </span>
          )}
        </div>
      )}

      {order.status === "PAID" && (
        <Button variant="secondary" onClick={downloadPdf}>
          Descargar entradas en PDF
        </Button>
      )}
    </div>
  );
}
