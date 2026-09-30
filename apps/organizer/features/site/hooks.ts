"use client";

import type { ApiComponents } from "@repo/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/lib/api";

export type SiteSettings = ApiComponents["schemas"]["SiteSettings"];
export type SiteSettingsPatch = ApiComponents["schemas"]["PatchedSiteSettings"];

const KEY = ["site-settings"];

export function useSiteSettings() {
  const api = useApi();
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/site/");
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateSiteSettings() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Omit<SiteSettingsPatch, "logo" | "updated_at">) => {
      const { data, error } = await api.PATCH("/api/org/site/", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
}

/** Sube un logo nuevo (`File`) o lo quita (`null`). */
export function useSetSiteLogo() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File | null) => {
      let body: FormData | { logo: null } = { logo: null };
      if (file) {
        body = new FormData();
        body.append("logo", file);
      }
      const { data, error } = await api.PATCH("/api/org/site/", {
        // @ts-expect-error — openapi-fetch acepta FormData para multipart aunque el tipo generado espere el objeto plano
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
}
