# Trace

Trace turns a research claim into an inspectable experiment. Submit an arXiv
paper or a public GitHub repository. The agent reads the source, writes a focused
numerical test, runs it in CreateOS, and explains what its evidence supports.
Execution starts automatically; no intermediate approval is required.

## Run locally

Use Node.js 24 or later in WSL. Install dependencies with `npm install`.
Stripe Projects supplies the CreateOS credentials in its generated `.env` file.
Copy `.env.example` to `.env.local`, then add your River key and the ID of
your own CreateOS sandbox. Keep `.env.local` ignored:

```dotenv
RIVER_API_KEY=your_river_api_key
CREATEOS_SANDBOX_ID=your_sandbox_id
```

Start the app with `npm run dev` and open `http://localhost:3000`.
The server binds to the local machine. This prototype has no user authentication.
Do not publish it without adding authentication and per-user resource limits.
Supabase authentication is deferred.

## Use the workspace

1. Submit an arXiv paper URL or a public GitHub repository URL.
2. Follow the reading, writing, execution, and evidence stages. Cancel when needed.
3. If Python exits unsuccessfully, the agent inspects its actual error and can
   repair the implementation within a three-attempt budget.
4. Open source coverage, the protocol, generated code, or execution details when needed.
5. Download the report with every attempt and its original output.

If the attempt budget is exhausted or no faithful repair is possible, the run
stops and keeps its evidence. Retrying creates a separate investigation from the
unchanged original protocol; it does not overwrite the failed run. Old pending
investigations are retained and need an explicit continuation to start; they are
not silently launched by this update.

The recorded k-means++ example displays measurements from the October 17 pilot.
It makes no River or CreateOS requests. Its synthetic experiment is separate from
the original paper's benchmark tables and theoretical guarantee.

## What the first version supports

The backend reads arXiv HTML, falling back to text extraction from a PDF. Each
download is limited to 12 MB. A paper alone supplies at most 80,000 extracted
text characters; with an author repository, the budget is 60,000 paper characters
and 20,000 README characters. These are character limits, not page guarantees.
The result records how much extracted text was used and whether it was truncated.
Scanned PDFs are unsupported. GitHub input reads the public README as evidence;
it does not clone repositories, install author dependencies, or execute author code.

River's `zai-org/GLM-5.3-Flash` proposes one small CPU numerical experiment.
Suitable tasks include numerical component checks and reduced experiments on
seeded synthetic data. GPU training, full large-model reproduction, and large
external dataset downloads are outside this version's scope.

The agent performs at most three execution attempts, each bounded to 60 seconds.
Only a recorded nonzero code exit can trigger implementation repair; transport
failures stop the run. Repairs retain the scientific protocol, dataset, metrics,
and limitations rather than tuning the test to match a desired result. Every
attempt preserves its code, stdout, stderr, exit status, and duration separately.
The bounded write/run/fix structure draws inspiration from
[mini-SWE-agent](https://github.com/SWE-agent/mini-swe-agent); this project does
not execute its shell agent or claim its benchmark performance.

The CreateOS TypeScript SDK forks the existing EU base sandbox for each live
investigation. Setup briefly pauses the base to take a fork and restores its
prior running state. Children use a verified restrictive external egress
allowlist, disabled ingress, and a cleared command environment. The numerical
runner also limits imports, memory, CPU time, and output. External networking is
restricted; it is not described as a provider-supported deny-all network policy.
The base snapshot must be free of credentials and secret files: forking copies
its filesystem even though the app does not send River or CreateOS keys to Python.

The child pauses while the agent reasons about a failed attempt and after the
run. Paused forks are retained for inspection and still count against sandbox
quota; they are not automatically deleted. A five-minute auto-pause is a fallback
when cleanup cannot be confirmed. Check retained workspaces in CreateOS before
starting many investigations. Commands run serially, and an unconfirmed remote
cancellation holds the execution queue until its bounded process deadline.

A successful process receives a partial assessment. It does not automatically
establish a correct implementation, reproduce an original benchmark, or prove a
theorem. Source citations and execution evidence stay available for review.

## Stripe Projects and CreateOS

Stripe Projects connects the CreateOS service and manages its generated
credentials. CreateOS supplies the isolated environment where the agent's Python
actually runs. Stripe Projects does not execute the experiment or collect paper
measurements. Each new execution records its workspace, code hash, and whether
its key came from the Stripe Projects-managed environment variable or a custom
CreateOS override. Historical runs without this metadata are labelled accordingly.

## Development

```bash
npm run typecheck
npm test
npm run build
```

Run records and logs live in ignored `data/`. Credentials, local agent tooling,
and experiment scratch output are excluded from Git.

The app uses Next.js, React, TypeScript, SQLite, Shaders, River, and CreateOS.
The Shaders compositions have static fallbacks and respect reduced motion.

The development workflow follows [pstack](https://github.com/cursor/plugins/tree/main/pstack).
The interface draws inspiration from [Grok Bot](https://x.ai/bot), with effects
built using [Shaders](https://shaders.com/docs/guide) and
[thinking-orbs](https://github.com/Jakubantalik/thinking-orbs).

## Hackathon submission

Prepare a public repository, a README, a two-to-three-minute demo with a team
member on camera, and a public X or LinkedIn post tagging CreateOS. Submit the
links and team details using the organizer's form. In the video, show the problem,
paste a paper, demonstrate the agent writing and running code live, open its
evidence, and explain how Stripe Projects and CreateOS are used. The recorded
example is useful for navigation, but does not replace the required live execution.
The organizer's stated deadline is October 17, 2026 at 5:30 PM Pacific, which is
October 18 at 2:30 AM in Kigali. The form URL must come from the organizers.
