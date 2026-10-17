export type RunStatus = "analyzing" | "awaiting_approval" | "queued" | "running" | "completed" | "blocked" | "failed" | "cancelled";
export type ExperimentScope = "component_check" | "reduced_experiment" | "reproduction";

export interface Claim {
  id: string;
  text: string;
  sourceLocation: string;
  evidenceQuote?: string;
  reportedValue?: string;
  metric?: string;
  feasible: boolean;
  reason: string;
}

export interface ExperimentPlan {
  claimId: string;
  title: string;
  hypothesis: string;
  method: string;
  dataset: string;
  metrics: string[];
  dependencies: string[];
  estimatedSeconds: number;
  limitations: string[];
  pythonCode: string;
  scope: ExperimentScope;
}

export interface RunEvent {
  id: string;
  at: string;
  stage: string;
  message: string;
}

export interface Attempt {
  number: number;
  code: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  changeReason?: string;
}

export interface ExperimentResult {
  verdict: "partial" | "blocked" | "matched" | "differed";
  summary: string;
  metrics: { name: string; reported?: string; observed: string }[];
  limitations: string[];
}

export interface Run {
  id: string;
  sourceUrl: string;
  repositoryUrl?: string;
  title: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  paper?: { title: string; url: string; textExcerpt: string; sourceType: string; sourceHash?: string; repositoryHash?: string };
  claims: Claim[];
  plan?: ExperimentPlan;
  events: RunEvent[];
  attempts: Attempt[];
  result?: ExperimentResult;
  error?: string;
  mode: "live" | "example";
}

export interface Health {
  riverConfigured: boolean;
  createosConfigured: boolean;
  model: string;
  sandboxId: string;
  sandboxUrl: string;
  authRequired?: boolean;
}
