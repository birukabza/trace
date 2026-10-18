"use client";

import { useState } from "react";
import { Check, Code2, Copy, Terminal, GitCompareArrows } from "lucide-react";
import type { Run } from "@/lib/types";
import { codeChanges, currentAgentCode } from "@/lib/agent-evidence";
import { parseMeasurements } from "@/lib/measurements";

type View = "code" | "changes" | "output";

export function AgentWorkbench({ run }: { run: Run }) {
  const [selected, setSelected] = useState<View | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const current = currentAgentCode(run);
  const latest = run.attempts.at(-1);
  const missingMeasurements = run.mode === "live" && latest?.exitCode === 0 && !parseMeasurements(latest.stdout);
  const latestPassed = latest?.exitCode === 0 && !latest.validationError && !missingMeasurements;
  const attempt = run.attempts.find(item => item.number === selectedAttempt) ?? latest;
  const hasChanges = Boolean(current.repair && current.previousCode !== undefined && current.code !== undefined);
  const waitingForRepair = run.status === "repairing" && (!current.repair || current.repair.afterAttempt < (latest?.number ?? 1));
  const view = selected ?? (waitingForRepair ? "output" : hasChanges ? "changes" : "code");
  if (!current.code) return null;
  const changes = hasChanges ? codeChanges(current.previousCode!, current.code) : [];
  const state = run.status === "completed" ? missingMeasurements ? "Measurements missing" : "Finished" : ["failed", "blocked", "cancelled"].includes(run.status) ? "Stopped" : run.status === "running" ? run.result ? "Finished running" : "Running" : run.status === "repairing" ? waitingForRepair ? "Diagnosing error" : "Fix written" : run.status === "queued" ? "Ready to run" : "Code saved";
  const copy = async () => { try { await navigator.clipboard.writeText(current.code!); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); } };
  return <section className="agent-workbench" aria-label="Agent code and execution">
    <div className="agent-workbench-heading"><span>experiment.py <span className="agent-version">/ attempt {current.number}</span></span><span className="agent-code-state">{state}</span></div>
    {waitingForRepair && latest && <div className="agent-error-note" role="status">{latest.validationError ? `Attempt ${latest.number} ran, but its measurements failed validation.` : `Attempt ${latest.number} exited ${latest.exitCode}.`} The agent is reading the feedback and preparing a fix.</div>}
    {run.status === "completed" && missingMeasurements && <div className="agent-error-note">This older run exited successfully but did not return structured measurements. Its output needs correction.</div>}
    <div className="agent-workbench-toolbar"><div className="agent-view-tabs" role="tablist" aria-label="Agent evidence" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tabs: View[] = hasChanges ? ["code", "changes", "output"] : ["code", "output"];
      const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1)! : tabs[(tabs.indexOf(view) + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      setSelected(next); document.getElementById(`${next}-tab-${run.id}`)?.focus();
    }}>
      <button role="tab" id={`code-tab-${run.id}`} tabIndex={view === "code" ? 0 : -1} aria-selected={view === "code"} aria-controls={`agent-panel-${run.id}`} onClick={() => setSelected("code")}><Code2 size={13} />Code</button>
      {hasChanges && <button role="tab" id={`changes-tab-${run.id}`} tabIndex={view === "changes" ? 0 : -1} aria-selected={view === "changes"} aria-controls={`agent-panel-${run.id}`} onClick={() => setSelected("changes")}><GitCompareArrows size={13} />Changes</button>}
      <button role="tab" id={`output-tab-${run.id}`} tabIndex={view === "output" ? 0 : -1} aria-selected={view === "output"} aria-controls={`agent-panel-${run.id}`} onClick={() => setSelected("output")}><Terminal size={13} />Output{latest && <span className={latestPassed ? "agent-output-ok" : "agent-output-error"}>{latestPassed ? "✓" : "!"}</span>}</button>
    </div><button className="agent-copy" onClick={copy} aria-label="Copy current Python code">{copied ? <Check size={13} /> : <Copy size={13} />}</button></div>
    <div className="agent-workbench-panel" id={`agent-panel-${run.id}`} role="tabpanel" aria-labelledby={`${view}-tab-${run.id}`} tabIndex={0}>
      {view === "code" && <pre className="agent-source">{current.code.split("\n").map((line, index) => <span className="agent-source-line" key={index}><span className="agent-line-number" aria-hidden="true">{index + 1}</span><code>{line || " "}</code></span>)}</pre>}
      {view === "changes" && hasChanges && <><div className="agent-revision-note"><strong>{current.repair!.summary}</strong><details className="agent-diagnosis"><summary>Agent diagnosis</summary><p>{current.repair!.diagnosis}</p></details></div><pre className="agent-diff" aria-label="Changes from the failed code">{changes.map((line, index) => <span className={`agent-diff-line diff-${line.kind}`} key={index}><span className="agent-line-number" aria-hidden="true">{line.newLine ?? line.oldLine}</span><code>{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "} {line.text || " "}</code></span>)}</pre></>}
      {view === "output" && (attempt ? <div className="agent-output"><div className="agent-attempt-tabs">{run.attempts.map(item => <button key={item.number} aria-pressed={attempt.number === item.number} onClick={() => setSelectedAttempt(item.number)}>Attempt {item.number} · exit {item.exitCode}{item.validationError ? " · invalid output" : ""}</button>)}</div>{attempt.changeReason && <p className="agent-output-caption">{attempt.changeReason}</p>}{attempt.validationError && <><h3>Measurement validation error</h3><pre className="agent-validation-error">{attempt.validationError}</pre></>}{attempt.stderr && <><h3>Actual error / stderr</h3><pre className="agent-stderr">{attempt.stderr}</pre></>}{attempt.stdout && <><h3>Captured stdout</h3><pre>{attempt.stdout}</pre></>}{!attempt.stdout && !attempt.stderr && <p className="agent-output-caption">The process returned no output. Exit code: {attempt.exitCode}.</p>}</div> : <div className="agent-output-empty">No execution output yet. The generated code is available in Code.</div>)}
    </div>
    <div className="agent-workbench-footnote">{run.mode === "example" ? "Recorded evidence · no live execution" : "Generated Python · execution output captured from CreateOS"}</div>
  </section>;
}
