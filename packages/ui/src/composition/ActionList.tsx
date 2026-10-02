import { ChevronRight } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/cn";

export interface ActionGroupProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
}

/**
 * Lista agrupada de filas (estilo ajustes): un título corto y las filas
 * separadas por una línea, dentro de una sola tarjeta. Agrupa por tarea para
 * que el organizador no tenga que leer todas las opciones.
 */
export function ActionGroup({ title, className, children, ...props }: ActionGroupProps) {
  return (
    <section className={cn("flex flex-col gap-2", className)} aria-label={title} {...props}>
      {title && (
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-subtle)]">{title}</h2>
      )}
      <div className="flex flex-col divide-y divide-[var(--color-border-subtle)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {children}
      </div>
    </section>
  );
}

export interface ActionRowProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** Dato a la derecha antes del chevron (un conteo, un badge, un `Switch`…). */
  meta?: React.ReactNode;
  href?: string;
  /** Componente de enlace de la app anfitriona (p. ej. `next/link`). */
  linkComponent?: React.ElementType;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** `accent` destaca la acción principal del grupo; `danger`, una destructiva. */
  tone?: "default" | "accent" | "danger";
  /** Oculta el chevron (filas que no navegan, p. ej. con un `Switch`). */
  hideChevron?: boolean;
  className?: string;
}

const ICON_TONE: Record<NonNullable<ActionRowProps["tone"]>, string> = {
  default: "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]",
  accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]",
  danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
};

/** Fila con ícono, título, descripción y chevron: navega (`href`) o ejecuta (`onClick`). */
export function ActionRow({
  icon,
  title,
  description,
  meta,
  href,
  linkComponent: Link = "a",
  onClick,
  disabled,
  loading,
  tone = "default",
  hideChevron,
  className,
}: ActionRowProps) {
  const interactive = !!href || !!onClick;
  const content = (
    <>
      {icon && (
        <span
          aria-hidden
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] [&>svg]:h-[18px] [&>svg]:w-[18px]",
            ICON_TONE[tone]
          )}
        >
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("font-medium", tone === "danger" && "text-[var(--color-danger)]")}>{title}</span>
        {description && <span className="text-sm text-[var(--color-text-muted)]">{description}</span>}
      </span>
      {meta && <span className="flex shrink-0 items-center gap-2 text-sm text-[var(--color-text-muted)]">{meta}</span>}
      {loading && (
        <span
          aria-hidden
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--color-text-subtle)] border-t-transparent"
        />
      )}
      {interactive && !hideChevron && !loading && (
        <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-[var(--color-text-subtle)]" />
      )}
    </>
  );

  const base = cn(
    "flex w-full items-center gap-3 px-[var(--space-4)] py-3 text-left",
    interactive &&
      "transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-hover)]",
    disabled && "pointer-events-none opacity-50",
    className
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={base}>
        {content}
      </Link>
    );
  }
  if (onClick || href) {
    return (
      <button
        type="button"
        className={base}
        onClick={onClick}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
      >
        {content}
      </button>
    );
  }
  return <div className={base}>{content}</div>;
}
