# Trace

Trace turns a research claim into an inspectable experiment. Submit an arXiv
paper or a public GitHub repository. The agent reads the source, writes a focused
numerical test, runs it in CreateOS, and explains what its evidence supports.
Execution starts automatically; no intermediate approval is required.

## Run locally

Use Node.js 24 in WSL. Install dependencies with `npm ci`.
Stripe Projects supplies the CreateOS credentials in its generated `.env` file.
Copy `.env.example` to `.env.local`, then fill in the Supabase project URL and
publishable key, your River key, and your CreateOS base sandbox ID:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
RIVER_API_KEY=your_river_key
CREATEOS_SANDBOX_ID=your_base_sandbox_id
```

In Supabase Authentication, enable email/password sign-in and email confirmation.
Set the local Site URL to `http://localhost:3000` and allow the redirect
`http://localhost:3000/auth/callback**` (the suffix covers the app's `next` query).

Run `npm run dev`. It starts the Next.js frontend on port 3000 and the backend
worker on port 4000. Open `http://localhost:3000`, create an account, confirm your
email, and sign in. Your display name personalizes the workspace; investigations,
code, events and reports belong to your verified account. Older records without
an owner are not assigned to a newly registered account.

No additional database service is needed. Supabase handles authentication;
SQLite stores investigations in ignored `data/` locally and on the Railway
persistent volume in production. One investigation per account can be active,
with up to three active across the service and serial sandbox execution.

Keep `.env.local` ignored. The River key belongs there locally. Both development
processes load environment files using Next.js precedence, including the
Stripe Projects-managed `.env`; do not overwrite that generated file.

## Use the workspace

1. Submit an arXiv paper URL or a public GitHub repository URL.
2. Follow the reading, writing, execution, and evidence stages. Cancel when needed.
3. Generated code is visible by default. Code, Output and Changes show the
   current program, actual feedback and revisions without opening nested details.
4. If Python fails or returns invalid measurements, the agent diagnoses the
   feedback and repairs the implementation within a three-attempt budget.
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
Recorded execution errors and missing or invalid structured measurements can
trigger implementation repair. Process exit codes remain unchanged in evidence;
output validation is recorded separately. Transport failures stop the run except
for the specific capacity recovery described below. Repairs retain the scientific protocol, dataset, metrics,
and limitations rather than tuning the test to match a desired result. Every
attempt preserves its code, stdout, stderr, exit status, and duration separately.
The bounded write/run/fix structure draws inspiration from
[mini-SWE-agent](https://github.com/SWE-agent/mini-swe-agent); this project does
not execute its shell agent or claim its benchmark performance.

The CreateOS TypeScript SDK forks the existing EU base sandbox for each live
investigation. The base stays paused while its isolated child runs, and its
prior running state is restored after the child pauses. Children use a verified restrictive external egress
allowlist, disabled ingress, and a cleared command environment. The numerical
runner also limits imports, memory, CPU time, and output. External networking is
restricted; it is not described as a provider-supported deny-all network policy.
The base snapshot must be free of credentials and secret files: forking copies
its filesystem even though the app does not send River or CreateOS keys to Python.

The child remains ready while the agent diagnoses and revises a failed attempt,
then pauses after the run. Paused forks count against sandbox quota. On a confirmed concurrency-quota
rejection, Trace can release an old terminal investigation's fork after verifying
that it is paused, forked from this base and carries Trace's environment marker.
The base and unrelated or running workspaces are excluded. All saved code,
measurements and logs remain in the backend data store; the released VM snapshot is no longer
available. Trace then retries workspace creation once. A five-minute auto-pause
is a fallback when cleanup cannot be confirmed. Commands run serially, and an unconfirmed remote
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
npm run build:backend
```

Run records and logs live in ignored `data/`. Credentials, local agent tooling,
and experiment scratch output are excluded from Git.

The app uses Next.js, React, TypeScript, Supabase Auth, SQLite, Shaders, River, and CreateOS.
The Shaders compositions have static fallbacks and respect reduced motion.

The development workflow follows [pstack](https://github.com/cursor/plugins/tree/main/pstack).
The interface draws inspiration from [Grok Bot](https://x.ai/bot), with effects
built using [Shaders](https://shaders.com/docs/guide) and
[thinking-orbs](https://github.com/Jakubantalik/thinking-orbs).

## Deploy on Vercel and Railway

The Vercel frontend verifies the cookie session and proxies API requests to
Railway. Railway independently verifies the bearer token with Supabase and owns
the database, queue and long-running agent. River and CreateOS secrets are needed
only on Railway. No Supabase service-role key or application SQL tables are needed.

1. Create a Railway service from this repository. Select `Dockerfile.backend`,
   attach a persistent volume at `/data`, use one replica, disable serverless
   sleeping, and set the health check to `/healthz`. Keep the Docker entrypoint
   and command. `railway.toml` records these settings for services that support
   configuration files; confirm them in the dashboard for a new service.
2. Set these Railway variables:

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `TRACE_DATA_DIR` | `/data` |
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The same publishable key as the frontend |
   | `RIVER_API_KEY` | Your River secret |
   | `CREATEOS_SANDBOX_ID` | Your clean EU base sandbox ID |
   | `CREATEOS_PROJECT_API_KEY` | The CreateOS key provisioned through Stripe Projects |
   | `FRONTEND_URL` | Your final HTTPS Vercel origin, without a path |

   Railway supplies `PORT`. Generate its public HTTPS service domain. The live
   check `/healthz` returns minimal liveness; protected APIs require a confirmed
   Supabase session. Back up the volume. A volume-backed single replica has brief
   downtime during redeployment, and interrupted investigations are not silently
   rerun.
3. Import the repository into Vercel using the Next.js preset and Node.js 24.
   The build command is `npm run build`. Set:

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | The same Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The same publishable key |
   | `NEXT_PUBLIC_APP_URL` | Your canonical HTTPS Vercel origin |
   | `TRACE_BACKEND_URL` | The Railway HTTPS service origin |

   `TRACE_BACKEND_URL` is server-only: do not add a `NEXT_PUBLIC_` prefix. Do not
   add River or CreateOS keys to Vercel. Redeploy after changing public variables.
4. Update Railway's `FRONTEND_URL` once the Vercel domain exists. In Supabase,
   set the production Site URL to that origin and allow
   `https://your-app.vercel.app/auth/callback**`, replacing the host with your
   actual domain. Keep the local callback if you still develop locally. Use the
   Supabase email configuration appropriate for your users, with email
   confirmation enabled.
5. Verify signup, confirmation, sign-in, sign-out and password reset. Run a small
   paper investigation; confirm a second account cannot read its URL or report.

To deploy, you need access to the Vercel, Railway and Supabase projects, their
final service URLs, the Railway volume, and server credentials entered through
Railway's variables screen. Never commit environment files or paste secret keys
into issues. See the official [Vercel Next.js guide](https://vercel.com/docs/frameworks/full-stack/nextjs)
and [Railway volume documentation](https://docs.railway.com/volumes/reference).
Supabase's [redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls)
explains the allow-list patterns.

## Hackathon submission

Prepare a public repository, a README, a two-to-three-minute demo with a team
member on camera, and a public X or LinkedIn post tagging CreateOS. Submit the
links and team details using the organizer's form. In the video, show the problem,
paste a paper, demonstrate the agent writing and running code live, open its
evidence, and explain how Stripe Projects and CreateOS are used. The recorded
example is useful for navigation, but does not replace the required live execution.
The organizer's stated deadline is October 17, 2026 at 5:30 PM Pacific, which is
October 18 at 2:30 AM in Kigali. The form URL must come from the organizers.
