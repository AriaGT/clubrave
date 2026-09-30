"use client";

import { isApiError } from "@repo/api-client";
import type { ApiComponents, ApiErrorShape } from "@repo/api-client";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { PUBLIC_API_URL } from "@/lib/env";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

type Event = ApiComponents["schemas"]["EventOrganizer"];
type TicketType = ApiComponents["schemas"]["TicketType"];
type AuditLog = ApiComponents["schemas"]["AuditLog"];
type ReasonCodeEnum = ApiComponents["schemas"]["CancelEventReasonCodeEnum"];
type PaginatedEventAudit = ApiComponents["schemas"]["PaginatedEventAudit"];
export type Order = ApiComponents["schemas"]["Order"];
export type OrderDetail = ApiComponents["schemas"]["OrderDetail"];
export type OrderVoidBody = ApiComponents["schemas"]["OrderVoid"];
export type OrderVoidReasonCode = ApiComponents["schemas"]["OrderVoidReasonCodeEnum"];
export type UndoCheckInBody = ApiComponents["schemas"]["UndoCheckIn"];
export type UndoCheckInReasonCode = ApiComponents["schemas"]["UndoCheckInReasonCodeEnum"];

/** La API entrega siempre {"error": {"code", "message", "details"}}: extrae el
 * mensaje para mostrarlo, con un fallback para errores que no vengan del backend. */
export function apiErrorMessage(error: unknown): string {
  if (isApiError(error)) return error.error.message;
  return "Ocurrió un error. Inténtalo de nuevo.";
}

function invalidateEventCaches(queryClient: QueryClient, id: string) {
  queryClient.invalidateQueries({ queryKey: ["events", id] });
  queryClient.invalidateQueries({ queryKey: ["events"] });
}

export function useEvents(status?: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["events", status],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/events/", {
        params: { query: status ? { status } : undefined },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useEvent(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: ["events", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/events/{id}/", {
        params: { path: { id: id! } },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useEventStats(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: ["events", id, "stats"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/events/{id}/stats/", {
        params: { path: { id: id! } },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    refetchInterval: 30_000, // el panel refresca cada 30s mientras está visible (§6.5)
  });
}

export function useCreateEvent() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<Event> & { title: string; starts_at: string }) => {
      const { data, error } = await api.POST("/api/org/events/", { body: body as Event });
      if (error) throw error;
      return data as Event;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useUpdateEvent(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<Event>) => {
      const { data, error } = await api.PATCH("/api/org/events/{id}/", {
        params: { path: { id } },
        body: body as Event,
      });
      if (error) throw error;
      return data as Event;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", id] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function usePublishEvent(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/org/events/{id}/publish/", {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", id] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useUploadEventImage(eventId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      const { data, error } = await api.POST("/api/org/events/{event_pk}/images/", {
        params: { path: { event_pk: eventId } },
        // @ts-expect-error — openapi-fetch acepta FormData para multipart aunque el tipo generado espere el objeto plano
        body: formData,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events", eventId] }),
  });
}

export function useDeleteEventImage(eventId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (imageId: string) => {
      const { error } = await api.DELETE("/api/org/events/{event_pk}/images/{id}/", {
        params: { path: { event_pk: eventId, id: imageId } },
      });
      if (error) throw error as ApiErrorShape;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events", eventId] }),
  });
}

export function useReorderEventImages(eventId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: string[]) => {
      const { data, error } = await api.POST("/api/org/events/{event_pk}/images/reorder/", {
        params: { path: { event_pk: eventId } },
        body: { order },
      });
      if (error) throw error as ApiErrorShape;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events", eventId] }),
  });
}

export function useSetCoverImage(eventId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (imageId: string) => {
      const { error } = await api.PATCH("/api/org/events/{event_pk}/images/{id}/", {
        params: { path: { event_pk: eventId, id: imageId } },
        body: { is_cover: true },
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events", eventId] }),
  });
}

export function useCreateTicketType(eventId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<TicketType> & { name: string; price: string; quantity_total: number }) => {
      const { data, error } = await api.POST("/api/org/events/{event_pk}/ticket-types/", {
        params: { path: { event_pk: eventId } },
        body: body as TicketType,
      });
      if (error) throw error as ApiErrorShape;
      return data as TicketType;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events", eventId] }),
  });
}

export function useUpdateTicketType(eventId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<TicketType> }) => {
      const { data, error } = await api.PATCH("/api/org/ticket-types/{id}/", {
        params: { path: { id } },
        body: body as TicketType,
      });
      if (error) throw error;
      return data as TicketType;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events", eventId] }),
  });
}

export function useDeleteTicketType(eventId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/api/org/ticket-types/{id}/", { params: { path: { id } } });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events", eventId] }),
  });
}

export function useEventOrders(eventId: string, filters?: { status?: string; q?: string }) {
  const api = useApi();
  const status = filters?.status;
  const q = filters?.q;
  return useQuery({
    queryKey: ["events", eventId, "orders", status ?? "", q ?? ""],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/events/{event_pk}/orders/", {
        params: {
          path: { event_pk: eventId },
          query: { status: status || undefined, q: q || undefined },
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });
}

export function useEventOrder(eventId: string, code: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: ["events", eventId, "orders", code],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/events/{event_pk}/orders/{code}/", {
        params: { path: { event_pk: eventId, code: code! } },
      });
      if (error) throw error;
      return data as OrderDetail;
    },
    enabled: !!eventId && !!code,
  });
}

export function useVoidOrder(code: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: OrderVoidBody) => {
      const { data, error } = await api.POST("/api/org/orders/{code}/void/", {
        params: { path: { code } },
        body,
      });
      if (error) throw error as ApiErrorShape;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useMarkRefunded(code: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { refund_reference: string }) => {
      const { data, error } = await api.POST("/api/org/orders/{code}/mark-refunded/", {
        params: { path: { code } },
        body,
      });
      if (error) throw error as ApiErrorShape;
      return data as OrderDetail;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useVoidTicket() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, body }: { code: string; body: OrderVoidBody }) => {
      const { data, error } = await api.POST("/api/org/tickets/{code}/void/", {
        params: { path: { code } },
        body,
      });
      if (error) throw error as ApiErrorShape;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useUndoCheckIn() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, body }: { code: string; body: UndoCheckInBody }) => {
      const { data, error } = await api.POST("/api/org/tickets/{code}/undo-checkin/", {
        params: { path: { code } },
        body,
      });
      if (error) throw error as ApiErrorShape;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useResendTickets(code: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/org/orders/{code}/resend-tickets/", {
        params: { path: { code } },
      });
      if (error) throw error as ApiErrorShape;
      return data as { sent: boolean; resends_today: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useEventAttendees(eventId: string, q?: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["events", eventId, "attendees", q ?? ""],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/events/{event_pk}/attendees/", {
        params: { path: { event_pk: eventId }, query: { q: q || undefined } },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });
}

/** El endpoint de CSV exige el header Authorization, así que no puede ser
 * un <a href> plano: se descarga como blob y se dispara la descarga. */
export function useDownloadOrdersCsv(eventId: string) {
  const { accessToken } = useSession();
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${PUBLIC_API_URL}/api/org/events/${eventId}/orders.csv`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("No se pudo exportar las órdenes.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ordenes-${eventId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
}

// ── Épica A: controles del evento en vivo (H01–H06) ──────────────────────────

export function useUnpublishEvent(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { reason?: string } = {}) => {
      const { data, error } = await api.POST("/api/org/events/{id}/unpublish/", {
        params: { path: { id } },
        body: { reason: body.reason ?? "" },
      });
      if (error) throw error as ApiErrorShape;
      return data;
    },
    onSuccess: () => invalidateEventCaches(queryClient, id),
  });
}

export function useDeleteEvent(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { reason: string; confirm_title: string }) => {
      const { error } = await api.DELETE("/api/org/events/{id}/", {
        params: { path: { id } },
        // @ts-expect-error — drf-spectacular no emite requestBody en DELETE aunque la API lo acepte
        body,
      });
      if (error) throw error as ApiErrorShape;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function usePauseSales(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (paused: boolean) => {
      const { data, error } = await api.POST("/api/org/events/{id}/pause-sales/", {
        params: { path: { id } },
        body: { paused },
      });
      if (error) throw error as ApiErrorShape;
      return data;
    },
    onSuccess: () => invalidateEventCaches(queryClient, id),
  });
}

export function useChangeImpact(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["events", id, "impact"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/events/{id}/change-impact/", {
        params: { path: { id } },
      });
      if (error) throw error as ApiErrorShape;
      return data;
    },
    enabled: !!id,
  });
}

export function useEventAudit(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["events", id, "audit"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/events/{id}/audit/", {
        params: { path: { id } },
      });
      if (error) throw error as ApiErrorShape;
      return data as PaginatedEventAudit;
    },
    enabled: !!id,
  });
}

export function useAnnounce(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { subject: string; message: string }) => {
      const { data, error } = await api.POST("/api/org/events/{id}/announce/", {
        params: { path: { id } },
        body,
      });
      if (error) throw error as ApiErrorShape;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events", id, "audit"] }),
  });
}

export function useCancelPreview(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["events", id, "cancel-preview"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/events/{id}/cancel-preview/", {
        params: { path: { id } },
      });
      if (error) throw error as ApiErrorShape;
      return data;
    },
    enabled: !!id,
  });
}

export function useCancelEvent(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { reason_code: ReasonCodeEnum; reason: string; confirm_title: string }) => {
      const { data, error } = await api.POST("/api/org/events/{id}/cancel/", {
        params: { path: { id } },
        body,
      });
      if (error) throw error as ApiErrorShape;
      return data;
    },
    onSuccess: () => invalidateEventCaches(queryClient, id),
  });
}

export function useAuditLogs() {
  const api = useApi();
  return useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/audit/", {});
      if (error) throw error as ApiErrorShape;
      return data;
    },
  });
}

export type { AuditLog };
