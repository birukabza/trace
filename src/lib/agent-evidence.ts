import type { Run } from "./types";

export function currentAgentCode(run: Run) {
  const repair = run.repairs?.at(-1);
  const attempt = run.attempts.at(-1);
  return {
    code: run.workingCode?.code ?? repair?.pythonCode ?? attempt?.code ?? run.plan?.pythonCode,
    number: run.workingCode?.attempt ?? (repair?.pythonCode ? repair.afterAttempt + 1 : attempt?.number ?? 1),
    previousCode: repair ? run.attempts.find(item => item.number === repair.afterAttempt)?.code : undefined,
    repair,
  };
}

export type CodeChange = { kind: "context" | "removed" | "added"; text: string; oldLine?: number; newLine?: number };

/** A contiguous change block with three lines of context; original text is never synthesized. */
export function codeChanges(before: string, after: string): CodeChange[] {
  if (before === after) return [];
  const oldLines = before.split("\n"), newLines = after.split("\n");
  let prefix = 0, suffix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines.at(-1 - suffix) === newLines.at(-1 - suffix)) suffix++;
  const rows: CodeChange[] = [];
  for (let index = Math.max(0, prefix - 3); index < prefix; index++) rows.push({ kind: "context", text: oldLines[index], oldLine: index + 1, newLine: index + 1 });
  for (let index = prefix; index < oldLines.length - suffix; index++) rows.push({ kind: "removed", text: oldLines[index], oldLine: index + 1 });
  for (let index = prefix; index < newLines.length - suffix; index++) rows.push({ kind: "added", text: newLines[index], newLine: index + 1 });
  for (let index = 0; index < Math.min(3, suffix); index++) rows.push({ kind: "context", text: oldLines[oldLines.length - suffix + index], oldLine: oldLines.length - suffix + index + 1, newLine: newLines.length - suffix + index + 1 });
  return rows;
}
