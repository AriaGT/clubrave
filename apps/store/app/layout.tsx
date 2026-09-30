import type { Metadata } from "next";
import type { ReactNode } from "react";

import { QueryProvider } from "@/lib/query-provider";
import { SessionProvider } from "@/lib/session";
import { PUBLIC_SITE_URL } from "@/lib/env";
import { getSiteSettings } from "@/lib/site";
import { SiteFooter } from "@/features/site/SiteFooter";
import { SiteNavbar } from "@/features/site/SiteNavbar";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_URL),
  title: { default: "Club Rave", template: "%s — Club Rave" },
  description: "Asegura tu entrada. Recíbela al instante con un QR.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const settings = await getSiteSettings();

  return (
    <html lang="es" data-app="store">
      <body className="flex min-h-dvh flex-col">
        <QueryProvider>
          <SessionProvider>
            <SiteNavbar logo={settings?.logo} />
            <div className="flex flex-1 flex-col">{children}</div>
            <SiteFooter settings={settings} />
          </SessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
