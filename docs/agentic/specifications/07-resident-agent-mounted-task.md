# Resident Agent Mounted Task Vertical

Status: implemented product-behavior reference.

## Desired Behavior

One workspace-scoped resident Cestus Agent can accept a bounded local task,
assemble provenance-bound context from an authenticated portable workspace,
run an approved specialist through a deterministic fake or local provider,
write a local derivative handoff to mounted storage, and reconstruct the task,
run, approvals, memory, artifacts, and terminal decision after a fresh runtime
process starts. Providers remain backends, not agent identities.

## Observable Acceptance Examples

- Creating a task through the production local-runtime route records one task
  under `agent_default`; no alternate resident identity is created.
- An evidence-triage fixture task binds exact context and prompt artifact
  hashes, pauses for provider-byte-transfer approval when remote bytes would be
  required, and completes locally without that approval when using a local/fake
  path that needs no transfer.
- Completion is reported only after the ledger and mounted derivative/handoff
  stores read back the same task, run, source, artifact, and policy bindings.
- A fresh runtime process reconstructs the same task state and handoff from the
  portable workspace without an internal fallback ledger or artifact write.
- Missing, disconnected, identity-mismatched, stale, or locked workspace state
  fails closed before provider invocation or artifact write.
- No credential value, private raw content, raw provider error, or hidden host
  path appears in ledger events, browser DTOs, memory, or diagnostics.

## Allowed Scope

- The narrow resident execution, handoff, memory, context, provider-fake, and
  tool-gateway files under `packages/agent/src/**` plus focused tests.
- `packages/local-runtime/src/agent-runtime-*`, mounted artifact stores,
  resident-loop composition/ports, agent HTTP routes, and focused tests.
- `packages/workspace/src/**` only when required for mount identity/readback.
- `packages/ontology/src/contracts.ts` only for a strictly necessary existing
  resident-event contract correction, with focused contract/replay tests.
- No live provider, credential retrieval, PRR send, graph acceptance, export,
  publication, legal action, or factory changes.

## Relevant Context Entry Points

- `AGENTS.md`
- `packages/agent/src/runtime.ts`
- `packages/agent/src/specialist-runner-kernel.ts`
- `packages/agent/src/specialist-handoff-manifest.ts`
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/local-runtime/src/mounted-agent-artifact-stores.ts`
- `packages/local-runtime/src/runtime-factory.ts`

## Risk Lane

Yellow. The vertical is local, reversible, fixture-backed, and exercises no
credential, remote transfer, external effect, or accepted-truth action.

## Targeted Verification

- `npm test -- packages/agent/test/runtime.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/memory-runtime.test.ts`
- `npm test -- packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts`
- `npm run typecheck`

Success means the complete local task can be reconstructed from mounted Git-era
product state and repository tests without live credentials.

## Integration Verification

Run `npm run verify` on the latest `neo`; allow no new failure beyond
`docs/agentic/baselines/2026-08-01-integration-verification.md`.

## Escalation Conditions

Escalate for credential or secret-store access, remote provider byte transfer,
workspace mutation that risks data loss, fallback storage, changed approval or
truth authority, unavailable dependency, or the same cause surviving two
focused repair attempts.
