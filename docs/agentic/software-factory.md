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

## Lessons From Completed Parallel Slices

The portable workspace, ingestion runtime, workspace ops, and legacy import implementation threads produced several durable coordination lessons. These rules are part of the factory memory for future Cestus agents:

- **Audit before repair when git state is unclear.** A coordinator may observe a worktree while a worker is between reset, staged repair, and recommit. Before acting, inspect `git status`, current `HEAD`, relevant claims, and staged files. If the staged changes are intended, recommit them as forward work and rerun targeted plus full verification. Do not perform another history rewrite to repair ambiguous history.
- **Bound stale reviewer waits.** Reviewers are useful because they caught real defects, but review handles can stall. If no verdict, disk movement, or claim update appears after bounded monitor intervals, close/restart the reviewer or do an inline review against the Cestus review contract. Silent waiting is not a valid completion strategy.
- **Treat secret safety as structural.** Review findings repeatedly came from places that were not obvious payload strings: raw argv, no-value flags like token-shaped option names, diagnostic keys, `relatedIds`, boxed strings, custom serializers, nested arrays, and accessor-backed fields. Contract tests should prove keys and values are sanitized without invoking surprising getters.
- **Bind provenance to exact bytes and events.** Runtime and legacy import reviews found accounting mistakes around diagnostic event IDs, scan streams, stale source checks, report identity, candidate hashes, and imported evidence IDs. Every reported event ID, evidence link, migration report, and staged assertion must be tied to the exact artifact, content hash, stream, and approval that produced it.
- **Legacy import bootstraps a fresh ontology from artifacts.** The goal is not to trust or import the old ontology. Old-Cestus files, notes, metadata, manifests, and graph-like exports become evidence first; recognized structure may only become evidence-tied `assertion.proposed` after staging approval.
- **Keep UI as an operator cockpit, not a truth engine.** The first workspace bridge should aggregate browser-safe DTOs from local runtime, workspace ops, ingestion, legacy import, and PRR contracts. React may show status, diagnostics, and safe next commands, but it must not duplicate portable workspace validation, approval gates, accepted ontology decisions, repair execution, PRR sends, legal escalation, or hidden local copies of external-drive data.
- **Merge bridge slices after their providers.** The four-thread portable workspace, local smoke, legacy operator CLI, and operator bridge merge showed that aggregation work should land last. Bridge/status/UI slices depend on upstream contracts; after merging providers, rerun the bridge's targeted cross-boundary suites before full verification.
- **Keep compatibility shims named and tested.** Portable workspace integration exposed a parser boundary that mattered: provisional manifest parsing must stay strict, while canonical workspace identity parsing can accept newer manifests. Future agents should preserve names that reveal compatibility scope instead of aliasing older shims to newer canonical contracts.
- **Treat shared readiness history as append-only.** `docs/agentic/software-factory.md` is useful durable memory, but parallel slices commonly append to the same readiness area. Resolve these conflicts additively, never by replacing another slice's evidence. If readiness detail keeps growing, put detailed evidence in per-slice claim/readiness files and leave this document as the index.
- **Update test expectations from upstream contracts, not stale assumptions.** The operator status merge showed that a fresh canonical portable workspace now verifies as `ready`, not `degraded`. When a provider contract intentionally improves, update bridge expectations to match the provider contract instead of weakening the provider or preserving stale status labels.
- **Clean up only after evidence agrees.** A child thread is ready to archive only when the thread is idle, final handoff names the branch and commit, Git shows the branch is merged or intentionally preserved, verification evidence is recorded, and the worktree is clean. Newly approved implementation lanes should stay visible until their implementation work is actually finished.
- **Make public package boundaries as strict as runtime paths.** The resident-agent and ontology-bootstrap reviews found direct exported builders and helper APIs that were looser than their safer runtime wrappers. Future agents should test exported builders, projectors, provider readiness helpers, preview builders, and tool gateways directly with stale, missing, swapped, forged, or mismatched inputs.
- **Separate resident identity from execution backends.** Cestus has one resident workspace agent identity. Specialist workflows are run types under that identity, while OpenAI, xAI, BYOK endpoints, local models, subscription OAuth lanes, CLI harnesses, API keys, and credential references are provider backends only.
- **Recheck approval validity when consumed.** A stored approval is not enough. Runtime resume must revalidate independent human actor, approval class, preview hash, causation/provenance, active locks, current source hashes, and stale state before any gated effect reaches a domain service.
- **Keep approval cockpits out of the execution path.** The UI and CLI should append human approve/deny decisions and explain risk. They must not directly run PRR sends, provider byte transfer, legal escalation, export, destructive repair, accepted graph review, raw import, or legacy staging.
- **Test DTO safety as adversarial object safety.** Resident-agent slices exposed leaks through keys, IDs, provider health objects, malformed DTOs, prototype fields, and accessor-triggered throws. Browser DTO and diagnostics tests should cover keys, values, arrays, prototypes, getters, and parser failure paths, not just obvious secret strings.
- **Make prompt artifacts the remote-model boundary.** Provider calls should consume durable prompt artifact envelopes or typed `inputText` assembled from audited context packs. Do not restore callback-based hash-to-text resolvers, placeholder prompts, raw prompt logs, or ledger events that store production prompt text.
- **Use live providers where provider behavior is the contract.** Deterministic tests should stay credential-free, but provider/model integration slices should also have explicit live smoke checks against an approved endpoint. Live smoke output must be safe to record: provider IDs, model IDs, hashes, event IDs, counts, categories, and fixed markers only.
- **Match secret tests to their boundary.** Low-level secret predicates are useful for raw strings, but they are too blunt for whole public DTOs that legitimately contain field names such as provider health, auth labels, or credential-reference categories. Boundary tests should assert that actual values, errors, diagnostics, previews, and logs do not leak unsafe material.
- **Keep scratch execution state out of durable memory.** `.superpowers/sdd` files are local task scratch. Promote only durable conclusions into specs, implementation plans, claims, readiness records, or commits.

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

## Local Workspace Readiness Smoke Plan Readiness

The local workspace readiness smoke plan was prepared from the approved design spec on 2026-07-06.

Required design and plan files:

- `docs/superpowers/specs/2026-07-06-local-workspace-readiness-smoke-design.md`
- `docs/superpowers/plans/2026-07-06-local-workspace-readiness-smoke-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded targeted command evidence:

```text
npm test -- packages/local-runtime/test/workspace-readiness-smoke.test.ts packages/workspace-ops/test/layout.test.ts
Test Files  2 passed (2)
Tests  17 passed (17)
```

Recorded operator evidence:

```text
npm run local:workspace:smoke -- --json
schemaVersion local-workspace-readiness-smoke.v1
ok true
status ready
stderr bytes 0
```

Final verification evidence from the most recent full verify:

```text
npm run verify
typecheck passed
Test Files  93 passed (93)
Tests  833 passed (833)
vite build succeeded
factory-readiness passed
```

The smoke path remains local-only and proof-oriented, with no provider credentials, outbound document transfer, canonical repair execution, old-Cestus migration mapping, PRR sends, or legal escalation.

## Legacy Cestus Operator CLI Plan Readiness

The legacy Cestus operator CLI plan was prepared from the approved design spec on 2026-07-06.

Required design and plan files:

- `docs/superpowers/specs/2026-07-06-legacy-cestus-operator-cli-design.md`
- `docs/superpowers/plans/2026-07-06-legacy-cestus-operator-cli-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded targeted command evidence from the implementation slice:

```text
npm test -- packages/ingestion/test/legacy-runtime-types.test.ts packages/ingestion/test/portable-mount.test.ts packages/ingestion/test/legacy-claim-parser.test.ts packages/ingestion/test/legacy-runtime.test.ts packages/ingestion/test/legacy-cli-workflow.test.ts packages/ingestion/test/legacy-cli.test.ts packages/ingestion/test/cli.test.ts
npm run ingestion:help
npm run verify
```

The operator workflow remains recon-first, evidence-first, human-gated, and forbidden from accepted graph events. Raw import is approval/import split: approval records intent only, and import execution uses stale-source verification before blob writes. Staging preview is source-scoped and evidence-tied, staging approval requires selected human-approved candidate IDs, and staging execution can append only `assertion.proposed`.

## Operator Workspace Status And Import Bridge Implementation Readiness

The operator-facing workspace status and import bridge implementation was completed from the approved design direction on 2026-07-06.

Required design and plan files:

- `docs/superpowers/specs/2026-07-06-operator-workspace-status-import-bridge-design.md`
- `docs/superpowers/plans/2026-07-06-operator-workspace-status-import-bridge-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded targeted command evidence from the implementation slice:

```text
npm test -- packages/operator-status/test/contracts.test.ts
Operator status contract targeted verification passed.

npm test -- packages/local-runtime/test/operator-status.test.ts packages/local-runtime/test/operator-status-routes.test.ts
Local runtime status aggregation and HTTP route targeted verification passed.

npm test -- packages/ui/test/operator-status-adapter.test.ts packages/ui/test/request-data-boundary.test.ts
UI adapter parsing, runtime-unavailable fallback, redaction, and browser boundary targeted verification passed.

npm test -- packages/ui/test/operator-cockpit.test.tsx packages/ui/test/visual-contract.test.ts
Operator cockpit DOM safety, command display-only rendering, tab accessibility, and visual contract targeted verification passed.

npm test -- packages/ui/test/operator-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/dashboard.test.tsx packages/ui/test/ingestion-app-integration.test.tsx
Command screen integration, Requests preservation, and Ingestion preservation targeted verification passed.

npm test -- packages/local-runtime/test/operator-status.test.ts packages/local-runtime/test/operator-status-routes.test.ts packages/ui/test/operator-cockpit.test.tsx packages/ui/test/operator-app-integration.test.tsx
Failure-state smoke verification passed for missing drive, swapped drive, uninitialized workspace root, stale projections, ingestion approval blocks, source-changed-since-approval, legacy samples needed, raw legacy approval, runtime unavailable, and PRR zero-open readiness.
```

Final review remediation evidence for production provider wiring and safe-command hardening:

```text
npm test -- packages/operator-status/test/contracts.test.ts packages/workspace-ops/test/layout.test.ts packages/local-runtime/test/operator-status.test.ts packages/local-runtime/test/operator-status-routes.test.ts packages/local-runtime/test/server.test.ts packages/ui/test/operator-status-adapter.test.ts packages/ui/test/operator-cockpit.test.tsx packages/ui/test/operator-app-integration.test.tsx packages/ui/test/request-data-boundary.test.ts
Test Files 9 passed
Tests 77 passed

npm run verify
typecheck passed
Test Files 98 passed
Tests 880 passed
tests passed
vite build succeeded
factory-readiness passed
```

The implemented bridge depends on workspace-ops, ingestion, legacy import, PRR, and local-runtime status/readiness DTOs rather than duplicating their validation logic in React. The UI bridge remains read-only: it renders safe navigation, refresh, and display-only command descriptors, and it does not perform PRR sends, legal escalation, provider byte transfer, destructive repair, canonical ledger/blob mutation, accepted legacy ontology truth, or hidden local duplication of external-drive ontology data. Append-only ledger semantics, provenance requirements, projection rebuildability, evidence-first legacy import, legal escalation locks, and browser boundary safety are preserved by the implementation and covered by the targeted and full verification gates above.

## Resident Cestus Agent Design Readiness

The resident Cestus Agent design spec was prepared from the approved coordination-thread direction on 2026-07-07.

Required design file:

- `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`

Factory readiness checks this design file through `scripts/check-agent-readiness.mjs`.

Recorded command evidence:

```text
git diff --check
npm run factory:check
factory-readiness passed
```

The design keeps one default workspace resident agent identity with specialist run types underneath it. Model providers remain replaceable execution backends, not agent identities. The resident agent architecture preserves append-only ledger semantics, provenance, rebuildable projections, evidence-first legacy bootstrap, human-approved PRR send gates, legal escalation locks, provider byte-transfer approvals, secret-safe credential references, and portable workspace compatibility.

## Resident Cestus Agent Foundation Plan Readiness

The resident Cestus Agent foundation implementation plan was prepared from the approved design spec on 2026-07-07.

Required design and plan files:

- `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`
- `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded validation commands for the planning slice:

```text
git diff --check
npm run factory:check
npm run verify
```

The plan intentionally scopes the first resident-agent implementation to a measurable foundation: default resident identity, strict agent events and projections, fake-provider credential references, tool-gateway approval contracts, and minimal local runtime, CLI, operator-status, Command, and Agent UI surfaces without live credentials. Full legacy `ontology-bootstrap`, PRR, evidence, timeline, contradiction, investigation, report, live provider, and team hardening work remains split into focused follow-up implementation plans.

## Resident Cestus Agent Foundation Implementation Readiness

The resident Cestus Agent foundation was implemented from the approved design and foundation plan on 2026-07-07.

Required design and plan files:

- `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`
- `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded focused verification after final human-gate review fixes:

```text
npm test -- packages/ontology/test/agent-contracts.test.ts packages/ontology/test/contracts.test.ts packages/agent/test/projection.test.ts packages/agent/test/provider.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/runtime.test.ts packages/agent/test/specialists.test.ts packages/operator-status/test/contracts.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/operator-status.test.ts packages/local-runtime/test/operator-status-routes.test.ts packages/local-runtime/test/http-handler.test.ts packages/local-runtime/test/cli.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/command-model.test.ts packages/ui/test/app-smoke.test.tsx packages/ui/test/operator-app-integration.test.tsx
Test Files  19 passed
Tests  283 passed
```

Recorded full verification:

```text
npm run verify
typecheck passed
Test Files  119 passed
Tests  1110 passed
tests passed
vite build succeeded
factory-readiness passed
```

The implementation adds the first resident-agent foundation only: strict append-only agent event contracts, replayable projections, fake local model-provider support, secret-safe credential references, tool-gateway approval contracts, a minimal local runtime/CLI/HTTP surface, operator-status integration, first-class Agent UI, Command brief integration, and a specialist run-type registry that fails closed for workflow execution. It uses fake providers only and does not add live provider adapters, direct external byte transfer, PRR send execution, legal lock clearing, destructive repair, accepted graph decisions, or full specialist workflows. Final review restored explicit human-context validation for accepted graph truth and human-approved PRR actions after `agent` became a legal actor kind. Append-only ledger semantics, provenance requirements, projection rebuildability, human-approved PRR send gates, legal escalation locks, provider byte-transfer approvals, secret-safe credential references, evidence-first legacy bootstrap, and portable workspace compatibility remain preserved.

## Ontology Bootstrap Specialist Implementation Readiness

The ontology bootstrap specialist foundation was implemented from the approved zero-trust legacy import direction on 2026-07-07.

Required design and plan files:

- `docs/superpowers/specs/2026-07-07-ontology-bootstrap-specialist-design.md`
- `docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded focused verification:

```text
npm test -- packages/ontology-bootstrap/test/contracts.test.ts packages/ontology-bootstrap/test/dossier-builder.test.ts packages/ontology-bootstrap/test/read-model.test.ts packages/ontology-bootstrap/test/tool-previews.test.ts packages/ontology-bootstrap/test/fake-runtime.test.ts packages/ingestion/test/legacy-runtime.test.ts packages/ingestion/test/legacy-staging.test.ts
Test Files  7 passed
Tests  38 passed
```

Recorded full verification before readiness tracking:

```text
npm run verify
typecheck passed
Test Files  109 passed
Tests  977 passed
tests passed
vite build succeeded
factory-readiness passed
```

The implementation adds a pure `packages/ontology-bootstrap` package with strict DTO contracts, deterministic dossier generation from existing legacy reports and evidence links, a read-model helper, approval-preview builders, and a fake specialist runtime facade. It does not implement live model orchestration, direct old source-tree import, raw byte copy, staging execution outside existing legacy services, accepted ontology truth, legal/export actions, provider byte transfer, UI mutation, or destructive repair. Legacy-derived structure can only be represented as evidence-tied preview or dossier material; the only allowed staged ontology output remains `assertion.proposed` through existing legacy services after human staging approval.

## Resident Agent Provider/Auth First Slice Readiness

The resident agent provider/auth first slice was implemented from the approved provider/auth design and plan on 2026-07-07.

Required design and plan files:

- `docs/superpowers/specs/2026-07-07-resident-agent-provider-auth-design.md`
- `docs/superpowers/plans/2026-07-07-resident-agent-provider-auth-implementation.md`

Recorded focused verification:

```text
npm test -- packages/agent/test/credential-reference.test.ts packages/agent/test/provider-registry.test.ts packages/agent/test/provider-readiness.test.ts packages/agent/test/provider-selection.test.ts packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/ui/test/agent-provider-setup-cards.test.ts
Test Files  6 passed (6)
Tests  63 passed (63)
```

Recorded full verification:

```text
npm run verify
typecheck passed
Test Files  125 passed (125)
Tests  1173 passed (1173)
tests passed
Vite build succeeded
factory-readiness passed
```

This slice uses fake providers and fake secret stores only for standard verification. Live OpenAI, live xAI, BYOK, local model, and enterprise gateway calls remain separate approved work.

## Resident Agent Execution And Approval Readiness

The resident agent execution and approval slice was implemented from the approved design and plan on 2026-07-08.

Required design and plan files:

- `docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md`
- `docs/superpowers/plans/2026-07-07-resident-agent-execution-approval-implementation.md`

Recorded focused verification:

```text
npm test -- packages/agent/test/execution-types.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/approval-queue.test.ts packages/agent/test/execution-loop.test.ts packages/agent/test/tool-gateway.test.ts
Test Files  5 passed (5)
Tests  90 passed (90)
```

Recorded full verification:

```text
npm run verify
typecheck passed
Test Files  123 passed (123)
Tests  1187 passed (1187)
tests passed
vite build succeeded
factory-readiness passed
```

Whitespace verification:

```text
git diff --check
no output
```

This slice uses fake execution only. Approval does not execute tools directly; the runtime resumes only after matching independent human approval and current preview, lock, provenance, and secret-safety checks.

Live provider byte transfer, PRR send/follow-up, legal escalation, export/publication, destructive repair, accepted graph review execution, local runtime routes, CLI approval commands, and browser cockpit UI remain follow-up slices.

Accepted residual: active-lock fake loop failures use schema-compatible `legal-lock-active` because the current ontology/gateway failure categories do not include generic `lock-active`.

## Resident Agent Tranche Integration Readiness

The resident-agent foundation, ontology-bootstrap specialist, provider/auth, and execution/approval branches were integrated on `neo` on 2026-07-08.

Merged branch evidence:

- `codex/cestus-resident-agent-foundation`
- `codex/ontology-bootstrap-specialist`
- `codex/resident-agent-provider-auth-design`
- `codex/resident-agent-execution-approval-design`

Final merged commit on `neo`:

```text
d4b83bb Merge branch 'codex/resident-agent-execution-approval-design' into codex/review-agent-provider-execution-integration
```

Recorded integration-focused verification before the final merge:

```text
npm test -- packages/agent/test/credential-reference.test.ts packages/agent/test/provider-registry.test.ts packages/agent/test/provider-readiness.test.ts packages/agent/test/provider-selection.test.ts packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/ui/test/agent-provider-setup-cards.test.ts packages/agent/test/execution-types.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/approval-queue.test.ts packages/agent/test/execution-loop.test.ts packages/agent/test/tool-gateway.test.ts
Test Files  11 passed
Tests  153 passed
```

Recorded final verification on merged `neo`:

```text
npm run verify
typecheck passed
Test Files  129 passed
Tests  1250 passed
tests passed
vite build succeeded
factory-readiness passed
```

Integration lesson: future resident-agent work should start from `neo` after this checkpoint and preserve the direct-boundary, consume-time approval, provider-secret, and zero-trust bootstrap hardening added by the four finished threads.

## Provider Readiness Health UX Implementation Readiness

The provider readiness health UX slice was implemented from the approved resident-agent provider/auth design and the live Nous provider correction on 2026-07-08.

Required design and plan files:

- `docs/superpowers/specs/2026-07-07-resident-agent-provider-auth-design.md`
- `docs/superpowers/plans/2026-07-08-provider-readiness-health-ux-implementation.md`

Recorded focused verification:

```text
npm test -- packages/agent/test/provider-readiness.test.ts packages/local-runtime/test/agent-provider-readiness.test.ts packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-provider-smoke.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-provider-setup-cards.test.ts packages/ui/test/agent-workspace.test.tsx
Test Files  8 passed
Tests  62 passed
```

Recorded live Nous smoke:

```text
schemaVersion agent-provider-smoke.v1
providerId provider_nous_portal
modelId tencent/hy3:free
ok true
category ok
marker cestus-live-provider-ok
outputHash sha256:40f46f72360d42f803171329431c6ad304ea18ddd4f575cda51135a1de1704f3
```

Recorded full verification:

```text
npm run verify
typecheck passed
Test Files  132 passed
Tests  1268 passed
tests passed
vite build succeeded
factory-readiness passed
```

Whitespace verification:

```text
git diff --check
no output
```

This slice uses live Nous as the authoritative provider/model acceptance path. Deterministic tests cover DTO contracts, redaction, route safety, and UI rendering. Readiness remains display-only and byte-transfer-gated; it does not approve private evidence transfer or any other risky effect.

## Resident Agent Prompt Artifact Context Resolver Readiness

The resident-agent prompt artifact and context resolver slice was implemented and verified from the approved resident-agent execution, provider/auth, and prompt-artifact implementation direction on 2026-07-08.

Required design and plan files:

- `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`
- `docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md`
- `docs/superpowers/specs/2026-07-07-resident-agent-provider-auth-design.md`
- `docs/superpowers/plans/2026-07-08-resident-agent-prompt-artifact-context-resolver-implementation.md`

Factory readiness tracks the prompt artifact context resolver plan through `scripts/check-agent-readiness.mjs`.

Recorded focused verification:

```text
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/context-packs.test.ts packages/ontology/test/agent-contracts.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/provider.test.ts packages/agent/test/openai-compatible-provider.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts packages/local-runtime/test/agent-http-routes.test.ts
Test Files  10 passed (10)
Tests  118 passed (118)
```

Recorded live Nous smoke evidence:

```text
npm run agent:nous:smoke
ok true
input artifact hash present
output artifact hash present
invocation event IDs present: 2
context pack IDs present: workspace-runtime-status.v1
omission count: 4
```

Recorded full verification:

```text
npm run verify
typecheck passed
Test Files  133 passed (133)
Tests  1287 passed (1287)
tests passed
vite build succeeded
factory-readiness passed
```

Whitespace verification:

```text
git diff --check
no output
```

Factory check:

```text
npm run factory:check
factory-readiness passed
```

Provider prompts now flow through durable prompt artifact envelopes bound to context pack refs, template metadata, omissions, stale-input metadata, provider-transfer policy, and stable SHA-256 artifact hashes. Production prompt text is not stored in ledger events, DTOs, diagnostics, docs, tests, or logs; model invocation events record only safe prompt artifact audit metadata.

The live Nous smoke is an approved provider acceptance check for this slice. The slice adds no PRR send or follow-up execution, legal escalation, export or publication, destructive repair, accepted graph review execution, hidden external effects, or direct cockpit execution path.

Post whole-branch review fixture cleanup on 2026-07-08 removed credential-shaped and raw-error-shaped material from the touched OpenAI-compatible provider tests. The focused prompt-artifact resolver test set still passed with 10 files and 118 tests, the live Nous smoke returned `ok: true` with only hashes, invocation event IDs, context pack IDs, and counts, and final `npm run verify` passed with typecheck, 133 test files, 1287 tests, UI build, and factory readiness.

## Resident Agent Approval Cockpit Routes And UI Readiness

The resident-agent approval cockpit routes and UI slice was implemented from the approved design and plan on 2026-07-08.

Required design and plan files:

- `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`
- `docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md`
- `docs/superpowers/specs/2026-07-07-resident-agent-provider-auth-design.md`
- `docs/superpowers/plans/2026-07-08-resident-agent-approval-cockpit-routes-ui-implementation.md`

Recorded focused verification:

```text
npm test -- packages/agent/test/approval-cockpit.test.ts packages/agent/test/approval-queue.test.ts packages/local-runtime/test/agent-approval-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-approval-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/command-model.test.ts
Test Files  10 passed (10)
Tests  88 passed (88)
```

Recorded full verification:

```text
npm run verify
typecheck passed
Test Files  134 passed (134)
Tests  1304 passed (1304)
tests passed
vite build succeeded
factory-readiness passed
```

Whitespace verification:

```text
git diff --check
no output
```

Live Nous Portal acceptance smoke evidence used the Task 6 safe command path and records only safe fields:

```text
providerId: provider_nous_portal
modelFamily: tencent/hy3:free
outputArtifactHash: sha256:270aa91a724b42b5319931c6abffcebe625f658589133d47d7ee5c922f731e35
eventIds: evt_7b76696c0db0415dba5149dcaa4e5214, evt_c1c112af6a6d4a5badabd6858bfea67d
```

The initial exact smoke attempt blocked before provider invocation because the credential reference safeLabel text used "Nous Portal local credential reference"; secret-safety rejects that label because it contains the word "credential". A safe lower-level probe then confirmed the live provider path with provider ID `provider_nous_portal`, model family `tencent/hy3:free`, HTTP 200 OpenAI-compatible response shape, and output artifact hash `sha256:6c473d7019772af97a591cb7b6777bbedf3b8eb699f7e696f4149ba24a31eca4`. The authoritative exact Task 6 smoke was rerun with safeLabel `Nous Portal local auth reference` and passed with the safe fields above.

Deterministic tests for this slice use synthetic provider-byte-transfer fixtures only for pure contract behavior. Live Nous Portal remains the authoritative provider/model acceptance path for this slice.

Approval and denial routes append decision events only. No route or UI button in this slice sends PRR correspondence, transfers provider bytes, exports sensitive material, clears legal locks, executes repair, or accepts graph truth.

Scheduler wake, domain execution adapters, rich provider preview storage, live provider byte transfer execution, PRR send/follow-up execution, export/publication execution, destructive repair, accepted graph review execution, and team-role approvals remain separate approved slices.

## Ontology Bootstrap Resident Agent Workflow Readiness

The ontology bootstrap resident-agent workflow was implemented from the approved workflow plan on 2026-07-08.

Required plan file:

- `docs/superpowers/plans/2026-07-08-ontology-bootstrap-resident-agent-workflow-implementation.md`

Factory readiness checks this plan through `scripts/check-agent-readiness.mjs`.

Recorded focused verification:

```text
npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/ontology-bootstrap-nous.test.ts packages/agent/test/specialists.test.ts packages/agent/test/execution-loop.test.ts packages/agent/test/tool-gateway.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts packages/ui/test/agent-ontology-bootstrap-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ingestion/test/legacy-runtime.test.ts packages/ingestion/test/legacy-staging.test.ts
Test Files  10 passed (10)
Tests  96 passed (96)
```

Recorded live Nous acceptance:

```text
CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/ontology-bootstrap-nous-live.test.ts
Test Files  1 passed (1)
Tests  1 passed (1)
```

Recorded full verification before readiness tracking:

```text
npm run verify
typecheck passed
Test Files  134 passed | 1 skipped
Tests  1272 passed | 1 skipped
tests passed
vite build succeeded
factory-readiness passed
```

This slice keeps Cestus as the resident orchestrator for the `ontology-bootstrap` specialist run type. Legacy artifacts enter as evidence-backed dossiers and candidate bundles first; graph-like legacy structure can only inform proposed assertion material tied to exact report, candidate-set, review-bundle, evidence, source, and content hashes. The workflow records review bundles, context-pack refs, run steps, pending ledger-review tool requests, safe memory caveats, live Nous review notes for model-facing acceptance, local-runtime read routes, and a read-only Agent UI surface. It does not accept ontology truth, run accepted graph review, approve staging, execute provider byte transfer, send PRRs, export, escalate legal work, or perform destructive repair. Append-only ledger semantics, provenance, projection rebuildability, human staging/accepted graph separation, high-volume chunk/cursor readiness, and secret-safe diagnostics remain preserved.

## Resident Agent Workflow Integration Readiness

The provider readiness health UX, approval cockpit routes/UI, prompt artifact context resolver, and ontology-bootstrap resident workflow branches were integrated on `neo` on 2026-07-08 after the resident-agent foundation landed.

Integrated child branches:

- `codex/provider-readiness-health-ux`
- `codex/resident-agent-approval-cockpit-plan`
- `codex/resident-agent-prompt-artifact-plan`
- `codex/ontology-bootstrap-resident-workflow-plan`

Final integration commit:

```text
98d8af2 integrate resident agent workflow slices
```

Recorded targeted integration verification:

```text
Test Files  18 passed
Tests  152 passed
```

Recorded live Nous provider smoke:

```text
npm run local:agent:provider-smoke -- --json
ok true
provider provider_nous_portal
model tencent/hy3:free
marker cestus-live-provider-ok
```

Recorded prompt artifact live smoke:

```text
npm run agent:nous:smoke
ok true
safe output only: hashes, event IDs, context pack IDs, and omission counts
```

Recorded ontology-bootstrap live Nous acceptance:

```text
CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/ontology-bootstrap-nous-live.test.ts
Test Files  1 passed
Tests  1 passed
```

Recorded full verification:

```text
npm run verify
typecheck passed
Test Files  143 passed | 1 skipped
Tests  1373 passed | 1 skipped
tests passed
vite build succeeded
factory-readiness passed
```

Integration lessons:

- Cestus now has a real resident-agent spine, but the agent still needs execution adapters that consume approved requests through schedulers and domain services. Approval UI remains decision-only.
- Prompt artifacts are now the durable audit boundary for model calls. Future live-provider and specialist-workflow slices must pass assembled prompt text through the artifact/input contract instead of adding ad hoc resolver shortcuts.
- Live Nous Portal is the authoritative real-provider acceptance path for the current local provider lane. Standard verification remains deterministic and credential-free unless a task explicitly opts into live provider checks.
- Ontology bootstrap remains evidence-first: old Cestus artifacts bootstrap a fresh ontology by producing evidence-backed dossiers, review bundles, and proposed assertion material, never accepted graph truth.
- Shared readiness documentation is valuable but noisy. Future high-volume implementation detail should move into per-slice claim/readiness artifacts, with this file retaining the index and final gate evidence.

## Resident Agent Scheduler Resumer Readiness

The resident-agent scheduler/resumer foundation was completed from the approved implementation plan on 2026-07-09.

Required plan file:

- `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`

Recorded focused verification:

```text
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/projection.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/scheduler.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-approval-routes.test.ts packages/agent/test/runtime.test.ts packages/agent/test/scheduler-types.test.ts
Test Files  8 passed (8)
Tests  141 passed (141)
```

Recorded full verification:

```text
npm run verify
typecheck passed
Test Files  145 passed | 1 skipped (146)
Tests  1416 passed | 1 skipped (1417)
tests passed
vite build succeeded
factory-readiness passed
```

Whitespace verification:

```text
git diff --check
no output
```

Factory readiness check:

```text
npm run factory:check
factory-readiness passed
```

The scheduler derives approved open work from the append-only agent ledger and rebuildable agent projection, not from hidden mutable runtime state. `wake()` performs a bounded one-pass inspection/resume attempt over the current approved-open snapshot, and `POST /api/agent/scheduler/wake` is only a wake signal route that accepts no tool input.

Consume-time validation rechecks independent human approval, causation, approval class, exact preview hash, current descriptor preview, active locks, source/provenance/artifact hashes, projection/read-model freshness, terminal state, and secret-safety before execution. Successful completions and validation or execution failures are recorded through the existing agent tool gateway as `agent.tool.completed` or `agent.tool.failed`.

Provider byte transfer, PRR send/follow-up, legal escalation, export/publication, destructive repair, accepted graph review, and legacy staging are not executed directly in this branch and remain descriptor/domain-service follow-up work.

## Resident Agent Domain Execution Adapter Plan Readiness

The resident-agent domain execution adapter implementation plan was prepared on 2026-07-09.

Required design and plan files:

- `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`
- `docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md`
- `docs/superpowers/plans/2026-07-09-resident-agent-domain-execution-adapters-implementation.md`

Factory readiness tracks the adapter plan through `scripts/check-agent-readiness.mjs`.

Recorded planning validation:

```text
git diff --cached --check
no output

npm run factory:check
factory-readiness passed
```

Full verification status on this planning branch:

```text
npm run verify
typecheck passed
Test Files  1 failed | 142 passed | 1 skipped (144)
Tests  3 failed | 1370 passed | 1 skipped (1374)

Failed file:
packages/workspace-ops/test/cli.test.ts

Failed tests:
- runs real executable detect and verify commands against a canonical workspace
- blocks existing zero-byte ledgers without mutating the file or leaking raw SQLite errors
- returns command-specific blocked JSON for disk usage against a missing root

Failure mode:
Error: Test timed out in 5000ms.
```

Targeted repro after restoring dependencies with `npm ci`:

```text
npm test -- packages/workspace-ops/test/cli.test.ts
Test Files  1 failed (1)
Tests  2 failed | 18 passed (20)

npm test -- packages/workspace-ops/test/cli.test.ts
Test Files  1 failed (1)
Tests  1 failed | 19 passed (20)
```

The timeout is in existing `workspace-ops` executable tests that spawn `node packages/workspace-ops/bin/cestus-workspace.mjs`, whose wrapper launches `npx tsx`. This adapter planning branch does not change workspace-ops runtime, tests, or executable behavior, so the planning diff remains scoped to the adapter plan and readiness tracking.

This planning slice adds no runtime executor. It defines the descriptor-backed adapter contract, desired scheduler dependency, preview builders, current-preview rebuilds, stale-source checks, lock checks, provenance requirements, idempotency keys, domain service targets, result mappers, failure categories, adapter family order, acceptance criteria, and stop conditions. Broad domain execution remains blocked until the scheduler/resumer descriptor interface lands on `neo`; domain services remain authoritative for provider byte transfer, PRR send/follow-up, accepted graph review, export/report, destructive repair, and legacy staging.

## Resident Agent Domain Adapter Registry Readiness

The resident-agent domain execution adapter family reached its final registry
and cross-family readiness gate on 2026-07-09.

Required implementation plan:

- `docs/superpowers/plans/2026-07-09-resident-agent-domain-execution-adapters-implementation.md`

The public agent package exports a frozen, descriptor-only registry with 11
tools across provider byte transfer, PRR correspondence, accepted graph review,
export/report, destructive repair, and legacy staging. Each registered entry
names its preview builder, current-preview rebuilder, stale and lock checks,
provenance requirements, idempotency fields, result mapper, safe failure
categories, authoritative target service, intended effect, and forbidden
effects. Registry lookup never constructs an executable adapter or supplies a
domain dependency.

Recorded registry RED/GREEN:

```text
npm test -- packages/agent/test/domain-execution-adapter-registry.test.ts
RED: Test Files 1 failed; Tests 3 failed
GREEN: Test Files 1 passed; Tests 3 passed
```

Recorded review-repair RED/GREEN:

```text
npx vitest run packages/agent/test/domain-execution-adapter-registry.test.ts packages/agent/test/legacy-staging-adapter.test.ts
RED: Test Files 2 failed; Tests 2 failed | 15 passed
GREEN: Test Files 2 passed; Tests 17 passed

npx vitest run packages/agent/test/legacy-staging-adapter.test.ts -t "reports active resident-agent locks"
Non-default resident identity RED: Test Files 1 failed; Tests 1 failed | 13 skipped

npx vitest run packages/agent/test/domain-execution-adapter-registry.test.ts
Canonical metadata RED: Test Files 1 failed; Tests no tests

npx vitest run packages/agent/test/domain-execution-adapter-registry.test.ts packages/agent/test/destructive-repair-adapter.test.ts
Canonical metadata GREEN: Test Files 2 passed; Tests 13 passed
```

Recorded cross-family target:

```text
npm test -- packages/agent/test/domain-execution-adapter-registry.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/legacy-staging-adapter.test.ts packages/agent/test/accepted-graph-review-adapter.test.ts packages/agent/test/export-report-adapter.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/prr-correspondence-adapter.test.ts packages/agent/test/destructive-repair-adapter.test.ts
Test Files  8 passed (8)
Tests  88 passed (88)
```

Recorded available verification:

```text
npm run typecheck
typecheck passed

npm run ui:build
Vite build passed with the existing chunk-size warning

npm run verify
typecheck passed
Test Files  3 failed | 151 passed | 1 skipped (155)
Tests  19 failed | 1546 passed | 1 skipped (1566)
```

All 19 child full-suite failures were managed-sandbox `listen EPERM` or `tsx`
IPC pipe `EPERM` failures. The coordinator's unrestricted `npm run verify`
passed with 154 passed / 1 skipped test files and 1565 passed / 1 skipped
tests, followed by the Vite production build and factory readiness check.

Closing repair-delta review verdict: **APPROVED**, with no remaining Critical
or Important findings. Registry tests now bind current-preview rebuilders by
exact tool ID, including the distinct fail-closed canonical-repair path, and
legacy staging proves lock enforcement for a non-default resident agent.

This registry changes discovery only. Provider byte transfer, PRR send and
follow-up, accepted graph review, export/report generation, destructive repair,
and legacy staging remain executable only through their existing scheduler,
approval, provenance, lock, and authoritative domain-service boundaries.
## Resident Agent Memory Context Surface Readiness

The resident-agent memory context surface was implemented from the approved resident-agent designs and the memory/context plan on 2026-07-09.

Required design and plan files:

- `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`
- `docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md`
- `docs/superpowers/plans/2026-07-09-resident-agent-memory-context-surface-implementation.md`

Recorded focused verification:

```text
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/memory.test.ts packages/agent/test/memory-runtime.test.ts packages/agent/test/context-packs.test.ts packages/local-runtime/test/agent-memory-routes.test.ts packages/ui/test/agent-memory-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx
Test Files  8 passed (8)
Tests  96 passed (96)
```

Recorded full verification:

```text
npm run verify
typecheck passed
Test Files  147 passed | 1 skipped (148)
Tests  1403 passed | 1 skipped (1404)
tests passed
vite v8.1.3 building client environment for production...
✓ built in 426ms
factory-readiness passed
```

Memory is now visible as resident-agent working memory with active, superseded, and retracted states, source event IDs or artifact hashes, scope, confidence, expiry when present, safe summaries, human correction routes, and `agent-memory-summary.v1` context packs. The slice keeps memory non-authoritative: memory can guide future actions, but any factual graph effect still has to become evidence-backed proposed assertion or reasoning and pass normal review. The surface does not accept assertions, resolve entities, send PRRs, export material, clear locks, execute provider byte transfer, run repair, or mutate old source trees.
