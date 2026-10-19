import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { riverJson } from "../src/lib/server/river";

const schema = z.object({ answer: z.string() });

async function withKey<T>(run: () => Promise<T>) {
  const prior = process.env.RIVER_API_KEY;
  process.env.RIVER_API_KEY = "test-only-key";
  try { return await run(); }
  finally { if (prior === undefined) delete process.env.RIVER_API_KEY; else process.env.RIVER_API_KEY = prior; }
}

test("a response that runs out of room is retried with lighter reasoning", async t => {
  const bodies: { reasoning_effort: string; max_tokens: number }[] = [];
  const fetch = t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return bodies.length === 1
      ? Response.json({ choices: [{ finish_reason: "length", message: { content: "" } }] })
      : Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ answer: "ok" }) } }] });
  });
  try {
    assert.deepEqual(await withKey(() => riverJson("prompt", schema)), { answer: "ok" });
    assert.equal(fetch.mock.callCount(), 2);
    assert.equal(bodies[0].reasoning_effort, "high");
    assert.equal(bodies[1].reasoning_effort, "medium");
    assert.ok(bodies[0].max_tokens >= 65_536, "the first attempt has a large output budget");
  } finally { fetch.mock.restore(); }
});

test("a response that runs out of room twice fails with a clear message", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ finish_reason: "length", message: { content: "" } }] }));
  try {
    await assert.rejects(withKey(() => riverJson("prompt", schema)), /ran out of room.*Try again/);
    assert.equal(fetch.mock.callCount(), 2);
  } finally { fetch.mock.restore(); }
});

test("a dropped connection to the agent API is retried", async t => {
  let calls = 0;
  const timers = t.mock.timers;
  timers.enable({ apis: ["setTimeout"] });
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls === 1) throw new TypeError("fetch failed");
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ answer: "ok" }) } }] });
  });
  try {
    const pending = withKey(() => riverJson("prompt", schema));
    for (let i = 0; i < 20 && calls < 2; i++) { await new Promise(resolve => setImmediate(resolve)); timers.tick(10_000); }
    assert.deepEqual(await pending, { answer: "ok" });
    assert.equal(calls, 2);
  } finally { fetch.mock.restore(); timers.reset(); }
});
