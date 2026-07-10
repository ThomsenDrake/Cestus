# Resident Task Orchestrator Design

Date: 2026-07-10

## Purpose

Cestus has a resident agent identity, task and run events, provider readiness, prompt artifacts, context pack contracts, approved-tool scheduling, domain adapter descriptors, specialist runners, and a cockpit. The missing layer is the always-on queued-task orchestrator that turns a durable resident-agent task into a recoverable specialist run.

This design defines that orchestrator as a new explicit contract above the approved-tool scheduler. It claims queued tasks, selects a specialist mode, assembles context and prompt artifacts, records provider posture, suspends cleanly for exact approvals, dispatches runners, waits for verified durable handoff readback, and reconstructs progress after restart.

The approved-tool scheduler remains separate. It owns approved domain-effect execution for `agent.tool.*` requests after exact human approval and consume-time validation. The task orchestrator may create or observe approval requests, but it does not execute provider byte transfer, PRR sends, legal escalation, export, repair, accepted graph review, legacy staging, or any other domain effect.

## Goals

- Keep one resident Cestus Agent identity, `agent_default`; specialist modes remain typed task modes under that identity.
- Define a queued-task orchestrator module contract, separate from `createAgentScheduler().wake()`.
- Preserve distinct task claims and approved-tool execution claims with separate leases, recovery rules, and idempotency.
- Turn queued tasks into durable specialist runs with deterministic ordering, bounded concurrency, explicit attempts, and restart-safe checkpoints.
- Assemble only registered context packs and prompt artifacts with exact hashes, provenance refs, size budgets, projection high-water marks, staleness inputs, and locally verified resolved payload bytes for production provider dispatch.
- Select providers from policy and capability registries, record the selected provider posture durably, and keep providers as interchangeable execution backends.
- Suspend without holding a worker lease while waiting for human or provider approval.
- Require exact existing provider byte-transfer and domain approval proof before remote specialist invocation.
- Require verified durable handoff manifest and canonical handoff readback before projecting task completion.
- Make the first acceptance target a real Nous `evidence-triage` vertical from queued task to restart reconstruction.

## Non-Goals

- Extending `createAgentScheduler().wake()` to own queued tasks.
- Creating a second resident agent identity or provider-owned agent identity.
- Defining the durable-handoff lane's canonical event name. The orchestrator depends on that lane's capability and event vocabulary.
- Executing approved tool effects directly from the orchestrator.
- Creating placeholder prompts, synthetic handoffs, synthetic approvals, or synthetic provider proof.
- Accepting graph truth, sending PRRs, escalating legally, exporting, clearing locks, mutating old sources, or bypassing authoritative domain services.
- Implementing production code in this design slice.

## Existing Context

The orchestrator composes these landed contracts:

- `agent.task.created` and `agent.task.status.changed` queue resident-agent tasks.
- `agent.specialist-run.started`, `agent.specialist-run.step.recorded`, `agent.specialist-run.completed`, and `agent.specialist-run.failed` audit run lifecycle.
- `agent.model-invocation.*` records model invocation requests, prompt audit metadata, outputs, and safe failures.
- `agent.tool.*` records approval requests, approvals, denials, approved execution claims, completions, and failures.
- `packages/agent/src/scheduler.ts` consumes approved tool requests only and records `agent.tool.execution.claimed` before domain execution.
- `packages/agent/src/context-packs.ts` defines `ContextPackRef`, context pack builders, stable hashes, size budgets, provenance requirements, and staleness inputs.
- `packages/agent/src/prompt-artifacts.ts` defines prompt artifact envelopes and provider transfer safety classes.
- `packages/agent/src/provider-selection.ts` selects provider capability by task sensitivity and policy.
- `packages/agent/src/specialist-runner-kernel.ts` validates provider byte-transfer proof before remote specialist invocation.
- `packages/agent/src/evidence-triage-workflow.ts` provides the current local evidence triage runner.
- `packages/agent/src/specialist-readiness.ts` reports exact missing contracts, packs, prompts, providers, adapters, approvals, locks, and projection state.
- `packages/agent/src/cockpit.ts` renders queue, run, context, model, approval, and handoff status without executing risky effects.

## Approved Direction

Create a new queued-task orchestrator contract in the agent package, for example `packages/agent/src/task-orchestrator.ts`. A local runtime wake service may compose:

1. task orchestrator tick
2. approved-tool scheduler wake

That composition must not blur ownership. The task orchestrator owns queued task progress. The approved-tool scheduler owns approved tool execution.

## Architecture

The orchestrator has six internal boundaries.

1. Task intake and projection

   Reads queued, running, blocked, suspended, failed, completed, and canceled task state from append-only ledger events. It derives claimability rather than storing UI-only readiness states as events.

2. Claim and attempt manager

   Claims one task/specialist boundary at a time, enforces deterministic ordering, records an attempt ID and retry generation, observes leases, releases work on suspension, and recovers stale claims.

3. Plan and readiness builder

   Selects the specialist run type, validates exact lane capabilities, builds required context pack refs, resolves every applicable pack locally through lane-owned capabilities, verifies payload hash/size/schema before provider dispatch, records provider policy selection, builds prompt artifacts, and classifies approval requirements.

4. Approval suspension and resume

   Emits durable suspended checkpoints for approval waits, releases the worker claim, and later reclaims idempotently only after exact approval proof is valid.

5. Runner dispatch

   Calls a registered specialist runner after readiness, provider posture, prompt artifact, approval proof, and budgets are current. Runner dispatch produces audited run steps and a final-output step, then must complete the durable-handoff protocol before any terminal run event is appended.

6. Handoff and completion gate

   Delegates handoff persistence and readback to the durable-handoff lane. Task completion is derived only after final output, prepared handoff manifest, verified canonical handoff readback, terminal run state, and terminal orchestration events are present in that order.

## Durable Events And Derived States

The orchestrator must distinguish durable events from projection states.

Durable event families owned or consumed by the orchestrator:

- `agent.task.created`
- `agent.task.status.changed`
- `agent.task.orchestration.claimed`
- `agent.task.orchestration.checkpointed`
- `agent.task.orchestration.released`
- `agent.task.orchestration.failed`
- `agent.task.orchestration.completed`
- `agent.specialist-run.started`
- `agent.specialist-run.step.recorded`
- `agent.specialist-run.completed`
- `agent.specialist-run.failed`
- canonical durable-handoff lane event, name owned by that lane
- `agent.tool.*` events consumed for approval waits and proof, but not owned for execution

Derived projection states:

- `queued`: task has a queued status and no terminal orchestration state.
- `claimable`: deterministic ordering and concurrency rules allow a new claim.
- `claimed`: an active unexpired task orchestration claim exists.
- `planning`: the active attempt is selecting run type, provider, packs, and prompt.
- `context-ref-ready`: applicable context pack refs are present, fresh, and within budget for advisory status.
- `context-ready`: every applicable context pack has been locally resolved as verified payload bytes matching the ref hash, descriptor size budget, schema version, provenance, high-water mark, and staleness inputs. Payload bytes are not projected.
- `prompt-ready`: the prompt artifact hash and template version match the run.
- `approval-wait`: a suspended checkpoint waits for exact approval proof.
- `resumable`: the approval proof and checkpoint inputs are exact and current.
- `runner-dispatching`: the attempt is invoking a specialist runner.
- `handoff-pending`: a final-output step or prepared handoff manifest exists, but verified durable handoff readback and downstream terminal events do not.
- `completed`: verified durable handoff readback, terminal run state, terminal orchestration completion, and terminal task status are present in the required order.
- `blocked`: the attempt needs human, lane, provider, projection, or policy repair.
- `failed`: the attempt reached terminal safe failure with retryability metadata.
- `canceled`: a human or policy canceled the task.

The implementation must not mint one event per derived UI state. Events are appended only when they are needed for recovery, idempotency, auditability, or handoff.

## Task Ordering

The orchestrator selects claimable tasks deterministically:

1. priority rank, from `urgent`, `high`, `normal`, `low`
2. queued or created timestamp
3. task ID lexical order
4. retry generation
5. run type lexical order when a task permits multiple specialist modes

The ordering function must be pure and tested. It must ignore tasks that are canceled, terminal, suspended on approval, blocked without a resumable repair signal, or already claimed by an active unexpired attempt.

## Claims, Attempts, And Leases

Task orchestration claims are separate from approved-tool execution claims.

`agent.task.orchestration.claimed` records:

- task ID
- specialist run type
- attempt ID
- retry generation
- lease claim generation
- worker ID
- claimed at
- lease expiry
- idempotency key
- selected ordering position
- active budget snapshot
- causation event ID

Rules:

- The deterministic claim stream ID is `agent_task_orchestration_${taskId}_${runType}` using the canonical task ID and run type from the task and specialist descriptors. All claim, release, checkpoint, retry, cancellation observation, and orchestration terminal events for that task/specialist boundary append to this stream.
- A worker claims only after reading the latest sequence for that claim stream and appending with `expectedNextSequence = latestSequence + 1`, or `expectedNextSequence = 1` for a new stream. After append, it must read the stream back and verify that its claim event is the latest active claim for the same task ID, run type, attempt ID, retry generation, and lease claim generation, with no superseding release, checkpoint, cancellation, retry, or terminal event.
- At most one active orchestration attempt may exist for a `taskId + runType + retryGeneration` boundary. Concurrent workers that race on the same expected sequence cannot both own the boundary.
- A retry requires an explicit retry generation. The orchestrator never starts a second active attempt because a worker is impatient.
- Expired claims do not execute automatically. A tick must inspect the exact claim stream, confirm no terminal or suspended checkpoint supersedes the claim, then append a higher lease claim generation for the same attempt or append a stale-claim recovery event.
- A worker that reaches approval wait or a long external wait appends a checkpoint and releases its claim.
- A worker that crashes before checkpointing is recoverable by lease expiry and replay.

## Idempotency And Attempts

Attempt identity is deterministic and separate from lease identity:

- `retryGeneration` starts at `0` and increases only through an explicit retry event on the deterministic claim stream.
- `attemptId` is stable for a task/specialist/retry boundary and is derived from task ID, run type, and retry generation. A stale lease reclaim reuses the same attempt ID.
- `leaseClaimGeneration` increases for each claim or reclaim of the same attempt and is used only to prove current worker ownership.

Each attempt has deterministic idempotency keys for:

- run start
- context pack build set
- context resolution verification
- prompt artifact build
- provider selection record
- approval request
- suspended checkpoint
- runner invocation
- derivative artifact write
- handoff manifest preparation through the handoff lane
- final orchestration completion

The idempotency key format for durable side effects must include task ID, run type, attempt ID, retry generation, and step name. It must not include lease claim generation for run start, context, prompt, provider posture, approval request, runner invocation, final-output, handoff preparation, handoff binding, or terminal projection, because stale lease recovery must resume those steps instead of duplicating them. Lease-specific checks may include lease claim generation only when proving worker ownership.

Steps that target a domain request also include the tool ID and preview hash. Steps that target a handoff include the handoff manifest hash or canonical handoff ID supplied by the durable-handoff lane.

Repeated ticks must return the same committed event IDs or the current projection state, not append duplicate runs, model invocations, tool requests, artifacts, or handoffs.

## Concurrency And Budgets

The orchestrator accepts a policy object with:

- global max active task attempts
- per-run-type max active attempts
- per-task max retry generations
- attempt lease duration
- context byte budget
- prompt byte budget
- derivative artifact byte budget
- provider invocation count budget
- provider output byte budget
- wall-clock budget
- approval wait expiry policy

Budget failures become durable blocked or failed records with safe repair actions. A budget failure must not execute a domain effect, truncate provenance silently, or drop context without recording the omission.

## Cancellation And Retry Races

Cancellation is append-only and can race with claims, approvals, final output, or handoff. Projection resolves by ledger order and exact terminal proof:

- If cancellation lands before runner dispatch, the active claim is released or marked canceled and no runner is invoked.
- If cancellation lands during approval wait, the checkpoint remains historical and is no longer resumable.
- If cancellation lands after final-output but before verified handoff readback, the orchestrator does not append terminal run or terminal task events. Projection shows `handoff-pending`, canceled, or blocked according to the handoff lane's recoverable protocol, and may only resume from the exact prepared manifest/hash binding or canonical handoff event.
- If cancellation lands after verified handoff readback but before terminal run state, the orchestrator may append the required terminal run and orchestration events only when the canonical readback proves the handoff already bound the final output for this attempt. Otherwise it fails closed as `handoff-pending` or blocked.
- If cancellation lands after verified handoff readback, terminal run state, and orchestration completion, the task remains completed and the cancellation becomes a post-completion annotation or rejected cancellation.

Retry requires an explicit retry generation. Retry can start only from failed or blocked states whose failure category is retryable and whose repair requirements are satisfied.

## Provider Selection

Provider choice is driven by policy and capability registries, not by runner preference or user-facing provider names.

The orchestrator records durably:

- provider ID
- model family
- adapter version
- credential reference ID and credential kind
- provider readiness state
- approval profile
- data handling posture
- selection policy version
- selected sensitivity class
- required approval class
- prompt artifact hash
- context pack hashes that informed selection

Providers remain interchangeable brains. They are not resident identities, not specialist personas, and not owners of task memory, approvals, or run state.

If policy requires a local provider and only remote providers are ready, the task blocks. If a remote provider is selected for sensitive evidence, the orchestrator must suspend for exact provider byte-transfer approval before invocation.

## Context And Prompt Assembly

The orchestrator consumes registered context pack builders and registered resolved-pack capabilities only. It must not create ad hoc prompt text, raw resolver callbacks, placeholder prompts, hidden context bundles, or generic context envelopes.

Context applicability is supplied by the prompt/workflow lane as part of the registered specialist descriptor. The orchestrator records required, applicable-optional, and inapplicable context packs from that descriptor. A pack blocks readiness only when the descriptor marks it applicable for the current task. For example, non-PRR evidence-triage work must not block merely because selected-request `prr-read-model.v1` is inapplicable; inapplicability is recorded as a safe omission with the descriptor's reason. If applicability cannot be determined from the registered descriptor, the task blocks rather than guessing.

For each specialist run, readiness requires:

- every applicable required `ContextPackRef`
- exact context pack ID and version
- content hash
- size bytes within descriptor budget
- generated timestamp
- provenance refs
- source event IDs or artifact hashes when required
- projection high-water mark when relevant
- staleness inputs
- prompt template ID and version
- prompt artifact envelope hash
- omissions with safe reasons

Ref readiness supports advisory queue, cockpit, and repair status. Production provider dispatch additionally requires successful local resolution for every applicable pack:

- each lane returns a typed content-addressed `ResolvedContextPack { ref, payload }`
- the returned `ref` exactly matches the applicable descriptor ref
- payload bytes hash to the ref content hash
- payload byte size matches descriptor budgets
- payload schema validates against the registered pack ID and version
- provenance refs, source events or artifact hashes, projection high-water marks, and staleness inputs still match the checkpoint inputs
- the prompt renderer consumes the exact verified payload bytes that produced the prompt artifact hash

If a required context pack is missing, stale, over budget, missing provenance, produced by an unregistered lane, unresolved, schema-invalid, or hash/size mismatched, the task blocks before provider byte transfer or model invocation.

Checkpoints, ledger events, approval previews, cockpit DTOs, diagnostics, and logs may bind context refs, content hashes, schema versions, byte counts, provenance refs, omission reasons, and prompt artifact hashes. They must never contain raw resolved payload bytes or raw rendered prompt text.

## Approval Suspension And Resume

Approval waits never hold an expiring worker lease indefinitely.

When exact approval is required, the orchestrator appends `agent.task.orchestration.checkpointed` with:

- checkpoint kind `approval-wait`
- task ID, run type, attempt ID, retry generation
- run ID
- tool request IDs
- approval class
- preview hash
- source event IDs
- input artifact hashes
- context pack refs and hashes
- context resolution schema versions and byte counts
- prompt artifact hash
- provider selection record
- policy version
- lock snapshot
- projection high-water marks
- resume idempotency key
- safe next actions

The worker then appends `agent.task.orchestration.released`. A later tick may reclaim only when the existing approval contracts prove:

- independent human actor
- exact approval class
- exact preview hash
- exact causation
- current source hashes
- current prompt artifact hash
- current provider readiness
- current locks
- current projection high-water marks
- existing domain approval proof where required

The orchestrator must not approve its own requests, mint provider proof, infer approval from readiness, or treat a cockpit click as execution.

Approval checkpoints bind refs, content hashes, resolution metadata, and prompt artifact hash only. They never persist resolved payloads.

## Runner Dispatch

Runner dispatch happens only after:

- resident identity exists
- task claim is current
- run exists or is idempotently started
- specialist descriptor exists
- required context packs are fresh
- every applicable context pack resolves locally and verifies by hash, size, and schema
- prompt artifact is exact
- prompt artifact was rendered from the exact verified resolved payload bytes
- provider selection is current
- approval proof is valid when needed
- runner is registered for the run type
- derivative store is available
- handoff lane capability is available for the run type
- cancellation has not superseded the attempt

The runner writes content-addressed artifacts and appends run step and model invocation events according to existing contracts. Its successful output is represented as an audited final-output step, not as terminal run completion. The orchestrator must then invoke the durable-handoff capability to prepare the manifest, bind it through the canonical ledger contract, and read it back. Only after verified handoff readback may the orchestrator ask the runner/run lifecycle contract to append terminal run completion and then append terminal orchestration and task-status events.

Runner return values are not completion proof by themselves. The orchestrator treats them as claims until ledger readback and handoff lane readback succeed.

Resolved context payload bytes are transient provider-input material. They may be passed from lane resolvers to prompt renderers and provider adapters after exact approval proof is valid, but they must not enter ledger events, approval previews, cockpit projections, diagnostics, logs, or handoff metadata.

## Durable Handoff Dependency

The durable-handoff lane owns:

- canonical handoff event vocabulary
- handoff manifest schema
- manifest content hash semantics
- artifact storage and readback contract
- ledger binding contract
- preterminal and recoverable handoff protocol
- cockpit-ready handoff DTO projection

The orchestrator depends on a narrow capability:

```ts
interface DurableSpecialistHandoffCapability {
  prepare(input: PreparedHandoffInput): Promise<PreparedHandoffManifest>;
  bind(input: PreparedHandoffManifest): Promise<DurableHandoffBindingResult>;
  readback(input: DurableHandoffReadbackInput): Promise<VerifiedDurableHandoff>;
}
```

The exact type names and canonical event names belong to the durable-handoff lane. The orchestrator spec requires only the semantics above.

Task completion requires:

```text
final-output step
+ exact prepared durable handoff manifest
+ canonical handoff ledger binding
+ successful verified handoff readback
+ terminal run state
+ terminal orchestration event
+ terminal task status projection event
```

The orchestrator must not project completion from output artifact hashes, final-output steps, handoff preparation, handoff binding, or terminal run events alone.

Recovery rules:

- If a final-output step exists but the handoff protocol is incomplete, projection shows `handoff-pending` or blocked and no terminal run or task terminal event may be appended.
- If verified handoff readback exists but terminal run state is missing, recovery appends terminal run state idempotently, then terminal orchestration completion, then terminal task status.
- If terminal run state exists without preceding verified handoff readback, projection fails closed as blocked; recovery must not project completion until the handoff lane verifies the prepared manifest/hash binding or canonical handoff event that causally precedes that run terminal.
- Recovery may resume only from the handoff lane's exact prepared manifest/hash binding or canonical handoff event.
- Recovery must never synthesize a handoff from run output hashes or terminal run output hashes alone.
- If the prepared manifest exists but ledger binding is missing, the orchestrator asks the handoff capability to verify and bind it idempotently.
- If no exact prepared manifest or canonical handoff event can be verified, the task blocks with safe repair actions and preserves the attempt.
- Implementation of task completion projection is sequenced after the durable-handoff event and artifact contract lands.

Terminal task truth:

- `agent.task.orchestration.completed` or `agent.task.orchestration.failed` records the orchestrator's terminal decision on the deterministic claim stream after the applicable run lifecycle and handoff preconditions are satisfied.
- `agent.task.status.changed` projects the task's user-visible terminal status and must be causally linked to the preceding orchestration terminal event.
- Task status projections are rebuilt from `agent.task.status.changed`, but a terminal status without the required preceding orchestration terminal event is inconsistent and fails closed as blocked for operator repair.
- An orchestration terminal event without a matching later task status event is recoverable: the next tick appends the missing causally linked `agent.task.status.changed` idempotently after readback.

## Lane Interfaces

The orchestrator depends on other lanes through exact interfaces and does not edit their owned files.

Lifecycle bootstrap lane:

- Guarantees canonical resident identity exists on create or mount.
- Does not own task claims, retries, leases, priority, or restart reconstruction.

Task orchestrator lane:

- Owns queued task ordering, claims, leases, attempts, retry generations, cancellation, idempotency, bounded concurrency, suspended checkpoints, runner dispatch, and restart reconstruction.

Operational packs:

- Own the typed, content-addressed `ResolvedContextPack { ref, payload }` capability contract and verification envelope used by all context-pack lanes.
- `workspace-runtime-status.v1`
- `task-run-history.v1`
- `agent-memory-summary.v1`

Investigative packs:

- Produce verified `ResolvedContextPack` values through the operational lane's capability contract for applicable investigative packs.
- `evidence-summary.v1`
- `accepted-graph-projection.v1`
- `timeline-draft-summary.v1`
- `contradiction-candidate-summary.v1`
- `governance-locks.v1`

PRR packs:

- Produce verified `ResolvedContextPack` values through the operational lane's capability contract when PRR context is applicable.
- selected request posture
- `prr-read-model.v1`
- `jurisdiction-pack-summary.v1`

Prompt template lane:

- Supplies specialist context applicability descriptors.
- Consumes exact verified resolved payload bytes to render prompt artifacts.
- Exact registered template IDs and versions.
- Prompt artifact envelope builders.
- No placeholder prompt text.
- No hash-to-text resolver callbacks.

Durable-handoff lane:

- Canonical handoff event and manifest contract.
- Content-addressed handoff artifact storage.
- Verified handoff readback.
- Preterminal/recoverable handoff protocol.

Provider lane:

- Capability registry.
- Provider readiness.
- Credential reference health.
- Live Nous provider setup.
- Safe provider acceptance commands.

Domain adapter and approved-tool scheduler lanes:

- Descriptor-backed approval previews.
- Current-preview rebuilds.
- Existing approval proof.
- Approved execution through authoritative domain services only.

## Evidence Triage Acceptance Scenario

The first vertical acceptance target is an evidence-triage workflow through the real Nous provider after exact provider-byte-transfer approval.

The deterministic contract and integration tests must prove:

1. A queued evidence-triage task is selected by deterministic ordering.
2. The orchestrator appends one active task claim for the task/run-type/retry-generation boundary.
3. The orchestrator records a per-task attempt ID and idempotency keys.
4. The orchestrator starts or reuses the exact `evidence-triage` specialist run.
5. The orchestrator consumes the prompt/workflow lane's context applicability descriptor, builds exact applicable operational and investigative pack refs, builds any applicable PRR pack refs, and records inapplicable packs as safe omissions.
6. The orchestrator resolves every applicable pack locally as `ResolvedContextPack { ref, payload }`, verifies hash, size, schema, provenance, high-water marks, and staleness, and blocks before transfer on any missing or mismatched resolution.
7. The prompt renderer consumes the exact verified payload bytes and builds an exact prompt artifact from the registered `evidence-triage.classify.v1` template.
8. Checkpoints bind context refs, content hashes, resolution metadata, and prompt artifact hash without raw payload bytes.
9. The orchestrator selects a provider through policy and capability registries.
10. The orchestrator requests or observes exact provider-byte-transfer approval and existing domain provider approval proof.
11. The orchestrator suspends, releases the worker claim, and does not hold the lease during approval wait.
12. A later tick reclaims idempotently after exact approval becomes valid.
13. The runner dispatches against the real Nous provider in live acceptance.
14. The real Nous structured output includes a safe sentinel fact that exists only in a resolved context payload, not in refs, template text, or provider fixtures.
15. Content-addressed derivative artifacts are written and verified.
16. A final-output run step is appended and read back.
17. The durable-handoff lane prepares the handoff manifest.
18. The durable-handoff lane records the canonical ledger binding and verified readback.
19. Terminal run completion is appended only after verified handoff readback.
20. Terminal orchestration completion is appended after terminal run completion.
21. Terminal task status is appended causally after orchestration completion.
22. Task completion is projected only after that full ordered sequence.
23. Restart reconstruction from ledger plus content-addressed artifacts reproduces task, attempt, approval, provider, resolved-context verification metadata, run, final output, prepared handoff, handoff readback, run completion, orchestration completion, and task terminal state.

Restart tests must cover each crash boundary:

- after final-output readback and before handoff preparation
- after handoff preparation and before canonical handoff recording
- after canonical handoff recording and before verified readback
- after verified handoff readback and before terminal run completion
- after terminal run completion and before terminal orchestration completion
- after terminal orchestration completion and before terminal task status

The real Nous acceptance uses repo-local secret setup. Offline fake providers can satisfy deterministic contract tests but cannot satisfy provider execution readiness for the live acceptance gate. A ref-only fake cannot pass the live gate because the sentinel fact is present only in resolved payload bytes and the structured model output must reflect it.

Forbidden effects must be asserted absent:

- orchestrator self-approval
- synthetic provider proof
- direct provider byte transfer outside approved contracts
- PRR send or follow-up send
- legal escalation confirmation
- export or publication
- accepted graph review or graph truth acceptance
- lock clearing
- destructive repair
- legacy raw import or staging execution
- old source mutation
- direct domain effect execution outside the approved-tool scheduler and authoritative domain services

## Runtime Surfaces

The first runtime surface should expose:

- task orchestrator status
- tick result
- active attempts
- suspended checkpoints
- stale claims
- retry generations
- handoff-pending tasks
- blocked reasons
- deterministic next safe actions

The route may be composed by a later local wake service, but the DTO must preserve ownership labels:

- `task-orchestrator` for queued task progress
- `approved-tool-scheduler` for approved tool execution
- `handoff` for canonical handoff readback

No UI control may present task queueing, approval decision, scheduler wake, or handoff readback as a direct risky-effect launcher.

## Testing Expectations

The implementation plan should require:

- contract tests for new orchestration event schemas and projection derivation
- deterministic task ordering tests
- concurrent claim tests
- stale claim recovery tests
- cancellation race tests
- retry generation tests
- idempotency tests for run start, context, prompt, approval request, runner dispatch, and handoff binding
- approval suspension tests proving leases are released during waits
- provider selection tests proving policy/capability-driven selection and durable provider posture
- context pack readiness tests for missing, stale, over-budget, and missing-provenance packs
- resolved context verification tests for missing payloads, hash mismatch, size mismatch, schema mismatch, stale high-water marks, and unregistered resolver lanes
- no-payload-leakage tests proving resolved payload bytes do not enter ledger events, approval previews, cockpit DTOs, diagnostics, logs, checkpoints, or handoff metadata
- context applicability tests proving inapplicable packs do not block readiness and unknown applicability blocks safely
- prompt template tests proving no placeholder prompt can satisfy readiness
- prompt renderer tests proving exact verified payload bytes, not refs alone, feed the prompt artifact hash
- runner dispatch tests proving one active attempt per task/specialist boundary
- terminal sequencing tests proving final-output, handoff preparation, handoff recording/readback, run completion, orchestration completion, and task status happen in order
- handoff-pending recovery tests using the durable-handoff lane's exact manifest and canonical event
- negative tests for every forbidden effect
- restart reconstruction tests from ledger plus artifact stores
- deterministic fake-provider contract tests
- deterministic negative tests proving a ref-only fake cannot satisfy production provider dispatch readiness
- live Nous evidence-triage acceptance with repo-local secret setup and resolved-payload sentinel propagation
- route and cockpit DTO tests proving ownership labels and no direct risky controls
- `npm run verify`

## Implementation Sequencing

Implementation must be sequenced after these prerequisites land:

1. durable-handoff event, manifest, and readback contract
2. required operational, investigative, and PRR context pack producers
3. prompt template registrations for the target specialist modes
4. provider readiness and live Nous setup
5. approved-tool scheduler and domain adapter contracts
6. evidence-triage runner readiness

The task orchestrator implementation may start with pure contracts and projections, then add deterministic claim/recovery logic, then integrate context/prompt/provider readiness, then approval suspension, then runner dispatch, then handoff readback and completion projection.

## Stop Conditions

Stop and escalate on:

- a design or implementation path that merges task claims with approved-tool execution claims
- any need to synthesize a handoff from run output hashes
- any missing durable-handoff protocol required for completion projection
- unavailable context pack, prompt template, provider readiness, domain adapter, or handoff dependency
- missing or mismatched resolved context payload required for provider dispatch
- any path that stores resolved context payload bytes in ledger, approval previews, cockpit, diagnostics, logs, checkpoints, or handoff metadata
- credential need outside explicit live Nous acceptance
- data-loss risk
- schema conflict with existing agent or ontology event contracts
- any path that lets the resident agent approve itself
- any path that bypasses authoritative domain services
- repeated verifier failure after two focused repair attempts

## Completion Criteria

The design is complete when a fresh coding agent can implement the orchestrator without guessing:

- which module owns queued task orchestration
- which module owns approved tool execution
- how task claims differ from tool execution claims
- how attempts, retries, leases, cancellation, and budgets work
- how approval waits suspend and resume
- how advisory context refs differ from production resolved payload verification
- how provider selection is recorded without changing resident identity
- how handoff completion depends on the durable-handoff lane
- how evidence-triage acceptance proves the first real vertical
- which prerequisites must land before implementation
