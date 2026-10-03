import { NextResponse } from "next/server";

import { clearAdminRefreshCookie, noStore } from "@/lib/auth-cookie";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearAdminRefreshCookie(res);
  return noStore(res);
}
