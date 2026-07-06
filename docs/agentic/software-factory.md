# Cestus Software Factory

Cestus uses an autonomous software-factory workflow.

## Canonical Project Skill

The compact operating playbook lives at `.agents/skills/cestus-software-factory/SKILL.md`.

- OpenAI Codex is the harness. Codex discovers repo-local skills from `.agents/skills`.
- Claude Code, Opencode, and other generic agents should read it through the pointer in `AGENTS.md`.
- Child-thread prompts should name this skill instead of repeating the full factory contract.
- This document remains the deeper reference for durable claims, prior readiness evidence, and factory history.

The skill and this document must stay aligned. If the workflow changes, update both and run:

```bash
uv run --with pyyaml python /home/drake/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/cestus-software-factory
npm run factory:check
```

## Operating Basis

Cestus follows a hybrid of Steipete-style tight agent feedback loops and Factory-inspired mission execution, implemented through OpenAI Codex conventions rather than Factory's harness.

- Keep reusable context in repo files rather than long one-off prompts.
- Break broad work into focused units a fresh agent can hold in context.
- Define validation contracts before implementation when practical.
- Use fresh review contexts because implementers are biased toward confirming their own changes.
- Make local commands scriptable and modest enough for agents to run repeatedly.
- Record proof in commits, claims, specs, plans, or final handoffs.

Reference material:

- Steipete, "Just Talk To It": https://steipete.me/posts/just-talk-to-it
- Steipete, "My Current AI Dev Workflow": https://steipete.me/posts/2025/optimal-ai-development-workflow
- Factory, "How Missions Work": https://factory.ai/news/missions-architecture
- Factory, "Planning & Validation": https://docs.factory.ai/features/missions/planning
- OpenAI Codex, "Agent Skills": https://developers.openai.com/codex/skills
- OpenAI Codex, "Customization": https://developers.openai.com/codex/concepts/customization

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

## Security Governance Plan Readiness

The security, threat-model, and data-governance plan was prepared from the approved design spec on 2026-07-05.

Required design and plan files:

- `docs/superpowers/specs/2026-07-05-security-threat-model-data-governance-design.md`
- `docs/superpowers/plans/2026-07-05-security-threat-model-data-governance-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded command evidence:

```text
npm run factory:check
factory-readiness passed
```

Governance implementation scope remains backend/domain work grounded in append-only ontology events. Runtime wiring, UI changes, live credentials, encryption/key management, and ingestion connector work require separate approved plans.

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

## Public Ingestion Pipeline Plan Readiness

The public ingestion pipeline plan was prepared from the approved design spec on 2026-07-05.

Required design and plan files:

- `docs/superpowers/specs/2026-07-05-public-ingestion-pipeline-design.md`
- `docs/superpowers/plans/2026-07-05-public-ingestion-pipeline-implementation.md`

Factory readiness now checks both files through `scripts/check-agent-readiness.mjs`.

Recorded targeted command evidence from the implementation slice:

```text
npm test -- packages/ingestion/test/workspace.test.ts packages/ingestion/test/local-filesystem.test.ts packages/ingestion/test/source-registry.test.ts packages/ingestion/test/smoke.test.ts
Test Files  4 passed (4)
Tests  9 passed (9)

npm test -- packages/ingestion/test/archive-adapter.test.ts packages/ingestion/test/import-service.test.ts packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts
Test Files  4 passed (4)
Tests  23 passed (23)

npm test -- packages/ingestion/test/parser.test.ts packages/ingestion/test/provider-adapter.test.ts packages/ingestion/test/cli.test.ts packages/ui/test/ingestion-workspace.test.tsx packages/ui/test/ingestion-app-integration.test.tsx
Test Files  5 passed (5)
Tests  22 passed (22)
```

Final verification evidence:

```text
npm run factory:check
factory-readiness passed

npm run verify
typecheck passed
Test Files  55 passed
Tests  394 passed
vite build succeeded
factory-readiness passed
```

Provider live checks for Mistral Document AI or similar document-AI services are explicit opt-in checks and are not part of standard factory verification. Standard verification uses local contracts, fake providers, approval gates, and provenance assertions so agents can validate the ingestion pipeline without credentials or outbound document transfer.

## Portable Workspace Mount Plan Readiness

The portable workspace mount plan was prepared from the approved design spec on 2026-07-06.

Required design and plan files:

- `docs/superpowers/specs/2026-07-06-portable-workspace-mount-design.md`
- `docs/superpowers/plans/2026-07-06-portable-workspace-mount-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded targeted command evidence from the implementation slice:

```text
npm test -- packages/workspace/test/workspace.test.ts
Test Files 1 passed (1)
Tests 16 passed (16)
workspace package tests passed

npm test -- packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts
Test Files 3 passed (3)
Tests 35 passed (35)
local runtime config and CLI tests passed

npm test -- packages/local-runtime/test/http-handler.test.ts packages/local-runtime/test/auth-and-seed.test.ts
Test Files 2 passed (2)
Tests 18 passed (18)
local runtime portable mount tests passed

npm test -- packages/ingestion/test/workspace.test.ts packages/workspace/test/workspace.test.ts
Test Files 2 passed (2)
Tests 18 passed (18)
ingestion workspace delegation tests passed

npm test -- packages/ui/test/request-data-boundary.test.ts
Test Files 1 passed (1)
Tests 5 passed (5)
UI boundary and readiness tests passed
```

Final verification evidence:

```text
npm run factory:check
factory-readiness passed

npm run verify
typecheck passed
Test Files 70 passed (70)
Tests 615 passed (615)
tests passed
vite build succeeded
factory-readiness passed
```

Portable mode uses one canonical workspace root and one canonical `ledger/ontology.sqlite`. Repo-local and explicit SQLite modes remain compatibility/developer modes. Silent fallback to internal storage is forbidden in portable mode.

## Ingestion Runtime Wiring Plan Readiness

The ingestion runtime wiring plan was prepared from the approved design spec on 2026-07-06.

Required design and plan files:

- `docs/superpowers/specs/2026-07-06-ingestion-runtime-wiring-design.md`
- `docs/superpowers/plans/2026-07-06-ingestion-runtime-wiring-implementation.md`

Factory readiness now checks both files through `scripts/check-agent-readiness.mjs`.

Recorded targeted command evidence from the runtime wiring implementation slice:

```text
npm test -- packages/ingestion/test/runtime-contracts.test.ts packages/ingestion/test/runtime.test.ts
Runtime core targeted verification passed.

npm test -- packages/ingestion/test/runtime.test.ts packages/ingestion/test/runtime-import-stale-source.test.ts packages/ingestion/test/import-service.test.ts packages/ingestion/test/archive-adapter.test.ts packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts packages/ingestion/test/local-filesystem.test.ts
Stale-source verification targeted command passed, covering changed regular files, missing files, changed container hashes, and changed archive child hashes before blob writes.

npm test -- packages/ingestion/test/runtime-jobs-provider.test.ts packages/ingestion/test/provider-adapter.test.ts packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts
Runtime jobs, retry, provider approval, and diagnostics targeted command passed.

npm test -- packages/ingestion/test/cli.test.ts
npm run ingestion:help
CLI runtime wiring targeted command and help command passed.

npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts packages/local-runtime/test/auth-and-seed.test.ts packages/local-runtime/test/http-handler.test.ts packages/ingestion/test/runtime.test.ts
HTTP route wiring targeted command passed with transport-only route coverage and storage-path rejection checks.

npm test -- packages/ui/test/ingestion-http-adapter.test.ts packages/ui/test/ingestion-workspace.test.tsx packages/ui/test/ingestion-app-integration.test.tsx packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
UI adapter, explicit approval gates, diagnostics, app integration, and browser boundary targeted command passed with 5 test files and 35 tests.
```

Final verification evidence from the runtime wiring readiness gate:

```text
npm run verify
typecheck passed
Test Files  75 passed
Tests  651 passed
tests passed
vite build succeeded
factory-readiness passed
```

Live provider checks for Mistral Document AI or similar document-AI services remain explicit opt-in checks and are not part of standard factory verification. Standard verification uses local runtime contracts, fake providers, approval-only provider gates, and no outbound document transfer.

## Portable Workspace Ops Plan Readiness

The portable workspace ops plan was prepared from the approved design spec on 2026-07-06.

Required design and plan files:

- `docs/superpowers/specs/2026-07-06-portable-workspace-ops-design.md`
- `docs/superpowers/plans/2026-07-06-portable-workspace-ops-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded command evidence:

```text
npm run factory:check
factory-readiness passed
```

Workspace ops implementation remains CLI/JSON-first package work. Runtime HTTP endpoints, UI panels, final portable mount binding, backup copying, restore flows, and canonical repair execution require separate approved plans.

## Legacy Cestus Import Plan Readiness

The legacy old-Cestus import plan was prepared from the approved design spec on 2026-07-06.

Required design and plan files:

- `docs/superpowers/specs/2026-07-06-legacy-cestus-import-design.md`
- `docs/superpowers/plans/2026-07-06-legacy-cestus-import-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded targeted command evidence from the implementation slice:

```text
npm test -- packages/ontology/test/contracts.test.ts packages/ingestion/test/legacy-plugins.test.ts packages/ingestion/test/legacy-inspector.test.ts packages/ingestion/test/legacy-report.test.ts packages/ingestion/test/legacy-projection.test.ts packages/ingestion/test/legacy-read-api.test.ts packages/ingestion/test/legacy-import-service.test.ts packages/ingestion/test/legacy-staging.test.ts packages/ingestion/test/legacy-cli.test.ts
```

Final verification evidence:

```text
npm run verify
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

Legacy import remains recon-first. Every legacy file is evidence first, ontology staging can only append evidence-tied `assertion.proposed`, and accepted assertion, entity, relationship, or resolution events are forbidden during import. The readiness evidence is evidence-first and asserts only behavior proposed, reviewed, and verified through the completed legacy import slice.

## Portable Workspace Attachment Ops Plan Readiness

The portable workspace attachment ops plan was prepared from the approved design spec on 2026-07-06.

Required design and plan files:

- `docs/superpowers/specs/2026-07-06-portable-workspace-attachment-ops-design.md`
- `docs/superpowers/plans/2026-07-06-portable-workspace-attachment-ops-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded targeted command evidence from the implementation slice:

```text
npm test -- packages/workspace/test/workspace.test.ts
workspace identity guard tests passed

npm test -- packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts packages/local-runtime/test/http-handler.test.ts
local runtime portable attachment config tests passed

npm test -- packages/workspace-ops/test/layout.test.ts packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts packages/workspace-ops/test/backup.test.ts
workspace ops canonical layout tests passed

npm test -- packages/workspace-ops/test/cli.test.ts
workspace ops executable tests passed
```

Final verification evidence:

```text
npm run verify
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

Portable attachment mode lets an operator create, configure, detect, verify, open, and diagnose an external-drive workspace from CLI/runtime commands. Portable mode still uses one canonical external-drive ledger at `ledger/ontology.sqlite`, never falls back to internal storage, and reports missing or swapped drives through secret-safe diagnostics.
