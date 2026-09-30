import { Img } from "@repo/ui";
import Link from "next/link";

import { BRAND_NAME } from "@/lib/site";

import { NavbarAccount } from "./NavbarAccount";

/** Barra superior de toda la tienda: la marca a la izquierda (logo del panel
 * o el nombre en texto) y la cuenta del comprador a la derecha. */
export function SiteNavbar({ logo }: { logo: string | null | undefined }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[var(--container-max)] items-center justify-between gap-4 px-[var(--space-4)] sm:px-[var(--space-6)]">
        <Link
          href="/"
          aria-label={`${BRAND_NAME} — inicio`}
          className="flex h-full items-center rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          {logo ? (
            <Img src={logo} alt={BRAND_NAME} className="h-9 w-auto max-w-[160px] object-contain" />
          ) : (
            <span className="font-display text-lg font-extrabold uppercase tracking-[0.18em] sm:text-xl">
              {BRAND_NAME}
            </span>
          )}
        </Link>
        <div className="flex items-center">
          <NavbarAccount />
        </div>
      </div>
    </header>
  );
}
