# Verification

## Autonomous workflow, October 17, 2026

New investigations now read, write, run and repair automatically. The local
suite passes 40 tests with one skipped local NumPy check; real CreateOS runs
exercise NumPy. Tests cover the three-attempt budget, real-error feedback
history, cancellation, immutable prior attempts, serial execution, fork policy
verification, base restoration and restart cleanup of terminal child workspaces.

Existing Extended Isolation Forest run `f8612537-baa2-4988-b392-5eb48f3f0737`
was explicitly continued through the new automatic executor. It completed in
one attempt in fork `sb-01m562p06g5571p2876813mymh`, with restricted egress
verified and final pause confirmed. This run needed no repair.

A **deliberately broken internal integration fixture**, separate from every
paper run, exercised a real failure and repair. CreateOS rejected a reshape of
six values into a three-by-three matrix. River returned a complete corrected
program using the protocol-specified two-by-three shape. The second real
CreateOS execution passed; its row means `[2, 5]` were independently checked.
The workspace paused during diagnosis and resumed for the retry. Its original
code, actual error, model revision and output remain in ignored
`artifacts/live-repair-check.json`. This is evidence about the repair mechanism,
not a naturally occurring paper failure or scientific result.

Fresh browser-started run `6d25e852-225b-4990-aa5c-59545b482854` then completed
the full automatic path for arXiv 0909.4061: source, model-written experiment,
CreateOS fork, one successful execution, evidence report and confirmed pause.
The source was truncated at 80,000 characters and that coverage is disclosed.
No approval endpoint was used for this fresh run. The downloaded report is
retained locally as `artifacts/autonomous-svd-report.md`; screenshots include
`artifacts/autonomous-result.png` and `artifacts/autonomous-sponsor-evidence.png`.
The browser displayed verified fork, network restriction, pause and Projects
credential provenance. It reported no console errors.

A prior fresh attempt stopped on an oversized optional display summary. The
parser now omits that summary and falls back to the validated experiment title.
Scientific fields remain unchanged and strictly validated; a regression test
confirms an excessive execution budget still fails validation.

The sections below retain historical checks from earlier versions. Their
approval requirements describe those earlier runs, not the current new-run flow.

Verified locally on October 17, 2026 using Node 24 in WSL.

`npm run verify` passed typechecking and the production build. The test suite
passed 16 checks and skipped one local NumPy check because WSL has no NumPy.
The real CreateOS run exercised NumPy reductions successfully.

## Live integration

Run `fb63cafa-34e5-41fb-8f15-ffddd8eea5b3` used River GLM to plan an
Attention Is All You Need component check and ran the reviewed code in the
existing CreateOS EU sandbox. Exit status was 0, stderr was empty, and the
recorded command duration was 923 ms. That duration excludes planning and
sandbox setup. It is not a performance benchmark.

For dimensions 16, 64, 256, and 1024, the code reported scaled variances of
1.0194, 1.0076, 0.9976, and 0.9859, using 19,968 sampled pairs per dimension.
These values come from generated code and do not independently validate that
implementation or reproduce the paper's BLEU results.

The browser download produced `artifacts/attention-evidence.md`. The source
snapshot hash is
`96da90a48e6d44eae49b28a7214db461cc2f5f41abc7885f616db9f8ac4654f9`.
Run records, source snapshots, screenshots, and downloaded reports stay local
and ignored by Git.

## Failure and recovery

The first live analysis failed quotation validation before execution. Citations
now resolve numbered excerpts to original source text. A subsequent generated
protocol exceeded the intended memory budget and was cancelled before approval.
The planner now specifies batches and bounded arrays.

Run `2579adcd-c8c8-42f3-83d7-ef7ad19fe328` retained the sandbox import error
from NumPy's internal reduction module. The runner now permits that exact
internal import while generated imports still pass the original AST policy.
The successful run copied the unchanged protocol into a new run and required a
fresh approval. Its predecessor remains separately available.

Independent review found restart leasing, pending-history visibility, failed
report download, snapshot metadata, and Markdown containment issues. Regression
tests now cover the durable lease including cancellation, history beyond 50
records, exact snapshot paths, and untrusted report formatting. The report
control is available for successful and failed execution records.

## Browser checks

Checked the landing page, live planning, protocol review, code inspection,
approval, failure logs, retry approval, measured output, and report download.
The shader composition rendered on desktop. At 390 px, the sphere initially
overlapped text; its placement was corrected and checked again.

## Remaining scope

Only one local app instance is supported. Add authentication and per-user limits
before public hosting. GitHub ingestion reads README evidence; executing author
repositories remains future work. Current automatic repairs apply to generated
numerical Python within the fixed experiment protocol.

## Extended Isolation Forest planning failure

Run `dd17b8b4-c9d7-4951-8847-13b3ffdc9dba` loaded arXiv 1811.02141,
then failed while parsing or validating the model response. It has no plan,
claims, or execution attempts. The old catch block discarded both the response
and the validation issues, so the exact original field cannot be recovered.

Planning-only retry `f8612537-baa2-4988-b392-5eb48f3f0737` read the identical
source snapshot, SHA-256
`1d5cab863249c4fe5be50814e58ab6c33728c255ae69dde1f51fcecd3aa5f7bb`.
It passed validation and stopped at `awaiting_approval` with zero attempts.
This retry used the original prompt. It does not prove which field failed in
the original answer or validate the proposed scientific method.

`parseModelResponse` now distinguishes invalid JSON from rejected fields.
Rejected responses are saved under ignored `data/model-responses/` with field
paths, issue codes, and a diagnostic reference. Request credentials and prompts
are excluded. A mocked-provider test verifies the saved response and checks
that the request token is absent. The model now receives the validator's JSON
Schema, including field types and bounds, rather than only the abbreviated
field list. No validation limit or execution approval was relaxed.

After this change, TypeScript and the production build passed. The complete
local suite passed 18 tests and skipped the existing local NumPy check.
