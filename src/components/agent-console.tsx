"use client";

import { useEffect, useRef, useState } from "react";
import type { Run, RunEvent } from "@/lib/types";

// A terminal-style view of the agent's real activity. Every line comes from a
// recorded run event; nothing here is simulated or invented.

type Tone = "info" | "ok" | "warn" | "error" | "agent";
type ConsoleLine = { id: string; at: string; command: string; text: string; tone: Tone };

const COMMANDS: Record<string, { command: string; tone?: Tone }> = {
  analyzing: { command: "agent.start", tone: "agent" },
  source: { command: "read_source" },
  written: { command: "write_file experiment.py", tone: "ok" },
  queued: { command: "sandbox.queue" },
  workspace_progress: { command: "sandbox" },
  sandbox: { command: "sandbox.ready", tone: "ok" },
  resuming: { command: "upload experiment.py" },
  running: { command: "exec python3 experiment.py", tone: "agent" },
  execution: { command: "process.exit" },
  validation: { command: "validate_output", tone: "warn" },
  repairing: { command: "diagnose", tone: "agent" },
  workspace_ready: { command: "sandbox.hold" },
  revised: { command: "patch experiment.py", tone: "ok" },
  report: { command: "write_report", tone: "ok" },
  completed: { command: "done", tone: "ok" },
  paused: { command: "sandbox.pause" },
  retry: { command: "retry" },
  recorded: { command: "load_recording" },
  failed: { command: "error", tone: "error" },
  blocked: { command: "stop", tone: "warn" },
  cancelled: { command: "cancel", tone: "warn" },
};

function toLine(event: RunEvent): ConsoleLine {
  const known = COMMANDS[event.stage] ?? { command: event.stage.replaceAll("_", ".") };
  let tone = known.tone ?? "info";
  if (event.stage === "execution") tone = /exited 0\b/.test(event.message) ? "ok" : "error";
  return { id: event.id, at: event.at, command: known.command, text: event.message, tone };
}

function clock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** What the agent is doing right now, phrased from its actual status. */
function liveActivity(run: Run): string {
  if (run.status === "analyzing") return run.events.some(event => event.stage === "source") ? "thinking · choosing a claim and writing code" : "reading the paper";
  if (run.status === "queued") return run.queuePosition ? `waiting for a free sandbox · #${run.queuePosition} in line` : "connecting to the sandbox";
  if (run.status === "running") return run.result ? "writing the evidence report" : "executing in the sandbox";
  if (run.status === "repairing") return "debugging · reading the error and patching code";
  return "working";
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function TypedText({ text, animate }: { text: string; animate: boolean }) {
  const [shown, setShown] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) { setShown(text.length); return; }
    setShown(0);
    const step = Math.max(1, Math.ceil(text.length / 60));
    const timer = setInterval(() => setShown(count => {
      if (count + step >= text.length) { clearInterval(timer); return text.length; }
      return count + step;
    }), 16);
    return () => clearInterval(timer);
  }, [text, animate]);
  return <>{text.slice(0, shown)}</>;
}

export function AgentConsole({ run }: { run: Run }) {
  const active = ["analyzing", "queued", "running", "repairing"].includes(run.status);
  const [now, setNow] = useState(() => Date.now());
  const [frame, setFrame] = useState(0);
  const body = useRef<HTMLOListElement>(null);
  const firstSeen = useRef<Map<string, number> | null>(null);
  const lines = run.events.map(toLine);

  // Lines present on first render appear instantly; later ones type in.
  if (!firstSeen.current) firstSeen.current = new Map(lines.map(line => [line.id, 0]));
  for (const line of lines) if (!firstSeen.current.has(line.id)) firstSeen.current.set(line.id, Date.now());
  const typing = (id: string) => Date.now() - (firstSeen.current!.get(id) ?? 0) < 1_200;

  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => { setNow(Date.now()); setFrame(value => (value + 1) % SPINNER.length); }, 90);
    return () => clearInterval(tick);
  }, [active]);

  useEffect(() => {
    const element = body.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines.length]);

  const started = new Date(run.createdAt).getTime();
  const ended = active ? now : new Date(run.updatedAt).getTime();

  return <section className={`agent-console ${active ? "is-live" : ""}`} aria-label="Agent activity">
    <header className="agent-console-header">
      <span className="agent-console-dots" aria-hidden="true"><i /><i /><i /></span>
      <span className="agent-console-title">trace-agent</span>
      <span className="agent-console-meta">
        {active && <span className="agent-live"><span className="agent-live-dot" />LIVE</span>}
        <span>{lines.length} actions</span>
        <time>{clock(ended - started)}</time>
      </span>
    </header>
    <ol className="agent-console-body" ref={body} aria-live="polite">
      {lines.map(line => <li key={line.id} className={`console-line tone-${line.tone}`}>
        <time className="console-time">{clock(new Date(line.at).getTime() - started)}</time>
        <span className="console-prompt" aria-hidden="true">❯</span>
        <span className="console-command">{line.command}</span>
        <span className="console-text"><TypedText text={line.text} animate={typing(line.id)} /></span>
      </li>)}
      {active && <li className="console-line console-thinking">
        <time className="console-time">{clock(now - started)}</time>
        <span className="console-spinner" aria-hidden="true">{SPINNER[frame]}</span>
        <span className="console-text">{liveActivity(run)}<span className="console-cursor" aria-hidden="true" /></span>
      </li>}
    </ol>
  </section>;
}
