"use client";

import { EmptyState, Skeleton, TopBar } from "@repo/ui";
import { QrCode } from "lucide-react";
import Link from "next/link";

import { useEvents } from "@/features/events/hooks";

export default function ScanEventSelectPage() {
  const { data, isLoading } = useEvents("PUBLISHED");

  return (
    <>
      <TopBar title="Escanear — elige el evento" />
      <div className="flex flex-col gap-3 p-[var(--space-4)]">
        {isLoading && <Skeleton className="h-16 w-full" />}
        {!isLoading && data?.results?.length === 0 && (
          <EmptyState
            icon={<QrCode className="h-10 w-10" />}
            title="No tienes eventos publicados"
            description="Publica un evento para poder escanear entradas en la puerta."
          />
        )}
        {data?.results?.map((event) => (
          <Link
            key={event.id}
            href={`/scan/${event.id}`}
            className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <div className="flex flex-col">
              <span className="font-medium">{event.title}</span>
              <span className="text-sm text-[var(--color-text-muted)]">
                {new Date(event.starts_at).toLocaleDateString("es-PE", { dateStyle: "medium" })}
              </span>
            </div>
            <QrCode className="h-5 w-5 text-[var(--color-accent)]" />
          </Link>
        ))}
      </div>
    </>
  );
}
