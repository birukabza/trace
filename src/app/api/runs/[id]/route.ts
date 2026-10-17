import { getRun } from "@/lib/server/runs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const run = getRun((await context.params).id);
  return run ? Response.json(run) : Response.json({ error: "Run not found." }, { status: 404 });
}
