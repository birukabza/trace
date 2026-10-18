"use client";

import { ChevronRight } from "lucide-react";
import type { Run } from "@/lib/types";
import { AgentWorkbench } from "./agent-workbench";
import { parseMeasurements } from "@/lib/measurements";
import { RESEARCH_LIMITS } from "@/lib/capabilities";

type Metric = NonNullable<Run["result"]>["metrics"][number];
type Row = Record<string, string | number | boolean | null>;

const SCOPE = { component_check: "A focused check of one idea from the paper.", reduced_experiment: "A smaller-scale version of the paper's experiment.", reproduction: "A full reproduction of the paper's experiment." } as const;
const label = (name: string) => {
  const text = name.replaceAll("_", " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function duration(ms: number) {
  if (ms < 1000) return { value: String(ms), unit: "ms" };
  const total = Math.round(ms / 1000);
  return total < 60 ? { value: String(total), unit: "s" } : { value: `${Math.floor(total / 60)}m ${total % 60}`, unit: "s" };
}

/** Splits metrics into single values and small tables of records. */
function splitMetrics(metrics: Metric[]) {
  const tables: { metric: Metric; rows: Row[]; columns: string[] }[] = [];
  const scalars: Metric[] = [];
  for (const metric of metrics) {
    try {
      const rows = JSON.parse(metric.observed);
      const valid = Array.isArray(rows) && rows.length > 0 && rows.length <= 50 && rows.every(row => row && typeof row === "object" && !Array.isArray(row) && Object.values(row).every(value => value === null || ["string", "number", "boolean"].includes(typeof value)));
      const columns = valid ? [...new Set((rows as Row[]).flatMap(row => Object.keys(row)))] : [];
      if (valid && columns.length <= 18) { tables.push({ metric, rows, columns }); continue; }
    } catch { /* Not a table. */ }
    scalars.push(metric);
  }
  return { tables, scalars };
}

function formatValue(value: string) {
  if (value === "true") return "Yes";
  if (value === "false") return "No";
  const number = Number(value);
  if (value.trim() !== "" && Number.isFinite(number) && !/^0\d/.test(value)) {
    if (Number.isInteger(number)) return number.toLocaleString();
    const abs = Math.abs(number);
    return abs !== 0 && (abs < 1e-3 || abs >= 1e6) ? number.toExponential(2) : Number(number.toPrecision(4)).toString();
  }
  return value;
}

export function ResultView({ run, onBack, onRetry, busy }: { run: Run; onBack: () => void; onRetry: () => void; busy: boolean }) {
  const result = run.result;
  const latest = run.attempts.at(-1);
  const invalidOutput = run.mode === "live" && run.status === "completed" && latest?.exitCode === 0 && !parseMeasurements(latest.stdout);
  const failed = ["failed", "blocked"].includes(run.status);
  const success = Boolean(result) && !invalidOutput && !failed;
  const claim = run.claims.find(item => item.id === run.plan?.claimId) ?? run.claims[0];
  const { tables, scalars } = splitMetrics(result?.metrics ?? []);
  const runtime = duration(run.attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0));
  const total = duration(Math.max(0, new Date(run.updatedAt).getTime() - new Date(run.createdAt).getTime()));
  const eyebrow = success ? "Experiment complete" : invalidOutput ? "The output needs a correction" : run.status === "blocked" ? "Experiment blocked" : "Experiment stopped";
  const headline = success
    ? "The agent ran the experiment."
    : invalidOutput ? "The code ran, but its results were unreadable." : "The experiment did not finish.";
  const explanation = success
    ? `It read the paper, wrote code to test one claim, and ran it in an isolated sandbox${run.attempts.length > 1 ? `, fixing its own mistakes ${run.attempts.length - 1} ${run.attempts.length === 2 ? "time" : "times"}` : ""}. The numbers below are what that code measured.`
    : invalidOutput ? "Python finished, but it did not print measurements in the format Trace needs. You can ask the agent to repair the output." : run.error || "The agent could not complete the experiment. Everything it did is saved below.";

  return <article className="rv">
    <header className="rv-hero">
      <p className="rv-eyebrow">{eyebrow}{run.mode === "example" ? " · Recorded example" : ""}</p>
      <h1 className="rv-paper">{run.paper?.title || run.title}</h1>
      <p className="rv-headline">{headline}</p>
      <p className="rv-lede">{explanation}</p>
      <div className="rv-actions">
        <a className="rv-button" href={`/api/runs/${encodeURIComponent(run.id)}/report`} download>Download report</a>
        {(failed || invalidOutput) && run.plan && <button className="rv-button rv-button-quiet" onClick={onRetry} disabled={busy}>{invalidOutput ? "Repair the output" : "Run it again"}</button>}
        <a className="rv-link" href={run.sourceUrl} target="_blank" rel="noreferrer">Read the paper<ChevronRight size={15} /></a>
      </div>
    </header>

    <section className="rv-figures" aria-label="Run summary">
      <div><strong>{run.attempts.length}<span> of {RESEARCH_LIMITS.maxAttempts}</span></strong><p>Attempts used. The agent may rewrite its code up to three times.</p></div>
      <div><strong>{runtime.value}<span>{runtime.unit}</span></strong><p>Time the code spent running in the sandbox.</p></div>
      <div><strong>{total.value}<span>{total.unit}</span></strong><p>From reading the paper to the final report.</p></div>
    </section>

    {(run.plan || claim) && <section className="rv-block">
      <h2>The question.</h2>
      {run.plan && <p className="rv-statement">{run.plan.summary || run.plan.hypothesis}</p>}
      {run.plan && <p className="rv-note">{SCOPE[run.plan.scope]}</p>}
      {claim?.evidenceQuote && <figure className="rv-quote"><blockquote>“{claim.evidenceQuote}”</blockquote><figcaption>From the paper, {claim.sourceLocation}</figcaption></figure>}
      {run.plan && <div className="rv-columns">
        <div><h3>How it was tested</h3><p>{run.plan.method}</p></div>
        <div><h3>What data was used</h3><p>{run.plan.dataset}</p></div>
      </div>}
    </section>}

    {result && !invalidOutput && (scalars.length > 0 || tables.length > 0) && <section className="rv-block">
      <h2>What it measured.</h2>
      <p className="rv-note">These values come straight from the experiment's output.</p>
      {scalars.length > 0 && <dl className="rv-measures">{scalars.slice(0, 12).map((metric, index) => <div key={`${metric.name}-${index}`}>
        <dd title={metric.observed}>{formatValue(metric.observed)}</dd>
        <dt>{label(metric.name)}{metric.reported ? ` · paper reports ${metric.reported}` : ""}</dt>
      </div>)}</dl>}
      {tables.map(({ metric, rows, columns }) => <div className="rv-table" key={metric.name}>
        <h3>{label(metric.name)}</h3>
        <div className="rv-table-scroll" tabIndex={0} role="region" aria-label={`${label(metric.name)} table`}><table><thead><tr>{columns.map(column => <th key={column}>{label(column)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map(column => <td key={column}>{row[column] === undefined || row[column] === null ? "" : formatValue(String(row[column]))}</td>)}</tr>)}</tbody></table></div>
      </div>)}
    </section>}

    {(result?.limitations.length ?? 0) > 0 && <section className="rv-block">
      <h2>What this does not prove.</h2>
      <ul className="rv-limits">{result!.limitations.map(value => <li key={value}>{value}</li>)}</ul>
    </section>}

    <section className="rv-block">
      <h2>The code.</h2>
      <p className="rv-note">The program the agent wrote, any fixes it made, and exactly what it printed.</p>
      <AgentWorkbench key={run.id} run={run} />
    </section>

    {(Boolean(run.repairs?.length) || run.events.length > 0) && <details className="rv-details"><summary>Show every step the agent took<ChevronRight size={15} /></summary>
      {Boolean(run.repairs?.length) && <div className="rv-repairs">{run.repairs!.map(repair => <p key={`${repair.afterAttempt}-${repair.at}`}><strong>Fix after attempt {repair.afterAttempt}.</strong> {repair.summary}</p>)}</div>}
      <ol className="rv-steps">{run.events.map(event => <li key={event.id}><time>{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><p>{event.message}</p></li>)}</ol>
    </details>}

    <footer className="rv-end"><button className="rv-link" onClick={onBack}>Investigate another paper<ChevronRight size={15} /></button></footer>
  </article>;
}
