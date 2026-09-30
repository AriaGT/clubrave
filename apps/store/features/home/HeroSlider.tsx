"use client";

import { IconButton, Img, buttonVariants, cn } from "@repo/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { dayNumber, longDate, monthShort, priceLabel, timeLabel } from "./format";
import type { EventListItem } from "./types";

const AUTOPLAY_MS = 6000;

/**
 * Carrusel de portada para cuando hay varios eventos. Se desliza con el dedo
 * (scroll-snap nativo), con flechas o con los puntos; avanza solo cada 6 s y
 * se detiene al pasar el mouse, al enfocar con teclado, al tocarlo o si el
 * usuario pidió menos movimiento.
 */
export function HeroSlider({ events }: { events: EventListItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  // Destino de un desplazamiento hecho por código (flechas, puntos, autoavance):
  // mientras llega, `onScroll` no toca `active` para que el punto no parpadee.
  const scrollingTo = useRef<number | null>(null);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track) return;
      const target = (index + events.length) % events.length;
      setActive(target); // no esperar al evento `scroll`: el punto responde al instante
      scrollingTo.current = target;
      track.scrollTo({ left: target * track.clientWidth, behavior: reducedMotion ? "auto" : "smooth" });
    },
    [events.length, reducedMotion]
  );

  useEffect(() => {
    if (paused || reducedMotion || events.length < 2) return;
    const id = window.setTimeout(() => goTo(active + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [active, paused, reducedMotion, events.length, goTo]);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    if (scrollingTo.current !== null) {
      if (Math.abs(track.scrollLeft - scrollingTo.current * track.clientWidth) < 2) scrollingTo.current = null;
      return;
    }
    if (index !== active) setActive(index);
  };

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Eventos destacados"
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => {
        setPaused(true);
        scrollingTo.current = null; // el dedo manda sobre un desplazamiento a medias
      }}
    >
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex h-[min(88svh,720px)] min-h-[560px] snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {events.map((event, index) => {
          const price = priceLabel(event.price_from, event.currency);
          return (
            <article
              key={event.id}
              aria-roledescription="diapositiva"
              aria-label={`${index + 1} de ${events.length}: ${event.title}`}
              aria-hidden={index !== active}
              className="relative h-full w-full shrink-0 snap-center overflow-hidden"
            >
              {event.cover_image && (
                <Img
                  src={event.cover_image}
                  alt=""
                  className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl"
                />
              )}
              <div className="absolute inset-0 bg-[image:var(--gradient-scrim-hero)]" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(124,58,237,0.35),transparent_60%)]" />

              <div className="relative mx-auto flex h-full max-w-[var(--container-max)] flex-col items-center justify-center gap-6 px-[var(--space-6)] pb-16 pt-8 md:flex-row-reverse md:justify-between md:gap-12">
                <Link
                  href={`/e/${event.slug}`}
                  tabIndex={index === active ? 0 : -1}
                  className="relative aspect-[4/5] w-[min(56vw,240px)] shrink-0 overflow-hidden rounded-[var(--radius-xl)] border border-white/10 shadow-[var(--glow-accent)] md:w-[340px]"
                >
                  {event.cover_image ? (
                    <Img src={event.cover_image} alt={`Flyer de ${event.title}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-[var(--color-surface-sunken)]" />
                  )}
                </Link>

                <div className="flex max-w-xl flex-col items-center gap-4 text-center md:items-start md:text-left">
                  <span className="flex items-center gap-2 rounded-[var(--radius-full)] border border-white/15 bg-[var(--color-bg)]/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] backdrop-blur-sm">
                    <span className="text-[var(--color-accent-text)]">
                      {dayNumber(event.starts_at)} {monthShort(event.starts_at)}
                    </span>
                    · {timeLabel(event.starts_at)}
                  </span>
                  <h2 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-white sm:text-5xl lg:text-6xl">
                    {event.title}
                  </h2>
                  <p className="first-letter:uppercase text-[var(--color-text-muted)]">
                    {longDate(event.starts_at)}
                    {event.venue_name ? ` · ${event.venue_name}` : ""}
                    {event.city ? `, ${event.city}` : ""}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
                    <Link
                      href={`/e/${event.slug}#entradas`}
                      tabIndex={index === active ? 0 : -1}
                      className={cn(buttonVariants({ size: "lg" }), "shadow-[var(--glow-accent)]")}
                    >
                      Comprar entradas
                    </Link>
                    {price && <span className="font-medium text-[var(--color-text)]">{price}</span>}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {events.length > 1 && (
        <div className="absolute inset-x-0 bottom-5 mx-auto flex max-w-[var(--container-max)] items-center justify-center gap-4 px-[var(--space-6)] md:justify-between">
          <div className="flex items-center gap-2" role="group" aria-label="Elegir diapositiva">
            {events.map((event, index) => (
              <button
                key={event.id}
                type="button"
                aria-label={`Ir a ${event.title}`}
                aria-current={index === active}
                onClick={() => goTo(index)}
                className="relative h-1.5 overflow-hidden rounded-[var(--radius-full)] bg-white/25 transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                style={{ width: index === active ? 40 : 12 }}
              >
                {index === active && (
                  <span
                    key={`${active}-${paused}`}
                    className={cn(
                      "absolute inset-y-0 left-0 bg-white",
                      paused || reducedMotion ? "w-full" : "animate-[slide-progress_6s_linear_forwards]"
                    )}
                  />
                )}
              </button>
            ))}
          </div>
          <div className="hidden gap-2 md:flex">
            <IconButton label="Evento anterior" variant="secondary" onClick={() => goTo(active - 1)}>
              <ChevronLeft className="h-5 w-5" />
            </IconButton>
            <IconButton label="Evento siguiente" variant="secondary" onClick={() => goTo(active + 1)}>
              <ChevronRight className="h-5 w-5" />
            </IconButton>
          </div>
        </div>
      )}
    </section>
  );
}
