import * as React from "react";

import { Img } from "../base/Img";
import { Badge } from "../base/Badge";
import { cn } from "../lib/cn";

export interface EventCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  coverImage?: string | null;
  dateLabel: string;
  venueLabel?: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  compact?: boolean;
}

const STATUS_LABEL: Record<EventCardProps["status"], string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  CANCELLED: "Cancelado",
};

const STATUS_VARIANT: Record<EventCardProps["status"], "neutral" | "mint" | "danger"> = {
  DRAFT: "neutral",
  PUBLISHED: "mint",
  CANCELLED: "danger",
};

/** Portada 16:9, título, fecha, lugar, estado. Variante compacta para el panel. */
export const EventCard = React.forwardRef<HTMLDivElement, EventCardProps>(
  ({ title, coverImage, dateLabel, venueLabel, status, compact, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "relative aspect-video w-full bg-[var(--color-surface-sunken)]",
          compact && "aspect-[3/1]"
        )}
      >
        {coverImage ? (
          <Img src={coverImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--color-text-subtle)]">
            Sin imagen
          </div>
        )}
        <Badge variant={STATUS_VARIANT[status]} className="absolute left-2 top-2">
          {STATUS_LABEL[status]}
        </Badge>
      </div>
      <div className={cn("flex flex-col gap-1", compact ? "p-3" : "p-4")}>
        <h3 className="truncate font-display text-base font-semibold">{title}</h3>
        <p className="truncate text-sm text-[var(--color-text-muted)]">
          {dateLabel}
          {venueLabel ? ` · ${venueLabel}` : ""}
        </p>
      </div>
    </div>
  )
);
EventCard.displayName = "EventCard";
