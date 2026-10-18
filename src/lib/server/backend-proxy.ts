import { createClient } from "../supabase/server";
import { readJson, requireSameOrigin } from "./http";

export async function proxyBackend(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (request.method !== "GET") requireSameOrigin(request);
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.email_confirmed_at) return Response.json({ error: "Sign in with a confirmed email to continue." }, { status: 401, headers });
    // Identity was verified above. The cookie session is used only to retrieve
    // the access token that Railway independently verifies.
    const { data: { session } } = await client.auth.getSession();
    if (!session || session.user.id !== user.id) return Response.json({ error: "Sign in to continue." }, { status: 401, headers });
    const configured = process.env.TRACE_BACKEND_URL || (process.env.NODE_ENV === "development" ? "http://127.0.0.1:4000" : undefined);
    if (!configured) return Response.json({ error: "The research backend is not configured." }, { status: 503, headers });
    const base = new URL(configured);
    if (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname))) throw new Error("Invalid backend configuration.");
    const incoming = new URL(request.url);
    const target = new URL(incoming.pathname, base);
    const body = request.method === "GET" ? undefined : JSON.stringify(await readJson(request));
    const response = await fetch(target, {
      method: request.method, body, cache: "no-store", redirect: "error",
      headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]),
    });
    const outgoing = new Headers(headers);
    for (const name of ["content-type", "content-disposition", "x-accel-buffering"]) {
      const value = response.headers.get(name); if (value) outgoing.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch (error) {
    if (error instanceof Error && /Cross-origin writes|Request is too large|Expected a JSON object/.test(error.message)) return Response.json({ error: error.message }, { status: 400, headers });
    return Response.json({ error: "The research service is unavailable. Please try again shortly." }, { status: 503, headers });
  }
}
