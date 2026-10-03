import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AdminSessionProvider } from "@/lib/admin-session";

// Ruta oculta: sin enlaces desde el panel y fuera de los buscadores. La
// protección real es `IsPlatformAdmin` en el backend.
export const metadata: Metadata = {
  title: "Club Rave — consola",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminSessionProvider>{children}</AdminSessionProvider>;
}
