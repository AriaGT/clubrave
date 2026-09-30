import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

export interface ImageLightboxProps {
  src: string;
  alt: string;
  /** Nombre accesible del diálogo; también se muestra como encabezado. */
  title: string;
  /** El disparador (se usa con `asChild`: debe ser un elemento interactivo). */
  children: React.ReactNode;
}

/**
 * Imagen a pantalla completa sin recorte. Planos de zonas y mapas llevan
 * texto pequeño: en móvil se leen con el zoom nativo del navegador, por eso
 * la imagen se muestra entera (`object-contain`) y no dentro de una hoja.
 * Tocar fuera de la imagen la cierra.
 */
export function ImageLightbox({ src, alt, title, children }: ImageLightboxProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>{children}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/90" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col focus:outline-none"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex items-center justify-between gap-3 p-[var(--space-4)]">
            <DialogPrimitive.Title className="font-display text-lg font-semibold text-white">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Cerrar"
              className="rounded-[var(--radius-full)] p-2 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div
            className="flex min-h-0 flex-1 items-center justify-center p-[var(--space-4)] pt-0"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="max-h-full max-w-full rounded-[var(--radius-md)] object-contain" />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
