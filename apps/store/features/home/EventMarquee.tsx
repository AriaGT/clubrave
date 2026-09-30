import { dayNumber, monthShort } from "./format";
import type { EventListItem } from "./types";

/** Cinta que corre con los próximos eventos. Decorativa: la misma
 * información está en la grilla, así que se oculta a lectores de pantalla. */
export function EventMarquee({ events }: { events: EventListItem[] }) {
  const items = events.map((e) => `${e.title} · ${dayNumber(e.starts_at)} ${monthShort(e.starts_at)}`);
  // Se repite hasta llenar de sobra el ancho y se duplica para que el bucle no salte.
  const row = Array.from({ length: Math.max(2, Math.ceil(8 / items.length)) }, () => items).flat();

  return (
    <div
      aria-hidden="true"
      className="overflow-hidden border-y border-[var(--color-border-subtle)] bg-[var(--color-accent)] py-3 text-white"
    >
      <div className="flex w-max animate-[marquee_40s_linear_infinite] motion-reduce:animate-none">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0">
            {row.map((item, i) => (
              <span
                key={`${copy}-${i}`}
                className="flex items-center gap-6 pr-6 font-display text-sm font-bold uppercase tracking-[0.14em]"
              >
                {item}
                <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
