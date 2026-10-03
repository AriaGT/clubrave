"use client";

import { Badge, Button, Card, CardContent, ConfirmDialog, FieldError, Input, Label, Sheet, SheetContent, Skeleton } from "@repo/ui";
import { ArrowLeft, UserPlus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PageHeader } from "@/features/admin/AdminShell";
import { type PanelRole, useAdminUsers, useOrganization, useUpdateOrganization } from "@/features/admin/hooks";
import { CreateUserForm } from "@/features/admin/UserForms";
import { UserList } from "@/features/admin/UserList";
import { apiErrorMessage } from "@/features/events/hooks";

export default function AdminOrganizationPage() {
  const { id } = useParams<{ id: string }>();
  const { data: org, isLoading } = useOrganization(id);
  const update = useUpdateOrganization(id);
  const users = useAdminUsers({ organization: id });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [zone, setZone] = useState("");
  const [saved, setSaved] = useState(false);
  const [adding, setAdding] = useState<PanelRole | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (org) {
      setName(org.name);
      setEmail(org.contact_email);
      setZone(org.timezone);
    }
  }, [org]);

  if (isLoading || !org) return <Skeleton className="h-40 w-full" />;

  const dirty = name !== org.name || email !== org.contact_email || zone !== org.timezone;

  return (
    <>
      <Link href="/admin/organizations" className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)]">
        <ArrowLeft className="h-4 w-4" />
        Organizaciones
      </Link>
      <PageHeader
        title={org.name}
        action={org.is_active ? <Badge variant="mint">Activa</Badge> : <Badge variant="danger">Inactiva</Badge>}
      />

      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="pt-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSaved(false);
                update.mutate({ name, contact_email: email, timezone: zone }, { onSuccess: () => setSaved(true) });
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="org-zone">Zona horaria</Label>
                <Input id="org-zone" value={zone} onChange={(e) => setZone(e.target.value)} required />
              </div>
              {update.error && <FieldError>{apiErrorMessage(update.error)}</FieldError>}
              <div className="flex items-center gap-3">
                <Button type="submit" loading={update.isPending} disabled={!dirty}>
                  Guardar cambios
                </Button>
                {saved && !dirty && <span className="text-sm text-[var(--color-text-muted)]">Guardado.</span>}
              </div>
            </form>
          </CardContent>
        </Card>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">Usuarios</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAdding("OWNER")}>
                <UserPlus className="h-4 w-4" />
                Organizador
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAdding("SECURITY")}>
                <UserPlus className="h-4 w-4" />
                Portero
              </Button>
            </div>
          </div>
          <UserList users={users.data?.results} loading={users.isLoading} showOrganization={false} />
        </section>

        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="flex flex-col">
              <span className="font-medium">{org.is_active ? "Desactivar organización" : "Reactivar organización"}</span>
              <span className="text-sm text-[var(--color-text-muted)]">
                {org.is_active
                  ? "Sus organizadores y porteros quedan fuera de inmediato y se cierran sus sesiones."
                  : "Sus usuarios podrán volver a entrar."}
              </span>
            </div>
            <Button variant={org.is_active ? "danger" : "secondary"} onClick={() => setToggling(true)}>
              {org.is_active ? "Desactivar" : "Reactivar"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Sheet open={!!adding} onOpenChange={(open) => !open && setAdding(null)}>
        <SheetContent title={adding === "OWNER" ? "Nuevo organizador" : "Nuevo portero"}>
          {adding && <CreateUserForm organizationId={id} initialRole={adding} onDone={() => setAdding(null)} />}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={toggling}
        onOpenChange={setToggling}
        title={org.is_active ? "Desactivar organización" : "Reactivar organización"}
        description={
          org.is_active
            ? `${org.name} deja de poder operar el panel y se cierran las sesiones de todos sus usuarios. Sus eventos y ventas no se tocan.`
            : `${org.name} vuelve a estar activa.`
        }
        destructive={org.is_active}
        confirmLabel={org.is_active ? "Desactivar" : "Reactivar"}
        loading={update.isPending}
        error={update.error ? apiErrorMessage(update.error) : undefined}
        onConfirm={() => update.mutate({ is_active: !org.is_active }, { onSuccess: () => setToggling(false) })}
      />
    </>
  );
}
