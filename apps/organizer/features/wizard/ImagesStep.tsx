"use client";

import { imagesOfKind } from "@repo/api-client";
import { Button, EmptyState } from "@repo/ui";

import { useEvent } from "@/features/events/hooks";
import { EventImagesManager } from "@/features/events/EventImagesManager";

export interface ImagesStepProps {
  eventId: string;
  onNext: () => void;
}

export function ImagesStep({ eventId, onNext }: ImagesStepProps) {
  const { data: event } = useEvent(eventId);

  const flyers = imagesOfKind(event?.images ?? [], "FLYER");

  if (!event) {
    return <EmptyState title="Guarda primero la información general" description="Necesitamos el evento creado para poder subir imágenes." />;
  }

  return (
    <div className="flex flex-col gap-5">
      <EventImagesManager eventId={eventId} />
      <Button onClick={onNext} disabled={flyers.length === 0} className="self-end">
        Continuar
      </Button>
    </div>
  );
}
