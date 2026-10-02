"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { useApi } from "@/lib/api";

/** Sondea la orden hasta que el IPN (autoritativo) la cierre — §7.2, §8.5. */
export function useOrderStatus(code: string, options?: { pollUntilPaid?: boolean }) {
  const api = useApi();
  return useQuery({
    queryKey: ["order", code],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/checkout/orders/{code}/", { params: { path: { code } } });
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => {
      if (!options?.pollUntilPaid) return false;
      const status = query.state.data?.status;
      return status === "PENDING" ? 2000 : false;
    },
  });
}

/**
 * El backend reenvía este cuerpo tal cual a `gateway.verify_browser_return()`
 * (§8.5): con `FakeGateway` es `{order_code, approved}`; con Izipay real es
 * la respuesta cruda del SDK Krypton (`kr-answer`, `kr-hash`, `kr-hash-key`).
 * Es feedback para la pantalla, nunca la fuente de verdad — el IPN manda.
 */
export function useConfirmPayment(code: string) {
  const api = useApi();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await api.POST("/api/checkout/orders/{code}/confirm/", {
        params: { path: { code } },
        body: payload,
      });
      if (error) throw error;
      return data;
    },
  });
}

/** Medios de pago habilitados ahora (panel › Medios de pago). */
export function usePaymentMethods() {
  const api = useApi();
  return useQuery({
    queryKey: ["payment-methods"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/checkout/payment-methods/");
      if (error) throw error;
      return data.methods;
    },
    staleTime: 60_000,
  });
}

/** Abre la sesión de pago con el medio elegido, o la cambia a otro medio. */
export function useOpenPaymentSession(code: string) {
  const api = useApi();
  return useMutation({
    mutationFn: async (method: string) => {
      const { data, error } = await api.POST("/api/checkout/orders/{code}/session/", {
        params: { path: { code } },
        body: { method },
      });
      if (error) throw error;
      return data;
    },
  });
}
