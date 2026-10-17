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

Review leads with a short experiment description and an explicit approval.
The exact hypothesis, method, code, source quotations, and scope details open
on demand. New model responses include a plain-language summary. Existing
saved plans use their title and remain compatible with the new interface.

Results lead with the conclusion and its scope. Measurements, execution
records, and research details are expandable. Recorded examples remain
labeled. Failed and cancelled investigations keep their evidence and status.
Provider configuration belongs in Settings. Hardware specifications are absent
from the research flow.

A persistent live region announces when a review, result, or stopped state
replaces processing. Navigation still invalidates stale asynchronous responses.
Approval and execution rules are unchanged.

## Verification

TypeScript, the server tests, and the production build pass. The local NumPy test remains skipped because NumPy is absent in WSL; the prior sandbox integration verified NumPy execution. Browser checks cover the pending review,
code disclosure, existing result measurements, history, settings, and animation
pause. A temporary preview rendered processing states without new model or
sandbox calls. At 390 px, document and viewport widths matched. The preview
route is removed before shipping. Captures stay in ignored artifacts.