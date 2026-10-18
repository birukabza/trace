import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { AuthForm } from "@/components/auth-form";
import { supabaseConfiguration } from "@/lib/supabase/config";

export default function ResetPassword() {
  return <AuthShell title="Find your way back." description="We’ll send a link to reset your password." footer={<Link href="/login">Back to sign in</Link>}><AuthForm mode="reset" configured={Boolean(supabaseConfiguration())} /></AuthShell>;
}
