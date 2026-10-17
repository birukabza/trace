import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Run, ExperimentResult } from "../types";
import { addEvent, runStore, transition, type RunStore } from "./store";
import { readSource, validateSourceUrl } from "./sources";
import { analysisPrompt, analysisSchema, riverJson, resolveEvidenceClaims, sourceExcerpts } from "./river";
import { configuration, riverKey } from "./config";
import { executeNumerical, holdExecutionLease } from "./sandbox";

type WorkerState = { controllers: Map<string, AbortController>; execution: Promise<void>; recovered: boolean };
const globalWorker = globalThis as typeof globalThis & { reproWorkers?: WorkerState };
const worker = globalWorker.reproWorkers ??= { controllers: new Map(), execution: Promise.resolve(), recovered: false };

function store() {
  const value = runStore();
  if (!worker.recovered) {
    worker.recovered = true;
    worker.execution = recoverInterruptedRuns(value, worker.controllers);
  }
  return value;
}

export function recoverInterruptedRuns(database: RunStore, controllers: Map<string, AbortController>, waitForRemote = (until: number) => holdExecutionLease(until - 65_000)) {
  let remoteMayBeRunning = false;
  for (const run of database.active()) {
    if (["analyzing", "queued", "running"].includes(run.status) && !controllers.has(run.id)) {
      remoteMayBeRunning ||= run.status === "running";
      transition(run, "failed");
      run.error = "The local worker restarted. This run was interrupted and has not been automatically retried. If a command was running, the execution queue waits for its bounded process deadline.";
      addEvent(run, "failed", run.error);
      database.save(run);
    }
  }
  const until = Math.max(database.executionLeaseUntil(), remoteMayBeRunning ? Date.now() + 65_000 : 0);
  return until > Date.now() ? waitForRemote(until) : Promise.resolve();
}

export function getRun(id: string) { return store().get(id); }
export function listRuns() { return store().list(); }
function saveActive(run: Run, signal: AbortSignal) {
  if (signal.aborted || store().get(run.id)?.status === "cancelled") throw new Error("Run cancelled.");
  store().save(run);
}

function baseRun(sourceUrl: string, mode: "live" | "example"): Run {
  const now = new Date().toISOString();
  return { id: randomUUID(), sourceUrl, title: mode === "example" ? "k-means++ · recorded example" : "Reading your source", status: "analyzing", createdAt: now, updatedAt: now, claims: [], events: [], attempts: [], mode };
}

function recordedExample(): Run {
  const run = baseRun("https://theory.stanford.edu/~sergei/papers/kMeansPP-soda.pdf", "example");
  run.status = "completed";
  run.paper = { title: "k-means++: The Advantages of Careful Seeding", url: run.sourceUrl, textExcerpt: "This is a recorded synthetic adaptation from the October 17 pilot, not a newly fetched paper or a reproduction of published benchmark tables.", sourceType: "recorded_example" };
  run.claims = [{ id: "careful-seeding", text: "Compare k-means++ initialization with random initialization on a fixed synthetic clustering task.", sourceLocation: "Pilot adaptation inspired by k-means++ seeding; no original table reproduced", feasible: true, reason: "Small CPU numerical experiment. The theoretical guarantee is not numerically proved." }];
  run.plan = { claimId: "careful-seeding", title: "A controlled seeding comparison", hypothesis: "Careful seeding can reduce final clustering inertia on this fixed dataset.", method: "Identical Lloyd refinement, max 50 iterations, one initialization per method for each seed 0–19. Preserve ties and losses.", dataset: "800 synthetic points; four 2D Gaussian clusters; standard deviation 0.8; dataset seed 2026.", metrics: ["Mean final inertia", "Population standard deviation", "Paired outcomes"], dependencies: ["Python 3.13.14", "NumPy 2.4.1"], estimatedSeconds: 60, limitations: ["One fixed synthetic dataset, not the paper's benchmark datasets.", "Does not verify the theoretical O(log k) guarantee.", "Recorded October 17, 2026. Loading this example makes no model or sandbox requests."], pythonCode: "# Recorded evidence preview. This is not runnable experiment code.\n# The original pilot code and raw logs remain in the local experiments archive.\n", scope: "reduced_experiment" };
  run.result = { verdict: "partial", summary: "In the recorded pilot, k-means++ produced lower inertia in 2 paired trials, tied in 18, and lost in 0. Eight independent implementation checks passed. These observations apply only to this synthetic experiment.", metrics: [{ name: "Random mean inertia", observed: "1372.259603" }, { name: "k-means++ mean inertia", observed: "1035.171737" }, { name: "Random population std", observed: "1011.263599" }, { name: "Paired outcomes", observed: "2 wins · 18 ties · 0 losses" }, { name: "Independent checks", observed: "8 / 8" }], limitations: run.plan.limitations };
  addEvent(run, "recorded", "Loaded prior measured evidence from the October 17 pilot. No live inference or execution occurred.");
  addEvent(run, "completed", "Synthetic adaptation only. Published paper results were not reproduced.");
  return run;
}

export function createRun(input: Record<string, unknown>) {
  if (input.mode === "example") {
    const run = recordedExample(); store().save(run); return run;
  }
  if (store().active().length >= 3) throw new Error("Three runs are already active. Wait for one to finish or cancel it.");
  if (typeof input.retryFromId === "string") {
    const original = getRun(input.retryFromId);
    if (!original) throw new Error("Original run not found.");
    const run = prepareRetry(original);
    store().save(run);
    return run;
  }
  if (typeof input.sourceUrl !== "string") throw new Error("A paper or repository URL is required.");
  validateSourceUrl(input.sourceUrl);
  if (input.repositoryUrl !== undefined && typeof input.repositoryUrl !== "string") throw new Error("Repository URL must be text.");
  if (typeof input.repositoryUrl === "string" && input.repositoryUrl) {
    const repository = validateSourceUrl(input.repositoryUrl);
    if (repository.hostname !== "github.com") throw new Error("The author repository must be a public github.com URL.");
  }
  const run = baseRun(input.sourceUrl, "live");
  run.repositoryUrl = typeof input.repositoryUrl === "string" && input.repositoryUrl ? input.repositoryUrl : undefined;
  addEvent(run, "analyzing", "Run created. Execution requires your approval of the generated plan.");
  if (!riverKey()) {
    transition(run, "blocked");
    run.error = "River is not configured. Add RIVER_API_KEY to .env.local and restart the server. No model or sandbox request was made.";
    addEvent(run, "blocked", run.error); store().save(run); return run;
  }
  store().save(run);
  const controller = new AbortController(); worker.controllers.set(run.id, controller);
  void analyze(run, typeof input.claimFocus === "string" ? input.claimFocus.slice(0, 2000) : undefined, controller.signal).finally(() => worker.controllers.delete(run.id));
  return run;
}

export function prepareRetry(original: Run): Run {
  if (original.mode !== "live" || !original.plan || !["blocked", "failed"].includes(original.status)) throw new Error("Only a failed or blocked experiment with an existing protocol can be reviewed again.");
  const run = baseRun(original.sourceUrl, "live");
  run.repositoryUrl = original.repositoryUrl;
  run.title = original.title;
  run.paper = structuredClone(original.paper);
  run.claims = structuredClone(original.claims);
  run.plan = structuredClone(original.plan);
  transition(run, "awaiting_approval");
  addEvent(run, "awaiting_approval", `Copied the unchanged protocol from run ${original.id}. Review it and approve a new execution. The original execution evidence is preserved separately.`);
  return run;
}

async function analyze(run: Run, focus: string | undefined, signal: AbortSignal) {
  try {
    const source = await readSource(run.sourceUrl, signal);
    const repository = run.repositoryUrl ? await readSource(run.repositoryUrl, signal) : undefined;
    if (repository) {
      source.truncated ||= source.text.length > 60_000;
      repository.truncated ||= repository.text.length > 20_000;
      source.text = source.text.slice(0, 60_000); repository.text = repository.text.slice(0, 20_000);
    }
    run.title = source.title;
    run.paper = { title: source.title, url: source.url, sourceType: source.sourceType, textExcerpt: source.text.slice(0, 4000), sourceHash: snapshotSource(source.text), repositoryHash: repository ? snapshotSource(repository.text) : undefined };
    addEvent(run, "source", `${source.sourceType === "github" ? "Repository README" : "Paper text"} loaded. ${source.truncated ? "Extraction is truncated to the text budget." : "Extracted text fits the text budget."}`);
    saveActive(run, signal);
    const analysis = await riverJson(analysisPrompt(source, focus, repository), analysisSchema, signal);
    const claims = resolveEvidenceClaims(analysis.claims, sourceExcerpts(source.text, repository?.text));
    validateEvidenceQuotes(claims, source.text, repository?.text);
    run.title = analysis.title;
    run.claims = claims;
    if (!analysis.plan) {
      transition(run, "blocked"); run.error = analysis.blockedReason || "No faithful experiment fits the available CPU, data, and time budget.";
      addEvent(run, "blocked", run.error);
    } else {
      if (!analysis.claims.some(claim => claim.id === analysis.plan!.claimId && claim.feasible)) throw new Error("The proposed plan does not select a feasible extracted claim.");
      run.plan = analysis.plan;
      if (source.sourceType === "github" || repository) run.plan.limitations.push("Only the repository README was inspected. Repository code, its commit, and dependency lockfiles were not downloaded or executed.");
      transition(run, "awaiting_approval");
      addEvent(run, "awaiting_approval", "Review the source claim, method, generated Python, and limitations before approving remote execution.");
    }
    saveActive(run, signal);
  } catch (error) { failRun(run, error, signal); }
}

function failRun(run: Run, error: unknown, signal: AbortSignal) {
  if (signal.aborted || getRun(run.id)?.status === "cancelled") return;
  transition(run, "failed");
  run.error = error instanceof Error ? error.message : "The run failed.";
  addEvent(run, "failed", run.error); store().save(run);
}

export function approveRun(id: string, input: Record<string, unknown>) {
  const run = getRun(id);
  if (!run) throw new Error("Run not found.");
  if (run.status !== "awaiting_approval" || !run.plan) throw new Error("Only a run awaiting approval can execute.");
  if (input.claimId && input.claimId !== run.plan.claimId) throw new Error("Approve the claim attached to this plan. Start a focused run to select another claim.");
  if (!configuration().createosConfigured) throw new Error("CreateOS credentials are unavailable. Pull Stripe Projects credentials and restart the server.");
  transition(run, "queued"); addEvent(run, "queued", "You approved this plan and generated code. Queued for the existing EU sandbox."); store().save(run);
  const controller = new AbortController(); worker.controllers.set(run.id, controller);
  worker.execution = worker.execution.catch(() => {}).then(async () => {
    if (!controller.signal.aborted) await execute(run, controller.signal);
    worker.controllers.delete(run.id);
  });
  return run;
}

export function cancelRun(id: string) {
  const run = getRun(id);
  if (!run) throw new Error("Run not found.");
  if (["completed", "blocked", "failed", "cancelled"].includes(run.status)) return run;
  transition(run, "cancelled");
  addEvent(run, "cancelled", "Cancelled locally. Any already-running remote command remains bounded by its 60-second process limit.");
  store().save(run); worker.controllers.get(id)?.abort(); return run;
}

async function execute(run: Run, signal: AbortSignal) {
  try {
    // Cover sandbox lookup/upload and the remote process deadline, including a crash after local cancellation.
    store().saveExecutionLease(Date.now() + 110_000);
    transition(run, "running"); addEvent(run, "running", "Executing approved numerical Python in CreateOS. No model or provider credentials are sent to the sandbox."); saveActive(run, signal);
    const code = run.plan!.pythonCode;
    const output = await executeNumerical(code, run.id, 1, signal);
    run.attempts.push({ number: 1, code, ...output });
    addEvent(run, "execution", `Python finished with exit status ${output.exitCode}. Captured stdout and stderr are retained as evidence.`);
    saveActive(run, signal);
    if (output.exitCode !== 0) {
      transition(run, "blocked"); run.error = "The approved code did not complete successfully. Review the execution evidence. A changed plan requires a new approval.";
      addEvent(run, "blocked", run.error); saveActive(run, signal); return;
    }
    const metrics = observedMetrics(output.stdout);
    run.result = {
      verdict: "partial",
      summary: "The approved code ran successfully. The values below were parsed from its stdout. This alone does not independently validate the implementation or establish reproduction of a published benchmark.",
      metrics,
      limitations: [...run.plan!.limitations, "Measurements are produced by model-generated code. Independent implementation and protocol validation are still required.", "No automated matching verdict is assigned. A successful process is not proof of a scientific claim."],
    };
    transition(run, "completed"); addEvent(run, "completed", "Evidence report prepared. Scope is partial verification; no published result is declared matched."); saveActive(run, signal);
  } catch (error) { failRun(run, error, signal); }
  finally { store().saveExecutionLease(0); }
}

export function observedMetrics(stdout: string): ExperimentResult["metrics"] {
  const lines = stdout.trim().split("\n");
  for (const candidate of [stdout.trim(), ...lines.reverse()]) {
    try {
      const parsed = JSON.parse(candidate);
      const values = parsed?.metrics;
      if (values && typeof values === "object" && !Array.isArray(values)) return Object.entries(values).slice(0, 20).map(([name, value]) => ({ name: name.slice(0, 200), observed: (typeof value === "string" ? value : JSON.stringify(value)).slice(0, 2000) }));
    } catch {}
  }
  return [{ name: "Execution exit status", observed: "0; no structured metrics object was found in stdout" }];
}

export function validateEvidenceQuotes(claims: { evidenceQuote?: string }[], source: string, repository = "") {
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const documents = [normalize(source), normalize(repository)];
  for (const claim of claims) {
    const quote = normalize(claim.evidenceQuote || "");
    if (quote.length < 15 || !documents.some(document => document.includes(quote))) throw new Error("A model claim could not be grounded in an exact source excerpt. No experiment was executed.");
  }
}

function snapshotSource(text: string) {
  const hash = createHash("sha256").update(text).digest("hex");
  const directory = join(process.cwd(), "data", "sources");
  mkdirSync(directory, { recursive: true });
  try { writeFileSync(join(directory, `${hash}.txt`), text, { encoding: "utf8", flag: "wx" }); }
  catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error; }
  return hash;
}

export { markdownReport } from './reports';
