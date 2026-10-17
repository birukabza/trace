import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { CreateosSandboxClient, type ForkSandboxRequest, type Sandbox } from "@nodeops-createos/sandbox";
import { createExperimentSandbox, type ExperimentSandboxMetadata } from "../src/lib/server/sandbox";

function fixture(egress = ["192.0.2.1:443"]) {
  const calls: string[] = [];
  let forkRequest: ForkSandboxRequest | undefined;
  const makeBox = (id: string, initial: string) => ({
    id, status: initial,
    async refresh() { calls.push(`${id}:refresh`); return this; },
    async pause() { calls.push(`${id}:pause`); this.status = "pausing"; return this; },
    async resume() { calls.push(`${id}:resume`); this.status = "resuming"; return this; },
    async waitUntilPaused() { calls.push(`${id}:paused`); this.status = "paused"; return this; },
    async waitUntilRunning() { calls.push(`${id}:running`); this.status = "running"; return this; },
    async setAutoPause(seconds: number) { calls.push(`${id}:autopause:${seconds}`); return this; },
    async getEgress() { calls.push(`${id}:egress`); return { id, egress }; },
  });
  const child = makeBox("child", "forking");
  const base = {
    ...makeBox("base", "running"),
    async fork(request: ForkSandboxRequest) {
      calls.push("base:fork");
      forkRequest = request;
      return child as unknown as Sandbox;
    },
  };
  return { base, child, calls, request: () => forkRequest };
}

async function withClient<T>(base: unknown, action: () => Promise<T>) {
  const previous = process.env.CREATEOS_SANDBOX_API_KEY;
  process.env.CREATEOS_SANDBOX_API_KEY = "test-no-provider-request";
  const getSandbox = mock.method(CreateosSandboxClient.prototype, "getSandbox", async () => base as Sandbox);
  try { return await action(); }
  finally {
    getSandbox.mock.restore();
    if (previous === undefined) delete process.env.CREATEOS_SANDBOX_API_KEY;
    else process.env.CREATEOS_SANDBOX_API_KEY = previous;
  }
}

test("experiment fork restores base, verifies restriction, and pauses after cancellation", async () => {
  const f = fixture();
  const metadata: ExperimentSandboxMetadata[] = [];
  const controller = new AbortController();
  await withClient(f.base, async () => {
    const session = await createExperimentSandbox("run-1", controller.signal, value => { metadata.push(value); });
    assert.equal(session.id, "child");
    assert.equal(session.egressRestricted, true);
    assert.equal(f.base.status, "running");
    assert.equal(f.child.status, "running");
    assert.deepEqual(f.request(), {
      start_paused: true, ingress_enabled: false,
      egress: ["192.0.2.1:443"], envs: { TRACE_EXPERIMENT_ID: "run-1" },
    });
    assert.deepEqual(metadata.map(value => value.egressRestricted), [false, true]);
    assert.ok(f.calls.indexOf("base:resume") < f.calls.indexOf("child:resume"));
    assert.ok(f.calls.includes("child:autopause:300"));
    controller.abort();
    await session.pause();
    assert.equal(f.child.status, "paused");
    assert.equal(f.base.status, "running");
  });
});

test("failed fork restores the existing base without retrying", async () => {
  const f = fixture();
  let forks = 0;
  f.base.fork = async () => { forks++; throw new Error("ambiguous fork timeout"); };
  await withClient(f.base, async () => {
    await assert.rejects(createExperimentSandbox("run-2", new AbortController().signal, () => {}), /ambiguous fork timeout/);
    assert.equal(forks, 1);
    assert.equal(f.base.status, "running");
  });
});

test("open egress aborts setup and pauses the known child", async () => {
  const f = fixture([]);
  const metadata: ExperimentSandboxMetadata[] = [];
  await withClient(f.base, async () => {
    await assert.rejects(createExperimentSandbox("run-3", new AbortController().signal, value => { metadata.push(value); }), /network policy could not be verified/);
    assert.equal(f.base.status, "running");
    assert.equal(f.child.status, "paused");
    assert.deepEqual(metadata.map(value => value.egressRestricted), [false]);
  });
});

test("failed identity persistence still pauses child and restores base", async () => {
  const f = fixture();
  await withClient(f.base, async () => {
    await assert.rejects(createExperimentSandbox("run-4", new AbortController().signal, () => { throw new Error("storage unavailable"); }), /storage unavailable/);
    assert.equal(f.base.status, "running");
    assert.equal(f.child.status, "paused");
  });
});
