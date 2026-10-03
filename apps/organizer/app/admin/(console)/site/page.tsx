"use client";

import { SiteSettingsView } from "@/features/admin/SiteSettingsView";
import { PageHeader } from "@/features/admin/AdminShell";
import {
  useAdminSiteSettings,
  useSetAdminSiteLogo,
  useUpdateAdminSiteSettings,
} from "@/features/admin/hooks";

export default function AdminSitePage() {
  const query = useAdminSiteSettings();
  const update = useUpdateAdminSiteSettings();
  const setLogo = useSetAdminSiteLogo();
  return (
    <>
      <PageHeader title="Sitio web" description="Logo, contacto y redes de la tienda." />
      <SiteSettingsView query={query} update={update} setLogo={setLogo} saveBarBottom="0px" />
    </>
  );
}
