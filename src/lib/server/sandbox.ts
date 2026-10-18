import { CreateosSandboxClient, type Sandbox } from "@nodeops-createos/sandbox";
import { createosKey, SANDBOX_ID, SANDBOX_URL } from "./config";

// An empty CreateOS allowlist means OPEN egress. A single reserved TEST-NET
// address keeps the host policy restrictive without exposing package registries.
// This is restricted external egress, not a provider-supported deny-all token.
const EXPERIMENT_EGRESS = ["192.0.2.1:443"];
const CONTROL_REQUEST = { timeoutMs: 30_000, retry: false } as const;
const CONTROL_WAIT = { timeoutMs: 180_000, request: { timeoutMs: 10_000, retry: false } } as const;

export interface ExperimentSandboxMetadata {
  id: string;
  forkedFrom: string;
  egressRestricted: boolean;
}

export interface ExperimentSandboxSession {
  id: string;
  egressRestricted: boolean;
  pause(): Promise<void>;
  resume(): Promise<void>;
}

function sandboxClient() {
  const key = createosKey();
  if (!key) throw new Error("CreateOS credentials are unavailable. Run stripe projects env --pull and restart the server.");
  return new CreateosSandboxClient({ apiKey: key, baseUrl: SANDBOX_URL, timeoutMs: 30_000, retry: false });
}

async function pauseWorkspace(box: Sandbox): Promise<void> {
  // Deliberately independent of the run's AbortSignal: cancellation must still
  // stop compute, including when setup failed before a session was returned.
  await box.refresh(CONTROL_REQUEST);
  if (box.status === "forking") await box.waitUntilPaused(CONTROL_WAIT);
  if (box.status === "resuming" || box.status === "creating") await box.waitUntilRunning(CONTROL_WAIT);
  if (box.status === "running") await box.pause(CONTROL_REQUEST);
  if (box.status === "pausing") await box.waitUntilPaused(CONTROL_WAIT);
  if (box.status !== "paused") throw new Error(`Could not pause experiment workspace ${box.id}: ${box.status}.`);
}

export async function pauseExperimentSandbox(id: string): Promise<void> {
  if (id === SANDBOX_ID) throw new Error("Recovery cannot pause the base workspace.");
  const box = await sandboxClient().getSandbox(id, CONTROL_REQUEST);
  await pauseWorkspace(box);
}

export function isSandboxQuotaError(error: unknown): boolean {
  return error instanceof Error && "statusCode" in error && error.statusCode === 429 && /sandbox concurrent quota reached/i.test(error.message);
}

export async function releaseExperimentSandbox(id: string, forkedFrom: string): Promise<void> {
  if (id === SANDBOX_ID || forkedFrom !== SANDBOX_ID) throw new Error("Only this app’s experiment forks can be released.");
  const box = await sandboxClient().getSandbox(id, CONTROL_REQUEST);
  if (box.status === "destroyed") return;
  if (box.status !== "paused" || box.data.forked_from !== forkedFrom || !box.data.envs?.includes("TRACE_EXPERIMENT_ID")) throw new Error("The old workspace could not be confirmed as a paused Trace experiment fork.");
  await box.destroy(CONTROL_REQUEST);
  await box.waitUntilDestroyed(CONTROL_WAIT);
}

async function resumeWorkspace(box: Sandbox, signal?: AbortSignal): Promise<void> {
  const request = { ...CONTROL_REQUEST, signal };
  const wait = { ...CONTROL_WAIT, signal };
  await box.refresh(request);
  if (box.status === "forking" || box.status === "pausing") await box.waitUntilPaused(wait);
  if (box.status === "paused" || box.status === "error") await box.resume(request);
  if (box.status !== "running") await box.waitUntilRunning(wait);
}

export async function createExperimentSandbox(
  runId: string,
  signal: AbortSignal,
  onCreated: (metadata: ExperimentSandboxMetadata) => void | Promise<void>,
  onProgress: (message: string) => void | Promise<void> = () => {},
): Promise<ExperimentSandboxSession> {
  const client = sandboxClient();
  const request = { ...CONTROL_REQUEST, signal };
  const wait = { ...CONTROL_WAIT, signal };
  await onProgress("Connecting to the CreateOS workspace.");
  const base = await client.getSandbox(SANDBOX_ID, request);
  const restoreBase = base.status === "running" || base.status === "resuming";
  let child: Sandbox | undefined;

  try {
    await onProgress("Preparing the base workspace for an isolated fork.");
    if (base.status === "resuming") await base.waitUntilRunning(wait);
    if (base.status === "running") await base.pause(request);
    if (base.status !== "paused") await base.waitUntilPaused(wait);
    await onProgress("Creating an isolated copy of the workspace.");
    child = await base.fork({
      start_paused: true,
      ingress_enabled: false,
      egress: EXPERIMENT_EGRESS,
      // A nonempty map replaces inherited declared environment variables.
      // The base snapshot itself must contain no credentials or secret files.
      envs: { TRACE_EXPERIMENT_ID: runId },
    }, request);
    // Persist before polling: a crash or cancellation must leave an identity
    // that recovery can find. Never blindly retry an ambiguous fork request.
    await onCreated({ id: child.id, forkedFrom: base.id, egressRestricted: false });
    await onProgress("The fork was created. Waiting for its Python runtime to be ready.");
    await child.waitUntilPaused(wait);

    await onProgress("Starting the experiment workspace.");
    await resumeWorkspace(child, signal);
    await child.setAutoPause(300, request);
    await onProgress("Checking the experiment workspace’s network restrictions.");
    const policy = await child.getEgress(request);
    if (policy.egress.length !== EXPERIMENT_EGRESS.length ||
      !EXPERIMENT_EGRESS.every(rule => policy.egress.includes(rule))) {
      throw new Error("The experiment workspace network policy could not be verified. No experiment was executed.");
    }
    await onCreated({ id: child.id, forkedFrom: base.id, egressRestricted: true });
    const sessionBox = child;
    return {
      id: child.id,
      egressRestricted: true,
      pause: async () => {
        try { await pauseWorkspace(sessionBox); }
        finally { if (restoreBase) await resumeWorkspace(base); }
      },
      resume: () => resumeWorkspace(sessionBox, signal),
    };
  } catch (error) {
    try { if (child) {
      try { await pauseWorkspace(child); }
      catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Experiment setup failed and its workspace could not be confirmed paused.");
      }
    } } finally { if (restoreBase) await resumeWorkspace(base); }
    throw error;
  }
}

export function numericalRunner(code: string): string {
  const encoded = Buffer.from(code, "utf8").toString("base64");
  return `import ast, base64, builtins, sys, resource, signal
resource.setrlimit(resource.RLIMIT_CPU, (55, 56))
resource.setrlimit(resource.RLIMIT_AS, (3 * 1024**3, 3 * 1024**3))
signal.alarm(60)
code = base64.b64decode('${encoded}').decode('utf8')
tree = ast.parse(code)
modules = {'numpy', 'math', 'statistics', 'random', 'json', 'itertools', 'collections', 'functools', 'decimal', 'fractions', 'time'}
attributes = set('array asarray arange linspace zeros ones empty full eye identity zeros_like ones_like empty_like copy reshape shape ndim size dtype astype flatten ravel transpose T dot matmul einsum sum mean std var min max argmin argmax abs absolute sqrt square power exp log log2 log10 sin cos tan pi e inf nan isfinite isnan all any allclose isclose clip maximum minimum where select stack vstack hstack column_stack concatenate split array_split take repeat tile broadcast_to unique sort argsort cumsum cumprod diff round floor ceil sign prod median percentile quantile count_nonzero nonzero norm linalg random default_rng normal uniform integers choice permutation shuffle seed RandomState Random multivariate_normal binomial poisson exponential randint random_sample randn rand Generator default_rng standard_normal set_printoptions tolist item append extend insert pop remove keys values items get update setdefault dumps loads Counter defaultdict deque combinations product permutations islice reduce partial factorial comb gamma erf log1p expm1 copysign dist hypot fsum isinf isfinite median mean stdev pstdev variance pvariance perf_counter time sleep Decimal Fraction getcontext precision dtype float64 float32 int64 int32 bool_ integer floating number ndarray bool float int real imag nbytes newaxis finfo eps bincount divide multiply add subtract true_divide outer inner trace diag diagonal solve svd eig eigh det inv lstsq qr cholesky cov corrcoef meshgrid histogram histogram2d unravel_index put_along_axis take_along_axis flat vectorize'.split())
for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        if any(n.name not in modules for n in node.names): raise ValueError('Only approved numerical modules are allowed')
    if isinstance(node, ast.ImportFrom):
        if node.module not in modules or node.level or any(n.name not in attributes or n.name == '*' for n in node.names): raise ValueError('Import is outside the numerical policy')
    if isinstance(node, ast.Attribute) and node.attr not in attributes: raise ValueError('Attribute outside numerical policy: ' + node.attr)
    if isinstance(node, ast.Name) and node.id.startswith('__') and node.id != '__name__': raise ValueError('Private names are not allowed')
    if isinstance(node, (ast.ClassDef, ast.Global, ast.Nonlocal)): raise ValueError('This syntax is outside the numerical policy')
safe_names = 'abs all any bool dict enumerate filter float int isinstance issubclass len list map max min next object pow print range reversed round set slice sorted str sum tuple zip Exception ValueError TypeError RuntimeError AssertionError IndexError KeyError StopIteration NotImplementedError ArithmeticError ZeroDivisionError'.split()
safe = {name: getattr(builtins, name) for name in safe_names}
def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    if (name not in modules and name != 'numpy._core._methods') or level: raise ImportError('Module is not allowed: ' + name)
    return builtins.__import__(name, globals, locals, fromlist, level)
safe['__import__'] = safe_import
class LimitedOutput:
    def __init__(self, target): self.target, self.remaining = target, 32000
    def write(self, value):
        if self.remaining <= 0: raise RuntimeError('Output limit reached')
        value = value[:self.remaining]
        self.remaining -= len(value)
        return self.target.write(value)
    def flush(self): self.target.flush()
sys.stdout = LimitedOutput(sys.stdout)
sys.stderr = LimitedOutput(sys.stderr)
exec(compile(tree, '<approved-experiment>', 'exec'), {'__builtins__': safe, '__name__': '__main__'})
`;
}

export async function executeNumerical(code: string, runId: string, attempt: number, signal: AbortSignal, sandboxId = SANDBOX_ID) {
  const key = createosKey();
  if (!key) throw new Error("CreateOS credentials are unavailable. Run stripe projects env --pull and restart the server.");
  const client = new CreateosSandboxClient({ apiKey: key, baseUrl: SANDBOX_URL, timeoutMs: 75_000, retry: false });
  const box = await client.getSandbox(sandboxId, { signal, timeoutMs: 15_000 });
  if (box.status !== "running") throw new Error("The experiment workspace is not running. Resume it in CreateOS, then retry the investigation.");
  const path = `/tmp/repro-${runId}-${attempt}.py`;
  await box.files.upload(path, numericalRunner(code), { signal, timeoutMs: 15_000 });
  const started = Date.now();
  let confirmedFinished = false;
  try {
    const { result } = await box.runCommand("env", ["-i", "PATH=/usr/local/bin:/usr/bin:/bin", "OPENBLAS_NUM_THREADS=1", "OMP_NUM_THREADS=1", "timeout", "--signal=TERM", "--kill-after=3", "60", "python3", "-I", path], { signal, timeoutMs: 70_000 });
    confirmedFinished = true;
    return { stdout: result.stdout.slice(0, 32_000), stderr: (result.error ? `${result.stderr}\nSandbox agent error: ${result.error}` : result.stderr).slice(0, 32_000), exitCode: result.error ? -1 : result.exit_code, durationMs: Date.now() - started };
  } finally {
    if (!confirmedFinished) await holdExecutionLease(started);
  }
}

export async function holdExecutionLease(started: number, now = Date.now(), wait = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds))) {
  // Aborting HTTP does not confirm that the remote process stopped. Keep this sandbox's queue leased until its process deadline.
  const remaining = Math.max(0, started + 65_000 - now);
  if (remaining) await wait(remaining);
}

// ---------------------------------------------------------------------------
// Shared worker pool. A fixed number of long-lived forks of the base sandbox
// run every experiment, so the CreateOS quota never grows with traffic.
// Each run writes only its own /tmp/repro-<run>-<attempt>.py file, and the
// numerical policy forbids file and process access, so runs cannot read or
// change each other's data.
// ---------------------------------------------------------------------------

export const POOL_SIZE = Math.min(5, Math.max(1, Number(process.env.TRACE_SANDBOX_POOL_SIZE) || 3));
const poolMarker = (slot: number) => `TRACE_POOL_SLOT_${slot}`;
const LIVE_STATUSES = new Set(["creating", "forking", "running", "resuming", "pausing", "paused"]);

async function findPoolSandbox(client: CreateosSandboxClient, slot: number, knownId: string | undefined, signal: AbortSignal): Promise<Sandbox | undefined> {
  const request = { ...CONTROL_REQUEST, signal };
  if (knownId) {
    try {
      const box = await client.getSandbox(knownId, request);
      if (LIVE_STATUSES.has(box.status) && box.data.forked_from === SANDBOX_ID && box.data.envs?.includes(poolMarker(slot))) return box;
    } catch { /* Fall back to discovery below. */ }
  }
  const boxes = await client.listSandboxes(request);
  return boxes.find(box => LIVE_STATUSES.has(box.status) && box.data.forked_from === SANDBOX_ID && box.data.envs?.includes(poolMarker(slot)));
}

/** Destroys per-run forks left by the previous one-fork-per-run design. They hold CreateOS capacity the pool needs. */
export async function releaseLegacyForks(signal: AbortSignal): Promise<number> {
  const client = sandboxClient();
  const request = { ...CONTROL_REQUEST, signal };
  const boxes = await client.listSandboxes(request);
  let released = 0;
  for (const box of boxes) {
    if (box.id === SANDBOX_ID || !LIVE_STATUSES.has(box.status) || box.data.forked_from !== SANDBOX_ID) continue;
    if (!box.data.envs?.includes("TRACE_EXPERIMENT_ID")) continue;
    await box.destroy(request);
    await box.waitUntilDestroyed({ ...CONTROL_WAIT, signal });
    released++;
  }
  return released;
}

async function forkPoolSandbox(client: CreateosSandboxClient, slot: number, signal: AbortSignal, onProgress: (message: string) => void | Promise<void>): Promise<Sandbox> {
  const request = { ...CONTROL_REQUEST, signal };
  const wait = { ...CONTROL_WAIT, signal };
  const base = await client.getSandbox(SANDBOX_ID, request);
  const restoreBase = base.status === "running" || base.status === "resuming";
  try {
    await onProgress(`Creating shared sandbox ${slot}. This happens once and takes about a minute.`);
    if (base.status === "resuming") await base.waitUntilRunning(wait);
    if (base.status === "running") await base.pause(request);
    if (base.status !== "paused") await base.waitUntilPaused(wait);
    const fork = () => base.fork({ start_paused: true, ingress_enabled: false, egress: EXPERIMENT_EGRESS, envs: { [poolMarker(slot)]: "1" } }, request);
    let child: Sandbox;
    try { child = await fork(); }
    catch (error) {
      if (!isSandboxQuotaError(error)) throw error;
      await onProgress("CreateOS capacity is full. Releasing old per-run workspaces from the previous version.");
      if (!(await releaseLegacyForks(signal))) throw new Error("CreateOS capacity is full and no old Trace workspace could be released. Free a sandbox in CreateOS or lower TRACE_SANDBOX_POOL_SIZE.");
      child = await fork();
    }
    await child.waitUntilPaused(wait);
    return child;
  } finally { if (restoreBase) await resumeWorkspace(base); }
}

/** Returns a running, egress-verified pool sandbox for the slot, creating it if needed. */
export async function preparePoolSandbox(slot: number, knownId: string | undefined, signal: AbortSignal, onProgress: (message: string) => void | Promise<void> = () => {}): Promise<{ id: string; forkedFrom: string }> {
  const client = sandboxClient();
  const request = { ...CONTROL_REQUEST, signal };
  try { if (await releaseLegacyForks(signal)) await onProgress("Released old per-run workspaces from the previous version."); }
  catch { /* Best effort; the fork path retries on a quota error. */ }
  let box = await findPoolSandbox(client, slot, knownId, signal);
  if (!box) box = await forkPoolSandbox(client, slot, signal, onProgress);
  await onProgress(`Starting shared sandbox ${slot}.`);
  await resumeWorkspace(box, signal);
  await box.setAutoPause(300, request);
  const policy = await box.getEgress(request);
  if (policy.egress.length !== EXPERIMENT_EGRESS.length || !EXPERIMENT_EGRESS.every(rule => policy.egress.includes(rule))) {
    throw new Error("The shared sandbox network policy could not be verified. No experiment was executed.");
  }
  return { id: box.id, forkedFrom: SANDBOX_ID };
}

/** Removes a finished run's script files. Best effort; files are tiny and uniquely named. */
export async function cleanupRunFiles(sandboxId: string, runId: string): Promise<void> {
  const key = createosKey();
  if (!key || !/^[0-9a-f-]{36}$/.test(runId)) return;
  const client = new CreateosSandboxClient({ apiKey: key, baseUrl: SANDBOX_URL, timeoutMs: 20_000, retry: false });
  const box = await client.getSandbox(sandboxId, CONTROL_REQUEST);
  if (box.status !== "running") return;
  await box.runCommand("sh", ["-c", `rm -f /tmp/repro-${runId}-*.py`], { timeoutMs: 15_000 });
}

/** Makes sure a pool sandbox is running before an attempt; auto-pause may have stopped it during a repair. */
export async function ensurePoolSandboxRunning(id: string, signal: AbortSignal): Promise<void> {
  const box = await sandboxClient().getSandbox(id, { ...CONTROL_REQUEST, signal });
  await resumeWorkspace(box, signal);
}
