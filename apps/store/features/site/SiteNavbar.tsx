import Link from "next/link";

import { BRAND_NAME } from "@/lib/site";

/** Barra superior de toda la tienda: por ahora solo la marca, centrada. Sin
 * logo configurado se muestra el nombre en texto. */
export function SiteNavbar({ logo }: { logo: string | null | undefined }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[var(--container-max)] items-center justify-center px-[var(--space-4)]">
        <Link
          href="/"
          aria-label={`${BRAND_NAME} — inicio`}
          className="flex h-full items-center rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={BRAND_NAME} className="h-9 w-auto max-w-[180px] object-contain" />
          ) : (
            <span className="font-display text-xl font-extrabold uppercase tracking-[0.18em]">{BRAND_NAME}</span>
          )}
        </Link>
      </div>
    </header>
  );
}
