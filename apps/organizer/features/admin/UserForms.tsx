"use client";

import {
  Button,
  Checkbox,
  FieldError,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@repo/ui";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

import {
  type AdminUser,
  type PanelRole,
  ROLE_LABELS,
  useCreateAdminUser,
  useOrganizationEvents,
  useOrganizations,
  useResetAdminUserPassword,
  useUpdateAdminUser,
} from "@/features/admin/hooks";
import { apiErrorMessage } from "@/features/events/hooks";

const NEW_ORG = "__new__";

/** Contraseña que el servidor generó: se muestra una sola vez. */
export function GeneratedPassword({ password, onDone }: { password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--color-text-muted)]">
        Cópiala y entrégala en persona. <strong>No se vuelve a mostrar.</strong>
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] p-3 font-mono text-sm">
          {password}
        </code>
        <Button
          variant="secondary"
          aria-label="Copiar contraseña"
          onClick={async () => {
            await navigator.clipboard?.writeText(password).catch(() => undefined);
            setCopied(true);
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <Button onClick={onDone}>Listo</Button>
    </div>
  );
}

function EventScope({
  organizationId,
  allEvents,
  setAllEvents,
  eventIds,
  setEventIds,
}: {
  organizationId: string | undefined;
  allEvents: boolean;
  setAllEvents: (v: boolean) => void;
  eventIds: string[];
  setEventIds: (ids: string[]) => void;
}) {
  const { data: events } = useOrganizationEvents(organizationId);
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="user-all-events">Puede escanear todos los eventos</Label>
        <Switch id="user-all-events" checked={allEvents} onCheckedChange={setAllEvents} />
      </div>
      {!allEvents && (
        <div className="flex flex-col gap-2">
          {events?.length === 0 && (
            <span className="text-sm text-[var(--color-text-muted)]">La organización no tiene eventos.</span>
          )}
          {events?.map((event) => (
            <label key={event.id} className="flex items-center gap-3 text-sm">
              <Checkbox
                aria-label={event.title}
                checked={eventIds.includes(event.id)}
                onCheckedChange={(checked) =>
                  setEventIds(checked === true ? [...eventIds, event.id] : eventIds.filter((x) => x !== event.id))
                }
              />
              <span>
                {event.title}{" "}
                <span className="text-[var(--color-text-muted)]">
                  · {new Date(event.starts_at).toLocaleDateString("es-PE", { dateStyle: "medium" })}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </>
  );
}

/** Alta de organizador o portero. `organizationId` fija la organización (desde su detalle). */
export function CreateUserForm({
  organizationId: fixedOrganization,
  initialRole = "SECURITY",
  onDone,
}: {
  organizationId?: string;
  initialRole?: PanelRole;
  onDone: () => void;
}) {
  const create = useCreateAdminUser();
  const { data: orgs } = useOrganizations({ is_active: true });
  const [role, setRole] = useState<PanelRole>(initialRole);
  const [organization, setOrganization] = useState<string>(fixedOrganization ?? "");
  const [newOrgName, setNewOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [allEvents, setAllEvents] = useState(true);
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [generated, setGenerated] = useState<string | null>(null);

  const creatingOrg = role === "OWNER" && organization === NEW_ORG;
  const existingOrg = organization && organization !== NEW_ORG ? organization : undefined;
  const missingOrg = creatingOrg ? !newOrgName.trim() : !existingOrg;
  const missingEvents = role === "SECURITY" && !allEvents && eventIds.length === 0;

  if (generated) return <GeneratedPassword password={generated} onDone={onDone} />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        role,
        email,
        full_name: fullName,
        password: password || undefined,
        organization_id: existingOrg,
        organization_name: creatingOrg ? newOrgName.trim() : undefined,
        ...(role === "SECURITY" ? { all_events: allEvents, event_ids: allEvents ? [] : eventIds } : {}),
      },
      {
        onSuccess: (user) => {
          if (user.initial_password) setGenerated(user.initial_password);
          else onDone();
        },
      }
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Rol</Label>
        <Select value={role} onValueChange={(v) => setRole(v as PanelRole)}>
          <SelectTrigger aria-label="Rol">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OWNER">{ROLE_LABELS.OWNER}</SelectItem>
            <SelectItem value="SECURITY">{ROLE_LABELS.SECURITY}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!fixedOrganization && (
        <div className="flex flex-col gap-1.5">
          <Label>Organización</Label>
          <Select value={organization} onValueChange={setOrganization}>
            <SelectTrigger aria-label="Organización">
              <SelectValue placeholder="Elige una organización" />
            </SelectTrigger>
            <SelectContent>
              {role === "OWNER" && <SelectItem value={NEW_ORG}>+ Organización nueva</SelectItem>}
              {orgs?.results.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {creatingOrg && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-org-name">Nombre de la organización nueva</Label>
          <Input id="user-org-name" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} required />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="user-name">Nombre</Label>
        <Input id="user-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="user-email">Email (su usuario para entrar)</Label>
        <Input
          id="user-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="user-password">Contraseña inicial (opcional)</Label>
        <Input
          id="user-password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <span className="text-xs text-[var(--color-text-subtle)]">
          Si la dejas vacía se genera una segura y se muestra una sola vez.
        </span>
      </div>

      {role === "SECURITY" && (
        <EventScope
          organizationId={existingOrg}
          allEvents={allEvents}
          setAllEvents={setAllEvents}
          eventIds={eventIds}
          setEventIds={setEventIds}
        />
      )}

      {create.error && <FieldError>{apiErrorMessage(create.error)}</FieldError>}
      <Button type="submit" loading={create.isPending} disabled={missingOrg || missingEvents}>
        Crear {role === "OWNER" ? "organizador" : "portero"}
      </Button>
    </form>
  );
}

export function EditUserForm({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const update = useUpdateAdminUser();
  const [fullName, setFullName] = useState(user.full_name);
  const [allEvents, setAllEvents] = useState(user.all_events);
  const [eventIds, setEventIds] = useState<string[]>(user.events.map((e) => e.id));
  const porter = user.role === "SECURITY";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate(
          {
            id: user.id,
            body: { full_name: fullName, ...(porter ? { all_events: allEvents, event_ids: allEvents ? [] : eventIds } : {}) },
          },
          { onSuccess: onDone }
        );
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-[var(--color-text-muted)]">
        {user.email} · {user.organization_name}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-name">Nombre</Label>
        <Input id="edit-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      {porter && (
        <EventScope
          organizationId={user.organization_id}
          allEvents={allEvents}
          setAllEvents={setAllEvents}
          eventIds={eventIds}
          setEventIds={setEventIds}
        />
      )}
      {update.error && <FieldError>{apiErrorMessage(update.error)}</FieldError>}
      <Button type="submit" loading={update.isPending} disabled={porter && !allEvents && eventIds.length === 0}>
        Guardar cambios
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const reset = useResetAdminUserPassword();
  const [password, setPassword] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);

  if (generated) return <GeneratedPassword password={generated} onDone={onDone} />;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        reset.mutate(
          { id: user.id, password },
          {
            onSuccess: (res) => {
              if (res?.password) setGenerated(res.password);
              else onDone();
            },
          }
        );
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-[var(--color-text-muted)]">
        Contraseña nueva para {user.email}. Sus sesiones abiertas se cierran.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reset-password">Contraseña nueva (opcional)</Label>
        <Input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <span className="text-xs text-[var(--color-text-subtle)]">Vacía: se genera una y se muestra una sola vez.</span>
      </div>
      {reset.error && <FieldError>{apiErrorMessage(reset.error)}</FieldError>}
      <Button type="submit" loading={reset.isPending}>
        Cambiar contraseña
      </Button>
    </form>
  );
}
