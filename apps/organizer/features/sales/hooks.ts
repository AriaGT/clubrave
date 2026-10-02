"use client";

import type { ApiComponents, ApiErrorShape } from "@repo/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/lib/api";

export type ManualSaleInput = ApiComponents["schemas"]["ManualSaleCreate"];
export type ManualPaymentMethod = ManualSaleInput["payment_method"];

export const MANUAL_PAYMENT_METHODS: { value: ManualPaymentMethod; label: string }[] = [
  { value: "YAPE_PLIN", label: "Yape / Plin" },
  { value: "CASH", label: "Efectivo" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "OTHER", label: "Otro" },
];

export function manualPaymentLabel(value: string | null | undefined): string {
  return MANUAL_PAYMENT_METHODS.find((m) => m.value === value)?.label ?? "—";
}

export function useCreateManualSale(eventId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ManualSaleInput) => {
      const { data, error } = await api.POST("/api/org/events/{event_pk}/manual-sales/", {
        params: { path: { event_pk: eventId } },
        body,
      });
      if (error) throw error as ApiErrorShape;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
  });
}
