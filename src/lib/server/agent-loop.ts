export type CodeRepair =
  | { action: "repair"; diagnosis: string; summary: string; pythonCode: string }
  | { action: "stop"; reason: string };

export type AgentExecution = { stdout: string; stderr: string; exitCode: number; durationMs: number };
type HistoryEntry = { number: number; code: string; output: AgentExecution };
export type AgentAttempt = HistoryEntry & { changeReason?: string };

type AgentLoopOptions = {
  initialCode: string;
  maxAttempts?: number;
  signal?: AbortSignal;
  execute: (code: string, attempt: number, signal?: AbortSignal) => Promise<AgentExecution>;
  repair: (history: readonly HistoryEntry[], signal?: AbortSignal) => Promise<CodeRepair>;
  onAttempt: (record: AgentAttempt) => void | Promise<void>;
  onRepairing: (attempt: number) => void | Promise<void>;
  onRevision: (repair: Extract<CodeRepair, { action: "repair" }>, nextAttempt: number) => void | Promise<void>;
};

/** A bounded write/run/fix loop. Transport failures propagate; only actual code exits invite repair. */
export async function runAgentLoop({
  initialCode, maxAttempts = 3, signal, execute, repair, onAttempt, onRepairing, onRevision,
}: AgentLoopOptions): Promise<{ status: "succeeded" | "exhausted" | "stopped"; reason?: string }> {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) throw new RangeError("maxAttempts must be a positive integer.");
  let history: readonly Readonly<HistoryEntry>[] = Object.freeze([]);
  let code = initialCode;
  let changeReason: string | undefined;
  const checkCancelled = () => signal?.throwIfAborted();

  for (let number = 1; number <= maxAttempts; number++) {
    checkCancelled();
    const output = await execute(code, number, signal);
    checkCancelled();
    // Keep owned evidence independent of objects returned by execution or handed to callbacks.
    const entry = Object.freeze({ number, code, output: Object.freeze({ ...output }) });
    history = Object.freeze([...history, entry]);
    await onAttempt({ ...structuredClone(entry), ...(changeReason ? { changeReason } : {}) });
    checkCancelled();
    if (entry.output.exitCode === 0) return { status: "succeeded" };
    if (number === maxAttempts) return { status: "exhausted", reason: `The experiment did not succeed within ${maxAttempts} execution attempts.` };

    checkCancelled();
    await onRepairing(number);
    checkCancelled();
    const revision = await repair(structuredClone(history), signal);
    checkCancelled();
    if (revision.action === "stop") return { status: "stopped", reason: revision.reason };
    if (revision.pythonCode.trim() === code.trim()) {
      return { status: "stopped", reason: "The agent proposed unchanged code, so no duplicate execution was started." };
    }
    code = revision.pythonCode;
    changeReason = revision.summary;
    // Pass a separate object so an observer cannot change the next code revision.
    await onRevision({ ...revision }, number + 1);
    checkCancelled();
  }

  // The validated positive attempt budget makes this unreachable.
  throw new Error("Agent execution ended without a result.");
}
