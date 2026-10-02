"use client";

import { imagesOfKind } from "@repo/api-client";
import { Button, cn } from "@repo/ui";
import { Check, ChevronRight, Rocket } from "lucide-react";
import Link from "next/link";

import { apiErrorMessage, usePublishEvent } from "@/features/events/hooks";

import type { OrganizerEvent } from "./types";

interface Step {
  key: string;
  label: string;
  done: boolean;
  href: string;
}

/**
 * Lo que falta para publicar un borrador, con acceso directo a cada paso.
 * Refleja `Event.publish_requirements_errors` del backend, que es quien manda.
 */
export function PublishChecklist({ event }: { event: OrganizerEvent }) {
  const publish = usePublishEvent(event.id);
  const base = `/events/${event.id}`;

  const steps: Step[] = [
    {
      key: "info",
      label: "Fecha futura y lugar",
      done: !!event.venue_name && new Date(event.starts_at).getTime() > Date.now(),
      href: `${base}/edit`,
    },
    {
      key: "tickets",
      label: "Al menos un tipo de entrada activo",
      done: event.ticket_types.some((t) => t.is_active !== false && t.quantity_total > 0),
      href: `${base}/tickets`,
    },
    {
      key: "flyer",
      label: "Flyer del evento",
      done: imagesOfKind(event.images, "FLYER").length > 0,
      href: `${base}/images`,
    },
  ];
  const ready = steps.every((s) => s.done);
  const pending = steps.filter((s) => !s.done).length;

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-[var(--space-4)]">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-base font-semibold">
          {ready ? "Todo listo para publicar" : "Completa tu evento para publicarlo"}
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          {ready
            ? "Al publicarlo aparece en la tienda y se abre la venta."
            : `Te ${pending === 1 ? "falta 1 paso" : `faltan ${pending} pasos`}. Mientras sea borrador nadie lo ve.`}
        </p>
      </div>

      <ol className="flex flex-col gap-1">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className="flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 text-sm transition-colors hover:bg-[var(--color-surface)]"
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  step.done
                    ? "border-[var(--color-mint)] bg-[var(--color-mint)] text-[var(--color-bg)]"
                    : "border-[var(--color-border-strong)]"
                )}
              >
                {step.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className={cn("flex-1", step.done && "text-[var(--color-text-muted)] line-through")}>
                {step.label}
              </span>
              {!step.done && <ChevronRight className="h-4 w-4 text-[var(--color-text-subtle)]" aria-hidden />}
            </Link>
          </li>
        ))}
      </ol>

      <Button className="w-full" disabled={!ready} loading={publish.isPending} onClick={() => publish.mutate()}>
        <Rocket className="h-4 w-4" aria-hidden /> Publicar evento
      </Button>
      {publish.error && <p className="text-sm text-[var(--color-danger)]">{apiErrorMessage(publish.error)}</p>}
    </section>
  );
}
