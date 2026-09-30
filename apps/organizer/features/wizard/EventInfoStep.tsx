"use client";

import { Button, FieldError, Input, Label, Textarea } from "@repo/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(3, "El título debe tener al menos 3 caracteres."),
  description: z.string().optional(),
  starts_at: z.string().min(1, "Elige la fecha y hora de inicio."),
  ends_at: z.string().optional(),
  venue_name: z.string().min(1, "Falta el nombre del lugar."),
  address: z.string().optional(),
  city: z.string().optional(),
  maps_url: z.string().url("Enlace inválido.").optional().or(z.literal("")),
  min_age: z.coerce.number().int().min(0).max(99),
});

export type EventInfoValues = z.infer<typeof schema>;

export interface EventInfoStepProps {
  defaultValues?: Partial<EventInfoValues>;
  onSubmit: (values: EventInfoValues) => void;
  saving?: boolean;
}

function toLocalDateTimeInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EventInfoStep({ defaultValues, onSubmit, saving }: EventInfoStepProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EventInfoValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      venue_name: "",
      address: "",
      city: "",
      maps_url: "",
      min_age: 18,
      ...defaultValues,
      starts_at: toLocalDateTimeInput(defaultValues?.starts_at),
    },
  });

  useEffect(() => {
    if (defaultValues) {
      reset({
        title: "",
        description: "",
        venue_name: "",
        address: "",
        city: "",
        maps_url: "",
        min_age: 18,
        ...defaultValues,
        starts_at: toLocalDateTimeInput(defaultValues.starts_at),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues?.title]);

  return (
    <form
      id="wizard-step-1"
      className="flex flex-col gap-5"
      onSubmit={handleSubmit((values) =>
        onSubmit({ ...values, starts_at: new Date(values.starts_at).toISOString() })
      )}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Título del evento</Label>
        <Input id="title" invalid={!!errors.title} {...register("title")} placeholder="Noche Eléctrica" />
        <FieldError>{errors.title?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Descripción</Label>
        <Textarea id="description" {...register("description")} placeholder="Una noche de música electrónica…" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="starts_at">Fecha y hora de inicio</Label>
          <Input id="starts_at" type="datetime-local" invalid={!!errors.starts_at} {...register("starts_at")} />
          <FieldError>{errors.starts_at?.message}</FieldError>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="min_age">Edad mínima</Label>
          <Input id="min_age" type="number" inputMode="numeric" {...register("min_age")} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="venue_name">Lugar</Label>
        <Input id="venue_name" invalid={!!errors.venue_name} {...register("venue_name")} placeholder="Warehouse 09" />
        <FieldError>{errors.venue_name?.message}</FieldError>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">Dirección</Label>
          <Input id="address" {...register("address")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="city">Ciudad</Label>
          <Input id="city" {...register("city")} placeholder="Lima" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="maps_url">Enlace de Google Maps</Label>
        <Input id="maps_url" {...register("maps_url")} placeholder="https://maps.google.com/…" />
        <FieldError>{errors.maps_url?.message}</FieldError>
      </div>

      <Button type="submit" loading={saving} className="self-end">
        Guardar y continuar
      </Button>
    </form>
  );
}
