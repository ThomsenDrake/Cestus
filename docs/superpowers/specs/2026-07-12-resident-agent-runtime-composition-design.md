# Resident Agent Runtime Composition Design

Date: 2026-07-12

## Purpose

This specification defines the production composition boundary that turns the
existing resident-agent contracts into one mounted, portable-workspace runtime.
It replaces the current fail-closed development assembly only when every
authoritative dependency is present and verified. It does not create another
resident identity, an alternate ledger, an in-memory production handoff path,
or a general fallback runtime.

The composed runtime serves the single workspace resident, `agent_default`.
Specialist workflows are typed run modes under that identity. Providers,
harnesses, credential references, and model names are execution backends; none
is an agent identity or an authority source.

This is a Wave 0 Lane R design. It proposes interfaces and acceptance
obligations for the later contract freeze. It changes no runtime, provider,
package, test, route, or shared-contract file.

## Scope And Governing Constraints

The runtime composition boundary must assemble all of the following from the
currently mounted workspace and frozen cross-lane contracts:

- an authoritative resolved-context registry;
- a production prompt renderer bound to an exact task attempt and approved
  provider posture;
- provider-policy feasibility and readiness evaluation;
- a readiness-validated production specialist-runner registry;
- mounted derivative-artifact and durable-handoff stores;
- runtime readiness reporting and safe composition failures.

The boundary preserves these non-negotiable rules:

- The mounted workspace manifest, canonical ledger, artifact store, policy,
  active locks, and verified `agent_default` identity are authoritative.
- Ledger events are append-only; views and readiness are rebuildable from
  mounted authoritative inputs and are never a parallel source of truth.
- Prompt text crosses to a remote provider only in a verified prompt-artifact
  envelope or typed `inputText` boundary. The ledger, browser DTOs, diagnostics,
  claims, and ordinary logs contain hashes and safe metadata, never production
  prompt text or provider secrets.
- A runner result is not terminal evidence. It must pass the authoritative
  material and manifest stores, ledger binding, and durable readback before the
  orchestrator may complete a task.
- A missing mount, identity mismatch, stale authority, unready provider,
  invalid context, or unavailable store stops work. It may not select a local,
  process-memory, temporary-file, or alternate-workspace fallback write path.
- Runtime composition remains orchestration. It does not approve provider byte
  transfer, PRR sends, legal escalation, export, destructive repair, accepted
  graph review, legacy staging, or any other external or irreversible effect.

## Current Boundary And Target State

The present local factory creates the agent runtime with the canonical mounted
ledger and resident identity lifecycle, but its context registry is empty, its
prompt renderer rejects production rendering, and its runner registry rejects
autonomous dispatch. Those failures are intentional until real mounted
capabilities exist. A provider configuration can expose readiness metadata, but
that alone does not prove a task is feasible or safe to dispatch.

The target state has one assembly operation that accepts a verified mounted
authority and only registered production capabilities. It returns a complete
`AgentTaskOrchestratorRuntimeCapabilities` instance only when its dependencies
are mutually compatible. Composition is not a convenience default: every
component is checked against the same workspace, run, policy, capability, and
schema provenance before it can be used.

The target still fails closed. A runtime may expose a secret-safe unavailable
status to the operator, but it must not expose an executable-looking fallback
capability or fabricate a successful handoff.

## Composition Boundary

Only Lane R may later own
`packages/local-runtime/src/agent-runtime-factory.ts` and the
`createProductionAgentRuntimeCapabilities(...)` composition boundary. No other
lane may edit that factory, install an alternate default factory, or make a
route, cockpit, provider configuration, or specialist module assemble a second
set of production capabilities.

The following is the proposed stable, freeze-owned surface. It expresses
capability relationships; it is not implementation code and does not replace
the existing public contracts before CF-1.

```ts
interface ProductionAgentRuntimeCompositionInput {
  readonly compositionVersion: "agent-runtime-composition.v1";
  readonly mountedAuthority: MountedWorkspaceRuntimeAuthority;
  readonly residentIdentity: VerifiedResidentIdentityAuthority;
  readonly contextCapability: MountedContextCapability;
  readonly promptCapability: ProductionPromptCapability;
  readonly providerPolicyCapability: ProviderPolicyCapability;
  readonly runnerCapability: ProductionSpecialistRunnerCapability;
  readonly artifactStores: MountedAgentArtifactStores;
  readonly handoffCapability: TaskOrchestratorHandoffCapability;
  readonly approvalReader: AgentTaskOrchestratorApprovalReader;
  readonly workflowRegistry: AgentTaskOrchestratorWorkflowRegistry;
  readonly now: () => string;
}

function createProductionAgentRuntimeCapabilities(
  input: ProductionAgentRuntimeCompositionInput
): AgentTaskOrchestratorRuntimeCapabilities;
```

The function validates, freezes, and binds its inputs before any asynchronous
operation. It returns the existing runtime-capabilities schema version,
`agent-task-orchestrator-runtime-capabilities.v1`, with a production context
registry, prompt renderer registry, provider registry and policy, runner
registry, approval reader, workflow registry, and handoff capability. A
composition input that cannot satisfy all bindings throws or reports a typed
unavailable result; it never substitutes no-op collaborators.

Factory construction occurs after the portable workspace has been mounted and
the resident identity lifecycle has reached exact `ready` for that same
workspace. Construction must retain only capability objects backed by the
mounted authority. It may retain bounded, secret-safe diagnostics in process
memory, but no canonical state or recovery artifact.

## Mounted Workspace Authority

Lane R consumes, rather than redefines, workspace mounting and identity
contracts. The proposed authority adapter makes the required facts explicit:

```ts
interface MountedWorkspaceRuntimeAuthority {
  readonly authorityVersion: "mounted-workspace-runtime-authority.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly ledger: EventLedger;
  readonly ledgerHighWaterMark: number;
  readonly mountedArtifactStore: MountedArtifactStoreAuthority;
  readonly mountedDerivativeStore: MountedDerivativeStoreAuthority;
  readonly activeLockSnapshot: ActiveLockSnapshot;
  readonly policyBinding: RuntimePolicyBinding;
  reverify(input: RuntimeAuthorityReverificationInput):
    Promise<RuntimeAuthorityReverification>;
}

interface VerifiedResidentIdentityAuthority {
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly identityInitializationEventId: string;
  readonly identityStreamHighWaterMark: number;
}
```

`workspaceId` must equal the mounted manifest identity, the resident identity
event binding, every mounted-store binding, and every capability provenance
binding. `mountInstanceId` prevents an object from a previous mount lifecycle
from being reused after a disconnect, remount, or workspace switch. A valid
object reference alone is insufficient evidence of authority.

Before a claim, provider call, tool dispatch, derivative write, handoff write,
or restart resumption, the future runtime revalidates the mounted identity,
ledger high-water mark, active lock posture, and policy binding appropriate to
that operation. A changed or unreadable authority releases work to a durable
resumable `workspace-unavailable` state through existing append-only paths when
possible, then stops. It writes no internal copy of ledger, projection,
derivative, prompt, handoff, or artifact data.

## Mounted Authoritative Context Registry

The runtime registry composes package-owned context builders against mounted
read capabilities. It is the authoritative production implementation of the
existing `ContextPackRegistry`; it is not a cache of ref-shaped payloads or a
generic hash-to-text resolver.

```ts
interface MountedContextCapability {
  readonly capabilityVersion: "mounted-agent-context.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly registry: ContextPackRegistry;
  readonly registrationBindings: readonly ContextRegistrationBinding[];
  verifyForRun(input: VerifyMountedContextForRunInput):
    Promise<VerifiedContextBindingSet>;
}

interface ContextRegistrationBinding {
  readonly contextPackId: string;
  readonly version: number;
  readonly descriptorHash: `sha256:${string}`;
  readonly parserIdentity: string;
  readonly producerIdentity: string;
  readonly sourceProjection: string;
  readonly workspaceId: string;
  readonly policyVersion: string;
}
```

The factory registers only approved, package-owned production builders. At
minimum, those include the previously registered operational, PRR, and
investigative context families that a frozen specialist descriptor requires.
Lane R does not duplicate their schemas or selection algorithms. It supplies
the trusted mounted readers, current source posture capability, deterministic
clock, policy binding, and registration helper inputs those package contracts
require.

For every dispatch, the registry must:

1. resolve the exact descriptor and version required by the workflow;
2. build the bounded payload from mounted authoritative inputs;
3. parse it with the package-owned authoritative parser;
4. verify canonical byte hash, size, source high-water marks, scope,
   provenance, policy version, staleness inputs, and workspace binding;
5. return `VerifiedResolvedContextPack` values matching every referenced pack
   exactly once.

Ref-only values, JSON-reloaded payloads, swapped parser authorities,
incompatible selection manifests, stale source posture, unbounded workspace
selection, or a workspace mismatch block the task. Cached payloads may improve
performance only if they revalidate to the same mounted authority; they are
never an authority or a fallback source.

## Prompt Binding

The production renderer consumes only verified resolved context packs and an
exact orchestrator attempt. It produces a `PromptArtifactEnvelope` whose
manifest is the auditable provider boundary. It does not accept a callback that
turns an artifact hash into text, a placeholder prompt, or a caller-supplied
unverified payload.

```ts
interface ProductionPromptCapability {
  readonly capabilityVersion: "production-agent-prompt.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  render(input: ExactRunPromptBinding): Promise<PromptArtifactEnvelope>;
}

interface ExactRunPromptBinding {
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly runType: TaskOrchestratorRunType;
  readonly residentAgentId: "agent_default";
  readonly scope: ProductionRunScope;
  readonly workflowDescriptorHash: `sha256:${string}`;
  readonly contextBindings: readonly VerifiedContextBinding[];
  readonly providerPosture: VerifiedProviderPosture;
  readonly runtimePolicy: RuntimePolicyBinding;
}
```

The renderer must bind the same run type, prompt-template ID and version,
renderer ID and version, renderer hash, output-schema ID and version,
handoff-schema ID and version, workflow descriptor hash, policy version,
provider posture, and context-ref hashes into the prompt artifact's production
binding. Required context is represented by the canonical refs and verified
resolved payload audit, while an applicable omission must carry its allowed
safe reason. The renderer must reject a changed attempt, run, workflow,
scope, provider posture, template, context hash, parser authority, or policy
version rather than reuse a prompt assembled for another run.

The provider receives the verified `text` only after the existing remote
transfer boundary rechecks `provider-approved` safety, the exact
provider-byte-transfer approval where required, and production-renderer
verification. Prompt text is not appended as a ledger payload, copied into a
handoff manifest, logged, shown in a DTO, or placed in an error message.

## Provider-Policy Feasibility And Readiness

Lane P owns provider capability, credential, feasibility, and shared provider
configuration contracts. Lane R consumes its frozen registry through a
run-scoped policy adapter. The composition factory does not create credentials,
probe secrets, reinterpret an unavailable subscription flow, or silently fall
back to another provider.

```ts
interface ProviderPolicyCapability {
  readonly capabilityVersion: "agent-runtime-provider-policy.v1";
  readonly workspaceId: string;
  readonly providerRegistry: ProviderCapabilityRegistry;
  readonly policyVersion: string;
  evaluate(input: ProviderPolicyEvaluationInput):
    Promise<ProviderPolicyEvaluation>;
}

interface VerifiedProviderPosture {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityIds: readonly string[];
  readonly selectionPolicyVersion: string;
  readonly readinessState: "ready";
  readonly approvalRequirementId: string;
  readonly postureHash: `sha256:${string}`;
}
```

Evaluation binds the run type, workflow descriptor, mounted workspace scope,
credential-reference posture, selected capability versions, model limits,
structured-output and tool support, data-handling posture, request budgets,
prompt size, and required approval class. It returns one of these outcomes:

- `invocation-ready`: an exact provider/model capability is feasible and its
  safe readiness contract, budget, policy, and approval requirement are
  current and satisfied;
- `waiting-for-approval`: capability is feasible but an exact current approval
  is required before byte transfer;
- `unavailable`: no policy-permitted capability satisfies the run;
- `blocked`: a lock, workspace authority, stale binding, malformed capability,
  or policy violation prevents use.

Only `invocation-ready` can produce a remote invocation posture.
`waiting-for-approval` may create or observe a bounded approval request but
cannot invoke a provider. `unavailable` and `blocked` are durable, safe
outcomes, not reasons to choose a fake provider, local model, credential,
provider family, endpoint, or storage path that the policy did not select. An
official harness feasibility failure is reported as provider limitation evidence
under Lane P's contract; it must not block a separately invocation-ready
approved provider such as Nous, and it must not be hidden by a synthetic pass.

## Specialist-Runner Registry

The runtime's runner registry resolves a specialist only after workflow,
context, prompt, provider, approval, store, and lock readiness all match the
same exact run. It is the production implementation of the existing
`TaskOrchestratorRunnerRegistry`, not a dispatcher that merely records a
lifecycle event.

```ts
interface ProductionSpecialistRunnerCapability {
  readonly capabilityVersion: "production-specialist-runner-registry.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly registrations: readonly SpecialistRunnerRegistrationBinding[];
  dispatch(input: VerifiedSpecialistDispatchInput):
    Promise<TaskOrchestratorRunnerDispatchResult>;
}

interface SpecialistRunnerRegistrationBinding {
  readonly runType: TaskOrchestratorRunType;
  readonly runnerId: string;
  readonly runnerVersion: number;
  readonly workflowDescriptorHash: `sha256:${string}`;
  readonly requiredContextPackIds: readonly string[];
  readonly promptTemplateId: string;
  readonly providerPolicyVersion: string;
  readonly handoffSchemaVersion: string;
  readonly requiredAdapterFamilies: readonly string[];
}
```

The registry accepts only frozen production registrations for the same
`agent_default`, task, attempt, run, workspace, mount, and policy. It must
validate the specialist readiness projection against the exact descriptor:
required context versions and parser identities, current projection watermarks,
provenance, active locks, provider posture, prompt production binding, approval
class, domain-adapter families, budgets, and terminal/resumable semantics.

The runner returns a durable-handoff result only after it has written its
artifact material to the mounted store and supplied the stores and material
needed by the existing handoff sequence. It cannot report completed merely
because a model response, draft, or in-process object exists. A blocked,
failed, or interrupted runner must preserve the existing typed handoff state
and safe next action through the same durable lifecycle.

Lane H owns durable-handoff schemas and workflow migration. Lane L owns the
bounded-loop policy. Lane R wires their frozen capabilities; it neither changes
handoff meaning nor grants the runner tools, budgets, permissions, or effects
beyond the descriptor it verifies.

## Mounted Derivative And Handoff Stores

All production derivative and handoff bytes reside in the mounted workspace.
The runtime factory receives one bound store set; it does not construct a
SQLite, filesystem, memory, cache, or temporary-directory substitute.

```ts
interface MountedAgentArtifactStores {
  readonly storesVersion: "mounted-agent-artifact-stores.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly derivativeStore: SpecialistDerivativeArtifactStore;
  readonly handoffMaterialStore: MountedHandoffMaterialStore;
  readonly handoffManifestStore: MountedHandoffManifestStore;
  verifyBinding(input: VerifyMountedStoreBindingInput):
    Promise<MountedStoreBindingReadback>;
}

interface MountedHandoffMaterialStore {
  readonly storeKind: "mounted-handoff-material-store.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  writeMaterial(input: WriteMountedHandoffMaterialInput):
    Promise<MountedHandoffMaterialReceipt>;
  readMaterialExact(input: ReadMountedHandoffMaterialInput):
    Promise<VerifiedMountedHandoffMaterialReadback>;
}

interface MountedHandoffManifestStore {
  readonly storeKind: "mounted-handoff-manifest-store.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  writeManifest(input: WriteMountedHandoffManifestInput):
    Promise<MountedHandoffManifestReceipt>;
  readManifestExact(input: ReadMountedHandoffManifestInput):
    Promise<VerifiedMountedHandoffManifestReadback>;
}

interface MountedHandoffMaterialReceipt {
  readonly materialHash: `sha256:${string}`;
  readonly sizeBytes: number;
  readonly authorityHash: `sha256:${string}`;
}

interface VerifiedMountedHandoffMaterialReadback
  extends MountedHandoffMaterialReceipt {
  readonly materialSchemaVersion: "agent-specialist-handoff-material.v1";
}

interface MountedHandoffManifestReceipt {
  readonly manifestHash: `sha256:${string}`;
  readonly sizeBytes: number;
  readonly materialHash: `sha256:${string}`;
  readonly authorityHash: `sha256:${string}`;
}

interface VerifiedMountedHandoffManifestReadback
  extends MountedHandoffManifestReceipt {
  readonly manifestSchemaVersion: "agent-specialist-handoff-manifest.v1";
}
```

Before accepting the stores, composition proves that every store is writable
only through the mounted workspace, identifies the same workspace and mount
instance, and has the frozen capability/schema version. Material and manifest
persistence are distinct typed capabilities, not two references to
`SpecialistHandoffManifestStore`. Any CF-1 migration from the existing
compatibility store must adapt these operations explicitly; it must not alias a
generic blob store, filesystem handle, or one store object as proof that both
artifact kinds are interchangeable.

For each write, the future store adapter normalizes the boundary object before
an `await`, validates canonical bytes and the type-specific expected hash, then
performs the corresponding exact readback. A material receipt is a claim until
`readMaterialExact` verifies its material hash, size, authority, and material
schema. A manifest receipt is a claim until `readManifestExact` verifies its
manifest hash, size, authority, manifest schema, and the exact material hash it
binds. A returned hash or event-shaped object is never completion evidence.

The persistence permit is ordered and typed:

1. The material store writes canonical `agent-specialist-handoff-material.v1`
   bytes and `readMaterialExact` verifies the expected material hash and mounted
   authority.
2. The final-output step records that verified material hash with the run,
   task, resident, provenance, and output bindings.
3. The manifest store receives the verified material readback, writes a manifest
   that binds that same material hash, and `readManifestExact` verifies both
   hashes and authority.
4. Only that verified manifest readback may authorize the prepared/recorded
   ledger binding; the recorded event cites the exact manifest and material
   hashes.

This is a required material-before-manifest proof and a required
manifest-before-recorded proof. A manifest writer presented with an unverified,
swapped, stale, cross-run, or authority-mismatched material receipt rejects it.
The recorded append rejects absent or mismatched manifest readback even if a
manifest write returned a plausible hash. The sequence then continues to
specialist and orchestration completion only after the existing ledger handoff
readback succeeds. Failure at any stage cannot create a terminal-looking task
result. It produces a typed blocked, failed, or resumable state with source
event IDs, the separately typed artifact hashes, and safe repair action
metadata.

On a disconnect, write error, changed mount identity, or readback mismatch, the
store capability rejects work before an internal copy is attempted. The future
portable-lifecycle lane owns process and disconnect recovery; Lane R exposes
only the composition-level unavailability needed for it to stop or release
work safely.

## Runtime Readiness

Runtime readiness is a recomputable, secret-safe projection of the complete
composition preconditions. It is not a mutable ready flag and it does not infer
capability from a provider-family prefix, a mounted path, a prior success, or a
partial registry.

```ts
interface ProductionRuntimeReadiness {
  readonly schemaVersion: "agent-runtime-composition-readiness.v1";
  readonly workspaceId?: string;
  readonly residentAgentId: "agent_default";
  readonly structuralStatus: "ready" | "not-ready" | "blocked" | "unavailable";
  readonly providerInvocation: ProviderInvocationReadiness;
  readonly executable: boolean;
  readonly authority: RuntimeReadinessAuthority;
  readonly components: readonly RuntimeReadinessComponent[];
  readonly safeDiagnostics: readonly RuntimeCompositionDiagnostic[];
  readonly generatedAt: string;
}

interface ProviderInvocationReadiness {
  readonly state:
    | "ready-to-invoke"
    | "waiting-for-human-approval"
    | "provider-unavailable"
    | "provider-blocked";
  readonly safeReason: string;
  readonly requirements: ProviderInvocationRequirements;
}

interface ProviderInvocationRequirements {
  readonly selectionPolicyVersion: string;
  readonly providerFeasibility: "invocation-ready" | "waiting-for-approval" | "unavailable" | "blocked";
  readonly providerReadiness: "ready" | "not-ready" | "blocked" | "unavailable";
  readonly approvalRequirementId?: string;
  readonly approvalState: "not-required" | "current" | "missing" | "stale" | "denied";
  readonly budgetState: "available" | "exhausted";
  readonly lockState: "clear" | "blocked";
}
```

`structuralStatus` describes whether the mounted runtime can safely assemble its
non-provider capabilities. It is intentionally not an invocation grant.
Structural `ready` requires all of these facts at once:

1. one mounted workspace authority and a ready resident identity bound to it;
2. an exact current policy, lock, and ledger-high-water binding;
3. every required context producer registered with its frozen ID, version,
   descriptor hash, parser identity, bounded source selector, and mounted read
   authority;
4. a production renderer whose template and output/handoff schemas match the
   intended workflow and whose input can bind verified resolved packs;
5. a readiness-validated runner registration with every required adapter and
   declared budget;
6. mounted derivative, material, and manifest stores that pass binding and
   readback checks.

`providerInvocation` separately projects the exact result of provider-policy
evaluation. Its `safeReason` is mandatory and secret-safe for every state; its
`requirements` make the policy, feasibility, approval, budget, and lock
relationship inspectable without exposing a credential or prompt. The factory
derives `executable` rather than accepting it from a caller:

```text
executable is true only when structuralStatus is ready
and providerInvocation.state is ready-to-invoke
and every ProviderInvocationRequirements field is current and satisfied.
```

Consequently, a runtime with `structuralStatus: "ready"` and
`providerInvocation.state: "waiting-for-human-approval"` is explicitly
non-executable. It must not be passed to runner dispatch, provider invocation,
or any consumer that expects execution capability. That consumer requires the
complete provider-invocation object and rejects every state except
`ready-to-invoke`; it may not infer executability from structural readiness or a
top-level boolean alone. Missing, stale, denied, or mismatched approval keeps
the state non-executable even if the provider capability itself is feasible.

The readiness DTO may expose stable component IDs, versions, hashes, safe
categories, counts, status, and allowed repair actions. It never exposes prompt
text, source bytes, raw provider responses, credential values, secret-shaped
keys, raw storage paths, environment names, or unredacted underlying errors.
Browser consumers receive a separately frozen DTO from Lane U after the route
and parser contracts merge; the browser never constructs readiness itself.

## Composition Failure Categories

Composition failures use a small stable category vocabulary. Each result has a
safe code, retryability, owning component, provenance references where already
available, and allowed repair actions. Raw caught errors are not propagated.

| Category | Meaning | Required behavior |
| --- | --- | --- |
| `workspace-unavailable` | No mounted workspace, unmounted store, unreadable authority, or removed mount. | Stop new work; do not write a fallback; release or preserve work only through the durable lifecycle. |
| `workspace-identity-mismatch` | Manifest, identity event, capability, store, or mount-instance binding differs. | Block composition and require re-open/reverification; never reinterpret or append a replacement identity. |
| `resident-identity-not-ready` | `agent_default` lacks exact ready readback for the mounted workspace. | Do not claim, render, invoke, or dispatch. |
| `authority-stale-or-unverified` | Ledger high-water, policy, lock, source, selection, or provenance binding changed or could not be proved. | Revalidate before reuse; otherwise return a safe blocked or resumable outcome. |
| `context-capability-invalid` | Registry, descriptor, parser authority, selection, boundedness, payload hash, or pack provenance is invalid. | Reject the context set before prompt construction. |
| `prompt-binding-invalid` | Exact run, template, renderer, schema, context, safety, or production binding is absent or mismatched. | Do not create a placeholder or transfer text. |
| `provider-policy-unready` | Capability feasibility, credential-reference posture, approval, budget, or provider readiness is not exact. | Set an explicit non-`ready-to-invoke` provider invocation state with its safe reason and requirements; do not choose another backend implicitly. |
| `runner-registration-invalid` | A required runner, workflow, adapter family, readiness proof, budget, or descriptor binding is absent or mismatched. | Do not dispatch or emit a lifecycle-only success. |
| `mounted-store-unavailable` | Derivative/material/manifest store is absent, not mounted, rejects a boundary value, or cannot read back exact bytes. | Stop before an internal copy; record only durable failure/resumption evidence when the ledger remains authoritative. |
| `handoff-readback-failed` | Material, manifest, ledger binding, or final lifecycle readback does not exactly match the run. | Never complete the task; return blocked, failed, or resumable handoff state. |
| `composition-version-conflict` | Frozen capability, schema, parser, policy, or factory versions are incompatible. | Block until a coordinated compatible rebase and contract update exists. |

The final category is `unexpected-safe-failure` for failures that cannot be
classified without leaking data. It remains fail-closed, includes a stable safe
incident identifier where available, and is never promoted to a fabricated
category or success.

## Versioning And Provenance Bindings

Every composed capability is versioned and bound before use. The later contract
freeze must assign the exact Zod parser, canonical JSON/hash algorithm,
compatibility behavior, owner, fixture, and event/DTO version for each field.
Lane R's compatibility rule is exact-match by default: a major schema,
capability, parser, producer, renderer, workflow, policy, or handoff change
requires a new frozen composition version and a dependent rebase. A declared
additive compatible change may be consumed only if CF-1 names the parser and
test proving that compatibility.

The minimum run provenance set is:

- mounted workspace ID, mount instance ID, identity initialization event ID,
  ledger high-water mark, and active-lock snapshot identity;
- task ID, attempt ID, run ID, run type, workflow descriptor hash, and
  specialist runner ID/version;
- context descriptor and parser identities, refs, canonical content hashes,
  size budgets, selection-manifest hashes, source event IDs, artifact hashes,
  projection high-water marks, source posture, and policy version;
- prompt artifact hash, template and renderer versions/hashes, output and
  handoff schema versions, scope applicability hash, and omission audit;
- provider ID/model ID, capability IDs, selection policy version, readiness
  state, credential-reference category, approval requirement ID, and posture
  hash, with no secret value;
- derivative artifact hashes, handoff material and manifest hashes, final
  output event ID, handoff event IDs, and ledger readback event IDs.

The composition adapter may project safe metadata from this set, but it may not
drop fields that the downstream prompt, approval, runner, handoff, projection,
or acceptance consumer needs to prove exact causation. Rebuild after restart
must derive the same safe readiness and either reconstruct the durable state or
fail closed; it must not depend on an in-memory prompt, handoff, or selected
provider object.

## Ownership, Dependencies, And Consumer Handoffs

Lane R has a singular responsibility: production local-runtime assembly and,
later, the sole default factory composition boundary. It consumes narrow
capabilities and does not take ownership of their contracts.

| Producer lane | Frozen producer responsibility | Lane R consumes | Downstream consumer |
| --- | --- | --- | --- |
| L | plan/observation records, bounded policy, budget and terminal/resumable semantics | policy and run-bound budget proof | runner registry, wake runtime, acceptance |
| H | durable workflow adoption, handoff material/manifest, projection and diagnostics contracts | mounted stores and handoff readback capability | runtime projection, cockpit, acceptance |
| W | workspace availability, disconnect/reconnect, supervision, pause/resume and recovery | mount authority lifecycle and safe stop/release signal | supervisor, cockpit, acceptance |
| P | provider capability registry, credential-reference posture, feasibility and configuration | policy evaluator, exact readiness and provider registry | prompt/runner composition, acceptance |
| U | browser-safe DTO/parser and supported supervision commands | no browser authority; only future route-consumed readiness facts | cockpit after routes merge |
| A | cross-lane deterministic and live acceptance ownership | merged production runtime as system under test | coordinator release gate |

Lane R also consumes the already established resident identity, context-pack,
prompt-artifact, task-orchestrator, workflow descriptor, approval-reader, and
domain-adapter contracts. Where an existing interface is insufficient, this
design names a freeze proposal rather than changing it unilaterally. CF-1 must
resolve any vocabulary or schema overlap, assign one canonical owner, and
reject a duplicate owner before implementation begins.

The planned composition dependency order is strict: shared plan/observation
contracts and portable authority must be frozen before context and prompt
composition; durable workflow migrations must be available before runners and
mounted handoff stores; provider contracts must be available before a policy
posture can be bound; all producers must be merged and rebased before the
factory is integrated. Lane R does not implement downstream cockpit routes,
provider configuration, durable-handoff projection, or wake supervision.

## Acceptance Obligations And Merge Constraints

This specification creates no executable test. The later Lane R work must give
the acceptance lane deterministic, credential-free evidence for these
obligations, while real-provider gates remain coordinator-controlled and emit
only safe identifiers, hashes, event IDs, counts, categories, and markers.

| Obligation | Deterministic proof | Required failure proof |
| --- | --- | --- |
| Mounted restart composition | A fresh process opens the same mounted workspace and reconstructs context, prompt audit metadata, claim, and handoff solely from durable state. | An in-memory-only context, prompt, provider posture, or handoff cannot continue after restart. |
| Authoritative context binding | Required package-owned context packs parse and verify against the mounted workspace. | Swapped workspace, parser, ref, payload hash, source posture, selection manifest, or high-water mark rejects before prompt rendering. |
| Exact prompt/provider binding | A production prompt artifact binds one approved task attempt, provider posture, template, renderer, context set, and policy. | Stale or cross-run artifact, unapproved transfer, placeholder renderer, and raw prompt logging fail closed. |
| Runner readiness and dispatch | A registered production runner dispatches only after exact readiness and returns the durable handoff sequence inputs. | Missing adapter, provider, context, lock clearance, approval, budget, or registration cannot become a lifecycle-only success. |
| Mounted store readback | Derivative writes plus distinct material and manifest writes are canonical, mounted, and exactly read back before completion; manifest readback binds the prior verified material hash. | Store absence, type confusion, material/manifest order violation, forged result, hash mismatch, mount switch, or readback failure produces no internal fallback and no terminal task. |
| Runtime readiness | Readiness is complete only when every required capability/version/provenance binding matches. | Partial registration, provider-family inference, stale policy, or a prior-mount object never yields `ready`. |
| Real Nous portable evidence triage | The merged system uses the approved real Nous path only if policy selects it and records safe durable evidence. | Provider outage, stale approval, denial, exhausted budget, or readback failure becomes blocked or resumable without secret leakage. |
| Disconnect and reconnect | A mount loss stops composition and later re-verifies the same workspace, high-water, policy, and locks. | No ledger, projection, artifact, derivative, prompt, or handoff fallback write occurs during absence or identity mismatch. |

Before the future factory integration, all relevant producer branches must have
passed their focused commands, fresh review, and coordinator merge gate. The
coordinator records each merged SHA, rebases the dependent Lane R worktree to
the contract-changing merge, and runs the named cross-lane command. A stale
branch, version conflict, missing producer review, changed factory owner, or
unrecorded compatibility decision is a stop condition, not a merge conflict to
paper over.

Only Lane R may change the default factory after all dependencies are merged.
Lane P remains the only owner of shared provider configuration; Lane H remains
the owner of material/manifest/handoff contracts and their compatibility
migration; Lane W remains the owner of lifecycle behavior;
Lane U consumes merged routes and DTOs; Lane A tests integration rather than
repairing upstream production code without a separately authorized range.

## Non-Goals

This lane does not define an implementation plan, executable factory code,
context-pack schemas, provider credentials, provider configuration, specialist
workflow behavior, handoff schema changes, lifecycle supervision, browser UI,
or acceptance-test implementation. It does not alter the append-only ledger,
projection rebuildability, approval semantics, or portable workspace ownership.

It does not authorize a fallback storage path, an additional resident identity,
automatic external effects, prompt-text persistence, synthetic handoffs, or
runtime composition from untrusted or test-only registrations.

## Review Gate

The Lane R specification stops here. It requires a fresh coordinator spec
review for coverage, vocabulary and interface conflicts, ownership conflicts,
append-only/provenance/no-fallback compliance, and documentation verification.
Only written R-spec approval may open the separately scoped implementation-plan
gate; this specification grants no implementation, contract-freeze, merge, or
next-task authority.
