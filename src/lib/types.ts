export type RunStatus = "analyzing" | "awaiting_approval" | "queued" | "running" | "repairing" | "completed" | "blocked" | "failed" | "cancelled";
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
  summary?: string;
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
  validationError?: string;
  changeReason?: string;
  provider?: "createos";
  sandboxId?: string;
  codeHash?: string;
  credentialSource?: "stripe_projects" | "custom";
}

export interface ExperimentResult {
  verdict: "partial" | "blocked" | "matched" | "differed";
  summary: string;
  metrics: { name: string; reported?: string; observed: string }[];
  limitations: string[];
}

export interface Run {
  id: string;
  ownerId?: string;
  sourceUrl: string;
  repositoryUrl?: string;
  title: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  paper?: { title: string; url: string; textExcerpt: string; sourceType: string; sourceHash?: string; repositoryHash?: string; textCharacters?: number; textTruncated?: boolean; repositoryCharacters?: number; repositoryTruncated?: boolean };
  claims: Claim[];
  plan?: ExperimentPlan;
  events: RunEvent[];
  attempts: Attempt[];
  result?: ExperimentResult;
  error?: string;
  mode: "live" | "example";
  executionMode?: "automatic";
  workingCode?: { code: string; attempt: number; updatedAt: string };
  repairs?: { afterAttempt: number; diagnosis: string; summary: string; codeHash: string; pythonCode?: string; at: string }[];
  sandbox?: { id: string; forkedFrom?: string; egressRestricted?: boolean; pausedAfterRun?: boolean; releasedAt?: string; poolSlot?: number };
  /** Place in the shared-sandbox queue. Computed when read; never stored. */
  queuePosition?: number;
}

export interface Health {
  riverConfigured: boolean;
  createosConfigured: boolean;
  model: string;
  sandboxId: string;
  sandboxUrl: string;
  authRequired?: boolean;
}
