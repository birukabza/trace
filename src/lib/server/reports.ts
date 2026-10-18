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
  const coverage = run.paper?.textCharacters === undefined
    ? "Extracted text coverage was not recorded for this run."
    : `Source text used: ${run.paper.textCharacters} characters. ${run.paper.textTruncated ? "The source was truncated to the text budget; omitted text was not analyzed." : "Extracted source text fit the text budget. This does not certify complete PDF extraction."}${run.paper.repositoryCharacters === undefined ? "" : `\n\nRepository README used: ${run.paper.repositoryCharacters} characters. ${run.paper.repositoryTruncated ? "The README was truncated." : "Extracted README text fit the text budget."}`}`;
  const workspace = run.sandbox
    ? [`Workspace: ${inline(run.sandbox.id)}`, ...(run.sandbox.forkedFrom ? [`Forked from: ${inline(run.sandbox.forkedFrom)}`] : []), `Restricted external egress: ${run.sandbox.egressRestricted ? "verified" : "not confirmed"}`, `Paused after run: ${run.sandbox.pausedAfterRun ? "confirmed" : "not confirmed"}`, ...(run.sandbox.releasedAt ? [`Temporary VM later released to recover capacity: ${inline(run.sandbox.releasedAt)}. Saved code, measurements and logs remain available.`] : [])].join("\n\n")
    : "No experiment workspace identity was recorded for this run.";
  return [
    `# ${inline(run.title)}`,
    `Run ${inline(run.id)}`,
    `Mode: ${run.mode === "example" ? "RECORDED EXAMPLE, not a live run" : "Live run"}\n\nStatus: ${inline(run.status)}\n\nSource: ${inline(run.sourceUrl)}\n\nCreated: ${inline(run.createdAt)}`,
    `Execution mode: ${run.executionMode === "automatic" ? "Automatic, with bounded implementation repairs" : "Not recorded; this may be a legacy or recorded run"}`,
    snapshot("Source", run.paper?.sourceHash), snapshot("Repository", run.paper?.repositoryHash),
    "## Source coverage", coverage,
    ...(run.repositoryUrl || run.paper?.sourceType === "github" ? ["Only the public repository README is inspected. Author repository code, dependency lockfiles and commits are not downloaded or executed."] : []),
    "## Source claims",
    ...run.claims.map((claim, index) => `### Claim ${index + 1}\n\n${inline(claim.text)}\n\nLocation (model identified): ${inline(claim.sourceLocation)}\n\nGrounded excerpt:\n\n${fenced(claim.evidenceQuote || "No grounded excerpt is available.")}`),
    "## Scope", inline(run.plan?.scope || "No experiment protocol available"),
    inline(run.plan?.hypothesis || "No hypothesis generated."),
    "## Protocol", inline(run.plan?.method || "Not generated."),
    `Dataset: ${inline(run.plan?.dataset || "Not available")}`,
    "## Evidence", inline(run.result?.summary || run.error || "This run has not produced measurements."),
    `| Metric | Reported | Observed |\n|---|---|---|\n${(run.result?.metrics || []).map(metric => `| ${inline(metric.name)} | ${inline(metric.reported || "Not compared")} | ${inline(metric.observed)} |`).join("\n")}`,
    "## Limitations", (run.result?.limitations || run.plan?.limitations || ["No execution has occurred."]).map(value => `- ${inline(value)}`).join("\n"),
    "## Initial generated Python", run.plan ? fenced(run.plan.pythonCode, "python") : "Not generated.",
    "## Execution provenance", workspace,
    "Every attempt below ran in an isolated sandbox with restricted networking.",
    ...(run.mode === "example" ? ["Opening this recorded example makes no execution request."] : []),
    "## Execution records",
    ...run.attempts.map(attempt => `### Attempt ${attempt.number}\n\nExit status: ${attempt.exitCode}. Duration: ${attempt.durationMs} ms.\n\nCode SHA-256: ${inline(attempt.codeHash || "Not recorded")}${attempt.changeReason ? `\n\nChange from previous attempt: ${inline(attempt.changeReason)}` : ""}\n\n${fenced(attempt.code, "python")}\n\nstdout\n\n${fenced(attempt.stdout)}\n\nstderr\n\n${fenced(attempt.stderr)}${attempt.validationError ? `\n\nMeasurement validation feedback (process exit preserved):\n\n${fenced(attempt.validationError)}` : ""}`),
    ...(run.attempts.length ? [] : ["No execution has occurred for this run."]),
    "## Implementation repairs",
    ...(run.repairs?.length ? run.repairs.map(repair => `### After attempt ${repair.afterAttempt}\n\n${inline(repair.at)}\n\nDiagnosis: ${inline(repair.diagnosis)}\n\nChange: ${inline(repair.summary)}\n\nRevised code SHA-256: ${inline(repair.codeHash)}${repair.pythonCode ? `\n\nWritten revision (execution is recorded separately):\n\n${fenced(repair.pythonCode, "python")}` : ""}`) : ["No implementation repairs were recorded."]),
    "## Timeline", run.events.map(event => `- ${inline(event.at)} · ${inline(event.message)}`).join("\n"),
  ].join("\n\n") + "\n";
}
