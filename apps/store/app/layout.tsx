import type { Metadata } from "next";
import type { ReactNode } from "react";

import { QueryProvider } from "@/lib/query-provider";
import { SessionProvider } from "@/lib/session";
import { PUBLIC_SITE_URL } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_URL),
  title: { default: "Club Rave", template: "%s — Club Rave" },
  description: "Asegura tu entrada. Recíbela al instante con un QR.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" data-app="store">
      <body>
        <QueryProvider>
          <SessionProvider>{children}</SessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
