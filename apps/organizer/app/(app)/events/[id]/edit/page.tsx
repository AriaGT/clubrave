"use client";

import { TopBar } from "@repo/ui";
import { useParams, useRouter } from "next/navigation";

import {
  apiErrorMessage,
  useEvent,
  useUpdateEvent,
} from "@/features/events/hooks";
import {
  EventInfoStep,
  type EventInfoValues,
} from "@/features/wizard/EventInfoStep";

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: event } = useEvent(id);
  const updateEvent = useUpdateEvent(id);

  if (!event) {
    return <TopBar title="Editar evento" onBack={() => router.push(`/events/${id}`)} />;
  }

  async function handleSubmit(values: EventInfoValues) {
    const body = {
      title: values.title,
      description: values.description ?? "",
      starts_at: values.starts_at,
      venue_name: values.venue_name,
      address: values.address ?? "",
      city: values.city ?? "",
      maps_url: values.maps_url ?? "",
      min_age: values.min_age,
    };
    await updateEvent.mutateAsync(body, {
      onSuccess: () => router.push(`/events/${id}`),
    });
  }

  return (
    <>
      <TopBar title="Editar evento" onBack={() => router.push(`/events/${id}`)} />
      <div className="flex flex-col gap-4 p-[var(--space-4)]">
        {updateEvent.error && (
          <p className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
            {apiErrorMessage(updateEvent.error)}
          </p>
        )}
        <EventInfoStep
          defaultValues={{
            title: event.title,
            description: event.description,
            starts_at: event.starts_at,
            venue_name: event.venue_name,
            address: event.address,
            city: event.city,
            maps_url: event.maps_url,
            min_age: event.min_age,
          }}
          onSubmit={handleSubmit}
          saving={updateEvent.isPending}
        />
        <p className="text-sm text-[var(--color-text-muted)]">
          Un evento publicado no puede quedar con una fecha pasada, y el enlace público nunca cambia.
        </p>
      </div>
    </>
  );
}