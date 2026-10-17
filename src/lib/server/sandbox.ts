import { CreateosSandboxClient } from "@nodeops-createos/sandbox";
import { createosKey, SANDBOX_ID, SANDBOX_URL } from "./config";

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

export async function executeNumerical(code: string, runId: string, attempt: number, signal: AbortSignal) {
  const key = createosKey();
  if (!key) throw new Error("CreateOS credentials are unavailable. Run stripe projects env --pull and restart the server.");
  const client = new CreateosSandboxClient({ apiKey: key, baseUrl: SANDBOX_URL, timeoutMs: 75_000, retry: false });
  const box = await client.getSandbox(SANDBOX_ID, { signal, timeoutMs: 15_000 });
  if (box.status !== "running") throw new Error("The hackathon sandbox is not running. Resume it in CreateOS, then start a new run.");
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
