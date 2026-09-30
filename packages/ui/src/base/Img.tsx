"use client";

import { ImageOff } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/cn";

export interface ImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  /** Qué mostrar si la imagen no carga. Por defecto, un ícono neutro. */
  fallback?: React.ReactNode;
}

/**
 * `<img>` con estado de carga: mientras llega, el mismo recuadro late como un
 * Skeleton; al cargar entra con un fundido; si falla, muestra un reemplazo en
 * vez del ícono roto del navegador. Las clases de tamaño y posición se aplican
 * igual en los tres estados, así el layout no salta.
 *
 * Una imagen ya en caché puede terminar de cargar antes de que React conecte
 * `onLoad` (render en servidor): por eso también se revisa `complete` al montar.
 */
export const Img = React.forwardRef<HTMLImageElement, ImgProps>(
  ({ className, fallback, onLoad, onError, alt = "", src, ...props }, forwardedRef) => {
    const [state, setState] = React.useState<"loading" | "loaded" | "error">("loading");
    const [prevSrc, setPrevSrc] = React.useState(src);
    if (src !== prevSrc) {
      setPrevSrc(src);
      setState("loading");
    }

    const ref = React.useCallback(
      (node: HTMLImageElement | null) => {
        if (node?.complete) setState(node.naturalWidth > 0 ? "loaded" : "error");
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef]
    );

    if (state === "error") {
      return (
        <div
          role="img"
          aria-label={alt || undefined}
          className={cn(
            "flex items-center justify-center bg-[var(--color-surface-sunken)] text-[var(--color-text-subtle)]",
            className
          )}
        >
          {fallback ?? <ImageOff className="h-6 w-6" aria-hidden />}
        </div>
      );
    }

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={ref}
        src={src}
        alt={alt}
        aria-busy={state === "loading" || undefined}
        className={cn(
          className,
          state === "loading" && "animate-pulse bg-[var(--color-surface)]",
          state === "loaded" && "animate-[fade-in_var(--duration-slow)_var(--ease-out)]"
        )}
        onLoad={(e) => {
          setState("loaded");
          onLoad?.(e);
        }}
        onError={(e) => {
          setState("error");
          onError?.(e);
        }}
        {...props}
      />
    );
  }
);
Img.displayName = "Img";
