import type { ReactNode } from "react";

import { SessionProvider } from "@/lib/session";

/** Sesión del organizador y del portero. La consola (`/admin`) vive fuera de
 * este grupo a propósito: tiene su propia sesión y no debe intentar refrescar
 * la cookie del panel. */
export default function PanelLayout({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
