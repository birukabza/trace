import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfiguration } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  const configuration = supabaseConfiguration();
  const publicPath = request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup" || request.nextUrl.pathname.startsWith("/auth/");
  let authenticated = false;
  if (configuration) {
    const client = createServerClient(configuration.url, configuration.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          response.headers.set("Cache-Control", "private, no-store");
        },
      },
    });
    try {
      const { data, error } = await client.auth.getClaims();
      authenticated = !error && Boolean(data?.claims?.sub);
    } catch { authenticated = false; }
  }
  if (!authenticated && !publicPath) {
    const blocked = request.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Your session has ended. Sign in to continue." }, { status: 401 })
      : NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`, request.url));
    response.cookies.getAll().forEach(cookie => blocked.cookies.set(cookie));
    blocked.headers.set("Cache-Control", "private, no-store");
    return blocked;
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"] };
