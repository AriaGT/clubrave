"use client";

import type { ApiComponents, ApiErrorShape } from "@repo/api-client";
import { useMutation } from "@tanstack/react-query";

import { useApi } from "@/lib/api";

export type GuestCodeInfo = ApiComponents["schemas"]["GuestCodeValidateResponse"];

/** Acepta el código como lo pegue la persona: con guiones, espacios o minúsculas. */
export function normalizeGuestCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatGuestCode(code: string): string {
  return normalizeGuestCode(code).match(/.{1,4}/g)?.join("-") ?? code;
}

export function useValidateGuestCode() {
  const api = useApi();
  return useMutation({
    mutationFn: async ({ code, eventId }: { code: string; eventId: string }) => {
      const { data, error } = await api.POST("/api/guest-codes/validate/", {
        body: { code: normalizeGuestCode(code), event_id: eventId },
      });
      if (error) throw error as ApiErrorShape;
      return data as GuestCodeInfo;
    },
  });
}

export interface RedeemGuestCodeInput {
  code: string;
  eventId: string;
  buyer: { email: string; full_name: string; phone?: string; document_id?: string };
}

export function useRedeemGuestCode() {
  const api = useApi();
  return useMutation({
    mutationFn: async (input: RedeemGuestCodeInput) => {
      const { data, error } = await api.POST("/api/guest-codes/redeem/", {
        body: {
          code: normalizeGuestCode(input.code),
          event_id: input.eventId,
          buyer: {
            email: input.buyer.email,
            full_name: input.buyer.full_name,
            phone: input.buyer.phone ?? "",
            document_id: input.buyer.document_id ?? "",
          },
          terms_accepted: true,
        },
      });
      if (error) throw error as ApiErrorShape;
      return data;
    },
  });
}
