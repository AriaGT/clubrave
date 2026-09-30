"use client";

import { TopBar } from "@repo/ui";
import { useParams, useRouter } from "next/navigation";

import { TicketsStep } from "@/features/wizard/TicketsStep";

export default function EventTicketsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <>
      <TopBar title="Tipos de entrada" onBack={() => router.push(`/events/${id}`)} />
      <div className="p-[var(--space-4)]">
        <TicketsStep eventId={id} onNext={() => router.push(`/events/${id}`)} />
      </div>
    </>
  );
}
