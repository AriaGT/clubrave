"use client";

import { Badge, Button, Card, CardContent } from "@repo/ui";
import { Check, Copy, X } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { useEvent, usePublishEvent } from "@/features/events/hooks";
import { PUBLIC_STORE_URL } from "@/lib/env";

export interface PublishStepProps {
  eventId: string;
}

export function PublishStep({ eventId }: PublishStepProps) {
  const { data: event } = useEvent(eventId);
  const publish = usePublishEvent(eventId);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const eventUrl = event ? `${PUBLIC_STORE_URL}/e/${event.slug}` : "";
  const isPublished = event?.status === "PUBLISHED";

  useEffect(() => {
    if (isPublished && eventUrl) {
      QRCode.toDataURL(eventUrl, { margin: 1, width: 240 }).then(setQrDataUrl);
    }
  }, [isPublished, eventUrl]);

  if (!event) return null;

  const missing: string[] = (publish.error as { details?: { errors?: string[] } } | undefined)?.details
    ?.errors ?? [];

  const checks = [
    { label: "Título", ok: !!event.title },
    { label: "Fecha futura", ok: new Date(event.starts_at).getTime() > Date.now() },
    { label: "Lugar", ok: !!event.venue_name },
    { label: "Al menos una imagen", ok: event.images.length > 0 },
    {
      label: "Al menos un tipo de entrada activo",
      ok: event.ticket_types.some((t) => t.is_active && t.quantity_total > 0),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">{event.title}</h3>
            <Badge variant={isPublished ? "mint" : "neutral"}>
              {isPublished ? "Publicado" : "Borrador"}
            </Badge>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            {new Date(event.starts_at).toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" })} ·{" "}
            {event.venue_name}
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            {event.ticket_types.length} tipo(s) de entrada · {event.images.length} imagen(es)
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h4 className="font-medium">Requisitos de publicación</h4>
        <ul className="flex flex-col gap-1.5">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-sm">
              {c.ok ? (
                <Check className="h-4 w-4 text-[var(--color-mint)]" />
              ) : (
                <X className="h-4 w-4 text-[var(--color-danger)]" />
              )}
              <span className={c.ok ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}>
                {c.label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {missing.length > 0 && (
        <p className="text-sm text-[var(--color-danger)]">{missing.join(" ")}</p>
      )}

      {!isPublished ? (
        <Button
          size="lg"
          loading={publish.isPending}
          disabled={!checks.every((c) => c.ok)}
          onClick={() => publish.mutate()}
        >
          Publicar evento
        </Button>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-6)] text-center">
          <p className="font-medium text-[var(--color-mint-text)]">¡Tu evento está en vivo!</p>
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR del enlace del evento" width={200} height={200} />
          )}
          <div className="flex items-center gap-2">
            <code className="rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)] px-2 py-1 text-sm">
              {eventUrl}
            </code>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(eventUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
