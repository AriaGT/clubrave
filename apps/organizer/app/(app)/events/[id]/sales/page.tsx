"use client";

import { Badge, Button, EmptyState, Input, Skeleton, TopBar } from "@repo/ui";
import { Download, Search } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useDownloadOrdersCsv, useEventOrders } from "@/features/events/hooks";

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

const TABS: { label: string; status?: string }[] = [
  { label: "Todas" },
  { label: "Pagadas", status: "PAID" },
  { label: "Pendientes", status: "PENDING" },
  { label: "Anuladas", status: "CANCELLED,REFUNDED" },
];

function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function EventSalesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const { data, isLoading } = useEventOrders(id, { status: tab, q: q || undefined });
  const downloadCsv = useDownloadOrdersCsv(id);

  return (
    <>
      <TopBar
        title="Ventas"
        onBack={() => router.push(`/events/${id}`)}
        action={
          <Button size="sm" variant="secondary" loading={downloadCsv.isPending} onClick={() => downloadCsv.mutate()}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        }
      />
      <div className="flex flex-col gap-3 p-[var(--space-4)]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <Input
            className="pl-9"
            placeholder="Buscar por email, código o nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.label}
              onClick={() => setTab(t.status)}
              className={
                "rounded-[var(--radius-full)] px-3 py-1.5 text-sm font-medium transition-colors " +
                (tab === t.status
                  ? "bg-[var(--color-accent)] text-white"
                  : "border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {typeof data?.count === "number" && data.count > 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">
            {data.count} {data.count === 1 ? "venta" : "ventas"}
          </p>
        )}

        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && data?.results?.length === 0 && (
          <EmptyState
            title="No se encontraron ventas"
            description={q || tab ? "Prueba con otra búsqueda o filtro." : "Las compras aparecerán aquí en cuanto entren."}
          />
        )}
        {data?.results?.map((order) => (
          <button
            key={order.code}
            onClick={() => router.push(`/events/${id}/sales/${order.code}`)}
            className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-left transition-colors hover:bg-[var(--color-surface)]"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-mono text-sm">{order.code}</span>
              <span className="truncate text-sm text-[var(--color-text-muted)]">
                {order.buyer_name || order.buyer_email}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">{formatDate(order.created_at)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {order.is_guest ? (
                <Badge variant="accent">Invitado</Badge>
              ) : (
                <span className="font-mono text-sm">S/ {order.total}</span>
              )}
              <Badge variant={STATUS_VARIANT[order.status ?? ""] ?? "neutral"}>
                {STATUS_LABEL[order.status ?? ""] ?? order.status}
              </Badge>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}