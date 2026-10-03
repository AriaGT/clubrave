"use client";

import { TopBar } from "@repo/ui";
import { useParams, useRouter } from "next/navigation";

import { EventImagesManager } from "@/features/events/EventImagesManager";
import { useEvent } from "@/features/events/hooks";

export default function EventImagesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: event } = useEvent(id);

  return (
    <>
      <TopBar title="Imágenes" subtitle={event?.title} onBack={() => router.push(`/events/${id}`)} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-[var(--space-4)]">
        <EventImagesManager eventId={id} />
        <p className="text-sm text-[var(--color-text-muted)]">
          Mueve las imágenes con las flechas para ordenarlas y marca con la estrella la que se muestra.
          Un evento publicado siempre conserva al menos un flyer.
        </p>
      </div>
    </>
  );
}