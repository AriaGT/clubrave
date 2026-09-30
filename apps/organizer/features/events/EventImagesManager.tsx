"use client";

import { ImageUploader } from "@repo/ui";
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

/** Galería de un evento con reordenamiento real (H03): mueve con las flechas,
 * marca portada y borra. El backend protege la última imagen si el evento está
 * publicado (LAST_IMAGE) — el mensaje se muestra aquí, no se oculta. */
export function EventImagesManager({ eventId }: EventImagesManagerProps) {
  const { data: event } = useEvent(eventId);
  const upload = useUploadEventImage(eventId);
  const remove = useDeleteEventImage(eventId);
  const setCover = useSetCoverImage(eventId);
  const reorder = useReorderEventImages(eventId);
  const [error, setError] = useState<string | null>(null);

  const images = event?.images ?? [];

  const handleMove = (id: string, direction: "left" | "right") => {
    if (!event) return;
    const current = [...event.images];
    const index = current.findIndex((img) => img.id === id);
    const target = direction === "left" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    reorder.mutate(current.map((img) => img.id), {
      onError: (err) => setError(apiErrorMessage(err)),
      onSuccess: () => setError(null),
    });
  };

  const handleRemove = (id: string) => {
    remove.mutate(id, {
      onError: (err) => setError(apiErrorMessage(err)),
      onSuccess: () => setError(null),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      <ImageUploader
        images={images.map((img) => ({ id: img.id, url: img.image, alt: img.alt, isCover: img.is_cover }))}
        onAdd={(files) =>
          files.forEach((file) =>
            upload.mutate(file, { onError: (err) => setError(apiErrorMessage(err)) })
          )
        }
        onRemove={handleRemove}
        onSetCover={(id) => setCover.mutate(id)}
        onMove={handleMove}
      />
    </div>
  );
}