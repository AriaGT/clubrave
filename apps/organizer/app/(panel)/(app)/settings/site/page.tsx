"use client";

import { TopBar } from "@repo/ui";
import { useRouter } from "next/navigation";

import { SiteSettingsView } from "@/features/site/SiteSettingsView";
import { useSetSiteLogo, useSiteSettings, useUpdateSiteSettings } from "@/features/site/hooks";

export default function SiteSettingsPage() {
  const router = useRouter();
  const query = useSiteSettings();
  const update = useUpdateSiteSettings();
  const setLogo = useSetSiteLogo();

  return (
    <>
      <TopBar title="Sitio web" onBack={() => router.push("/settings")} />
      <div className="p-[var(--space-4)]">
        <SiteSettingsView query={query} update={update} setLogo={setLogo} />
      </div>
    </>
  );
}
