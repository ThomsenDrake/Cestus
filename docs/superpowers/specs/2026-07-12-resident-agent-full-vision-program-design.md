# Resident Agent Full-Vision Program Design

Date: 2026-07-12

## Purpose

This design defines the remaining program required to make Cestus a genuinely
AI-native application with one first-class resident Cestus Agent. It starts
from the resident identity, task orchestrator, approval gateway, provider
runtime, memory contracts, durable handoff kernel, and real Nous evidence-
triage vertical already merged into `neo`.

The program closes the difference between an implemented resident-agent kernel
and a production resident that can operate a portable investigative workspace
while the browser is closed. It also expands the bounded resident into the
approved specialist, proactive-trigger, provider, planning, observation,
memory, and cockpit capabilities.

The implementation strategy is a contract-first wave factory. Independent
lanes design and implement in parallel, but shared events, DTOs, capability
interfaces, file ownership, and merge order are frozen before dependent code
lands.

## Current Product Truth

Cestus already has:

- One durable resident identity, `agent_default`.
- Append-only task, orchestration, specialist run, model invocation, tool,
  approval, handoff, and memory events.
- Durable task claims, leases, retries, cancellation, budgets, approval waits,
  context verification, provider selection, and restart projection.
- A tool gateway and approved-tool scheduler that remain separate from task
  orchestration.
- A real Nous evidence-triage acceptance path with provider-byte-transfer
  approval and durable handoff sequencing.
- Task composition, run cockpit, approval, audit, and memory UI surfaces.

The default local runtime still fails closed for production orchestration. Its
context registry is empty, its prompt renderer lacks an approved run binding,
and its specialist runner registry refuses autonomous dispatch. The live
evidence-triage proof uses injected capabilities and in-memory test stores.
PRR negotiation, investigation planning, and ontology bootstrap do not all use
the final durable handoff lifecycle. Runtime handoff projection and browser
diagnostics remain incomplete. Wake behavior is exposed through manual routes,
not a supervised background service.

## Goals

- Compose the default local runtime with real mounted-workspace context,
  prompts, specialist runners, derivative stores, and durable handoffs.
- Prove task creation through restart reconstruction using an actual portable
  workspace and the real Nous provider.
- Keep the resident running under a supervised local service while the browser
  is closed.
- Fail closed without internal fallback writes when the portable workspace is
  disconnected or fails identity verification.
- Add a bounded plan-observe-tool-replan kernel with specialist-owned budgets
  and tool allowlists.
- Automatically queue and run reversible local advisory work from safe,
  deduplicated triggers.
- Complete durable handoff production, projection, and cockpit consumption for
  every production specialist runner.
- Implement production evidence-triage, ontology-bootstrap,
  investigation-planner, PRR-negotiation, timeline-builder,
  contradiction-finder, and report-builder modes.
- Add generic OpenAI-compatible BYOK, OS-backed secret storage, local-model
  execution, an OpenAI Codex subscription harness, and an officially
  supportable xAI subscription harness.
- Preserve Nous as the mandatory reference provider so uncertain subscription
  integrations cannot block the resident MVP.
- Keep the design legible and executable by generic coding agents.

## Non-Goals

- Newsroom or nonprofit team mode, multi-user roles, shared workspace hosting,
  or organization-wide authorization.
- Autonomous PRR send, legal escalation, export, publication, destructive
  repair, sensitive disclosure, or accepted graph mutation.
- Treating model output, plans, observations, or memory as accepted ontology
  truth.
- Reusing subscription tokens as general API credentials or extracting
  unofficial browser tokens.
- An unbounded general-purpose agent loop.
- Internal fallback ontology, ledger, or artifact writes when the portable
  workspace is unavailable.

## Governing Invariants

- The ledger remains append-only and all projections remain rebuildable.
- Cestus owns the resident identity, orchestration, memory, permissions, audit
  trail, and tools. Providers and harnesses are interchangeable backends.
- Every investigative conclusion, handoff, memory item, plan, and observation
  retains exact provenance and artifact bindings.
- Agent-generated graph changes remain proposals until a human-governed domain
  service accepts them.
- Provider byte transfer and every irreversible or external effect require the
  existing independent-human approval contract.
- Runtime composition must use registered production capabilities. Placeholder
  prompts, synthetic handoffs, inert readiness, and lifecycle-only execution
  controls are forbidden.
- Secrets remain outside the portable workspace. Portable state contains only
  secret-safe credential references.
- Every public boundary snapshots and validates plain own-data structures once
  before any append, blob write, provider call, or `await`.
- A terminal-looking result is valid only after ledger and artifact readback.
- The external workspace identity and mounted stores remain authoritative.
- Automatic resident work is limited to local, reversible, advisory actions
  within declared budgets.

## Program Architecture

The program is split into eight owned lanes.

### Runtime Composition Lane

This lane owns the production assembly of context builders, resolved payloads,
prompt rendering, provider policy, specialist dispatch, mounted derivative and
handoff stores, and runtime readiness. It is the sole owner of
`packages/local-runtime/src/agent-runtime-factory.ts` during integration.

Other lanes expose narrow adapters to this lane and must not independently
modify the default runtime factory.

### Durable Specialist Lane

This lane completes durable handoff adoption for PRR negotiation,
investigation planning, and ontology bootstrap. It also adds mounted runtime
handoff projection, diagnostics, and browser-safe DTOs.

Each specialist implementation uses its own task-scoped branch and owns only
its workflow and focused tests. Shared handoff contracts remain owned by a
single integration task.

### Wake And Portable Lifecycle Lane

This lane owns the supervised background service, wake scheduling, pause and
resume, bounded polling fallback, event-driven wake signals, process recovery,
portable-drive disconnect, workspace identity revalidation, and secret-safe
health diagnostics.

The browser observes and controls this service but does not keep it alive.

### Bounded Agent Loop Lane

This lane owns plan, observation, step-budget, tool-selection, and replan
contracts. Every specialist descriptor declares its allowed tools and
versions, context requirements, maximum planning and tool steps, provider and
byte budgets, automatic local actions, approval classes, and terminal or
resumable states.

The loop cannot broaden its own permissions, tools, provider posture, budgets,
or approval authority. Multi-step execution is enabled first for evidence
triage, ontology bootstrap, and investigation planning. PRR negotiation and
report building remain draft-only until their dedicated effect-gate acceptance
passes.

### Proactive Trigger Lane

Triggers contain no model prompts and execute no domain effects. They append
deduplicated, provenance-bound resident task requests with cooldown, budget,
source high-water mark, and trigger-policy metadata.

Initial trigger families are:

- PRR deadline, fee, correspondence, and stalling changes.
- New ingestion production and evidence readiness.
- Evidence-gap and contradiction scan eligibility.
- Investigation planning cadence.
- Portable-workspace health and recovery.

### Provider And Credential Lane

Independent provider tasks implement generic OpenAI-compatible BYOK,
OS-keychain-backed secret resolution, local-model execution, OpenAI Codex
subscription harness integration, and officially supportable xAI subscription
harness integration.

Subscription implementations are feasibility-gated and must preserve provider-
specific semantics. An unavailable official flow is recorded as a visible
provider limitation and cannot block Nous, BYOK, or local-model readiness.

One provider-integration owner modifies shared provider registry and local
configuration files after the independent adapters pass focused review.

### Resident Cockpit Lane

The cockpit renders browser-safe runtime truth. It adds wake state, pause and
resume, next wake, trigger provenance, orchestration claim state, bounded plan
and observation history, handoff diagnostics, provider setup, task retry and
cancellation, and portable-workspace availability.

React owns no canonical execution state. Controls invoke only supported runtime
commands, and every label reflects the effect actually performed.

### Acceptance Lane

This lane owns only integration and failure-injection tests. It consumes merged
production capabilities and does not repair upstream code except through
explicit review findings returned to the owning lane.

Acceptance covers mounted storage, process restart, disconnect and reconnect,
real providers, trigger idempotency, bounded-loop termination, approval races,
secret leakage, browser DTO parity, and tailnet deployment.

## Resident Execution Model

The supervised runtime follows this lifecycle:

```text
workspace verified
-> wake supervisor starts
-> trigger or queued task detected
-> durable orchestration claim
-> bounded plan proposed
-> context assembled and verified
-> specialist run selected
-> local steps execute
-> provider or tool approval requested when required
-> observations appended
-> plan revised within budget
-> durable handoff recorded and read back
-> task completed, blocked, or safely resumable
```

Planning and observation records are advisory derivative material. They bind
the task, attempt, run type, source events, context artifacts, tool requests,
model invocations, budget snapshot, and policy version. They do not mutate
accepted graph state.

Automatic local work may read projections, build context, calculate deadlines,
classify local artifacts, propose investigative next steps, identify
contradictions, and write local review artifacts. It may not approve itself or
cross an external-effect gate.

## Portable Workspace Lifecycle

When the portable workspace disconnects or its identity changes, the resident:

1. Stops new claims, tool execution, provider calls, and artifact writes.
2. Releases active orchestration claims into a resumable
   `workspace-unavailable` state.
3. Writes no ontology, ledger, projection, or derivative fallback to internal
   storage.
4. Retains only bounded, secret-safe process diagnostics in ephemeral memory.
5. Waits for the same workspace identity, ledger high-water mark, mounted
   artifact store, policy, and active locks to be reverified.
6. Resumes through normal claim recovery rather than synthetic continuation.

The wake supervisor must tolerate the browser closing, local runtime restart,
temporary provider unavailability, laptop sleep, and repeated mount events.

## Parallel Wave Design

### Wave 0: Contract Design

Eight design-and-plan tasks run in parallel after this umbrella spec is
approved:

| Lane | Deliverable |
| --- | --- |
| R | Production runtime composition and mounted-workspace vertical |
| H | Remaining durable handoff adoption and projection |
| W | Background wake supervisor and portable-drive lifecycle |
| L | Bounded plan-observe-tool-replan kernel |
| T | Proactive trigger framework and initial trigger families |
| P | Provider, harness, BYOK, local-model, and keychain architecture |
| U | Resident cockpit execution and supervision UX |
| A | Cross-lane acceptance and failure-injection architecture |

Each task stops after an approved spec and measurable implementation plan. A
coordinator then writes one contract-freeze commit defining shared event names,
DTO versions, capability signatures, file ownership, and merge order.

### Wave 1: Independent Foundations

The following implementation tasks start together:

- Shared plan, observation, wake, and trigger event contracts.
- PRR durable handoff adoption.
- Investigation-planner durable handoff adoption.
- Ontology-bootstrap durable handoff adoption.
- Wake supervisor core.
- Portable disconnect and reverify adapter.
- Generic BYOK configuration.
- OS-keychain secret store.
- Local-model provider adapter.
- Codex harness feasibility and adapter.
- xAI harness feasibility and adapter.
- Cockpit DTO and parser preparation.

The shared contract branch merges first. Other branches may implement against
the frozen spec concurrently but must rebase before review and merge.

### Wave 2: Runtime Integration

After Wave 1 merges, these tasks run in parallel:

- Production context-pack registry composition.
- Production prompt renderer with exact run binding.
- Production specialist runner registry.
- Mounted derivative and handoff artifact capabilities.
- Bounded agent-loop kernel.
- Wake supervisor and runtime integration.
- Durable handoff runtime projection.
- Provider configuration integration.
- Cockpit wake, pause, resume, retry, and handoff UI.

Only the runtime-composition task edits the default local runtime factory.

### Wave 3: Specialist And Trigger Expansion

These verticals run simultaneously:

- Evidence-triage bounded loop.
- Legacy import to ontology-bootstrap.
- Investigation planner and evidence-gap scans.
- PRR monitoring and draft-only negotiation.
- Timeline builder.
- Contradiction finder.
- Report builder in local draft mode.
- PRR deadline and stalling trigger.
- New-production trigger.
- Investigation cadence trigger.
- Memory curation and consolidation.

Every vertical ends in a durable handoff and has real-provider acceptance when
provider behavior affects the result.

### Wave 4: Integrated Acceptance

Independent acceptance tasks run against the merged production runtime:

- External-drive disconnect, reconnect, and process restart.
- Real Nous portable evidence-triage.
- Legacy import to fresh ontology proposals.
- PRR deadline trigger to reviewed local draft.
- Investigation planning and contradiction discovery.
- BYOK and local-model compatibility.
- Codex and xAI harness acceptance when feasibility gates pass.
- Cockpit desktop, mobile, and tailnet behavior.
- Secret leakage, forged approval, stale source, duplicate claim, budget, and
  crash-boundary failures.

### Wave 5: Release Integration

One integration owner merges acceptance repairs, rebuilds the served checkout,
runs cross-boundary and full verification, reruns required live provider gates,
verifies the tailnet deployment, and records explicitly deferred provider
limitations.

## Factory Execution Contract

Every child task, implementer, repair task, and reviewer uses GPT-5.6 Terra with
Extra High reasoning. The task must stop if the destination host cannot provide
that exact configuration. Silent fallback is forbidden.

### Standing Coordinator Delegation

Approval of this umbrella program and its governing implementation plan grants
the dedicated program coordinator standing authority to operate the approved
factory without returning routine checkpoints to the user. Within an approved
wave and its stated file ownership, the coordinator may:

- Issue the exact implementation-authorization message required by this spec.
- Approve and dispatch a focused review repair in response to a reviewer
  finding.
- Continue beyond a child lane's ordinary repair-attempt threshold by recording
  a root-cause checkpoint, replacing the implementer or reviewer, changing the
  counterfactual audit or repair tactic, and issuing a new bounded
  authorization that remains inside the approved contract.
- Reuse or replace stale implementers and reviewers.
- Restore lockfile-defined dependencies in isolated worktrees.
- Run coordinator-controlled network, live-provider, socket, IPC, and Git
  metadata gates.
- Rebase dependent worktrees after contract merges.
- Advance to the next task or lane whose recorded dependencies and approval
  gates are already satisfied.
- Perform task review, merge-readiness, cleanup, and archival administration.

The coordinator must still send and record a complete authorization message to
each implementation or repair child. Standing delegation changes who supplies
that message; it does not weaken the requirement to name the exact spec, plan,
task range, wave stop, `superpowers:subagent-driven-development`, TDD, fresh
review, verification, model configuration, and no-self-merge rule.

The coordinator escalates to the user only when work would require:

- A new product decision not governed by the approved umbrella design.
- Scope outside the approved program or current wave.
- A changed safety, approval, portable-storage, or ontology-truth invariant.
- Data-loss risk or an irreversible recovery decision.
- Unofficial credential or subscription-token extraction.
- Acceptance of a provider limitation that changes promised product behavior.
- Proceeding without GPT-5.6 Terra Extra High when that configuration is still
  mandated.

Ordinary `needs-changes` reviews, missing dependencies, stale reviewers,
sandbox restrictions, coordinator live gates, merge conflicts with an
unambiguous contract-preserving resolution, and documentation corrections are
not user escalation conditions.

Repair-count exhaustion by itself is also not a user escalation condition.
After two focused attempts, the coordinator must append a root-cause record,
stop and preserve the failing child, select a fresh implementer and reviewer or
a materially different verification tactic, issue a new exact scoped
authorization, and continue. It escalates only if that root-cause analysis
shows the approved contract cannot be satisfied without one of the genuine
user decisions listed above.

Every implementation task follows:

```text
approved spec
-> approved implementation plan
-> isolated worktree
-> claim-only commit
-> RED test
-> focused implementation
-> targeted GREEN
-> full verify
-> task commit
-> fresh review
-> repair and re-review
-> coordinator merge gate
```

Child tasks start from current `neo`, use the repo-local Cestus software-factory
skill and relevant Superpowers skills, and record exact owned and forbidden
files. They do not merge themselves. The coordinator owns rebases, merge order,
unrestricted verifier reruns, live provider gates, worktree cleanup, thread
archival, and final push decisions.

An implementation plan approval is not implicit permission to choose an
execution process. Every coordinator or user approval message that authorizes a
child task to begin implementation must explicitly state that the approved plan
may be executed using `superpowers:subagent-driven-development` when that skill
is relevant. The approval must identify the exact approved spec and plan, the
allowed task range, and any wave stop point. A child task must remain at its
implementation gate when the approval message omits this explicit process
authorization.

The standard approval wording is:

```text
The referenced spec and implementation plan are approved. Execute the approved
task range using superpowers:subagent-driven-development, test-driven
development, fresh task reviews, and verification-before-completion. Stop at
the stated wave boundary and do not merge into neo.
```

## Merge Gates

- Merge shared event and DTO contracts before their consumers.
- Merge domain workflows before default runtime composition.
- Merge runtime routes before browser consumers.
- Merge cockpit and cross-domain bridge tasks last.
- Run targeted cross-lane suites after every dependent merge pair.
- Rebase every downstream worktree after a contract-changing merge.
- Keep `docs/agentic/software-factory.md` additive and move detailed evidence
  into task claims.
- Never merge `.superpowers/sdd` scratch state.

## Verification Strategy

Deterministic suites remain credential-free. Live provider checks use approved
local credentials and emit only fixed statuses, provider and model IDs, hashes,
event IDs, counts, categories, and safe markers.

Portable-runtime acceptance uses an actual mounted ledger and artifact store.
Restart tests construct a fresh runtime process from disk rather than reusing
in-memory objects. Disconnect tests prove there are no internal fallback
writes. Trigger tests prove idempotency, cooldowns, budget limits, source high-
water marks, and absence of external effects. Agent-loop tests prove maximum-
step termination, approval suspension, retry idempotency, and crash recovery.

Browser tests parse production-shaped runtime DTOs and invoke only supported
commands. Final deployment verification rebuilds the checkout served on the
tailnet and inspects desktop and mobile behavior.

## Stop Conditions

Stop a lane on:

- Data-loss or hidden fallback-storage risk.
- Shared schema, event, DTO, or file-ownership conflict.
- Synthetic handoff, placeholder prompt, or fabricated readiness.
- Unbound, missing, stale, or swapped source and artifact references.
- Self-approval or stale approval consumption.
- Portable-workspace identity mismatch.
- Provider integration requiring unofficial token extraction.
- External dependency unavailable for a mandatory acceptance gate.
- Repeated repair failure whose root-cause analysis proves that satisfying the
  approved contract requires a genuine user decision listed in the Standing
  Coordinator Delegation section.
- Unavailable GPT-5.6 Terra Extra High configuration.

## Completion Criteria

The program is complete when:

- A task created through the production HTTP route can be claimed, planned,
  context-bound, approved, executed through real Nous, persisted to the mounted
  workspace, reconstructed after process restart, and rendered in the cockpit.
- The supervised resident continues while the browser is closed and safely
  pauses on portable-workspace disconnect.
- Evidence triage, ontology bootstrap, investigation planning, PRR drafting,
  timeline building, contradiction finding, and report drafting all produce
  durable, provenance-complete handoffs.
- Approved proactive triggers queue bounded local work without duplicate or
  external effects.
- Plans, observations, tool steps, memory, and handoffs remain inspectable and
  advisory until their governing human or domain review.
- Nous, generic BYOK, and local-model backends pass their acceptance matrices.
- Codex and xAI harnesses either pass official integration acceptance or remain
  visibly unavailable with evidence-backed feasibility records.
- Full verification, factory readiness, portable failure injection, live
  provider checks, and tailnet UI verification pass from the served checkout.
