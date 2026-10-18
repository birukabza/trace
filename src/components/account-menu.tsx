"use client";

import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import type { AccountProfile } from "@/lib/supabase/server";

export function AccountMenu({ user }: { user: AccountProfile }) {
  const label = user.displayName || user.email?.split("@")[0] || "Your account";
  return <details className="account-menu"><summary aria-label={`Account: ${label}`}><span className="account-avatar" aria-hidden="true">{label.slice(0, 1).toUpperCase() || <UserRound size={14} />}</span><span className="account-name">{label}</span><ChevronDown size={12} /></summary><div className="account-popover"><span className="eyebrow">Your account</span><strong>{user.displayName || "Researcher"}</strong>{user.email && <span className="account-email">{user.email}</span>}<p>Your investigations are private to this account.</p><form action={signOut}><button type="submit"><LogOut size={14} />Sign out</button></form></div></details>;
}
