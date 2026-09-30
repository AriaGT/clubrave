"use client";

import type { ApiComponents } from "@repo/api-client";
import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/lib/api";

type EventDetail = ApiComponents["schemas"]["EventPublicDetail"];

/**
 * La disponibilidad se refresca al cargar y cada 60s (§11.3): "quedan 12"
 * tiene que ser verdad. `initialData` viene del render en servidor, así que
 * la primera pintura no espera a este fetch.
 */
export function useEventDetail(slug: string, initialData?: EventDetail) {
  const api = useApi();
  return useQuery({
    queryKey: ["event", slug],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/events/{slug}/", { params: { path: { slug } } });
      if (error) throw error;
      return data;
    },
    initialData,
    refetchInterval: 60_000,
    enabled: !!slug,
  });
}
