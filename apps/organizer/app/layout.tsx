import type { Metadata } from "next";
import type { ReactNode } from "react";

import { QueryProvider } from "@/lib/query-provider";
import { SessionProvider } from "@/lib/session";

import "./globals.css";

export const metadata: Metadata = {
  title: "Umbral — panel del organizador",
  description: "Crea eventos, gestiona entradas y valida el ingreso en la puerta.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" data-app="organizer">
      <body>
        <QueryProvider>
          <SessionProvider>{children}</SessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
