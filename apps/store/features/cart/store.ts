"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Guarda ÚNICAMENTE { ticketTypeId → cantidad } — jamás precios (§11.5). El
 * carrito está aislado por evento: cambiar de evento lo vacía, porque no
 * tiene sentido pagar entradas de dos eventos en una sola orden (el
 * contrato de checkout es un solo `event_id`).
 */
interface CartState {
  eventId: string | null;
  eventSlug: string | null;
  lines: Record<string, number>;
  setEvent: (eventId: string, eventSlug: string) => void;
  setQuantity: (ticketTypeId: string, quantity: number) => void;
  clear: () => void;
  totalItems: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      eventId: null,
      eventSlug: null,
      lines: {},

      setEvent: (eventId, eventSlug) => {
        if (get().eventId !== eventId) set({ eventId, eventSlug, lines: {} });
      },

      setQuantity: (ticketTypeId, quantity) =>
        set((state) => {
          const lines = { ...state.lines };
          if (quantity <= 0) delete lines[ticketTypeId];
          else lines[ticketTypeId] = quantity;
          return { lines };
        }),

      clear: () => set({ lines: {} }),

      totalItems: () => Object.values(get().lines).reduce((sum, q) => sum + q, 0),
    }),
    { name: "umbral.cart" }
  )
);
