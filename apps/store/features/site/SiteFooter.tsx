import { Img } from "@repo/ui";
import { BookOpen, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { BRAND_NAME, type SiteSettings, whatsappLink } from "@/lib/site";

import { FacebookIcon, InstagramIcon, TikTokIcon, YouTubeIcon } from "./SocialIcons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const SOCIALS: { key: keyof SiteSettings; label: string; icon: Icon }[] = [
  { key: "instagram_url", label: "Instagram", icon: InstagramIcon },
  { key: "tiktok_url", label: "TikTok", icon: TikTokIcon },
  { key: "facebook_url", label: "Facebook", icon: FacebookIcon },
  { key: "youtube_url", label: "YouTube", icon: YouTubeIcon },
];

function FooterHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-subtle)]">
      {children}
    </h2>
  );
}

const linkClass =
  "inline-flex items-center gap-2.5 text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] rounded-[var(--radius-sm)]";

/** Pie global de la tienda. Todo sale de la consola de administración (Sitio web): lo que
 * está en blanco no se muestra, así que nunca hay enlaces rotos. */
export function SiteFooter({ settings }: { settings: SiteSettings | null }) {
  const socials = SOCIALS.filter((s) => settings?.[s.key]);
  const contact = [
    settings?.contact_phone && {
      href: `tel:${settings.contact_phone.replace(/[^\d+]/g, "")}`,
      label: settings.contact_phone,
      icon: Phone,
    },
    settings?.whatsapp && {
      href: whatsappLink(settings.whatsapp),
      label: "Escríbenos por WhatsApp",
      icon: MessageCircle,
      external: true,
    },
    settings?.contact_email && { href: `mailto:${settings.contact_email}`, label: settings.contact_email, icon: Mail },
  ].filter(Boolean) as { href: string; label: string; icon: Icon; external?: boolean }[];

  return (
    <footer className="relative mt-auto overflow-hidden border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]">
      <div aria-hidden="true" className="h-px w-full bg-[image:var(--gradient-accent)]" />

      <div className="relative mx-auto grid max-w-[var(--container-max)] gap-10 px-[var(--space-6)] pb-8 pt-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          {settings?.logo ? (
            <Img src={settings.logo} alt={BRAND_NAME} className="h-10 w-fit max-w-[200px] object-contain" />
          ) : (
            <span className="font-display text-2xl font-extrabold uppercase tracking-[0.18em]">{BRAND_NAME}</span>
          )}
          <p className="max-w-xs text-[var(--color-text-muted)]">
            {settings?.tagline || "Asegura tu entrada. Recíbela al instante con un QR."}
          </p>
          {socials.length > 0 && (
            <ul className="flex gap-2" aria-label="Redes sociales">
              {socials.map(({ key, label, icon: SocialIcon }) => (
                <li key={key}>
                  <a
                    href={settings?.[key] as string}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${BRAND_NAME} en ${label}`}
                    className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-full)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] transition-[border-color,box-shadow,color] duration-[var(--duration-fast)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent-text)] hover:shadow-[var(--glow-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                  >
                    <SocialIcon className="h-5 w-5" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(contact.length > 0 || settings?.address) && (
          <div className="flex flex-col gap-4">
            <FooterHeading>Contacto</FooterHeading>
            <ul className="flex flex-col gap-3">
              {contact.map(({ href, label, icon: ContactIcon, external }) => (
                <li key={href}>
                  <a href={href} className={linkClass} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
                    <ContactIcon className="h-4 w-4 shrink-0 text-[var(--color-accent-text)]" />
                    {label}
                  </a>
                </li>
              ))}
              {settings?.address && (
                <li className="flex items-start gap-2.5 text-[var(--color-text-muted)]">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent-text)]" />
                  {settings.address}
                </li>
              )}
            </ul>
          </div>
        )}

        <nav className="flex flex-col gap-4" aria-label="Enlaces del sitio">
          <FooterHeading>Explora</FooterHeading>
          <ul className="flex flex-col gap-3">
            <li>
              <Link href="/#eventos" className={linkClass}>
                Próximos eventos
              </Link>
            </li>
            <li>
              <Link href="/account/tickets" className={linkClass}>
                Mis entradas
              </Link>
            </li>
            <li>
              <Link href="/terms" className={linkClass}>
                Términos y condiciones
              </Link>
            </li>
            {settings?.complaints_book_url && (
              <li>
                <a href={settings.complaints_book_url} target="_blank" rel="noreferrer" className={linkClass}>
                  <BookOpen className="h-4 w-4 shrink-0 text-[var(--color-accent-text)]" />
                  Libro de Reclamaciones
                </a>
              </li>
            )}
          </ul>
        </nav>
      </div>

      <div className="relative mx-auto flex max-w-[var(--container-max)] flex-col gap-2 border-t border-[var(--color-border-subtle)] px-[var(--space-6)] py-6 text-sm text-[var(--color-text-subtle)] sm:flex-row sm:items-center sm:justify-between">
        <span>
          © {new Date().getFullYear()} {BRAND_NAME}. Todos los derechos reservados.
        </span>
        <span>Entradas digitales con QR · Pago seguro</span>
      </div>

      {/* Marca de agua: el nombre gigante en contorno, solo decorativo. */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none overflow-hidden whitespace-nowrap text-center font-display text-[18vw] font-extrabold uppercase leading-[0.8] tracking-tight text-transparent [-webkit-text-stroke:1px_var(--color-border)] md:text-[12rem]"
      >
        {BRAND_NAME}
      </div>
    </footer>
  );
}
