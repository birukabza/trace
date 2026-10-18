import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfiguration } from "./config";

export type AccountProfile = { id: string; email?: string; displayName?: string };

export async function createClient() {
  const configuration = supabaseConfiguration();
  if (!configuration) throw new Error("Sign-in is not configured yet.");
  const cookieStore = await cookies();
  return createServerClient(configuration.url, configuration.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Server Components cannot set cookies. Proxy refreshes the session. */ }
      },
    },
  });
}

export async function getAuthenticatedUser(): Promise<AccountProfile | null> {
  if (!supabaseConfiguration()) return null;
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user || !user.email_confirmed_at) return null;
    const displayName = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim().slice(0, 80) : undefined;
    return { id: user.id, email: user.email, displayName: displayName || undefined };
  } catch { return null; }
}
