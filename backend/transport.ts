import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export function createHttpServer(handler: (request: Request) => Promise<Response>) {
  const server = createServer({ maxHeaderSize: 16_384, requestTimeout: 30_000, headersTimeout: 15_000 }, async (incoming, outgoing) => {
    const cancellation = new AbortController();
    outgoing.on("close", () => cancellation.abort());
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
        else if (value !== undefined) headers.set(name, value);
      }
      const method = incoming.method || "GET";
      const request = new Request(new URL(incoming.url || "/", "http://backend"), {
        method, headers, signal: cancellation.signal,
        ...(method === "GET" || method === "HEAD" ? {} : { body: Readable.toWeb(incoming), duplex: "half" }),
      } as RequestInit);
      const response = await handler(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), outgoing);
      else outgoing.end();
    } catch {
      if (!outgoing.headersSent) {
        outgoing.writeHead(500, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        outgoing.end(JSON.stringify({ error: "The server could not complete the request." }));
      } else outgoing.destroy();
    }
  });
  server.keepAliveTimeout = 5000;
  return server;
}
