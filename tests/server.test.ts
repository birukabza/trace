import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSourceUrl } from "../src/lib/server/sources";
import { requireSameOrigin } from "../src/lib/server/http";
import { RunStore, transition } from "../src/lib/server/store";
import { observedMetrics, markdownReport, validateEvidenceQuotes, prepareRetry, recoverInterruptedRuns, serializeExecution, validateExecutableRun } from "../src/lib/server/runs";
import { holdExecutionLease } from "../src/lib/server/sandbox";
import { analysisSchema, ModelResponseError, parseModelResponse, resolveEvidenceClaims, sourceExcerpts } from "../src/lib/server/river";
import type { Run } from "../src/lib/types";

function run(): Run {
  return { id: "test", sourceUrl: "https://arxiv.org/abs/1706.03762", title: "Test run", createdAt: "2026-10-17T20:00:00Z", updatedAt: "2026-10-17T20:00:00Z", status: "analyzing", claims: [], events: [], attempts: [], mode: "live" };
}

test("only supported HTTPS sources can reach the fetch boundary", () => {
  assert.equal(validateSourceUrl("https://arxiv.org/abs/1706.03762").hostname, "arxiv.org");
  assert.equal(validateSourceUrl("https://github.com/org/repo").hostname, "github.com");
  for (const url of ["http://arxiv.org/abs/1706.03762", "https://127.0.0.1/", "https://169.254.169.254/latest/meta-data/", "https://arxiv.org.evil.example/", "https://name:secret@arxiv.org/", "https://arxiv.org:444/", "file:///etc/passwd"]) assert.throws(() => validateSourceUrl(url));
});

test("cross-origin writes are rejected while local same-origin calls work", () => {
  assert.throws(() => requireSameOrigin(new Request("http://localhost:3000/api/runs", { method: "POST", headers: { origin: "https://attacker.example" } })));
  assert.throws(() => requireSameOrigin(new Request("http://localhost:3000/api/runs", { method: "POST", headers: { "sec-fetch-site": "cross-site" } })));
  assert.doesNotThrow(() => requireSameOrigin(new Request("http://localhost:3000/api/runs", { method: "POST", headers: { origin: "http://localhost:3000" } })));
  assert.doesNotThrow(() => requireSameOrigin(new Request("http://localhost:3000/api/runs", { method: "POST", headers: { origin: "http://127.0.0.1:3000", "sec-fetch-site": "same-origin" } })));
  assert.throws(() => requireSameOrigin(new Request("http://localhost:3000/api/runs", { method: "POST", headers: { origin: "http://127.0.0.1:3001" } })));
});

test("automatic execution follows the queue and bounded repair states", () => {
  const value = run();
  assert.throws(() => transition(value, "running"));
  transition(value, "queued"); transition(value, "running"); transition(value, "repairing"); transition(value, "running"); transition(value, "completed");
  assert.throws(() => transition(value, "queued"));
  assert.equal(value.status, "completed");
});

test("a retry preserves failed evidence and creates a separate automatic run", () => {
  const original = run(); original.status = "blocked";
  original.claims = [{ id: "one", text: "A numerical claim", sourceLocation: "Section 1", feasible: true, reason: "Small numerical test" }];
  original.plan = { claimId: "one", title: "Test", hypothesis: "Test", method: "Test", dataset: "Synthetic", metrics: ["value"], dependencies: ["numpy"], estimatedSeconds: 1, limitations: ["Component check"], pythonCode: "print(42)\n", scope: "component_check" };
  original.attempts = [{ number: 1, code: "print(42)", stdout: "", stderr: "ImportError", exitCode: 1, durationMs: 100 }];
  const retry = prepareRetry(original);
  assert.notEqual(retry.id, original.id);
  assert.equal(retry.status, "analyzing");
  assert.equal(retry.executionMode, "automatic");
  assert.equal(retry.plan?.pythonCode, original.plan.pythonCode);
  assert.equal(retry.attempts.length, 0);
  assert.equal(original.attempts[0].stderr, "ImportError");
  assert.throws(() => transition(retry, "running"));
  assert.doesNotThrow(() => validateExecutableRun(retry));
  transition(retry, "queued");
  retry.plan!.limitations.push("New limitation");
  assert.equal(original.plan.limitations.length, 1);
  assert.throws(() => prepareRetry({ ...original, status: "completed" }));
  const legacy = { ...original, status: "completed" as const, attempts: [{ ...original.attempts[0], exitCode: 0, stderr: "", stdout: '{"value":42}' }] };
  assert.equal(prepareRetry(legacy).plan?.pythonCode, original.plan.pythonCode);
  assert.equal(legacy.status, "completed");
  assert.throws(() => prepareRetry({ ...legacy, attempts: [{ ...legacy.attempts[0], stdout: '{"metrics":{"value":42}}' }] }));
});

test("queue validation rejects absent plans, infeasible claims and previous execution", () => {
  const value = run();
  assert.throws(() => validateExecutableRun(value));
  value.plan = { claimId: "one", title: "Test", hypothesis: "Test", method: "Test", dataset: "Synthetic", metrics: ["value"], dependencies: ["numpy"], estimatedSeconds: 1, limitations: ["Component check"], pythonCode: "print(42)\n", scope: "component_check" };
  assert.throws(() => validateExecutableRun(value), /feasible source claim/);
  value.claims = [{ id: "one", text: "A numerical claim", sourceLocation: "Section 1", feasible: false, reason: "Unavailable" }];
  assert.throws(() => validateExecutableRun(value), /feasible source claim/);
  value.claims[0].feasible = true;
  assert.doesNotThrow(() => validateExecutableRun(value));
  value.attempts.push({ number: 1, code: value.plan.pythonCode, stdout: "42", stderr: "", exitCode: 0, durationMs: 1 });
  assert.throws(() => validateExecutableRun(value), /cannot be queued again/);
  value.attempts = []; value.status = "queued";
  assert.throws(() => validateExecutableRun(value), /cannot be queued again/);
});

test("execution stays serialized and cancelled queued work is skipped", async () => {
  const events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const signal = new AbortController().signal;
  const first = serializeExecution(Promise.resolve(), signal, async () => { events.push("first started"); await gate; events.push("first finished"); });
  const cancelled = new AbortController();
  const skipped = serializeExecution(first, cancelled.signal, async () => { events.push("cancelled ran"); });
  const last = serializeExecution(skipped, signal, async () => { events.push("last ran"); });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(events, ["first started"]);
  cancelled.abort(); release(); await last;
  assert.deepEqual(events, ["first started", "first finished", "last ran"]);
});

test("a rejected execution does not poison the next queued investigation", async () => {
  let executed = false;
  await serializeExecution(Promise.reject(new Error("Previous transport failed")), new AbortController().signal, async () => { executed = true; });
  assert.equal(executed, true);
});

test("run evidence persists across database reopen", () => {
  const folder = mkdtempSync(join(tmpdir(), "repro-store-"));
  const path = join(folder, "test.sqlite");
  const first = new RunStore(path);
  const value = run();
  value.attempts = [{ number: 1, code: "print(42)", stdout: "42\n", stderr: "", exitCode: 0, durationMs: 100 }];
  first.save(value); first.close();
  const second = new RunStore(path);
  try { assert.deepEqual(second.get(value.id), value); assert.equal(second.list().length, 1); }
  finally { second.close(); rmSync(folder, { recursive: true }); }
});

test("resource recovery selects only retained paused terminal forks", () => {
  const database = new RunStore(":memory:");
  const base = run();
  const sandbox = {id:"child",forkedFrom:"base",pausedAfterRun:true};
  database.save({...base,id:"eligible",status:"completed",sandbox});
  database.save({...base,id:"active",status:"running",sandbox});
  database.save({...base,id:"unconfirmed",status:"failed",sandbox:{...sandbox,pausedAfterRun:false}});
  database.save({...base,id:"released",status:"completed",sandbox:{...sandbox,releasedAt:"now"}});
  database.save({...base,id:"base",status:"completed",sandbox:{id:"base",pausedAfterRun:true}});
  try { assert.deepEqual(database.reclaimableWorkspaces().map(value=>value.id),["eligible"]); }
  finally { database.close(); }
});

test("active work cannot disappear behind the 50-run history limit", () => {
  const database = new RunStore(":memory:");
  const active = run(); active.updatedAt = "2026-01-01T00:00:00Z"; database.save(active);
  database.save({ ...active, id: "pending-review", status: "awaiting_approval" });
  database.save({ ...active, id: "repairing", status: "repairing" });
  for (let index = 0; index < 55; index++) database.save({ ...run(), id: `finished-${index}`, status: "completed" });
  try {
    assert.equal(database.list().length, 53);
    assert.ok(database.list().some(value => value.id === active.id));
    assert.ok(database.list().some(value => value.id === "pending-review"));
    assert.ok(database.list().some(value => value.id === "repairing"));
    assert.equal(database.active().length, 3);
  } finally { database.close(); }
});

test("restart recovery keeps queued execution behind a durable remote lease even after cancellation", async () => {
  const database = new RunStore(":memory:");
  const interrupted = { ...run(), status: "running" as const }; database.save(interrupted);
  database.save({ ...run(), id: "repairing", status: "repairing" });
  database.save({ ...run(), id: "awaiting-review", status: "awaiting_approval" });
  const until = Date.now() + 100_000; database.saveExecutionLease(until);
  let release = () => {}; let started = false; let waitedUntil = 0;
  const recovered = recoverInterruptedRuns(database, new Map(), deadline => { waitedUntil = deadline; return new Promise<void>(resolve => { release = resolve; }); });
  const queued = recovered.then(() => { started = true; });
  assert.equal(database.get(interrupted.id)?.status, "failed");
  assert.equal(database.get("repairing")?.status, "failed");
  assert.equal(database.get("awaiting-review")?.status, "awaiting_approval");
  assert.equal(waitedUntil, until); assert.equal(started, false);
  release(); await queued; assert.equal(started, true);
  database.save({ ...interrupted, status: "cancelled" });
  waitedUntil = 0;
  await recoverInterruptedRuns(database, new Map(), async deadline => { waitedUntil = deadline; });
  assert.equal(waitedUntil, until);
  database.close();
});

test("recovery leaves work owned by an existing controller alone", async () => {
  const database = new RunStore(":memory:");
  database.save({ ...run(), status: "repairing", sandbox: { id: "owned-child", forkedFrom: "base" } });
  let pauseCalls = 0;
  try {
    await recoverInterruptedRuns(database, new Map([["test", new AbortController()]]), async () => {}, async () => { pauseCalls++; });
    assert.equal(database.get("test")?.status, "repairing");
    assert.equal(pauseCalls, 0);
  } finally { database.close(); }
});

test("recovery pauses cancelled, completed and interrupted children while preserving latest evidence", async () => {
  const database = new RunStore(":memory:");
  const attempt = { number: 1, code: "print(42)", stdout: "original output", stderr: "", exitCode: 0, durationMs: 1 };
  database.save({ ...run(), id: "cancelled", status: "cancelled", attempts: [attempt], sandbox: { id: "cancelled-child", forkedFrom: "base" } });
  database.save({ ...run(), id: "completed", status: "completed", attempts: [attempt], sandbox: { id: "completed-child", forkedFrom: "base", pausedAfterRun: false } });
  database.save({ ...run(), id: "interrupted", status: "repairing", sandbox: { id: "interrupted-child", forkedFrom: "base" } });
  database.save({ ...run(), id: "already-paused", status: "completed", sandbox: { id: "paused-child", forkedFrom: "base", pausedAfterRun: true } });
  database.save({ ...run(), id: "base-only", status: "completed", sandbox: { id: "base" } });
  const paused: string[] = [];
  try {
    await recoverInterruptedRuns(database, new Map(), async () => {}, async id => {
      paused.push(id);
      // Simulate a concurrent aggregate update while cleanup awaits the provider.
      if (id === "completed-child") {
        await Promise.resolve();
        const current = database.get("completed")!;
        current.title = "Updated after pause request";
        current.attempts[0].stdout = "newer retained output";
        database.save(current);
      }
    });
    assert.deepEqual(paused.sort(), ["cancelled-child", "completed-child", "interrupted-child"]);
    assert.equal(database.get("cancelled")?.status, "cancelled");
    assert.equal(database.get("cancelled")?.attempts[0].stdout, "original output");
    assert.equal(database.get("completed")?.status, "completed");
    assert.equal(database.get("completed")?.title, "Updated after pause request");
    assert.equal(database.get("completed")?.attempts[0].stdout, "newer retained output");
    assert.equal(database.get("interrupted")?.status, "failed");
    assert.equal(database.cleanupPending().length, 0);
  } finally { database.close(); }
});

test("cleanup finds old terminal forks beyond history and retains failed pause diagnostics", async () => {
  const database = new RunStore(":memory:");
  database.save({ ...run(), id: "old-child", updatedAt: "2025-01-01T00:00:00Z", status: "cancelled", sandbox: { id: "unconfirmed-child", forkedFrom: "base" } });
  for (let index = 0; index < 55; index++) database.save({ ...run(), id: `finished-${index}`, status: "completed" });
  try {
    assert.equal(database.list().some(value => value.id === "old-child"), false);
    assert.equal(database.cleanupPending().length, 1);
    await recoverInterruptedRuns(database, new Map(), async () => {}, async () => { throw new Error("Pause unavailable"); });
    const current = database.get("old-child")!;
    assert.equal(current.status, "cancelled");
    assert.notEqual(current.sandbox?.pausedAfterRun, true);
    assert.equal(current.events.at(-1)?.stage, "cleanup");
    assert.equal(database.cleanupPending().length, 1);
  } finally { database.close(); }
});

test("unconfirmed remote cancellation retains the execution lease until the process deadline", async () => {
  let waited = 0;
  await holdExecutionLease(1000, 6000, async milliseconds => { waited = milliseconds; });
  assert.equal(waited, 60_000);
  waited = 0;
  await holdExecutionLease(1000, 67_000, async milliseconds => { waited = milliseconds; });
  assert.equal(waited, 0);
});

test("claim evidence must be found in supplied source text", () => {
  assert.doesNotThrow(() => validateEvidenceQuotes([{ evidenceQuote: "careful seeding improves\n the objective" }], "The text says careful seeding improves the objective on this dataset."));
  assert.doesNotThrow(() => validateEvidenceQuotes([{ evidenceQuote: "Use seed 42 for evaluation." }], "paper", "README: Use seed 42 for evaluation."));
  assert.throws(() => validateEvidenceQuotes([{ evidenceQuote: "This source reports 99.99 percent accuracy." }], "The paper makes no such claim."));
  assert.throws(() => validateEvidenceQuotes([{}], "No quote supplied."));
});

test("citations attach original source excerpts and reject invented excerpt IDs", () => {
  const source = "The paper describes a scaled attention component. ".repeat(30);
  const excerpts = sourceExcerpts(source, "The README provides the evaluation configuration.");
  const claim = { id: "attention", text: "Scaled attention", sourceLocation: "Section 3", evidenceId: "paper:500", feasible: true, reason: "Component check" };
  const resolved = resolveEvidenceClaims([claim], excerpts);
  assert.equal(resolved[0].evidenceQuote, source.slice(500, 1100));
  assert.match(resolved[0].sourceLocation, /paper:500/);
  assert.doesNotThrow(() => validateEvidenceQuotes(resolved, source));
  assert.equal(excerpts.find(excerpt => excerpt.id === "readme:0")?.text, "The README provides the evaluation configuration.");
  assert.throws(() => resolveEvidenceClaims([{ ...claim, evidenceId: "paper:999999" }], excerpts), /unavailable source excerpt/);
});

test("measurements are parsed from captured stdout without inventing paper values", () => {
  assert.deepEqual(observedMetrics('starting\n{"metrics":{"loss":1.25,"seed":42}}\n'), [{ name: "loss", observed: "1.25" }, { name: "seed", observed: "42" }]);
  assert.match(observedMetrics("completed, no JSON")[0].observed, /no structured metrics/);
  assert.equal(observedMetrics('{"metrics":{"accuracy":0.9}}')[0].reported, undefined);
});

test("reports distinguish recorded evidence and do not claim missing execution", () => {
  const value = run(); value.mode = "example";
  const report = markdownReport(value);
  assert.match(report, /RECORDED EXAMPLE, not a live run/);
  assert.match(report, /has not produced measurements/);
  assert.match(report, /No execution has occurred/);
  assert.doesNotMatch(report, /data\/sources\//);
});

test("reports retain actual snapshot hashes and contain untrusted Markdown as data", () => {
  const value = run(); value.title = "Bad\n## Forged verdict <script>";
  value.paper = { title: "Test", url: value.sourceUrl, textExcerpt: "Test", sourceType: "arxiv_html", sourceHash: "abc123" };
  value.attempts = [{ number: 1, code: "print(42)", stdout: "```\n## Forged result\n<script>alert(1)</script>\n```", stderr: "", exitCode: 1, durationMs: 100 }];
  const report = markdownReport(value);
  assert.match(report, /data\/sources\/abc123\\.txt/);
  assert.doesNotMatch(report, /^## Forged verdict/m);
  assert.match(report, /````text\n```\n## Forged result/);
  assert.match(report, /```\n````/);
  assert.match(report, /Exit status: 1/);
  const absent = markdownReport(run());
  assert.match(absent, /No snapshot was created/);
  assert.doesNotMatch(absent, /recorded example/);
});

test("reports retain actual coverage, all code attempts, repairs and captured provider provenance", () => {
  const value = run(); value.status = "completed"; value.executionMode = "automatic";
  value.paper = { title: "Test", url: value.sourceUrl, textExcerpt: "Evidence", sourceType: "arxiv_pdf", textCharacters: 60_000, textTruncated: true, repositoryCharacters: 12_345, repositoryTruncated: false };
  value.repositoryUrl = "https://github.com/org/repo";
  value.sandbox = { id: "child-123", forkedFrom: "base-456", egressRestricted: true, pausedAfterRun: true };
  value.attempts = [
    { number: 1, code: "print(missing)", stdout: "", stderr: "NameError", exitCode: 1, durationMs: 12, provider: "createos", sandboxId: "child-123", codeHash: "first-code-hash", credentialSource: "stripe_projects" },
    { number: 2, code: "print(42)", stdout: "42", stderr: "", exitCode: 0, durationMs: 13, changeReason: "Define the missing value.", provider: "createos", sandboxId: "child-123", codeHash: "second-code-hash", credentialSource: "custom" },
  ];
  value.repairs = [{ afterAttempt: 1, diagnosis: "An undefined name caused the failure.\n## Forged", summary: "Define the missing value.", codeHash: "second-code-hash", at: "2026-10-18T00:00:00Z" }];
  const report = markdownReport(value);
  assert.match(report, /Source text used: 60000 characters/);
  assert.match(report, /omitted text was not analyzed/);
  assert.match(report, /README used: 12345 characters/);
  assert.match(report, /Author repository code, dependency lockfiles and commits are not downloaded or executed/);
  assert.match(report, /Forked from: base\\-456/);
  assert.match(report, /Paused after run: confirmed/);
  assert.match(report, /### Attempt 1/); assert.match(report, /### Attempt 2/);
  assert.match(report, /print\(missing\)/); assert.match(report, /NameError/);
  assert.match(report, /Stripe Projects-managed environment variable/);
  assert.match(report, /Custom CreateOS environment variable/);
  assert.match(report, /### After attempt 1/);
  assert.match(report, /second\\-code\\-hash/);
  assert.doesNotMatch(report, /^## Forged/m);
});

test("legacy reports do not infer missing coverage or provider verification", () => {
  const value = run(); value.attempts = [{ number: 1, code: "print(42)", stdout: "42", stderr: "", exitCode: 0, durationMs: 5 }];
  const report = markdownReport(value);
  assert.match(report, /coverage was not recorded/);
  assert.match(report, /Provider: Not recorded/);
  assert.match(report, /Credential source: Not recorded/);
  assert.doesNotMatch(report, /Restricted external egress: verified/);
});

test("model output needs a bounded plan and explicit limitations", () => {
  assert.equal(analysisSchema.safeParse({ title: "Example", claims: [], plan: null, blockedReason: null }).success, false);
  const claim = { id: "one", text: "claim", sourceLocation: "Section 3", evidenceId: "paper:0", feasible: false, reason: "GPU required" };
  assert.equal(analysisSchema.safeParse({ title: "Example", claims: [claim], plan: null, blockedReason: "GPU required" }).success, true);
  assert.equal(analysisSchema.safeParse({ title: "Example", claims: [claim, claim], plan: null, blockedReason: "GPU required" }).success, false);
});

test("model diagnostics distinguish malformed JSON from a rejected field without echoing the response", () => {
  assert.throws(() => parseModelResponse("not JSON: private-response-value", analysisSchema), error => {
    assert.ok(error instanceof ModelResponseError);
    assert.equal(error.kind, "invalid_json");
    assert.doesNotMatch(error.message, /private-response-value/);
    return true;
  });
  const answer = { title: "Example", claims: [{ id: "one", text: "Claim", sourceLocation: "Section 3", evidenceId: "paper:0", feasible: "private-response-value", reason: "Reason" }], plan: null, blockedReason: "Unavailable" };
  assert.throws(() => parseModelResponse(JSON.stringify(answer), analysisSchema), error => {
    assert.ok(error instanceof ModelResponseError);
    assert.equal(error.kind, "invalid_schema");
    assert.equal(error.issues[0].path, "claims.0.feasible");
    assert.match(error.message, /claims\.0\.feasible/);
    assert.doesNotMatch(error.message, /private-response-value/);
    return true;
  });
  const valid = { ...answer, claims: [{ ...answer.claims[0], feasible: true }] };
  assert.deepEqual(parseModelResponse(JSON.stringify(valid), analysisSchema), valid);
});
