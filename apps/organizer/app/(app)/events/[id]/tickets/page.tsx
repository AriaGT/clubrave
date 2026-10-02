"use client";

import { TopBar } from "@repo/ui";
import { useParams, useRouter } from "next/navigation";

import { useEvent } from "@/features/events/hooks";
import { TicketsStep } from "@/features/wizard/TicketsStep";

export default function EventTicketsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: event } = useEvent(id);

  return (
    <>
      <TopBar title="Tipos de entrada" subtitle={event?.title} onBack={() => router.push(`/events/${id}`)} />
      <div className="mx-auto w-full max-w-3xl p-[var(--space-4)]">
        <TicketsStep eventId={id} onNext={() => router.push(`/events/${id}`)} />
      </div>
    </>
  );
}
