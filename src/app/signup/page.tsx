import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { AuthForm } from "@/components/auth-form";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { safeNextPath, supabaseConfiguration } from "@/lib/supabase/config";

export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next);
  if (await getAuthenticatedUser()) redirect(next);
  return <AuthShell title="Make room for a question." description="Keep your investigations, code, and results together." footer={<>Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></>}><AuthForm mode="signup" next={next} configured={Boolean(supabaseConfiguration())} /></AuthShell>;
}
