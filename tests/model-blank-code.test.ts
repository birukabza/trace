import test from "node:test";
import assert from "node:assert/strict";
import { analysisSchema, parseModelResponse, repairSchema } from "../src/lib/server/river";

const files = [{ path: "main.py", content: "print('fixed')\n" }];

test("a repair with files and an empty pythonCode is accepted", () => {
  const repair = parseModelResponse(JSON.stringify({ action: "repair", diagnosis: "dtype bug", summary: "Fixed the dtype", files, pythonCode: "" }), repairSchema);
  assert.equal(repair.action, "repair");
  assert.ok(repair.action === "repair" && repair.files?.length === 1 && repair.pythonCode === undefined);
});

test("a repair with no real code is still rejected", () => {
  assert.throws(() => parseModelResponse(JSON.stringify({ action: "repair", diagnosis: "d", summary: "s", files: [], pythonCode: "" }), repairSchema), /failed validation/);
});

test("a plan with files and a blank pythonCode is accepted", () => {
  const plan = { claimId: "one", title: "T", hypothesis: "H", method: "M", dataset: "D", metrics: ["m"], dependencies: [], estimatedSeconds: 30, limitations: ["L"], scope: "component_check", files, pythonCode: "  " };
  const analysis = parseModelResponse(JSON.stringify({ title: "P", claims: [{ id: "one", text: "c", sourceLocation: "S", evidenceId: "paper:0", feasible: true, reason: "ok" }], plan, blockedReason: null }), analysisSchema);
  assert.equal(analysis.plan?.pythonCode, undefined);
  assert.equal(analysis.plan?.files?.length, 1);
});
