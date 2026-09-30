import { LoadingState } from "@repo/ui";

/** Espera genérica para cualquier página de la tienda sin esqueleto propio:
 * la barra y el pie quedan fijos y el contenido avisa que viene en camino. */
export default function Loading() {
  return <LoadingState />;
}
