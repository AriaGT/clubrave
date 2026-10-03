"use client";

import { Button, ConfirmDialog, Input, Label, Textarea, TopBar } from "@repo/ui";
import { CircleCheck, Mail, Send } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import {
  apiErrorMessage,
  useAnnounce,
  useChangeImpact,
  useEvent,
} from "@/features/events/hooks";

export default function AnnouncePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: event } = useEvent(id);
  const { data: impact } = useChangeImpact(id);
  const announce = useAnnounce(id);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [result, setResult] = useState<{ recipients: number } | null>(null);

  const canReview = subject.trim().length >= 1 && message.trim().length >= 1;

  async function handleSend() {
    const outcome = await announce.mutateAsync(
      { subject: subject.trim(), message: message.trim() },
      { onSuccess: (data) => setResult(data) }
    );
    return outcome;
  }

  if (!event) {
    return <TopBar title="Enviar comunicado" onBack={() => router.push(`/events/${id}`)} />;
  }

  return (
    <>
      <TopBar title="Enviar comunicado" subtitle={event.title} onBack={() => router.push(`/events/${id}`)} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-[var(--space-4)]">
        {result ? (
          <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
            <p className="flex items-center gap-2 font-medium">
              <CircleCheck className="h-5 w-5 text-[var(--color-mint-text)]" aria-hidden />
              Comunicado enviado a {result.recipients} {result.recipients === 1 ? "comprador" : "compradores"}.
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              <span className="font-medium">{subject}</span>
            </p>
            <p className="whitespace-pre-line text-sm text-[var(--color-text-muted)]">{message}</p>
            <Button className="mt-2 self-end" onClick={() => router.push(`/events/${id}`)}>
              Volver al evento
            </Button>
          </div>
        ) : (
          <>
            {announce.error && (
              <p className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
                {apiErrorMessage(announce.error)}
              </p>
            )}
            <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] text-sm">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-subtle)]" aria-hidden />
              <p className="text-[var(--color-text-muted)]">
                Llega por email a cada comprador con entradas pagadas
                {typeof impact?.distinct_buyers === "number" ? (
                  <>
                    {" "}
                    (<span className="font-medium text-[var(--color-text)]">{impact.distinct_buyers} ahora mismo</span>)
                  </>
                ) : null}
                . Úsalo para cambios de horario, de puerta u otros avisos importantes. Máximo 3 por día.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subject">Asunto</Label>
              <Input
                id="subject"
                value={subject}
                maxLength={120}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Cambio de puerta de acceso"
              />
              <span className="text-right text-xs text-[var(--color-text-muted)]">{subject.length}/120</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="message">Mensaje</Label>
              <Textarea
                id="message"
                value={message}
                maxLength={2000}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribe la información relevante para los compradores…"
                rows={8}
              />
              <span className="text-right text-xs text-[var(--color-text-muted)]">{message.length}/2000</span>
            </div>
            <Button className="self-end" onClick={() => setPreviewOpen(true)} disabled={!canReview}>
              <Send className="h-4 w-4" aria-hidden /> Revisar y enviar
            </Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title="¿Enviar este comunicado?"
        description={
          typeof impact?.distinct_buyers === "number"
            ? `Llega a ${impact.distinct_buyers} ${impact.distinct_buyers === 1 ? "comprador" : "compradores"} con entradas pagadas de este evento.`
            : "Llega a cada comprador con entradas pagadas de este evento."
        }
        impact={
          <div className="flex flex-col gap-1 text-left">
            <span className="font-medium">{subject}</span>
            <span className="whitespace-pre-line text-[var(--color-text-muted)]">{message}</span>
          </div>
        }
        confirmLabel="Enviar a compradores"
        loading={announce.isPending}
        error={announce.error ? apiErrorMessage(announce.error) : undefined}
        onConfirm={async () => {
          const outcome = await handleSend();
          if (outcome) setPreviewOpen(false);
        }}
      />
    </>
  );
}
