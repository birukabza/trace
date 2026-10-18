import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Run, RunStatus } from "../types";
import { dataPath } from "./paths";

const transitions: Record<RunStatus, RunStatus[]> = {
  analyzing: ["awaiting_approval", "queued", "blocked", "failed", "cancelled"],
  awaiting_approval: ["queued", "blocked", "failed", "cancelled"],
  queued: ["running", "cancelled", "failed"],
  running: ["repairing", "completed", "blocked", "failed", "cancelled"],
  repairing: ["running", "blocked", "failed", "cancelled"],
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
  constructor(path = dataPath("runs.sqlite")) {
    if (path !== ":memory:") mkdirSync(join(path, ".."), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, body TEXT NOT NULL)");
    const columns = this.db.prepare("PRAGMA table_info(runs)").all() as { name: string }[];
    if (!columns.some(column => column.name === "owner_id")) this.db.exec("ALTER TABLE runs ADD COLUMN owner_id TEXT");
    this.db.exec("UPDATE runs SET owner_id = json_extract(body, '$.ownerId') WHERE owner_id IS NULL AND json_type(body, '$.ownerId') = 'text' AND length(json_extract(body, '$.ownerId')) > 0");
    this.db.exec("CREATE INDEX IF NOT EXISTS runs_owner_updated ON runs(owner_id, updated_at DESC)");
    this.db.exec("CREATE TABLE IF NOT EXISTS runtime_state (name TEXT PRIMARY KEY, value INTEGER NOT NULL)");
  }
  get(id: string): Run | undefined {
    const row = this.db.prepare("SELECT body FROM runs WHERE id = ?").get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) as Run : undefined;
  }
  getOwned(id: string, ownerId: string): Run | undefined {
    if (!ownerId) return;
    const row = this.db.prepare("SELECT body FROM runs WHERE id = ? AND owner_id = ?").get(id, ownerId) as { body: string } | undefined;
    return row ? JSON.parse(row.body) as Run : undefined;
  }
  listOwned(ownerId: string): Run[] {
    if (!ownerId) return [];
    return (this.db.prepare("SELECT body FROM runs WHERE owner_id = ? AND (id IN (SELECT id FROM runs WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 50) OR json_extract(body, '$.status') IN ('analyzing','awaiting_approval','queued','running','repairing')) ORDER BY updated_at DESC").all(ownerId, ownerId) as { body: string }[]).map(row => JSON.parse(row.body) as Run);
  }
  list(): Run[] {
    return (this.db.prepare("SELECT body FROM runs WHERE id IN (SELECT id FROM runs ORDER BY updated_at DESC LIMIT 50) OR json_extract(body, '$.status') IN ('analyzing','awaiting_approval','queued','running','repairing') ORDER BY updated_at DESC").all() as { body: string }[]).map(row => JSON.parse(row.body) as Run);
  }
  active(): Run[] {
    return (this.db.prepare("SELECT body FROM runs WHERE json_extract(body, '$.status') IN ('analyzing','awaiting_approval','queued','running','repairing')").all() as { body: string }[]).map(row => JSON.parse(row.body) as Run);
  }
  cleanupPending(): Run[] {
    return (this.db.prepare("SELECT body FROM runs WHERE json_type(body, '$.sandbox.forkedFrom') = 'text' AND json_extract(body, '$.sandbox.forkedFrom') != '' AND COALESCE(json_extract(body, '$.sandbox.pausedAfterRun'), 0) != 1").all() as { body: string }[]).map(row => JSON.parse(row.body) as Run);
  }
  reclaimableWorkspaces(): Run[] {
    return (this.db.prepare("SELECT body FROM runs WHERE json_extract(body, '$.status') IN ('completed','failed','blocked','cancelled') AND json_type(body, '$.sandbox.forkedFrom') = 'text' AND json_extract(body, '$.sandbox.pausedAfterRun') = 1 AND json_extract(body, '$.sandbox.releasedAt') IS NULL ORDER BY updated_at ASC").all() as { body: string }[]).map(row => JSON.parse(row.body) as Run);
  }
  save(run: Run) {
    const existing = this.db.prepare("SELECT owner_id FROM runs WHERE id = ?").get(run.id) as { owner_id: string | null } | undefined;
    const owner = run.ownerId || null;
    if (existing && existing.owner_id !== owner) throw new Error("An investigation's owner cannot be changed.");
    this.db.prepare("INSERT INTO runs (id,updated_at,body,owner_id) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,body=excluded.body").run(run.id, run.updatedAt, JSON.stringify(run), owner);
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
