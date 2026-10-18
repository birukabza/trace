"use client";

import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Clock, FlaskConical, Info, Quote, RotateCcw, Terminal, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { Run } from "@/lib/types";
import { AgentWorkbench } from "./agent-workbench";
import { parseMeasurements } from "@/lib/measurements";
import { RESEARCH_LIMITS } from "@/lib/capabilities";

type Metric = NonNullable<Run["result"]>["metrics"][number];
type Row = Record<string, string | number | boolean | null>;

const SCOPE = { component_check: "Focused check", reduced_experiment: "Smaller-scale experiment", reproduction: "Full reproduction" } as const;
const label = (name: string) => name.replaceAll("_", " ");

function duration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  const total = Math.round(ms / 1000);
  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${total % 60}s`;
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
  const number = Number(value);
  if (value.trim() !== "" && Number.isFinite(number) && !/^0\d/.test(value)) {
    if (Number.isInteger(number)) return number.toLocaleString();
    const abs = Math.abs(number);
    return abs !== 0 && (abs < 1e-3 || abs >= 1e6) ? number.toExponential(3) : Number(number.toPrecision(5)).toString();
  }
  return value;
}

function Section({ icon, title, children, aside }: { icon: ReactNode; title: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="rv-section"><header className="rv-section-head"><h2>{icon}{title}</h2>{aside}</header>{children}</section>;
}

export function ResultView({ run, onBack, onRetry, busy }: { run: Run; onBack: () => void; onRetry: () => void; busy: boolean }) {
  const result = run.result;
  const latest = run.attempts.at(-1);
  const invalidOutput = run.mode === "live" && run.status === "completed" && latest?.exitCode === 0 && !parseMeasurements(latest.stdout);
  const failed = ["failed", "blocked"].includes(run.status);
  const success = Boolean(result) && !invalidOutput && !failed;
  const claim = run.claims.find(item => item.id === run.plan?.claimId) ?? run.claims[0];
  const { tables, scalars } = splitMetrics(result?.metrics ?? []);
  const runtime = run.attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0);
  const elapsed = Math.max(0, new Date(run.updatedAt).getTime() - new Date(run.createdAt).getTime());
  const status = success
    ? { tone: "ok", icon: <Check size={14} />, text: "Experiment complete" }
    : { tone: "warn", icon: <TriangleAlert size={14} />, text: invalidOutput ? "Output needs correction" : run.status === "blocked" ? "Experiment blocked" : "Experiment stopped" };

  return <div className="result-view stage-enter">
    <header className="rv-hero">
      <div className="rv-hero-top">
        <span className={`rv-status rv-status-${status.tone}`}>{status.icon}{status.text}</span>
        {run.mode === "example" && <span className="rv-badge">Recorded example</span>}
        {run.plan && <span className="rv-badge">{SCOPE[run.plan.scope]}</span>}
      </div>
      <h1>{run.paper?.title || run.title}</h1>
      <a className="rv-source" href={run.sourceUrl} target="_blank" rel="noreferrer">{run.sourceUrl.replace(/^https?:\/\//, "")}<ArrowUpRight size={12} /></a>
      <div className="rv-actions">
        <a className="primary-button" href={`/api/runs/${encodeURIComponent(run.id)}/report`} download>Download PDF report<ArrowDownToLine size={15} /></a>
        {(failed || invalidOutput) && run.plan && <button className="secondary-button" onClick={onRetry} disabled={busy}>{invalidOutput ? "Repair the output" : "Run it again"}<RotateCcw size={14} /></button>}
        <a className="secondary-button" href={run.sourceUrl} target="_blank" rel="noreferrer">Read paper<ArrowUpRight size={14} /></a>
        <button className="text-button rv-new" onClick={onBack}><ArrowLeft size={14} />New research</button>
      </div>
      <dl className="rv-stats">
        <div><dt>Attempts</dt><dd>{run.attempts.length}<small> / {RESEARCH_LIMITS.maxAttempts}</small></dd></div>
        <div><dt>Code runtime</dt><dd>{duration(runtime)}</dd></div>
        <div><dt>Total time</dt><dd>{duration(elapsed)}</dd></div>
        <div><dt>Last exit code</dt><dd className={latest?.exitCode === 0 ? "rv-good" : "rv-bad"}>{latest ? latest.exitCode : "-"}</dd></div>
      </dl>
    </header>

    {run.error && !success && <div className="rv-error" role="alert"><TriangleAlert size={16} /><p>{run.error}</p></div>}

    {(run.plan || claim) && <Section icon={<FlaskConical size={16} />} title="What was tested">
      {run.plan && <p className="rv-question">{run.plan.summary || run.plan.hypothesis}</p>}
      {claim?.evidenceQuote && <blockquote className="rv-quote"><Quote size={14} aria-hidden="true" /><p>{claim.evidenceQuote}</p><cite>{claim.sourceLocation}</cite></blockquote>}
      {run.plan && <dl className="rv-protocol"><div><dt>Method</dt><dd>{run.plan.method}</dd></div><div><dt>Data</dt><dd>{run.plan.dataset}</dd></div></dl>}
    </Section>}

    <Section icon={<Check size={16} />} title="Findings">
      <p className="rv-summary">{invalidOutput ? "Python ran, but the output was not in the required measurement format. The code and raw output are below." : result?.summary || "The experiment did not produce measurements. Its code and output are saved below."}</p>
      {scalars.length > 0 && !invalidOutput && <div className="rv-metrics">{scalars.slice(0, 12).map((metric, index) => <article className="rv-metric" key={`${metric.name}-${index}`}>
        <span className="rv-metric-name" title={label(metric.name)}>{label(metric.name)}</span>
        <strong className={metric.observed === "true" ? "rv-good" : metric.observed === "false" ? "rv-bad" : ""} title={metric.observed}>{formatValue(metric.observed)}</strong>
        {metric.reported && <span className="rv-metric-reported">Paper: {metric.reported}</span>}
      </article>)}</div>}
      {!invalidOutput && tables.map(({ metric, rows, columns }) => <div className="rv-table" key={metric.name}>
        <div className="rv-table-head"><h3>{label(metric.name)}</h3><span>{rows.length} rows</span></div>
        <div className="rv-table-scroll" tabIndex={0} role="region" aria-label={`${label(metric.name)} table`}><table><thead><tr>{columns.map(column => <th key={column}>{label(column)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map(column => <td key={column}>{row[column] === undefined || row[column] === null ? "-" : formatValue(String(row[column]))}</td>)}</tr>)}</tbody></table></div>
      </div>)}
    </Section>

    <Section icon={<Terminal size={16} />} title="The agent's work" aside={<span className="rv-aside">Code, changes and raw output</span>}>
      <AgentWorkbench key={run.id} run={run} />
    </Section>

    {(result?.limitations.length ?? 0) > 0 && <Section icon={<Info size={16} />} title="Keep in mind">
      <ul className="rv-limits">{result!.limitations.map(value => <li key={value}>{value}</li>)}</ul>
    </Section>}

    <details className="rv-more"><summary><Clock size={14} />Full activity and source details<ChevronDown size={14} /></summary>
      <div className="rv-more-body">
        {Boolean(run.repairs?.length) && <><h3>How the agent fixed its code</h3>{run.repairs!.map(repair => <article className="rv-repair" key={`${repair.afterAttempt}-${repair.at}`}><span>After attempt {repair.afterAttempt}</span><strong>{repair.summary}</strong><p>{repair.diagnosis}</p></article>)}</>}
        {run.paper?.textCharacters !== undefined && <><h3>Source coverage</h3><p>{run.paper.textCharacters.toLocaleString()} characters of source text were read{run.paper.textTruncated ? ", shortened to fit the reading budget" : ""}.</p></>}
        <h3>Activity</h3>
        <ol className="rv-timeline">{run.events.map(event => <li key={event.id}><time>{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><span>{label(event.stage)}</span><p>{event.message}</p></li>)}</ol>
      </div>
    </details>

    <div className="rv-footer"><button className="secondary-button" onClick={onBack}>Investigate another paper<ArrowRight size={14} /></button></div>
  </div>;
}
