import { RESEARCH_LIMITS } from "../capabilities";
export const MODEL = "zai-org/GLM-5.3-Flash";
export const SANDBOX_ID = process.env.CREATEOS_SANDBOX_ID || "sb-01m55qb3gva6rqykqgn42t091q";
export const SANDBOX_URL = "https://api-eu.sb.createos.sh";

export function riverKey(): string | undefined {
  return process.env.RIVER_API_KEY?.trim() || undefined;
}

export function createosKey(): string | undefined {
  return process.env.CREATEOS_SANDBOX_API_KEY || process.env.CREATEOS_PROJECT_API_KEY;
}

export function createosCredentialSource(): "stripe_projects" | "custom" {
  return process.env.CREATEOS_SANDBOX_API_KEY ? "custom" : "stripe_projects";
}

export function configuration() {
  return { riverConfigured: Boolean(riverKey()), createosConfigured: Boolean(createosKey()), model: MODEL, sandboxRegion: "eu", sandboxId: SANDBOX_ID, sandboxUrl: SANDBOX_URL, authentication: "supabase-email-password", executionLimitSeconds: RESEARCH_LIMITS.executionSeconds };
}
