export function supabaseConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function safeNextPath(value: unknown, fallback = "/") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  const path = new URL(value, "https://trace.invalid");
  return path.origin === "https://trace.invalid" && !path.pathname.startsWith("/auth/") && !["/auth", "/login", "/signup"].includes(path.pathname) ? `${path.pathname}${path.search}${path.hash}` : fallback;
}

/** Email links use a configured canonical site; only local development may infer it. */
export function authSiteOrigin(configured: string | undefined, requestOrigin: string | null) {
  const value = configured || requestOrigin;
  if (!value) throw new Error("Set NEXT_PUBLIC_APP_URL to enable account confirmation emails.");
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol) || (url.protocol !== "https:" && !local) || (!configured && !local)) {
    throw new Error("Set NEXT_PUBLIC_APP_URL to a trusted HTTPS frontend URL.");
  }
  return url.origin;
}
