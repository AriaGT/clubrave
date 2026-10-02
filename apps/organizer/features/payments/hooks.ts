"use client";

import type { ApiComponents } from "@repo/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/lib/api";

export type PaymentSettings = ApiComponents["schemas"]["PaymentSettingsState"];
export type PaymentProviderState = ApiComponents["schemas"]["ProviderState"];
export type PaymentSettingsPatch = ApiComponents["schemas"]["PatchedPaymentSettingsUpdate"];
export type PaymentMode = PaymentSettings["mode"];
export type PaymentEnvironment = PaymentProviderState["environment"];

const KEY = ["payment-settings"];

export function usePaymentSettings() {
  const api = useApi();
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/payments/");
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdatePaymentSettings() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: PaymentSettingsPatch) => {
      const { data, error } = await api.PATCH("/api/org/payments/", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
}
