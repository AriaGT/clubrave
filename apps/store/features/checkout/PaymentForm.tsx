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
 * Sin credenciales reales de Izipay no se pudo probar contra el entorno de
 * pruebas del proveedor (ver docs/izipay-activacion.md); la integración
 * sigue el pseudocódigo de §8.5 del plan al pie de la letra. Cuando lleguen
 * las credenciales, este es el único archivo que debería necesitar ajustes
 * si el SDK real difiere en algún detalle menor.
 */
export function PaymentForm({ session, onSubmitted, onError }: PaymentFormProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${session.js_url}"]`);

    function configureForm() {
      if (cancelled || !window.KR) return;
      containerRef.current?.setAttribute("kr-form-token", session.form_token);
      window.KR.setFormConfig({ formToken: session.form_token, fields: fieldStyleConfig() })
        .then(() => {
          if (cancelled) return;
          setStatus("ready");
          window.KR?.onSubmit((response) => {
            onSubmitted(response as Record<string, unknown>);
            return false; // evita la redirección por defecto del SDK
          });
        })
        .catch(() => {
          if (!cancelled) {
            setStatus("error");
            onError?.("No se pudo iniciar el formulario de pago.");
          }
        });
    }

    // El SDK no trae estilos propios: Izipay los sirve como "tema" (CSS + JS)
    // en la carpeta /ext/ de la misma versión. Sin ellos el formulario sale
    // como HTML crudo. Si el tema no carga, el pago sigue funcionando.
    const themeBase = session.js_url.replace(/\/[^/]+\/[^/]+$/, "/ext/");
    function loadTheme(done: () => void) {
      if (!document.querySelector(`link[href="${themeBase}classic.css"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = `${themeBase}classic.css`;
        document.head.appendChild(link);
      }
      if (document.querySelector(`script[src="${themeBase}classic.js"]`)) {
        done();
        return;
      }
      const themeScript = document.createElement("script");
      themeScript.src = `${themeBase}classic.js`;
      themeScript.onload = done;
      themeScript.onerror = done;
      document.body.appendChild(themeScript);
    }

    if (existing) {
      // En React Strict Mode (dev) el efecto corre dos veces: la segunda
      // encuentra el script ya insertado pero quizá aún sin cargar.
      if (window.KR) loadTheme(configureForm);
      else existing.addEventListener("load", () => loadTheme(configureForm), { once: true });
    } else {
      const script = document.createElement("script");
      script.src = session.js_url;
      script.setAttribute("kr-public-key", session.public_key);
      script.onload = () => loadTheme(configureForm);
      script.onerror = () => {
        if (!cancelled) {
          setStatus("error");
          onError?.("No se pudo cargar el formulario de pago.");
        }
      };
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.form_token, session.js_url, session.public_key]);

  return (
    <div className="flex flex-col gap-3">
      {status === "loading" && (
        <LoadingState label="Cargando el formulario de pago…" className="py-8" />
      )}
      {status === "error" && (
        <p className="text-sm text-[var(--color-danger)]">
          No se pudo cargar el formulario de pago. Intenta de nuevo en unos segundos.
        </p>
      )}
      <div ref={containerRef} className="kr-embedded" />
    </div>
  );
}
