"use client";

import { ActivityItem, EmptyState, Skeleton, TopBar } from "@repo/ui";
import { History } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import type { AuditLog } from "@/features/events/hooks";
import { useEvent, useEventAudit } from "@/features/events/hooks";

export default function EventActivityPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useEventAudit(id);
  const { data: event } = useEvent(id);

  const entries: AuditLog[] = data?.results ?? [];

  return (
    <>
      <TopBar title="Historial de cambios" subtitle={event?.title} onBack={() => router.push(`/events/${id}`)} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-[var(--space-4)]">
        {isLoading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {!isLoading && entries.length === 0 && (
          <EmptyState
            icon={<History className="h-8 w-8" />}
            title="Todavía no hay cambios"
            description="Cada cambio de este evento (quién, qué y cuándo) quedará registrado aquí."
          />
        )}
        <ol className="flex flex-col gap-2">
          {entries.map((entry) => (
            <ActivityItem
              key={entry.id}
              action={entry.action}
              createdAt={entry.created_at}
              actorEmail={entry.actor_email}
              targetLabel={entry.target_label}
              reason={entry.reason}
              metadata={entry.metadata as Record<string, unknown> | null}
            />
          ))}
        </ol>
      </div>
    </>
  );
}
