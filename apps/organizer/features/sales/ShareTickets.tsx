"use client";

import { Button, FieldError, Input } from "@repo/ui";
import { Download, FileText, Image as ImageIcon, Mail, Share2 } from "lucide-react";
import { useState } from "react";

import { apiErrorMessage, useResendTickets } from "@/features/events/hooks";

import { type ShareOutcome, useTicketFiles } from "./share";

const RESEND_LIMIT_PER_DAY = 5;

interface ShareableTicket {
  id: string;
  code: string;
  status?: string;
  ticket_type_name: string;
}

export interface ShareTicketsProps {
  orderCode: string;
  eventTitle: string;
  buyerName: string;
  buyerEmail: string;
  resendsToday: number;
  tickets: ShareableTicket[];
}

function formatCode(code: string): string {
  return code.match(/.{1,4}/g)?.join(" ") ?? code;
}

function outcomeMessage(outcome: ShareOutcome | undefined, what: string): string | null {
  if (outcome === "shared") return `${what} compartido.`;
  if (outcome === "downloaded") return `${what} descargado: adjúntalo en WhatsApp u otro medio.`;
  return null;
}

/**
 * Las entradas de una venta pagada, listas para llegar al cliente por el
 * medio que sea: PDF con todas, imagen por entrada (formato vertical para
 * WhatsApp) o correo. Pensado para ventas manuales, pero sirve en cualquiera.
 */
export function ShareTickets({ orderCode, eventTitle, buyerName, buyerEmail, resendsToday, tickets }: ShareTicketsProps) {
  const files = useTicketFiles();
  const resend = useResendTickets(orderCode);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const valid = tickets.filter((t) => t.status !== "VOID");
  const text = `Tus entradas para ${eventTitle}. Muestra el QR en la puerta junto con tu documento.`;
  const fileError = files.sharePdf.error ?? files.downloadPdf.error ?? files.shareImage.error;

  async function sendEmail() {
    setEmailError(null);
    setNotice(null);
    if (!buyerEmail && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setEmailError("Escribe un email válido.");
      return;
    }
    await resend.mutateAsync(buyerEmail ? undefined : email.trim(), {
      onSuccess: () => setNotice(`Entradas enviadas a ${buyerEmail || email.trim()}.`),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm text-[var(--color-text-muted)]">
          {valid.length === 1 ? "La entrada" : `Las ${valid.length} entradas`} de {buyerName} en un PDF:
        </span>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            loading={files.sharePdf.isPending}
            onClick={() =>
              files.sharePdf.mutate(
                { code: orderCode, text },
                { onSuccess: (o) => setNotice(outcomeMessage(o, "PDF")) }
              )
            }
          >
            <Share2 className="h-4 w-4" /> Compartir
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={files.downloadPdf.isPending}
            onClick={() =>
              files.downloadPdf.mutate(orderCode, { onSuccess: () => setNotice("PDF descargado.") })
            }
          >
            <Download className="h-4 w-4" /> Descargar
          </Button>
        </div>
      </div>

      {valid.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-[var(--color-text-muted)]">O una imagen por entrada (ideal para WhatsApp):</span>
          {valid.map((t, index) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm">
                  Entrada {index + 1} · {t.ticket_type_name}
                </span>
                <span className="font-mono text-xs text-[var(--color-text-muted)]">{formatCode(t.code)}</span>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={files.shareImage.isPending && files.shareImage.variables?.ticketCode === t.code}
                disabled={files.shareImage.isPending}
                onClick={() =>
                  files.shareImage.mutate(
                    { ticketCode: t.code, text },
                    { onSuccess: (o) => setNotice(outcomeMessage(o, "Imagen")) }
                  )
                }
              >
                <ImageIcon className="h-4 w-4" /> Imagen
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-3">
        <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
          <Mail className="h-4 w-4" />
          {buyerEmail
            ? `Por correo a ${buyerEmail} · ${resendsToday} de ${RESEND_LIMIT_PER_DAY} envíos usados hoy`
            : "Esta venta no tiene correo. Si el cliente lo quiere por email, escríbelo:"}
        </span>
        <div className="flex gap-2">
          {!buyerEmail && (
            <Input
              type="email"
              placeholder="cliente@correo.com"
              value={email}
              invalid={!!emailError}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
          <Button
            type="button"
            variant="secondary"
            className={buyerEmail ? "w-full" : "shrink-0"}
            loading={resend.isPending}
            onClick={sendEmail}
          >
            <FileText className="h-4 w-4" /> {buyerEmail ? "Enviar por correo" : "Enviar"}
          </Button>
        </div>
        <FieldError>{emailError ?? (resend.error ? apiErrorMessage(resend.error) : undefined)}</FieldError>
      </div>

      {(notice || fileError) && (
        <p
          role="status"
          className={
            fileError && !notice
              ? "text-sm text-[var(--color-danger)]"
              : "rounded-[var(--radius-md)] border border-[var(--color-mint)]/40 bg-[var(--color-mint-soft)] p-3 text-sm"
          }
        >
          {notice ?? (fileError instanceof Error ? fileError.message : "No se pudo generar el archivo.")}
        </p>
      )}
    </div>
  );
}
