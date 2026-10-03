"use client";

import { Button, FilterChips, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, SheetContent } from "@repo/ui";
import { UserPlus } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/features/admin/AdminShell";
import { type PanelRole, useAdminUsers, useOrganizations } from "@/features/admin/hooks";
import { CreateUserForm } from "@/features/admin/UserForms";
import { UserList } from "@/features/admin/UserList";

const ALL = "all";

export default function AdminUsersPage() {
  const [role, setRole] = useState<PanelRole | undefined>();
  const [organization, setOrganization] = useState(ALL);
  const [active, setActive] = useState<"true" | "false" | undefined>();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const { data: orgs } = useOrganizations();
  const users = useAdminUsers({
    role,
    organization: organization === ALL ? undefined : organization,
    is_active: active === undefined ? undefined : active === "true",
    q,
  });

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Organizadores y porteros de todas las organizaciones."
        action={
          <Button onClick={() => setCreating(true)}>
            <UserPlus className="h-4 w-4" />
            Nuevo usuario
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Buscar por nombre, email u organización" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={organization} onValueChange={setOrganization}>
            <SelectTrigger aria-label="Organización">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las organizaciones</SelectItem>
              {orgs?.results.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <FilterChips<PanelRole | undefined>
          aria-label="Rol"
          value={role}
          onChange={setRole}
          options={[
            { value: undefined, label: "Todos" },
            { value: "OWNER", label: "Organizadores" },
            { value: "SECURITY", label: "Porteros" },
          ]}
        />
        <FilterChips<"true" | "false" | undefined>
          aria-label="Estado"
          value={active}
          onChange={setActive}
          options={[
            { value: undefined, label: "Cualquier estado" },
            { value: "true", label: "Activos" },
            { value: "false", label: "Inactivos" },
          ]}
        />
      </div>
      <UserList users={users.data?.results} loading={users.isLoading} />
      {users.data && users.data.count > users.data.results.length && (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Mostrando {users.data.results.length} de {users.data.count}. Afina los filtros para ver el resto.
        </p>
      )}

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent title="Nuevo usuario">
          <CreateUserForm onDone={() => setCreating(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
