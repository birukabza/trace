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
  /** Real datasets the experiment needs, with search terms and links from the paper. */
  datasets?: DatasetRequest[];
}

export interface DatasetRequest {
  name: string;
  purpose: string;
  /** Search terms, such as "mnist_784" or "CIFAR-10". */
  queries: string[];
  /** Links the paper or its repository gives for the data. */
  urls: string[];
}

/** One file chosen for an experiment, fetched into the sandbox by trusted code. */
export interface DatasetFile {
  dataset: string;
  source: "openml" | "huggingface" | "github" | "zenodo" | "url";
  title: string;
  /** Page a person can open to see where the data came from. */
  pageUrl: string;
  /** Exact file downloaded. */
  url: string;
  filename: string;
  bytes?: number;
  /** Path the experiment reads, relative to its folder, such as data/mnist/train.parquet. */
  link?: string;
  sha256?: string;
}

export interface RunDatasets {
  selected: DatasetFile[];
  unavailable: { dataset: string; reason: string }[];
  /** Text description of the fetched files given to the agent. */
  manifest?: string;
  /** True once the agent has rewritten its code against the fetched files. */
  codeWritten?: boolean;
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
  /** Paper-versus-measured checks decided by fixed rules, not by the model. */
  comparisons?: import("./comparisons").Comparison[];
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
  datasets?: RunDatasets;
  /** Machine-readable failure reason, such as "river_out_of_credit". */
  errorCode?: string;
  /** Place in the shared-sandbox queue. Computed when read; never stored. */
  queuePosition?: number;
}

export interface Health {
  riverConfigured: boolean;
  riverOutOfCredit?: boolean;
  sandboxConfigured: boolean;
  model: string;
  authRequired?: boolean;
}
