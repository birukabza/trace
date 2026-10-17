import type { Run } from "../types";

function inline(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/([\\`*_{}\[\]()#+.!|<>~\-])/g, "\\$1");
}

function fenced(value: string, language = "text") {
  const longest = (value.match(/`+/g) || []).reduce((length, match) => Math.max(length, match.length), 0);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${value}\n${fence}`;
}

export function markdownReport(run: Run) {
  const snapshot = (label: string, hash?: string) => hash
    ? `${label} text SHA-256: ${inline(hash)}\n\n${label} snapshot: ${inline(`data/sources/${hash}.txt`)}`
    : `${label} snapshot: ${run.mode === "example" ? "Not available for this recorded example." : "No snapshot was created."}`;
  return [
    `# ${inline(run.title)}`,
    `Run ${inline(run.id)}`,
    `Mode: ${run.mode === "example" ? "RECORDED EXAMPLE, not a live run" : "Live run"}\n\nStatus: ${inline(run.status)}\n\nSource: ${inline(run.sourceUrl)}\n\nCreated: ${inline(run.createdAt)}`,
    snapshot("Source", run.paper?.sourceHash), snapshot("Repository", run.paper?.repositoryHash),
    "## Source claims",
    ...run.claims.map((claim, index) => `### Claim ${index + 1}\n\n${inline(claim.text)}\n\nLocation (model identified): ${inline(claim.sourceLocation)}\n\nGrounded excerpt:\n\n${fenced(claim.evidenceQuote || "No grounded excerpt is available.")}`),
    "## Scope", inline(run.plan?.scope || "No experiment protocol available"),
    inline(run.plan?.hypothesis || "No hypothesis generated."),
    "## Protocol", inline(run.plan?.method || "Not generated."),
    `Dataset: ${inline(run.plan?.dataset || "Not available")}`,
    "## Evidence", inline(run.result?.summary || run.error || "This run has not produced measurements."),
    `| Metric | Reported | Observed |\n|---|---|---|\n${(run.result?.metrics || []).map(metric => `| ${inline(metric.name)} | ${inline(metric.reported || "Not compared")} | ${inline(metric.observed)} |`).join("\n")}`,
    "## Limitations", (run.result?.limitations || run.plan?.limitations || ["No execution has occurred."]).map(value => `- ${inline(value)}`).join("\n"),
    "## Proposed Python", run.plan ? fenced(run.plan.pythonCode, "python") : "Not generated.",
    "## Execution records",
    ...run.attempts.map(attempt => `### Attempt ${attempt.number}\n\nExit status: ${attempt.exitCode}. Duration: ${attempt.durationMs} ms.\n\n${fenced(attempt.code, "python")}\n\nstdout\n\n${fenced(attempt.stdout)}\n\nstderr\n\n${fenced(attempt.stderr)}`),
    ...(run.attempts.length ? [] : ["No execution has occurred for this run."]),
    "## Timeline", run.events.map(event => `- ${inline(event.at)} · ${inline(event.message)}`).join("\n"),
  ].join("\n\n") + "\n";
}
