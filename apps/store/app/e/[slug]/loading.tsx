import { Skeleton } from "@repo/ui";

/** Esqueleto de la página de un evento: al tocar una tarjeta o "Comprar
 * entradas" la respuesta es inmediata y nadie vuelve a tocar el enlace. */
export default function EventLoading() {
  return (
    <main
      className="mx-auto flex w-full max-w-[var(--container-max)] flex-col pb-28"
      aria-busy="true"
      aria-label="Cargando evento"
    >
      <Skeleton className="aspect-[4/5] w-full rounded-none sm:aspect-video" />
      <div className="flex flex-col gap-3 p-[var(--space-6)]">
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
