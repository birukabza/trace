# Trace build plan

## Definition of done

A user can submit an arXiv paper or a public GitHub repository and watch the
agent read, write, run, and, if needed, repair one focused numerical experiment
without intermediate approval. The result includes a downloadable evidence
report. The app reports missing credentials and unsupported workloads honestly.
A recorded example remains explicitly separate from live execution.

## Workflow

1. Read the pstack principles and frame the task.
2. Compare a single persisted run aggregate with normalized experiment tables.
3. Build the run aggregate and API contracts before implementation.
4. Implement paper ingestion, River planning, and CreateOS execution.
5. Build the editorial interface and shader compositions against the contracts.
6. Verify the actual browser workflow, APIs, persistence, and failure cases.
7. Commit verified units with short one-line messages.

## Throughput checkpoint

- Blocking first steps. Confirm tool access, package APIs, and the run contract.
- Independent workstreams. UI components and backend modules have separate owners.
- Shared mutable state. The lead owns dependencies, shared types, and integration.
- Smallest safe decomposition. Two implementation owners and one integration owner.

## Design choice

The local app stores one run aggregate per SQLite record. That keeps source,
claims, original protocol, attempts, repair diagnoses, source coverage, and events
together. A normalized schema with
a separate queue would add coordination without helping the single-operator demo.
The interface keeps the primary action clear and displays one honest process
stage while work runs. Source text coverage, protocol, code, logs, provider
provenance, and repair history are available through progressive disclosure.
Animations are ambient rather than fabricated numerical progress.

## Scope

Fork the existing EU base sandbox for each live investigation, briefly pausing
the base for the snapshot and restoring its prior running state afterward.
Verify the child external egress allowlist, disable ingress, and use a cleared
command environment with bounded numerical Python. A fork inherits the base
filesystem, so the base must contain no secrets. Pause the child while repairing
and after completion; retain it for inspection and disclose its continued quota
usage. A five-minute auto-pause is the cleanup fallback.

One controller owns the complete analysis-to-execution lifecycle. A serial
promise queue prevents overlapping experiments; a persisted execution lease
protects the queue across cancellation and worker restart. Interrupted work is
reported as failed rather than automatically repeated. Old pending runs remain
historical until explicitly continued.

The agent follows a bounded write/run/fix loop inspired by
[mini-SWE-agent](https://github.com/SWE-agent/mini-swe-agent): at most three
execution attempts of 60 seconds each. Repair only actual nonzero code exits;
stop on transport failures, unchanged code, unavailable faithful repairs, or
budget exhaustion. Keep the initial protocol unchanged and every revision's
code and output independently inspectable. Successful execution yields a partial
assessment, never an automatic scientific matching verdict.

Read at most 80,000 extracted characters from one paper, or 60,000 paper plus
20,000 author README characters. Downloads are limited to 12 MB. Scanned PDFs,
GPU training, cloning or executing author repositories, dependency installation,
and large dataset downloads remain outside the supported workflow. Record the
actual character counts and truncation; avoid inferring complete paper coverage.

For the live demo, show paper input, real code generation, CreateOS execution,
and captured evidence. Explain that Stripe Projects connects the CreateOS
service and credentials; CreateOS executes the Python. Do not present the
recorded example as new execution.

Keep River credentials on the host. Authentication and public multi-user hosting
require a later Supabase integration. Do not expose this unauthenticated local
prototype publicly.
