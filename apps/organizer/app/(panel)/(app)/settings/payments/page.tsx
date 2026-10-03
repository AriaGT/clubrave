"use client";

import { TopBar } from "@repo/ui";
import { useRouter } from "next/navigation";

import { PaymentSettingsView } from "@/features/payments/PaymentSettingsView";
import { usePaymentSettings, useUpdatePaymentSettings } from "@/features/payments/hooks";

export default function PaymentSettingsPage() {
  const router = useRouter();
  const query = usePaymentSettings();
  const update = useUpdatePaymentSettings();

  return (
    <>
      <TopBar title="Medios de pago" onBack={() => router.push("/settings")} />
      <div className="p-[var(--space-4)]">
        <PaymentSettingsView query={query} update={update} />
      </div>
    </>
  );
}
