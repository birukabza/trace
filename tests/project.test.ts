import test from "node:test";
import assert from "node:assert/strict";
import { bundleProject, parseProject, validateProject } from "../src/lib/project";
import { storedPlan, analysisSchema, repairSchema } from "../src/lib/server/river";

const files = [
  { path: "main.py", content: "from model import run\n\nprint(run())\n" },
  { path: "model.py", content: "def run():\n    return {'metrics': {'value': 1}}\n" },
  { path: "utils/data.py", content: "SEED = 0\n" },
];

test("a project bundle round-trips its files", () => {
  const parsed = parseProject(bundleProject(files));
  assert.deepEqual(parsed.map(file => file.path), ["main.py", "model.py", "utils/data.py"]);
  assert.equal(parsed[1].content, files[1].content);
});

test("code without file markers is treated as a single main.py", () => {
  assert.deepEqual(parseProject("print(1)"), [{ path: "main.py", content: "print(1)" }]);
});

test("unsafe or invalid projects are rejected before execution", () => {
  assert.equal(validateProject(files), undefined);
  assert.match(validateProject([{ path: "../escape.py", content: "x" }, files[0]])!, /not allowed/);
  assert.match(validateProject([{ path: "/etc/passwd.py", content: "x" }, files[0]])!, /not allowed/);
  assert.match(validateProject([files[1]])!, /main\.py/);
  assert.match(validateProject([files[0], files[0]])!, /twice/);
  assert.match(validateProject(Array.from({ length: 9 }, (_, index) => ({ path: index ? `m${index}.py` : "main.py", content: "x" })))!, /limit/);
});

test("model plans with files are stored as one bundle; legacy pythonCode still works", () => {
  const base = { claimId: "one", title: "T", hypothesis: "H", summary: "Does it work?", method: "M", dataset: "D", metrics: ["value"], dependencies: [], estimatedSeconds: 30, limitations: ["L"], scope: "component_check" as const };
  const analysis = analysisSchema.parse({ title: "Paper", claims: [{ id: "one", text: "claim", sourceLocation: "S1", evidenceId: "paper:0", feasible: true, reason: "ok" }], plan: { ...base, files }, blockedReason: null });
  const stored = storedPlan(analysis.plan!);
  assert.deepEqual(parseProject(stored.pythonCode).map(file => file.path), ["main.py", "model.py", "utils/data.py"]);
  assert.equal(storedPlan({ ...base, pythonCode: "print('legacy')" }).pythonCode, "print('legacy')");
  assert.throws(() => storedPlan({ ...base, files: [files[1]] }), /main\.py/);
});

test("repairs may return files", () => {
  assert.equal(repairSchema.safeParse({ action: "repair", diagnosis: "d", summary: "s", files }).success, true);
  assert.equal(repairSchema.safeParse({ action: "repair", diagnosis: "d", summary: "s" }).success, false);
});
