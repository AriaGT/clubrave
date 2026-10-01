"use client";

import { selectedImageOfKind } from "@repo/api-client";
import { Badge, Card, ImagePreviewCard, Img, buttonVariants, cn } from "@repo/ui";
import { CalendarDays, MapPin, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { type PointerEvent, useRef } from "react";

import { Countdown } from "./Countdown";
import { longDate, priceLabel, timeLabel } from "./format";
import type { EventDetail, EventListItem } from "./types";
import { useParallax } from "./useParallax";

/**
 * Portada cuando hay un solo evento: todo el primer pantallazo es de él. El
 * fondo (el flyer desenfocado) se mueve más lento que el scroll y el póster se
 * inclina siguiendo al puntero; ambos efectos se apagan con
 * `prefers-reduced-motion`.
 */
export function FeaturedEvent({ event, detail }: { event: EventListItem; detail: EventDetail | null }) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLAnchorElement>(null);
  useParallax(backdropRef, 0.35);

  const price = priceLabel(event.price_from, event.currency);
  const paymentsDisabled = detail?.payments_disabled === true;
  const salesPaused = detail?.sales_paused === true || paymentsDisabled;
  const zones = detail ? selectedImageOfKind(detail.images, "ZONES") : null;
  const tickets = detail?.ticket_types ?? [];

  const onPointerMove = (e: PointerEvent<HTMLAnchorElement>) => {
    const el = posterRef.current;
    if (!el || e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg)`;
  };
  const resetTilt = () => {
    if (posterRef.current) posterRef.current.style.transform = "";
  };

  return (
    <>
      <section className="relative isolate overflow-hidden">
        <div
          ref={backdropRef}
          aria-hidden="true"
          className="absolute -inset-[15%] -z-10 [transform:translate3d(0,var(--parallax,0px),0)]"
        >
          {event.cover_image && (
            <Img src={event.cover_image} alt="" className="h-full w-full object-cover opacity-55 blur-3xl" />
          )}
        </div>
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[image:var(--gradient-scrim-hero)]" />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_left,rgba(124,58,237,0.35),transparent_55%)]"
        />

        <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-[var(--container-max)] items-center gap-10 px-[var(--space-6)] py-12 md:grid-cols-[1.15fr_0.85fr]">
          <div className="order-2 flex flex-col items-center gap-5 text-center md:order-1 md:items-start md:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                Próximo evento
              </span>
              {salesPaused ? (
                <Badge variant="warning">{paymentsDisabled ? "Compras no disponibles" : "Venta pausada"}</Badge>
              ) : (
                <Badge variant="mint">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-mint)]" />
                  Venta abierta
                </Badge>
              )}
            </div>

            <h1 className="font-display text-5xl font-extrabold leading-[0.92] tracking-tight text-white sm:text-6xl lg:text-7xl">
              {event.title}
            </h1>
            <p className="text-lg first-letter:uppercase text-[var(--color-text-muted)]">
              {longDate(event.starts_at)} · {timeLabel(event.starts_at)}
              <br />
              {event.venue_name}
              {event.city ? `, ${event.city}` : ""}
            </p>

            <Countdown target={event.starts_at} />

            <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <Link
                href={`/e/${event.slug}#entradas`}
                className={cn(buttonVariants({ size: "lg" }), "shadow-[var(--glow-accent)]")}
              >
                Comprar entradas
              </Link>
              <Link href={`/e/${event.slug}`} className={buttonVariants({ variant: "secondary", size: "lg" })}>
                Ver detalles
              </Link>
            </div>
            {price && <p className="font-medium">{price}</p>}
          </div>

          <div className="order-1 flex justify-center md:order-2">
            <Link
              ref={posterRef}
              href={`/e/${event.slug}`}
              onPointerMove={onPointerMove}
              onPointerLeave={resetTilt}
              className="relative aspect-[4/5] w-[min(68vw,300px)] overflow-hidden rounded-[var(--radius-xl)] border border-white/10 shadow-[var(--glow-accent)] transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] md:w-full md:max-w-[400px]"
            >
              {event.cover_image ? (
                <Img src={event.cover_image} alt={`Flyer de ${event.title}`} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-[var(--color-surface-sunken)]" />
              )}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-[var(--container-max)] flex-col gap-10 px-[var(--space-6)] py-12">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: CalendarDays, label: "Fecha", value: `${longDate(event.starts_at)}, ${timeLabel(event.starts_at)}` },
            { icon: MapPin, label: "Lugar", value: [event.venue_name, event.city].filter(Boolean).join(", ") },
            { icon: ShieldCheck, label: "Edad mínima", value: `+${event.min_age} años` },
          ].map(({ icon: Icon, label, value }) => (
            <Card key={label} className="flex items-start gap-3 p-[var(--space-4)]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]">
                <Icon className="h-5 w-5" />
              </span>
              <span className="flex flex-col">
                <span className="text-xs uppercase tracking-wide text-[var(--color-text-subtle)]">{label}</span>
                <span className="font-medium first-letter:uppercase">{value}</span>
              </span>
            </Card>
          ))}
        </div>

        <div className="grid gap-10 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-2xl font-bold">Entradas</h2>
            {tickets.length === 0 ? (
              <p className="text-[var(--color-text-muted)]">Pronto anunciaremos las entradas.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--color-border-subtle)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
                {tickets.map((tt) => (
                  <li key={tt.id} className="flex items-center justify-between gap-4 p-[var(--space-4)]">
                    <span className="flex flex-col">
                      <span className="font-medium">{tt.name}</span>
                      {tt.description && (
                        <span className="text-sm text-[var(--color-text-muted)]">{tt.description}</span>
                      )}
                    </span>
                    {tt.available > 0 ? (
                      <span className="font-mono font-semibold">S/ {Number(tt.price).toFixed(2)}</span>
                    ) : (
                      <Badge variant="danger">Agotado</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/e/${event.slug}#entradas`} className={cn(buttonVariants(), "w-fit")}>
              Elegir entradas
            </Link>
          </div>

          <div className="flex flex-col gap-4">
            {detail?.description && (
              <>
                <h2 className="font-display text-2xl font-bold">Sobre el evento</h2>
                <p className="line-clamp-[10] whitespace-pre-line text-[var(--color-text-muted)]">
                  {detail.description}
                </p>
              </>
            )}
            {zones && (
              <ImagePreviewCard src={zones.image} alt={zones.alt || `Zonas de ${event.title}`} title="Zonas" />
            )}
          </div>
        </div>
      </section>
    </>
  );
}
