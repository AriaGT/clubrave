"use client";

import { ActivityBar } from "@repo/ui";
import { QueryClient, QueryClientProvider, useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <QueryActivity />
      {children}
    </QueryClientProvider>
  );
}

/** Barra global de actividad: primeras cargas (consultas sin datos todavía) y
 * mutaciones en curso. Los refrescos en segundo plano no cuentan: el usuario
 * ya ve datos y no tiene que esperar nada. */
function QueryActivity() {
  const firstLoads = useIsFetching({ predicate: (query) => query.state.data === undefined });
  const mutations = useIsMutating();
  return <ActivityBar active={firstLoads + mutations > 0} />;
}
