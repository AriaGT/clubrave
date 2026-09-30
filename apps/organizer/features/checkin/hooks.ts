"use client";

import type { ApiErrorShape } from "@repo/api-client";
import { useMutation } from "@tanstack/react-query";

import { useApi } from "@/lib/api";

export interface CheckInVariables {
  qrPayload?: string;
  manualCode?: string;
  eventId: string;
}

export function useCheckIn() {
  const api = useApi();
  return useMutation({
    mutationFn: async ({ qrPayload, manualCode, eventId }: CheckInVariables) => {
      const { data, error } = await api.POST("/api/org/checkin/", {
        body: { qr_payload: qrPayload, manual_code: manualCode, event_id: eventId },
      });
      if (error) throw error as ApiErrorShape;
      return data;
    },
  });
}
