export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") throw new Error("Cross-origin writes are not allowed.");
  if (origin) {
    const caller = new URL(origin);
    const server = new URL(request.url);
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    const localAlias = loopback.has(caller.hostname) && loopback.has(server.hostname)
      && caller.port === server.port && caller.protocol === server.protocol;
    if (caller.origin !== server.origin && !localAlias) throw new Error("Cross-origin writes are not allowed.");
  }
}

export function errorResponse(error: unknown, status = 400) {
  return Response.json({ error: error instanceof Error ? error.message : "Request failed." }, { status });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > 16_384) throw new Error("Request is too large.");
  if (!request.body) throw new Error("Expected a JSON object.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16_384) throw new Error("Request is too large.");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object.");
  return value;
}
