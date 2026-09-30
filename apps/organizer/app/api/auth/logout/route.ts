import { NextResponse } from "next/server";

import { REFRESH_COOKIE } from "@/lib/env";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(REFRESH_COOKIE);
  return res;
}
