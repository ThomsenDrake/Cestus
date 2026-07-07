# Resident Agent Execution And Approval Design

Date: 2026-07-07

## Purpose

This design defines the resident Cestus Agent execution loop and human approval cockpit that sit after the resident-agent foundation. The foundation establishes one default workspace agent identity, agent events, provider references, tool requests, projections, local runtime status, and an Agent workspace. This follow-up design explains how that agent accepts work, assembles context, invokes model providers, records observations and memory, pauses for risky tools, waits for human approval, resumes safely, handles failures, and hands work back for human review.

The design keeps one strict boundary:

```text
tool gateway = append and validate requests, approvals, denials, and results
execution loop = schedule, pause, resume, execute allowed effects through domain services, and record outcomes
```

The gateway must not become a hidden executor. The approval cockpit must be a review queue, not a command launcher.

## Existing Context

The design builds on these existing contracts:

- `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md` defines the resident agent identity, provider boundary, tool request vocabulary, memory model, and broad UI surfaces.
- `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md` scopes the current foundation work to agent event contracts, projections, fake providers, tool-gateway approval contracts, local runtime status, CLI, operator status, and a first Agent UI surface.
- `packages/operator-status/src/contracts.ts` rejects operator actions that mutate canonical state, have external effects, or display forbidden commands such as PRR send, provider transfer, legal escalation, import approval, canonical repair, or accepted graph review.
- `packages/local-runtime/src/http-handler.ts` exposes read and draft routes, keeps non-loopback auth behavior, and does not expose destructive PRR, legal escalation, or ledger routes.
- `packages/prr/src/correspondence-service.ts` and `packages/prr/src/lifecycle.ts` require approved message input and request lifecycle checks before `prr.request.sent`.
- `packages/ingestion/src/provider-adapter.ts` records `ingestion.provider.approved` as a human approval before provider parsing may transfer bytes.
- `packages/ontology/src/governance-service.ts` requires human service actors for governance review, redaction, quarantine, tombstone, network exposure, device approval, and sensitive export or report opt-ins.
- `packages/workspace-ops/src/contracts.ts` marks canonical repair actions as human-approved, append-only repair work.

The execution loop should compose these domain services. It must not append final PRR send, provider transfer, sensitive export, legal escalation, destructive repair, or accepted graph events directly as a shortcut.

## Goals

- Define a conservative task and run lifecycle for the one default resident Cestus Agent.
- Keep context assembly explicit, inspectable, provenance-backed, and budgeted.
- Audit every model invocation without storing secrets, raw provider errors, or hidden prompt state.
- Record observations and memory without turning memory into accepted graph truth.
- Define a tool request queue with preview hash binding, stale approval handling, and runtime resume behavior.
- Define the approval cockpit UX and runtime contract for approving or denying risky tool requests.
- Cover approval classes for provider byte transfer, PRR send and follow-up, legal escalation, export and publication, destructive repair, and accepted graph review.
- Preserve append-only ledger semantics, provenance, projection rebuildability, human-approved PRR send gates, legal escalation locks, secret safety, portable workspace compatibility, and AI-legibility.

## Non-Goals

- Adding rich specialist behavior such as full PRR negotiation, ontology bootstrap, report generation, live provider orchestration, or team workflows in the first follow-up slice.
- Treating approval cockpit actions as operator `safeActions`.
- Letting the resident agent approve its own tool requests or clear legal, export, secret, or data-loss locks.
- Letting generic tool approval replace existing accepted graph review, PRR send, provider approval, governance review, export, or repair domain semantics.
- Designing live OpenAI, xAI, Gmail, IMAP, SMTP, document-AI, or enterprise gateway credentials.
- Building production source-code changes in this design thread.

## Approved Direction

The design uses a scheduler/resumer execution loop with an approval review queue.

The alternatives considered were:

- Make the tool gateway execute approved tools directly. This is rejected because it would mix request validation with effect execution and make stale approval behavior harder to audit.
- Treat approval cockpit items as operator safe actions. This is rejected because operator safe actions are intentionally inert navigation, refresh, or display-only command descriptors.
- Let each specialist workflow manage its own approval state. This is rejected for the first resident-agent execution layer because approval semantics must stay uniform across provider transfer, PRR, legal, export, repair, and graph review classes.

The execution loop owns scheduling, pausing, resuming, retry classification, and runtime handoff. The gateway owns request, approval, denial, completion, and failure events. Domain services remain authoritative for their own risky effects.

## Task Lifecycle

A durable agent task starts from a human request, a system trigger, or a safe follow-up from an earlier run. The task lifecycle is intentionally conservative:

```text
created -> queued -> running -> waiting-for-approval -> approved-resumable -> running -> completed
                                                           |                  |
                                                           |                  -> failed
                                                           -> denied
created -> queued -> running -> blocked
created -> queued -> canceled
```

The runtime may also expose terminal `failed` and `canceled` states from any non-terminal state.

State meanings:

- `created`: a durable user or system request exists, but the scheduler has not accepted it.
- `queued`: the scheduler has accepted the task and is waiting for execution capacity.
- `running`: the execution loop is assembling context, invoking a model, recording an observation, or executing an already-authorized local operation.
- `waiting-for-approval`: the run emitted one or more tool requests whose side-effect class requires a human decision.
- `approved-resumable`: all required approvals for the next step exist, preview hashes match, and the scheduler may resume after final lock and staleness checks.
- `blocked`: the run cannot proceed without a different human or system action.
- `completed`: the run produced final outputs, result references, and review handoff state.
- `failed`: the run reached a safe failure with retryability and allowed repair actions.
- `canceled`: a human or policy canceled the task or run without deleting history.

First-class blocked or failure states:

- `approval-stale`: approval hash no longer matches the current preview or source state.
- `lock-active`: legal, export, secret, governance, data-loss, or workspace lock blocks the effect.
- `missing-provenance`: required source event IDs, evidence IDs, content hashes, or context pack refs are missing.
- `secret-detected`: prompt, context pack, tool input, provider output, memory, diagnostic, or DTO contains secret-shaped material.
- `provider-unavailable`: selected provider cannot be reached, is disabled, or lacks required capability.
- `credential-missing` or `credential-revoked`: credential reference cannot produce a usable secret outside the ledger.
- `projection-lag`: required accepted graph, governance, PRR, ingestion, workspace, or agent projection is stale or failed.
- `domain-gate-failed`: a domain service rejected execution, such as PRR lifecycle, export planning, stale-source verification, or accepted assertion review.
- `data-loss-risk`: any path suggests deleting, rewriting, compacting, resetting, or silently migrating canonical ledger or blob state.

The agent never erases prior states. State changes append events and projections derive the current view.

## Execution State Machine

The execution loop is a deterministic runtime service over append-only events and content-addressed artifacts.

Core loop:

1. Load due tasks and runs from the agent projection.
2. Skip canceled, completed, failed, or blocked runs unless a human repair event makes them resumable.
3. Assemble context packs for the run scope.
4. Classify risk and choose the next step.
5. Invoke a model provider for pure reasoning or draft generation when policy allows it.
6. Record model invocation request, completion, or failure.
7. Record observations, draft artifacts, and memory candidates.
8. For side effects, ask the tool gateway to append `agent.tool.requested` with preview hash and approval class.
9. Move the task or run to `waiting-for-approval`.
10. On matching approval, re-check preview, locks, policy version, source hashes, projection high-water marks, and provenance.
11. Execute the approved effect through the authoritative domain service.
12. Append `agent.tool.completed` or `agent.tool.failed` with returned event IDs and artifact hashes.
13. Continue, complete, fail, or block.

The execution loop never treats an approval as permission to bypass a domain service. A PRR send still flows through PRR correspondence services. Provider parsing still flows through ingestion provider approval and runtime services. Export still flows through governance export planning. Accepted graph review still flows through ontology review semantics.

## Context Assembly Contract

Context assembly is explicit and inspectable. A run receives a set of context packs, not an opaque prompt blob. Each context pack has:

- stable context pack ID
- version
- provider function name
- workspace or investigation scope
- input refs
- size budget
- redaction policy
- provenance refs
- content hash
- generated timestamp
- projection high-water mark when relevant
- safe summary for UI

Required first context packs:

- `accepted-graph-projection.v1`: accepted assertions, resolved entities, relationships, and provenance from rebuildable ontology projection.
- `evidence-summary.v1`: evidence metadata, safe text excerpts when permitted, content hashes, governance state, and redaction/quarantine flags.
- `prr-read-model.v1`: request queue rows, request detail state, deadlines, correspondence summaries, send gates, legal escalation gates, and diagnostics.
- `governance-locks.v1`: policy version, active locks, export eligibility, sensitive opt-in requirements, quarantine state, and incident state.
- `agent-memory-summary.v1`: active memory items scoped to workspace, investigation, task, provider, and policy, with source refs and confidence.
- `task-run-history.v1`: prior task events, model invocation summaries, tool requests, approvals, denials, failures, and result refs.
- `workspace-runtime-status.v1`: mounted workspace identity, projection readiness, local runtime bind and auth posture, and operator-status diagnostics.

Rules:

- Context packs are content-addressed artifacts or deterministic DTOs with hashes recorded in model invocation and tool preview events.
- Context pack text must be secret-safe and raw-content-free unless the approval class explicitly allows a transfer or export.
- Memory can influence recommendations, but memory cannot become accepted graph state.
- Accepted graph facts come only from accepted ontology events and rebuildable projections.
- If a required context pack cannot be produced within budget, the run blocks with `context-budget-exceeded` or `projection-lag`.

## Model Invocation Audit

Every provider call is auditable and secret-safe.

`agent.model-invocation.requested` should record:

- invocation ID
- run ID and task ID
- resident agent ID
- provider ID and adapter version
- model family
- credential reference ID and credential kind, without secret value or environment name
- context pack refs and hashes
- input artifact hash
- prompt template ID and version
- safety class
- intended output schema ID
- data-transfer note when a remote provider receives bytes or text

`agent.model-invocation.completed` should record:

- output artifact hash
- output schema ID and validation result
- usage summary
- provider metadata safe for display
- derived observation IDs or tool request IDs

`agent.model-invocation.failed` should record:

- safe failure category
- retryability
- allowed repair actions
- provider descriptor refs
- redacted diagnostic message

Raw provider errors, credentials, tokens, private evidence bodies, and secret-shaped keys must not enter the ledger, memory, DTOs, reports, or factory claims. If secret-shaped material appears in input or output, the invocation fails closed and creates or references a governance/security incident when policy requires it.

## Observations And Memory

The execution loop records observations before it records memory.

Observation rules:

- Observations are run-scoped audit artifacts.
- Each observation references source context pack hashes, model invocation IDs, tool result IDs, or domain event IDs.
- Observations can be reasoning notes, uncertainty flags, contradiction candidates, draft snippets, or review recommendations.
- Observations do not change accepted graph state.

Memory rules:

- Memory entries are append-only events with scope, source refs, confidence, expiry when relevant, and projection version.
- Memory may summarize stable preferences, recurring entities, case goals, review decisions, provider health, or policy caveats.
- Memory may be superseded or retracted by new events.
- Memory with secrets, raw private evidence, source-identifying sensitive text, or ungrounded factual claims must be rejected or quarantined.
- To affect ontology truth, memory must become an evidence-backed `assertion.proposed` or explicit reasoning event and pass normal review.

The memory projection is an assistant aid, not a hidden source of truth.

## Tool Descriptor Registry

Tool descriptors are registered capabilities. Each descriptor has:

- stable tool ID
- version
- side-effect class
- required approval class
- input schema ID
- output schema ID
- preview builder ID
- result mapper ID
- allowed actor kinds
- provenance requirements
- idempotency key rules
- stale-source checks
- lock checks
- secret-safety policy
- domain service target

The first descriptor families are:

- read-only projection and status tools
- local derivative artifact tools
- ledger proposal tools such as `assertion.proposed` or diagnostics
- provider byte transfer tools
- PRR send and follow-up tools
- legal escalation review tools
- export and publication tools
- destructive or repair tools
- accepted graph review tools

Tool descriptors must be AI-legible. A generic coding agent should be able to inspect a descriptor and know what service executes it, what human approval class it needs, what event or artifact refs it must return, and what it is forbidden to do.

## Tool Request Queue

The queue is a projection over agent tool events plus domain service result events.

Queue states:

- `requested`: the gateway accepted the tool request and computed the preview hash.
- `waiting-for-approval`: the task or run is paused on the request.
- `approved`: a human appended approval for the exact preview hash.
- `approved-resumable`: runtime staleness and lock checks passed after approval.
- `denied`: a human or policy denied the request.
- `executing`: the runtime has resumed and is calling the authoritative domain service.
- `completed`: the domain service returned committed event IDs, artifact hashes, or read-model changes.
- `failed`: execution failed safely with category and repair hints.
- `stale`: the approved preview no longer matches current source, context, policy, or lock state.
- `canceled`: the task or run was canceled before execution.

The queue groups requests by run, approval class, risk, and staleness. Multiple approvals may be required for a single high-risk workflow, but each approval binds one exact preview hash.

## Preview Hash Semantics

Approval binds to an exact preview hash.

The canonical preview object should include:

- tool request ID
- tool ID and version
- resident agent ID
- run ID and task ID
- side-effect class
- required approval class
- target domain service
- input schema ID and normalized input hash
- human-readable safe summary
- affected evidence IDs, artifact hashes, event IDs, PRR IDs, report IDs, export IDs, or workspace refs
- expected event types or artifact kinds
- context pack refs and hashes used to build the request
- governance policy version
- lock snapshot
- projection high-water marks
- idempotency key
- expiry timestamp or stale-after condition when relevant

The hash is computed from stable JSON with sorted keys. Formatting, UI labels, and display order do not affect the hash. Any semantic change does affect the hash.

The approval event records:

- approving human actor
- approved preview hash
- approval class
- rationale
- timestamp
- policy version
- scope
- optional constraints such as max bytes, evidence ID subset, or expiration

If source bytes, context pack hashes, projection high-water marks, policy version, lock state, target input, selected recipients, rendered body hash, export plan, accepted graph candidate set, or domain service descriptor changes after approval, the request is stale and cannot execute.

## Stale Approval Handling

Stale approvals fail closed.

When the execution loop sees an approval, it must:

1. Rebuild the preview from the latest descriptor, source refs, policy, locks, and context packs.
2. Compare the rebuilt hash to the approved hash.
3. Confirm the request has not been denied, failed, completed, or canceled.
4. Confirm the approving actor is human and not the resident agent.
5. Confirm all class-specific locks are clear.
6. Confirm affected source bytes and content hashes are unchanged where relevant.
7. Confirm projection high-water marks still satisfy the preview.
8. Confirm the target domain service can still accept the input.

If any check fails, the runtime appends `agent.tool.failed` or equivalent failure state with category `approval-stale` and allowed repair actions such as rebuilding the preview, requesting a new approval, or inspecting source changes. The old approval remains in history but is not executable.

## Resume Behavior

Approval does not execute the tool. Approval makes the run eligible for runtime resume.

Resume flow:

1. Approval cockpit appends `agent.tool.approved` or `agent.tool.denied` through a human-authenticated route or CLI.
2. The scheduler sees an approved request in the queue.
3. The scheduler rebuilds the preview and performs staleness, lock, permission, provenance, and secret-safety checks.
4. If checks pass, the run state becomes `approved-resumable`, then `running`.
5. The runtime calls the authoritative domain service named by the tool descriptor.
6. The domain service appends its own events or returns artifacts according to existing contracts.
7. The runtime appends `agent.tool.completed` with exact event IDs, artifact hashes, read-model changes, and result mapper output.
8. The runtime records observations and memory candidates from the result.
9. The run either continues, completes, or pauses again.

Denied requests move the run to blocked or canceled depending on the task policy. Denial events should include a human rationale and safe alternatives.

## Approval Classes

### Provider Byte Transfer

Use when document bytes, evidence excerpts, raw text, or private case context would leave the local machine for model or document-AI processing.

Required preview fields:

- provider label and adapter version
- evidence IDs and content hashes
- byte counts and media types
- excerpt policy
- eligible media types
- max bytes per file
- retention and data-transfer note when known
- governance tags and locks

Execution must route through ingestion or model-provider services that enforce provider approval and credential boundaries. Existing `ingestion.provider.approved` remains a domain approval event before provider parsing may transfer bytes.

### PRR Send And Follow-Up

Use when the agent proposes sending an initial PRR, follow-up, appeal, or correspondence.

Required preview fields:

- PRR request ID
- correspondence ID
- recipients, subject, body hash, attachment evidence IDs, and rendered body hash
- jurisdiction pack refs and citations
- send gate checks
- idempotency key
- provider capability summary

Execution must route through PRR correspondence services. The agent cannot append `prr.request.sent` or `prr.followup.sent` directly.

### Legal Escalation

Use when text includes legal pressure, legal escalation, appeal posture, threat language, or confirmation that escalation is appropriate.

Required preview fields:

- confirmed deadline basis or confirmed stalling basis
- cited jurisdiction rules
- correspondence evidence refs
- legal-risk governance tags
- locked legal draft artifact hash
- human confirmation text

The legal lock can be cleared only by a human event through PRR/governance semantics. The resident agent cannot clear it, confirm escalation, or send legal language.

### Export And Publication

Use when generating durable exports, public reports, publication artifacts, or report bundles intended for external sharing.

Required preview fields:

- export or report ID
- included evidence IDs and content hashes
- export plan result
- public-safe default state
- sensitive or private opt-in tags and rationale
- excluded restricted categories
- governance policy version

Execution must route through governance export/report services. Sensitive opt-ins require a human service actor, and generated artifacts must match the governed export plan.

### Destructive Repair

Use for repair, restore, migration, rewrite-like, projection rebuild execution, workspace state changes, tombstone, quarantine release, or any operation that can affect canonical state or user files.

Required preview fields:

- workspace refs
- target files or projections
- proposed repair action
- mutation class
- data-loss risk summary
- backup or manifest refs when available
- append-only repair event plan

Canonical ledger or blob repair must be append-only and human-approved. The runtime must stop on data-loss risk rather than executing.

### Accepted Graph Review

Accepted graph review is not generic tool approval. It routes through ontology review semantics.

Required preview fields:

- assertion IDs, relationship IDs, entity resolution IDs, or merge/split candidates
- supporting evidence IDs and content hashes
- proposal event IDs
- reviewer rationale draft
- ontology pack versions
- accepted graph projection impact

Execution must call ontology review services such as assertion acceptance or relationship acceptance. The agent cannot accept graph truth, resolve entities, or accept relationships on its own. Approval cockpit may collect the human decision context, but the domain review event remains the source of accepted truth.

## Approval Cockpit UX

The approval cockpit is an accountability cockpit, not a launcher.

Primary sections:

- Agent status: active task, run state, provider status, locks, pending approvals, and last safe observation.
- Approval queue: grouped by approval class, risk, staleness, run, and affected investigation.
- Request detail: exact preview hash, side-effect class, required approval class, descriptor version, expected effect, and target service.
- Evidence and provenance: affected evidence/artifacts/events, context pack refs, content hashes, projection high-water marks, and source diagnostics.
- Risk and locks: governance tags, legal/export/data-loss locks, secret warnings, provider transfer note, and stale status.
- Decision panel: approve exact preview, deny with rationale, request revised preview, open related workspace, or copy display-only diagnostic refs.
- Resume history: approvals, denials, stale checks, resume attempts, completed events, failure categories, and repair actions.
- Handoff: final run summary, produced artifacts, unresolved approvals, and human review checklist.

UX rules:

- The operator sees what the agent is doing, why it paused, what evidence supports the request, what happens if approved, and what safe alternatives exist.
- Approve and deny buttons append decision events only.
- No button sends PRR correspondence, transfers provider bytes, executes repair, exports sensitive material, clears a legal lock, or accepts graph truth directly.
- A request with stale preview, active lock, missing provenance, secret detection, or unavailable provider is visually blocked and cannot be approved into execution.
- The cockpit may include navigation to Requests, Ingestion, Evidence, Governance, or Ontology review surfaces.
- Command descriptors remain display-only unless a future approved flow gives them their own explicit approval contract.

## Runtime And CLI Routes

The first runtime route family should extend the foundation agent routes without weakening local-runtime auth.

Read routes:

- `GET /api/agent/status`: existing foundation status plus execution summary.
- `GET /api/agent/runs`: run queue and state machine DTO.
- `GET /api/agent/runs/:runId`: run detail, context pack refs, model invocations, observations, and tool requests.
- `GET /api/agent/approvals`: pending, stale, approved, denied, and completed approval queue DTOs.
- `GET /api/agent/approvals/:toolRequestId`: exact review detail DTO.

Decision routes:

- `POST /api/agent/approvals/:toolRequestId/approve`: appends human approval for the current exact preview hash and rationale.
- `POST /api/agent/approvals/:toolRequestId/deny`: appends human denial with rationale and optional requested revision.

Scheduler routes:

- `POST /api/agent/tasks`: create a task, as planned by the foundation.
- `POST /api/agent/runs/:runId/cancel`: append human cancellation.
- `POST /api/agent/scheduler/wake`: local-only or authenticated wake signal that asks the runtime to inspect resumable work. It does not accept tool input and does not bypass approval checks.

CLI commands should mirror the safe route contract with stable JSON:

- `agent-status`
- `agent-run-list`
- `agent-run-show --run-id <id>`
- `agent-approval-list`
- `agent-approval-show --tool-request-id <id>`
- `agent-approval-approve --tool-request-id <id> --preview-hash <hash> --rationale <text>`
- `agent-approval-deny --tool-request-id <id> --rationale <text>`
- `agent-scheduler-wake`

Any route or CLI that appends approval or denial must require a human actor. Any non-loopback route keeps existing local-runtime auth requirements.

## Failure And Retry Categories

Failure records should include run ID, task ID, tool request ID when relevant, category, safe message, retryability, allowed repair actions, related event IDs, and artifact hashes.

Categories:

- `approval-required`: request is waiting for human decision.
- `approval-denied`: human or policy denied the request.
- `approval-stale`: preview hash, source bytes, context pack hash, lock state, policy version, or projection high-water mark changed.
- `provider-unavailable`: provider is unreachable or disabled.
- `provider-rate-limited`: provider is reachable but retry should wait.
- `credential-missing`: credential reference has no usable secret in the configured store.
- `credential-revoked`: provider auth failed in a way consistent with expired or revoked credentials.
- `model-output-invalid`: provider output failed schema or policy validation.
- `secret-detected`: secret-shaped material appeared in input, output, diagnostic, memory, or DTO.
- `permission-denied`: policy blocks the tool or run.
- `lock-active`: legal, export, governance, secret, data-loss, or workspace lock blocks resume.
- `projection-lag`: read model cannot satisfy preview or context pack requirements.
- `context-budget-exceeded`: required context cannot fit within declared budget.
- `missing-provenance`: source refs or content hashes are absent.
- `domain-gate-failed`: authoritative domain service rejected the request.
- `stale-source`: source bytes changed since preview or approval.
- `external-effect-failed`: approved external effect failed after domain service call.
- `data-loss-risk`: runtime detected possible deletion, rewrite, reset, compaction, or unsafe migration.

Retry policy:

- Provider rate limits and provider unavailable states can be retried when the provider descriptor says retry is safe.
- Missing credential, denied approval, active lock, missing provenance, stale approval, stale source, secret detected, and data-loss risk require human or policy repair before retry.
- Domain gate failures retry only after the domain service exposes a safe repair action.

## Human Review Handoff

A completed run hands work back to humans with:

- task and run IDs
- final status
- summary of model invocations
- context pack refs
- observations
- memory entries recorded, superseded, or rejected
- tool requests and approval decisions
- domain events appended
- artifacts produced
- unresolved diagnostics
- review checklist

For PRR, legal, export, destructive repair, and accepted graph work, the handoff must name the exact domain events or services that remain pending. A completed agent run does not imply a human accepted graph truth, sent correspondence, published an export, or cleared a legal lock unless the relevant domain event exists.

## Implementation-Slice Decomposition

Follow-up implementation should proceed in small slices:

1. Execution scheduler and resumer contracts

   Add execution state DTOs, state derivation, context-pack descriptor interfaces, approval queue DTOs, fake scheduler tests, and fake resume tests. No live providers or risky domain execution.

2. Context pack registry

   Add deterministic context pack builders for accepted graph, evidence summaries, PRR read models, governance locks, memory summaries, task/run history, and workspace runtime status.

3. Approval queue runtime and CLI

   Add approval list/show/approve/deny routes and CLI commands that append decision events only.

4. Minimal approval cockpit UI

   Add browser-safe adapter and review queue components. Buttons append approval or denial only.

5. Domain execution adapters

   Add descriptor-backed result mappers for provider byte transfer, PRR send/follow-up, export/report, destructive repair, and accepted graph review one class at a time.

6. Specialist workflow orchestration

   Add ontology bootstrap, PRR negotiation, evidence triage, timeline, contradiction, investigation, and report specialists after the scheduler and approval cockpit are verified.

7. Live provider and team hardening

   Add live provider adapters, credential store integration, role-aware approvals, device/session approval, and server-compatible scheduler behavior through separate approved plans.

## Invariants

- The ledger is append-only. Corrections, reversals, supersessions, reviews, cancellations, stale decisions, denials, and repairs are new events.
- Projections are rebuildable and never hidden sources of truth.
- Accepted graph state remains traceable to evidence or explicit reasoning and human/domain review events.
- The agent cannot approve its own requests.
- The agent cannot clear legal, export, data-loss, governance, secret, or workspace locks.
- The agent cannot send PRRs or external messages.
- The agent cannot transfer provider bytes.
- The agent cannot export sensitive material.
- The agent cannot accept graph truth without the exact existing human and domain gates.
- Secrets never enter ledger events, memory, diagnostics, provider metadata, DTOs, reports, portable workspace manifests, or factory claims.
- Portable workspace mode does not fall back silently to internal storage.
- UI surfaces remain browser-safe and do not import Node-only runtime, SQLite, filesystem, blob-store, workspace validation, or domain service modules.

## Validation Expectations

The first implementation plan should require:

- state machine tests for allowed transitions and blocked states
- context pack descriptor tests for provenance, size budgets, and stable hashes
- approval queue DTO tests for preview hash, stale status, and class-specific risk fields
- scheduler/resumer tests proving approval does not execute until runtime resume checks pass
- tests proving an agent actor cannot approve, deny as human, clear locks, or execute accepted graph review
- route and CLI tests proving decisions append events only
- UI tests proving the cockpit has no direct send, provider transfer, export, repair, lock clearing, or accepted graph execution buttons
- `npm run verify`

Stop on data-loss risk, schema conflict, unavailable dependency, credential need, external-service dependency, or any design or implementation path that lets the agent approve its own requests or bypass accepted graph review.
