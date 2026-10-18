"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authSiteOrigin, safeNextPath, supabaseConfiguration } from "@/lib/supabase/config";

export type AuthFormState = { error?: string; message?: string };

async function siteOrigin() {
  return authSiteOrigin(process.env.NEXT_PUBLIC_APP_URL, (await headers()).get("origin"));
}

function values(form: FormData) {
  return { email: String(form.get("email") || "").trim().slice(0, 254), password: String(form.get("password") || ""), next: safeNextPath(form.get("next")) };
}

export async function login(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!supabaseConfiguration()) return { error: "Sign-in is not configured yet. Please try again later." };
  const { email, password, next } = values(form);
  if (!email || !password || password.length > 128) return { error: "Enter your email and password." };
  try {
    const client = await createClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { error: error.code === "email_not_confirmed" ? "Confirm your email first. Check your inbox for the confirmation link." : "We couldn’t sign you in. Check your email and password, then try again." };
    if (!data.user?.email_confirmed_at) {
      await client.auth.signOut({ scope: "local" });
      return { error: "Confirm your email before signing in." };
    }
  } catch { return { error: "Sign-in is temporarily unavailable. Please try again." }; }
  redirect(next);
}

export async function signup(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!supabaseConfiguration()) return { error: "Sign-up is not configured yet. Please try again later." };
  const { email, password, next } = values(form);
  if (!email || password.length < 8 || password.length > 128) return { error: "Use a valid email and a password between 8 and 128 characters." };
  const displayName = String(form.get("displayName") || "").trim().slice(0, 80);
  try {
    const origin = await siteOrigin();
    const client = await createClient();
    const { data, error } = await client.auth.signUp({ email, password, options: { data: { display_name: displayName }, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    if (error) return { error: error.code === "over_email_send_rate_limit" ? "Too many emails requested. Wait a few minutes before trying again." : "We couldn’t create your account. Check your details and try again." };
    if (data.session) return { message: "Your account is ready. You can now sign in." };
    return { message: "Check your email to confirm your account. Then return here to sign in." };
  } catch { return { error: "Account creation is temporarily unavailable. Please try again." }; }
}

export async function requestPasswordReset(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!supabaseConfiguration()) return { error: "Password reset is not configured yet." };
  const { email } = values(form);
  if (!email) return { error: "Enter your email address." };
  try {
    const client = await createClient();
    const origin = await siteOrigin();
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/auth/update-password")}` });
    if (error) return { error: "We couldn’t send a reset link right now. Wait a few minutes, then try again." };
    return { message: "If an account matches that email, you’ll receive a password reset link." };
  } catch { return { error: "Password reset is temporarily unavailable. Please try again." }; }
}

export async function updatePassword(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  const password = String(form.get("password") || "");
  if (password.length < 8 || password.length > 128) return { error: "Use a password between 8 and 128 characters." };
  try {
    const client = await createClient();
    const { data, error: identityError } = await client.auth.getUser();
    if (identityError || !data.user?.email_confirmed_at) return { error: "This reset link has expired. Request another link." };
    const { error } = await client.auth.updateUser({ password });
    if (error) return { error: "Couldn’t update your password. Choose a different password or request a new reset link." };
  } catch { return { error: "Password update is temporarily unavailable. Please try again." }; }
  redirect("/?account=password-updated");
}

export async function signOut() {
  if (supabaseConfiguration()) {
    const client = await createClient();
    await client.auth.signOut({ scope: "local" });
  }
  redirect("/login");
}
