# Trace

Trace is a research verification agent. Give it an arXiv paper or a public GitHub repository, and it reads the source, writes a focused numerical experiment, and runs its code in an isolated CreateOS Sandbox.

When execution fails or measurements are missing, the agent can inspect the feedback, revise its code, and run it again. Every attempt stays available for review.

## What it does

- Extracts testable claims with supporting source excerpts.
- Generates Python experiments and starts execution automatically.
- Shows the current code, actual output, and changes between attempts.
- Attempts implementation repairs using execution and output-validation feedback.
- Keeps private investigation history for each signed-in user.
- Exports reports containing the protocol, code, measurements, errors, and limitations.

## Supported experiments

Trace currently supports small CPU numerical checks and reduced experiments using Python and NumPy. Each investigation has a budget of three execution attempts, with a 60-second limit per attempt.

It reads arXiv HTML or extracts text from PDFs. Downloads are limited to 12 MB, with up to 80,000 extracted characters per paper. When an author repository is included, the input budget is 60,000 paper characters and 20,000 README characters. GitHub input supplies README context; repository code and dependencies are not downloaded or executed.

Scanned PDFs, GPU training, large dataset downloads, and full large-model benchmark reproduction are outside the current scope. A successful execution is recorded as partial verification, not proof that a paper's claim is correct.

## How it works

The Next.js frontend handles the workspace and Supabase email/password sessions. A separate Node.js backend verifies the user's identity, manages investigations, calls River for code generation and repair, and executes Python through CreateOS. SQLite stores investigation records and execution evidence.

Stripe Projects provisions the CreateOS integration and supplies its credentials. Each live investigation uses an isolated fork of a configured base sandbox, with restricted external networking and disabled ingress. Generated programs run with limits on imports, memory, execution time, and output. The experiment workspace pauses after the run.

The interface uses React, TypeScript, Shaders, and thinking-orbs. The model is currently configured as `zai-org/GLM-5.3-Flash` through River.

## Local setup

### 1. Install dependencies

Use Node.js 24 and npm. On Windows, you can run the development services in WSL.

```bash
git clone https://github.com/birukabza/trace.git
cd trace
npm ci
```

### 2. Connect CreateOS

Install and authenticate the Stripe CLI with its Projects plugin, then connect the CreateOS service from the repository root:

```bash
stripe projects init
stripe projects add createos/project
stripe projects env --pull
```

Choose the plan appropriate for your account. Stripe Projects writes the generated credentials to `.env`.

Create an EU CreateOS base sandbox with Python 3 and NumPy installed, and keep its ID for the next step. The sandbox filesystem must contain no credentials or private files because investigation forks copy that filesystem.

### 3. Configure authentication and environment variables

Create a Supabase project. Enable email/password authentication and email confirmation. Under Authentication URL Configuration, set:

- Site URL: `http://localhost:3000`
- Allowed redirect URL: `http://localhost:3000/auth/callback**`

Copy the environment template:

```bash
cp .env.example .env.local
```

Fill in these values in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
RIVER_API_KEY=your_river_key
CREATEOS_SANDBOX_ID=your_base_sandbox_id
TRACE_BACKEND_URL=http://127.0.0.1:4000
FRONTEND_URL=http://localhost:3000
```

Both development services load environment files using Next.js precedence, including the Stripe Projects-managed `.env`. Keep the River key in `.env.local`; do not overwrite the generated `.env` or add an empty `CREATEOS_PROJECT_API_KEY` override.

Supabase handles password hashing and account verification. No Supabase service-role key or application database tables are required. SQLite stores local investigation data in `data/`.

### 4. Start Trace

```bash
npm run dev
```

This starts the frontend on port 3000 and the backend on port 4000. Open [localhost:3000](http://localhost:3000), create an account, confirm your email, and sign in.

Paste a paper or repository URL and select **Investigate**. Follow the generated code and captured output; open **Changes** when a revision is written. Cancel an active investigation or download its report from the workspace.

Investigations are private to their verified owner. One investigation per account can be active at a time, with up to three active across the service. Sandbox execution is serialized. The recorded example is a preview of saved evidence and does not start a live experiment.

## Deployment

Deploy the frontend to Vercel and the persistent backend to Railway. The frontend proxies authenticated requests to the backend; long-running experiments execute in the backend process.

### Railway backend

Use the repository root and `Dockerfile.backend`. Attach a persistent volume at `/data`, use one always-on replica, and set the health check to `/healthz`. Confirm these settings in Railway; `railway.toml` also records them.

Set the service variables:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `TRACE_DATA_DIR` | `/data` |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your Supabase publishable key |
| `RIVER_API_KEY` | Your River API key |
| `CREATEOS_SANDBOX_ID` | Your EU base sandbox ID |
| `CREATEOS_PROJECT_API_KEY` | Your Stripe Projects-provisioned CreateOS key |
| `FRONTEND_URL` | Your frontend HTTPS origin |

Railway supplies `PORT`. Keep the Docker entrypoint and command, generate the service's public HTTPS domain, and back up its volume. The health check is public; investigation APIs require a verified Supabase session.

### Vercel frontend

Import the repository with these settings:

- Root directory: repository root (`./`)
- Framework: Next.js
- Node.js: 24.x
- Build command: `npm run build`
- Output directory: framework default

Set the frontend variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The same Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The same publishable key |
| `NEXT_PUBLIC_APP_URL` | Your frontend HTTPS origin |
| `TRACE_BACKEND_URL` | Your Railway backend HTTPS origin |

Keep `TRACE_BACKEND_URL` server-only. River and CreateOS credentials belong on the backend, not the frontend deployment.

Once the frontend domain is available, update Railway's `FRONTEND_URL`. In Supabase, set the Site URL to that domain and allow `https://your-domain/auth/callback**`. Configure email delivery for your users, then verify account creation, confirmation, sign-in, password reset, and a live investigation.

SQLite uses the Railway volume; no separate database service is needed. Interrupted investigations retain their evidence and are not automatically rerun after a backend restart.

## Development commands

```bash
npm run typecheck       # TypeScript checks
npm test                # Automated tests
npm run build           # Production frontend
npm run build:backend   # Production backend
npm run verify          # All checks and builds
```

Use `npm run dev:frontend` or `npm run dev:backend` to start either service separately. Built services run with `npm start` and `npm run start:backend`; provide their environment variables when starting them in production.

Local credentials, application data, generated experiment artifacts, and build output are excluded from Git.
