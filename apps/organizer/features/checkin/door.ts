"use client";

import type { ApiComponents } from "@repo/api-client";
import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/lib/api";

export type DoorEvent = ApiComponents["schemas"]["DoorEvent"];

/** Eventos habilitados para escanear (organizador y portero). Para
 * el portero incluye solo sus eventos asignados que aún no terminaron, con la
 * ventana del escáner ya calculada por el backend. */
export function useDoorEvents() {
  const api = useApi();
  return useQuery({
    queryKey: ["door-events"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/door/events/");
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000, // la ventana se abre sola a la hora: que la lista se entere
  });
}

export function useDoorEvent(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: ["door-events", id],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/org/door/events/{id}/", {
        params: { path: { id: id! } },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    refetchInterval: 60_000,
  });
}

const DATE_FORMAT = new Intl.DateTimeFormat("es-PE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Lima",
});
const TIME_FORMAT = new Intl.DateTimeFormat("es-PE", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Lima",
});

/** "el sábado 12 de octubre a las 19:00" */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  return `el ${DATE_FORMAT.format(date)} a las ${TIME_FORMAT.format(date)}`;
}

/** Mensaje para el portero cuando el escáner no está abierto. */
export function scannerClosedMessage(event: Pick<DoorEvent, "scanner_opens_at" | "scanner_closes_at">): string {
  if (Date.now() < new Date(event.scanner_opens_at).getTime()) {
    return `El escáner se habilita ${formatWhen(event.scanner_opens_at)}.`;
  }
  return `El escáner de este evento cerró ${formatWhen(event.scanner_closes_at)}.`;
}
