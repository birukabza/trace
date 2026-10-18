# Research experience

The home page and research flow share a near-black background, off-white text,
sans-serif headings, pill controls, and rounded charcoal surfaces inspired by
the [Grok Bot reference](https://x.ai/bot). Processing shows a paper title, one animated orb,
one status sentence, and Cancel. The interface follows the saved run status.
It does not simulate progress percentages or invent intermediate work.

The UI uses [thinking-orbs](https://github.com/Jakubantalik/thinking-orbs)
for reading, planning, queueing, execution, and review. Its canvas animations
pause offscreen and in background tabs and respect reduced-motion preferences.
A visible pause control lets people stop the animation. The landing page keeps
a small monochrome Shaders sphere in the introduction link.

New investigations proceed automatically from reading to writing, running and,
when code fails, repairing. A small phase trail follows persisted state.
Once code exists, a compact code panel is visible by default. Code, Output and,
after a repair, Changes show the actual program, captured stdout/stderr and a
before/after diff. A written revision is persisted before execution, so the
panel shows the next version while its workspace resumes. The orb becomes
smaller to leave room for the agent's work. Source context and activity remain
expandable. Sandbox setup reports actual provider operations instead of one
generic queue message.
Older pending investigations have a Continue action; viewing history never
starts them automatically. No approval step is used for new investigations.

Results lead with the conclusion and its scope. Measurements, execution
records, and research details are expandable. Recorded examples remain
labeled. Failed and cancelled investigations keep their evidence and status.
Provider configuration belongs in Settings. Hardware specifications are absent
from the research flow.

A persistent live region announces when a review, result, or stopped state
replaces processing. Navigation still invalidates stale asynchronous responses.
Execution records select the latest attempt first while keeping every earlier
version and error accessible. Sponsor details distinguish Stripe Projects
provisioning from CreateOS execution; fork, network and pause claims appear
only when recorded metadata confirms them. The home page explains supported
paper workloads and the text and execution budgets through one disclosure.

## Verification

TypeScript, the server tests, and the production build pass. The local NumPy test remains skipped because NumPy is absent in WSL; the prior sandbox integration verified NumPy execution. Browser checks cover the pending review,
code disclosure, existing result measurements, history, settings, and animation
pause. A temporary preview rendered processing states without new model or
sandbox calls. At 390 px, document and viewport widths matched. The preview
route is removed before shipping. Captures stay in ignored artifacts.
