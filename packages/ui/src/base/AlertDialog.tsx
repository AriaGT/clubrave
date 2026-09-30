import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";

import { cn } from "../lib/cn";

/**
 * Diálogo modal que **no** se cierra al tocar fuera ni con `Esc`: en una
 * acción destructiva hay que decidir (H15). Se apoya en
 * `@radix-ui/react-dialog`, que ya es dependencia — sin paquetes nuevos.
 */
export const AlertDialog = DialogPrimitive.Root;
export const AlertDialogTrigger = DialogPrimitive.Trigger;
export const AlertDialogClose = DialogPrimitive.Close;

export interface AlertDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  title: string;
  description?: string;
}

export const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  AlertDialogContentProps
>(({ className, children, title, description, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60" />
    <DialogPrimitive.Content
      ref={ref}
      onPointerDownOutside={(event) => event.preventDefault()}
      onInteractOutside={(event) => event.preventDefault()}
      onEscapeKeyDown={(event) => event.preventDefault()}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-[var(--space-4)]",
        "overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-[var(--space-5)]",
        "shadow-[var(--elevation-modal)] focus:outline-none",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <DialogPrimitive.Title className="font-display text-lg font-semibold text-[var(--color-text)]">
          {title}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description
          className={cn("text-sm text-[var(--color-text-muted)]", !description && "sr-only")}
        >
          {description ?? title}
        </DialogPrimitive.Description>
      </div>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
AlertDialogContent.displayName = "AlertDialogContent";
