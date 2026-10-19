import test from "node:test";
import assert from "node:assert/strict";
import { boundedTolerance, comparisonVerdict, extractComparisons } from "../src/lib/comparisons";

test("rows from the Fashion-MNIST run become per-classifier verdicts", () => {
  const metrics = { accuracy_vs_reported_table: [
    { method: "GaussianNB", reported_accuracy: 0.511, mean_accuracy: 0.5821 },
    { method: "LinearSVC_hinge_C1", reported_accuracy: 0.836, mean_accuracy: 0.8312 },
    { method: "LogisticRegression_ovr_C1_l2", reported_accuracy: 0.841, mean_accuracy: 0.8328, tolerance: 0.01, tolerance_reason: "20k subsample" },
    { method: "RandomForest", reported_accuracy: 0.873, mean_accuracy: 0.8632, tolerance: 0.01 },
  ] };
  const comparisons = extractComparisons(metrics);
  assert.deepEqual(comparisons.map(item => [item.item, item.outcome]), [
    ["GaussianNB", "differed"],
    ["LinearSVC_hinge_C1", "matched"],
    ["LogisticRegression_ovr_C1_l2", "matched"],
    ["RandomForest", "matched"],
  ]);
  assert.equal(comparisons[2].note, "20k subsample");
  assert.equal(comparisonVerdict(comparisons), "differed");
});

test("the agent cannot widen the tolerance beyond 3% of the reported value", () => {
  assert.equal(boundedTolerance(0.511, 0.5), 0.511 * 0.03);
  const [row] = extractComparisons({ table: [{ name: "x", reported: 0.511, measured: 0.58, tolerance: 1 }] });
  assert.equal(row.outcome, "differed");
});

test("the tolerance is never tighter than the paper's printed precision", () => {
  assert.equal(boundedTolerance(92, 0), 0.5);
  assert.equal(extractComparisons({ t: [{ item: "acc", reported: 92, measured: 92.4, tolerance: 0 }] })[0].outcome, "matched");
});

test("explicit comparison tables and plain metrics are handled; nothing compared means no verdict", () => {
  const comparisons = extractComparisons({ comparisons: [{ item: "Top-1", reported: 76.1, measured: 75.9, tolerance: 0.5 }], loss: 0.3, note: "x" });
  assert.equal(comparisons.length, 1);
  assert.equal(comparisonVerdict(comparisons), "matched");
  assert.equal(comparisonVerdict(extractComparisons({ loss: 0.3 })), undefined);
});
