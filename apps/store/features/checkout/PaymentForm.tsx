"use client";

import { cn, LoadingState } from "@repo/ui";
import { useEffect, useRef, useState } from "react";

import type { StoredPaymentSession } from "./payment-session-storage";

declare global {
  interface Window {
    KR?: {
      setFormConfig: (config: { formToken: string; "kr-language"?: string }) => Promise<unknown>;
      onSubmit: (callback: (response: unknown) => boolean | void) => void;
      onFormReady: (callback: () => void) => void;
      onError?: (callback: (error: unknown) => void) => void;
    };
  }
}

/** Hoja de estilos única; resuelve también si falla (el pago no depende del tema). */
function loadStylesheet(href: string): Promise<void> {
  return new Promise((resolve) => {
    let link = document.querySelector<HTMLLinkElement>(`link[href="${href}"]`);
    if (link?.dataset.loaded === "true") return resolve();
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }
    const el = link;
    el.addEventListener("load", () => ((el.dataset.loaded = "true"), resolve()), { once: true });
    el.addEventListener("error", () => resolve(), { once: true });
  });
}

/** Script único: si ya está en el DOM (Strict Mode, navegación previa) no se
 *  vuelve a insertar, solo se espera a que termine de cargar. */
function loadScript(src: string, attrs: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (script?.dataset.loaded === "true") return resolve();
    if (!script) {
      script = document.createElement("script");
      script.src = src;
      for (const [name, value] of Object.entries(attrs)) script.setAttribute(name, value);
      document.head.appendChild(script);
    }
    const el = script;
    el.addEventListener("load", () => ((el.dataset.loaded = "true"), resolve()), { once: true });
    el.addEventListener("error", () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
  });
}

/** Si `onFormReady` no llega (versión del SDK, red lenta), se muestra igual. */
const READY_FALLBACK_MS = 8000;
/** `onFormReady` llega justo antes de que los iframes pinten su placeholder. */
const READY_PAINT_GRACE_MS = 400;

export interface PaymentFormProps {
  session: StoredPaymentSession;
  onSubmitted: (rawResponse: Record<string, unknown>) => void;
  onError?: (message: string) => void;
}

/**
 * Formulario incrustado real de Izipay (Krypton). Nunca decide si el pago
 * fue válido ni conoce ningún secreto — solo reenvía la respuesta cruda al
 * backend, que es quien verifica la firma (§8.5, §11.6: el script de la
 * pasarela solo se carga aquí, nunca antes).
 *
 * Se muestra con el tema oficial de Izipay, sin estilos de la tienda: va
 * dentro de `ProviderPanel`, que le da el fondo claro para el que está hecho.
 * Pintar los campos con los colores de la tienda los rompía (los iframes no
 * siempre tomaban la configuración y quedaban blancos sobre cajas oscuras).
 *
 * Probado contra el entorno de pruebas y producción de Izipay (ver
 * docs/izipay-activacion.md).
 */
export function PaymentForm({ session, onSubmitted, onError }: PaymentFormProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const markReady = () => {
      if (!cancelled) setStatus("ready");
    };

    // Tema oficial de Izipay: `classic-reset.css` (aísla el formulario de los
    // estilos de la página) + `classic.js`, en el orden de su documentación:
    // SDK primero y luego el tema. La hoja se descarga en paralelo, pero el
    // formulario no se configura hasta que llegó: si se arma antes, sale con
    // estilos rotos la primera visita.
    const themeBase = session.js_url.replace(/\/[^/]+\/[^/]+$/, "/ext/");

    async function boot() {
      const themeCss = loadStylesheet(`${themeBase}classic-reset.css`);
      await loadScript(session.js_url, { "kr-public-key": session.public_key });
      await Promise.all([themeCss, loadScript(`${themeBase}classic.js`).catch(() => undefined)]);
      if (cancelled || !window.KR) return;

      // El formulario queda oculto hasta que sus iframes están listos, para
      // no mostrar nunca campos a medio estilar.
      window.KR.onFormReady(() => {
        fallback = setTimeout(markReady, READY_PAINT_GRACE_MS);
      });
      containerRef.current?.setAttribute("kr-form-token", session.form_token);
      await window.KR.setFormConfig({ formToken: session.form_token });
      if (cancelled) return;
      setTimeout(markReady, READY_FALLBACK_MS);
      window.KR.onSubmit((response) => {
        onSubmitted(response as Record<string, unknown>);
        return false; // evita la redirección por defecto del SDK
      });
    }

    boot().catch(() => {
      if (!cancelled) {
        setStatus("error");
        onError?.("No se pudo cargar el formulario de pago.");
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.form_token, session.js_url, session.public_key]);

  return (
    <div className="relative flex flex-col gap-3">
      {status === "loading" && (
        <LoadingState label="Cargando el formulario de pago…" className="py-8 text-[#6b7280]" />
      )}
      {status === "error" && (
        <p className="text-sm text-[#b91c1c]">
          No se pudo cargar el formulario de pago. Intenta de nuevo en unos segundos.
        </p>
      )}
      {/* Krypton añade sus propias clases a `.kr-embedded`: React no debe
          tocar su className, por eso la visibilidad va en el envoltorio.
          Mientras carga queda superpuesto e invisible (no display:none, para
          que los iframes se midan con el ancho real) y no empuja el loader.
          El tema oficial tiene ancho fijo: se centra en el panel. */}
      <div
        className={cn(
          "flex justify-center",
          status !== "ready" && "pointer-events-none absolute inset-x-0 top-0 opacity-0"
        )}
        aria-hidden={status !== "ready"}
      >
        <div ref={containerRef} className="kr-embedded" />
      </div>
    </div>
  );
}
