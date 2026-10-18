import test from "node:test";
import assert from "node:assert/strict";
import { startSandbox, friendlySandboxError } from "../src/lib/server/sandbox";

/** A fake sandbox whose status follows a script, one step per refresh. */
function fakeSandbox(statuses: string[], options: { resumeThrows?: boolean } = {}) {
  let index = 0;
  const calls = { resume: 0 };
  const box = {
    status: statuses[0],
    async refresh() { index = Math.min(index + 1, statuses.length - 1); box.status = statuses[index]; },
    async resume() { calls.resume++; if (options.resumeThrows) throw new Error("409"); },
  };
  return { box: box as never, calls };
}

const signal = new AbortController().signal;

test("a sandbox that wakes normally is reported as started", async () => {
  const { box, calls } = fakeSandbox(["paused", "paused", "resuming", "running"]);
  assert.equal(await startSandbox(box, signal, 1), true);
  assert.equal(calls.resume, 1);
});

test("a sandbox that falls back to paused after resuming is reported as not started", async () => {
  const { box, calls } = fakeSandbox(["paused", "paused", "resuming", "resuming", "paused", "paused"]);
  assert.equal(await startSandbox(box, signal, 1), false);
  assert.equal(calls.resume, 1, "it must not keep retrying a broken sandbox");
});

test("a newly created sandbox is waited on without resuming", async () => {
  const { box, calls } = fakeSandbox(["creating", "creating", "running"]);
  assert.equal(await startSandbox(box, signal, 1), true);
  assert.equal(calls.resume, 0);
});

test("error states and rejected resumes are reported as not started", async () => {
  assert.equal(await startSandbox(fakeSandbox(["error", "error"]).box, signal, 1), false);
  assert.equal(await startSandbox(fakeSandbox(["paused", "paused"], { resumeThrows: true }).box, signal, 1), false);
});

test("raw sandbox timeouts become a message people can act on", () => {
  assert.match(friendlySandboxError("Timed out after 180000ms waiting for the expected state."), /sandbox did not start.*Run it again/i);
  assert.equal(friendlySandboxError("Paper text could not be extracted."), "Paper text could not be extracted.");
});
