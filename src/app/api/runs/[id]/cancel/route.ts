import { cancelRun, getRun } from "@/lib/server/runs";
import { errorResponse, requireSameOrigin } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params;
    if (!getRun(id)) return Response.json({ error: "Run not found." }, { status: 404 });
    return Response.json(cancelRun(id));
  } catch (error) { return errorResponse(error, 409); }
}
