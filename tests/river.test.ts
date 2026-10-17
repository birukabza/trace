import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analysisSchema, riverJson } from "../src/lib/server/river";

test("rejected model answers retain diagnostics without storing request credentials", async t => {
  const directory = mkdtempSync(join(tmpdir(), "trace-model-response-"));
  const priorKey = process.env.RIVER_API_KEY;
  process.env.RIVER_API_KEY = "test-only-request-secret";
  const cwd = t.mock.method(process, "cwd", () => directory);
  const content = JSON.stringify({ title: "Example", claims: [], plan: null, blockedReason: null });
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({
    choices: [{ finish_reason: "stop", message: { content } }], usage: { total_tokens: 42 },
  }));
  try {
    let message = "";
    await assert.rejects(riverJson("Test prompt", analysisSchema), error => {
      assert.ok(error instanceof Error);
      message = error.message;
      assert.match(message, /claims \(too_small\)/);
      assert.match(message, /No experiment was executed/);
      return true;
    });
    assert.equal(fetch.mock.callCount(), 1);
    const folder = join(directory, "data", "model-responses");
    const files = readdirSync(folder);
    assert.equal(files.length, 1);
    const raw = readFileSync(join(folder, files[0]), "utf8");
    const saved = JSON.parse(raw);
    assert.equal(saved.content, content);
    assert.equal(saved.kind, "invalid_schema");
    assert.equal(saved.issues[0].path, "claims");
    assert.ok(message.includes(saved.id));
    assert.doesNotMatch(raw, /test-only-request-secret|Authorization|Test prompt/);
  } finally {
    fetch.mock.restore();
    cwd.mock.restore();
    if (priorKey === undefined) delete process.env.RIVER_API_KEY;
    else process.env.RIVER_API_KEY = priorKey;
    rmSync(directory, { recursive: true, force: true });
  }
});
