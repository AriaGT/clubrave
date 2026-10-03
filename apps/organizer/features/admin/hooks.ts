"use client";

import type { ApiComponents } from "@repo/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAdminApi } from "@/lib/admin-session";

type Schemas = ApiComponents["schemas"];

export type AdminOrganization = Schemas["Organization"];
export type AdminOrganizationBody = Schemas["OrganizationWrite"];
export type AdminUser = Schemas["AdminUser"];
export type AdminUserCreateBody = Schemas["AdminUserCreate"];
export type AdminUserUpdateBody = Schemas["PatchedAdminUserUpdate"];
export type AdminAuditLog = Schemas["AdminAuditLog"];
export type PaymentSettings = Schemas["PaymentSettingsState"];
export type PaymentProviderState = Schemas["ProviderState"];
export type PaymentSettingsPatch = Schemas["PatchedPaymentSettingsUpdate"];
export type PaymentMode = PaymentSettings["mode"];
export type PaymentEnvironment = PaymentProviderState["environment"];
export type SiteSettings = Schemas["SiteSettings"];
export type SiteSettingsPatch = Schemas["PatchedSiteSettings"];
export type PanelRole = "OWNER" | "SECURITY";

export interface AdminAlert {
  code: string;
  severity: "error" | "warning";
  message: string;
}

/** `/api/admin/overview/` no tiene serializer: este es el contrato que arma la vista. */
export interface AdminOverview {
  organizations: { active: number; inactive: number };
  organizers: number;
  porters: number;
  upcoming_events: number;
  payments: { mode: string; gateways: { id: string; environment: string; verified: boolean }[] };
  alerts: AdminAlert[];
}

/** `/api/admin/system/` tampoco tiene serializer: contrato que arma la vista. */
export interface AdminSystem {
  version: string;
  environment: string;
  debug: boolean;
  checks: { code: string; label: string; status: "ok" | "warning" | "error"; detail: string }[];
  webhooks: { provider: string; url: string }[];
}

export const ROLE_LABELS: Record<string, string> = { OWNER: "Organizador", SECURITY: "Portero" };

export function useAdminOverview() {
  const api = useAdminApi();
  return useQuery({
    queryKey: ["admin", "overview"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/admin/overview/");
      if (error) throw error;
      return data as unknown as AdminOverview;
    },
  });
}

export function useAdminSystem() {
  const api = useAdminApi();
  return useQuery({
    queryKey: ["admin", "system"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/admin/system/");
      if (error) throw error;
      return data as unknown as AdminSystem;
    },
  });
}

// ── Organizaciones ───────────────────────────────────────────────────────────

export function useOrganizations(filters: { q?: string; is_active?: boolean } = {}) {
  const api = useAdminApi();
  return useQuery({
    queryKey: ["admin", "organizations", filters],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/admin/organizations/", {
        params: { query: { q: filters.q || undefined, is_active: filters.is_active, page_size: 100 } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useOrganization(id: string) {
  const api = useAdminApi();
  return useQuery({
    queryKey: ["admin", "organizations", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/admin/organizations/{id}/", { params: { path: { id } } });
      if (error) throw error;
      return data;
    },
  });
}

export function useOrganizationEvents(id: string | undefined) {
  const api = useAdminApi();
  return useQuery({
    queryKey: ["admin", "organizations", id, "events"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/admin/organizations/{id}/events/", {
        params: { path: { id: id! } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateOrganization() {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: AdminOrganizationBody) => {
      const { data, error } = await api.POST("/api/admin/organizations/", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

export function useUpdateOrganization(id: string) {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<AdminOrganizationBody>) => {
      const { data, error } = await api.PATCH("/api/admin/organizations/{id}/", {
        params: { path: { id } },
        body: body as AdminOrganizationBody,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

// ── Usuarios del panel ───────────────────────────────────────────────────────

export interface UserFilters {
  role?: PanelRole;
  organization?: string;
  is_active?: boolean;
  q?: string;
}

export function useAdminUsers(filters: UserFilters = {}) {
  const api = useAdminApi();
  return useQuery({
    queryKey: ["admin", "users", filters],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/admin/users/", {
        params: { query: { ...filters, q: filters.q || undefined, page_size: 100 } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateAdminUser() {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: AdminUserCreateBody) => {
      const { data, error } = await api.POST("/api/admin/users/", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

export function useUpdateAdminUser() {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: AdminUserUpdateBody }) => {
      const { data, error } = await api.PATCH("/api/admin/users/{id}/", { params: { path: { id } }, body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

/** Devuelve la contraseña generada cuando no se envía una. */
export function useResetAdminUserPassword() {
  const api = useAdminApi();
  return useMutation({
    mutationFn: async ({ id, password }: { id: string; password?: string }) => {
      const { data, error } = await api.POST("/api/admin/users/{id}/reset-password/", {
        params: { path: { id } },
        body: { password: password || undefined },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useRevokeAdminUserSessions() {
  const api = useAdminApi();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.POST("/api/admin/users/{id}/revoke-sessions/", { params: { path: { id } } });
      if (error) throw error;
    },
  });
}

export function useDeleteAdminUser() {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/api/admin/users/{id}/", { params: { path: { id } } });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
}

// ── Pagos y sitio web (vistas compartidas con features/payments y features/site) ──

const PAYMENTS_KEY = ["admin", "payments"];
const SITE_KEY = ["admin", "site"];

export function useAdminPaymentSettings() {
  const api = useAdminApi();
  return useQuery({
    queryKey: PAYMENTS_KEY,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/admin/payments/");
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateAdminPaymentSettings() {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: PaymentSettingsPatch) => {
      const { data, error } = await api.PATCH("/api/admin/payments/", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(PAYMENTS_KEY, data);
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });
}

export function useAdminSiteSettings() {
  const api = useAdminApi();
  return useQuery({
    queryKey: SITE_KEY,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/admin/site/");
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateAdminSiteSettings() {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Omit<SiteSettingsPatch, "logo" | "updated_at">) => {
      const { data, error } = await api.PATCH("/api/admin/site/", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(SITE_KEY, data),
  });
}

/** Sube un logo nuevo (`File`) o lo quita (`null`). */
export function useSetAdminSiteLogo() {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File | null) => {
      let body: FormData | { logo: null } = { logo: null };
      if (file) {
        body = new FormData();
        body.append("logo", file);
      }
      const { data, error } = await api.PATCH("/api/admin/site/", {
        // @ts-expect-error — openapi-fetch acepta FormData para multipart aunque el tipo generado espere el objeto plano
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(SITE_KEY, data),
  });
}

// ── Bitácora ─────────────────────────────────────────────────────────────────

export interface AuditFilters {
  organization?: string;
  action?: string;
  date_from?: string;
  date_to?: string;
}

export function useAdminAudit(filters: AuditFilters, page: number) {
  const api = useAdminApi();
  return useQuery({
    queryKey: ["admin", "audit", filters, page],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/admin/audit/", {
        params: {
          query: {
            organization: filters.organization || undefined,
            action: filters.action || undefined,
            date_from: filters.date_from || undefined,
            date_to: filters.date_to || undefined,
            page,
          },
        },
      });
      if (error) throw error;
      return data;
    },
  });
}
