// Pruebas sin dependencias extra: `pnpm --filter @app/organizer test`
// (node --test con type stripping nativo de Node ≥ 22.6).
import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchRefresh, msUntilRefresh, singleFlight } from "./auth-refresh.ts";

function jwtWithExp(expSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
  return `x.${payload}.y`;
}

test("concurrent refreshes share a single request", async () => {
  let calls = 0;
  const refresh = singleFlight(async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));
    return "token";
  });
  const results = await Promise.all([refresh(), refresh(), refresh()]);
  assert.deepEqual(results, ["token", "token", "token"]);
  assert.equal(calls, 1);
  await refresh();
  assert.equal(calls, 2, "after settling, a new call starts a new request");
});

test("network errors and 5xx are transient, never a logout", async () => {
  const offline = await fetchRefresh(async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.equal(offline.kind, "transient");
  const down = await fetchRefresh(async () => new Response("bad gateway", { status: 502 }));
  assert.equal(down.kind, "transient");
  const unavailable = await fetchRefresh(async () => new Response("{}", { status: 503 }));
  assert.equal(unavailable.kind, "transient");
});

test("only an explicit 401/403 ends the session", async () => {
  const rejected = await fetchRefresh(async () => new Response("{}", { status: 401 }));
  assert.equal(rejected.kind, "unauthenticated");
});

test("a valid response yields the new access token", async () => {
  const ok = await fetchRefresh(async () => Response.json({ access: "abc" }));
  assert.deepEqual(ok, { kind: "ok", access: "abc" });
});

test("refresh is scheduled a margin before expiry", () => {
  const now = 1_000_000_000_000;
  const token = jwtWithExp(now / 1000 + 30 * 60);
  assert.equal(msUntilRefresh(token, now, 60_000), 29 * 60 * 1000);
  assert.equal(msUntilRefresh(jwtWithExp(now / 1000 - 5), now), 0);
  assert.equal(msUntilRefresh("garbage", now), 0);
});
