"use client";

import { Badge, EmptyState, Skeleton } from "@repo/ui";
import Link from "next/link";

import { useMyOrders } from "@/features/account/hooks";

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

export default function AccountOrdersPage() {
  const { data, isLoading } = useMyOrders();

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-xl font-semibold">Historial de compras</h1>
      {isLoading && <Skeleton className="h-20 w-full" />}
      {!isLoading && data?.results?.length === 0 && (
        <EmptyState title="Todavía no tienes compras" description="Cuando compres una entrada, aparecerá aquí." />
      )}
      {data?.results?.map((order) => (
        <Link
          key={order.code}
          href={`/account/orders/${order.code}`}
          className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-mono text-sm">{order.code}</span>
              <span className="text-sm text-[var(--color-text-muted)]">
                {new Date(order.created_at).toLocaleDateString("es-PE", { dateStyle: "medium" })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">S/ {order.total}</span>
              <Badge variant={STATUS_VARIANT[order.status ?? ""] ?? "neutral"}>
                {STATUS_LABEL[order.status ?? ""] ?? order.status}
              </Badge>
            </div>
          </div>
          {(order.status === "CANCELLED" || order.status === "REFUNDED") && order.void_reason && (
            <span className="text-sm text-[var(--color-text-muted)]">
              Motivo: {order.void_reason}
              {order.status === "REFUNDED" ? " · Reembolsada" : ""}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
