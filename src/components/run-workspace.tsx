"use client";

import { useState, type ReactNode } from "react";
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCheck, ChevronDown, Clock3, Code2, Copy, Cpu, ExternalLink, FileText, FlaskConical, GitBranch, Info, Loader2, Play, ShieldCheck, Square, Terminal, X } from "lucide-react";
import type { Run, RunStatus } from "@/lib/types";
import { ResearchField } from "./research-field";

export const ACTIVE_STATUSES: RunStatus[] = ["analyzing", "queued", "running"];
export const STATUS_LABELS: Record<RunStatus, string> = {
  analyzing: "Reading source", awaiting_approval: "Ready for your review", queued: "Experiment queued", running: "Experiment running",
  completed: "Experiment complete", blocked: "Experiment blocked", failed: "Run failed", cancelled: "Run cancelled",
};
const SCOPE_LABELS = { component_check: "Component check", reduced_experiment: "Reduced experiment", reproduction: "Reproduction" };
export type WorkspaceTab = "protocol" | "activity" | "code" | "evidence";
const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="bench-empty"><div className="empty-orbit">{icon}</div><h3>{title}</h3><p>{children}</p></div>;
}

function Protocol({ run, onApprove, busy }: { run: Run; onApprove: () => void; busy: boolean }) {
  const plan = run.plan;
  if (!plan) return <><div className="planning-state"><div className="planning-visual"><ResearchField active={run.status === "analyzing"} /></div><span className="bench-kicker">{run.status === "analyzing" ? "The investigation has started" : "Investigation paused"}</span><h2>{run.status === "analyzing" ? "Finding a question worth testing." : "No executable protocol yet."}</h2><p>{run.status === "analyzing" ? "Reading the source, checking the method, and finding an experiment that fits your sandbox. You will review the code before it runs." : run.error || "Open the activity log to see what happened."}</p>{run.status === "analyzing" && <div className="planning-footnote"><Loader2 size={14} className="spin" />Planning with River · no code has run</div>}</div><ActivityLog run={run} /></>;
  return <>
    <div className="content-heading"><div><span className="bench-kicker">01 / The plan</span><h2>A small, testable question.</h2><p>Review what the agent proposes to measure.</p></div><span className="scope-tag">{SCOPE_LABELS[plan.scope]}</span></div>
    <section className="protocol-hypothesis"><span className="bench-kicker">Hypothesis</span><h3>{plan.hypothesis}</h3></section>
    <div className="protocol-facts"><div><BookOpen size={17} /><span>Data</span><p>{plan.dataset}</p></div><div><Cpu size={17} /><span>Environment</span><p>{plan.dependencies.join(" · ") || "Python standard library"}<small>Up to 60 seconds · 2 vCPU · 4 GB</small></p></div></div>
    <section className="method-section"><h3>The method</h3><p>{plan.method}</p></section>
    <section className="method-section"><h3>What gets measured</h3><ol className="measurement-list">{plan.metrics.map((metric, index) => <li key={metric}><span>{String(index + 1).padStart(2, "0")}</span>{metric}</li>)}</ol></section>
    <section className="protocol-boundaries"><div><ShieldCheck size={16} /><h3>Keep the scope honest.</h3></div><p>{plan.scope === "reproduction" ? "This protocol aims to match the source experiment. The report must document deviations." : "This checks a bounded part of the paper. It does not establish reproduction of the full benchmark."}</p><ul>{plan.limitations.map(value => <li key={value}>{value}</li>)}</ul></section>
    {run.status === "awaiting_approval" ? <div className="review-dock"><div><span className="review-indicator" /><div><strong>Ready when you are.</strong><p>Review the Code tab, then approve this protocol.</p></div></div><button className="primary-button" onClick={onApprove} disabled={busy}>{busy ? "Starting experiment" : "Approve & run"}{busy ? <Loader2 size={16} className="spin" /> : <ArrowUpRight size={17} />}</button></div> : <p className="protocol-status"><Info size={14} />{run.mode === "example" ? "Recorded protocol. This example will not start a new experiment." : `This protocol is ${STATUS_LABELS[run.status].toLowerCase()}. Inspect the Evidence tab for its execution record.`}</p>}
  </>;
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
  if (!result && !attempt) return <EmptyState icon={<FlaskConical size={25} />} title="Evidence takes an experiment.">{ACTIVE_STATUSES.includes(run.status) ? "Your experiment is in progress. Measurements and logs will appear here." : run.status === "awaiting_approval" ? "Review the protocol and code, then approve a run to collect measurements. Nothing has executed yet." : "This run has no execution measurements. Open Activity to inspect its status."}</EmptyState>;
  const labels = { matched: "Matched within protocol", partial: "Partial verification", differed: "Measurements differed", blocked: "Experiment blocked" };
  return <>
    {result && <><div className="result-head"><div className="result-topline"><span className="bench-kicker">03 / The evidence</span><span className="scope-tag"><ShieldCheck size={13} />{labels[result.verdict]}</span></div><h2>{run.mode === "example" ? "Recorded measurements." : "Execution complete."}</h2><p>{result.summary}</p>{attempt && <div className="result-statline"><span><span className="status-dot ready" />Exit {attempt.exitCode}</span><span><Clock3 size={13} />{(attempt.durationMs / 1000).toFixed(1)}s command time</span><span><Terminal size={13} />{run.attempts.length} execution record</span></div>}</div><div className="section-intro"><h3>Measured, not inferred.</h3><p>Values parsed from the experiment’s captured output.</p></div><ExperimentMeasurements metrics={result.metrics} />{result.limitations.length > 0 && <section className="protocol-boundaries"><div><Info size={16} /><h3>What this does not establish</h3></div><ul>{result.limitations.map(value => <li key={value}>{value}</li>)}</ul></section>}</>}
    <div className="report-download"><div><FileText size={20} /><div><strong>Take the evidence with you.</strong><p>Protocol, code, source references, and execution logs.</p></div></div><a className="secondary-button" href={`/api/runs/${encodeURIComponent(run.id)}/report`} download>Download report<ArrowDownToLine size={15} /></a></div>
    {attempt && <details className="execution-details" open={attempt.exitCode !== 0}><summary><span><Terminal size={16} />Execution record <span className={`exit-tag ${attempt.exitCode === 0 ? "" : "exit-warning"}`}>Exit {attempt.exitCode}</span></span><ChevronDown size={16} /></summary><div className="execution-body"><div className="attempt-selector">{run.attempts.map((item, index) => <button key={item.number} className={index === attemptIndex ? "active" : ""} onClick={() => setAttemptIndex(index)}>Attempt {item.number}</button>)}</div><p className="execution-duration">{(attempt.durationMs / 1000).toFixed(1)}s · Unedited sandbox output</p><div className="terminal-label">stdout</div><pre className="terminal-output">{attempt.stdout || "(no output)"}</pre><div className="terminal-label">stderr</div><pre className={`terminal-output ${attempt.stderr ? "terminal-error" : ""}`}>{attempt.stderr || "(no errors)"}</pre><details className="executed-code"><summary>Inspect submitted Python</summary><pre className="terminal-output">{attempt.code}</pre></details></div></details>}
  </>;
}

export function RunWorkspace({ run, tab, setTab, onBack, onApprove, onCancel, onRetry, busy }: {
  run: Run; tab: WorkspaceTab; setTab: (tab: WorkspaceTab) => void; onBack: () => void; onApprove: () => void; onCancel: () => void; onRetry: () => void; busy: boolean;
}) {
  const [inspectedClaim, setInspectedClaim] = useState<string | null>(null);
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const selectedClaim = run.claims.find(claim => claim.id === (inspectedClaim || run.plan?.claimId)) || run.claims[0];
  const active = ACTIVE_STATUSES.includes(run.status);
  const warning = ["failed", "blocked"].includes(run.status);
  const currentStep = run.status === "analyzing" || !run.plan ? 0 : run.status === "awaiting_approval" ? 1 : active ? 2 : run.attempts.length || run.result ? 3 : 1;
  return <main className="workspace">
    <div className="workspace-topline"><button className="text-button" onClick={onBack}><ArrowLeft size={15} />All research</button><span className="run-identifier">INVESTIGATION / {run.id.slice(-8)}</span></div>
    <header className="investigation-header"><div className="investigation-copy"><span className="bench-kicker">{run.mode === "example" ? "Recorded investigation" : "Your research workspace"}</span><h1>{run.paper?.title || run.title || "Reading your research."}</h1><div className="investigation-meta"><span className={`run-status ${warning ? "is-warning" : ""}`}><span className={`status-dot ${active ? "running" : warning ? "warning" : run.status === "cancelled" ? "" : "ready"}`} />{run.mode === "example" ? "Recorded example" : STATUS_LABELS[run.status]}</span>{run.plan && <span>{SCOPE_LABELS[run.plan.scope]}</span>}<span>Started {time(run.createdAt)}</span></div></div><div className="investigation-art"><ResearchField active={active} /><span className="field-caption">A question. An experiment. A paper trail.</span></div></header>
    <div className="journey-bar"><ol aria-label="Experiment progress">{["Read source", "Review protocol", "Run experiment", "Inspect evidence"].map((label, index) => <li key={label} className={index < currentStep ? "step-done" : index === currentStep ? "step-current" : ""} aria-current={index === currentStep ? "step" : undefined}><span>{index < currentStep ? <Check size={12} /> : `0${index + 1}`}</span>{label}</li>)}</ol>{(active || run.status === "awaiting_approval") && <button className="text-button cancel-run" onClick={onCancel} disabled={busy}><Square size={11} />Cancel run</button>}</div>
    {run.mode === "example" && <div className="recorded-notice"><Info size={16} /><p>Recorded example. These are prior synthetic measurements. Opening this view makes no model or sandbox request.</p></div>}
    {run.error && <div className="error-notice" role="status"><Info size={17} /><p>{run.error}</p></div>}
    {run.mode === "live" && run.plan && warning && <div className="retry-protocol"><p>The original evidence is preserved. Review the unchanged protocol before a new execution.</p><button className="secondary-button" onClick={onRetry} disabled={busy}>Review protocol again<ArrowRight size={14} /></button></div>}
    <div className="workspace-grid"><aside className={`source-sidebar ${sourceExpanded ? "source-expanded" : ""}`} aria-label="Source and claims"><button className="mobile-source-toggle" aria-expanded={sourceExpanded} aria-controls="source-context" onClick={() => setSourceExpanded(value => !value)}><FileText size={16} /><span>Source &amp; claims<small>{run.claims.length} claims extracted</small></span><ChevronDown size={16} /></button><div className="source-sidebar-content" id="source-context"><div className="source-document"><span className="source-document-icon"><FileText size={19} /></span><span className="bench-kicker">Source material</span><h2>{run.paper?.title || run.title}</h2><a className="source-link" href={run.sourceUrl} target="_blank" rel="noreferrer">Open original source<ArrowUpRight size={14} /></a>{run.repositoryUrl && <a className="source-link" href={run.repositoryUrl} target="_blank" rel="noreferrer"><GitBranch size={13} />Author repository<ExternalLink size={11} /></a>}</div><div className="sidebar-divider" /><div className="sidebar-label">Extracted claims<span>{String(run.claims.length).padStart(2, "0")}</span></div><div className="claims-list">{run.claims.map((claim, index) => <button key={claim.id} className={`claim-option ${claim.id === selectedClaim?.id ? "selected" : ""}`} aria-pressed={claim.id === selectedClaim?.id} onClick={() => setInspectedClaim(claim.id)}><span className="claim-index"><span>Claim {String(index + 1).padStart(2, "0")}</span>{claim.id === run.plan?.claimId && <span className="planned-claim">In protocol</span>}</span><span className="claim-preview">{claim.text}</span></button>)}</div>{!run.claims.length && <p className="claim-detail">Claims appear here once the source has been analyzed.</p>}{selectedClaim && <div className="claim-context"><span className={`feasibility-label ${selectedClaim.feasible ? "" : "not-feasible"}`}>{selectedClaim.feasible ? <Check size={12} /> : <Info size={12} />}{selectedClaim.feasible ? "CPU check proposed" : "Outside this run’s resources"}</span><p>{selectedClaim.reason}</p>{selectedClaim.id !== run.plan?.claimId && run.plan && <p className="claim-inspection-note">You are inspecting a source claim. The protocol remains attached to Claim {String(run.claims.findIndex(claim => claim.id === run.plan?.claimId) + 1).padStart(2, "0")}.</p>}{selectedClaim.evidenceQuote && <details className="source-evidence" key={selectedClaim.id}><summary>Read claim &amp; source<ChevronDown size={14} /></summary><p className="full-claim">{selectedClaim.text}</p><blockquote>{selectedClaim.evidenceQuote}</blockquote><cite>{selectedClaim.sourceLocation}</cite></details>}</div>}<div className="sandbox-card"><span><Cpu size={16} />CreateOS Sandbox</span><p>EU region <i /> 2 vCPU <i /> 4 GB RAM</p><small>One approved experiment at a time.</small></div></div></aside>
    <section className="workspace-main" aria-label="Experiment details"><div className="workspace-tabs" role="tablist" aria-label="Experiment views">{([{ id: "protocol", label: "Protocol", icon: <FlaskConical size={15} /> }, { id: "activity", label: "Activity", icon: <Activity size={15} /> }, { id: "code", label: "Code", icon: <Code2 size={15} /> }, { id: "evidence", label: "Evidence", icon: <CheckCheck size={15} /> }] as const).map(item => <button key={item.id} role="tab" id={`tab-${item.id}`} aria-controls={`panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onKeyDown={event => { const ids: WorkspaceTab[] = ["protocol", "activity", "code", "evidence"]; const index = ids.indexOf(tab); const next = event.key === "ArrowRight" ? ids[(index + 1) % ids.length] : event.key === "ArrowLeft" ? ids[(index + ids.length - 1) % ids.length] : event.key === "Home" ? ids[0] : event.key === "End" ? ids[ids.length - 1] : null; if (next) { event.preventDefault(); setTab(next); document.getElementById(`tab-${next}`)?.focus(); } }} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.icon}{item.label}{item.id === "activity" && active && <span className="activity-pulse" />}</button>)}</div><div className="workspace-content" role="tabpanel" tabIndex={0} aria-labelledby={`tab-${tab}`} id={`panel-${tab}`}>
      {tab === "protocol" && <Protocol run={run} onApprove={onApprove} busy={busy} />}
      {tab === "activity" && <><div className="content-heading"><div><span className="bench-kicker">The research log</span><h2>Follow the investigation.</h2><p>Source reads, approvals, and sandbox output in one timeline.</p></div><span className="log-count">{run.events.length} events</span></div>{active && <div className="live-activity"><ResearchField active /><div><Loader2 size={17} className="spin" /><strong>{STATUS_LABELS[run.status]}</strong><p>Your run continues in the background.</p></div></div>}<ActivityLog run={run} /></>}
      {tab === "code" && <CodePanel key={run.id} run={run} />}
      {tab === "evidence" && <Evidence key={run.id} run={run} />}
    </div></section></div>
  </main>;
}
