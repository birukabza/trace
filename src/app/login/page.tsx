import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { AuthForm } from "@/components/auth-form";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { safeNextPath, supabaseConfiguration } from "@/lib/supabase/config";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; notice?: string }> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getAuthenticatedUser()) redirect(next);
  return <AuthShell title="Pick up your research." description="Sign in to your private workspace and follow the evidence." footer={<>New to Trace? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></>}>
    {params.notice === "confirmation-failed" && <p className="auth-error" role="alert">That confirmation link has expired or was already used. Try signing in, or request a password reset.</p>}
    <AuthForm mode="login" next={next} configured={Boolean(supabaseConfiguration())} />
  </AuthShell>;
}
