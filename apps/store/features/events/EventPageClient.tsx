"use client";

import { type ApiComponents, selectedImageOfKind } from "@repo/api-client";
import { Badge, Button, CartSheet, Divider, EventHero, ImagePreviewCard, TicketTypeRow } from "@repo/ui";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { useCartStore } from "@/features/cart/store";
import { GuestCodeBox } from "@/features/guest/GuestCodeBox";

import { useEventDetail } from "./hooks";

type EventDetail = ApiComponents["schemas"]["EventPublicDetail"];

export function EventPageClient({ event: initialEvent }: { event: EventDetail }) {
  const router = useRouter();
  const { data } = useEventDetail(initialEvent.slug ?? "", initialEvent);
  const event = data ?? initialEvent;
  const { eventId, lines, setEvent, setQuantity, totalItems } = useCartStore();
  const [cartOpen, setCartOpen] = useState(false);

  const paymentsDisabled = event.payments_disabled === true;
  const salesPaused = event.sales_paused === true || paymentsDisabled;

  useEffect(() => {
    setEvent(event.id, event.slug ?? "");
  }, [event.id, event.slug, setEvent]);

  const cartLines = useMemo(
    () =>
      event.ticket_types
        .filter((tt) => (lines[tt.id] ?? 0) > 0)
        .map((tt) => ({
          id: tt.id,
          name: tt.name,
          quantity: lines[tt.id],
          unitPrice: tt.price,
          subtotal: (Number(tt.price) * lines[tt.id]).toFixed(2),
        })),
    [event.ticket_types, lines]
  );

  const subtotal = cartLines.reduce((sum, l) => sum + Number(l.subtotal), 0);
  // Cada imagen va donde se usa: el flyer vende (hero), las zonas ayudan a
  // elegir entrada (junto a la lista) y el mapa ayuda a llegar (en Lugar).
  const flyer = selectedImageOfKind(event.images, "FLYER");
  const zones = selectedImageOfKind(event.images, "ZONES");
  const map = selectedImageOfKind(event.images, "MAP");

  return (
    <main className="mx-auto flex max-w-[var(--container-max)] flex-col pb-28">
      <EventHero
        coverImage={flyer?.image ?? null}
        coverExpandTitle="Flyer"
        dateLabel={new Date(event.starts_at).toLocaleDateString("es-PE", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
        title={event.title}
        venueLabel={`${event.venue_name}${event.city ? ` · ${event.city}` : ""}`}
      />

      <section className="flex flex-col gap-1 p-[var(--space-6)]" id="entradas">
        <h2 className="font-display text-xl font-semibold">Entradas</h2>
        {salesPaused && (
          <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3">
            <span className="font-medium text-[var(--color-warning)]">
              {paymentsDisabled ? "Compras deshabilitadas temporalmente" : "Venta pausada temporalmente"}
            </span>
            <span className="text-sm text-[var(--color-text-muted)]">
              {paymentsDisabled
                ? "Estamos presentando problemas técnicos y las compras no están disponibles por ahora. Vuelve a intentarlo en un rato."
                : "El organizador suspendió la venta de entradas. Vuelve en un momento."}
            </span>
          </div>
        )}
        {zones && (
          <figure className="mt-3 flex flex-col gap-2">
            <ImagePreviewCard src={zones.image} alt={zones.alt || `Zonas de ${event.title}`} title="Zonas" />
            <figcaption className="text-sm text-[var(--color-text-muted)]">
              Mira dónde queda cada zona antes de elegir tu entrada.
            </figcaption>
          </figure>
        )}
        <div>
          {event.ticket_types.length === 0 && (
            <p className="text-[var(--color-text-muted)]">Todavía no hay entradas a la venta.</p>
          )}
          {event.ticket_types.map((tt) => (
            <TicketTypeRow
              key={tt.id}
              name={tt.name}
              description={tt.description}
              price={tt.price}
              available={tt.available}
              quantity={eventId === event.id ? (lines[tt.id] ?? 0) : 0}
              maxPerOrder={tt.max_per_order ?? 10}
              onQuantityChange={(q) => setQuantity(tt.id, q)}
              disabled={salesPaused}
            />
          ))}
        </div>
        {/* Siempre visible: un código puede dar un tipo de entrada oculto
            (inactivo) o seguir sirviendo con la venta pausada. */}
        <Suspense fallback={null}>
          <GuestCodeBox eventId={event.id} eventSlug={event.slug ?? ""} />
        </Suspense>
      </section>

      <Divider />

      {event.description && (
        <section className="flex flex-col gap-2 p-[var(--space-6)]">
          <h2 className="font-display text-xl font-semibold">Descripción</h2>
          <p className="whitespace-pre-line text-[var(--color-text-muted)]">{event.description}</p>
        </section>
      )}

      <section className="flex flex-col gap-2 p-[var(--space-6)]">
        <h2 className="font-display text-xl font-semibold">Lugar</h2>
        <p>{event.venue_name}</p>
        <p className="text-[var(--color-text-muted)]">{event.address}</p>
        {map && (
          <ImagePreviewCard
            src={map.image}
            alt={map.alt || `Mapa de ubicación de ${event.venue_name}`}
            title="Mapa de ubicación"
            className="mt-2"
          />
        )}
        {event.maps_url && (
          <a href={event.maps_url} target="_blank" rel="noreferrer" className="w-fit">
            <Button variant="secondary" size="sm">
              Cómo llegar
            </Button>
          </a>
        )}
        <Badge variant="neutral" className="mt-2 w-fit">
          +{event.min_age} años
        </Badge>
      </section>

      {!salesPaused && totalItems() > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-[var(--space-4)] shadow-[var(--glow-accent)]">
          <button
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-[var(--container-max)] items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-3 text-white"
          >
            <span>
              {totalItems()} entrada{totalItems() > 1 ? "s" : ""} · S/ {subtotal.toFixed(2)}
            </span>
            <span>Continuar →</span>
          </button>
        </div>
      )}

      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        lines={cartLines}
        subtotal={subtotal.toFixed(2)}
        total={subtotal.toFixed(2)}
        onContinue={() => router.push("/checkout")}
      />
    </main>
  );
}
