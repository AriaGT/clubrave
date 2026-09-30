import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/cn";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

/**
 * Hoja inferior en móvil, diálogo centrado en escritorio (§9.8). El carrito
 * y cualquier detalle secundario viven aquí en vez de en otra página.
 */
export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string }
>(({ className, children, title, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-[var(--radius-xl)] border-t border-[var(--color-border)]",
        "bg-[var(--color-bg-elevated)] shadow-[var(--elevation-sheet)] focus:outline-none",
        "sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-xl)]",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] p-[var(--space-4)]">
        <DialogPrimitive.Title className="font-display text-lg font-semibold">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Close className="rounded-[var(--radius-full)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]">
          <X className="h-5 w-5" />
        </DialogPrimitive.Close>
      </div>
      <div className="overflow-y-auto p-[var(--space-4)]">{children}</div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";
