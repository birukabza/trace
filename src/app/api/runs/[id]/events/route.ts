import { getRun } from "@/lib/server/runs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!getRun(id)) return Response.json({ error: "Run not found." }, { status: 404 });
  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      let last = "";
      const send = () => {
        if (closed) return;
        const run = getRun(id);
        const value = JSON.stringify(run);
        if (value !== last) { controller.enqueue(encoder.encode(`event: run\ndata: ${value}\n\n`)); last = value; }
        else controller.enqueue(encoder.encode(": heartbeat\n\n"));
        if (!run || ["completed", "failed", "blocked", "cancelled", "awaiting_approval"].includes(run.status)) { clearInterval(interval); closed = true; controller.close(); }
      };
      interval = setInterval(send, 1500);
      request.signal.addEventListener("abort", () => { clearInterval(interval); if (!closed) { closed = true; try { controller.close(); } catch {} } }, { once: true });
      send();
    },
    cancel() { closed = true; clearInterval(interval); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive" } });
}
