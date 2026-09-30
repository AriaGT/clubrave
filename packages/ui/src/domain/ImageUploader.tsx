import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from "lucide-react";
import * as React from "react";

import { IconButton } from "../base/IconButton";
import { Img } from "../base/Img";
import { Spinner } from "../base/Spinner";
import { cn } from "../lib/cn";

export interface UploaderImage {
  id: string;
  url: string;
  alt?: string;
  isCover?: boolean;
}

export interface ImageUploaderProps {
  images: UploaderImage[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onSetCover: (id: string) => void;
  onMove: (id: string, direction: "left" | "right") => void;
  /** Texto de la zona de arrastre. */
  dropLabel?: string;
  /** Etiqueta de la imagen elegida (p. ej. "Portada" o "Principal"). */
  selectedLabel?: string;
  /** Archivos en subida: se muestran como casillas "Subiendo…". */
  uploadingCount?: number;
  /** Imágenes con una acción en curso (borrar, marcar): se atenúan y bloquean. */
  busyIds?: readonly string[];
  /** Hay un reordenamiento en curso: las flechas se bloquean hasta que termine. */
  reordering?: boolean;
  className?: string;
}

/**
 * Zona de arrastre + cámara en móvil, miniaturas reordenables, marcar
 * portada. El reordenamiento usa flechas (accesible por teclado) en vez de
 * arrastrar-y-soltar puro, que es difícil de usar con una sola mano.
 */
export function ImageUploader({
  images,
  onAdd,
  onRemove,
  onSetCover,
  onMove,
  dropLabel = "Arrastra imágenes o toca para elegir",
  selectedLabel = "Portada",
  uploadingCount = 0,
  busyIds = [],
  reordering = false,
  className,
}: ImageUploaderProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onAdd(Array.from(files));
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border-2 border-dashed p-[var(--space-8)] text-center transition-colors duration-[var(--duration-fast)]",
          isDragOver
            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
            : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
        )}
      >
        <ImagePlus className="h-8 w-8 text-[var(--color-text-subtle)]" />
        <span className="font-medium">{dropLabel}</span>
        <span className="text-sm text-[var(--color-text-muted)]">JPG, PNG o WebP. Máximo 8 MB.</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {(images.length > 0 || uploadingCount > 0) && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy={uploadingCount > 0 || reordering || undefined}>
          {images.map((image, index) => {
            const busy = busyIds.includes(image.id);
            return (
              <li
                key={image.id}
                aria-busy={busy || undefined}
                className="relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]"
              >
                <Img src={image.url} alt={image.alt ?? ""} className="aspect-square w-full object-cover" />
                {busy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg)]/70">
                    <Spinner className="text-[var(--color-text)]" />
                  </div>
                )}
                {image.isCover && (
                  <span className="absolute left-1 top-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-white">
                    {selectedLabel}
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-[image:var(--gradient-scrim)] p-1">
                  <IconButton
                    label="Mover a la izquierda"
                    size="sm"
                    variant="ghost"
                    disabled={index === 0 || busy || reordering}
                    onClick={() => onMove(image.id, "left")}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={`Marcar como ${selectedLabel.toLowerCase()}`}
                    size="sm"
                    variant="ghost"
                    disabled={busy || image.isCover}
                    onClick={() => onSetCover(image.id)}
                  >
                    <Star className={cn("h-4 w-4", image.isCover && "fill-current")} />
                  </IconButton>
                  <IconButton label="Eliminar imagen" size="sm" variant="ghost" disabled={busy} onClick={() => onRemove(image.id)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label="Mover a la derecha"
                    size="sm"
                    variant="ghost"
                    disabled={index === images.length - 1 || busy || reordering}
                    onClick={() => onMove(image.id, "right")}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            );
          })}
          {Array.from({ length: uploadingCount }, (_, i) => (
            <li
              key={`uploading-${i}`}
              role="status"
              className="flex aspect-square animate-pulse flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] text-sm text-[var(--color-text-muted)]"
            >
              <Spinner />
              Subiendo…
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
