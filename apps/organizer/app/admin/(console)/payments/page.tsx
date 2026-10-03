"use client";

import { PaymentSettingsView } from "@/features/admin/PaymentSettingsView";
import { PageHeader } from "@/features/admin/AdminShell";
import { useAdminPaymentSettings, useUpdateAdminPaymentSettings } from "@/features/admin/hooks";

export default function AdminPaymentsPage() {
  const query = useAdminPaymentSettings();
  const update = useUpdateAdminPaymentSettings();
  return (
    <>
      <PageHeader title="Pagos" description="Modo de cobro y credenciales de las pasarelas de toda la plataforma." />
      <PaymentSettingsView query={query} update={update} saveBarBottom="0px" />
    </>
  );
}
