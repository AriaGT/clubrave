"use client";

import { TopBar } from "@repo/ui";
import { useParams, useRouter } from "next/navigation";

import { EventImagesManager } from "@/features/events/EventImagesManager";

export default function EventImagesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <>
      <TopBar title="Imágenes" onBack={() => router.push(`/events/${id}`)} />
      <div className="flex flex-col gap-4 p-[var(--space-4)]">
        <EventImagesManager eventId={id} />
        <p className="text-sm text-[var(--color-text-muted)]">
          Mueve las imágenes con las flechas para ordenarlas y marca con la estrella la que se muestra.
          Un evento publicado siempre conserva al menos un flyer.
        </p>
      </div>
    </>
  );
}