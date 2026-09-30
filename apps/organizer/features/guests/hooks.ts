"use client";

import type { ApiComponents, ApiErrorShape } from "@repo/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/lib/api";

export type GuestCode = ApiComponents["schemas"]["GuestCode"];
export type GuestCodeStatus = ApiComponents["schemas"]["GuestCodeStatusEnum"];
export type GuestCodeBatch = ApiComponents["schemas"]["GuestCodeBatch"];

export function useGuestCodes(eventId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["events", eventId, "guest-codes"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/events/{event_pk}/guest-codes/", {
        params: { path: { event_pk: eventId } },
      });
      if (error) throw error as ApiErrorShape;
      return data as GuestCode[];
    },
    enabled: !!eventId,
  });
}

export function useGenerateGuestCodes(eventId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { ticket_type_id: string; quantity: number; label: string }) => {
      const { data, error } = await api.POST("/api/org/events/{event_pk}/guest-codes/", {
        params: { path: { event_pk: eventId } },
        body,
      });
      if (error) throw error as ApiErrorShape;
      return data as GuestCodeBatch;
    },
    // Invalida el evento completo: cambia la disponibilidad de los tipos de
    // entrada (el cupo queda retenido) y las métricas.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events", eventId] }),
  });
}

export function useVoidGuestCode(eventId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST("/api/org/guest-codes/{id}/void/", {
        params: { path: { id } },
        body: { reason },
      });
      if (error) throw error as ApiErrorShape;
      return data as GuestCode;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events", eventId] }),
  });
}
