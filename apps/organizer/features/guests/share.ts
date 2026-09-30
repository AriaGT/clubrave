import { PUBLIC_STORE_URL } from "@/lib/env";

/** Bloques de 4 para dictarlo o copiarlo sin errores: `K7M3-QPXR-2ND4`. */
export function formatGuestCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

/** Enlace directo al evento en la tienda con el código precargado. */
export function guestCodeLink(eventSlug: string, code: string): string {
  return `${PUBLIC_STORE_URL}/e/${eventSlug}?codigo=${encodeURIComponent(code)}`;
}

export interface ShareableCode {
  code: string;
  ticket_type_name: string;
}

export function singleShareText(eventTitle: string, eventSlug: string, guest: ShareableCode): string {
  return [
    `Tienes una invitación para ${eventTitle} (${guest.ticket_type_name}).`,
    `Código: ${formatGuestCode(guest.code)}`,
    `Canjéala aquí: ${guestCodeLink(eventSlug, guest.code)}`,
  ].join("\n");
}

export function batchShareText(eventTitle: string, eventSlug: string, codes: ShareableCode[]): string {
  const lines = codes.map(
    (g) => `${formatGuestCode(g.code)} · ${g.ticket_type_name} · ${guestCodeLink(eventSlug, g.code)}`
  );
  return [`Invitaciones para ${eventTitle} (${codes.length}):`, ...lines].join("\n");
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Web Share API donde exista (móvil: WhatsApp, Instagram, etc.); si no, o si
 * la persona cancela el diálogo, copia al portapapeles. Devuelve qué pasó para
 * que la interfaz pueda avisarlo.
 */
export async function shareOrCopy(
  title: string,
  text: string
): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  return (await copyText(text)) ? "copied" : "failed";
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const csv = rows.map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
