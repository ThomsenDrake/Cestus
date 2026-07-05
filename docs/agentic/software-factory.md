# Cestus Software Factory

Cestus uses an autonomous software-factory workflow.

## Roles

- Worker: implements one task from the active plan.
- Reviewer: checks the worker's diff against the spec, tests, and plan.
- Gatekeeper: runs `npm run verify` and confirms no forbidden unfinished marker remains.

## Durable Task Claims

Concurrent workers claim tasks in repo-local files so the assignment survives chat context, process restarts, and worktree handoffs.

- Claim file path: `docs/agentic/claims/task-<number>-<short-slug>.md`.
- Claim before editing task files by creating the claim file and committing it with `chore: claim task <number>`.
- Include the plan path, task heading, worker identity, branch, worktree path, claimed-at timestamp in UTC, owned files, and current status.
- Use statuses `claimed`, `in-progress`, `blocked`, `ready-for-review`, `released`, and `merged`.
- A task is available only when no claim file exists for it, or when the latest committed claim status is `released`, `blocked`, or `merged`.
- Do not edit another worker's claim except to record a reviewer decision or coordinator handoff.
- Release a claim by changing its status to `released`, recording the reason, and committing that update before another worker takes over.

## Work Order Lifecycle

1. Claim one unchecked task using a durable task-claim file.
2. Read the files named in that task.
3. Write the failing test.
4. Run the targeted failing command.
5. Write the production change.
6. Run the targeted passing command.
7. Run `npm run verify`.
8. Commit the task.
9. Hand off to review.

## Stop Conditions

Stop when a dependency is unavailable, a verifier fails after two focused repair attempts, a schema choice conflicts with the ontology spec, a storage change risks data loss, or a task needs credentials or unavailable external services.

## Ontology Layer Final Readiness

The ontology foundation reached factory readiness on 2026-06-30 in worktree
`/home/drake/Projects/Cestus/.worktrees/ontology-layer-factory` on branch
`codex/ontology-layer-factory`.

Final gate command:

```bash
npm run verify
```

Observed command evidence:

```text
typecheck passed
Test Files  11 passed (11)
Tests  55 passed (55)
tests passed
factory-readiness passed
```

Reviewer checklist evidence:

- Zod event contracts: `packages/ontology/src/contracts.ts` defines all event payload schemas, `eventContracts`, and `validateKnowledgeEvent`; `packages/ontology/test/contracts.test.ts` verifies guided contracts, strict payload rejection, provenance validation, inherited-name rejection, diagnostic issue details, and payload-correlated append typing.
- Evidence-backed assertions: `packages/ontology/src/assertion-service.ts` requires `evidenceId` on proposal and accepts only after a proposal exists; `packages/ontology/test/assertion-service.test.ts` verifies proposal provenance, acceptance causation, reused correlation, and rejection without a proposal.
- Append-only ledger and SQLite durability: `packages/ontology/test/ledger-contract.test-helper.ts` exercises stream sequencing, global order, stream reads, optimistic concurrency, invalid append rollback, and immutable read snapshots for ledger implementations. `packages/ontology/test/sqlite-event-ledger.test.ts` verifies persisted reopen, stored max sequence allocation, read-time validation, and SQLite stream sequence uniqueness at the constraint layer.
- Rebuildable projection: `packages/ontology/test/fixtures/golden-ledger.ts` is the replayable event fixture; `packages/ontology/test/graph-projection.test.ts` validates all fixture events and rebuilds accepted assertions, resolved entities, and assertion provenance from those ledger events.
- JSON-LD boundary export: `packages/ontology/src/jsonld-export.ts` exports from the graph projection, and `packages/ontology/test/jsonld-export.test.ts` builds the projection from golden ledger events before exporting accepted graph state with provenance references.
- Factory gate: `scripts/check-agent-readiness.mjs` is run by `npm run verify` through `npm run factory:check` and reported `factory-readiness passed`, confirming the tracked text files contain no forbidden unfinished markers outside the explicit allow convention.

## Public Records Workflow Plan Readiness

The PRR workflow plan was prepared from the approved design spec on 2026-07-01.

Required design and plan files:

- `docs/superpowers/specs/2026-07-01-public-records-request-workflow-design.md`
- `docs/superpowers/plans/2026-07-01-public-records-request-workflow-implementation.md`

Factory readiness now checks both files through `scripts/check-agent-readiness.mjs`.

Recorded command evidence:

```text
npm run factory:check
factory-readiness passed
```

Factory scope remains backend/domain work. UI design and build decisions require direct user collaboration.

## Ledger-Backed PRR Workspace Plan Readiness

The ledger-backed Requests workspace plan was prepared from the approved design spec on 2026-07-03.

Required design and plan files:

- `docs/superpowers/specs/2026-07-03-ledger-backed-prr-workspace-design.md`
- `docs/superpowers/plans/2026-07-03-ledger-backed-prr-workspace-implementation.md`

Factory readiness now checks both files through `scripts/check-agent-readiness.mjs`.

Recorded command evidence:

```text
npm test -- packages/ui/test/visual-contract.test.ts packages/ui/test/ui-picker.test.tsx packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
Test Files  4 passed (4)
Tests  16 passed (16)

npm run factory:check
factory-readiness passed

npm run verify
typecheck passed
Test Files  40 passed (40)
Tests  318 passed (318)
tests passed
vite build succeeded
factory-readiness passed
```

Preview evidence: pending controller preview gate

## Requests Detail Modal Plan Readiness

The Requests detail modal plan was prepared from the approved design spec on 2026-07-04.

Required design and plan files:

- `docs/superpowers/specs/2026-07-04-requests-detail-modal-design.md`
- `docs/superpowers/plans/2026-07-04-requests-detail-modal-implementation.md`

Factory readiness now checks both files through `scripts/check-agent-readiness.mjs`.

Recorded command evidence:

```text
npm test -- packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
Test Files  2 passed (2)

npm run verify
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

Preview evidence: pending final controller preview gate.

## Durable Local PRR Runtime Plan Readiness

The durable local PRR runtime plan was prepared from the approved design spec on 2026-07-05.

Required design and plan files:

- `docs/superpowers/specs/2026-07-05-durable-local-prr-runtime-design.md`
- `docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md`

Factory readiness now checks both files through `scripts/check-agent-readiness.mjs`.

Recorded command evidence:

```text
npm test -- packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
Test Files  2 passed (2)
Tests  16 passed (16)

npm run factory:check
factory-readiness passed

npm run verify
typecheck passed
Test Files  50 passed (50)
Tests  397 passed (397)
tests passed
vite build succeeded
factory-readiness passed
```

Preview evidence:

```text
npm run ui:build
vite build succeeded

CESTUS_LOCAL_PORT=8788 npm run local:runtime
Cestus local runtime listening on http://127.0.0.1:8788

curl -I http://127.0.0.1:8788/
HTTP/1.1 200 OK

curl -s http://127.0.0.1:8788/api/health
{"ok":true,"storageStrategy":"repo-local","bindMode":"loopback","authRequired":false,"devSeedEnabled":false}

curl -s http://127.0.0.1:8788/api/requests/workspace
Returned "cards":[] from an empty repo-local ledger without automatic seed data.

Local runtime stopped before task completion; follow-up curl returned 000.
```
