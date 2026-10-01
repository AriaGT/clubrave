"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * `false` en el servidor y en el primer render de hidratación del cliente,
 * `true` después. Sirve para no pintar estado que solo existe en el navegador
 * (localStorage) hasta que React termine de hidratar: si se pinta antes, el
 * HTML del cliente no coincide con el del servidor.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
