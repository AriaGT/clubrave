"use client";

import { Badge, Button, ConfirmDialog, EmptyState, FieldError, Sheet, SheetContent, Skeleton, Switch } from "@repo/ui";
import { KeyRound, LogOut, Pencil, Trash2, Users } from "lucide-react";
import { useState } from "react";

import {
  type AdminUser,
  ROLE_LABELS,
  useDeleteAdminUser,
  useRevokeAdminUserSessions,
  useUpdateAdminUser,
} from "@/features/admin/hooks";
import { EditUserForm, ResetPasswordForm } from "@/features/admin/UserForms";
import { apiErrorMessage } from "@/features/events/hooks";

type Dialog =
  | { kind: "edit"; user: AdminUser }
  | { kind: "password"; user: AdminUser }
  | { kind: "revoke"; user: AdminUser }
  | { kind: "delete"; user: AdminUser };

/** Lista de usuarios con sus acciones. La usan la pantalla Usuarios y el detalle de una organización. */
export function UserList({
  users,
  loading,
  showOrganization = true,
}: {
  users: AdminUser[] | undefined;
  loading?: boolean;
  showOrganization?: boolean;
}) {
  const update = useUpdateAdminUser();
  const revoke = useRevokeAdminUserSessions();
  const remove = useDeleteAdminUser();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);

  if (loading) return <Skeleton className="h-24 w-full" />;
  if (!users?.length) {
    return <EmptyState icon={<Users className="h-10 w-10" />} title="Sin usuarios" description="No hay usuarios con estos filtros." />;
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {users.map((user) => (
          <li
            key={user.id}
            className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{user.full_name || user.email}</span>
                <span className="truncate text-sm text-[var(--color-text-muted)]">{user.email}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge variant="accent">{ROLE_LABELS[user.role] ?? user.role}</Badge>
                  {user.is_active ? <Badge variant="mint">Activo</Badge> : <Badge variant="danger">Inactivo</Badge>}
                  {showOrganization && (
                    <span className="text-xs text-[var(--color-text-subtle)]">{user.organization_name}</span>
                  )}
                </span>
                <span className="mt-1 text-xs text-[var(--color-text-subtle)]">
                  {user.role === "SECURITY"
                    ? user.all_events
                      ? "Todos los eventos"
                      : `Eventos: ${user.events.map((e) => e.title).join(", ")}`
                    : null}
                  {user.last_login
                    ? ` · Último acceso ${new Date(user.last_login).toLocaleDateString("es-PE", { dateStyle: "medium" })}`
                    : " · Nunca ingresó"}
                </span>
              </div>
              <Switch
                checked={user.is_active}
                disabled={update.isPending}
                aria-label={user.is_active ? "Desactivar" : "Reactivar"}
                onCheckedChange={(checked) => update.mutate({ id: user.id, body: { is_active: checked } })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "edit", user })}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "password", user })}>
                <KeyRound className="h-4 w-4" />
                Contraseña
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "revoke", user })}>
                <LogOut className="h-4 w-4" />
                Cerrar sesiones
              </Button>
              {user.role === "SECURITY" && (
                <Button size="sm" variant="danger" onClick={() => setDialog({ kind: "delete", user })}>
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {update.error && <FieldError>{apiErrorMessage(update.error)}</FieldError>}

      <Sheet open={dialog?.kind === "edit" || dialog?.kind === "password"} onOpenChange={(open) => !open && close()}>
        {dialog?.kind === "edit" && (
          <SheetContent title="Editar usuario">
            <EditUserForm user={dialog.user} onDone={close} />
          </SheetContent>
        )}
        {dialog?.kind === "password" && (
          <SheetContent title="Nueva contraseña">
            <ResetPasswordForm user={dialog.user} onDone={close} />
          </SheetContent>
        )}
      </Sheet>

      <ConfirmDialog
        open={dialog?.kind === "revoke"}
        onOpenChange={(open) => !open && close()}
        title="Cerrar sesiones"
        description={`Se cierran todas las sesiones abiertas de ${dialog?.user.email ?? ""}. Podrá volver a entrar con su contraseña.`}
        confirmLabel="Cerrar sesiones"
        loading={revoke.isPending}
        error={revoke.error ? apiErrorMessage(revoke.error) : undefined}
        onConfirm={() => dialog && revoke.mutate(dialog.user.id, { onSuccess: close })}
      />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => !open && close()}
        title="Eliminar portero"
        description={`Se borra la cuenta de ${dialog?.user.email ?? ""} y se cierran sus sesiones. Quién escaneó cada entrada sigue en la bitácora. Si solo quieres quitarle el acceso, desactívalo.`}
        destructive
        confirmLabel="Eliminar"
        loading={remove.isPending}
        error={remove.error ? apiErrorMessage(remove.error) : undefined}
        onConfirm={() => dialog && remove.mutate(dialog.user.id, { onSuccess: close })}
      />
    </>
  );
}
