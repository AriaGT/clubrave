"use client";

import { Button, Logo, Sheet, SheetContent, cn } from "@repo/ui";
import { Building2, LayoutDashboard, LogOut, Menu, ScrollText, Globe, CreditCard, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useAdminSession } from "@/lib/admin-session";

const NAV = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard, exact: true },
  { href: "/admin/organizations", label: "Organizaciones", icon: Building2 },
  { href: "/admin/users", label: "Usuarios", icon: Users },
  { href: "/admin/payments", label: "Pagos", icon: CreditCard },
  { href: "/admin/site", label: "Sitio web", icon: Globe },
  { href: "/admin/audit", label: "Bitácora", icon: ScrollText },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
              active
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra lateral fija en escritorio; en el teléfono, barra superior con menú en un `Sheet`. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { logout } = useAdminSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    await logout();
    router.replace("/admin/login");
  };

  const brand = (
    <div className="flex items-center gap-2">
      <Logo size={28} />
      <span className="font-display font-semibold">Consola</span>
    </div>
  );

  const logoutButton = (
    <Button variant="ghost" size="sm" onClick={signOut} className="justify-start">
      <LogOut className="h-4 w-4" />
      Cerrar sesión
    </Button>
  );

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r border-[var(--color-border)] p-4 md:flex">
        {brand}
        <div className="flex-1">
          <NavLinks />
        </div>
        {logoutButton}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] p-3 md:hidden">
          {brand}
          <Button variant="secondary" size="sm" aria-label="Menú" onClick={() => setOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 p-[var(--space-4)] md:p-[var(--space-6)]">{children}</main>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Menú">
          <div className="flex flex-col gap-4">
            <NavLinks onNavigate={() => setOpen(false)} />
            {logoutButton}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {description && <p className="text-sm text-[var(--color-text-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}
