import { ChevronDown } from "lucide-react";
import { PROJECT_INTEGRATION } from "@/lib/capabilities";
import type { Run } from "@/lib/types";

type SandboxEvidence = { id: string; forkedFrom?: string; egressRestricted?: boolean; pausedAfterRun?: boolean };

export function PlatformProof({ run }: { run?: Run & { sandbox?: SandboxEvidence } }) {
  const liveAttempts = run?.mode === "live" ? run.attempts.filter(attempt => attempt.provider === "createos") : [];
  const latest = liveAttempts.at(-1);
  const sandbox = run?.mode === "live" ? run.sandbox : undefined;
  const sandboxId = sandbox?.id || latest?.sandboxId;

  return <details className="platform-proof product-disclosure">
    <summary>Stripe Projects + CreateOS Sandbox<ChevronDown size={13} aria-hidden="true" /></summary>
    <div className="product-disclosure-body">
      <div className="platform-role"><h3>Stripe Projects connects the stack.</h3><p>The project’s CreateOS service was provisioned through Stripe Projects, which supplies its service credentials.</p><span className="platform-proof-meta">{PROJECT_INTEGRATION.project} / {PROJECT_INTEGRATION.service}</span></div>
      <div className="platform-role"><h3>CreateOS runs the experiment.</h3><p>Trace sends its generated numerical Python to an isolated CreateOS Sandbox and uses the actual output or error to decide what to do next.</p>
        {run?.mode === "example" ? <p className="platform-proof-note">This is a recorded example. Opening it does not start a new sandbox execution.</p> : latest ? <p className="platform-proof-note">{liveAttempts.length} recorded CreateOS {liveAttempts.length === 1 ? "attempt" : "attempts"}. Latest exit code: {latest.exitCode}.{latest.credentialSource === "stripe_projects" ? " This execution used credentials supplied by Stripe Projects." : ""}</p> : run ? <p className="platform-proof-note">No completed CreateOS execution is recorded for this investigation yet.</p> : null}
        {sandboxId && <p className="platform-proof-meta">Sandbox <code>{sandboxId}</code></p>}
        {(sandbox?.forkedFrom || sandbox?.egressRestricted || sandbox?.pausedAfterRun) && <ul className="platform-evidence">
          {sandbox.forkedFrom && <li>Forked from <code>{sandbox.forkedFrom}</code> for this investigation.</li>}
          {sandbox.egressRestricted && <li>Outbound network access restricted for this investigation.</li>}
          {sandbox.pausedAfterRun && <li>Sandbox paused after execution.</li>}
        </ul>}
      </div>
    </div>
  </details>;
}
