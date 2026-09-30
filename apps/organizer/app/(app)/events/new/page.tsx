"use client";

import { Stepper, TopBar } from "@repo/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useCreateEvent, useEvent, useUpdateEvent } from "@/features/events/hooks";
import { EventInfoStep, type EventInfoValues } from "@/features/wizard/EventInfoStep";
import { ImagesStep } from "@/features/wizard/ImagesStep";
import { PublishStep } from "@/features/wizard/PublishStep";
import { TicketsStep } from "@/features/wizard/TicketsStep";

const STEPS = [
  { key: "info", label: "Información" },
  { key: "images", label: "Flyers" },
  { key: "tickets", label: "Entradas" },
  { key: "publish", label: "Publicación" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

export default function NewEventWizardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Permite retomar el wizard tras un refresco: el borrador nunca se pierde.
  const [eventId, setEventId] = useState<string | null>(() => searchParams.get("event"));
  const [step, setStep] = useState<StepKey>(() => (searchParams.get("event") ? "images" : "info"));

  const { data: event } = useEvent(eventId ?? undefined);
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent(eventId ?? "");

  async function handleInfoSubmit(values: EventInfoValues) {
    const payload = { ...values, maps_url: values.maps_url || undefined };
    if (!eventId) {
      const created = await createEvent.mutateAsync(payload);
      setEventId(created.id);
      router.replace(`/events/new?event=${created.id}`, { scroll: false });
    } else {
      await updateEvent.mutateAsync(payload);
    }
    setStep("images");
  }

  const completedSteps: Record<StepKey, boolean> = {
    info: !!event,
    images: (event?.images.length ?? 0) > 0,
    tickets: (event?.ticket_types.length ?? 0) > 0,
    publish: event?.status === "PUBLISHED",
  };

  const infoDefaults: Partial<EventInfoValues> | undefined = event
    ? {
        title: event.title,
        description: event.description,
        starts_at: event.starts_at,
        ends_at: event.ends_at ?? undefined,
        venue_name: event.venue_name,
        address: event.address,
        city: event.city,
        maps_url: event.maps_url,
        min_age: event.min_age,
      }
    : undefined;

  return (
    <>
      <TopBar title="Nuevo evento" onBack={() => router.push("/events")} />
      <div className="flex flex-col gap-6 p-[var(--space-4)]">
        <Stepper
          steps={STEPS.map((s) => ({ key: s.key, label: s.label, complete: completedSteps[s.key] }))}
          activeKey={step}
          onStepClick={(key) => {
            if (key === "info" || eventId) setStep(key as StepKey);
          }}
        />

        {step === "info" && (
          <EventInfoStep
            defaultValues={infoDefaults}
            onSubmit={handleInfoSubmit}
            saving={createEvent.isPending || updateEvent.isPending}
          />
        )}
        {step === "images" && eventId && <ImagesStep eventId={eventId} onNext={() => setStep("tickets")} />}
        {step === "tickets" && eventId && <TicketsStep eventId={eventId} onNext={() => setStep("publish")} />}
        {step === "publish" && eventId && <PublishStep eventId={eventId} />}
      </div>
    </>
  );
}
