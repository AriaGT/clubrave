import { type ApiComponents, imagesOfKind, selectedImageOfKind } from "@repo/api-client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PUBLIC_SITE_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-api";
import { EventPageClient } from "@/features/events/EventPageClient";

type EventDetail = ApiComponents["schemas"]["EventPublicDetail"];

export const revalidate = 60;

async function getEvent(slug: string) {
  return serverFetch<EventDetail>(`/api/events/${slug}/`);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) return {};

  const cover = selectedImageOfKind(event.images, "FLYER")?.image;

  return {
    title: event.title,
    description: event.description?.slice(0, 160),
    openGraph: {
      title: event.title,
      description: event.description?.slice(0, 160),
      images: cover ? [cover] : [],
      url: `${PUBLIC_SITE_URL}/e/${slug}`,
      type: "website",
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.starts_at,
    endDate: event.ends_at ?? undefined,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: event.venue_name,
      address: event.address || event.city,
    },
    // Solo flyers: zonas y mapa no representan al evento en buscadores.
    image: imagesOfKind(event.images, "FLYER").map((i) => i.image),
    description: event.description,
    offers: event.ticket_types.map((tt) => ({
      "@type": "Offer",
      name: tt.name,
      price: tt.price,
      priceCurrency: event.currency ?? "PEN",
      availability:
        tt.available > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      url: `${PUBLIC_SITE_URL}/e/${slug}`,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <EventPageClient event={event} />
    </>
  );
}
