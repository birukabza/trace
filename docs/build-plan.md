# Trace build plan

## Definition of done

A user can submit an arXiv paper or a public GitHub repository, inspect the
agent's proposed experiment, approve its execution, and download an evidence
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
claims, approved protocol, attempts, and events together. A normalized schema with
a separate queue would add coordination without helping the single-operator demo.
The workbench uses an editorial landing page that becomes an experiment view.
A dashboard-first alternative would obscure the primary action for a new user.

## Scope

Use the existing EU sandbox. Run one experiment at a time with bounded execution.
Keep River credentials on the host. Authentication and public multi-user hosting
require a later Supabase integration. Do not expose this unauthenticated local
prototype publicly.
