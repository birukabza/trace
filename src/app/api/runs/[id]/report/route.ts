import { getRun, markdownReport } from "@/lib/server/runs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const run = getRun((await context.params).id);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  return new Response(markdownReport(run), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="repro-${run.id}.md"` } });
}
