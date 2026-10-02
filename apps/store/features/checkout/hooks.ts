"use client";

import type { ApiErrorShape } from "@repo/api-client";
import type { DocumentType } from "@repo/ui";
import { useMutation } from "@tanstack/react-query";

import { useApi } from "@/lib/api";

export function useRequestCode() {
  const api = useApi();
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await api.POST("/api/auth/customer/request-code/", { body: { email } });
      if (error) throw error as ApiErrorShape;
    },
  });
}

export interface CreateOrderInput {
  eventId: string;
  items: { ticket_type_id: string; quantity: number }[];
  buyer: { email: string; full_name: string; phone?: string; document_type: DocumentType; document_id: string };
  termsAccepted: boolean;
}

export function useCreateOrder() {
  const api = useApi();
  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      const { data, error } = await api.POST("/api/checkout/orders/", {
        body: {
          event_id: input.eventId,
          items: input.items,
          buyer: {
            email: input.buyer.email,
            full_name: input.buyer.full_name,
            phone: input.buyer.phone ?? "",
            document_type: input.buyer.document_type,
            document_id: input.buyer.document_id,
          },
          terms_accepted: input.termsAccepted,
        },
      });
      if (error) throw error as ApiErrorShape;
      return data;
    },
  });
}
