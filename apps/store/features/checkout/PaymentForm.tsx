"use client";

import { LoadingState } from "@repo/ui";
import { useEffect, useRef, useState } from "react";

import type { StoredPaymentSession } from "./payment-session-storage";

declare global {
  interface Window {
    KR?: {
      setFormConfig: (config: {
        formToken: string;
        "kr-language"?: string;
        fields?: { all: Record<"default" | "error", FieldStyle> };
      }) => Promise<unknown>;
      onSubmit: (callback: (response: unknown) => boolean | void) => void;
      onFormReady: (callback: () => void) => void;
      onError?: (callback: (error: unknown) => void) => void;
    };
  }
}

interface FieldStyle {
  backgroundColor: string;
  color: string;
  iconColor: string;
}

/**
 * Tarjeta, fecha y CVV son iframes de otro origen: el CSS de la tienda no
 * los alcanza, solo se estilan con la configuración del SDK. Los valores
 * salen de los tokens del design system (`var()` no sirve dentro del iframe,
 * hay que pasar colores ya resueltos).
 */
function fieldStyleConfig() {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const text = token("--color-text", "#f4f4f5");
  const bg = token("--color-surface-sunken", "#141419");
  const muted = token("--color-text-muted", "#a1a1ab");
  const danger = token("--color-danger", "#f43f5e");
  return {
    all: {
      default: { backgroundColor: bg, color: text, iconColor: muted },
      error: { backgroundColor: bg, color: danger, iconColor: danger },
    },
  };
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

    // Orden oficial de Izipay: SDK primero y luego el tema (`classic.js`).
    // La hoja del tema se descarga en paralelo, pero el formulario no se
    // configura hasta que llegó: si se arma antes, sale con estilos rotos
    // la primera visita (la segunda viene de caché y por eso sí se ve bien).
    const themeBase = session.js_url.replace(/\/[^/]+\/[^/]+$/, "/ext/");

    async function boot() {
      const themeCss = loadStylesheet(`${themeBase}classic.css`);
      await loadScript(session.js_url, { "kr-public-key": session.public_key });
      await Promise.all([themeCss, loadScript(`${themeBase}classic.js`).catch(() => undefined)]);
      if (cancelled || !window.KR) return;

      // El formulario queda oculto hasta que sus iframes están listos, para
      // no mostrar nunca campos a medio estilar.
      window.KR.onFormReady(() => {
        fallback = setTimeout(markReady, READY_PAINT_GRACE_MS);
      });
      containerRef.current?.setAttribute("kr-form-token", session.form_token);
      await window.KR.setFormConfig({ formToken: session.form_token, fields: fieldStyleConfig() });
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
        <LoadingState label="Cargando el formulario de pago…" className="py-8" />
      )}
      {status === "error" && (
        <p className="text-sm text-[var(--color-danger)]">
          No se pudo cargar el formulario de pago. Intenta de nuevo en unos segundos.
        </p>
      )}
      {/* Krypton añade sus propias clases a `.kr-embedded`: React no debe
          tocar su className, por eso la visibilidad va en el envoltorio.
          Mientras carga queda superpuesto e invisible (no display:none, para
          que los iframes se midan con el ancho real) y no empuja el loader. */}
      <div
        className={status === "ready" ? undefined : "pointer-events-none absolute inset-x-0 top-0 opacity-0"}
        aria-hidden={status !== "ready"}
      >
        <div ref={containerRef} className="kr-embedded" />
      </div>
    </div>
  );
}
