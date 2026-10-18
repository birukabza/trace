import Link from "next/link";
import type { ReactNode } from "react";
import { TraceMark } from "./trace-mark";

export function AuthShell({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer?: ReactNode }) {
  return <main className="auth-page"><Link className="brand auth-brand" href="/login" aria-label="Trace sign in"><TraceMark /><span className="wordmark">trace</span></Link><section className="auth-card"><div className="auth-heading"><span className="eyebrow">Research, with receipts.</span><h1>{title}</h1><p>{description}</p></div>{children}{footer && <div className="auth-footer">{footer}</div>}</section><p className="auth-bottom">A home for your questions. A record of the evidence.</p></main>;
}
