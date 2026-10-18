"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfiguration } from "./config";

export function createClient() {
  const config = supabaseConfiguration();
  if (!config) throw new Error("Sign-in is not configured yet.");
  return createBrowserClient(config.url, config.key);
}
