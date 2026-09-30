import type { Metadata } from "next";
import { Suspense } from "react";

import { GuestRedeemFlow } from "@/features/guest/GuestRedeemFlow";

export const metadata: Metadata = {
  title: "Canjea tu invitación",
  robots: { index: false }, // la URL lleva el código: nunca a los buscadores
};

export default function GuestRedeemPage() {
  return (
    <Suspense fallback={null}>
      <GuestRedeemFlow />
    </Suspense>
  );
}
