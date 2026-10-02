"use client";

import { useMutation } from "@tanstack/react-query";

import { PUBLIC_API_URL } from "@/lib/env";
import { useSession } from "@/lib/session";

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

/** Los endpoints de archivos exigen el header Authorization: no sirve un
 * `<a href>` plano, se bajan como blob. */
async function fetchFile(path: string, token: string | null, filename: string, type: string): Promise<File> {
  const response = await fetch(`${PUBLIC_API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error("No se pudo generar el archivo.");
  return new File([await response.blob()], filename, { type });
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * En el celular abre el menú nativo de compartir con el archivo adjunto
 * (WhatsApp, Telegram, correo…). En escritorio, o si el navegador no puede
 * compartir archivos, lo descarga para adjuntarlo a mano.
 */
async function shareOrDownload(file: File, text: string): Promise<ShareOutcome> {
  const data = { files: [file], text };
  if (typeof navigator !== "undefined" && navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  download(file);
  return "downloaded";
}

export function useTicketFiles() {
  const { accessToken } = useSession();

  const pdf = (code: string) =>
    fetchFile(`/api/org/orders/${code}/tickets.pdf`, accessToken, `entradas-${code}.pdf`, "application/pdf");
  const image = (ticketCode: string) =>
    fetchFile(`/api/org/tickets/${ticketCode}/image.png`, accessToken, `entrada-${ticketCode}.png`, "image/png");

  return {
    downloadPdf: useMutation({ mutationFn: async (code: string) => download(await pdf(code)) }),
    sharePdf: useMutation({
      mutationFn: async ({ code, text }: { code: string; text: string }) => shareOrDownload(await pdf(code), text),
    }),
    shareImage: useMutation({
      mutationFn: async ({ ticketCode, text }: { ticketCode: string; text: string }) =>
        shareOrDownload(await image(ticketCode), text),
    }),
  };
}
