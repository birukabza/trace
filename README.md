# Trace

Trace turns a research claim into an inspectable experiment. Submit an arXiv
paper or a public GitHub repository, review the proposed protocol and Python,
then approve a bounded run in a CreateOS sandbox.

## Run locally

Use Node.js 24 or later in WSL. Install dependencies with `npm install`.
Stripe Projects supplies the CreateOS credentials in its generated `.env` file.
Keep your River key in the ignored `.env.local` file:

```dotenv
RIVER_API_KEY=your_river_api_key
```

Start the app with `npm run dev` and open `http://localhost:3000`.
The server binds to the local machine. This prototype has no user authentication.
Do not publish it without adding authentication and per-user resource limits.
Supabase authentication is deferred.

## Use the workspace

1. Submit an arXiv paper URL or a public GitHub repository URL.
2. Review the proposed experiment. Open the method, scope, or source details when needed.
3. Inspect the Python code and approve the experiment.
4. Follow the status, then open measurements and execution details in the result.
5. Download the evidence report.

If execution fails, inspect its logs and use **Review & retry** to prepare
an unchanged protocol for a new approval. The failed run stays in the research log.
This version does not automatically edit or repair generated code.

The recorded k-means++ example displays measurements from the October 17 pilot.
It makes no River or CreateOS requests. Its synthetic experiment is separate from
the original paper's benchmark tables and theoretical guarantee.

## What the first version supports

The backend reads arXiv HTML, falling back to text extraction from a PDF. GitHub
input reads the public README as evidence. It does not clone repositories,
install author dependencies, or execute repository code.

River's `zai-org/GLM-5.3-Flash` proposes a CPU numerical experiment. The app keeps
the protocol visible and waits for approval. It uses the CreateOS TypeScript SDK
against the existing EU sandbox. Code receives no application API keys.
Execution has time, memory, output, and numerical-code limits.

A successful process receives a partial assessment. It does not automatically
establish a correct implementation, reproduce an original benchmark, or prove a
theorem. Source citations and execution evidence stay available for review.

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
The interface draws inspiration from [iCog Labs](https://www.icog-labs.com/) and
[Grok Bot](https://x.ai/bot), with effects built using [Shaders](https://shaders.com/docs/guide).

## Hackathon submission

Prepare a public repository, a README, a two-to-three-minute demo with a team
member on camera, and a public X or LinkedIn post tagging CreateOS. Submit the
links and team details using the organizer's form and Stripe Projects leaderboard.
The organizer's stated deadline is October 17, 2026 at 5:30 PM Pacific, which is
October 18 at 2:30 AM in Kigali. The form URL must come from the organizers.
