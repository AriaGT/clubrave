import type { components } from "./schema";

export type EventImageKind = components["schemas"]["KindEnum"];

/** Orden en que se presentan los tipos en el panel. */
export const EVENT_IMAGE_KINDS: readonly EventImageKind[] = ["FLYER", "ZONES", "MAP"];

interface KindedImage {
  kind?: EventImageKind;
  is_cover?: boolean;
}

/** Imágenes de un tipo. `kind` es opcional en el esquema (default FLYER). */
export function imagesOfKind<T extends KindedImage>(images: readonly T[], kind: EventImageKind): T[] {
  return images.filter((img) => (img.kind ?? "FLYER") === kind);
}

/** La imagen elegida de un tipo; si ninguna está marcada, la primera. */
export function selectedImageOfKind<T extends KindedImage>(
  images: readonly T[],
  kind: EventImageKind
): T | null {
  const ofKind = imagesOfKind(images, kind);
  return ofKind.find((img) => img.is_cover) ?? ofKind[0] ?? null;
}
