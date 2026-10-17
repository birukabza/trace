export const RESEARCH_LIMITS = {
  sourceBytes: 12_000_000,
  sourceCharacters: 80_000,
  paperWithRepositoryCharacters: 60_000,
  repositoryCharacters: 20_000,
  executionSeconds: 60,
  maxAttempts: 3,
} as const;

export const PROJECT_INTEGRATION = {
  project: "createOs.stripe.hackathon",
  service: "createos-project",
  provider: "CreateOS",
  provisionedThrough: "Stripe Projects",
  verifiedAt: "2026-10-17",
} as const;
