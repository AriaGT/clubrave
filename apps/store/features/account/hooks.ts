"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

export function useMe() {
  const api = useApi();
  const { status } = useSession();
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/me/");
      if (error) throw error;
      return data;
    },
    enabled: status === "authenticated",
  });
}

export function useUpdateMe() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { full_name?: string; phone?: string; document_id?: string }) => {
      const { data, error } = await api.PATCH("/api/me/", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });
}

/** Anonimiza la cuenta (§13.1): borra el perfil, no las órdenes ya pagadas. */
export function useDeleteAccount() {
  const api = useApi();
  return useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE("/api/me/");
      if (error) throw error;
    },
  });
}

export function useMyOrders() {
  const api = useApi();
  const { status } = useSession();
  return useQuery({
    queryKey: ["me", "orders"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/me/orders/");
      if (error) throw error;
      return data;
    },
    enabled: status === "authenticated",
  });
}

export function useMyOrder(code: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: ["me", "orders", code],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/me/orders/{code}/", { params: { path: { code: code! } } });
      if (error) throw error;
      return data;
    },
    enabled: !!code,
  });
}

export function useMyTickets(status?: "active" | "used" | "expired" | "void") {
  const api = useApi();
  const { status: sessionStatus } = useSession();
  return useQuery({
    queryKey: ["me", "tickets", status],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/me/tickets/", { params: { query: { status } } });
      if (error) throw error;
      return data;
    },
    enabled: sessionStatus === "authenticated",
  });
}
