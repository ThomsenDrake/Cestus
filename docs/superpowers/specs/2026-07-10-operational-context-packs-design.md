# Operational Resident-Agent Context Packs Design

Date: 2026-07-10

## Purpose

The resident Cestus Agent now has scheduler, provider, memory, specialist workflow, and cockpit contracts, but the first integrated MVP still blocks general specialist readiness on missing production context-pack builders. This design covers the operational pack lane for:

- `workspace-runtime-status.v1`
- `task-run-history.v1`
- `agent-memory-summary.v1`

These packs are the shared operational context every MVP specialist needs before prompt artifacts, handoffs, or workflow runners can become trustworthy. They must be independently usable from the `packages/agent` package, testable without SQLite or local-runtime coupling, and exported through a narrow registration/provider contract that a later runtime integration task can compose with PRR, evidence, graph, governance, jurisdiction, timeline, and contradiction-pack lanes.

## Goals

- Add production builders for the three operational packs from authoritative injected ledger, projection, and runtime facts.
- Keep all builders deterministic for identical injected inputs. Wall-clock values such as `generatedAt` are caller-supplied and never read secretly.
- Make scope and projection high-water marks mandatory typed inputs for every pack, including explicit empty-projection cases.
- Preserve exact source event IDs, artifact hashes, projection high-water marks, staleness inputs, policy version, scope, and size budgets in every `ContextPackRef`.
- Keep memory non-authoritative and source-linked. Memory can guide future work, but it never creates accepted ontology truth.
- Preserve terminal, blocked, denied, failed, executing, approved, requested, queued, running, and pending states in task/run history without raw model output.
- Export a capability-oriented async provider interface and idempotent package-level registration helper.
- Avoid edits to shared local-runtime, cockpit, PRR pack, evidence/graph pack, prompt-template, handoff, or orchestrator files in this lane.

## Non-Goals

- Wiring the operational packs into local-runtime or cockpit routes.
- Making specialist execution ready.
- Registering PRR, evidence, graph, governance, jurisdiction, timeline, contradiction, prompt-template, or handoff producers.
- Storing production prompt text, raw model output, raw provider errors, credentials, provider runtime material, unrestricted local paths, raw portable paths, or private source bodies in context packs.
- Inferring ontology truth from runtime, memory, task history, model output, or empty projections.
- Adding a SQLite-specific, local-runtime-specific, or browser-specific context-pack source.

## Existing Context

`packages/agent/src/context-packs.ts` already owns `ContextPackRef`, stable hashing, DTO normalization, provenance validation, size-budget checks, and `ContextPackRegistry`. The operational builders should reuse `buildContextPackRef()` rather than hand-rolling hashes or refs.

`packages/agent/src/memory.ts` already exports `buildAgentMemorySummaryContextPack()`. This design deliberately evolves that existing builder into the canonical `agent-memory-summary.v1` implementation. It must not create two competing production builders for the same pack ID.

`packages/agent/src/projection.ts` rebuilds task, run, tool request, model invocation, memory, permission, and lock state from append-only ledger events. `packages/agent/src/projection-types.ts` already defines the states that `task-run-history.v1` must preserve.

`packages/agent/src/specialist-readiness.ts` already consumes `ContextPackRef[]` and `currentProjectionHighWaterMarks` to decide whether specialist workflow descriptors are `context-ready`, blocked by missing provenance, or stale. This lane should export the inputs that readiness needs, not modify cockpit or local-runtime integration files.

`packages/local-runtime/src/agent-prompt-artifacts.ts` currently builds a one-off `workspace-runtime-status.v1` ref inside a prompt artifact helper. The new builder should replace that pattern as the package-owned source, while local-runtime adoption remains a separate integration task.

## Architecture

Add a package-owned operational context-pack module in `packages/agent`, likely named `operational-context-packs.ts`, exported from `packages/agent/src/index.ts`.

The module owns four public surfaces:

1. Builder functions for each pack.
2. A capability-oriented async provider interface for authoritative sources.
3. A registration helper that installs the package-owned builders into any `ContextPackRegistry`.
4. A readiness handoff helper that returns the exact `contextPackRefs` and `currentProjectionHighWaterMarks` a runtime integration lane can pass into the existing specialist readiness projector.

The module depends on the agent package's public DTO contracts and projection types. It does not import local-runtime, SQLite, filesystem, HTTP, React, or cockpit modules.

The builders take normalized, caller-supplied authoritative inputs. They do not read time, files, environment variables, process state, or providers on their own.

## Source Model

The provider interface is capability-oriented. It should name what it can produce rather than where the data comes from.

The conceptual contract is:

```ts
interface OperationalContextPackProvider {
  readonly providerId: string;
  readonly capabilities: readonly OperationalContextPackCapability[];
  readonly policyVersion: string;
  readonly generatedAt: string;
  readonly scope: ContextPackScope;
  readonly sizeBudgets: OperationalContextPackSizeBudgets;
  agentProjection(): Promise<OperationalAgentProjectionSource>;
  workspaceRuntimeStatus(): Promise<OperationalWorkspaceRuntimeSource>;
}
```

`OperationalAgentProjectionSource` contains:

- `projection`: rebuilt `AgentProjection` or a normalized projection DTO that is equivalent to replayed events.
- `projectionHighWaterMark`: mandatory nonnegative integer.
- `projectionSourceRef`: machine-readable source label such as `agent.projection`.
- optional `emptyMemoryProof` when active memory is empty.
- optional `emptyTaskRunHistoryProof` when task/run/tool/model history is empty.

`OperationalWorkspaceRuntimeSource` contains safe runtime facts:

- mounted workspace identity when present, never raw paths.
- storage strategy category and runtime bind/auth posture.
- provider readiness categories and provider IDs, never secrets or raw provider errors.
- runtime diagnostic categories and machine-readable diagnostic IDs.
- projection high-water marks for agent and runtime read models.
- safe omitted-source codes.

Both provider methods may be async so runtime, team-server, test, or future portable-workspace sources can fetch authoritative state without coupling this package to SQLite or local runtime.

## Determinism

For identical injected inputs, builders produce identical payload hashes, `ContextPackRef` metadata, omission codes, and staleness inputs.

Determinism requirements:

- `generatedAt` is supplied by the caller.
- Arrays are sorted by stable IDs before payload construction.
- Counts and summaries are derived from normalized snapshots.
- No builder calls `Date.now()`, `new Date()`, random ID generation, filesystem reads, provider adapters, environment variables, process cwd, network APIs, or mutable global runtime state.
- Provider-returned objects are normalized into plain own-data snapshots before any hashing or registration use.

## Mandatory Freshness Fields

Every pack builder requires:

- `scope`
- `projectionHighWaterMark`
- `generatedAt`
- `policyVersion`
- `sizeBudgetBytes`
- at least one staleness input that binds the pack to the source high-water mark

`projectionHighWaterMark` must appear in the returned `ContextPackRef`. The same value must also appear in `stalenessInputs` using a stable machine-readable input:

```ts
{
  kind: "projection-high-water-mark",
  ref: "<source projection id>",
  value: "<decimal high-water mark>"
}
```

Missing high-water marks are blocking errors, not omitted optional metadata.

## Empty Projection Proof

Empty packs are valid only when "empty" is itself authoritative and current.

`agent-memory-summary.v1` may return zero active memory items only when the caller supplies an explicit `emptyMemoryProof` with:

- scope
- projection name
- current high-water mark
- source event count used to build the projection
- generated-at value
- stable empty reason code such as `empty.active-memory`

`task-run-history.v1` may return zero tasks, runs, model invocations, and tool requests only when the caller supplies an explicit `emptyTaskRunHistoryProof` with the same shape and an empty reason code such as `empty.task-run-history`.

The empty proof contributes a safe provenance ref such as:

```text
empty-projection:agent.projection.memory:workspace:<scope-id>:hwm:<number>
```

or

```text
empty-projection:agent.projection.task-run-history:workspace:<scope-id>:hwm:<number>
```

The exact spelling can be refined in implementation, but it must satisfy `ContextPackRegistry` provenance-kind validation, be secret-safe, and include the projection name, scope kind, scope ID, and high-water mark.

An empty pack without current high-water mark, scope, staleness input, and explicit empty-projection provenance is rejected. This resolves the prior memory tension: empty memory is not missing provenance when the projection itself proves emptiness.

## Pack Contracts

### `workspace-runtime-status.v1`

Purpose: give every specialist a bounded, secret-safe view of workspace and runtime readiness.

Required authoritative inputs:

- caller-supplied generated time
- scope
- policy version
- size budget
- workspace identity status
- runtime storage strategy category
- local auth-required and bind-mode facts
- provider readiness categories
- runtime diagnostic categories
- projection high-water marks
- omitted-source codes

Payload includes:

- schema version for the payload body
- workspace mounted flag and workspace ID when safe
- runtime mode facts without paths
- provider readiness summaries by provider ID and state only
- active runtime diagnostic codes and categories
- projection high-water marks
- omission codes

Payload excludes:

- raw portable paths
- raw provider errors
- environment variable names
- credentials or credential-shaped text
- provider request or response bodies
- prompt text
- model output
- unrestricted local file paths
- raw evidence or correspondence text

### `task-run-history.v1`

Purpose: preserve prior operational context for specialists without leaking model output.

Required authoritative inputs:

- rebuilt agent projection or equivalent projection DTO
- current agent projection high-water mark
- scope
- policy version
- generated time
- size budget
- item limits
- optional explicit empty task/run proof

Payload includes safe summaries of:

- tasks with ID, status, priority, created/updated timestamps, run ID, source event IDs, input artifact hashes, and safe status reason
- runs with ID, run type, state, task ID, timestamps, source event IDs, input and output artifact hashes, related event IDs, step count, invocation IDs, tool request IDs, summary, failure category, retryability, and allowed action codes
- model invocation audit metadata with invocation ID, run ID, provider ID, model family, status, input/output artifact hashes, prompt template metadata, context-pack refs, omission counts, failure category, retryability, and usage counts
- tool requests with tool ID/version, state, side-effect class, approval class, preview hash, source event IDs, artifact hashes, result event IDs, read-model change summaries, approval/denial/execution timestamps, failure category, retryability, and allowed action codes

The pack preserves every state represented in projection types:

- task statuses: `queued`, `running`, `waiting-for-approval`, `blocked`, `completed`, `failed`, `canceled`
- run states: `running`, `completed`, `failed`
- model invocation statuses: `requested`, `completed`, `failed`
- tool request states: `requested`, `approved`, `executing`, `denied`, `completed`, `failed`

Payload excludes:

- raw model output
- prompt text
- raw provider errors
- rendered PRR correspondence bodies
- raw local command lines
- secrets
- hidden paths

If history exceeds budget, the builder keeps the newest and most safety-relevant records first while producing deterministic omission codes. Terminal failures, blocked states, denials, and pending approvals have priority over quiet completed history.

### `agent-memory-summary.v1`

Purpose: summarize source-linked resident working memory without making memory a hidden source of truth.

This pack remains the canonical output of the existing memory builder after that builder is evolved. No second production builder for `agent-memory-summary.v1` should exist.

Required authoritative inputs:

- rebuilt agent projection or equivalent memory projection DTO
- current agent memory projection high-water mark
- scope
- policy version
- generated time
- size budget
- item limits
- optional explicit empty memory proof

Payload includes:

- truth boundary with `authoritativeForOntology: false`
- active memory items with memory ID, scope, memory kind, safe summary, confidence, source event IDs, artifact hashes, expiry, and lifecycle event IDs as provenance-only refs
- omission codes when inactive memory, oversized memory, expired memory, or out-of-scope memory is excluded

Payload excludes:

- raw evidence bodies
- raw private source text
- credentials
- prompts and model output
- provider errors
- ontology truth assertions

Memory remains advisory. Any graph effect still requires evidence-backed proposed assertions or reviewed reasoning through ontology/domain services.

## Omission And Blocking Codes

Omission and blocking reasons are machine-readable codes. Human-facing copy belongs in runtime/UI presentation layers.

Required code families:

- `omitted.raw-paths`
- `omitted.raw-provider-errors`
- `omitted.prompts`
- `omitted.model-output`
- `omitted.credentials`
- `omitted.raw-source-content`
- `omitted.out-of-scope`
- `omitted.size-budget`
- `blocked.missing-scope`
- `blocked.missing-high-water-mark`
- `blocked.missing-empty-proof`
- `blocked.projection-stale`
- `blocked.projection-source-mismatch`
- `blocked.size-budget`
- `blocked.unsafe-diagnostic`
- `blocked.conflicting-registration`

Builders may add narrower codes when tests define them, but they must stay stable, lowercase, and command-free.

## Registration Contract

The package exports:

```ts
function registerOperationalContextPackBuilders(
  registry: ContextPackRegistry,
  provider: OperationalContextPackProvider
): OperationalContextPackRegistrationResult
```

Registration installs builders for the three operational pack IDs:

- `workspace-runtime-status.v1`
- `task-run-history.v1`
- `agent-memory-summary.v1`

Registration is idempotent for the same registry/provider registration key. A package-private registration table can use a `WeakMap<ContextPackRegistry, Map<contextPackId, registrationKey>>` to distinguish safe repeat registration from unknown existing builders.

Registration rejects:

- same context pack ID with a different version
- same ID/version with a conflicting descriptor
- same ID/version already installed by an unknown builder
- same ID/version with a different provider registration key
- builder outputs that do not match descriptor ID/version

The helper does not weaken `ContextPackRegistry` validation. It layers package-owned duplicate safety on top of the existing registry.

## Readiness Handoff

The provider module exports a helper that builds the three refs and returns:

```ts
interface OperationalContextPackReadinessInputs {
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly currentProjectionHighWaterMarks: Readonly<Record<string, number>>;
  readonly descriptors: readonly ContextPackDescriptor[];
  readonly blockingReasons: readonly OperationalContextPackBlockingCode[];
  readonly omissionCodes: readonly OperationalContextPackOmissionCode[];
}
```

The later runtime integration task can pass `contextPackRefs` and `currentProjectionHighWaterMarks` into `projectSpecialistWorkflowReadiness()` alongside PRR, evidence, graph, governance, jurisdiction, timeline, and contradiction pack refs.

This lane does not edit `packages/local-runtime/src/agent-http-routes.ts`, `packages/local-runtime/src/agent-runtime-factory.ts`, `packages/agent/src/cockpit.ts`, or UI adapters.

## Error Handling

Builder failures are fail-closed and safe:

- Missing mandatory scope or high-water marks throw or return a typed blocked result before a `ContextPackRef` is built.
- Unsafe diagnostics, raw paths, provider errors, prompt text, model output, or credential-shaped values are rejected by DTO normalization and explicit tests.
- Budget overflow either produces deterministic omissions when truncation is allowed or fails with `blocked.size-budget` when required source records cannot fit safely.
- Empty memory or history without empty proof fails with `blocked.missing-empty-proof`.
- Projection/source mismatch fails before hashing.

No error includes raw provider errors, prompt text, credentials, raw output, raw source content, or hidden filesystem paths.

## Testing Expectations

The implementation plan should require focused package-level tests that prove:

- Builders are deterministic for identical injected authoritative inputs.
- Builders do not read wall-clock time or runtime state secretly.
- Scope and projection high-water marks are mandatory and appear in refs and staleness inputs.
- Empty memory and empty task/run history are accepted only with explicit empty-projection proof.
- Non-empty memory and history include exact source event IDs and artifact hashes.
- Task/run history preserves terminal, blocked, denied, failed, executing, approved, requested, queued, running, and pending states.
- Runtime status excludes raw paths, raw provider errors, prompts, model output, credentials, and source content.
- Memory output remains non-authoritative for ontology truth.
- The provider interface can resolve async sources without importing SQLite or local-runtime modules.
- Registration is idempotent for the same provider key and rejects conflicting duplicate IDs, versions, descriptors, or builders.
- Readiness handoff returns `contextPackRefs`, `currentProjectionHighWaterMarks`, descriptors, blocking codes, and omission codes without invoking cockpit or runtime integration code.

Documentation validation for this design is:

```bash
git diff --check
npm run factory:check
```

No implementation work should begin until this design is reviewed and a measurable implementation plan is approved.

## Approved Direction

The approved direction is a package-owned operational context-pack provider and builder boundary. The three operational packs are deterministic, provenance-bound projections over injected authoritative state. They expose the exact readiness inputs a later runtime integration task needs, while avoiding shared runtime and cockpit integration files in this lane.
