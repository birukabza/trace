import { createClient } from "@supabase/supabase-js";
import { configuration } from "../src/lib/server/config";
import { approveRun, cancelRun, createRun, getRun, listRuns } from "../src/lib/server/runs";
import { pdfReport } from "../src/lib/server/pdf-report";
import { createBackendHandler } from "./http";
import { tokenAuthenticator } from "./auth";

export function backendHandler() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const supabase = url && key ? createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch(input, init) {
        return fetch(input, { ...init, signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(init?.signal ? [init.signal] : [])]) });
      },
    },
  }) : undefined;
  return createBackendHandler({
    authenticationConfigured: Boolean(supabase),
    authenticate: supabase ? tokenAuthenticator(supabase) : async () => null,
    configuration, approveRun, cancelRun, createRun, getRun, listRuns, pdfReport,
  }, process.env.FRONTEND_URL);
}
