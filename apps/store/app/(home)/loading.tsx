import { Skeleton } from "@repo/ui";

/** Esqueleto de la portada: aparece al instante al volver al inicio mientras
 * el servidor arma la cartelera. Tiene la forma del hero + grilla. */
export default function HomeLoading() {
  return (
    <main className="flex flex-col" aria-busy="true" aria-label="Cargando eventos">
      <div className="mx-auto grid min-h-[min(88svh,720px)] w-full max-w-[var(--container-max)] items-center gap-8 px-[var(--space-6)] py-12 md:grid-cols-[1.15fr_0.85fr]">
        <div className="order-2 flex flex-col items-center gap-4 md:order-1 md:items-start">
          <Skeleton className="h-6 w-40 rounded-[var(--radius-full)]" />
          <Skeleton className="h-14 w-full max-w-md" />
          <Skeleton className="h-14 w-3/4 max-w-sm" />
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-13 w-48" />
        </div>
        <Skeleton className="order-1 mx-auto aspect-[4/5] w-[min(68vw,300px)] rounded-[var(--radius-xl)] md:order-2 md:w-full md:max-w-[400px]" />
      </div>
      <div className="mx-auto grid w-full max-w-[var(--container-max)] grid-cols-2 gap-3 px-[var(--space-6)] pb-12 sm:gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-[var(--radius-lg)]" />
        ))}
      </div>
    </main>
  );
}
