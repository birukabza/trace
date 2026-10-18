import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunStore } from "../src/lib/server/store";
import type { Run } from "../src/lib/types";

function investigation(id: string, ownerId?: string): Run {
  return {
    id, ownerId, sourceUrl: "https://arxiv.org/abs/0909.4061", title: `${id} evidence`,
    status: "completed", createdAt: "2026-10-17T20:00:00Z", updatedAt: "2026-10-17T20:00:00Z",
    claims: [], events: [], attempts: [], mode: "live",
  };
}

test("owned reads conceal foreign, missing and ownerless investigations", () => {
  const database = new RunStore(":memory:");
  try {
    database.save(investigation("alice-paper", "alice"));
    database.save(investigation("bob-paper", "bob"));
    database.save(investigation("legacy-paper"));
    assert.equal(database.getOwned("alice-paper", "alice")?.title, "alice-paper evidence");
    for (const id of ["bob-paper", "legacy-paper", "missing"]) {
      assert.equal(database.getOwned(id, "alice"), undefined);
    }
    assert.equal(database.getOwned("alice-paper", "bob"), undefined);
    assert.deepEqual(database.listOwned("alice").map(run => run.id), ["alice-paper"]);
    assert.deepEqual(database.listOwned("unknown"), []);
    // Recovery retains access to historical records without making them public.
    assert.equal(database.get("legacy-paper")?.id, "legacy-paper");
  } finally { database.close(); }
});

test("history limits apply per owner and cannot leak foreign active work through OR clauses", () => {
  const database = new RunStore(":memory:");
  try {
    for (let index = 0; index < 55; index++) {
      database.save({ ...investigation(`alice-${index}`, "alice"), updatedAt: new Date(Date.UTC(2026, 9, 17, 10, index)).toISOString() });
    }
    for (let index = 0; index < 60; index++) {
      database.save({ ...investigation(`bob-${index}`, "bob"), updatedAt: new Date(Date.UTC(2026, 9, 17, 20, index)).toISOString() });
    }
    const statuses = ["analyzing", "awaiting_approval", "queued", "running", "repairing"] as const;
    for (const status of statuses) {
      database.save({ ...investigation(`alice-${status}`, "alice"), status, updatedAt: "2025-01-01T00:00:00Z" });
      database.save({ ...investigation(`bob-${status}`, "bob"), status, updatedAt: "2025-01-01T00:00:00Z" });
      database.save({ ...investigation(`legacy-${status}`), status, updatedAt: "2025-01-01T00:00:00Z" });
    }
    const ownHistory = database.listOwned("alice");
    assert.equal(ownHistory.length, 55);
    assert.ok(ownHistory.every(run => run.ownerId === "alice"));
    assert.equal(ownHistory[0].id, "alice-54");
    assert.equal(ownHistory.some(run => run.id === "alice-0"), false);
    assert.equal(ownHistory.some(run => run.id === "alice-4"), false);
    assert.equal(ownHistory.some(run => run.id === "alice-5"), true);
    for (const status of statuses) assert.ok(ownHistory.some(run => run.id === `alice-${status}`));
    assert.equal(database.active().length, 15);
  } finally { database.close(); }
});

test("saving a colliding ID cannot replace or remove an existing owner or its evidence", () => {
  const database = new RunStore(":memory:");
  try {
    const original = investigation("retained", "bob");
    original.attempts = [{ number: 1, code: "print(42)", stdout: "42", stderr: "", exitCode: 0, durationMs: 1 }];
    database.save(original);
    assert.throws(() => database.save({ ...original, ownerId: "alice", title: "Replaced" }));
    assert.deepEqual(database.getOwned("retained", "bob"), original);
    assert.equal(database.getOwned("retained", "alice"), undefined);
    assert.throws(() => database.save({ ...original, ownerId: undefined, attempts: [] }));
    assert.deepEqual(database.getOwned("retained", "bob"), original);
    database.save({ ...original, title: "Same-owner update" });
    assert.equal(database.getOwned("retained", "bob")?.title, "Same-owner update");
  } finally { database.close(); }
});

test("an ownerless historical record cannot be claimed by a later save", () => {
  const database = new RunStore(":memory:");
  try {
    database.save(investigation("legacy"));
    assert.throws(() => database.save(investigation("legacy", "alice")));
    assert.equal(database.get("legacy")?.ownerId, undefined);
    assert.equal(database.getOwned("legacy", "alice"), undefined);
    assert.deepEqual(database.listOwned("alice"), []);
    database.save({ ...investigation("legacy"), title: "Recovery update" });
    assert.equal(database.get("legacy")?.title, "Recovery update");
  } finally { database.close(); }
});

test("legacy SQLite migration backfills only existing explicit owners and remains safe on reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "trace-owner-migration-"));
  const path = join(directory, "runs.sqlite");
  try {
    const oldDatabase = new DatabaseSync(path);
    try {
      oldDatabase.exec("CREATE TABLE runs (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, body TEXT NOT NULL)");
      const insert = oldDatabase.prepare("INSERT INTO runs (id, updated_at, body) VALUES (?, ?, ?)");
      for (const run of [investigation("known-owner", "alice"), investigation("legacy")]) {
        insert.run(run.id, run.updatedAt, JSON.stringify(run));
      }
    } finally { oldDatabase.close(); }
    const migrated = new RunStore(path);
    try {
      assert.equal(migrated.getOwned("known-owner", "alice")?.id, "known-owner");
      assert.equal(migrated.getOwned("known-owner", "bob"), undefined);
      assert.equal(migrated.getOwned("legacy", "alice"), undefined);
      assert.throws(() => migrated.save(investigation("legacy", "alice")));
    } finally { migrated.close(); }
    const inspect = new DatabaseSync(path);
    try {
      const columns = inspect.prepare("PRAGMA table_info(runs)").all() as { name: string }[];
      assert.ok(columns.some(column => column.name === "owner_id"));
      const owners = inspect.prepare("SELECT id, owner_id FROM runs ORDER BY id").all() as { id: string; owner_id: string | null }[];
      assert.deepEqual(owners.map(row => ({ ...row })), [
        { id: "known-owner", owner_id: "alice" }, { id: "legacy", owner_id: null },
      ]);
    } finally { inspect.close(); }
    const reopened = new RunStore(path);
    try {
      assert.deepEqual(reopened.listOwned("alice").map(run => run.id), ["known-owner"]);
      assert.equal(reopened.get("legacy")?.id, "legacy");
    } finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("persisted ownership and evidence survive a database restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "trace-owned-persistence-"));
  const path = join(directory, "runs.sqlite");
  try {
    const original = investigation("persisted", "alice");
    const first = new RunStore(path);
    try { first.save(original); } finally { first.close(); }
    const second = new RunStore(path);
    try {
      assert.deepEqual(second.getOwned(original.id, "alice"), original);
      assert.equal(second.getOwned(original.id, "bob"), undefined);
      assert.throws(() => second.save({ ...original, ownerId: "bob" }));
    } finally { second.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
