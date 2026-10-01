import { Skeleton } from "@repo/ui";

/** Esqueleto de la página de un evento: al tocar una tarjeta o "Comprar
 * entradas" la respuesta es inmediata y nadie vuelve a tocar el enlace.
 * Replica el layout de EventPageClient para que no salte al cargar. */
export default function EventLoading() {
  return (
    <main
      className="mx-auto w-full max-w-[var(--container-max)] pb-28 lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-x-12 lg:px-[var(--space-6)] lg:pt-8"
      aria-busy="true"
      aria-label="Cargando evento"
    >
      <Skeleton className="aspect-[4/5] w-full rounded-none sm:aspect-video lg:aspect-[4/5] lg:rounded-[var(--radius-lg)]" />
      <div className="flex min-w-0 flex-col gap-3 p-[var(--space-6)] lg:px-0 lg:pt-0">
        <Skeleton className="h-7 w-32" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-10 w-28 rounded-[var(--radius-full)]" />
          </div>
        ))}
      </div>
    </main>
  );
}
