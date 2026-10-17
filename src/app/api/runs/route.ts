import { createRun, listRuns } from "@/lib/server/runs";
import { errorResponse, readJson, requireSameOrigin } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json({ runs: listRuns() }); }
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    return Response.json(createRun(await readJson(request)), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
