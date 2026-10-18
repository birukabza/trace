import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const rawNext = request.nextUrl.searchParams.get("next");
  const next = rawNext === "/auth/update-password" ? rawNext : safeNextPath(rawNext);
  if (code) {
    try {
      const client = await createClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) {
        const response = NextResponse.redirect(new URL(next, request.url));
        response.headers.set("Cache-Control", "private, no-store");
        return response;
      }
    } catch { /* Keep provider and token details out of the response. */ }
  }
  return NextResponse.redirect(new URL("/login?notice=confirmation-failed", request.url));
}
