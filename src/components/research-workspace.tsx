"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Activity, ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCheck, ChevronRight, Clock3, Code2, Copy, ExternalLink, FileText, FlaskConical, GitBranch, History, Info, Link2, Loader2, Play, Plus, Settings2, ShieldCheck, Square, Terminal, X } from "lucide-react";
import type { Health, Run, RunStatus } from "@/lib/types";
import { TraceMark } from "./trace-mark";
import { ResearchShader } from "./research-shader";

const KMEANS_URL = "https://theory.stanford.edu/~sergei/papers/kMeansPP-soda.pdf";
const ATTENTION_URL = "https://arxiv.org/abs/1706.03762";
const ACTIVE_STATUSES: RunStatus[] = ["analyzing", "queued", "running"];
const STATUS_LABELS: Record<RunStatus, string> = {
  analyzing: "Reading paper", awaiting_approval: "Protocol ready", queued: "Experiment queued", running: "Experiment running",
  completed: "Run complete", blocked: "Experiment blocked", failed: "Run failed", cancelled: "Run cancelled",
};
const SCOPE_LABELS = { component_check: "Component check", reduced_experiment: "Reduced experiment", reproduction: "Reproduction" };
type Tab = "protocol" | "activity" | "code" | "evidence";
type ModalName = "settings" | "history" | null;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${response.status}). Try again.`);
  }
  return response.json() as Promise<T>;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex="0"]');
    focusable()?.[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = priorOverflow; previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}>
    <div className="modal-header"><div><div className="eyebrow">{eyebrow}</div><h2 id="modal-title">{title}</h2></div><button onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
    {children}
  </div></div>;
}

function Landing({ sourceUrl, setSourceUrl, repositoryUrl, setRepositoryUrl, onSubmit, onExample, busy, health }: {
  sourceUrl: string; setSourceUrl: (value: string) => void; repositoryUrl: string; setRepositoryUrl: (value: string) => void;
  onSubmit: (event: FormEvent) => void; onExample: () => void; busy: boolean; health: Health | null;
}) {
  const [showRepository, setShowRepository] = useState(false);
  return <>
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy"><div className="eyebrow"><span className="little-line" />A research verification agent</div>
        <h1 id="hero-title"><span>Research deserves</span><span className="serif hero-emphasis">a second run.</span></h1>
        <p className="hero-description">Move from published claims to <strong>observable evidence.</strong> An agent that reads papers, writes experiments, and puts results to the test.</p>
      </div>
      <ResearchShader variant="hero" />
    </section>
    <section aria-label="Start a research experiment">
      <div className="source-panel">
        <div className="source-panel-top"><span className="source-label mono">01 / Start with a source</span><span className="mono">Paper · arXiv · GitHub</span></div>
        <form onSubmit={onSubmit}>
          <div className="source-form"><Link2 size={21} strokeWidth={1.4} /><input type="url" aria-label="Paper or GitHub URL" placeholder="Paste a paper or GitHub link" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required disabled={busy} /><button className="primary-button" type="submit" disabled={busy}>{busy ? "Opening research" : "Analyze paper"}{busy ? <Loader2 size={16} className="spin" /> : <ArrowUpRight size={17} />}</button></div>
          {showRepository && <><div className="repository-field"><label htmlFor="author-repo">Author repository</label><input id="author-repo" type="url" placeholder="https://github.com/author/repository (optional)" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} aria-describedby="repository-note" /></div><p id="repository-note" className="repository-note">The README adds context. Repository code is not executed automatically.</p></>}
        </form>
      </div>
      <div className="source-bottom"><div className="examples"><span>Explore</span><button className="example-chip" onClick={onExample} disabled={busy}>k-means++ · recorded <Play size={9} /></button><button className="example-chip" onClick={() => setSourceUrl(ATTENTION_URL)}>Attention Is All You Need <ArrowUpRight size={10} /></button></div><div className="source-options"><button className="text-button" onClick={() => setShowRepository(!showRepository)}>{showRepository ? <X size={11} /> : <Plus size={11} />}{showRepository ? "Hide repository" : "Add author repository"}</button></div></div>
      <div className="source-bottom" style={{ paddingTop: 2 }}><button className="text-button" onClick={onExample} disabled={busy}><Play size={11} fill="currentColor" />Explore a recorded experiment<ArrowRight size={13} /></button><span className="connection-label mono"><span className={`status-dot ${health?.createosConfigured ? "ready" : ""}`} />{health?.createosConfigured ? "CreateOS configured" : "Isolated execution in CreateOS"}</span></div>
    </section>
    <section className="how-section" id="how-it-works" aria-labelledby="how-title">
      <div className="section-heading"><div><div className="eyebrow">From claim to evidence</div><h2 id="how-title">Don’t take its word for it.<br />Follow the experiment.</h2></div><p>A successful script is only the beginning. Trace keeps the source, the method, and the measured outcome together.</p></div>
      <div className="steps-grid">
        <article className="step-card"><span className="step-number">[01]</span><div className="step-graphic"><div className="paper-graphic"><i /><i /><i /><i /><i /></div></div><h3>Find a testable claim.</h3><p>The agent reads your source and identifies claims that your compute can actually test.</p></article>
        <article className="step-card"><span className="step-number">[02]</span><div className="step-graphic execution-graphic"><span>&lt;/&gt;</span><ChevronRight size={12} /><span>run</span><ChevronRight size={12} /><span><Check size={13} /></span></div><h3>Review. Then run.</h3><p>Inspect the protocol and generated Python before execution in an isolated sandbox.</p></article>
        <article className="step-card"><span className="step-number">[03]</span><div className="step-graphic"><div className="evidence-graphic"><i /><i /><i /><i /></div></div><h3>Keep the paper trail.</h3><p>Compare reported and observed results, with logs, limitations, and an exportable report.</p></article>
      </div>
      <div className="philosophy"><span className="eyebrow"><ShieldCheck size={14} />Evidence over confidence</span><p>A reduced experiment is labeled as one. A compute limit is reported. A result that differs is still a useful result.</p></div>
    </section>
  </>;
}

function Protocol({ run, onApprove, busy }: { run: Run; onApprove: () => void; busy: boolean }) {
  const plan = run.plan;
  if (!plan) return <div><div className="agent-progress"><div className="progress-heading">{run.status === "analyzing" ? <Loader2 size={16} className="spin" /> : <Info size={16} />}{run.status === "analyzing" ? "Reading the source and finding a testable claim" : "No executable protocol available"}</div><p>{run.status === "analyzing" ? "The agent is checking the method, datasets, and compute requirements. No experiment has started." : run.error || "Check the activity log for the agent’s findings."}</p></div>{run.status === "analyzing" && <div className="loading-lines" aria-label="Preparing protocol"><i /><i /><i /></div>}<ActivityLog run={run} /></div>;
  return <>
    <div className="content-heading"><div><h2>The experiment protocol</h2><p>Inspect the method before it touches the sandbox.</p></div><FlaskConical size={22} strokeWidth={1.1} color="#81946a" /></div>
    <div className="scope-banner"><strong>{SCOPE_LABELS[plan.scope]}.</strong> {plan.scope === "reproduction" ? "This protocol aims to match the source experiment. Its report will document deviations." : "This tests a bounded part of the paper. It does not establish that the paper’s full benchmark is reproduced."}</div>
    <div className="protocol-block"><span>Hypothesis</span><p>{plan.hypothesis}</p></div>
    <div className="protocol-block"><span>Method</span><p>{plan.method}</p></div>
    <div className="protocol-block"><span>Dataset</span><p>{plan.dataset}</p></div>
    <div className="protocol-block"><span>Measurements</span><ul>{plan.metrics.map((metric) => <li key={metric}>{metric}</li>)}</ul></div>
    <div className="protocol-block"><span>Execution</span><p>Python · {plan.dependencies.length ? plan.dependencies.join(", ") : "Standard library"}<br />Estimated runtime: {plan.estimatedSeconds < 60 ? `${plan.estimatedSeconds} seconds` : `${Math.ceil(plan.estimatedSeconds / 60)} minutes`}</p></div>
    <div className="protocol-block"><span>Limitations</span><ul>{plan.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></div>
    {run.status === "awaiting_approval" && <div className="approval-bar"><p><strong>Your review comes before execution.</strong>Approve this protocol to run the generated code in the configured CreateOS sandbox.</p><button className="primary-button accent" onClick={onApprove} disabled={busy}>{busy ? "Starting" : "Approve & run"}{busy ? <Loader2 size={14} className="spin" /> : <Play size={13} fill="currentColor" />}</button></div>}
    {run.status !== "awaiting_approval" && <div className="scope-banner" style={{ marginTop: 20, marginBottom: 0 }}>{run.mode === "example" ? "This is the protocol from a recorded example. It will not execute a new experiment." : `Protocol status: ${STATUS_LABELS[run.status].toLowerCase()}. Execution evidence appears in the Activity and Evidence tabs.`}</div>}
  </>;
}

function ActivityLog({ run }: { run: Run }) {
  return <ol className="timeline">{run.events.map((event, index) => <li className="timeline-item" key={event.id}><span className="timeline-symbol">{index === run.events.length - 1 && ACTIVE_STATUSES.includes(run.status) ? <Loader2 size={11} className="spin" /> : <Check size={11} />}</span><div><h4>{event.stage.replaceAll("_", " ")}</h4><p>{event.message}</p></div><time dateTime={event.at}>{formatTime(event.at)}</time></li>)}</ol>;
}

function CodePanel({ run }: { run: Run }) {
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(-1);
  const code = attempt >= 0 ? run.attempts[attempt]?.code : run.plan?.pythonCode;
  const copy = async () => { if (!code) return; try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } };
  if (!code) return <EmptyState icon={<Code2 size={30} strokeWidth={1} />} title="The code follows the protocol." description="Generated Python appears here when the agent finishes planning. You can inspect it before approving execution." />;
  return <><div className="content-heading"><div><h2>The executable method</h2><p>Code is evidence. Read what the agent intends to run.</p></div></div>{run.attempts.length > 0 && <div className="attempt-selector"><button className={attempt === -1 ? "active" : ""} onClick={() => setAttempt(-1)}>Original protocol</button>{run.attempts.map((item, index) => <button className={attempt === index ? "active" : ""} key={item.number} onClick={() => setAttempt(index)}>Attempt {item.number}</button>)}</div>}<div className="code-window"><div className="code-topbar"><span>experiment.py</span><button className="text-button" onClick={copy}>{copied ? <CheckCheck size={12} /> : <Copy size={12} />}{copied ? "Copied" : "Copy code"}</button></div><pre><code>{code}</code></pre></div></>;
}

function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="empty-state">{icon}<h3>{title}</h3><p>{description}</p></div>;
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
  const scalarMetrics = metrics.filter(metric => !datasets.some(dataset => dataset.metric === metric));
  return <>
    {datasets.map(({ metric, rows, columns }) => <div className="measured-dataset" key={metric.name}><h3>{metric.name.replaceAll("_", " ")}<span>{rows.length} records from stdout</span></h3><div className="measurement-scroll" tabIndex={0} role="region" aria-label={`${metric.name} measurements`}><table className="record-table"><thead><tr>{columns.map(column => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map(column => <td key={column}>{row[column] === undefined ? "—" : String(row[column])}</td>)}</tr>)}</tbody></table></div></div>)}
    {scalarMetrics.length > 0 && <table className="metric-table"><thead><tr><th>Measurement</th><th>Paper reports</th><th>Observed</th></tr></thead><tbody>{scalarMetrics.map((metric, index) => <tr key={`${metric.name}-${index}`}><td>{metric.name.replaceAll("_", " ")}</td><td>{metric.reported || "Not comparable"}</td><td>{metric.observed}</td></tr>)}</tbody></table>}
  </>;
}

function Evidence({ run }: { run: Run }) {
  const [attemptIndex, setAttemptIndex] = useState(0);
  const result = run.result;
  const attempt = run.attempts[attemptIndex];
  if (!result && !run.attempts.length) return <EmptyState icon={<Activity size={30} strokeWidth={1} />} title="The evidence is earned." description={ACTIVE_STATUSES.includes(run.status) ? "The experiment is in progress. Measurements and execution logs appear here when available." : "Approve the protocol to collect real measurements. No result is inferred from the paper alone."} />;
  const verdicts = { matched: ["Matched within protocol", "The measurements align."], partial: ["Partial verification", "A result, with its limits."], differed: ["Measurements differed", "The experiment tells another story."], blocked: ["Experiment blocked", "A limit worth making visible."] };
  return <>
    {result && <><div className={`result-head verdict-${result.verdict}`}><div className="result-verdict"><ShieldCheck size={13} />{verdicts[result.verdict][0]}</div><h3>{verdicts[result.verdict][1]}</h3><p>{result.summary}</p></div>
      <div className="content-heading"><div><h2>Experiment measurements.</h2><p>Each metric belongs to this protocol and its conditions.</p></div></div>
      <ExperimentMeasurements metrics={result.metrics} />
      {result.limitations.length > 0 && <div className="limitations"><h4>What this result does not establish</h4><ul>{result.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></div>}

    </>}
    {(result || run.attempts.length > 0) && <div className="result-actions"><a className="primary-button" href={`/api/runs/${encodeURIComponent(run.id)}/report`} download>Download evidence report<ArrowDownToLine size={15} /></a></div>}
    {run.attempts.length > 0 && <div className="limitations"><div className="content-heading"><div><h2>Execution record</h2><p>Unedited output from the sandbox process.</p></div><Terminal size={18} strokeWidth={1.2} /></div><div className="attempt-selector">{run.attempts.map((item, index) => <button key={item.number} className={index === attemptIndex ? "active" : ""} onClick={() => setAttemptIndex(index)}>Attempt {item.number} · exit {item.exitCode}</button>)}</div>{attempt && <><span className="mono" style={{ color: "#8b967c", fontSize: 8 }}>Duration {(attempt.durationMs / 1000).toFixed(1)}s{attempt.changeReason ? ` · ${attempt.changeReason}` : ""}</span><div className="terminal-label">stdout</div><pre className="terminal-output">{attempt.stdout || "(no output)"}</pre>{attempt.stderr && <><div className="terminal-label">stderr</div><pre className="terminal-output terminal-error">{attempt.stderr}</pre></>}</>}</div>}
  </>;
}

function RunWorkspace({ run, tab, setTab, onBack, onApprove, onCancel, onRetry, busy }: { run: Run; tab: Tab; setTab: (tab: Tab) => void; onBack: () => void; onApprove: () => void; onCancel: () => void; onRetry: () => void; busy: boolean }) {
  const [inspectedClaim, setInspectedClaim] = useState<string | null>(null);
  const selectedClaim = run.claims.find((claim) => claim.id === (inspectedClaim || run.plan?.claimId)) || run.claims[0];
  return <main className="workspace">
    <div className="workspace-topline"><button className="text-button" onClick={onBack}><ArrowLeft size={13} />All research</button><span className="mono" style={{ color: "#8c9380", fontSize: 8 }}>Research workspace / {run.id.slice(-8)}</span></div>
    <div className="workspace-title"><div className="eyebrow"><span className="little-line" />{run.mode === "example" ? "A recorded investigation" : "An open investigation"}</div><h1>{run.paper?.title || run.title || "Reading your research."}</h1><p>From the published claim to an executable, inspectable experiment.</p></div>
    <div className="run-meta"><span className={`status-pill ${run.mode === "example" ? "recorded-pill" : ""}`}><span className={`status-dot ${ACTIVE_STATUSES.includes(run.status) ? "running" : ["failed", "blocked"].includes(run.status) ? "warning" : run.status === "cancelled" ? "" : "ready"}`} />{run.mode === "example" ? "Recorded example" : STATUS_LABELS[run.status]}</span>{run.plan && <span>{SCOPE_LABELS[run.plan.scope]}</span>}<span><Clock3 size={10} />{formatTime(run.createdAt)}</span>{(ACTIVE_STATUSES.includes(run.status) || run.status === "awaiting_approval") && <button className="text-button" style={{ fontSize: 9, marginLeft: "auto" }} onClick={onCancel} disabled={busy}><Square size={9} />Cancel run</button>}</div>
    {run.mode === "example" && <div className="recorded-notice"><Info size={14} /><p>This is a recorded example for exploring the workflow. Opening it makes no model or sandbox request. Its measurements apply to the included synthetic experiment.</p></div>}
    {run.error && <div className="error-notice"><Info size={15} /><p>{run.error}</p></div>}
    {run.mode === "live" && run.plan && ["blocked", "failed"].includes(run.status) && <div className="retry-protocol"><p>The original evidence stays in your research log. A retry copies this protocol and waits for a new approval.</p><button className="secondary-button" onClick={onRetry} disabled={busy}>Review protocol again<ArrowRight size={13} /></button></div>}
    <div className="workspace-grid"><aside className="source-sidebar"><div className="eyebrow"><FileText size={12} />The source</div><h3>{run.paper?.title || run.title}</h3><a className="source-link" href={run.sourceUrl} target="_blank" rel="noreferrer">{run.sourceUrl}<ExternalLink size={10} /></a>{run.repositoryUrl && <a className="source-link" href={run.repositoryUrl} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}><GitBranch size={11} />Author repository<ExternalLink size={10} /></a>}
      <div className="sidebar-divider" /><div className="sidebar-label">Claims in context · {run.claims.length.toString().padStart(2, "0")}</div>
      <div className="claims-list">{run.claims.map((claim, index) => <button key={claim.id} className={`claim-option ${claim.id === run.plan?.claimId ? "selected" : ""} ${claim.id === inspectedClaim && claim.id !== run.plan?.claimId ? "inspected" : ""}`} onClick={() => setInspectedClaim(claim.id)}><span className="claim-index">Claim {(index + 1).toString().padStart(2, "0")}{claim.id === run.plan?.claimId && <Check size={11} />}</span>{claim.text}<span className="claim-reference">{claim.sourceLocation}</span></button>)}</div>
      {!run.claims.length && <p className="claim-detail">Identifying claims and their source locations.</p>}
      {selectedClaim?.evidenceQuote && <blockquote className="claim-quote">“{selectedClaim.evidenceQuote}”<cite>{selectedClaim.sourceLocation}</cite></blockquote>}
      {selectedClaim && <p className="claim-detail">{selectedClaim.feasible ? "Feasibility" : "Compute limitation"}: {selectedClaim.reason}{selectedClaim.id !== run.plan?.claimId && run.plan ? " The current protocol is prepared for the highlighted claim." : ""}</p>}
      <div className="resource-section"><div className="sidebar-divider" /><div className="sidebar-label">Execution boundary</div><div className="resource-row"><span>Environment</span><strong>CreateOS · EU</strong></div><div className="resource-row"><span>Resources</span><strong>2 vCPU / 4 GB</strong></div><div className="resource-row"><span>Human review</span><strong>Required</strong></div><div className="resource-row"><span>Execution</span><strong>One approved run</strong></div></div>
    </aside>
    <section className="workspace-main" aria-label="Experiment details"><div className="workspace-tabs" role="tablist" aria-label="Experiment views">{([{ id: "protocol", label: "Protocol", icon: <FlaskConical size={12} /> }, { id: "activity", label: "Activity", icon: <Activity size={12} /> }, { id: "code", label: "Code", icon: <Code2 size={12} /> }, { id: "evidence", label: "Evidence", icon: <CheckCheck size={12} /> }] as const).map((item) => <button key={item.id} role="tab" id={`tab-${item.id}`} aria-controls={`panel-${item.id}`} aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.icon}{item.label}{item.id === "activity" && run.events.length > 0 && <span className="tab-count">{run.events.length}</span>}</button>)}</div><div className="workspace-content" role="tabpanel" aria-labelledby={`tab-${tab}`} id={`panel-${tab}`}>
      {tab === "protocol" && <Protocol run={run} onApprove={onApprove} busy={busy} />}
      {tab === "activity" && <><div className="content-heading"><div><h2>The investigation, step by step.</h2><p>Every decision leaves an observable record.</p></div></div>{ACTIVE_STATUSES.includes(run.status) && <div className="agent-progress"><div className="progress-art"><ResearchShader variant="compact" /></div><div className="progress-heading"><Loader2 className="spin" size={16} />{STATUS_LABELS[run.status]}</div><p>The run continues in the background. You can leave this view and return.</p></div>}<ActivityLog run={run} /></>}
      {tab === "code" && <CodePanel key={run.id} run={run} />}
      {tab === "evidence" && <Evidence key={run.id} run={run} />}
    </div></section></div>
  </main>;
}

export function ResearchWorkspace() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const [tab, setTab] = useState<Tab>("protocol");
  const closeModal = useCallback(() => setModal(null), []);
  const selectRun = useCallback((value: Run, selectedTab: Tab = "protocol") => {
    setRun(value); setTab(selectedTab); setError(null); setModal(null);
    window.history.replaceState(null, "", `?run=${encodeURIComponent(value.id)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const refreshHealth = useCallback(() => api<Health>("/api/health").then(setHealth).catch(() => setHealth(null)), []);
  useEffect(() => {
    void refreshHealth();
    const id = new URLSearchParams(window.location.search).get("run");
    if (id) { setBusy(true); api<Run>(`/api/runs/${encodeURIComponent(id)}`).then((value) => selectRun(value, value.result ? "evidence" : "protocol")).catch((reason) => setError(reason.message)).finally(() => setBusy(false)); }
  }, [refreshHealth, selectRun]);
  useEffect(() => {
    if (!run || !ACTIVE_STATUSES.includes(run.status)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const next = await api<Run>(`/api/runs/${encodeURIComponent(run.id)}`); if (!stopped) { setRun(next); if (ACTIVE_STATUSES.includes(next.status)) timer = setTimeout(poll, 1500); } }
      catch (reason) { if (!stopped) { setError(reason instanceof Error ? reason.message : "Connection interrupted. Refresh to reconnect to the run."); timer = setTimeout(poll, 5000); } }
    };
    timer = setTimeout(poll, 1200);
    return () => { stopped = true; clearTimeout(timer); };
  }, [run?.id, run?.status]);
  const startRun = async (mode: "live" | "example") => {
    setBusy(true); setError(null);
    try { const value = await api<Run>("/api/runs", { method: "POST", body: JSON.stringify({ sourceUrl: mode === "example" ? KMEANS_URL : sourceUrl, ...(repositoryUrl && mode === "live" ? { repositoryUrl } : {}), mode }) }); selectRun(value, mode === "example" ? "evidence" : "protocol"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start the investigation."); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void startRun("live"); };
  const approve = async () => {
    if (!run) return;
    setBusy(true); setError(null);
    try { const value = await api<Run>(`/api/runs/${encodeURIComponent(run.id)}/approve`, { method: "POST", body: JSON.stringify({ claimId: run.plan?.claimId }) }); setRun(value); setTab("activity"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not approve this experiment."); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!run) return;
    setBusy(true);
    try { setRun(await api<Run>(`/api/runs/${encodeURIComponent(run.id)}/cancel`, { method: "POST", body: "{}" })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not cancel this run."); }
    finally { setBusy(false); }
  };
  const retry = async () => {
    if (!run) return;
    setBusy(true); setError(null);
    try { selectRun(await api<Run>("/api/runs", { method: "POST", body: JSON.stringify({ retryFromId: run.id }) })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not prepare this protocol for review."); }
    finally { setBusy(false); }
  };
  const back = () => { setRun(null); setError(null); window.history.replaceState(null, "", window.location.pathname); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const showHistory = async () => {
    setModal("history"); setLoadingHistory(true);
    try { setRuns((await api<{ runs: Run[] }>("/api/runs")).runs); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load previous runs."); }
    finally { setLoadingHistory(false); }
  };
  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={back} aria-label="Trace home"><TraceMark /><span className="wordmark">trace</span><span className="brand-divider" /><span className="brand-caption">Research,<br />with receipts.</span></button><nav className="nav" aria-label="Main navigation"><button className="nav-active" onClick={back}>Workspace</button><button onClick={() => void showHistory()}><History size={12} />Runs</button><a href={run ? "/#how-it-works" : "#how-it-works"} className="nav-secondary">How it works<ArrowDown size={11} /></a><button className="icon-button" onClick={() => { setModal("settings"); void refreshHealth(); }} aria-label="Connection settings"><Settings2 size={15} /></button></nav></header>
    {error && <div className="error-notice" role="alert" style={{ marginTop: 20 }}><Info size={16} /><p>{error}</p><button onClick={() => setError(null)} aria-label="Dismiss error"><X size={14} /></button></div>}
    {run ? <RunWorkspace run={run} tab={tab} setTab={setTab} onBack={back} onApprove={() => void approve()} onCancel={() => void cancel()} onRetry={() => void retry()} busy={busy} /> : <main><Landing sourceUrl={sourceUrl} setSourceUrl={setSourceUrl} repositoryUrl={repositoryUrl} setRepositoryUrl={setRepositoryUrl} onSubmit={submit} onExample={() => void startRun("example")} busy={busy} health={health} /></main>}
    <footer className="footer"><span className="mono">Built for the questions that deserve another look.</span><div className="footer-links"><a href="https://projects.dev" target="_blank" rel="noreferrer">Stripe Projects <ArrowUpRight size={9} style={{ display: "inline" }} /></a><a href="https://createos.sh" target="_blank" rel="noreferrer">CreateOS Sandbox <ArrowUpRight size={9} style={{ display: "inline" }} /></a></div></footer>
    {modal === "settings" && <Modal title="The research bench." eyebrow="Connections & environment" onClose={closeModal}><p>Models plan the experiment. The sandbox runs it. Credentials stay on the server.</p><div className="integration-row"><div><strong>River · GLM</strong><p>{health?.model || "zai-org/GLM-5.3-Flash"}</p></div><span><span className={`status-dot ${health?.riverConfigured ? "ready" : ""}`} />{health?.riverConfigured ? "Configured" : "Not configured"}</span></div><div className="integration-row"><div><strong>CreateOS Sandbox</strong><p>{health?.sandboxId || "hackathon"}</p></div><span><span className={`status-dot ${health?.createosConfigured ? "ready" : ""}`} />{health?.createosConfigured ? "Configured" : "Not configured"}</span></div><div className="integration-row"><div><strong>Stripe Projects</strong><p>Service credentials managed through the CLI</p></div><a className="text-button" href="https://dashboard.stripe.com/projects" target="_blank" rel="noreferrer">Manage<ArrowUpRight size={12} /></a></div><div className="settings-note">A configured key indicates it is present on the server. Access and available credits are checked when a real request runs. You can explore the recorded example without credentials.</div><p>Server setup uses <span className="config-key">RIVER_API_KEY</span> and your Stripe-provisioned CreateOS configuration. API keys are never saved in this browser.</p><button className="secondary-button" onClick={() => void refreshHealth()}><Activity size={12} />Refresh configuration</button></Modal>}
    {modal === "history" && <Modal title="Previous investigations." eyebrow="Your research log" onClose={closeModal}>{loadingHistory ? <div className="page-loading"><Loader2 className="spin" size={16} />Opening the research log</div> : runs.length ? <div className="history-list">{runs.map((item) => <button key={item.id} className="history-item" onClick={() => selectRun(item, item.result ? "evidence" : "protocol")}><h3>{item.paper?.title || item.title || "Untitled investigation"}</h3><div><span>{item.mode === "example" ? "Recorded example" : STATUS_LABELS[item.status]}</span><span>{new Date(item.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span></div></button>)}</div> : <EmptyState icon={<BookOpen size={28} strokeWidth={1} />} title="A fresh research log." description="Analyze your first source or explore a recorded experiment. Your investigations will appear here." />}</Modal>}
  </div>;
}
