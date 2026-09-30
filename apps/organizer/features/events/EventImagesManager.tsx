"use client";

import { EVENT_IMAGE_KINDS, type EventImageKind, imagesOfKind } from "@repo/api-client";
import { Badge, ImageUploader } from "@repo/ui";
import { useState } from "react";

import {
  apiErrorMessage,
  useDeleteEventImage,
  useEvent,
  useReorderEventImages,
  useSetCoverImage,
  useUploadEventImage,
} from "@/features/events/hooks";

export interface EventImagesManagerProps {
  eventId: string;
}

const KIND_COPY: Record<
  EventImageKind,
  { title: string; description: string; selectedLabel: string; dropLabel: string; required: boolean }
> = {
  FLYER: {
    title: "Flyer",
    description: "Portada del evento en la tienda y al compartir el enlace. La marcada como portada es la que se ve.",
    selectedLabel: "Portada",
    dropLabel: "Arrastra el flyer o toca para elegir",
    required: true,
  },
  ZONES: {
    title: "Zonas",
    description: "Plano del local con las zonas de cada entrada. Se muestra junto a las entradas.",
    selectedLabel: "Principal",
    dropLabel: "Arrastra el plano de zonas o toca para elegir",
    required: false,
  },
  MAP: {
    title: "Mapa de ubicación",
    description: "Cómo llegar al local. Se muestra en la sección Lugar, junto a la dirección.",
    selectedLabel: "Principal",
    dropLabel: "Arrastra el mapa o toca para elegir",
    required: false,
  },
};

/** Imágenes de un evento por tipo — flyer, zonas y mapa (H03). En cada tipo
 * se pueden subir varias, ordenarlas con las flechas y elegir la que se
 * muestra. El backend protege el último flyer si el evento está publicado
 * (LAST_IMAGE) — el mensaje se muestra aquí, no se oculta. */
export function EventImagesManager({ eventId }: EventImagesManagerProps) {
  const { data: event } = useEvent(eventId);
  const upload = useUploadEventImage(eventId);
  const remove = useDeleteEventImage(eventId);
  const setCover = useSetCoverImage(eventId);
  const reorder = useReorderEventImages(eventId);
  const [error, setError] = useState<string | null>(null);
  // Subidas en curso por tipo y las imágenes con una acción pendiente: cada
  // sección muestra casillas "Subiendo…" y bloquea lo que ya se está tocando.
  const [uploading, setUploading] = useState<Record<EventImageKind, number>>({ FLYER: 0, ZONES: 0, MAP: 0 });
  const [busyIds, setBusyIds] = useState<string[]>([]);

  const images = event?.images ?? [];

  const markBusy = (id: string, busy: boolean) =>
    setBusyIds((ids) => (busy ? [...ids, id] : ids.filter((x) => x !== id)));

  const handleUpload = (kind: EventImageKind, files: File[]) => {
    setUploading((u) => ({ ...u, [kind]: u[kind] + files.length }));
    files.forEach((file) =>
      upload.mutate(
        { file, kind },
        {
          onError: (err) => setError(apiErrorMessage(err)),
          onSettled: () => setUploading((u) => ({ ...u, [kind]: Math.max(0, u[kind] - 1) })),
        }
      )
    );
  };

  const handleSetCover = (id: string) => {
    markBusy(id, true);
    setCover.mutate(id, {
      onError: (err) => setError(apiErrorMessage(err)),
      onSettled: () => markBusy(id, false),
    });
  };

  // El orden en el backend es uno solo para todo el evento: se intercambia la
  // imagen con su vecina del mismo tipo y se envía la lista completa.
  const handleMove = (kind: EventImageKind, id: string, direction: "left" | "right") => {
    if (!event || reorder.isPending) return;
    const current = [...event.images];
    const sameKind = imagesOfKind(current, kind);
    const kindIndex = sameKind.findIndex((img) => img.id === id);
    const neighbor = sameKind[direction === "left" ? kindIndex - 1 : kindIndex + 1];
    if (kindIndex < 0 || !neighbor) return;
    const a = current.findIndex((img) => img.id === id);
    const b = current.findIndex((img) => img.id === neighbor.id);
    [current[a], current[b]] = [current[b], current[a]];
    reorder.mutate(current.map((img) => img.id), {
      onError: (err) => setError(apiErrorMessage(err)),
      onSuccess: () => setError(null),
    });
  };

  const handleRemove = (id: string) => {
    markBusy(id, true);
    remove.mutate(id, {
      onError: (err) => setError(apiErrorMessage(err)),
      onSuccess: () => setError(null),
      onSettled: () => markBusy(id, false),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      {EVENT_IMAGE_KINDS.map((kind) => {
        const copy = KIND_COPY[kind];
        const ofKind = imagesOfKind(images, kind);
        return (
          <section key={kind} className="flex flex-col gap-3" aria-labelledby={`images-${kind}`}>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h3 id={`images-${kind}`} className="font-display text-lg font-semibold">
                  {copy.title}
                </h3>
                <Badge variant={copy.required ? "accent" : "neutral"}>
                  {copy.required ? "Obligatorio" : "Opcional"}
                </Badge>
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">{copy.description}</p>
            </div>
            <ImageUploader
              images={ofKind.map((img) => ({ id: img.id, url: img.image, alt: img.alt, isCover: img.is_cover }))}
              onAdd={(files) => handleUpload(kind, files)}
              onRemove={handleRemove}
              onSetCover={handleSetCover}
              onMove={(id, direction) => handleMove(kind, id, direction)}
              dropLabel={copy.dropLabel}
              selectedLabel={copy.selectedLabel}
              uploadingCount={uploading[kind]}
              busyIds={busyIds}
              reordering={reorder.isPending}
            />
          </section>
        );
      })}
    </div>
  );
}
