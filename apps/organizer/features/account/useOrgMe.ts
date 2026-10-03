"use client";

import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/lib/api";

/** Nombre de la organización y email del organizador (pantalla Cuenta). */
export function useOrgMe() {
  const api = useApi();
  return useQuery({
    queryKey: ["org-me"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/me/");
      if (error) throw error;
      return data;
    },
  });
}
