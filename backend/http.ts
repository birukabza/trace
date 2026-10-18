import type { Run } from "../src/lib/types";
import { PublicRunError } from "../src/lib/server/http";
import type { VerifiedIdentity } from "./auth";

export interface BackendDependencies {
  authenticate(token: string): Promise<VerifiedIdentity | null>;
  authenticationConfigured?: boolean;
  configuration(): unknown;
  listRuns(userId: string): Run[];
  getRun(id: string, userId: string): Run | undefined;
  createRun(input: Record<string, unknown>, userId: string): Run;
  approveRun(id: string, input: Record<string, unknown>, userId: string): Run;
  cancelRun(id: string, userId: string): Run;
  markdownReport(run: Run): string;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const JSON_LIMIT = 16_384;
export async function readBoundedJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new HttpError(415, "Expected application/json.");
  if (Number(request.headers.get("content-length")) > JSON_LIMIT) throw new HttpError(413, "Request is too large.");
  if (!request.body) throw new HttpError(400, "Expected a JSON object.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > JSON_LIMIT) throw new HttpError(413, "Request is too large.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "Expected valid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Expected a JSON object.");
  return value as Record<string, unknown>;
}

function runEvents(request: Request, id: string, userId: string, dependencies: BackendDependencies) {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let cancelStream: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const finish = (closeController: boolean) => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearTimeout(deadline);
        request.signal.removeEventListener("abort", close);
        if (closeController) controller.close();
      };
      const close = () => finish(true);
      cancelStream = () => finish(false);
      let last = "";
      const send = () => {
        if (closed) return;
        const run = dependencies.getRun(id, userId);
        const value = JSON.stringify(run ?? null);
        controller.enqueue(encoder.encode(value === last ? ": heartbeat\n\n" : `event: run\ndata: ${value}\n\n`));
        last = value;
        if (!run || ["completed", "failed", "blocked", "cancelled", "awaiting_approval"].includes(run.status)) close();
      };
      timer = setInterval(send, 1500);
      deadline = setTimeout(close, 5 * 60_000);
      request.signal.addEventListener("abort", close, { once: true });
      if (request.signal.aborted) close(); else send();
    },
    cancel() { cancelStream?.(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}

export function createBackendHandler(dependencies: BackendDependencies, frontendUrl?: string) {
  const allowedOrigin = frontendUrl ? new URL(frontendUrl).origin : undefined;
  return async (request: Request): Promise<Response> => {
    let response: Response;
    try {
      const { pathname } = new URL(request.url);
      if (pathname === "/healthz" && request.method === "GET") return secure(Response.json({ ok: true }));
      // Browsers use the authenticated Next.js proxy. Server-to-server requests
      // have no Origin; a supplied Origin must match the configured frontend.
      const origin = request.headers.get("origin");
      if (origin && origin !== allowedOrigin) throw new HttpError(403, "Origin is not allowed.");
      if (dependencies.authenticationConfigured === false) throw new HttpError(503, "Sign-in is not configured on the backend.");
      const authorization = request.headers.get("authorization");
      const match = authorization?.match(/^Bearer ([^\s]+)$/i);
      if (!match) throw new HttpError(401, "Sign in to continue.");
      const user = await dependencies.authenticate(match[1]);
      if (!user?.id || !user.emailConfirmedAt) throw new HttpError(401, "Sign in with a confirmed email to continue.");

      if (pathname === "/api/health" && request.method === "GET") response = Response.json(dependencies.configuration());
      else if (pathname === "/api/runs" && request.method === "GET") response = Response.json({ runs: dependencies.listRuns(user.id) });
      else if (pathname === "/api/runs" && request.method === "POST") response = Response.json(dependencies.createRun(await readBoundedJson(request), user.id), { status: 201 });
      else {
        const route = pathname.match(/^\/api\/runs\/([a-zA-Z0-9_-]{1,128})(?:\/(approve|cancel|report|events))?$/);
        if (!route) throw new HttpError(404, "Not found.");
        const [, id, action] = route;
        const run = dependencies.getRun(id, user.id);
        if (!run) throw new HttpError(404, "Run not found.");
        if (!action && request.method === "GET") response = Response.json(run);
        else if (action === "approve" && request.method === "POST") response = Response.json(dependencies.approveRun(id, await readBoundedJson(request), user.id));
        else if (action === "cancel" && request.method === "POST") response = Response.json(dependencies.cancelRun(id, user.id));
        else if (action === "report" && request.method === "GET") response = new Response(dependencies.markdownReport(run), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="trace-${id}.md"` } });
        else if (action === "events" && request.method === "GET") response = runEvents(request, id, user.id, dependencies);
        else throw new HttpError(405, "Method is not allowed.");
      }
    } catch (error) {
      // Do not expose provider responses, bearer tokens, stack traces or secrets.
      const safe = error instanceof HttpError || error instanceof PublicRunError;
      const status = safe ? error.status : error instanceof Error && error.name === "ZodError" ? 400 : 500;
      const message = safe ? error.message : "The request could not be completed. Check your input and try again.";
      response = Response.json({ error: message }, { status });
    }
    return secure(response);
  };
}

function secure(response: Response) {
  response.headers.set("Cache-Control", response.headers.get("Content-Type")?.includes("text/event-stream") ? "no-store, no-transform" : "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
