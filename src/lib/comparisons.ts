// Compares numbers the paper reports with numbers the experiment measured.
// The decision is made here by fixed rules, never by the model, so a match
// cannot be talked into existence.

export type Comparison = {
  item: string;
  reported: number;
  measured: number;
  difference: number;
  tolerance: number;
  outcome: "matched" | "differed";
  note?: string;
};

const NAME_KEYS = ["item", "name", "method", "model", "classifier", "algorithm", "setting", "metric", "config", "dataset"];

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
}

function decimals(value: number) {
  const text = String(value);
  if (/e/i.test(text)) return 6;
  return text.includes(".") ? text.split(".")[1].length : 0;
}

/**
 * The agent may propose a tolerance, but it is bounded: never tighter than the
 * paper's printed precision and never looser than 3% of the reported value
 * (or one unit of its last printed digit, if that is larger).
 */
export function boundedTolerance(reported: number, proposed?: number) {
  const unit = 10 ** -decimals(reported);
  const floor = unit / 2;
  const ceiling = Math.max(Math.abs(reported) * 0.03, unit);
  const fallback = Math.max(Math.abs(reported) * 0.01, unit);
  const chosen = proposed !== undefined && Number.isFinite(proposed) && proposed >= 0 ? proposed : fallback;
  return Math.min(Math.max(chosen, floor), ceiling);
}

function nameOf(row: Record<string, unknown>, fallback: string) {
  const parts = NAME_KEYS.map(key => row[key]).filter(value => typeof value === "string" || typeof value === "number").slice(0, 2);
  return parts.length ? parts.join(" · ") : fallback;
}

/** Finds a measured value that pairs with a reported_* key in the same row. */
function pairs(row: Record<string, unknown>) {
  const found: { label?: string; reported: number; measured: number; tolerance?: number }[] = [];
  const tolerance = toNumber(row.tolerance);
  for (const key of Object.keys(row)) {
    const match = key.match(/^(?:paper_|reported_?)(.*)$/i);
    if (!match) continue;
    const reported = toNumber(row[key]);
    if (reported === undefined) continue;
    const rest = match[1].replace(/^_/, "");
    const candidates = rest
      ? [`measured_${rest}`, `observed_${rest}`, `mean_${rest}`, `our_${rest}`, rest, "measured", "observed"]
      : ["measured", "observed", "value", "mean"];
    const measuredKey = candidates.find(candidate => toNumber(row[candidate]) !== undefined);
    if (!measuredKey) continue;
    found.push({ label: rest || undefined, reported, measured: toNumber(row[measuredKey])!, tolerance });
  }
  return found;
}

/** Extracts paper-versus-measured comparisons from a run's metrics object. */
export function extractComparisons(metrics: Record<string, unknown> | undefined): Comparison[] {
  if (!metrics) return [];
  const results: Comparison[] = [];
  const add = (item: string, reported: number, measured: number, proposed?: number, note?: string) => {
    const tolerance = boundedTolerance(reported, proposed);
    const difference = measured - reported;
    results.push({ item, reported, measured, difference, tolerance, outcome: Math.abs(difference) <= tolerance + 1e-12 ? "matched" : "differed", note });
  };
  for (const [metricName, value] of Object.entries(metrics)) {
    if (!Array.isArray(value)) continue;
    value.forEach((row, index) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return;
      const record = row as Record<string, unknown>;
      for (const pair of pairs(record)) {
        const base = nameOf(record, `${metricName} ${index + 1}`);
        add(pair.label && !["accuracy", "value"].includes(pair.label) ? `${base} · ${pair.label.replaceAll("_", " ")}` : base, pair.reported, pair.measured, pair.tolerance, typeof record.tolerance_reason === "string" ? record.tolerance_reason.slice(0, 200) : undefined);
      }
    });
  }
  return results.slice(0, 50);
}

/** Overall verdict from comparisons; undefined when nothing was compared. */
export function comparisonVerdict(comparisons: Comparison[]): "matched" | "differed" | undefined {
  if (!comparisons.length) return;
  return comparisons.every(item => item.outcome === "matched") ? "matched" : "differed";
}
