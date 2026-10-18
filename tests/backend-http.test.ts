import assert from "node:assert/strict";
import test from "node:test";
import { createBackendHandler, type BackendDependencies } from "../backend/http";
import type { Run } from "../src/lib/types";
import { createHttpServer } from "../backend/transport";
import { tokenAuthenticator } from "../backend/auth";
import { PublicRunError } from "../src/lib/server/http";

const fixture: Run = { id: "run-one", sourceUrl: "https://arxiv.org/abs/0909.4061", title: "A paper", status: "completed", createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z", claims: [], attempts: [], events: [], mode: "live" };

function setup(overrides: Partial<BackendDependencies> = {}) {
  const calls: { operation: string; owner: string; input?: unknown }[] = [];
  const dependencies: BackendDependencies = {
    authenticate: async (token) => token === "valid-token" ? { id: "verified-user", emailConfirmedAt: "2026-10-18T00:00:00Z" } : null,
    configuration: () => ({ riverConfigured: true }),
    listRuns(owner) { calls.push({ operation: "list", owner }); return [fixture]; },
    getRun(id, owner) { calls.push({ operation: "get", owner }); return owner === "verified-user" && id === fixture.id ? fixture : undefined; },
    createRun(input, owner) { calls.push({ operation: "create", owner, input }); return fixture; },
    approveRun(_id, input, owner) { calls.push({ operation: "approve", owner, input }); return fixture; },
    cancelRun(_id, owner) { calls.push({ operation: "cancel", owner }); return fixture; },
    markdownReport: () => "# Report",
    ...overrides,
  };
  return { handler: createBackendHandler(dependencies, "https://trace.example"), calls };
}

function request(path: string, options: RequestInit = {}, authenticated = true) {
  const headers = new Headers(options.headers);
  if (authenticated) headers.set("Authorization", "Bearer valid-token");
  return new Request(`http://backend${path}`, { ...options, headers });
}

test("only the minimal liveness route is public", async () => {
  const { handler, calls } = setup();
  assert.deepEqual(await (await handler(request("/healthz", {}, false))).json(), { ok: true });
  for (const path of ["/api/health", "/api/runs", "/api/runs/run-one", "/api/runs/run-one/events", "/api/runs/run-one/report"]) {
    assert.equal((await handler(request(path, {}, false))).status, 401);
  }
  assert.equal(calls.length, 0);
});

test("rejects unverified sessions before run access", async () => {
  const { handler, calls } = setup({ authenticate: async () => null });
  assert.equal((await handler(request("/api/runs"))).status, 401);
  assert.equal(calls.length, 0);
});

test("expired and unconfirmed Supabase identities cannot access run data", async () => {
  for (const provider of [
    { auth: { getUser: async () => ({ data: { user: null }, error: { message: "JWT expired", status: 401 } }) } },
    { auth: { getUser: async () => ({ data: { user: { id: "unconfirmed-user", email_confirmed_at: null } }, error: null }) } },
  ]) {
    const { handler, calls } = setup({ authenticate: tokenAuthenticator(provider) });
    for (const path of ["/api/runs", "/api/runs/run-one", "/api/runs/run-one/report", "/api/health"]) {
      assert.equal((await handler(request(path))).status, 401);
    }
    assert.equal(calls.length, 0);
  }
});

test("token verification forwards the bearer token to Supabase and retains confirmation", async () => {
  let supplied = "";
  const authenticate = tokenAuthenticator({ auth: { async getUser(token) {
    supplied = token;
    return { data: { user: { id: "verified-user", email_confirmed_at: "2026-10-18T00:00:00Z" } }, error: null };
  } } });
  const { handler, calls } = setup({ authenticate });
  assert.equal((await handler(request("/api/runs"))).status, 200);
  assert.equal(supplied, "valid-token");
  assert.equal(calls[0]?.owner, "verified-user");
});

test("missing auth configuration leaves only liveness available", async () => {
  const { handler, calls } = setup({ authenticationConfigured: false });
  assert.equal((await handler(request("/healthz", {}, false))).status, 200);
  for (const authenticated of [false, true]) assert.equal((await handler(request("/api/runs", {}, authenticated))).status, 503);
  assert.equal(calls.length, 0);
});

test("all run operations use the verified identity, ignoring supplied owner headers", async () => {
  const { handler, calls } = setup();
  for (const path of ["/api/runs", "/api/runs/run-one", "/api/runs/run-one/report"]) {
    assert.equal((await handler(request(path, { headers: { "x-user-id": "attacker" } }))).status, 200);
  }
  const created = await handler(request("/api/runs", { method: "POST", headers: { "content-type": "application/json", "x-user-id": "attacker" }, body: JSON.stringify({ sourceUrl: fixture.sourceUrl, ownerId: "attacker" }) }));
  assert.equal(created.status, 201);
  assert.ok(calls.length >= 4);
  assert.ok(calls.every((call) => call.owner === "verified-user"));
});

test("foreign and missing runs are indistinguishable and cannot be mutated", async () => {
  const { handler, calls } = setup({ getRun: () => undefined });
  for (const action of ["", "/report", "/events", "/approve", "/cancel"]) {
    const response = await handler(request(`/api/runs/foreign${action}`, action === "/approve" || action === "/cancel" ? { method: "POST", headers: { "content-type": "application/json" }, body: "{}" } : {}));
    assert.equal(response.status, 404);
  }
  assert.equal(calls.length, 0);
});

test("writes enforce bounded JSON and an exact allowed origin", async () => {
  const { handler, calls } = setup();
  const write = (body: string, headers = {}) => handler(request("/api/runs", { method: "POST", headers: { "content-type": "application/json", ...headers }, body }));
  assert.equal((await write("{}", { origin: "https://evil.example" })).status, 403);
  assert.equal((await write(JSON.stringify({ text: "x".repeat(16_384) }))).status, 413);
  assert.equal((await write("[]")).status, 400);
  assert.equal((await write("{" )).status, 400);
  assert.equal((await write("{}", { origin: "https://trace.example" })).status, 201);
  assert.equal(calls.filter((call) => call.operation === "create").length, 1);
});

test("reports and events have no-store headers and retain owner checks", async () => {
  const { handler, calls } = setup();
  const report = await handler(request("/api/runs/run-one/report"));
  assert.equal(await report.text(), "# Report");
  assert.equal(report.headers.get("cache-control"), "no-store");
  const events = await handler(request("/api/runs/run-one/events"));
  assert.match(await events.text(), /event: run\ndata: /);
  assert.equal(events.headers.get("cache-control"), "no-store, no-transform");
  assert.ok(calls.every((call) => call.owner === "verified-user"));
});

test("unexpected failures do not expose provider secrets", async () => {
  const { handler } = setup({ listRuns() { throw new Error("provider secret sk-real-secret"); } });
  const response = await handler(request("/api/runs"));
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /sk-real-secret|provider secret/);
});

test("typed public run errors retain their safe status and message", async () => {
  const { handler } = setup({ createRun() { throw new PublicRunError("Wait for your active investigation to finish.", 409); } });
  const response = await handler(request("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "Wait for your active investigation to finish." });
});

test("native HTTP transport returns guarded and bounded responses", async () => {
  const { handler } = setup();
  const server = createHttpServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(`${url}/healthz`)).status, 200);
    assert.equal((await fetch(`${url}/api/runs`)).status, 401);
    const response = await fetch(`${url}/api/runs`, {
      method: "POST", headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(20_000) }),
    });
    assert.equal(response.status, 413);
    assert.match(await response.text(), /too large/);
    const chunked = await fetch(`${url}/api/runs`, {
      method: "POST", headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
      body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(`{"text":"${"x".repeat(20_000)}"}`)); controller.close(); } }),
      duplex: "half",
    } as RequestInit);
    assert.equal(chunked.status, 413);
    assert.match(await chunked.text(), /too large/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
