import { NextResponse } from "next/server";

import { API_URL } from "@/lib/env";

/** Pide el código de un solo uso. Siempre 202: no filtra si el email tiene cuenta. */
export async function POST(request: Request) {
  const body = await request.json();
  const response = await fetch(`${API_URL}/api/auth/customer/request-code/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return new NextResponse(null, { status: response.status });
}
