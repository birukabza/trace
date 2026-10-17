import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { numericalRunner } from "../src/lib/server/sandbox";

const posixOnly = process.platform === "win32" ? "Run Python resource-limit checks in WSL." : false;
const execute = (code: string) => spawnSync("python3", ["-I", "-c", numericalRunner(code)], { encoding: "utf8", timeout: 10_000 });

test("the bounded runner executes numerical Python and captures its real output", { skip: posixOnly }, () => {
  const result = execute('import math, json\nprint(json.dumps({"metrics": {"sqrt": math.sqrt(16)}}))');
  assert.equal(result.status, 0, result.stderr || result.error?.message || "Python did not complete.");
  assert.equal(JSON.parse(result.stdout).metrics.sqrt, 4);
});

test("generated Python cannot import system modules or open files", { skip: posixOnly }, () => {
  for (const code of ["import os\nprint(os.getcwd())", 'open("/tmp/trace-forbidden", "w")', "from numpy._core import _methods"]) {
    const result = execute(code);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Only approved numerical modules|not defined|outside the numerical policy/);
    assert.equal(result.stdout, "");
  }
});

test("NumPy reductions can use their internal implementation without exposing it to generated imports", { skip: posixOnly }, context => {
  const probe = spawnSync("python3", ["-c", "import numpy"], { timeout: 10_000 });
  if (probe.status !== 0) { context.skip("NumPy is not installed locally; verify reductions in the CreateOS integration run."); return; }
  const result = execute('import numpy as np, json\nx = np.arange(5)\nprint(json.dumps({"sum": float(x.sum()), "variance": float(x.var())}))');
  assert.equal(result.status, 0, result.stderr || result.error?.message || "Python did not complete.");
  assert.deepEqual(JSON.parse(result.stdout), { sum: 10, variance: 2 });
});
