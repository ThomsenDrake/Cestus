# Resident Lifecycle Bootstrap Design

Date: 2026-07-10

## Purpose

Cestus has one default resident agent identity, `agent_default`, but the current runtime only ensures that identity immediately before agent task or memory mutation. This leaves a newly opened workspace with no first-class resident identity until some later agent operation happens.

This design makes the default resident identity visible and ledger-backed as part of operator/runtime workspace create and mount/open flows. It keeps the low-level portable workspace manifest and layout helpers pure, preserves append-only ledger semantics, and prevents duplicate identity initialization across restarts, remounts, and concurrent opens.

## Goals

- Initialize one default resident identity, `agent_default`, before the first resident task or memory mutation in a usable workspace ledger.
- Keep `packages/workspace` manifest and layout helpers non-mutating and ledger-free.
- Bootstrap only from operator/runtime entrypoints that already own a usable ledger open.
- Treat the ledger as the only durable source of identity truth.
- Make bootstrap idempotent under repeated restarts, remounts, and concurrent runtime opens.
- Fail closed on copied, mismatched, duplicated, corrupted, or unreadable resident identity state.
- Surface not-mounted, initializing, ready, and blocked identity states in runtime DTOs and the Agent cockpit.
- Keep status, detection, and workspace verification reads mutation-free.
- Keep provider accounts, credentials, model names, and backend adapters separate from the resident agent identity.
- Preserve a path from solo portable workspaces to team mode with one default workspace resident agent.

## Non-Goals

- Creating multiple permanent resident agent personas.
- Moving identity bootstrap into `createPortableWorkspace()`, `mountPortableWorkspace()`, workspace layout detection, or workspace verification.
- Updating provider credential, context-pack, prompt-template, handoff, or specialist-runner behavior.
- Sending provider bytes, launching model calls, creating tasks, recording memory, accepting graph truth, sending PRRs, exporting reports, or running repairs during identity bootstrap.
- Rewriting, deleting, compacting, or repairing identity ledger history as bootstrap compensation.

## Approved Direction

The low-level portable workspace helper remains pure. It creates or reads secret-free manifest and layout state only.

Resident identity bootstrap belongs to operator/runtime code paths that open a usable ledger:

1. The local-runtime `create-workspace` command creates the portable workspace layout, opens the new workspace ledger, then bootstraps `agent_default`.
2. The local runtime mount/open path resolves the portable workspace, opens its canonical ledger, then bootstraps or verifies `agent_default` before agent task or memory mutation can proceed.

Status, detect, verify, and workspace-ops reads never append identity events. They may report projected identity lifecycle state, but they do not repair it.

## Existing Identity Contract

The current `agent.identity.initialized` event already carries the authoritative resident workspace binding:

```text
payload.residentAgentId = "agent_default"
payload.workspaceId = "<mounted workspace id>"
streamId = "agent_identity_agent_default"
```

The mounted portable workspace manifest remains the authoritative workspace identity for storage selection. The resident identity event records that the default resident agent belongs to that workspace. Bootstrap readiness requires both values to match.

If an implementation context lacks `payload.workspaceId` on the identity initialization event, the minimal schema change is to add a strict `workspaceId` field to `agent.identity.initialized`, require the `ws_...` identifier format, and require bootstrap readback to compare it with the mounted workspace manifest ID. Without that binding, copied-workspace and mismatched-ledger detection is not sound.

## Canonical Initialization

Bootstrap requires exactly one canonical `agent.identity.initialized` event for `agent_default` in the identity stream. This does not require the identity stream to contain only one event forever. Future reviewed identity events such as `agent.identity.updated` may evolve label, policy, or capability metadata while preserving the initial workspace binding.

A canonical initialization event has:

- `residentAgentId` equal to `agent_default`.
- `workspaceId` equal to the workspace currently mounted or created by the runtime entrypoint.
- `label` equal to the default resident label unless a future approved identity update changes the projected label.
- `policyId`, allowed run types, and memory projection version that satisfy the current agent contracts.
- `streamId` equal to `agent_identity_agent_default`.
- a valid event context with a runtime/operator actor that is not a provider identity.

If the identity stream has zero canonical initialization events, bootstrap may attempt one append. If the stream has exactly one canonical initialization event, bootstrap is ready. If the stream has more than one initialization event, a mismatched workspace ID, invalid payload, unreadable stored event, or any validation failure, bootstrap is blocked.

## Bootstrap Algorithm

Bootstrap is deterministic append-or-readback:

1. Resolve the workspace binding from the operator/runtime entrypoint.
2. Open the canonical ledger for that workspace.
3. Read `agent_identity_agent_default`.
4. If readback proves exactly one canonical initialization event for the same workspace, return `ready`.
5. If the stream is empty, append `agent.identity.initialized` with `expectedNextSequence: 1`.
6. Read back `agent_identity_agent_default` after append.
7. Return `ready` only after readback proves the canonical identity.
8. If append fails with an identity-stream concurrency conflict, read back the stream and apply the same proof rules.
9. Return `blocked` for any other append error, read error, validation error, duplicate initialization, mismatched workspace binding, or unsafe identity payload.

Duplicate conflict is not success by itself. It becomes success only when the post-conflict readback proves the existing identity is exactly the canonical `agent_default` identity for the mounted workspace.

## Create-Workspace Behavior

The local-runtime `create-workspace` command has two resource effects: filesystem layout creation and ledger append. They are not cross-resource transactional.

The command sequence is:

1. Create a valid portable workspace manifest and canonical directory layout.
2. Open the new workspace ledger at `ledger/ontology.sqlite`.
3. Run resident identity bootstrap.
4. Report success only if the bootstrap readback reaches `ready`.

If identity bootstrap fails after the filesystem layout exists, the command fails visibly with a safe diagnostic. It does not delete, rewrite, reset, or compensate the manifest, layout, or ledger. The resulting workspace remains recoverable: a rerun, remount, or explicit runtime open can retry append-or-readback against the same ledger.

## Runtime Mount/Open Behavior

Runtime mount/open resolves the portable workspace manifest, verifies the expected workspace ID when configured, opens the canonical ledger, and runs resident identity bootstrap before reporting agent identity readiness as `ready`.

The runtime may still expose safe health or diagnostics for a mounted workspace whose resident identity bootstrap is blocked, but resident task and memory mutation routes must check identity lifecycle readiness. They must not silently create identity on demand.

For non-mounted states, agent identity lifecycle is `not-mounted`, and task or memory mutation is blocked with a safe action to mount or create a workspace.

## Status And Cockpit States

Runtime DTOs and the Agent cockpit expose resident identity lifecycle without making it durable state:

- `not-mounted`: no portable workspace is mounted or opened by the runtime entrypoint.
- `initializing`: a process-local bootstrap operation is in flight around an open ledger.
- `ready`: ledger readback proves the canonical initialization event for the mounted workspace.
- `blocked`: bootstrap or readback failed closed.

Only `ready` is durable in the sense that it can be recomputed from ledger events and the mounted workspace binding. `initializing` is process-local and exists only while the append-or-readback operation is running. `blocked` is derived from the latest attempted readback or failure category and must be represented with secret-safe diagnostics.

Status, detect, verify, and workspace-ops commands remain mutation-free. They may read identity events and report the derived lifecycle state, but they never append `agent.identity.initialized`.

## Failure Handling

Bootstrap blocks on:

- identity stream unreadable or stored event validation failure
- no workspace binding available from a runtime-owned workspace open
- identity initialization event for a different workspace ID
- more than one `agent.identity.initialized` event in `agent_identity_agent_default`
- identity event that names a resident agent other than `agent_default`
- identity event with provider, model, credential, or secret-shaped material
- append failure that is not a concurrency conflict followed by exact readback success
- concurrent append conflict where readback does not prove the canonical identity

Blocked output includes a safe category, safe message, allowed repair actions, mounted workspace ID when safe, and identity event IDs when readback was valid. It must not include ledger paths, provider secrets, environment variable names, raw SQLite errors, or raw event JSON.

## Workspace Switch And Copied Ledger Behavior

Workspace switching is safe because each mounted portable workspace opens its own canonical ledger. When a different workspace is mounted, runtime readiness is recomputed from that workspace's manifest ID and identity stream.

If a workspace directory is copied with a ledger from another workspace, bootstrap sees the manifest workspace ID and identity event workspace ID mismatch and blocks. It must not update the original initialization event or append a second initialization event to reinterpret the ledger. A repair or migration for copied workspaces would require a separate approved design.

If the operator switches back to a previously valid workspace, readback should return `ready` without appending a new initialization event.

## Replay And Projection Semantics

The resident identity projection remains rebuildable from ledger events. The projection may include future identity updates, but the first initialization event remains the authoritative workspace binding.

Replay behavior:

- Empty identity stream means no resident identity has been initialized for that ledger.
- Exactly one canonical initialization means the default resident identity exists.
- Later reviewed identity update events can alter mutable identity metadata only after the initial workspace binding exists.
- Duplicate initialization events are invalid bootstrap state and must be visible as blocked readiness.
- Projection-only identity defaults are forbidden.

## Provider Boundary

Bootstrap records no provider identity. OpenAI, xAI, BYOK endpoints, local models, OAuth sessions, API keys, and credential references remain provider backends or credential bindings only. They do not affect the durable resident identity.

The bootstrap actor may be a local runtime or operator actor. That actor is provenance for initialization, not a provider account and not a second resident agent.

## Team Mode Path

Team mode keeps the same default resident identity per workspace. Future team behavior may add role-aware human approvals, workspace-scoped provider credential references, network exposure policy, and identity metadata updates. It should not create multiple permanent default agent personas without a separate approved design.

The workspace binding in `agent.identity.initialized` remains useful in team mode because it lets every server or device verify that it has opened the intended workspace ledger before allowing resident agent task or memory mutation.

## Testing Requirements

Implementation must add focused tests for:

- Fresh create succeeds only after append and exact readback of `agent_default`.
- Fresh create bootstrap failure leaves a valid recoverable workspace and never deletes or rewrites the ledger.
- Rerun or remount after a fresh create failure safely retries append-or-readback.
- Runtime mount/open appends identity before the first task or memory mutation.
- Task and memory mutation routes require identity lifecycle `ready` and no longer silently initialize identity.
- Status, detect, verify, and workspace-ops reads do not append identity events.
- Restart and remount of an already initialized workspace do not duplicate initialization events.
- Concurrent opens produce at most one initialization event and the loser succeeds only after exact readback.
- Append conflict followed by mismatched, duplicate, or unreadable readback blocks.
- Copied workspace or mismatched workspace ID blocks.
- Corrupted identity stream blocks with secret-safe diagnostics.
- Workspace switch recomputes readiness per mounted workspace and does not carry identity from the previous workspace.
- Provider descriptors, provider credential references, and model metadata never appear in identity bootstrap events.

## Verification For This Spec

Documentation-only validation for this design is:

```bash
git diff --check
npm run factory:check
```

Implementation planning must define task-scoped targeted commands, owned files, failing tests first, full `npm run verify`, and review gates before code changes.
