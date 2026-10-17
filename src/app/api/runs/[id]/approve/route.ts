import { approveRun, getRun } from "@/lib/server/runs";
import { errorResponse, readJson, requireSameOrigin } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params;
    if (!getRun(id)) return Response.json({ error: "Run not found." }, { status: 404 });
    return Response.json(approveRun(id, await readJson(request)));
  } catch (error) { return errorResponse(error, 409); }
}
