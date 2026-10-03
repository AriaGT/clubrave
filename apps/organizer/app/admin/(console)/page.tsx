"use client";

import { Badge, Card, CardContent, Skeleton, StatTile } from "@repo/ui";
import { AlertTriangle, CircleAlert } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/features/admin/AdminShell";
import { useAdminOverview } from "@/features/admin/hooks";
import { apiErrorMessage } from "@/features/events/hooks";

const MODE_LABELS: Record<string, string> = {
  live: "Pasarelas reales",
  fake: "Simulador",
  disabled: "Cobros deshabilitados",
};

export default function AdminOverviewPage() {
  const { data, isLoading, error } = useAdminOverview();

  return (
    <>
      <PageHeader title="Resumen" description="Estado de la plataforma de un vistazo." />
      {isLoading && <Skeleton className="h-40 w-full" />}
      {error && <p className="text-sm text-[var(--color-danger)]">{apiErrorMessage(error)}</p>}
      {data && (
        <div className="flex flex-col gap-5">
          {data.alerts.length > 0 && (
            <div className="flex flex-col gap-2" role="list" aria-label="Alertas">
              {data.alerts.map((alert) => (
                <Link
                  key={alert.code + alert.message}
                  href="/admin/payments"
                  role="listitem"
                  className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm"
                >
                  {alert.severity === "error" ? (
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning,#d97706)]" />
                  )}
                  {alert.message}
                </Link>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile
              label="Organizaciones"
              value={data.organizations.active}
              hint={data.organizations.inactive ? `${data.organizations.inactive} inactivas` : undefined}
            />
            <StatTile label="Organizadores" value={data.organizers} />
            <StatTile label="Porteros" value={data.porters} />
            <StatTile label="Eventos en 30 días" value={data.upcoming_events} />
          </div>

          <Card>
            <CardContent className="flex flex-col gap-3 pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">Cobros</span>
                <Badge variant={data.payments.mode === "live" ? "mint" : "accent"}>
                  {MODE_LABELS[data.payments.mode] ?? data.payments.mode}
                </Badge>
              </div>
              {data.payments.gateways.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">Ninguna pasarela activa.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {data.payments.gateways.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-3">
                      <span className="capitalize">{g.id}</span>
                      <span className="text-[var(--color-text-muted)]">
                        {g.environment === "test" ? "Pruebas" : "Producción"} ·{" "}
                        {g.verified ? "verificada" : "sin verificar"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
