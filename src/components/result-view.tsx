"use client";

import { ChevronRight } from "lucide-react";
import type { Run } from "@/lib/types";
import { AgentWorkbench } from "./agent-workbench";
import { parseMeasurements } from "@/lib/measurements";
import { RESEARCH_LIMITS } from "@/lib/capabilities";
import { parseProject } from "@/lib/project";

type Metric = NonNullable<Run["result"]>["metrics"][number];
type Primitive = string | number | boolean | null;
type Table = { title: string; columns: string[]; rows: unknown[][] };

const SCOPE = { component_check: "A focused check of one idea from the paper", reduced_experiment: "A smaller-scale version of the paper's experiment", reproduction: "A full reproduction of the paper's experiment" } as const;

const ACRONYMS = new Set(["tv", "kl", "mse", "rmse", "mae", "auc", "roc", "ci", "sd", "std", "id", "iid", "cpu", "gpu", "lr", "sgd", "pca", "svd", "ode", "pde", "fft", "nll", "elbo", "rl", "mle"]);
function humanize(name: string) {
  const text = name.replaceAll("_", " ").replace(/\s+/g, " ").trim().split(" ").map(word => ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word).join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) return value.toLocaleString();
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e6)) return value.toExponential(2);
  return Number(value.toPrecision(4)).toString();
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length <= 6 ? value.map(cell).join(", ") : `${value.slice(0, 5).map(cell).join(", ")}, … (${value.length} values)`;
  if (typeof value === "object") return Object.entries(value).map(([key, inner]) => `${humanize(key)}: ${cell(inner)}`).join(" · ");
  return String(value);
}

function parse(observed: string): unknown {
  const text = observed.trim();
  if (/^[[{]/.test(text) || /^-?\d/.test(text) || ["true", "false", "null"].includes(text)) {
    try { return JSON.parse(text); } catch { /* Keep as text. */ }
  }
  return observed;
}

const isPrimitive = (value: unknown): value is Primitive => value === null || ["string", "number", "boolean"].includes(typeof value);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Turns each measurement into the clearest display: a figure, a table or a note. */
function organize(metrics: Metric[]) {
  const figures: { name: string; value: string; reported?: string }[] = [];
  const tables: Table[] = [];
  const notes: { name: string; value: string }[] = [];
  for (const metric of metrics) {
    const value = parse(metric.observed);
    const name = humanize(metric.name);
    if (isPrimitive(value) && (typeof value !== "string" || value.length <= 28)) {
      figures.push({ name, value: cell(value), reported: metric.reported });
    } else if (typeof value === "string") {
      notes.push({ name, value });
    } else if (Array.isArray(value) && value.every(isPrimitive)) {
      tables.push(value.length <= 10
        ? { title: name, columns: value.map((_, index) => String(index + 1)), rows: [value] }
        : { title: name, columns: ["#", "Value"], rows: value.map((item, index) => [index + 1, item]) });
    } else if (Array.isArray(value) && value.every(isRecord)) {
      const columns = [...new Set(value.flatMap(row => Object.keys(row)))];
      tables.push({ title: name, columns: columns.map(humanize), rows: value.map(row => columns.map(column => row[column])) });
    } else if (isRecord(value) && Object.values(value).every(isPrimitive)) {
      tables.push({ title: name, columns: ["", "Value"], rows: Object.entries(value).map(([key, inner]) => [humanize(key), inner]) });
    } else if (isRecord(value) && Object.values(value).every(isRecord)) {
      const columns = [...new Set(Object.values(value).flatMap(row => Object.keys(row as Record<string, unknown>)))];
      const entries = Object.entries(value);
      // JavaScript lists whole-number keys first ("1", "10", "0.01"); sort numeric settings by value.
      if (entries.every(([key]) => key.trim() !== "" && Number.isFinite(Number(key)))) entries.sort(([a], [b]) => Number(a) - Number(b));
      tables.push({ title: name, columns: ["Setting", ...columns.map(humanize)], rows: entries.map(([key, row]) => [key, ...columns.map(column => (row as Record<string, unknown>)[column])]) });
    } else {
      notes.push({ name, value: JSON.stringify(value, null, 2) });
    }
  }
  return { figures, tables, notes };
}

/** Older runs may hold raw sandbox errors; show them in plain language. */
function readableError(error?: string) {
  if (error && /waiting for the expected state|sandbox is (not running|paused)/i.test(error)) return "The sandbox did not start, so the experiment could not run. Your experiment is saved. Press \"Run it again\" in a minute.";
  if (error && /exhausted its response budget/i.test(error)) return "The agent ran out of room while writing its answer, so no experiment was written. This is now handled automatically. Press \"Try again\".";
  return error;
}

function duration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  const total = Math.round(ms / 1000);
  return total < 60 ? `${total} s` : `${Math.floor(total / 60)} min ${total % 60} s`;
}

function DataTable({ table }: { table: Table }) {
  return <figure className="rv-table">
    <figcaption>{table.title}</figcaption>
    <div className="rv-table-scroll" tabIndex={0} role="region" aria-label={table.title}>
      <table><thead><tr>{table.columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column}>{cell(value)}</td>)}</tr>)}</tbody></table>
    </div>
  </figure>;
}

export function ResultView({ run, onBack, onRetry, busy }: { run: Run; onBack: () => void; onRetry: () => void; busy: boolean }) {
  const result = run.result;
  const latest = run.attempts.at(-1);
  const invalidOutput = run.mode === "live" && run.status === "completed" && latest?.exitCode === 0 && !parseMeasurements(latest.stdout);
  const failed = ["failed", "blocked"].includes(run.status);
  const success = Boolean(result) && !invalidOutput && !failed;
  const claim = run.claims.find(item => item.id === run.plan?.claimId) ?? run.claims[0];
  const { figures, tables, notes } = organize(result?.metrics ?? []);
  const runtime = run.attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0);
  const elapsed = Math.max(0, new Date(run.updatedAt).getTime() - new Date(run.createdAt).getTime());
  const files = latest ? parseProject(latest.code).length : run.plan ? parseProject(run.plan.pythonCode).length : 0;
  const canRetry = run.mode === "live" && (invalidOutput ? Boolean(run.plan) : failed);
  const status = success ? "Experiment complete" : invalidOutput ? "Finished, but the output needs a correction" : run.status === "blocked" ? "Experiment blocked" : "Experiment stopped";
  const outcome = success
    ? `The agent wrote ${files > 1 ? `a ${files}-file program` : "a program"}, ran it in an isolated sandbox${run.attempts.length > 1 ? `, and fixed its own errors ${run.attempts.length - 1} ${run.attempts.length === 2 ? "time" : "times"}` : ""}. The results below are what it measured.`
    : invalidOutput ? "The program ran, but it did not print its results in the expected format. You can ask the agent to repair it."
      : readableError(run.error) || "The agent could not complete the experiment. Everything it did is saved below.";

  return <article className="rv">
    <header className="rv-hero">
      <p className="rv-eyebrow">{status}{run.mode === "example" ? " · Recorded example" : ""}</p>
      <h1>{run.paper?.title || run.title}</h1>
      {run.plan && <p className="rv-question"><span>Question tested</span>{run.plan.summary || run.plan.title}</p>}
      <p className="rv-outcome">{outcome}</p>
      <div className="rv-actions">
        {canRetry && <button className="rv-button" onClick={onRetry} disabled={busy}>{invalidOutput ? "Repair the output" : run.plan ? "Run it again" : "Try again"}</button>}
        <a className={canRetry ? "rv-button rv-button-quiet" : "rv-button"} href={`/api/runs/${encodeURIComponent(run.id)}/report`} download>Download report</a>
        <a className="rv-link" href={run.sourceUrl} target="_blank" rel="noreferrer">Read the paper<ChevronRight size={14} /></a>
      </div>
      <dl className="rv-facts">
        <div><dt>Attempts</dt><dd>{run.attempts.length} of {RESEARCH_LIMITS.maxAttempts}</dd></div>
        <div><dt>Program</dt><dd>{files === 0 ? "Not written" : files > 1 ? `${files} files` : "1 file"}</dd></div>
        <div><dt>Run time</dt><dd>{duration(runtime)}</dd></div>
        <div><dt>Total time</dt><dd>{duration(elapsed)}</dd></div>
      </dl>
    </header>

    {result && !invalidOutput && (figures.length > 0 || tables.length > 0 || notes.length > 0) && <section className="rv-block">
      <h2>Results</h2>
      <p className="rv-note">Measured by the agent's program. Values come directly from its output.</p>
      {figures.length > 0 && <dl className="rv-figures">{figures.map((figure, index) => <div key={`${figure.name}-${index}`}>
        <dd title={figure.value}>{figure.value}</dd>
        <dt>{figure.name}{figure.reported ? <span> · paper reports {figure.reported}</span> : null}</dt>
      </div>)}</dl>}
      {tables.map((table, index) => <DataTable key={`${table.title}-${index}`} table={table} />)}
      {notes.map((note, index) => <div className="rv-text" key={`${note.name}-${index}`}><h3>{note.name}</h3><pre>{note.value}</pre></div>)}
    </section>}

    {run.plan && <section className="rv-block">
      <h2>How it was tested</h2>
      <p className="rv-note">{SCOPE[run.plan.scope]}.</p>
      <div className="rv-grid">
        <div><h3>Hypothesis</h3><p>{run.plan.hypothesis}</p></div>
        <div><h3>Method</h3><p>{run.plan.method}</p></div>
        <div><h3>Data</h3><p>{run.plan.dataset}</p></div>
        {claim?.evidenceQuote && <div><h3>From the paper</h3><p className="rv-quote">“{claim.evidenceQuote}”</p><p className="rv-cite">{claim.sourceLocation}</p></div>}
      </div>
    </section>}

    {(result?.limitations.length ?? 0) > 0 && <section className="rv-block">
      <h2>Limits</h2>
      <p className="rv-note">What this experiment does not show.</p>
      <ul className="rv-limits">{result!.limitations.map(value => <li key={value}>{value}</li>)}</ul>
    </section>}

    <section className="rv-block">
      <h2>The program</h2>
      <p className="rv-note">Every file the agent wrote, the fixes it made, and exactly what it printed.</p>
      <AgentWorkbench key={run.id} run={run} />
    </section>

    {run.events.length > 0 && <details className="rv-details"><summary>Show every step the agent took<ChevronRight size={14} /></summary>
      {Boolean(run.repairs?.length) && <div className="rv-repairs">{run.repairs!.map(repair => <p key={`${repair.afterAttempt}-${repair.at}`}><strong>Fix after attempt {repair.afterAttempt}.</strong> {repair.summary}</p>)}</div>}
      <ol className="rv-steps">{run.events.map(event => <li key={event.id}><time>{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><p>{event.message}</p></li>)}</ol>
    </details>}

    <footer className="rv-end"><button className="rv-link" onClick={onBack}>Investigate another paper<ChevronRight size={14} /></button></footer>
  </article>;
}
