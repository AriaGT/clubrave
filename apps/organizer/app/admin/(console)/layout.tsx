"use client";

import { LoadingState } from "@repo/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AdminShell } from "@/features/admin/AdminShell";
import { useAdminSession } from "@/lib/admin-session";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAdminSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") router.replace("/admin/login");
  }, [status, router]);

  if (status !== "authenticated") return <LoadingState className="min-h-screen" />;
  return <AdminShell>{children}</AdminShell>;
}
