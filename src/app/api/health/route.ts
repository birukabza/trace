import { configuration } from "@/lib/server/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json(configuration()); }
