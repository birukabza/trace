import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Run, ExperimentResult } from "../types";
import { addEvent, runStore, transition, type RunStore } from "./store";
import { readSource, validateSourceUrl } from "./sources";
import { RiverCreditError, RIVER_OUT_OF_CREDIT, analysisPrompt, analysisSchema, planSchema, repairPrompt, repairSchema, riverJson, resolveEvidenceClaims, sourceExcerpts } from "./river";
import { configuration, createosCredentialSource, riverKey } from "./config";
import { cleanupRunFiles, ensurePoolSandboxRunning, executeNumerical, holdExecutionLease, pauseExperimentSandbox, POOL_SIZE, preparePoolSandbox } from "./sandbox";
import { acquireSlot, queuePosition, releaseSlot, slotsBusy } from "./pool";
import { runAgentLoop } from "./agent-loop";
import { RESEARCH_LIMITS } from "../capabilities";
import { measurementFeedback, parseMeasurements } from "../measurements";
import { PublicRunError } from "./http";
import { dataPath } from "./paths";

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

export function recoverInterruptedRuns(database: RunStore, controllers: Map<string, AbortController>, waitForRemote = (until: number) => holdExecutionLease(until - 65_000), pauseWorkspace = pauseExperimentSandbox) {
  let remoteMayBeRunning = false;
  for (const run of database.active()) {
    if (["analyzing", "queued", "running", "repairing"].includes(run.status) && !controllers.has(run.id)) {
      remoteMayBeRunning ||= run.status === "running";
      transition(run, "failed");
      run.error = "The local worker restarted. This run was interrupted and has not been automatically retried. If a command was running, the execution queue waits for its bounded process deadline.";
      addEvent(run, "failed", run.error);
      database.save(run);
    }
  }
  const until = Math.max(database.executionLeaseUntil(), remoteMayBeRunning ? Date.now() + 65_000 : 0);
  const wait = until > Date.now() ? waitForRemote(until) : Promise.resolve();
  return wait.then(async () => {
    // Terminal status can have been saved just before a crash prevented finally
    // cleanup. Inspect all retained children, including those outside history.
    for (const pending of database.cleanupPending()) {
      if (controllers.has(pending.id)) continue;
      const sandboxId = pending.sandbox!.id;
      let paused = false;
      try {
        await pauseWorkspace(sandboxId);
        paused = true;
      } catch { /* Retain an explicit unconfirmed cleanup record below. */ }
      // Cleanup may await a remote operation. Merge only its metadata into the
      // latest aggregate, preserving cancellation, results and newer evidence.
      const current = database.get(pending.id);
      if (!current?.sandbox || current.sandbox.id !== sandboxId) continue;
      if (paused) {
        current.sandbox.pausedAfterRun = true;
        addEvent(current, "paused", "Experiment workspace paused during recovery.");
      } else {
        addEvent(current, "cleanup", "Recovery could not confirm the experiment workspace paused. Check the sandbox state.");
      }
      database.save(current);
    }
  });
}

function withQueue(run: Run): Run {
  const position = run.status === "queued" ? queuePosition(run.id) : undefined;
  return position ? { ...run, queuePosition: position } : run;
}
export function getRun(id: string, ownerId: string) { const run = store().getOwned(id, ownerId); return run && withQueue(run); }
export function listRuns(ownerId: string) { return store().listOwned(ownerId).map(withQueue); }
function readRun(id: string) { return store().get(id); }
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

export function createRun(input: Record<string, unknown>, ownerId: string) {
  if (!ownerId) throw new PublicRunError("Sign in to continue.", 401);
  if (input.mode === "example") {
    const run = recordedExample(); run.ownerId = ownerId; store().save(run); return run;
  }
  const active = store().active().filter(item => item.status !== "awaiting_approval");
  if (active.some(item => item.ownerId === ownerId)) throw new PublicRunError("Wait for your active investigation to finish, or cancel it first.", 409);
  if (active.length >= 30) throw new PublicRunError("The queue is full right now. Try again in a few minutes.", 409);
  if (typeof input.retryFromId === "string") {
    const original = getRun(input.retryFromId, ownerId);
    if (!original) throw new PublicRunError("Run not found.", 404);
    const run = prepareRetry(original);
    store().save(run);
    launch(run, signal => queueExecution(run, signal));
    return run;
  }
  if (typeof input.sourceUrl !== "string") throw new PublicRunError("A paper or repository URL is required.");
  validateSourceUrl(input.sourceUrl);
  if (input.repositoryUrl !== undefined && typeof input.repositoryUrl !== "string") throw new PublicRunError("Repository URL must be text.");
  if (typeof input.repositoryUrl === "string" && input.repositoryUrl) {
    const repository = validateSourceUrl(input.repositoryUrl);
    if (repository.hostname !== "github.com") throw new PublicRunError("The author repository must be a public github.com URL.");
  }
  const run = baseRun(input.sourceUrl, "live");
  run.ownerId = ownerId;
  run.repositoryUrl = typeof input.repositoryUrl === "string" && input.repositoryUrl ? input.repositoryUrl : undefined;
  run.executionMode = "automatic";
  addEvent(run, "analyzing", "Reading source evidence, then writing, running and repairing one focused experiment automatically.");
  if (!riverKey() || !configuration().sandboxConfigured) {
    transition(run, "blocked");
    run.error = !riverKey() ? "The agent API is not configured on the server. No model or sandbox request was made." : "The sandbox is not configured on the server. No model or sandbox request was made.";
    addEvent(run, "blocked", run.error); store().save(run); return run;
  }
  store().save(run);
  launch(run, signal => analyze(run, typeof input.claimFocus === "string" ? input.claimFocus.slice(0, 2000) : undefined, signal));
  return run;
}

export function prepareRetry(original: Run): Run {
  const invalidCompletedOutput = original.status === "completed" && original.attempts.at(-1)?.exitCode === 0 && !parseMeasurements(original.attempts.at(-1)!.stdout);
  if (original.mode !== "live" || !original.plan || (!["blocked", "failed"].includes(original.status) && !invalidCompletedOutput)) throw new Error("Only a failed, blocked or invalid-output experiment with an existing protocol can be retried.");
  const run = baseRun(original.sourceUrl, "live");
  if (original.ownerId) run.ownerId = original.ownerId;
  run.repositoryUrl = original.repositoryUrl;
  run.title = original.title;
  run.paper = structuredClone(original.paper);
  run.claims = structuredClone(original.claims);
  run.plan = structuredClone(original.plan);
  run.executionMode = "automatic";
  addEvent(run, "retry", `Copied the unchanged protocol from run ${original.id}. The original execution evidence is preserved separately.`);
  return run;
}

async function analyze(run: Run, focus: string | undefined, signal: AbortSignal) {
  try {
    const source = await readSource(run.sourceUrl, signal);
    const repository = run.repositoryUrl ? await readSource(run.repositoryUrl, signal) : undefined;
    if (repository) {
      source.truncated ||= source.text.length > RESEARCH_LIMITS.paperWithRepositoryCharacters;
      repository.truncated ||= repository.text.length > RESEARCH_LIMITS.repositoryCharacters;
      source.text = source.text.slice(0, RESEARCH_LIMITS.paperWithRepositoryCharacters); repository.text = repository.text.slice(0, RESEARCH_LIMITS.repositoryCharacters);
    }
    run.title = source.title;
    run.paper = { title: source.title, url: source.url, sourceType: source.sourceType, textExcerpt: source.text.slice(0, 4000), sourceHash: snapshotSource(source.text), repositoryHash: repository ? snapshotSource(repository.text) : undefined, textCharacters: source.text.length, textTruncated: source.truncated, repositoryCharacters: repository?.text.length, repositoryTruncated: repository?.truncated };
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
      run.workingCode = { code: analysis.plan.pythonCode, attempt: 1, updatedAt: new Date().toISOString() };
      if (source.sourceType === "github" || repository) run.plan.limitations = [...run.plan.limitations.slice(0, 14), "Only the repository README was inspected. Repository code, its commit, and dependency lockfiles were not downloaded or executed."];
      addEvent(run, "written", "Experiment code written. The original protocol and code are retained before execution.");
    }
    saveActive(run, signal);
    if (run.plan && run.status === "analyzing") await queueExecution(run, signal);
  } catch (error) { failRun(run, error, signal); }
}

function failRun(run: Run, error: unknown, signal: AbortSignal) {
  if (signal.aborted || readRun(run.id)?.status === "cancelled") return;
  transition(run, "failed");
  run.error = error instanceof Error ? error.message : "The run failed.";
  if (error instanceof RiverCreditError) run.errorCode = RIVER_OUT_OF_CREDIT;
  addEvent(run, "failed", run.error); store().save(run);
}

export function approveRun(id: string, input: Record<string, unknown>, ownerId: string) {
  const run = getRun(id, ownerId);
  if (!run) throw new PublicRunError("Run not found.", 404);
  if (run.status !== "awaiting_approval" || !run.plan) throw new Error("Only a pending legacy investigation can continue.");
  if (input.claimId && input.claimId !== run.plan.claimId) throw new Error("The selected claim must match the existing protocol.");
  if (!configuration().sandboxConfigured) throw new Error("The sandbox is not configured on the server.");
  run.executionMode = "automatic";
  launch(run, signal => queueExecution(run, signal));
  return run;
}

function launch(run: Run, operation: (signal: AbortSignal) => Promise<void>) {
  const controller = new AbortController();
  worker.controllers.set(run.id, controller);
  void operation(controller.signal).catch(error => failRun(run, error, controller.signal)).finally(() => {
    if (worker.controllers.get(run.id) === controller) worker.controllers.delete(run.id);
  });
}

export function validateExecutableRun(run: Run) {
  if (!["analyzing", "awaiting_approval"].includes(run.status) || run.attempts.length) throw new Error("This investigation cannot be queued again.");
  const plan = planSchema.parse(run.plan);
  if (!run.claims.some(claim => claim.id === plan.claimId && claim.feasible)) throw new Error("The experiment needs a feasible source claim.");
}

export function serializeExecution(previous: Promise<void>, signal: AbortSignal, execute: () => Promise<void>) {
  return previous.catch(() => {}).then(async () => { if (!signal.aborted) await execute(); });
}

async function queueExecution(run: Run, signal: AbortSignal) {
  validateExecutableRun(run);
  if (!configuration().sandboxConfigured) throw new Error("The sandbox is not configured on the server.");
  transition(run, "queued");
  addEvent(run, "queued", slotsBusy()
    ? `Code ready. All ${POOL_SIZE} shared sandboxes are busy, so this investigation is waiting in line and will start automatically.`
    : "Code ready. Preparing a shared sandbox.");
  saveActive(run, signal);
  // Recovery after a restart must finish before new work reaches the sandboxes.
  await worker.execution.catch(() => {});
  await execute(run, signal);
}

export function cancelRun(id: string, ownerId: string) {
  const run = getRun(id, ownerId);
  if (!run) throw new PublicRunError("Run not found.", 404);
  if (["completed", "blocked", "failed", "cancelled"].includes(run.status)) return run;
  transition(run, "cancelled");
  addEvent(run, "cancelled", "Cancelled locally. Any already-running remote command remains bounded by its 60-second process limit.");
  store().save(run); worker.controllers.get(id)?.abort(); return run;
}

async function execute(run: Run, signal: AbortSignal) {
  let slot: number | undefined;
  let workspace: { id: string } | undefined;
  try {
    slot = await acquireSlot(run.id, signal);
    const progress = (message: string) => { addEvent(run, "workspace_progress", message); saveActive(run, signal); };
    progress(`Your turn. Connecting to shared sandbox ${slot} of ${POOL_SIZE}.`);
    workspace = await preparePoolSandbox(slot, store().poolSandbox(slot), signal, progress);
    store().savePoolSandbox(slot, workspace.id);
    run.sandbox = { id: workspace.id, egressRestricted: true, poolSlot: slot };
    saveActive(run, signal);
    addEvent(run, "sandbox", `Using shared sandbox ${slot} with restricted external networking. The base workspace is preserved.`);
    const outcome = await runAgentLoop({
      initialCode: run.plan!.pythonCode, maxAttempts: RESEARCH_LIMITS.maxAttempts, signal,
      execute: async (code, attempt) => {
        run.workingCode = { code, attempt, updatedAt: new Date().toISOString() };
        addEvent(run, "resuming", attempt > 1 ? "Submitting the revised code to the isolated workspace." : "The workspace is ready. Submitting the generated code.");
        saveActive(run, signal);
        await ensurePoolSandboxRunning(workspace!.id, signal);
        signal.throwIfAborted();
        store().saveExecutionLease(Date.now() + 110_000);
        transition(run, "running");
        addEvent(run, "running", `Running Python in the sandbox · attempt ${attempt} of ${RESEARCH_LIMITS.maxAttempts}.`);
        saveActive(run, signal);
        const output = await executeNumerical(code, run.id, attempt, signal, workspace!.id);
        return { ...output, ...(output.exitCode === 0 ? { validationError: measurementFeedback(output.stdout) } : {}) };
      },
      onAttempt: record => {
        run.attempts.push({ number: record.number, code: record.code, ...record.output, changeReason: record.changeReason, provider: "createos", sandboxId: workspace!.id, codeHash: hashCode(record.code), credentialSource: createosCredentialSource() });
        addEvent(run, "execution", `Attempt ${record.number} exited ${record.output.exitCode}. Original code, stdout and stderr saved.`);
        if (record.output.validationError) addEvent(run, "validation", record.output.validationError);
        saveActive(run, signal);
      },
      onRepairing: async attempt => {
        transition(run, "repairing");
        addEvent(run, "repairing", `Inspecting execution and measurement feedback from attempt ${attempt} and repairing the implementation.`);
        saveActive(run, signal);
        addEvent(run, "workspace_ready", "Keeping the isolated workspace ready while the agent diagnoses the feedback. It will pause after the experiment finishes.");
        saveActive(run, signal);
      },
      repair: history => riverJson(repairPrompt(run.plan!, history), repairSchema, signal),
      onRevision: (revision, nextAttempt) => {
        run.workingCode = { code: revision.pythonCode, attempt: nextAttempt, updatedAt: new Date().toISOString() };
        (run.repairs ??= []).push({ afterAttempt: nextAttempt - 1, diagnosis: revision.diagnosis, summary: revision.summary, codeHash: hashCode(revision.pythonCode), pythonCode: revision.pythonCode, at: new Date().toISOString() });
        addEvent(run, "revised", revision.summary);
        saveActive(run, signal);
      },
    });
    if (outcome.status !== "succeeded") {
      transition(run, "blocked"); run.error = outcome.reason || "No faithful repair was available within the attempt budget.";
      addEvent(run, "blocked", run.error); saveActive(run, signal); return;
    }
    const metrics = observedMetrics(run.attempts.at(-1)!.stdout);
    run.result = {
      verdict: "partial",
      summary: `The agent completed the experiment in ${run.attempts.length} execution attempt${run.attempts.length === 1 ? "" : "s"}. These values come from its captured stdout. Successful execution does not independently validate the implementation or reproduce a published benchmark.`,
      metrics,
      limitations: [...run.plan!.limitations, "Measurements are produced by model-generated code. Independent implementation and protocol validation are still required.", "No automated matching verdict is assigned. A successful process is not proof of a scientific claim."],
    };
    addEvent(run, "report", "Measurements saved. Preparing the evidence report and pausing the experiment workspace."); saveActive(run, signal);
  } catch (error) { failRun(run, error, signal); }
  finally {
    if (workspace) {
      try { await cleanupRunFiles(workspace.id, run.id); } catch { /* Files are tiny and uniquely named. */ }
    }
    if (slot !== undefined) releaseSlot(slot);
    const current = store().get(run.id);
    if (current?.status === "running" && current.result) {
      transition(current, "completed");
      addEvent(current, "completed", "Evidence report prepared. Scope is partial verification; no published result is declared matched.");
      store().save(current);
    }
  }
}

function hashCode(code: string) { return createHash("sha256").update(code).digest("hex"); }

export function observedMetrics(stdout: string): ExperimentResult["metrics"] {
  const values = parseMeasurements(stdout);
  if (values) return Object.entries(values).slice(0, 20).map(([name, value]) => ({ name: name.slice(0, 200), observed: (typeof value === "string" ? value : JSON.stringify(value)).slice(0, 2000) }));
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
  const directory = dataPath("sources");
  mkdirSync(directory, { recursive: true });
  try { writeFileSync(join(directory, `${hash}.txt`), text, { encoding: "utf8", flag: "wx" }); }
  catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error; }
  return hash;
}

export { markdownReport } from './reports';
