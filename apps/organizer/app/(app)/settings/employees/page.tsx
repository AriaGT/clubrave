"use client";

import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  FieldError,
  Input,
  Label,
  Sheet,
  SheetContent,
  Skeleton,
  Switch,
  TopBar,
} from "@repo/ui";
import { KeyRound, Pencil, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  type Employee,
  useCreateEmployee,
  useDeleteEmployee,
  useEmployees,
  useResetEmployeePassword,
  useUpdateEmployee,
} from "@/features/employees/hooks";
import { apiErrorMessage, useEvents } from "@/features/events/hooks";

type SheetState = { mode: "create" } | { mode: "edit"; employee: Employee } | { mode: "password"; employee: Employee };

export default function EmployeesPage() {
  const router = useRouter();
  const { data: employees, isLoading } = useEmployees();
  const update = useUpdateEmployee();
  const remove = useDeleteEmployee();
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toDelete, setToDelete] = useState<Employee | null>(null);

  return (
    <>
      <TopBar
        title="Empleados"
        onBack={() => router.push("/settings")}
        action={
          <Button size="sm" onClick={() => setSheet({ mode: "create" })}>
            <UserPlus className="h-4 w-4" />
            Nuevo
          </Button>
        }
      />
      <div className="flex flex-col gap-3 p-[var(--space-4)]">
        <p className="text-sm text-[var(--color-text-muted)]">
          El personal de <strong>Seguridad</strong> entra con su email y contraseña en este mismo panel y solo
          ve el escáner, habilitado desde unas horas antes del inicio hasta el fin de cada evento.
        </p>

        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && employees?.length === 0 && (
          <EmptyState
            icon={<ShieldCheck className="h-10 w-10" />}
            title="Aún no tienes empleados"
            description="Crea una cuenta de Seguridad para cada persona que escanea en la puerta."
            action={<Button onClick={() => setSheet({ mode: "create" })}>Crear empleado</Button>}
          />
        )}

        {employees?.map((employee) => (
          <div
            key={employee.id}
            className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{employee.full_name || employee.email}</span>
                <span className="truncate text-sm text-[var(--color-text-muted)]">{employee.email}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="accent">Seguridad</Badge>
                  {employee.is_active ? <Badge variant="mint">Activo</Badge> : <Badge variant="danger">Inactivo</Badge>}
                </span>
                <span className="mt-1 text-xs text-[var(--color-text-subtle)]">
                  {employee.all_events
                    ? "Todos los eventos"
                    : `Eventos: ${employee.events.map((e) => e.title).join(", ")}`}
                </span>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <span className="sr-only">Activo</span>
                <Switch
                  checked={employee.is_active}
                  disabled={update.isPending}
                  aria-label={employee.is_active ? "Desactivar" : "Reactivar"}
                  onCheckedChange={(checked) => update.mutate({ id: employee.id, body: { is_active: checked } })}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setSheet({ mode: "edit", employee })}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setSheet({ mode: "password", employee })}>
                <KeyRound className="h-4 w-4" />
                Contraseña
              </Button>
              <Button size="sm" variant="danger" onClick={() => setToDelete(employee)}>
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
            </div>
          </div>
        ))}
        {update.error && <FieldError>{apiErrorMessage(update.error)}</FieldError>}
      </div>

      <Sheet open={!!sheet} onOpenChange={(open) => !open && setSheet(null)}>
        {sheet?.mode === "create" && (
          <SheetContent title="Nuevo empleado de seguridad">
            <EmployeeForm onDone={() => setSheet(null)} />
          </SheetContent>
        )}
        {sheet?.mode === "edit" && (
          <SheetContent title="Editar empleado">
            <EmployeeForm employee={sheet.employee} onDone={() => setSheet(null)} />
          </SheetContent>
        )}
        {sheet?.mode === "password" && (
          <SheetContent title="Nueva contraseña">
            <PasswordForm employee={sheet.employee} onDone={() => setSheet(null)} />
          </SheetContent>
        )}
      </Sheet>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Eliminar empleado"
        description={`Se borra la cuenta de ${toDelete?.email ?? ""} y se cierran sus sesiones. Quién escaneó cada entrada sigue en la Actividad. Si solo quieres quitarle el acceso por un tiempo, desactívalo.`}
        destructive
        confirmLabel="Eliminar"
        loading={remove.isPending}
        error={remove.error ? apiErrorMessage(remove.error) : undefined}
        onConfirm={() =>
          toDelete && remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })
        }
      />
    </>
  );
}

function EmployeeForm({ employee, onDone }: { employee?: Employee; onDone: () => void }) {
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const { data: events } = useEvents("PUBLISHED");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [fullName, setFullName] = useState(employee?.full_name ?? "");
  const [password, setPassword] = useState("");
  const [allEvents, setAllEvents] = useState(employee?.all_events ?? true);
  const [eventIds, setEventIds] = useState<string[]>(employee?.events.map((e) => e.id) ?? []);
  const mutation = employee ? update : create;

  const toggleEvent = (id: string, checked: boolean) =>
    setEventIds((ids) => (checked ? [...ids, id] : ids.filter((x) => x !== id)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const scope = { all_events: allEvents, event_ids: allEvents ? [] : eventIds };
    if (employee) {
      update.mutate({ id: employee.id, body: { full_name: fullName, ...scope } }, { onSuccess: onDone });
    } else {
      create.mutate({ email, full_name: fullName, password, ...scope }, { onSuccess: onDone });
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="employee-name">Nombre</Label>
        <Input id="employee-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      {!employee && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="employee-email">Email (su usuario para entrar)</Label>
            <Input
              id="employee-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="employee-password">Contraseña inicial</Label>
            <Input
              id="employee-password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <span className="text-xs text-[var(--color-text-subtle)]">
              Mínimo 10 caracteres. Entrégasela en persona; puedes cambiarla cuando quieras.
            </span>
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="employee-all-events">Puede escanear todos los eventos</Label>
        <Switch id="employee-all-events" checked={allEvents} onCheckedChange={setAllEvents} />
      </div>
      {!allEvents && (
        <div className="flex flex-col gap-2">
          {events?.results?.length === 0 && (
            <span className="text-sm text-[var(--color-text-muted)]">No tienes eventos publicados.</span>
          )}
          {events?.results?.map((event) => (
            <label key={event.id} className="flex items-center gap-3 text-sm">
              <Checkbox
                checked={eventIds.includes(event.id)}
                onCheckedChange={(checked) => toggleEvent(event.id, checked === true)}
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

      {mutation.error && <FieldError>{apiErrorMessage(mutation.error)}</FieldError>}
      <Button type="submit" loading={mutation.isPending} disabled={!allEvents && eventIds.length === 0}>
        {employee ? "Guardar cambios" : "Crear empleado"}
      </Button>
    </form>
  );
}

function PasswordForm({ employee, onDone }: { employee: Employee; onDone: () => void }) {
  const reset = useResetEmployeePassword();
  const [password, setPassword] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        reset.mutate({ id: employee.id, password }, { onSuccess: onDone });
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-[var(--color-text-muted)]">
        Define una contraseña nueva para {employee.email}. Sus sesiones abiertas se cierran.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="employee-new-password">Contraseña nueva</Label>
        <Input
          id="employee-new-password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {reset.error && <FieldError>{apiErrorMessage(reset.error)}</FieldError>}
      <Button type="submit" loading={reset.isPending}>
        Cambiar contraseña
      </Button>
    </form>
  );
}
