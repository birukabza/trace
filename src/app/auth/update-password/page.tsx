import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { AuthForm } from "@/components/auth-form";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export default async function UpdatePassword() {
  if (!await getAuthenticatedUser()) redirect("/auth/reset-password");
  return <AuthShell title="Choose a new password." description="Use at least 8 characters to protect your research."><AuthForm mode="password" /></AuthShell>;
}
