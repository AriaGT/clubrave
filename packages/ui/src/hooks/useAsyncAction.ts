import * as React from "react";

export interface AsyncAction<Args extends unknown[], Result> {
  /** Ejecuta la acción. Mientras hay una en curso, las llamadas extra se
   * ignoran (devuelven `undefined`): un doble clic no dispara dos pedidos. */
  run: (...args: Args) => Promise<Result | undefined>;
  pending: boolean;
}

/**
 * Estado de carga para cualquier función asíncrona que no sea una mutación de
 * React Query (cerrar sesión, verificar un código, confirmar un pago). El
 * candado es un `ref`, no el estado: bloquea el segundo clic aunque llegue
 * antes de que React vuelva a pintar el botón deshabilitado. Los errores se
 * propagan tal cual, para que cada pantalla los muestre a su manera.
 */
export function useAsyncAction<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>
): AsyncAction<Args, Result> {
  const inFlight = React.useRef(false);
  const fnRef = React.useRef(fn);
  React.useEffect(() => {
    fnRef.current = fn;
  });
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(async (...args: Args) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setPending(true);
    try {
      return await fnRef.current(...args);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  return { run, pending };
}
