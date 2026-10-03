"use client";

import { Badge, Button, EmptyState, Skeleton, TopBar, useAsyncAction } from "@repo/ui";
import { ChevronRight, Clock, LogOut, QrCode, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { type DoorEvent, formatWhen, scannerClosedMessage, useDoorEvents } from "@/features/checkin/door";
import { useSession } from "@/lib/session";

export default function ScanEventSelectPage() {
  const { role, logout } = useSession();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useDoorEvents();
  const isSecurity = role === "security";
  const signOut = useAsyncAction(async () => {
    await logout();
    router.replace("/login");
  });

  return (
    <>
      <TopBar
        title={isSecurity ? "Escáner de puerta" : "Escanear — elige el evento"}
        action={
          isSecurity ? (
            <Button variant="ghost" size="sm" loading={signOut.pending} onClick={() => signOut.run()}>
              <LogOut className="h-4 w-4" />
              Salir
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-3 p-[var(--space-4)]">
        {isSecurity && (
          <p className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <ShieldCheck className="h-4 w-4 text-[var(--color-accent)]" />
            Sesión de portero · elige el evento de hoy para empezar a escanear.
          </p>
        )}
        {isLoading && (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        )}
        {isError && (
          <EmptyState
            icon={<QrCode className="h-10 w-10" />}
            title="No se pudo cargar la lista"
            description="Revisa tu conexión e inténtalo de nuevo."
            action={<Button onClick={() => refetch()}>Reintentar</Button>}
          />
        )}
        {!isLoading && !isError && data?.length === 0 && (
          <EmptyState
            icon={<QrCode className="h-10 w-10" />}
            title={isSecurity ? "No tienes eventos asignados" : "No tienes eventos publicados"}
            description={
              isSecurity
                ? "Cuando el organizador te asigne a un evento aparecerá aquí."
                : "Publica un evento para poder escanear entradas en la puerta."
            }
          />
        )}
        {data?.map((event) => (
          <DoorEventCard key={event.id} event={event} restricted={isSecurity} />
        ))}
      </div>
    </>
  );
}

function DoorEventCard({ event, restricted }: { event: DoorEvent; restricted: boolean }) {
  const open = event.scanner_is_open;
  const body = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-lg font-semibold">{event.title}</span>
        <span className="text-sm text-[var(--color-text-muted)]">
          {formatWhen(event.starts_at)}
          {event.venue_name ? ` · ${event.venue_name}` : ""}
        </span>
        {restricted &&
          (open ? (
            <Badge variant="mint" className="self-start">
              Escáner abierto
            </Badge>
          ) : (
            <span className="flex items-center gap-1 text-sm text-[var(--color-warning)]">
              <Clock className="h-4 w-4" />
              {scannerClosedMessage(event)}
            </span>
          ))}
        {!restricted && event.checked_in_count > 0 && (
          <span className="text-sm text-[var(--color-text-muted)]">{event.checked_in_count} ingresados</span>
        )}
      </div>
      {open ? (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-[var(--color-accent)] text-white">
          <QrCode className="h-6 w-6" />
        </span>
      ) : (
        <ChevronRight className="h-5 w-5 text-[var(--color-text-subtle)]" />
      )}
    </>
  );

  const className =
    "flex min-h-24 items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)]";

  if (!open) {
    // Portero fuera de horario: la tarjeta informa pero no abre el escáner.
    return (
      <div className={`${className} opacity-80`} aria-disabled>
        {body}
      </div>
    );
  }
  return (
    <Link
      href={`/scan/${event.id}`}
      className={`${className} transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-hover)] active:scale-[0.99]`}
    >
      {body}
    </Link>
  );
}
