import test from "node:test";
import assert from "node:assert/strict";
import { pdfReport, pdfSafe } from "../src/lib/server/pdf-report";
import type { Run } from "../src/lib/types";

export function sampleRun(): Run {
  const code = Array.from({ length: 140 }, (_, index) => `value_${index} = ${index} * 2  # step ${index}`).join("\n");
  return {
    id: "run-pdf-1", sourceUrl: "https://arxiv.org/abs/1412.6980", title: "Adam: A Method for Stochastic Optimization", status: "completed", mode: "live",
    createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:01:00Z", executionMode: "automatic",
    claims: [{ id: "c1", text: "Bias correction removes the (1 − β₂ᵗ) factor from E[v_t].", sourceLocation: "Section 3", feasible: true, reason: "CPU check", evidenceQuote: "E[v_t] = E[g_t²] · (1 − β₂ᵗ) + ζ" }],
    plan: { claimId: "c1", title: "Bias correction check", hypothesis: "Corrected estimates match E[g²] for β₂ = 0.999.", method: "Simulate gradients.", dataset: "Synthetic", metrics: ["relative error"], dependencies: ["NumPy"], estimatedSeconds: 30, limitations: ["Synthetic gradients only."], pythonCode: code, scope: "component_check" },
    attempts: [{ number: 1, code, stdout: '{"metrics": {"error": 0.004}}', stderr: "", exitCode: 0, durationMs: 812, codeHash: "abc123" }],
    result: { verdict: "partial", summary: "The experiment completed. ε stayed ≤ 1e-8.", metrics: [{ name: "relative error", observed: "0.004" }, { name: "β₂", observed: "0.999" }], limitations: ["Synthetic gradients only."] },
    events: [],
  } as Run;
}

test("PDF text falls back to readable names for symbols the base fonts lack", () => {
  assert.equal(pdfSafe("β₂ − ε ≤ 1"), "beta_2 - epsilon <= 1");
  assert.equal(pdfSafe("(1 − β₂ᵗ)"), "(1 - beta_2^t)");
  assert.equal(pdfSafe("café · 5×2 – “ok”"), "café · 5×2 – “ok”");
});

test("the evidence report renders as a multi-page PDF", async () => {
  const bytes = await pdfReport(sampleRun());
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(text.startsWith("%PDF-"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  const pages = (text.match(/\/Type \/Page\b/g) || []).length;
  assert.ok(pages >= 2, `expected several pages, got ${pages}`);
});
