import { POOL_SIZE } from "./sandbox";

// First-in, first-out queue over the shared sandbox slots. One backend process
// owns the pool, so in-memory state is authoritative; restarts fail active runs.
type Waiter = { runId: string; resolve: (slot: number) => void; reject: (error: unknown) => void };
type PoolState = { free: number[]; waiters: Waiter[]; busy: Map<number, string> };
const globalPool = globalThis as typeof globalThis & { tracePool?: PoolState };
const pool = globalPool.tracePool ??= { free: Array.from({ length: POOL_SIZE }, (_, index) => index + 1), waiters: [] as Waiter[], busy: new Map<number, string>() };

export function acquireSlot(runId: string, signal: AbortSignal): Promise<number> {
  signal.throwIfAborted();
  const slot = pool.free.shift();
  if (slot !== undefined) { pool.busy.set(slot, runId); return Promise.resolve(slot); }
  return new Promise<number>((resolve, reject) => {
    const waiter: Waiter = { runId, resolve, reject };
    pool.waiters.push(waiter);
    signal.addEventListener("abort", () => {
      const index = pool.waiters.indexOf(waiter);
      if (index >= 0) { pool.waiters.splice(index, 1); reject(signal.reason ?? new Error("Run cancelled.")); }
    }, { once: true });
  });
}

export function releaseSlot(slot: number) {
  const next = pool.waiters.shift();
  if (next) { pool.busy.set(slot, next.runId); next.resolve(slot); return; }
  pool.busy.delete(slot);
  pool.free.push(slot);
  pool.free.sort((a, b) => a - b);
}

/** 1-based place in line, or undefined when the run is not waiting. */
export function queuePosition(runId: string): number | undefined {
  const index = pool.waiters.findIndex(waiter => waiter.runId === runId);
  return index >= 0 ? index + 1 : undefined;
}

export function slotsBusy() { return pool.free.length === 0; }
export function poolStatus() { return { size: POOL_SIZE, busy: pool.busy.size, waiting: pool.waiters.length }; }
