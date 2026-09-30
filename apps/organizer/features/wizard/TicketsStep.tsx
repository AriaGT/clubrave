"use client";

import { Badge, Button, Card, CardContent, FieldError, Input, Label } from "@repo/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useCreateTicketType, useDeleteTicketType, useEvent } from "@/features/events/hooks";

const schema = z.object({
  name: z.string().min(1, "Falta el nombre."),
  price: z.coerce.number().min(0, "El precio no puede ser negativo."),
  quantity_total: z.coerce.number().int().min(1, "El aforo debe ser al menos 1."),
  max_per_order: z.coerce.number().int().min(1).default(10),
});

type FormValues = z.infer<typeof schema>;

export interface TicketsStepProps {
  eventId: string;
  onNext: () => void;
}

export function TicketsStep({ eventId, onNext }: TicketsStepProps) {
  const { data: event } = useEvent(eventId);
  const createTicketType = useCreateTicketType(eventId);
  const deleteTicketType = useDeleteTicketType(eventId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", price: 0, quantity_total: 100, max_per_order: 10 },
  });

  const ticketTypes = event?.ticket_types ?? [];

  const onAdd = handleSubmit(async (values) => {
    await createTicketType.mutateAsync({
      name: values.name,
      price: values.price.toFixed(2),
      quantity_total: values.quantity_total,
      max_per_order: values.max_per_order,
    });
    reset();
  });

  return (
    <div className="flex flex-col gap-5">
      {ticketTypes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {ticketTypes.map((tt) => (
            <Card key={tt.id}>
              <CardContent className="flex items-center justify-between gap-3 pt-4">
                <div className="flex flex-col">
                  <span className="font-medium">{tt.name}</span>
                  <span className="font-mono text-sm text-[var(--color-text-muted)]">
                    S/ {tt.price} · aforo {tt.quantity_total} · máx. {tt.max_per_order}/compra
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {tt.quantity_sold > 0 && <Badge variant="accent">{tt.quantity_sold} vendidas</Badge>}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={tt.quantity_sold > 0}
                    onClick={() => deleteTicketType.mutate(tt.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-[var(--space-4)]">
        <h3 className="font-display text-base font-semibold">Nuevo tipo de entrada</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="tt-name">Nombre</Label>
            <Input id="tt-name" {...register("name")} placeholder="General" />
            <FieldError>{errors.name?.message}</FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tt-price">Precio (S/)</Label>
            <Input id="tt-price" type="number" step="0.01" inputMode="decimal" {...register("price")} />
            <FieldError>{errors.price?.message}</FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tt-qty">Cantidad disponible</Label>
            <Input id="tt-qty" type="number" inputMode="numeric" {...register("quantity_total")} />
            <FieldError>{errors.quantity_total?.message}</FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tt-max">Máximo por compra</Label>
            <Input id="tt-max" type="number" inputMode="numeric" {...register("max_per_order")} />
          </div>
        </div>
        <Button type="submit" variant="secondary" loading={createTicketType.isPending} className="self-end">
          + Agregar tipo de entrada
        </Button>
      </form>

      <Button onClick={onNext} disabled={ticketTypes.length === 0} className="self-end">
        Continuar
      </Button>
    </div>
  );
}
