# Verification

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
repositories and automatically repairing generated code remain future work.
