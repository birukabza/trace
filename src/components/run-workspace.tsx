"use client";

import { useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, Code2, Copy, Info, Loader2, ShieldCheck, X } from "lucide-react";
import type { Run, RunStatus } from "@/lib/types";
import { ProcessOrb } from "./process-orb";
import type { OrbState } from "thinking-orbs";

export const ACTIVE_STATUSES: RunStatus[] = ["analyzing", "queued", "running"];
export const STATUS_LABELS: Record<RunStatus, string> = {
  analyzing: "Reading source", awaiting_approval: "Ready for your review", queued: "Experiment queued", running: "Experiment running",
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
  return <div className="review-sheet stage-enter"><div className="review-orb"><ProcessOrb state="breathing" label="Ready for your review" /></div>
    <span className="quiet-label">Your experiment</span>
    <h1>A question we can test.</h1>
    <p className="review-question">{plan.summary || plan.title}</p>
    <div className="scope-note"><span />{SCOPE_LABELS[plan.scope]}. {plan.scope === "reproduction" ? "We will document any differences from the paper." : "This tests part of the paper, rather than its full benchmark."}</div>
    <details className="quiet-disclosure"><summary>How we will test it<ChevronDown size={15} /></summary><div className="disclosure-body"><h3>The precise question</h3><p>{plan.hypothesis}</p><h3>Method</h3><p>{plan.method}</p><h3>Data</h3><p>{plan.dataset}</p><h3>Measurements</h3><ul>{plan.metrics.map(metric => <li key={metric}>{metric}</li>)}</ul></div></details>
    <details className="quiet-disclosure"><summary>Review the code<ChevronDown size={15} /></summary><div className="disclosure-body"><CodePanel run={run} /></div></details>
    {plan.limitations.length > 0 && <details className="quiet-disclosure"><summary>What this can tell us<ChevronDown size={15} /></summary><div className="disclosure-body"><ul>{plan.limitations.map(value => <li key={value}>{value}</li>)}</ul></div></details>}
    {run.status === "awaiting_approval" && <div className="review-action"><button className="primary-button accent" onClick={onApprove} disabled={busy}>{busy ? "Starting experiment" : "Approve & run"}<ArrowUpRight size={16} /></button><p>Nothing runs until you approve.</p></div>}
  </div>;
}
function ActivityLog({ run }: { run: Run }) {
  return <ol className="bench-timeline">{run.events.map((event, index) => {
    const pending = index === run.events.length - 1 && ACTIVE_STATUSES.includes(run.status);
    const failed = ["failed", "blocked", "cancelled"].includes(event.stage);
    return <li key={event.id} className={failed ? "event-warning" : ""}><span className="event-symbol">{pending ? <Loader2 size={14} className="spin" /> : failed ? <X size={13} /> : <Check size={13} />}</span><div><div className="event-title"><h3>{event.stage.replaceAll("_", " ")}</h3><time dateTime={event.at}>{time(event.at)}</time></div><p>{event.message}</p></div></li>;
  })}</ol>;
}

function CodePanel({ run }: { run: Run }) {
  const [copied, setCopied] = useState(false);
  const code = run.plan?.pythonCode;
  if (!code) return <EmptyState icon={<Code2 size={25} />} title="The method becomes code.">Generated Python appears after planning. You can inspect it before approving execution.</EmptyState>;
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } };
  return <><div className="content-heading"><div><span className="bench-kicker">02 / Inspect the method</span><h2>Nothing runs unseen.</h2><p>The proposed Python is the code submitted after approval.</p></div></div><div className="code-window"><div className="code-topbar"><span><span className="file-dot" />experiment.py<span className="code-language">Python</span></span><button className="text-button" onClick={copy}>{copied ? <CheckCheck size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy code"}</button></div><pre><code>{code}</code></pre></div><div className="code-footnote"><ShieldCheck size={15} /><span>Numerical Python only. No application credentials are sent to the sandbox.</span></div></>;
}

function ExperimentMeasurements({ metrics }: { metrics: NonNullable<Run["result"]>["metrics"] }) {
  const datasets = metrics.flatMap(metric => {
    try {
      const rows = JSON.parse(metric.observed);
      if (!Array.isArray(rows) || !rows.length || rows.length > 50 || !rows.every(row => row && typeof row === "object" && !Array.isArray(row) && Object.values(row).every(value => value === null || ["string", "number", "boolean"].includes(typeof value)))) return [];
      const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
      if (columns.length > 18) return [];
      return [{ metric, rows: rows as Record<string, string | number | boolean | null>[], columns }];
    } catch { return []; }
  });
  const scalars = metrics.filter(metric => !datasets.some(dataset => dataset.metric === metric));
  const reported = scalars.some(metric => Boolean(metric.reported));
  return <>
    {datasets.map(({ metric, rows, columns }) => <div className="measured-dataset" key={metric.name}><div className="dataset-label"><h3>{metric.name.replaceAll("_", " ")}</h3><span>{rows.length} records · scroll to explore <ArrowRight size={12} /></span></div><div className="measurement-scroll" tabIndex={0} role="region" aria-label={`${metric.name} measurements`}><table className="record-table"><thead><tr>{columns.map(column => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map(column => <td key={column}>{row[column] === undefined ? "—" : String(row[column])}</td>)}</tr>)}</tbody></table></div></div>)}
    {scalars.length > 0 && <table className="metric-table"><thead><tr><th>Measurement</th>{reported && <th>Paper reports</th>}<th>Observed</th></tr></thead><tbody>{scalars.map((metric, index) => <tr key={`${metric.name}-${index}`}><td>{metric.name.replaceAll("_", " ")}</td>{reported && <td>{metric.reported || "Not comparable"}</td>}<td><span className={metric.observed === "true" ? "observed-positive" : ""}>{metric.observed}</span></td></tr>)}</tbody></table>}
  </>;
}

function Evidence({ run }: { run: Run }) {
  const [attemptIndex, setAttemptIndex] = useState(0);
  const result = run.result;
  const attempt = run.attempts[attemptIndex];
  const labels = { matched: "Matched within this experiment", partial: "Part of the paper tested", differed: "Results differed", blocked: "Experiment stopped" };
  return <div className="evidence-sheet stage-enter">
    <div className={`outcome-mark ${result ? "" : "outcome-warning"}`}>{result ? <Check size={20} /> : <Info size={20} />}</div>
    <span className="quiet-label">{result ? labels[result.verdict] : "Experiment stopped"}</span>
    <h1>{result ? "Here is what we found." : "The experiment needs another look."}</h1>
    <p className="result-summary">{result?.summary || "The experiment did not finish successfully. Its output is saved below."}</p>
    {result && <>
      <details className="quiet-disclosure"><summary>See the measurements<ChevronDown size={15} /></summary><div className="disclosure-body"><ExperimentMeasurements metrics={result.metrics} /></div></details>
      {result.limitations.length > 0 && <div className="result-caveat"><span>Keep in mind</span><p>{result.limitations[0]}</p>{result.limitations.length > 1 && <details><summary>More about the scope</summary><ul>{result.limitations.slice(1).map(value => <li key={value}>{value}</li>)}</ul></details>}</div>}
    </>}
    <div className="report-download"><a className="primary-button" href={`/api/runs/${encodeURIComponent(run.id)}/report`} download>Download report<ArrowDownToLine size={15} /></a></div>
    {attempt && <details className="quiet-disclosure execution-details"><summary>Execution record<ChevronDown size={15} /></summary><div className="disclosure-body"><div className="attempt-selector">{run.attempts.map((item, index) => <button key={item.number} className={index === attemptIndex ? "active" : ""} onClick={() => setAttemptIndex(index)}>Attempt {item.number}</button>)}</div><p className="execution-duration">Exit {attempt.exitCode} / {(attempt.durationMs / 1000).toFixed(1)}s</p><h3>Output</h3><pre className="terminal-output">{attempt.stdout || "No output"}</pre><h3>Errors</h3><pre className="terminal-output">{attempt.stderr || "No errors"}</pre><details><summary>Submitted code</summary><pre className="terminal-output">{attempt.code}</pre></details></div></details>}
  </div>;
}
type ProcessPhase = { title: string; description: string; orb: OrbState };
function processPhase(run: Run): ProcessPhase {
  if (run.status === "queued") return { title: "Your experiment is next.", description: "We will begin in a moment.", orb: "connecting" };
  if (run.status === "running") {
    return { title: "Putting the claim to the test.", description: "Running the experiment you approved.", orb: "working" };
  }
  return run.events.some(event => event.stage === "source")
    ? { title: "Finding what we can verify.", description: "Shaping a clear experiment from the paper's claims.", orb: "solving" }
    : { title: "Getting to know your paper.", description: "Reading the source and following its ideas.", orb: "searching" };
}

export function ProcessView({ run, onCancel, busy }: { run?: Run; onCancel?: () => void; busy?: boolean }) {
  const phase = run ? processPhase(run) : { title: "Opening your research.", description: "Everything will be here in a moment.", orb: "connecting" as const };
  const key = `${run?.status || "opening"}-${phase.orb}`;
  return <section className="process-view stage-enter" aria-label="Research in progress">
    {run && <p className="process-paper" title={run.paper?.title || run.sourceUrl}>{run.paper?.title || (run.sourceUrl.includes("github.com") ? "Your repository" : "Your paper")}</p>}
    <ProcessOrb state={phase.orb} label={phase.title} />
    <div key={key} className="process-copy stage-enter" role="status" aria-live="polite" aria-atomic="true"><h1>{phase.title}</h1><p>{phase.description}</p></div>
    {onCancel && <button className="text-button process-cancel" onClick={onCancel} disabled={busy}>Cancel</button>}
  </section>;
}

export function RunWorkspace({ run, onBack, onApprove, onCancel, onRetry, busy }: {
  run: Run; onBack: () => void; onApprove: () => void; onCancel: () => void; onRetry: () => void; busy: boolean;
}) {
  const active = ACTIVE_STATUSES.includes(run.status);
  const failed = ["failed", "blocked"].includes(run.status);
  return <main className={`workspace ${active ? "is-processing" : ""}`}>
    <div className="workspace-topline"><button className="text-button" onClick={onBack}><ArrowLeft size={14} />New research</button>{!active && <a className="text-button" href={run.sourceUrl} target="_blank" rel="noreferrer">Read paper<ArrowUpRight size={13} /></a>}</div>
    {active ? <ProcessView run={run} onCancel={onCancel} busy={busy} /> : <div className="research-sheet stage-enter">
      <p className="paper-byline">{run.paper?.title || run.title}</p>
      {run.mode === "example" && <p className="example-note">Recorded example. These are measurements from a previous experiment.</p>}
      {run.status === "awaiting_approval" ? <><Protocol run={run} onApprove={onApprove} busy={busy} /><button className="text-button review-cancel" onClick={onCancel} disabled={busy}>Cancel experiment</button></> : run.result || run.attempts.length ? <Evidence run={run} /> : <div className="outcome-empty"><ProcessOrb state={failed ? "shaping" : "breathing"} label={failed ? "Experiment stopped" : "Research paused"} still /><h1>{failed ? "We could not finish this one." : "You stopped this investigation."}</h1><p>{failed ? "No result is available. The details below explain where it stopped." : "You can start again whenever you are ready."}</p><button className="secondary-button" onClick={onBack}>Start a new investigation<ArrowRight size={14} /></button></div>}
      {failed && run.plan && <div className="retry-protocol"><p>You can review the same experiment and try again.</p><button className="secondary-button" onClick={onRetry} disabled={busy}>Review & retry<ArrowRight size={14} /></button></div>}
      <details className="quiet-disclosure research-details"><summary>Research details<ChevronDown size={15} /></summary><div className="disclosure-body">
        {run.error && <p className="detail-error">{run.error}</p>}
        {run.status !== "awaiting_approval" && run.plan && <details className="quiet-disclosure"><summary>The experiment<ChevronDown size={14} /></summary><Protocol run={run} onApprove={onApprove} busy={busy} /></details>}
        {run.claims.length > 0 && <details className="quiet-disclosure"><summary>Claims & sources<ChevronDown size={14} /></summary><div className="disclosure-body">{run.claims.map(claim => <article className="source-claim" key={claim.id}><p>{claim.text}</p>{claim.evidenceQuote && <blockquote>{claim.evidenceQuote}<cite>{claim.sourceLocation}</cite></blockquote>}</article>)}</div></details>}
        <details className="quiet-disclosure"><summary>Activity<ChevronDown size={14} /></summary><div className="disclosure-body"><ActivityLog run={run} /></div></details>
      </div></details>
    </div>}
  </main>;
}
