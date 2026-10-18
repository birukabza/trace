"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { login, signup, requestPasswordReset, updatePassword, type AuthFormState } from "@/app/auth/actions";

export function AuthForm({ mode, next = "/", configured = true }: { mode: "login" | "signup" | "reset" | "password"; next?: string; configured?: boolean }) {
  const action = mode === "signup" ? signup : mode === "reset" ? requestPasswordReset : mode === "password" ? updatePassword : login;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(action, {});
  const emailNeeded = mode !== "password";
  const passwordNeeded = mode !== "reset";
  const label = mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : mode === "password" ? "Save password" : "Sign in";
  return <form className="auth-form" action={formAction}>
    <input type="hidden" name="next" value={next} />
    {mode === "signup" && <label>What should we call you?<input name="displayName" autoComplete="nickname" maxLength={80} placeholder="Your name (optional)" disabled={pending} /></label>}
    {emailNeeded && <label>Email<input type="email" name="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" disabled={pending} /></label>}
    {passwordNeeded && <label><span className="auth-label">Password{mode === "login" && <Link href="/auth/reset-password">Forgot password?</Link>}</span><input type="password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? undefined : 8} maxLength={128} placeholder={mode === "login" ? "Your password" : "At least 8 characters"} disabled={pending} /></label>}
    {!configured && <p className="auth-error" role="alert">Sign-in is being configured. Please try again shortly.</p>}
    {state.error && <p className="auth-error" role="alert">{state.error}</p>}
    {state.message && <p className="auth-success" role="status">{state.message}</p>}
    <button className="primary-button auth-submit" type="submit" disabled={pending || !configured}>{pending ? "Please wait" : label}{pending ? <Loader2 size={16} className="spin" /> : <ArrowUpRight size={16} />}</button>
    {mode === "signup" && <p className="auth-hint">We’ll email you a confirmation link before you sign in.</p>}
  </form>;
}
