"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Activity, ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, Cpu, FlaskConical, History, Info, Link2, Loader2, Play, Plus, Search, Settings2, ShieldCheck, X } from "lucide-react";
import type { Health, Run } from "@/lib/types";
import { TraceMark } from "./trace-mark";
import { ResearchShader } from "./research-shader";
import { CreditAlert, RunWorkspace, ProcessView, ACTIVE_STATUSES, STATUS_LABELS } from "./run-workspace";
import { ResearchScope } from "./research-scope";
import { AccountMenu } from "./account-menu";
import type { AccountProfile } from "@/lib/supabase/server";

const KMEANS_URL = "https://theory.stanford.edu/~sergei/papers/kMeansPP-soda.pdf";
const RANDOMIZED_SVD_URL = "https://arxiv.org/abs/0909.4061";

type ModalName = "settings" | "history" | null;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (response.status === 401) {
    window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    throw new Error("Your session has ended. Sign in to continue.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${response.status}). Try again.`);
  }
  return response.json() as Promise<T>;
}

function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex="0"]');
    (ref.current?.querySelector<HTMLElement>("[data-autofocus]") || ref.current?.querySelector<HTMLElement>('[aria-label="Close dialog"]'))?.focus();
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
  return <div className="modal-backdrop research-overlay" onClick={onClose}><div className="modal" ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}>

    <div className="modal-header"><div><div className="eyebrow">{eyebrow}</div><h2 id="modal-title">{title}</h2></div><button onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
    {children}
  </div></div>;
}

function Landing({ sourceUrl, setSourceUrl, repositoryUrl, setRepositoryUrl, onSubmit, onExample, busy }: {
  sourceUrl: string; setSourceUrl: (value: string) => void; repositoryUrl: string; setRepositoryUrl: (value: string) => void;
  onSubmit: (event: FormEvent) => void; onExample: () => void; busy: boolean;
}) {
  const [showRepository, setShowRepository] = useState(false);
  return <>
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy"><a className="hero-announcement" href="#how-it-works"><div className="hero-badge-orb"><ResearchShader variant="compact" /></div>Meet your research agent<ArrowUpRight size={12} /></a>
        <h1 id="hero-title"><span>Research deserves</span><span className="hero-emphasis">a second run.</span></h1>
        <p className="hero-description">Move from published claims to <strong>observable evidence.</strong> An agent that reads papers, writes experiments, and puts results to the test.</p>
      </div>

    </section>
    <section aria-label="Start a research experiment">
      <div className="source-panel">
        <div className="source-panel-top"><span className="source-label">What would you like to verify?</span><span>arXiv or GitHub</span></div>
        <form onSubmit={onSubmit}>
          <div className="source-form"><Link2 size={21} strokeWidth={1.4} /><input type="url" aria-label="Paper or GitHub URL" aria-describedby="automatic-run-note" placeholder="Paste a paper or GitHub link" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required disabled={busy} /><button className="primary-button" type="submit" disabled={busy}>{busy ? "Opening research" : "Investigate"}{busy ? <Loader2 size={16} className="spin" /> : <ArrowUpRight size={17} />}</button></div>
          <p className="sr-only" id="automatic-run-note">Investigate starts automatic code generation, execution, and up to three execution attempts.</p>
          {showRepository && <><div className="repository-field"><label htmlFor="author-repo">Author repository</label><input id="author-repo" type="url" placeholder="https://github.com/author/repository (optional)" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} aria-describedby="repository-note" /></div><p id="repository-note" className="repository-note">The README adds context. Repository code is not executed automatically.</p></>}
        </form>
      </div>
      <div className="source-bottom"><div className="examples"><span>Explore</span><button className="example-chip" onClick={onExample} disabled={busy}>k-means++ · recorded <Play size={9} /></button><button className="example-chip" onClick={() => setSourceUrl(RANDOMIZED_SVD_URL)}>Randomized SVD <ArrowUpRight size={10} /></button></div><div className="source-options"><button className="text-button" onClick={() => setShowRepository(!showRepository)}>{showRepository ? <X size={11} /> : <Plus size={11} />}{showRepository ? "Hide repository" : "Add author repository"}</button></div></div>
      <div id="investigation-scope"><ResearchScope /></div>
    </section>
    <section className="how-section" id="how-it-works" aria-labelledby="how-title">
      <div className="section-heading"><div><div className="eyebrow">From claim to evidence</div><h2 id="how-title">A paper is a starting point.<br />Follow the evidence.</h2></div><p>A successful script is only the beginning. Trace keeps the source, the method, and the measured outcome together.</p></div>
      <div className="steps-grid">
        <article className="step-card"><span className="step-number">[01]</span><div className="step-graphic"><div className="paper-graphic"><i /><i /><i /><i /><i /></div></div><h3>Find a testable claim.</h3><p>The agent reads your source and identifies claims we can put to the test.</p></article>
        <article className="step-card"><span className="step-number">[02]</span><div className="step-graphic execution-graphic"><span>&lt;/&gt;</span><ChevronRight size={12} /><span>run</span><ChevronRight size={12} /><span><Check size={13} /></span></div><h3>Write. Run. Repair.</h3><p>Trace writes Python, runs it in an isolated sandbox, and fixes coding errors using the actual output. No approval step.</p></article>
        <article className="step-card"><span className="step-number">[03]</span><div className="step-graphic"><div className="evidence-graphic"><i /><i /><i /><i /></div></div><h3>Keep the paper trail.</h3><p>Compare reported and observed results, with logs, limitations, and an exportable report.</p></article>
      </div>
      <div className="philosophy"><span className="eyebrow"><ShieldCheck size={14} />Evidence over confidence</span><p>A reduced experiment is labeled as one. A compute limit is reported. A result that differs is still a useful result.</p></div>
    </section>
  </>;
}

function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="bench-empty">{icon}<h3>{title}</h3><p>{description}</p></div>;
}

function Connections({ health, onRefresh }: { health: Health | null; onRefresh: () => void }) {
  return <><p>One model to plan. One sandbox to test. Your credentials stay on the server.</p><div className="connection-grid"><article className="connection-card"><div><Activity size={21} /><span className="connection-status"><span className={`status-dot ${health?.riverConfigured && !health?.riverOutOfCredit ? "ready" : ""}`} />{health?.riverOutOfCredit ? "Out of credit" : health?.riverConfigured ? "Configured" : "Not configured"}</span></div><h3>Agent model</h3><p>{health?.model || "zai-org/GLM-5.3-Flash"}</p></article><article className="connection-card"><div><Cpu size={21} /><span className="connection-status"><span className={`status-dot ${health?.sandboxConfigured ? "ready" : ""}`} />{health?.sandboxConfigured ? "Configured" : "Not configured"}</span></div><h3>Sandbox</h3><p>Private, isolated experiment execution</p></article></div><div className="settings-note">Configured means the key is present. Access and available credits are checked when a real request runs. Model and sandbox keys live only on the server.</div><button className="secondary-button" onClick={onRefresh}><Activity size={14} />Refresh configuration</button></>;
}

export function ResearchWorkspace({ initialRunId, user }: { initialRunId?: string; user: AccountProfile }) {
  // Responses from an earlier investigation must not replace a later navigation.
  const navigationVersion = useRef(0);
  const [sourceUrl, setSourceUrl] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [loadingRun, setLoadingRun] = useState(Boolean(initialRunId));
  const [runs, setRuns] = useState<Run[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalName>(null);

  const closeModal = useCallback(() => setModal(null), []);
  const selectRun = useCallback((value: Run) => {
    navigationVersion.current += 1;
    setLoadingRun(false); setBusy(false);
    setRun(value); setError(null); setModal(null);
    window.history.replaceState(null, "", `?run=${encodeURIComponent(value.id)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const refreshHealth = useCallback(() => api<Health>("/api/health").then(setHealth).catch(() => setHealth(null)), []);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const version = navigationVersion.current;
    void refreshHealth();
    const id = initialRunId || new URLSearchParams(window.location.search).get("run");
    if (id) {
      setBusy(true); setLoadingRun(true);
      api<Run>(`/api/runs/${encodeURIComponent(id)}`, { signal: controller.signal })
        .then(value => { if (current && navigationVersion.current === version) selectRun(value); })
        .catch(reason => { if (current && navigationVersion.current === version) setError(reason.message); })
        .finally(() => { if (current && navigationVersion.current === version) { setBusy(false); setLoadingRun(false); } });
    }
    return () => { current = false; controller.abort(); };
  }, [refreshHealth, selectRun, initialRunId]);
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
    const version = navigationVersion.current;
    setBusy(true); setError(null);
    try { const value = await api<Run>("/api/runs", { method: "POST", body: JSON.stringify({ sourceUrl: mode === "example" ? KMEANS_URL : sourceUrl, ...(repositoryUrl && mode === "live" ? { repositoryUrl } : {}), mode }) }); if (navigationVersion.current === version) selectRun(value); }
    catch (reason) { if (navigationVersion.current === version) setError(reason instanceof Error ? reason.message : "Could not start the investigation."); }
    finally { if (navigationVersion.current === version) setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void startRun("live"); };
  const approve = async () => {
    if (!run) return;
    const version = navigationVersion.current;
    setBusy(true); setError(null);
    try { const value = await api<Run>(`/api/runs/${encodeURIComponent(run.id)}/approve`, { method: "POST", body: JSON.stringify({ claimId: run.plan?.claimId }) }); if (navigationVersion.current === version) { setRun(value); } }
    catch (reason) { if (navigationVersion.current === version) setError(reason instanceof Error ? reason.message : "Could not continue this investigation."); }
    finally { if (navigationVersion.current === version) setBusy(false); }
  };
  const cancel = async () => {
    if (!run) return;
    const version = navigationVersion.current;
    setBusy(true);
    try { const value = await api<Run>(`/api/runs/${encodeURIComponent(run.id)}/cancel`, { method: "POST", body: "{}" }); if (navigationVersion.current === version) setRun(value); }
    catch (reason) { if (navigationVersion.current === version) setError(reason instanceof Error ? reason.message : "Could not cancel this run."); }
    finally { if (navigationVersion.current === version) setBusy(false); }
  };
  const retry = async () => {
    if (!run) return;
    const version = navigationVersion.current;
    setBusy(true); setError(null);
    try { const value = await api<Run>("/api/runs", { method: "POST", body: JSON.stringify({ retryFromId: run.id }) }); if (navigationVersion.current === version) selectRun(value); }
    catch (reason) { if (navigationVersion.current === version) setError(reason instanceof Error ? reason.message : "Could not restart this investigation."); }
    finally { if (navigationVersion.current === version) setBusy(false); }
  };
  const back = () => { navigationVersion.current += 1; setLoadingRun(false); setBusy(false); setRun(null); setError(null); window.history.replaceState(null, "", window.location.pathname); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const showHistory = async () => {
    setModal("history"); setLoadingHistory(true); setHistoryQuery("");
    try { setRuns((await api<{ runs: Run[] }>("/api/runs")).runs); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load previous runs."); }
    finally { setLoadingHistory(false); }
  };
  const matchingRuns = runs.filter(item => `${item.paper?.title || item.title} ${item.sourceUrl}`.toLowerCase().includes(historyQuery.toLowerCase()));
  return <div className={`app-shell ${run || loadingRun || busy ? "workspace-shell" : ""}`}>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{run && !ACTIVE_STATUSES.includes(run.status) ? STATUS_LABELS[run.status] : ""}</span>
    <header className="topbar"><button className="brand" onClick={back} aria-label="Trace home"><TraceMark /><span className="wordmark">trace</span><span className="brand-divider" /><span className="brand-caption">Research,<br />with receipts.</span></button><nav className="nav" aria-label="Main navigation"><button className="nav-active" onClick={back}>Workspace</button><button onClick={() => void showHistory()}><History size={12} />Runs</button><a href={run ? "/#how-it-works" : "#how-it-works"} className="nav-secondary">How it works<ArrowDown size={11} /></a><button className="icon-button" onClick={() => { setModal("settings"); void refreshHealth(); }} aria-label="Connection settings"><Settings2 size={15} /></button><AccountMenu user={user} /></nav></header>
    {error && <div className="error-notice" role="alert" style={{ marginTop: 20 }}><Info size={16} /><p>{error}</p><button onClick={() => setError(null)} aria-label="Dismiss error"><X size={14} /></button></div>}
    {loadingRun || (busy && !run) ? <main className="workspace"><ProcessView /></main> : run ? <RunWorkspace key={run.id} run={run} onBack={back} onApprove={() => void approve()} onCancel={() => void cancel()} onRetry={() => void retry()} busy={busy} /> : <main><>{health?.riverOutOfCredit && <div className="credit-banner"><CreditAlert title="Investigations are paused: out of agent API credit" /></div>}<Landing sourceUrl={sourceUrl} setSourceUrl={setSourceUrl} repositoryUrl={repositoryUrl} setRepositoryUrl={setRepositoryUrl} onSubmit={submit} onExample={() => void startRun("example")} busy={busy} /></></main>}
    <footer className="footer"><span className="mono">Built for the questions that deserve another look.</span></footer>
    {modal === "settings" && <Modal title="Your research setup." eyebrow="Connections" onClose={closeModal}><Connections health={health} onRefresh={() => void refreshHealth()} /></Modal>}
    {modal === "history" && <Modal title={user.displayName ? `${user.displayName}, pick up a question.` : "Pick up a question."} eyebrow="Your research library" onClose={closeModal}><p>Your protocols, attempts, and results are saved in your private research library.</p><label className="history-search"><Search size={17} /><input aria-label="Search research history" data-autofocus placeholder="Find a paper or investigation" value={historyQuery} onChange={event => setHistoryQuery(event.target.value)} /></label>{loadingHistory ? <div className="page-loading"><Loader2 className="spin" size={16} />Opening the research log</div> : matchingRuns.length ? <div className="history-list">{matchingRuns.map(item => <button key={item.id} className="history-item" onClick={() => selectRun(item)}><span className="history-icon"><FlaskConical size={17} /></span><div><h3>{item.paper?.title || item.title || "Untitled investigation"}</h3><div className="history-meta"><span><span className={`status-dot ${["failed", "blocked"].includes(item.status) ? "warning" : ACTIVE_STATUSES.includes(item.status) ? "running" : item.status === "cancelled" ? "" : "ready"}`} />{item.mode === "example" ? "Recorded example" : STATUS_LABELS[item.status]}</span><span>{new Date(item.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span></div></div><ArrowUpRight size={16} /></button>)}</div> : <EmptyState icon={<BookOpen size={28} strokeWidth={1} />} title={historyQuery ? "No matching investigations." : user.displayName ? `Your next question, ${user.displayName}.` : "A fresh research log."} description={historyQuery ? "Try another paper title or source URL." : "Your investigations will appear here. Start with a paper or explore the recorded example."} />}</Modal>}
  </div>;
}
