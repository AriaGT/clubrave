"use client";

import { AppShell, AppShellContent, BottomNav, LoadingState } from "@repo/ui";
import { Calendar, Home, QrCode, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "@/lib/session";

/** El portero solo tiene el escáner (el backend además le
 * responde 403 a cualquier otro endpoint). */
function isSecurityPath(pathname: string) {
  return pathname === "/scan" || pathname.startsWith("/scan/");
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, role } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const blockedForSecurity = role === "security" && !isSecurityPath(pathname);

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/login");
    } else if (status === "authenticated" && blockedForSecurity) {
      router.replace("/scan");
    }
  }, [status, blockedForSecurity, router]);

  if (status !== "authenticated" || blockedForSecurity) {
    return <LoadingState className="min-h-screen" />;
  }

  if (role === "security") {
    // Sin barra inferior: una sola tarea, pantalla completa para la puerta.
    return (
      <AppShell>
        <AppShellContent>{children}</AppShellContent>
      </AppShell>
    );
  }

  const items = [
    { key: "home", label: "Inicio", href: "/", icon: <Home className="h-5 w-5" />, active: pathname === "/" },
    {
      key: "events",
      label: "Eventos",
      href: "/events",
      icon: <Calendar className="h-5 w-5" />,
      active: pathname.startsWith("/events"),
    },
    { key: "scan", label: "Escanear", href: "/scan", icon: <QrCode className="h-5 w-5" />, accent: true },
    {
      key: "account",
      label: "Cuenta",
      href: "/account",
      icon: <User className="h-5 w-5" />,
      active: pathname.startsWith("/account"),
    },
  ];

  return (
    <AppShell>
      <AppShellContent>{children}</AppShellContent>
      <BottomNav items={items} linkComponent={Link} />
    </AppShell>
  );
}
