# Resident Agent Full-Vision Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development only after a coordinator or user sends the explicit implementation-authorization message in this plan. Planning approval does not authorize implementation. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver one supervised, portable-workspace Cestus resident that performs bounded, provenance-complete advisory work through durable handoffs, with real Nous acceptance and no fallback storage.

**Architecture:** Eight Wave 0 lanes independently produce approved specifications and implementation plans. A coordinator freezes their shared events, DTOs, capability interfaces, ownership, and merge order before consumer code is authorized. Foundations, integration, specialist verticals, acceptance, and release then proceed through recorded dependencies, claims, reviews, rebases, and merge gates.

**Tech Stack:** TypeScript, Zod, Vitest, SQLite-backed portable workspace stores, local-runtime HTTP/CLI, React/Vite cockpit, OS secret facilities, approved Nous provider, and the append-only ontology ledger.

## Global Constraints

- Governing specification: docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md at commit c7dc10b9.
- Preserve one resident identity, agent_default. Providers, harnesses, credentials, and subscriptions are backends, never resident identities.
- Preserve append-only ledger semantics, exact provenance, rebuildable projections, independent-human approval consumption, and durable handoff readback.
- The mounted workspace identity, ledger, artifact store, policy, and active locks are authoritative. Disconnect or identity mismatch permits no internal fallback write.
- Model output, plans, observations, tool results, and memory remain advisory until established human or domain review accepts a governed change.
- External effects remain gated. PRR send, legal escalation, publication, export, destructive repair, sensitive disclosure, accepted graph mutation, and provider byte transfer may not self-authorize.
- All public boundaries normalize plain own-data values before append, blob write, provider call, or await. Diagnostics and live output remain secret-safe.
- Deterministic suites are credential-free. Provider-bearing acceptance uses real approved Nous credentials and emits only safe IDs, hashes, counts, categories, and markers.
- Every child, implementer, repairer, and reviewer requires GPT-5.6 Terra with Extra High reasoning. The coordinator verifies and records that exact configuration before dispatch. An unavailable configuration is a stop condition; no fallback is permitted.
- Every executable work order uses an isolated worktree, committed claim, RED evidence, focused GREEN evidence, npm run verify, a commit, and a fresh review. A worker never merges itself into neo.
- Newsroom/team mode, multi-user authorization, shared hosting, autonomous send/escalation/export/publication, unofficial subscription-token extraction, and unrestricted loops are out of scope.

---

## Program Control Files

Task 100 creates these documents after this program plan receives explicit implementation authorization. No control file is created by this planning-only task.

| File | Owner | Purpose |
| --- | --- | --- |
| docs/agentic/resident-agent-full-vision-program-registry.md | Coordinator | Append-only record of every lane, claim, configuration, dependency, review, rebase, merge, and archive decision. |
| docs/agentic/resident-agent-full-vision-child-task-template.md | Coordinator | Exact prompts for spec, plan, implementation, repair, and review work orders. |
| docs/agentic/resident-agent-full-vision-contract-freeze.md | Coordinator after Wave 0 | Versioned event, DTO, capability, file-ownership, merge, and rebase contract. |
| docs/agentic/resident-agent-full-vision-acceptance-matrix.md | A lane | Executable deterministic, live-provider, failure-injection, cockpit, and deployment evidence. |
| docs/agentic/claims/task-100-resident-full-vision-program-control.md | Coordinator | Claim and command evidence for program controls. |

## Durable Registry Format

The coordinator appends a dated entry for every dispatch, review, repair, merge decision, and archive decision. A new entry supersedes status; it does not remove prior evidence.

~~~md
## RV-<wave>-<lane>-<ordinal> — <short title>

- Recorded at: <ISO-8601 instant>
- Role: coordinator | spec-author | plan-author | implementer | repairer | reviewer | acceptance | release
- Lane and wave: <R|H|W|L|T|P|U|A> / <0|1|2|3|4|5>
- Task ID and claim: task-<number>-resident-full-vision-<slug> / docs/agentic/claims/<claim>.md
- Task thread ID: <platform task id>
- Branch and worktree: <branch> / <absolute path>
- Base commit and required head: <full SHA> / <full SHA>
- Model configuration: GPT-5.6 Terra / Extra High, or blocked: unavailable
- Governing spec and plan: <repo paths and commit SHAs>
- Owned files: <complete list>
- Forbidden files: <complete list>
- Dependencies and required merged commits: <registry IDs and SHAs>
- Approval record: <message timestamp, approved range, wave stop>
- Claim status: unclaimed | claimed | in-progress | ready-for-review | repairing | approved | blocked | merged | archived
- RED command and observed failure: <exact command and concise failure>
- GREEN command and observed result: <exact command and concise result>
- Full verification: npm run verify / <exit and safe summary>
- Live-provider gate: not-applicable | pending | pass | blocked, with safe evidence reference
- Review verdict: pending | approved | needs-changes | blocked, with review task ID
- Rebase record: <from SHA, to SHA, cross-lane commands>
- Merge readiness: not-ready | ready-for-coordinator | merged
- Archive check: <final answer, clean worktree, ancestry, verification, merge state>
~~~

The coordinator rejects an implementation dispatch entry lacking the exact governing documents, task range, wave stop, ownership, model configuration, and explicit implementation authorization.

## Mandatory Prompts And Approval Messages

### Spec and plan work-order preamble

Every Wave 0 prompt begins with this text, populated without omissions.

~~~text
You are the <lane> <spec-author|plan-author> for Cestus.
Host requirement: GPT-5.6 Terra with Extra High reasoning. Stop and report if unavailable; do not select a fallback.
Worktree and branch: <absolute path> / <branch>; base commit: <SHA>.
Read AGENTS.md, .agents/skills/cestus-software-factory/SKILL.md,
docs/agentic/software-factory.md, the umbrella design at c7dc10b9,
and the named predecessor documents.
Allowed files: <complete list>. Forbidden files: every other production,
test, runtime, UI, provider, and shared-contract file.
This is a <spec|plan> work order only. Do not implement production code,
claim an implementation task, dispatch an implementation worker, or merge into neo.
Stop point: <exact user-approval gate>.
~~~

### Required implementation-authorization message

Plan approval is not implicit permission to execute. Before implementation, repair, or a review requiring executable task work, the coordinator or user must send and record this complete message.

Under the Standing Coordinator Delegation in the governing specification at
`c7dc10b9`, every reference in this plan to a **new authorization message**
means a new, scoped, coordinator-issued message and durable registry record
unless the user elects to supply it. It is not a request for a new user prompt.
The coordinator still names the exact spec and plan commits, task range, wave
stop, `superpowers:subagent-driven-development` authorization, TDD, fresh
review, verification-before-completion, GPT-5.6 Terra / Extra High, and the
no-self-merge rule; an incomplete message keeps the child at its gate.

~~~text
The referenced spec <exact path>@<commit> and implementation plan <exact path>@<commit> are approved.
Allowed task range: <first task> through <last task>.
Wave stop point: <exact wave and gate>.
You are explicitly authorized to execute this approved task range using
superpowers:subagent-driven-development, test-driven development, fresh task
reviews, and verification-before-completion. Do not merge into neo.
Host requirement: GPT-5.6 Terra with Extra High reasoning. Stop and report if
that exact configuration is unavailable; do not fall back.
~~~

An implementation child whose message omits any line remains at its implementation gate. A repair has its own allowed range and requires a new message. Review prompts retain the host requirement, governing documents, no-merge rule, and exact review scope. Reviewers do not alter production files without a separately authorized repair work order.

## Contract Freeze Inputs, Outputs, And Ownership

Wave 0 does not edit shared production contracts. Its approved outputs are reconciled by coordinator task 117.

| Contract family | Freeze owner | Canonical files after freeze | Required stable interface |
| --- | --- | --- | --- |
| Plan, observation, bounded steps | L with T review | packages/ontology/src/contracts.ts; packages/agent/src/plan-observation-contracts.ts; packages/agent/src/task-orchestrator-types.ts | ResidentPlanPolicy, ResidentPlanRecord, ResidentObservationRecord, ResidentToolStepRecord, bounded terminal-or-resumable result. |
| Wake and workspace lifecycle | W with R review | packages/agent/src/wake-supervisor.ts; packages/local-runtime/src/portable-workspace-lifecycle.ts; packages/agent/src/runtime-types.ts | WakeSupervisor, WakeStatusDto, WorkspaceAvailabilityAuthority, WorkspaceUnavailableResult. |
| Trigger policy and idempotency | T with L review | packages/agent/src/proactive-triggers.ts; packages/agent/src/trigger-projection.ts | ResidentTriggerDescriptor, TriggerEvaluationInput, TriggerDecision, TriggerHighWaterMark. |
| Provider and credentials | P | packages/agent/src/provider.ts; packages/agent/src/provider-registry.ts; packages/agent/src/secret-store.ts; packages/local-runtime/src/agent-provider-readiness.ts | ProviderCapability, CredentialReference, ProviderFeasibilityRecord, secret-safe readiness DTOs. |
| Durable handoffs | H with L review | packages/agent/src/specialist-handoffs.ts; packages/agent/src/specialist-handoff-projection.ts; packages/agent/src/specialist-runner-kernel.ts | SpecialistHandoffManifest, MountedHandoffStore, HandoffReadback, browser-safe handoff diagnostics. |
| Runtime composition | R | packages/local-runtime/src/agent-runtime-factory.ts | createProductionAgentRuntimeCapabilities(input): AgentTaskOrchestratorRuntimeCapabilities. No other lane writes this factory. |
| Cockpit boundaries | U | packages/ui/src/agent/agent-types.ts; packages/ui/src/agent/agent-adapter.ts; packages/local-runtime/src/agent-http-routes.ts | ResidentRuntimeStatusDto, ResidentWakeDto, ResidentHandoffDto, supported runtime command DTOs. |
| Cross-lane acceptance | A | docs/agentic/resident-agent-full-vision-acceptance-matrix.md and approved test files | command, fixture, credential posture, expected durable evidence, failure-injection proof. |

The freeze must specify event names, Zod schemas, versions, idempotency keys, actor/causation/provenance bindings, error categories, parser versions, fixtures, owner, consumer, and compatibility rule. It rejects duplicate production owners, unbounded budgets, implicit external effects, unverified workspace access, raw secrets, or unrebuildable projections.

## Universal Work-Order Protocol

Every approved implementation plan contains these executable steps:

1. Commit docs/agentic/claims/task-<number>-resident-full-vision-<slug>.md with claimed status, exact ownership, forbidden files, base SHA, approved documents, model configuration, commands, and stop conditions.
2. Mark the claim in-progress, read every named file, and write the focused failing test.
3. Run the precise RED command. It must fail for missing behavior or a violated invariant.
4. Implement the smallest change in owned files. Never change a shared contract, default runtime factory, shared provider configuration, route, or cockpit file unless the freeze assigns it.
5. Run the focused GREEN command, named cross-lane command, npm run verify, and git diff --check.
6. Commit only owned files and claim evidence. A fresh reviewer leads with defects, missing tests, spec drift, invariant violations, and verification gaps.
7. A repair requires a new scoped authorization message issued and recorded by
   the coordinator under standing delegation (or supplied by the user); it does
   not require a new user prompt. After two focused repair attempts without
   verifier recovery, stop and preserve that child, append a root-cause
   checkpoint, replace the implementer or reviewer or materially change the
   counterfactual verification tactic, issue a new bounded authorization, and
   continue. Escalate to the user only if root-cause analysis proves the
   approved contract cannot be satisfied without a new product, scope, safety,
   data-loss, credential, or external-behavior decision.

Every lane plan includes actual test code, the RED command and expected failure, the implementation change, focused GREEN command, exact commit scope, fresh review command, and live-provider gate. Program command vocabulary:

~~~bash
npm test -- <focused-test-files>
npm run typecheck
npm run verify
git diff --check
npm run factory:check
~~~

Live gates run only in a coordinator-controlled environment with approved credentials. Captured evidence contains no prompt text, raw provider data, credential, secret, or source bytes.

## Dependency Graph

~~~text
umbrella specification approved
  -> Wave 0A: eight lane specifications
  -> written lane-spec approval
  -> Wave 0B: eight lane implementation plans
  -> written lane-plan approval
  -> CF-1 contract freeze
  -> Wave 1 foundations
  -> contract-changing merge and dependent rebase
  -> Wave 2 runtime integration
  -> Wave 3 specialist and trigger verticals
  -> Wave 4 integrated acceptance
  -> Wave 5 release integration
~~~

A branch existing is not a dependency pass. The registry must show predecessor review approval, merged SHA, clean rebase, and named cross-lane command before dispatch.

## Task 100: Coordinator Program Controls

**Files:**
- Create: docs/agentic/resident-agent-full-vision-program-registry.md
- Create: docs/agentic/resident-agent-full-vision-child-task-template.md
- Create: docs/agentic/resident-agent-full-vision-acceptance-matrix.md
- Create: docs/agentic/claims/task-100-resident-full-vision-program-control.md

**Interfaces:**
- Consumes: the registry format, prompt preamble, implementation-authorization message, contract freeze table, and acceptance IDs defined by this plan.
- Produces: durable coordinator records required before any child dispatch.

- [ ] **Step 1: Write the failing control audit**

Add the first registry entry with every mandatory field except its authorization message. The control audit must classify it as non-dispatchable.

- [ ] **Step 2: Run the RED documentation gate**

Run:

~~~bash
npm run factory:check
git diff --check
~~~

Expected: documentation is syntactically clean, while the coordinator audit records that an incomplete approval message cannot dispatch a child.

- [ ] **Step 3: Write the program controls**

Create the registry, template, and acceptance matrix from the exact formats in this plan. Create the task claim with coordinator ownership and no production file ownership.

- [ ] **Step 4: Run the GREEN documentation gate**

Run:

~~~bash
npm run factory:check
git diff --check
npm run verify
~~~

Expected: factory-readiness passes, no whitespace error is reported, and full verification passes.

- [ ] **Step 5: Commit and stop**

~~~bash
git add docs/agentic/resident-agent-full-vision-program-registry.md docs/agentic/resident-agent-full-vision-child-task-template.md docs/agentic/resident-agent-full-vision-acceptance-matrix.md docs/agentic/claims/task-100-resident-full-vision-program-control.md
git commit -m "docs: add resident full-vision program controls"
~~~

Stop for a user or coordinator implementation-authorization message that names the exact Wave 0A range.

## Wave 0A: Independently Approved Lane Specifications

Tasks 101–108 may run concurrently only after their exact implementation-authorization message. Each uses brainstorming, presents a lane design, commits one specification and claim, and stops for written user approval. It does not create a lane implementation plan.

| Task | Lane | Owned specification and claim | Required design result | Stop point |
| --- | --- | --- | --- | --- |
| 101 | R | docs/superpowers/specs/2026-07-12-resident-agent-runtime-composition-design.md; docs/agentic/claims/task-101-resident-full-vision-w0-runtime-spec.md | Mounted context, prompt, provider-policy, runner, derivative-store, and handoff composition. Only R owns the default runtime factory. | Written R-spec approval. |
| 102 | H | docs/superpowers/specs/2026-07-12-resident-agent-durable-handoffs-design.md; docs/agentic/claims/task-102-resident-full-vision-w0-handoff-spec.md | PRR, investigation, and ontology-bootstrap handoff adoption, mounted readback, runtime projection, and safe DTO shape. | Written H-spec approval. |
| 103 | W | docs/superpowers/specs/2026-07-12-resident-agent-wake-portable-lifecycle-design.md; docs/agentic/claims/task-103-resident-full-vision-w0-wake-spec.md | Supervision, wake, pause/resume, recovery, mount identity revalidation, disconnect behavior, health diagnostics. | Written W-spec approval. |
| 104 | L | docs/superpowers/specs/2026-07-12-resident-agent-bounded-loop-design.md; docs/agentic/claims/task-104-resident-full-vision-w0-loop-spec.md | Plan/observe/tool/replan policy, maximum steps and budgets, tool allowlists, approval suspension, terminal/resumable semantics. | Written L-spec approval. |
| 105 | T | docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md; docs/agentic/claims/task-105-resident-full-vision-w0-trigger-spec.md | Deduplicated trigger requests, cooldown, high-water mark, source provenance, no-prompt/no-effect posture. | Written T-spec approval. |
| 106 | P | docs/superpowers/specs/2026-07-12-resident-agent-provider-credentials-design.md; docs/agentic/claims/task-106-resident-full-vision-w0-provider-spec.md | BYOK, OS secret storage, local model, Nous, Codex, and xAI feasibility without unofficial token use. | Written P-spec approval. |
| 107 | U | docs/superpowers/specs/2026-07-12-resident-agent-cockpit-design.md; docs/agentic/claims/task-107-resident-full-vision-w0-cockpit-spec.md | Browser-safe runtime truth, supported commands, provider setup, handoff view, desktop/mobile/tailnet needs. | Written U-spec approval. |
| 108 | A | docs/superpowers/specs/2026-07-12-resident-agent-acceptance-design.md; docs/agentic/claims/task-108-resident-full-vision-w0-acceptance-spec.md | Mounted-storage, restart, failure injection, real-provider, browser, and tailnet acceptance architecture. | Written A-spec approval. |

Each task runs git diff --check and npm run factory:check before its documentation-only commit. The coordinator records vocabulary clashes but resolves shared contracts only in task 117.

## Wave 0B: Independently Approved Lane Implementation Plans

After the matching lane spec has written approval, the coordinator authorizes this plan task. Each owns only its plan and claim, includes exact files, signatures, RED/GREEN snippets, commands, review gates, live gates, and rollback conditions, then stops for written lane-plan approval.

| Task | Predecessor | Owned plan and claim | Required coverage |
| --- | --- | --- | --- |
| 109 | 101 | docs/superpowers/plans/2026-07-12-resident-agent-runtime-composition-implementation.md; docs/agentic/claims/task-109-resident-full-vision-w0-runtime-plan.md | Context registry, prompt binding, runner registry, mounted stores, runtime readiness, factory-only ownership. |
| 110 | 102 | docs/superpowers/plans/2026-07-12-resident-agent-durable-handoffs-implementation.md; docs/agentic/claims/task-110-resident-full-vision-w0-handoff-plan.md | Three workflow migrations, readback, projection, DTO parser, handoff failure injection. |
| 111 | 103 | docs/superpowers/plans/2026-07-12-resident-agent-wake-portable-lifecycle-implementation.md; docs/agentic/claims/task-111-resident-full-vision-w0-wake-plan.md | Supervisor process, recovery, disconnect/reverify, no-fallback proof, command routes, diagnostics. |
| 112 | 104 | docs/superpowers/plans/2026-07-12-resident-agent-bounded-loop-implementation.md; docs/agentic/claims/task-112-resident-full-vision-w0-loop-plan.md | Versioned plan/observation contracts, budget enforcement, approved tools, replan, suspension, recovery. |
| 113 | 105 | docs/superpowers/plans/2026-07-12-resident-agent-proactive-triggers-implementation.md; docs/agentic/claims/task-113-resident-full-vision-w0-trigger-plan.md | Trigger descriptors, dedupe keys, cooldown/high-water store, trigger families, no-effect proof. |
| 114 | 106 | docs/superpowers/plans/2026-07-12-resident-agent-provider-credentials-implementation.md; docs/agentic/claims/task-114-resident-full-vision-w0-provider-plan.md | Adapters, feasibility records, secret references, config integration, deterministic and live gates. |
| 115 | 107 | docs/superpowers/plans/2026-07-12-resident-agent-cockpit-implementation.md; docs/agentic/claims/task-115-resident-full-vision-w0-cockpit-plan.md | DTO parsers, route commands, cockpit state, provider setup, responsive and tailnet tests. |
| 116 | 108 | docs/superpowers/plans/2026-07-12-resident-agent-acceptance-implementation.md; docs/agentic/claims/task-116-resident-full-vision-w0-acceptance-plan.md | Fixtures, live invocation, failure injection, served-checkout and tailnet verification. |

## Task 117: CF-1 Contract Freeze And Dispatch Matrix

**Files:**
- Create: docs/agentic/resident-agent-full-vision-contract-freeze.md
- Modify: docs/agentic/resident-agent-full-vision-program-registry.md
- Create: docs/agentic/claims/task-117-resident-full-vision-contract-freeze.md

**Interfaces:**
- Consumes: the eight approved lane specifications and implementation plans.
- Produces: the only shared-event, shared-DTO, capability, ownership, merge, and rebase authority for Waves 1–5.

- [ ] **Step 1: Write the failing contract audit**

Create a table-driven audit for every event, DTO, capability, file, owner, consumer, source-event binding, approval class, idempotency key, and targeted test. Mark a missing or conflicting owner as non-dispatchable.

- [ ] **Step 2: Run the RED documentation gate**

Run:

~~~bash
npm run factory:check
~~~

Expected: the coordinator audit reports the unresolved or absent freeze entry.

- [ ] **Step 3: Freeze contracts and merge order**

Write the resolved record for every family in the contract-freeze table. Record only R as the default-factory writer, only P as the shared provider-configuration writer, and only the named contract task as the shared-event writer. Record required rebase SHAs and cross-lane commands.

- [ ] **Step 4: Run the GREEN documentation gate**

Run:

~~~bash
npm run factory:check
git diff --check
~~~

Expected: factory-readiness passes and diff check has no output.

- [ ] **Step 5: Commit and stop**

~~~bash
git add docs/agentic/resident-agent-full-vision-contract-freeze.md docs/agentic/resident-agent-full-vision-program-registry.md docs/agentic/claims/task-117-resident-full-vision-contract-freeze.md
git commit -m "docs: freeze resident full-vision contracts"
~~~

Stop for an explicit Wave 1 implementation-authorization message. CF-1 itself authorizes no production code.

## Wave 1: Independent Foundations

Wave 1 starts only when CF-1 is merged into the coordinator integration branch and every worker has rebased to its SHA. Every row requires its own implementation-authorization message.

| Task | Owner and exclusive files | Depends on | Focused RED/GREEN command | Completion evidence |
| --- | --- | --- | --- | --- |
| 120 | L: packages/agent/src/plan-observation-contracts.ts; packages/agent/src/plan-observation-projection.ts; packages/agent/test/plan-observation-contracts.test.ts; packages/agent/test/plan-observation-projection.test.ts | CF-1 | npm test -- packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts | Events replay, reject stale/forged provenance, and do not mutate accepted graph state. |
| 121 | H: packages/agent/src/prr-negotiation-workflow.ts; packages/agent/test/prr-negotiation-workflow.test.ts | CF-1 | npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts | Read-back durable draft handoff; no send. |
| 122 | H: packages/agent/src/investigation-planner-workflow.ts; packages/agent/test/investigation-planner-workflow.test.ts | CF-1 | npm test -- packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts | Exact provenance-bound durable handoff. |
| 123 | H: packages/agent/src/ontology-bootstrap-workflow.ts; packages/agent/test/ontology-bootstrap-workflow.test.ts | CF-1 | npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts | Proposal-only bootstrap with persisted/reconstructed handoff. |
| 124 | W: packages/agent/src/wake-supervisor.ts; packages/agent/test/wake-supervisor.test.ts | CF-1 | npm test -- packages/agent/test/wake-supervisor.test.ts packages/agent/test/scheduler.test.ts | Browser-independent bounded wake state. |
| 125 | W: packages/local-runtime/src/portable-workspace-lifecycle.ts; packages/local-runtime/test/portable-workspace-lifecycle.test.ts | CF-1 | npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/resident-identity-bootstrap.test.ts | Disconnect releases claims and blocks provider/tool/artifact work without fallback writes. |
| 126 | P: packages/agent/src/byok-provider.ts; packages/agent/test/byok-provider.test.ts | CF-1 | npm test -- packages/agent/test/byok-provider.test.ts packages/agent/test/openai-compatible-provider.test.ts | BYOK validates references and never writes secret values to portable state. |
| 127 | P: packages/agent/src/os-secret-store.ts; packages/agent/test/os-secret-store.test.ts | CF-1 | npm test -- packages/agent/test/os-secret-store.test.ts packages/agent/test/secret-store.test.ts | Safe references and secret-safe unavailable diagnostics. |
| 128 | P: packages/agent/src/local-model-provider.ts; packages/agent/test/local-model-provider.test.ts | CF-1 | npm test -- packages/agent/test/local-model-provider.test.ts packages/agent/test/provider-readiness.test.ts | Explicit, budgeted local capability with credential-free parity tests. |
| 129 | P: packages/agent/src/codex-subscription-harness.ts; packages/agent/test/codex-subscription-harness.test.ts | CF-1 | npm test -- packages/agent/test/codex-subscription-harness.test.ts | Official capability or durable unavailable feasibility record; no token extraction. |
| 130 | P: packages/agent/src/xai-subscription-harness.ts; packages/agent/test/xai-subscription-harness.test.ts | CF-1 | npm test -- packages/agent/test/xai-subscription-harness.test.ts | Official capability or durable unavailable feasibility record; no token extraction. |
| 131 | U: packages/ui/src/agent/resident-runtime-types.ts; packages/ui/src/agent/resident-runtime-adapter.ts; packages/ui/test/resident-runtime-adapter.test.ts | CF-1 | npm test -- packages/ui/test/resident-runtime-adapter.test.ts packages/ui/test/agent-adapter.test.ts | Production DTO parsing rejects stale, absent, forged, and cross-run values. |

After every row: npm run verify, git diff --check, fresh review, registry update, and coordinator merge gate. Tasks 121–123 do not alter shared handoff contracts; a needed contract revision returns to a new CF-1 revision.

## Wave 2: Runtime Integration

Wave 2 begins after required Wave 1 commits merge and dependent worktrees rebase. Only R changes packages/local-runtime/src/agent-runtime-factory.ts. Only P changes shared provider configuration. Browser work starts after routes and DTOs merge.

| Task | Owner and exclusive files | Required predecessors | Focused command | Required result |
| --- | --- | --- | --- | --- |
| 132 | R: packages/local-runtime/src/agent-runtime-context-packs.ts; packages/local-runtime/test/agent-runtime-context-packs.test.ts | 120, 125 | npm test -- packages/local-runtime/test/agent-runtime-context-packs.test.ts packages/agent/test/context-packs.test.ts | Mounted authoritative registry verifies payloads and rejects workspace-identity mismatch. |
| 133 | R: packages/local-runtime/src/agent-runtime-prompt-renderer.ts; packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts | 120, 126–130 | npm test -- packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts packages/agent/test/prompt-artifacts.test.ts | Exact approved run, provider posture, and context hashes; no raw prompt logging. |
| 134 | R: packages/local-runtime/src/agent-runtime-specialist-runners.ts; packages/local-runtime/test/agent-runtime-specialist-runners.test.ts | 121–124 | npm test -- packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/agent/test/specialist-runner-kernel.test.ts | Readiness-validated production runner registry. |
| 135 | R: packages/local-runtime/src/mounted-agent-artifact-stores.ts; packages/local-runtime/test/mounted-agent-artifact-stores.test.ts | 121–123, 125 | npm test -- packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/agent/test/specialist-handoff-projection.test.ts | Mounted derivative/handoff stores with artifact and ledger readback, no internal copy. |
| 136 | L: packages/agent/src/bounded-agent-loop.ts; packages/agent/test/bounded-agent-loop.test.ts | 120, 124, 126–130 | npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/execution-loop.test.ts | Policy prevents permission/tool/provider/budget/approval escalation; exhaustion is terminal or resumable. |
| 137 | W: packages/local-runtime/src/wake-supervisor-runtime.ts; packages/local-runtime/test/wake-supervisor-runtime.test.ts | 124, 125, 132–135 | npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/agent/test/wake-supervisor.test.ts | Browser-independent claim, pause, resume, and recovery through durable state. |
| 138 | H: packages/local-runtime/src/agent-handoff-projection.ts; packages/local-runtime/test/agent-handoff-projection.test.ts | 121–123, 135 | npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts packages/agent/test/specialist-handoff-projection.test.ts | Browser-safe runtime diagnostics from durable handoff state. |
| 139 | P: packages/local-runtime/src/agent-provider-configuration.ts; packages/local-runtime/test/agent-provider-configuration.test.ts | 126–130, 133 | npm test -- packages/local-runtime/test/agent-provider-configuration.test.ts packages/agent/test/provider-registry.test.ts | One configuration owner registers capabilities and feasibility records. |
| 140 | R: packages/local-runtime/src/agent-runtime-factory.ts; packages/local-runtime/test/agent-runtime-composition.test.ts | 132–139 | npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts | Default factory composes actual mounted contexts, renderer, runners, stores, provider policy, and supervision. |
| 141 | U: packages/local-runtime/src/agent-supervision-routes.ts; packages/ui/src/agent/ResidentSupervisionPanel.tsx; packages/ui/test/resident-supervision-panel.test.tsx | 131, 137–140 | npm test -- packages/ui/test/resident-supervision-panel.test.tsx packages/local-runtime/test/agent-supervision-routes.test.ts | Labels match pause/resume/retry/cancel effects and parse production DTOs. |

Merge 120 before consumers; 121–123 before 134/135/138; 124/125 before 137; 126–130 before 133/136/139; 132–139 before 140; routes before 141. A coordinator records the rebase SHA and runs the table command after every dependency merge.

## Wave 3: Specialist And Trigger Verticals

Every vertical consumes frozen contracts, ends in handoff readback, and may not edit the default runtime factory, shared event contract, or shared provider configuration. The coordinator starts a row only after Wave 2 composition passes readiness.

| Task | Vertical | Owner files and focused command | Boundary |
| --- | --- | --- | --- |
| 142 | Evidence-triage bounded loop | packages/agent/src/evidence-triage-workflow.ts; packages/agent/test/evidence-triage-bounded-loop.test.ts; npm test -- packages/agent/test/evidence-triage-bounded-loop.test.ts packages/agent/test/evidence-triage-workflow.test.ts | Real Nous gate; graph changes remain proposals. |
| 143 | Legacy import to ontology bootstrap | packages/agent/src/ontology-bootstrap-workflow.ts; packages/agent/test/legacy-to-ontology-bootstrap.test.ts; npm test -- packages/agent/test/legacy-to-ontology-bootstrap.test.ts packages/agent/test/ontology-bootstrap-workflow.test.ts | Evidence-first staging with source/content-hash binding. |
| 144 | Investigation planning and gap scan | packages/agent/src/investigation-planner-workflow.ts; packages/agent/test/investigation-planner-bounded-loop.test.ts; npm test -- packages/agent/test/investigation-planner-bounded-loop.test.ts packages/agent/test/investigation-planner-workflow.test.ts | Advisory plan and handoff only. |
| 145 | PRR monitoring and draft negotiation | packages/agent/src/prr-negotiation-workflow.ts; packages/agent/test/prr-negotiation-draft-only.test.ts; npm test -- packages/agent/test/prr-negotiation-draft-only.test.ts packages/agent/test/prr-negotiation-workflow.test.ts | No send, escalation, or external effect. |
| 146 | Timeline builder | packages/agent/src/timeline-builder-workflow.ts; packages/agent/test/timeline-builder-workflow.test.ts; npm test -- packages/agent/test/timeline-builder-workflow.test.ts | Sourced local timeline with uncertainty and handoff. |
| 147 | Contradiction finder | packages/agent/src/contradiction-finder-workflow.ts; packages/agent/test/contradiction-finder-workflow.test.ts; npm test -- packages/agent/test/contradiction-finder-workflow.test.ts | Advisory candidates; no accepted graph mutation. |
| 148 | Report builder | packages/agent/src/report-builder-workflow.ts; packages/agent/test/report-builder-draft-only.test.ts; npm test -- packages/agent/test/report-builder-draft-only.test.ts | Local draft only, no publication/export. |
| 149 | PRR deadline/stalling trigger | packages/agent/src/prr-proactive-trigger.ts; packages/agent/test/prr-proactive-trigger.test.ts; npm test -- packages/agent/test/prr-proactive-trigger.test.ts packages/agent/test/proactive-triggers.test.ts | Deduplicated task request only. |
| 150 | New-production trigger | packages/agent/src/ingestion-proactive-trigger.ts; packages/agent/test/ingestion-proactive-trigger.test.ts; npm test -- packages/agent/test/ingestion-proactive-trigger.test.ts packages/agent/test/proactive-triggers.test.ts | No parsing, provider call, or graph effect in trigger. |
| 151 | Investigation cadence trigger | packages/agent/src/investigation-proactive-trigger.ts; packages/agent/test/investigation-proactive-trigger.test.ts; npm test -- packages/agent/test/investigation-proactive-trigger.test.ts packages/agent/test/proactive-triggers.test.ts | High-water, cooldown, and budget enforcement. |
| 152 | Memory curation | packages/agent/src/memory-curation.ts; packages/agent/test/memory-curation.test.ts; npm test -- packages/agent/test/memory-curation.test.ts packages/agent/test/memory.test.ts | Source-bound advisory memory cannot establish ontology truth. |

Every vertical runs npm run verify, its approved cross-boundary suite, and real Nous acceptance when it invokes a provider. Provider outage records a safe resumable state and feasibility evidence; it never becomes a fabricated pass.

## Wave 4: Integrated Acceptance Matrix

A owns integration and failure-injection tests only. It returns defects to the owner lane and does not repair production code without a separately approved repair range.

| ID | Scenario | Deterministic command | Live or deployment gate | Required proof |
| --- | --- | --- | --- | --- |
| A-01 | Mounted workspace restart | npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts | None | Fresh process reconstructs task, plan, context, handoff, and claim from mounted state. |
| A-02 | Disconnect and reconnect | npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts | Actual mount/reconnect test | No internal ledger/projection/artifact/derivative write; identity, high-water, policy, locks reverified. |
| A-03 | Real Nous portable evidence triage | npm test -- packages/agent/test/evidence-triage-bounded-loop.test.ts | npm run agent:nous:smoke | Safe IDs, hashes, event IDs, counts, categories, durable handoff readback. |
| A-04 | Legacy import to proposal | npm test -- packages/agent/test/legacy-to-ontology-bootstrap.test.ts | Real Nous when selected by policy | Evidence-first staging, artifact/source/content-hash binding. |
| A-05 | PRR trigger to draft | npm test -- packages/agent/test/prr-proactive-trigger.test.ts packages/agent/test/prr-negotiation-draft-only.test.ts | None | Idempotency, cooldown, budget, draft handoff, no send. |
| A-06 | Planning and contradiction discovery | npm test -- packages/agent/test/investigation-planner-bounded-loop.test.ts packages/agent/test/contradiction-finder-workflow.test.ts | Nous if selected by policy | Bounded termination, advisory outputs, provenance, handoff readback. |
| A-07 | BYOK and local model | npm test -- packages/agent/test/byok-provider.test.ts packages/agent/test/local-model-provider.test.ts | Approved local compatibility smoke | Same capability, readiness, and secret-safe diagnostic contract. |
| A-08 | Subscription feasibility | npm test -- packages/agent/test/codex-subscription-harness.test.ts packages/agent/test/xai-subscription-harness.test.ts | Official flow only | Acceptance pass or durable unavailable feasibility evidence. |
| A-09 | Cockpit and tailnet | npm test -- packages/ui/test/resident-supervision-panel.test.tsx packages/ui/test/resident-runtime-adapter.test.ts | Served checkout desktop/mobile/tailnet inspection | Route DTO parity and supported commands only. |
| A-10 | Adversarial failures | npm test -- packages/agent/test/plan-observation-projection.test.ts packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/specialist-handoff-projection.test.ts | None | Forged/stale approval, stale source, duplicate claim, budget, crash, secret, and cross-run DTO failures fail closed. |

## Task 153: Coordinator Release Gate

**Files:**
- Modify: docs/agentic/resident-agent-full-vision-program-registry.md
- Modify: docs/agentic/resident-agent-full-vision-acceptance-matrix.md
- Create: docs/agentic/claims/task-153-resident-full-vision-release-gate.md

**Preconditions:** A-01 through A-10 have a recorded verdict, accepted repairs are merged, downstream worktrees are rebased, and unavailable subscription harnesses have feasibility records.

- [ ] **Step 1: Rebuild the served checkout**

Run:

~~~bash
npm run verify
~~~

Expected: typecheck, deterministic tests, UI build, and factory readiness pass from the tailnet-served checkout.

- [ ] **Step 2: Run live provider acceptance**

Run:

~~~bash
npm run agent:nous:smoke
~~~

Expected: real approved Nous path emits only safe status markers and durable evidence references.

- [ ] **Step 3: Verify deployment and archive facts**

Record served SHA, desktop/mobile/tailnet observations, live result, acceptance verdicts, worktree cleanliness, ancestry, merge state, and child final answers.

- [ ] **Step 4: Commit release evidence**

~~~bash
git add docs/agentic/resident-agent-full-vision-program-registry.md docs/agentic/resident-agent-full-vision-acceptance-matrix.md docs/agentic/claims/task-153-resident-full-vision-release-gate.md
git commit -m "docs: record resident full-vision release gate"
~~~

The coordinator alone decides merge, push, cleanup, and archive after registry facts agree.

## Merge, Rebase, And Stop Rules

1. Shared plan/observation/wake/trigger contracts merge before consumers. Durable workflow migrations merge before mounted store, runner, and runtime composition. Runtime routes merge before cockpit consumers. Cockpit and cross-domain bridges merge after domain/runtime producers.
2. After each contract-changing merge, the coordinator records its SHA, rebases every dependent worktree, reruns the dependency's cross-lane command, and records the rebase in claim and registry. A stale branch is not reviewed or merged.
3. The coordinator never merges a child branch into neo without an explicit integration instruction. Children never self-merge.
4. Stop a child and return structured evidence to the coordinator for data-loss risk, hidden fallback storage, schema/DTO/event/file-owner conflict, synthetic handoff, placeholder prompt, unbound or stale artifact/source, self-approval, stale approval consumption, workspace identity mismatch, unofficial token extraction, missing required model configuration, unavailable mandatory provider/dependency, or more than two focused repair attempts without verifier recovery. Repair-count exhaustion is an internal coordinator recovery checkpoint, not a user gate. Stop the program for user input only when root-cause analysis proves that continuing requires a genuine product, scope, safety, data-loss, credential, or external-behavior decision under the governing specification.
5. Archive only when final answer, claim, clean worktree, branch ancestry, verification evidence, review verdict, and coordinator merge state agree.

## Plan Self-Review Checklist

- [ ] Every umbrella goal, non-goal, invariant, lane, wave, completion criterion, and stop condition maps to a Wave 0 plan, freeze entry, work order, or acceptance ID.
- [ ] Every production owner is singular: R owns the default runtime factory, P owns shared provider configuration, the frozen contract owner owns shared event changes, U consumes merged routes/DTOs, and A owns acceptance tests only.
- [ ] Every executable dispatch requires exact spec, exact plan, allowed range, wave stop, superpowers:subagent-driven-development authorization, TDD, fresh review, verification-before-completion, no self-merge, and GPT-5.6 Terra Extra High.
- [ ] All consumers wait for frozen contracts and named merged predecessors. Dependent worktrees rebase before review.
- [ ] Provider-bearing verticals have a real Nous gate or feasibility evidence. Deterministic commands remain credential-free.
- [ ] Portable-workspace, trigger, plan/observation, handoff, approval, secret, cockpit, and deployment requirements have deterministic or live acceptance coverage.
- [ ] git diff --check, npm run factory:check, and npm run verify pass before this plan is committed.

## Completion Criteria

This program plan is ready for implementation approval when this checklist is satisfied, documentation checks and full verification pass, and the plan is committed. Under the Standing Coordinator Delegation at `c7dc10b9`, the coordinator must then send and record the exact scoped implementation-authorization message for the precise Wave 0 range; a user may supply the same message. Approval of this plan alone does not authorize child dispatch, superpowers:subagent-driven-development, or production changes.
