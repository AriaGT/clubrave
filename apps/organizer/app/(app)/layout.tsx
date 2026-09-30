"use client";

import { AppShell, AppShellContent, BottomNav, LoadingState } from "@repo/ui";
import { Calendar, Home, QrCode, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "@/lib/session";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return <LoadingState className="min-h-screen" />;
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
      key: "settings",
      label: "Ajustes",
      href: "/settings",
      icon: <Settings className="h-5 w-5" />,
      active: pathname.startsWith("/settings"),
    },
  ];

  return (
    <AppShell>
      <AppShellContent>{children}</AppShellContent>
      <BottomNav items={items} linkComponent={Link} />
    </AppShell>
  );
}
