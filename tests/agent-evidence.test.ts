import test from "node:test";
import assert from "node:assert/strict";
import { currentAgentCode, codeChanges } from "../src/lib/agent-evidence";
import type { Run } from "../src/lib/types";

const run = (): Run => ({ id: "evidence", sourceUrl: "https://arxiv.org/abs/0909.4061", title: "Test", status: "repairing", createdAt: "now", updatedAt: "now", claims: [], events: [], mode: "live", attempts: [{ number: 1, code: "broken()", stdout: "", stderr: "NameError", exitCode: 1, durationMs: 1 }] });

test("a written repair is visible before its next execution without replacing failed evidence", () => {
  const value = run();
  value.repairs = [{ afterAttempt: 1, diagnosis: "Undefined function", summary: "Use print", codeHash: "hash", pythonCode: "print(42)", at: "now" }];
  assert.equal(currentAgentCode(value).code, "print(42)");
  assert.equal(currentAgentCode(value).number, 2);
  assert.equal(currentAgentCode(value).previousCode, "broken()");
  assert.equal(value.attempts[0].code, "broken()");
  assert.equal(value.attempts[0].stderr, "NameError");
});

test("current submitted code takes precedence and historical attempts remain usable", () => {
  const value = run();
  assert.equal(currentAgentCode(value).code, "broken()");
  value.workingCode = { code: "print(43)", attempt: 3, updatedAt: "now" };
  assert.equal(currentAgentCode(value).code, "print(43)");
  assert.equal(currentAgentCode(value).number, 3);
});

test("code changes retain exact before and after lines with bounded context", () => {
  const before = "import numpy as np\nx = np.arange(6).reshape(3, 3)\nprint(x)\n";
  const after = "import numpy as np\nx = np.arange(6).reshape(2, 3)\nprint(x)\n";
  const changes = codeChanges(before, after);
  assert.deepEqual(changes.filter(row => row.kind === "removed").map(row => row.text), ["x = np.arange(6).reshape(3, 3)"]);
  assert.deepEqual(changes.filter(row => row.kind === "added").map(row => row.text), ["x = np.arange(6).reshape(2, 3)"]);
  assert.equal(changes.find(row => row.kind === "added")?.newLine, 2);
  assert.deepEqual(codeChanges(before, before), []);
  assert.equal(codeChanges("a\nb", "a\nb\nc").filter(row => row.kind === "added")[0].text, "c");
  assert.equal(codeChanges("a\nb\nc", "a\nb").filter(row => row.kind === "removed")[0].text, "c");
});
