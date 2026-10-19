"use client";

import { useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, Code2, Copy, Info, Loader2, ShieldCheck, X } from "lucide-react";
import type { Run, RunStatus } from "@/lib/types";
import { ProcessOrb } from "./process-orb";
import type { OrbState } from "thinking-orbs";
import { RESEARCH_LIMITS } from "@/lib/capabilities";
import { AgentWorkbench } from "./agent-workbench";
import { AgentConsole } from "./agent-console";
import { ResultView } from "./result-view";
import { parseMeasurements } from "@/lib/measurements";

export const ACTIVE_STATUSES: RunStatus[] = ["analyzing", "queued", "running", "repairing"];
export const STATUS_LABELS: Record<RunStatus, string> = {
  analyzing: "Reading and planning", awaiting_approval: "Ready to continue", queued: "Experiment queued", running: "Running code", repairing: "Fixing code",
  completed: "Experiment complete", blocked: "Experiment blocked", failed: "Run failed", cancelled: "Run cancelled",
};
const SCOPE_LABELS = { component_check: "Focused check", reduced_experiment: "Smaller-scale experiment", reproduction: "Full reproduction" };

const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="bench-empty"><div className="empty-orbit">{icon}</div><h3>{title}</h3><p>{children}</p></div>;
}

function Protocol({ run, onApprove, busy }: { run: Run; onApprove: () => void; busy: boolean }) {
  const plan = run.plan;
  if (!plan) return null;
  return <div className="review-sheet stage-enter"><div className="review-orb"><ProcessOrb state="breathing" label="Your experiment" /></div>
    <span className="quiet-label">Your experiment</span>
    <h1>A question we can test.</h1>
    <p className="review-question">{plan.summary || plan.title}</p>
    <div className="scope-note"><span />{SCOPE_LABELS[plan.scope]}. {plan.scope === "reproduction" ? "We will document any differences from the paper." : "This tests part of the paper, rather than its full benchmark."}</div>
    <details className="quiet-disclosure"><summary>How we will test it<ChevronDown size={15} /></summary><div className="disclosure-body"><h3>The precise question</h3><p>{plan.hypothesis}</p><h3>Method</h3><p>{plan.method}</p><h3>Data</h3><p>{plan.dataset}</p><h3>Measurements</h3><ul>{plan.metrics.map(metric => <li key={metric}>{metric}</li>)}</ul></div></details>
    <details className="quiet-disclosure"><summary>See the code<ChevronDown size={15} /></summary><div className="disclosure-body"><CodePanel run={run} /></div></details>
    {plan.limitations.length > 0 && <details className="quiet-disclosure"><summary>What this can tell us<ChevronDown size={15} /></summary><div className="disclosure-body"><ul>{plan.limitations.map(value => <li key={value}>{value}</li>)}</ul></div></details>}
    {run.status === "awaiting_approval" && <div className="review-action"><button className="primary-button accent" onClick={onApprove} disabled={busy}>{busy ? "Continuing investigation" : "Continue investigation"}<ArrowUpRight size={16} /></button><p>This older investigation was paused before automatic execution.</p></div>}
  </div>;
}
function ActivityLog({ run }: { run: Run }) {
  return <ol className="bench-timeline">{run.events.map((event, index) => {
    const pending = index === run.events.length - 1 && ACTIVE_STATUSES.includes(run.status);
    const failed = ["failed", "blocked", "cancelled", "validation"].includes(event.stage);
    return <li key={event.id} className={failed ? "event-warning" : ""}><span className="event-symbol">{pending ? <Loader2 size={14} className="spin" /> : failed ? <X size={13} /> : <Check size={13} />}</span><div><div className="event-title"><h3>{event.stage.replaceAll("_", " ")}</h3><time dateTime={event.at}>{time(event.at)}</time></div><p>{event.message}</p></div></li>;
  })}</ol>;
}

function CodePanel({ run, submittedCode }: { run: Run; submittedCode?: string }) {
  const [copied, setCopied] = useState(false);
  const code = submittedCode || run.plan?.pythonCode;
  if (!code) return <EmptyState icon={<Code2 size={25} />} title="The method becomes code.">The generated Python appears here once Trace has chosen an experiment.</EmptyState>;
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } };
  return <><div className="code-window"><div className="code-topbar"><span><span className="file-dot" />experiment.py<span className="code-language">Python</span></span><button className="text-button" onClick={copy}>{copied ? <CheckCheck size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy code"}</button></div><pre><code>{code}</code></pre></div><div className="code-footnote"><ShieldCheck size={15} /><span>Numerical Python only. Application credentials stay outside the execution environment.</span></div></>;
}

function SourceCoverage({ run }: { run: Run }) {
  const paper = run.paper;
  if (!paper) return null;
  const limit = run.repositoryUrl ? RESEARCH_LIMITS.paperWithRepositoryCharacters : RESEARCH_LIMITS.sourceCharacters;
  return <div className="source-coverage"><h3>Source coverage</h3>
    <p>{paper.textCharacters === undefined ? "This older investigation did not record its extracted text length." : `${paper.textCharacters.toLocaleString()} extracted source characters supplied to the agent.`}{paper.textTruncated ? ` The source was shortened to the first ${limit.toLocaleString()} characters; later sections may be missing.` : ""}</p>
    {paper.repositoryCharacters !== undefined && <p>{paper.repositoryCharacters.toLocaleString()} author README characters supplied.{paper.repositoryTruncated ? " The README was shortened; later sections may be missing." : ""} Repository code was not cloned or executed.</p>}
    <p>Text coverage does not establish that every claim, figure, or table was understood. The experiment tests only the question described above.</p>
  </div>;
}

function RepairRecord({ run }: { run: Run }) {
  if (!run.repairs?.length) return null;
  return <div className="repair-record">{run.repairs.map(repair => <article key={`${repair.afterAttempt}-${repair.at}`}><span>After attempt {repair.afterAttempt}</span><h3>{repair.summary}</h3><p>{repair.diagnosis}</p></article>)}</div>;
}


type ProcessPhase = { title: string; description: string; orb: OrbState; step: number };
/** Headline while the agent finds, downloads and checks real data. */
function dataPhase(run: Run): ProcessPhase | undefined {
  if (!["analyzing", "queued"].includes(run.status) || run.attempts.length) return;
  const latest = run.events.at(-1);
  const message = (stage: string) => [...run.events].reverse().find(event => event.stage === stage)?.message;
  switch (latest?.stage) {
    case "planned":
    case "dataset_search":
      return { title: "Finding the dataset.", description: message("dataset_search") || "The experiment needs real data. Searching the paper's links, GitHub, OpenML, Hugging Face and Zenodo.", orb: "searching", step: 1 };
    case "dataset_found":
    case "dataset_candidate":
      return { title: "Comparing the candidates.", description: `${message("dataset_found") ?? ""} The agent is checking which files are the dataset the paper used.`.trim(), orb: "shaping", step: 1 };
    case "dataset_selected":
    case "dataset_missing":
      return { title: "Data chosen.", description: message("dataset_selected") || latest.message, orb: "shaping", step: 1 };
    case "dataset_fetch":
    case "dataset_progress":
      return { title: "Downloading the data.", description: message("dataset_progress") || message("dataset_fetch") || "Downloading into the sandbox.", orb: "connecting", step: 2 };
    case "dataset_ready":
      return { title: "Checking the data.", description: latest.message, orb: "working", step: 2 };
    case "writing":
      return { title: "Writing the experiment against the real data.", description: "The agent has the files and their previews, and is writing code that reads them.", orb: "shaping", step: 1 };
  }
}

function processPhase(run: Run): ProcessPhase {
  if (run.status === "queued" && run.queuePosition) return { title: run.queuePosition === 1 ? "You're next in line." : `You're number ${run.queuePosition} in line.`, description: `All shared sandboxes are busy with other investigations. ${run.queuePosition === 1 ? "Yours starts as soon as one frees up." : `${run.queuePosition - 1} ${run.queuePosition === 2 ? "investigation is" : "investigations are"} ahead of yours.`} You can leave this page open; it starts automatically.`, orb: "connecting", step: 2 };
  const data = dataPhase(run);
  if (data) return data;
  if (run.status === "queued" && run.queuePosition) return { title: run.queuePosition === 1 ? "You're next in line." : `You're number ${run.queuePosition} in line.`, description: `All shared sandboxes are busy with other investigations. ${run.queuePosition === 1 ? "Yours starts as soon as one frees up." : `${run.queuePosition - 1} ${run.queuePosition === 2 ? "investigation is" : "investigations are"} ahead of yours.`} You can leave this page open; it starts automatically.`, orb: "connecting", step: 2 };
  if (run.status === "queued") return { title: "Preparing the experiment.", description: run.events.filter(event => event.stage === "workspace_progress").at(-1)?.message || "Waiting for an execution slot.", orb: "connecting", step: 2 };
  if (run.status === "repairing") {
    if (run.repairs?.at(-1)?.afterAttempt === run.attempts.at(-1)?.number && run.workingCode) return { title: "The fix is ready.", description: "Submitting the revised code to the sandbox.", orb: "connecting", step: 2 };
    return { title: "Fixing a coding error.", description: "Reading the execution feedback and correcting the code.", orb: "solving", step: 2 };
  }
  if (run.status === "running") {
    if (run.result) return { title: "Bringing the evidence together.", description: "Saving the report and pausing the experiment workspace.", orb: "composing", step: 2 };
    return { title: run.attempts.length ? "Testing the fix." : "Putting the claim to the test.", description: run.attempts.length ? "Running the revised code in the sandbox." : "Running the generated experiment in the sandbox.", orb: "working", step: 2 };
  }
  return run.events.some(event => event.stage === "source")
    ? { title: "Writing a focused experiment.", description: "Choosing a testable claim and turning the method into code.", orb: "shaping", step: 1 }
    : { title: "Getting to know your paper.", description: "Reading the source and following its ideas.", orb: "searching", step: 0 };
}

export function ProcessView({ run, onCancel, busy }: { run?: Run; onCancel?: () => void; busy?: boolean }) {
  const phase = run ? processPhase(run) : { title: "Opening your research.", description: "Everything will be here in a moment.", orb: "connecting" as const, step: 0 };
  const key = `${run?.status || "opening"}-${phase.orb}`;
  return <section className={`process-view stage-enter ${run?.plan ? "has-code" : ""}`} aria-label="Research in progress">
    {run && <p className="process-paper" title={run.paper?.title || run.sourceUrl}>{run.paper?.title || (run.sourceUrl.includes("github.com") ? "Your repository" : "Your paper")}</p>}
    <div className="process-status"><ProcessOrb state={phase.orb} label={phase.title} />
    <div key={key} className="process-copy stage-enter" role="status" aria-live="polite" aria-atomic="true"><h1>{phase.title}</h1><p>{phase.description}</p></div></div>
    {run && <>
      <ol className="phase-trail" aria-label="Investigation progress">{["Read", "Write", run.status === "repairing" ? "Repair" : "Run"].map((label, index) => <li key={index} aria-current={index === phase.step ? "step" : undefined} className={index < phase.step ? "phase-done" : ""}>{index < phase.step ? <Check size={10} aria-hidden="true" /> : <span aria-hidden="true" />}{label}</li>)}</ol>
      <AgentConsole key={`console-${run.id}`} run={run} />
      {!(run.plan?.datasets?.length && !run.datasets?.codeWritten) && <AgentWorkbench key={run.id} run={run} />}
      <details className="agent-inspection product-disclosure"><summary>Research context<ChevronDown size={13} aria-hidden="true" /></summary><div className="product-disclosure-body">
        {run.plan && <><p className="agent-question">{run.plan.summary || run.plan.title}</p><p>{SCOPE_LABELS[run.plan.scope]}. This is the question Trace is testing.</p></>}
        <RepairRecord run={run} />
        <details className="quiet-disclosure"><summary>Activity<ChevronDown size={14} /></summary><div className="disclosure-body"><ActivityLog run={run} /></div></details>
        <SourceCoverage run={run} />
      </div></details>
    </>}
    {onCancel && <button className="text-button process-cancel" onClick={onCancel} disabled={busy}>Cancel</button>}
  </section>;
}

export function CreditAlert({ title = "Out of agent API credit" }: { title?: string }) {
  return <div className="credit-alert" role="alert"><span className="credit-alert-icon">!</span><div><strong>{title}</strong><p>The agent's AI API has no credit left, so new investigations can't plan or write code. The site owner needs to top up the API credit. Saved reports are still available.</p></div></div>;
}

export function RunWorkspace({ run, onBack, onApprove, onCancel, onRetry, busy }: {
  run: Run; onBack: () => void; onApprove: () => void; onCancel: () => void; onRetry: () => void; busy: boolean;
}) {
  const active = ACTIVE_STATUSES.includes(run.status);
  const failed = ["failed", "blocked"].includes(run.status);
  const invalidOutput = run.mode === "live" && run.status === "completed" && run.attempts.length > 0 && !parseMeasurements(run.attempts.at(-1)!.stdout);
  const showResult = !active && run.status !== "awaiting_approval" && (Boolean(run.result || run.attempts.length) || failed);
  return <main className={`workspace ${active ? "is-processing" : ""}`}>
    {!showResult && <div className="workspace-topline"><button className="text-button" onClick={onBack}><ArrowLeft size={14} />New research</button>{!active && <a className="text-button" href={run.sourceUrl} target="_blank" rel="noreferrer">Read paper<ArrowUpRight size={13} /></a>}</div>}
    {active ? <ProcessView run={run} onCancel={onCancel} busy={busy} /> : showResult ? <>{run.errorCode === "river_out_of_credit" && <CreditAlert />}<ResultView run={run} onBack={onBack} onRetry={onRetry} busy={busy} /></> : <div className="research-sheet stage-enter">
      <p className="paper-byline">{run.paper?.title || run.title}</p>
      {run.errorCode === "river_out_of_credit" && <CreditAlert />}
      {run.mode === "example" && <p className="example-note">Recorded example. These are measurements from a previous experiment.</p>}
      {run.status === "awaiting_approval" ? <><Protocol run={run} onApprove={onApprove} busy={busy} /><button className="text-button review-cancel" onClick={onCancel} disabled={busy}>Cancel experiment</button></> : <div className="outcome-empty"><ProcessOrb state={failed ? "shaping" : "breathing"} label={failed ? "Experiment stopped" : "Research paused"} still /><h1>{failed ? "We could not finish this one." : "You stopped this investigation."}</h1><p>{failed ? "No result is available. The details below explain where it stopped." : "You can start again whenever you are ready."}</p><button className="secondary-button" onClick={onBack}>Start a new investigation<ArrowRight size={14} /></button></div>}
      {(failed || invalidOutput) && run.plan && <div className="retry-protocol"><p>{invalidOutput ? "The process ran, but its output needs correction. Retry the unchanged experiment with automatic output validation and repair." : "The saved experiment and its evidence are kept. You can start a fresh attempt."}</p><button className="secondary-button" onClick={onRetry} disabled={busy}>{invalidOutput ? "Repair measurement output" : "Try again"}<ArrowRight size={14} /></button></div>}
      <details className="quiet-disclosure research-details"><summary>Research details<ChevronDown size={15} /></summary><div className="disclosure-body">
        {run.error && <p className="detail-error">{run.error}</p>}
        <SourceCoverage run={run} />
        {run.status !== "awaiting_approval" && run.plan && <details className="quiet-disclosure"><summary>The experiment<ChevronDown size={14} /></summary><Protocol run={run} onApprove={onApprove} busy={busy} /></details>}
        {run.claims.length > 0 && <details className="quiet-disclosure"><summary>Claims & sources<ChevronDown size={14} /></summary><div className="disclosure-body">{run.claims.map(claim => <article className="source-claim" key={claim.id}><p>{claim.text}</p>{claim.evidenceQuote && <blockquote>{claim.evidenceQuote}<cite>{claim.sourceLocation}</cite></blockquote>}</article>)}</div></details>}
        <details className="quiet-disclosure"><summary>Activity<ChevronDown size={14} /></summary><div className="disclosure-body"><ActivityLog run={run} /></div></details>
      </div></details>
    </div>}
  </main>;
}
