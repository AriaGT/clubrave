"use client";

import { Badge, Button, EmptyState, FieldError, FilterChips, Input, Label, Sheet, SheetContent, Skeleton } from "@repo/ui";
import { Building2, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/features/admin/AdminShell";
import { useCreateOrganization, useOrganizations } from "@/features/admin/hooks";
import { apiErrorMessage } from "@/features/events/hooks";

type Status = "true" | "false" | undefined;

export default function AdminOrganizationsPage() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Status>();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useOrganizations({ q, is_active: active === undefined ? undefined : active === "true" });

  return (
    <>
      <PageHeader
        title="Organizaciones"
        description="Cada organización agrupa a sus organizadores, porteros y eventos."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Nueva
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <Input placeholder="Buscar por nombre o email" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        <FilterChips<Status>
          aria-label="Estado"
          value={active}
          onChange={setActive}
          options={[
            { value: undefined, label: "Todas" },
            { value: "true", label: "Activas" },
            { value: "false", label: "Inactivas" },
          ]}
        />
      </div>

      {isLoading && <Skeleton className="h-24 w-full" />}
      {data?.results.length === 0 && (
        <EmptyState icon={<Building2 className="h-10 w-10" />} title="Sin organizaciones" description="Crea la primera para dar de alta a su organizador." />
      )}
      <ul className="flex flex-col gap-3">
        {data?.results.map((org) => (
          <li key={org.id}>
            <Link
              href={`/admin/organizations/${org.id}`}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{org.name}</span>
                <span className="truncate text-sm text-[var(--color-text-muted)]">{org.contact_email}</span>
                <span className="mt-1 text-xs text-[var(--color-text-subtle)]">
                  {org.organizers_count} organizadores · {org.porters_count} porteros · {org.events_count} eventos
                </span>
              </span>
              {org.is_active ? <Badge variant="mint">Activa</Badge> : <Badge variant="danger">Inactiva</Badge>}
            </Link>
          </li>
        ))}
      </ul>

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent title="Nueva organización">
          <CreateOrganizationForm onDone={() => setCreating(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}

function CreateOrganizationForm({ onDone }: { onDone: () => void }) {
  const create = useCreateOrganization();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({ name, contact_email: email }, { onSuccess: onDone });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-name">Nombre</Label>
        <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-email">Email de contacto</Label>
        <Input id="org-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      {create.error && <FieldError>{apiErrorMessage(create.error)}</FieldError>}
      <Button type="submit" loading={create.isPending}>
        Crear organización
      </Button>
    </form>
  );
}
