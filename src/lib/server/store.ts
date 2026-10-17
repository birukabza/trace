import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Run, RunStatus } from "../types";

const transitions: Record<RunStatus, RunStatus[]> = {
  analyzing: ["awaiting_approval", "blocked", "failed", "cancelled"],
  awaiting_approval: ["queued", "cancelled"],
  queued: ["running", "cancelled", "failed"],
  running: ["completed", "blocked", "failed", "cancelled"],
  completed: [], blocked: [], failed: [], cancelled: [],
};

export function transition(run: Run, status: RunStatus) {
  if (!transitions[run.status].includes(status)) throw new Error(`Cannot change ${run.status} to ${status}.`);
  run.status = status;
}

export function addEvent(run: Run, stage: string, message: string) {
  run.events.push({ id: randomUUID(), at: new Date().toISOString(), stage, message });
  run.updatedAt = new Date().toISOString();
}

export class RunStore {
  private db: DatabaseSync;
  constructor(path = join(process.cwd(), "data", "runs.sqlite")) {
    if (path !== ":memory:") mkdirSync(join(path, ".."), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, body TEXT NOT NULL)");
    this.db.exec("CREATE TABLE IF NOT EXISTS runtime_state (name TEXT PRIMARY KEY, value INTEGER NOT NULL)");
  }
  get(id: string): Run | undefined {
    const row = this.db.prepare("SELECT body FROM runs WHERE id = ?").get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) as Run : undefined;
  }
  list(): Run[] {
    return (this.db.prepare("SELECT body FROM runs WHERE id IN (SELECT id FROM runs ORDER BY updated_at DESC LIMIT 50) OR json_extract(body, '$.status') IN ('analyzing','awaiting_approval','queued','running') ORDER BY updated_at DESC").all() as { body: string }[]).map(row => JSON.parse(row.body) as Run);
  }
  active(): Run[] {
    return (this.db.prepare("SELECT body FROM runs WHERE json_extract(body, '$.status') IN ('analyzing','awaiting_approval','queued','running')").all() as { body: string }[]).map(row => JSON.parse(row.body) as Run);
  }
  save(run: Run) {
    this.db.prepare("INSERT INTO runs (id,updated_at,body) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,body=excluded.body").run(run.id, run.updatedAt, JSON.stringify(run));
  }
  executionLeaseUntil(): number {
    const row = this.db.prepare("SELECT value FROM runtime_state WHERE name = 'execution_lease'").get() as { value: number } | undefined;
    return row?.value || 0;
  }
  saveExecutionLease(until: number) {
    this.db.prepare("INSERT INTO runtime_state (name,value) VALUES ('execution_lease',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value").run(until);
  }
  close() { this.db.close(); }
}

const globalStore = globalThis as typeof globalThis & { reproStore?: RunStore };
export function runStore() { return globalStore.reproStore ??= new RunStore(); }
