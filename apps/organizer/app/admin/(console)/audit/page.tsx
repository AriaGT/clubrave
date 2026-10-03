"use client";

import { ACTIVITY_ACTION_LABELS, ActivityItem, Button, EmptyState, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from "@repo/ui";
import { ScrollText } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/features/admin/AdminShell";
import { useAdminAudit, useOrganizations } from "@/features/admin/hooks";

const ALL = "all";

/** Acciones de plataforma y de la consola; el resto sale de `ACTIVITY_ACTION_LABELS`. */
const EXTRA_LABELS: Record<string, string> = {
  SITE_SETTINGS_UPDATED: "Sitio web actualizado",
  PAYMENT_SETTINGS_UPDATED: "Medios de pago actualizados",
  ORGANIZATION_CREATED: "Organización creada",
  ORGANIZATION_UPDATED: "Organización editada",
  ORGANIZATION_DEACTIVATED: "Organización desactivada",
  ORGANIZATION_REACTIVATED: "Organización reactivada",
  ORGANIZER_CREATED: "Organizador creado",
  ORGANIZER_UPDATED: "Organizador editado",
  ORGANIZER_DEACTIVATED: "Organizador desactivado",
  ORGANIZER_REACTIVATED: "Organizador reactivado",
  ORGANIZER_PASSWORD_RESET: "Contraseña de organizador cambiada",
  SESSIONS_REVOKED: "Sesiones cerradas",
  EMPLOYEE_CREATED: "Portero creado",
  EMPLOYEE_UPDATED: "Portero editado",
  EMPLOYEE_DEACTIVATED: "Portero desactivado",
  EMPLOYEE_REACTIVATED: "Portero reactivado",
  EMPLOYEE_PASSWORD_RESET: "Contraseña de portero cambiada",
  EMPLOYEE_DELETED: "Portero eliminado",
  TICKET_CHECKED_IN: "Ingreso validado por portero",
};

const ACTION_LABELS = { ...ACTIVITY_ACTION_LABELS, ...EXTRA_LABELS };

export default function AdminAuditPage() {
  const [organization, setOrganization] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const { data: orgs } = useOrganizations();
  const { data, isLoading } = useAdminAudit(
    {
      organization: organization === ALL ? undefined : organization,
      action: action === ALL ? undefined : action,
      date_from: dateFrom,
      date_to: dateTo,
    },
    page
  );

  // Cada filtro vuelve a la primera página.
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Bitácora" description="Todo lo que pasó en la plataforma, de todas las organizaciones." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={organization} onValueChange={filter(setOrganization)}>
          <SelectTrigger aria-label="Organización">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las organizaciones</SelectItem>
            <SelectItem value="platform">Plataforma</SelectItem>
            {orgs?.results.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={filter(setAction)}>
          <SelectTrigger aria-label="Acción">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las acciones</SelectItem>
            {Object.entries(ACTION_LABELS)
              .sort((a, b) => a[1].localeCompare(b[1], "es"))
              .map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <div className="flex flex-col gap-1">
          <Label htmlFor="audit-from" className="text-xs">Desde</Label>
          <Input id="audit-from" type="date" value={dateFrom} onChange={(e) => filter(setDateFrom)(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="audit-to" className="text-xs">Hasta</Label>
          <Input id="audit-to" type="date" value={dateTo} onChange={(e) => filter(setDateTo)(e.target.value)} />
        </div>
      </div>

      {isLoading && <Skeleton className="h-32 w-full" />}
      {data?.results.length === 0 && (
        <EmptyState icon={<ScrollText className="h-10 w-10" />} title="Sin registros" description="Ninguna acción coincide con los filtros." />
      )}
      <ul className="flex flex-col gap-2">
        {data?.results.map((entry) => (
          <ActivityItem
            key={entry.id}
            action={entry.action}
            actionLabel={ACTION_LABELS[entry.action]}
            createdAt={entry.created_at}
            actorEmail={entry.actor_email}
            targetLabel={[entry.organization_name, entry.target_label].filter(Boolean).join(" · ")}
            reason={entry.reason}
            metadata={entry.metadata as Record<string, unknown> | null}
          />
        ))}
      </ul>

      {data && (data.previous || data.next) && (
        <div className="mt-4 flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={!data.previous} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-[var(--color-text-muted)]">Página {page}</span>
          <Button variant="secondary" size="sm" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>
            Siguiente
          </Button>
        </div>
      )}
    </>
  );
}
