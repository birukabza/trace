import test from "node:test";
import assert from "node:assert/strict";
import { runAgentLoop, type AgentAttempt, type AgentExecution, type CodeRepair } from "../src/lib/server/agent-loop";

const failed: AgentExecution = { stdout: "starting\n", stderr: "NameError: missing variable", exitCode: 1, durationMs: 7 };
const succeeded: AgentExecution = { stdout: '{"score":0.95}\n', stderr: "", exitCode: 0, durationMs: 9 };
const revision = (code: string): CodeRepair => ({ action: "repair", diagnosis: "A variable was undefined.", summary: "Define the missing variable.", pythonCode: code });
const observers = { onAttempt() {}, onRepairing() {}, onRevision() {} };

test("invalid measurements trigger repair while preserving the real successful process exit", async () => {
  const invalid = { ...succeeded, stdout: '{"score":0.95}', validationError: 'Missing metrics object' };
  const attempts: AgentAttempt[] = [];
  let repaired = false;
  const result = await runAgentLoop({ ...observers, initialCode: "original program",
    execute: async (_code, number) => number === 1 ? invalid : { ...succeeded, stdout: '{"metrics":{"score":0.95}}' },
    repair: async history => { assert.equal(history[0].output.exitCode, 0); assert.equal(history[0].output.validationError, 'Missing metrics object'); repaired = true; return revision("corrected serialization"); },
    onAttempt: attempt => { attempts.push(attempt); },
  });
  assert.equal(repaired, true);
  assert.equal(result.status, "succeeded");
  assert.deepEqual(attempts.map(attempt => attempt.output.exitCode), [0, 0]);
  assert.equal(attempts[0].output.stderr, "");
});

test("a failed execution is preserved, repaired from its real logs, and run again", async () => {
  const events: string[] = [];
  const attempts: AgentAttempt[] = [];
  const result = await runAgentLoop({
    initialCode: "broken code",
    async execute(code, number) {
      events.push(`execute:${number}:${code}`);
      return number === 1 ? failed : succeeded;
    },
    async repair(history) {
      events.push("repair");
      assert.deepEqual(history, [{ number: 1, code: "broken code", output: failed }]);
      return revision("fixed code");
    },
    onAttempt(attempt) { attempts.push(attempt); events.push(`saved:${attempt.number}`); },
    onRepairing(number) { events.push(`repairing:${number}`); },
    onRevision(repair, number) { events.push(`revision:${number}:${repair.pythonCode}`); },
  });
  assert.deepEqual(result, { status: "succeeded" });
  assert.deepEqual(events, ["execute:1:broken code", "saved:1", "repairing:1", "repair", "revision:2:fixed code", "execute:2:fixed code", "saved:2"]);
  assert.deepEqual(attempts.map(({ number, code, output, changeReason }) => ({ number, code, output, changeReason })), [
    { number: 1, code: "broken code", output: failed, changeReason: undefined },
    { number: 2, code: "fixed code", output: succeeded, changeReason: "Define the missing variable." },
  ]);
});

test("the execution budget includes the initial attempt and does not request an unusable final repair", async () => {
  let executions = 0;
  let repairs = 0;
  const result = await runAgentLoop({ ...observers, initialCode: "v1", maxAttempts: 3,
    async execute() { executions++; return failed; },
    async repair(history) { repairs++; assert.equal(history.length, repairs); return revision(`v${repairs + 1}`); },
  });
  assert.equal(result.status, "exhausted");
  assert.equal(executions, 3);
  assert.equal(repairs, 2);
});

test("success needs no repair, and a stop decision needs no second execution", async () => {
  let repairs = 0;
  let executions = 0;
  const options = { ...observers, initialCode: "v1", async execute() { executions++; return succeeded; },
    async repair(): Promise<CodeRepair> { repairs++; return { action: "stop", reason: "The numerical library is unavailable." }; },
  };
  assert.equal((await runAgentLoop(options)).status, "succeeded");
  assert.equal(repairs, 0);
  const stopped = await runAgentLoop({ ...options, async execute() { executions++; return failed; } });
  assert.deepEqual(stopped, { status: "stopped", reason: "The numerical library is unavailable." });
  assert.equal(executions, 2);
  assert.equal(repairs, 1);
});

test("an unchanged repair stops without executing the same code again", async () => {
  let executions = 0;
  let revisions = 0;
  const result = await runAgentLoop({ ...observers, initialCode: "v1\n",
    async execute() { executions++; return failed; }, async repair() { return revision("v1"); },
    onRevision() { revisions++; },
  });
  assert.equal(result.status, "stopped");
  assert.match(result.reason!, /unchanged code/);
  assert.equal(executions, 1);
  assert.equal(revisions, 0);
});

test("cancellation while waiting for repair prevents revision callbacks and later execution", async () => {
  const controller = new AbortController();
  let completeRepair!: (value: CodeRepair) => void;
  let startedRepair!: () => void;
  const repairing = new Promise<void>(resolve => { startedRepair = resolve; });
  const pendingRepair = new Promise<CodeRepair>(resolve => { completeRepair = resolve; });
  let executions = 0;
  let revisions = 0;
  const pending = runAgentLoop({ ...observers, initialCode: "v1", signal: controller.signal,
    async execute() { executions++; return failed; },
    async repair() { startedRepair(); return pendingRepair; },
    onRevision() { revisions++; },
  });
  await repairing;
  controller.abort();
  completeRepair(revision("v2"));
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(executions, 1);
  assert.equal(revisions, 0);
});

test("cancellation in each awaited observer prevents subsequent actions", async () => {
  for (const stage of ["execute", "onAttempt", "onRepairing", "onRevision"] as const) {
    const controller = new AbortController();
    const events: string[] = [];
    const stopAt = (name: string) => { events.push(name); if (name === stage) controller.abort(); };
    await assert.rejects(runAgentLoop({ initialCode: "v1", signal: controller.signal,
      async execute() { stopAt("execute"); return failed; },
      async repair() { events.push("repair"); return revision("v2"); },
      onAttempt() { stopAt("onAttempt"); }, onRepairing() { stopAt("onRepairing"); }, onRevision() { stopAt("onRevision"); },
    }), { name: "AbortError" });
    assert.equal(events.at(-1), stage);
  }
});

test("callback and repair snapshots cannot mutate retained execution history", async () => {
  let repairs = 0;
  const output = { ...failed };
  const executedCode: string[] = [];
  const result = await runAgentLoop({ ...observers, initialCode: "original code",
    async execute(code) { executedCode.push(code); return output; },
    onAttempt(attempt) { attempt.code = "observer replacement"; attempt.output.stderr = "observer replacement"; },
    async repair(history) {
      repairs++;
      assert.equal(history[0].code, "original code");
      assert.equal(history[0].output.stderr, failed.stderr);
      if (repairs === 2) {
        assert.equal(history.length, 2);
        return { action: "stop", reason: "No further correction." };
      }
      history[0].code = "repair replacement";
      history[0].output.stderr = "repair replacement";
      output.stderr = "later external mutation";
      return revision("second code");
    },
    onRevision(repair) { repair.pythonCode = "observer replacement"; },
  });
  assert.equal(result.status, "stopped");
  assert.equal(repairs, 2);
  assert.deepEqual(executedCode, ["original code", "second code"]);
});

test("infrastructure failures propagate without inviting a code repair or recording a fictional result", async () => {
  const outage = new Error("Sandbox API timed out.");
  let repairCalled = false;
  let saved = false;
  await assert.rejects(runAgentLoop({ ...observers, initialCode: "v1",
    async execute() { throw outage; },
    async repair() { repairCalled = true; return revision("v2"); },
    onAttempt() { saved = true; },
  }), error => error === outage);
  assert.equal(repairCalled, false);
  assert.equal(saved, false);
});

test("invalid budgets and an already cancelled run make no external calls", async () => {
  let called = false;
  const controller = new AbortController();
  controller.abort();
  const options = { ...observers, initialCode: "v1", async execute() { called = true; return succeeded; }, async repair() { return revision("v2"); } };
  for (const maxAttempts of [0, -1, 1.5, Infinity, NaN]) await assert.rejects(runAgentLoop({ ...options, maxAttempts }), RangeError);
  await assert.rejects(runAgentLoop({ ...options, signal: controller.signal }), { name: "AbortError" });
  assert.equal(called, false);
});
