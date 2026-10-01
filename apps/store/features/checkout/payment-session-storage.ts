"use client";

export interface StoredPaymentSession {
  gateway: string;
  form_token: string;
  public_key: string;
  js_url: string;
  /** Checkout Pro de Mercado Pago: a dónde redirigir. Vacío en las pasarelas
   *  de formulario incrustado. */
  checkout_url: string;
}

const KEY_PREFIX = "umbral.payment_session.";

/**
 * La sesión de pago (form_token, clave pública, URL del script) solo viene
 * en la respuesta de `POST /checkout/orders/`. La pantalla de pago vive en
 * otra ruta, así que se guarda en `sessionStorage` —por pestaña, nunca en
 * el carrito persistente— para que sobreviva la navegación entre ambas.
 */
export function savePaymentSession(orderCode: string, session: StoredPaymentSession) {
  try {
    sessionStorage.setItem(KEY_PREFIX + orderCode, JSON.stringify(session));
  } catch {
    // sessionStorage puede fallar en privado/incógnito: el formulario
    // incrustado simplemente no tendrá form_token y se mostrará el aviso.
  }
}

export function loadPaymentSession(orderCode: string): StoredPaymentSession | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + orderCode);
    return raw ? (JSON.parse(raw) as StoredPaymentSession) : null;
  } catch {
    return null;
  }
}
