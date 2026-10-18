export function parseMeasurements(stdout: string): Record<string, unknown> | undefined {
  for (const candidate of [stdout.trim(), ...stdout.trim().split("\n").reverse()]) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (!parsed || typeof parsed !== "object" || !("metrics" in parsed)) continue;
      const values = parsed.metrics;
      if (values && typeof values === "object" && !Array.isArray(values) && Object.keys(values).length > 0) return values as Record<string, unknown>;
    } catch { /* Non-JSON progress lines are not measurement evidence. */ }
  }
}

export function measurementFeedback(stdout: string): string | undefined {
  if (parseMeasurements(stdout)) return;
  return 'Measurement output validation failed: stdout must contain a JSON object with a nonempty "metrics" object. Preserve the experiment, seeds, data, metric names and computed values; correct only their JSON serialization. A process exiting 0 without this output contract is not a completed experiment.';
}
