# Resident Agent Runtime Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assemble the one production resident-agent runtime exclusively from
verified mounted capabilities, without a second resident identity, alternate
default factory, prompt/secret leak, or fallback storage path.

**Architecture:** Lane R implements narrow local-runtime adapters for mounted
context, exact prompt binding, specialist dispatch, and mounted
derivative/handoff stores. Once L, H, W, and P have merged their frozen
producer contracts, Lane R alone composes those verified capabilities in the
sole default factory and derives readiness from them. It consumes provider
configuration from P, handoff semantics from H, lifecycle authority from W,
and bounded policy from L; it does not recreate any of them.

**Tech Stack:** TypeScript (strict), Vitest, existing Cestus canonical hashing
and parser contracts, SQLite-backed portable workspace, mounted workspace
authority, and npm scripts. Deterministic tests use credential-free fakes.

## Global Constraints

- Implement only after CF-1 freezes every shared capability, event, DTO,
  parser, schema, and owner used below. A missing/conflicting entry blocks the
  task and returns it to the coordinator; Lane R never creates a shadow type.
- `agent_default` is the sole resident identity. Specialists are typed run
  modes, never additional actors or authority sources.
- Mounted manifest, canonical ledger, artifact/derivative stores, policy,
  locks, and verified identity are authoritative. Readiness is rebuildable and
  never state of record.
- Normalize every untrusted boundary object before an `await`, then reverify
  workspace, mount, high-water, policy, and lock facts before claim, render,
  provider transfer, dispatch, storage, or resumption.
- Only verified prompt-artifact text may cross the established remote transfer
  boundary. Ledger events, DTOs, diagnostics, claims, and logs carry hashes
  and safe metadata, never prompt text, secret values, raw response bytes, raw
  storage paths, or raw caught errors.
- Only `invocation-ready` can yield `ready-to-invoke`. Waiting approval,
  unavailable, and blocked outcomes are durable non-executable states; they
  never select a different provider, credential, endpoint, process, or store.
- Material and manifest are distinct mounted capabilities. Exact material
  readback precedes the final-output binding; exact manifest readback bound to
  that material precedes the recorded handoff event and terminal readback.
- Only Lane R may change `packages/local-runtime/src/agent-runtime-factory.ts`.
  P owns shared provider configuration; H handoff semantics; W lifecycle; L
  loop policy; U browser consumers; and A acceptance tests.
- This plan's deterministic tasks invoke no provider. Real Nous is a later
  coordinator-only gate, conditional on P policy selection and current
  approval/budget/lock/mounted-authority facts.
- Every implementation child needs its own coordinator-issued authorization
  naming the approved spec/plan SHAs, exact task range, wave stop,
  user-confirmed GPT-5.6 Terra / Extra High configuration,
  `superpowers:subagent-driven-development`, TDD, fresh review,
  verification-before-completion, and no merge into `neo`.

---

## CF-1 Consumed Contracts

CF-1 must publish one canonical owner, parser, version, fixture, and targeted
test for every interface in this block. They are consumed from their frozen
module locations; this plan copies them to make implementation signatures
unambiguous but does not assign their shared ownership.

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
  reverify(input: RuntimeAuthorityReverificationInput): Promise<RuntimeAuthorityReverification>;
}

interface VerifiedResidentIdentityAuthority {
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly identityInitializationEventId: string;
  readonly identityStreamHighWaterMark: number;
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

interface ProviderPolicyCapability {
  readonly capabilityVersion: "agent-runtime-provider-policy.v1";
  readonly workspaceId: string;
  readonly providerRegistry: ProviderCapabilityRegistry;
  readonly policyVersion: string;
  evaluate(input: ProviderPolicyEvaluationInput): Promise<ProviderPolicyEvaluation>;
}

interface MountedAgentArtifactStores {
  readonly storesVersion: "mounted-agent-artifact-stores.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly derivativeStore: SpecialistDerivativeArtifactStore;
  readonly handoffMaterialStore: MountedHandoffMaterialStore;
  readonly handoffManifestStore: MountedHandoffManifestStore;
  verifyBinding(input: VerifyMountedStoreBindingInput): Promise<MountedStoreBindingReadback>;
}

interface ProductionRuntimeReadiness {
  readonly schemaVersion: "agent-runtime-composition-readiness.v1";
  readonly residentAgentId: "agent_default";
  readonly structuralStatus: "ready" | "not-ready" | "blocked" | "unavailable";
  readonly providerInvocation: ProviderInvocationReadiness;
  readonly executable: boolean;
  readonly authority: RuntimeReadinessAuthority;
  readonly components: readonly RuntimeReadinessComponent[];
  readonly safeDiagnostics: readonly RuntimeCompositionDiagnostic[];
  readonly generatedAt: string;
}
```

CF-1 additionally freezes `MountedContextCapability`,
`ProductionPromptCapability`, `ProductionSpecialistRunnerCapability`,
`ExactRunPromptBinding`, `SpecialistRunnerRegistrationBinding`,
`MountedHandoffMaterialStore`, `MountedHandoffManifestStore`, and the exact
canonical hash/parser helpers. If it assigns an identifier differently, stop
before RED and request a coordinator freeze/rebase correction.

## File Ownership and Merge Order

| Task | Exact Lane R files | Purpose | Required merged predecessors |
| --- | --- | --- | --- |
| 132 | Create `packages/local-runtime/src/agent-runtime-context-packs.ts`; create `packages/local-runtime/test/agent-runtime-context-packs.test.ts` | Mounted authoritative context registry. | 120, 125, CF-1 |
| 133 | Create `packages/local-runtime/src/agent-runtime-prompt-renderer.ts`; create `packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts` | Exact prompt and provider-posture binding. | 120, 126–130, CF-1 |
| 134 | Create `packages/local-runtime/src/agent-runtime-specialist-runners.ts`; create `packages/local-runtime/test/agent-runtime-specialist-runners.test.ts` | Readiness-validated specialist runner registry. | 121–124, CF-1 |
| 135 | Create `packages/local-runtime/src/mounted-agent-artifact-stores.ts`; create `packages/local-runtime/test/mounted-agent-artifact-stores.test.ts` | Mounted derivative/material/manifest stores and readback. | 121–123, 125, CF-1 |
| 140 | Modify `packages/local-runtime/src/agent-runtime-factory.ts`; create `packages/local-runtime/test/agent-runtime-composition.test.ts` | Sole default production factory and derived readiness. | 132–139, CF-1 |

`packages/local-runtime/src/agent-provider-configuration.ts` belongs only to
Task 139/P; `packages/local-runtime/src/wake-supervisor-runtime.ts` belongs
only to Task 137/W. Task 140 consumes their reviewed APIs and edits neither.
The existing fail-closed collaborators in `agent-runtime-factory.ts` remain
unchanged until Task 140; no earlier task may make them permissive.

### Fresh review gate and rebase protocol

The coordinator records CF-1's integration SHA before dispatch. Tasks 132–135
start from that SHA and have fresh reviews. After any contract-changing merge,
the coordinator rebases each dependent R worktree, reruns its cross-lane
focused suite, and appends SHA/result to the claim and registry. Task 140 may
start only after reviewed 132–139 are integrated. A stale worktree, unresolved
owner, incompatible version, or unreviewed predecessor is non-mergeable.

## Task 132: Mounted Context Registry

**Files:**

- Create: `packages/local-runtime/src/agent-runtime-context-packs.ts`
- Create: `packages/local-runtime/test/agent-runtime-context-packs.test.ts`
- Read: CF-1 context contract, `packages/agent/src/context-packs.ts`,
  `packages/agent/src/operational-context-packs.ts`,
  `packages/agent/src/prr-context-packs.ts`,
  `packages/agent/src/investigative-context-packs.ts`, and
  `packages/local-runtime/src/runtime-factory.ts`.

**Consumes:** one `MountedWorkspaceRuntimeAuthority`, frozen
`ContextRegistrationBinding` records, and existing package-owned context
builder registrations. **Produces:**

```ts
export function createMountedAgentContextCapability(input: {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly registrations: readonly ContextRegistrationBinding[];
  readonly registerBuilders: (registry: ContextPackRegistry) => void;
}): MountedContextCapability;

// Returned API:
verifyForRun(input: VerifyMountedContextForRunInput): Promise<VerifiedContextBindingSet>;
```

The capability resolves every required descriptor exactly once, parses with its
registered authoritative parser, and verifies workspace/mount/policy,
descriptor/version, parser/producer identity, scope, source high-water,
selection manifest, canonical bytes/hash/size, and provenance. Ref-only,
JSON-reloaded, stale-cache, swapped-parser, unbounded-selection, and
cross-workspace values stop before any prompt renderer becomes reachable.

- [ ] **Step 1: Write the failing test: mounted-authority behavior.**

```ts
it("builds each required mounted pack once and rejects a switched mount", async () => {
  const build = vi.fn(async () => verifiedPack({ workspaceId: "ws_a", mountInstanceId: "mount_a" }));
  const capability = createMountedAgentContextCapability({
    authority: mountedAuthority({ workspaceId: "ws_a", mountInstanceId: "mount_a" }),
    registrations: [contextRegistration("operational-status.v1")],
    registerBuilders: (registry) => registry.register(registrationWithBuild(build))
  });
  await expect(capability.verifyForRun(verifyRun({ workspaceId: "ws_a", mountInstanceId: "mount_a" })))
    .resolves.toMatchObject({ packs: [expect.any(Object)] });
  expect(build).toHaveBeenCalledTimes(1);
  await expect(capability.verifyForRun(verifyRun({ workspaceId: "ws_b", mountInstanceId: "mount_b" })))
    .rejects.toMatchObject({ code: "workspace-identity-mismatch" });
  expect(build).toHaveBeenCalledTimes(1);
});
```

Add independent rejection tests for changed descriptor/version, parser,
payload hash, source high-water, selection manifest, scope, policy, and
duplicate required pack. Assert only safe category/action fields are exposed.

- [ ] **Step 2: Run the focused RED command.**

```bash
npm test -- packages/local-runtime/test/agent-runtime-context-packs.test.ts packages/agent/test/context-packs.test.ts
```

Expected: FAIL because `createMountedAgentContextCapability` is absent; no
provider or store fake runs.

- [ ] **Step 3: Write the minimal implementation: mounted capability.**

```ts
export function createMountedAgentContextCapability(input: {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly registrations: readonly ContextRegistrationBinding[];
  readonly registerBuilders: (registry: ContextPackRegistry) => void;
}): MountedContextCapability {
  const registry = createContextPackRegistry();
  input.registerBuilders(registry);
  return Object.freeze({
    capabilityVersion: "mounted-agent-context.v1",
    workspaceId: input.authority.workspaceId,
    mountInstanceId: input.authority.mountInstanceId,
    registry,
    registrationBindings: Object.freeze([...input.registrations]),
    verifyForRun: (run) => verifyMountedContextBindings({ authority: input.authority, registry, registrations: input.registrations, run })
  });
}
```

`verifyMountedContextBindings` normalizes `run` before await, revalidates
authority, compares each frozen registration, and freezes its verified result.
It never creates a prompt, provider, cache authority, or fallback store.

- [ ] **Step 4: Run the focused GREEN command.**

Run the Step 2 command. Expected: PASS with exact binding and all listed
failures stopping before prompt construction.

- [ ] **Step 5: Verify, commit, and stop for review.**

Run `git diff --check`, `npm run factory:check`, and `npm run verify`; record
actual outputs in the task claim. Then:

```bash
git add packages/local-runtime/src/agent-runtime-context-packs.ts packages/local-runtime/test/agent-runtime-context-packs.test.ts docs/agentic/claims/task-132-resident-runtime-context-packs.md
git commit -m "feat: verify mounted agent context packs"
```

Fresh review is mandatory; Task 132 neither changes the factory nor dispatches
a provider.

## Task 133: Exact Prompt and Provider-Posture Binding

**Files:**

- Create: `packages/local-runtime/src/agent-runtime-prompt-renderer.ts`
- Create: `packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts`
- Read: CF-1 prompt/provider contracts, `packages/agent/src/prompt-artifacts.ts`,
  `packages/local-runtime/src/agent-prompt-artifacts.ts`, and reviewed Task 132.

**Consumes:** `VerifiedContextBindingSet`, `ExactRunPromptBinding`, frozen
production renderer/template registry, and P's `VerifiedProviderPosture`.
**Produces:**

```ts
export function createProductionAgentPromptCapability(input: {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly renderer: ProductionPromptRenderer;
  readonly verifyContext: (input: VerifyMountedContextForRunInput) => Promise<VerifiedContextBindingSet>;
}): ProductionPromptCapability;

// Returned API:
render(input: ExactRunPromptBinding): Promise<PromptArtifactEnvelope>;
```

It binds task, attempt, run, type, `agent_default`, scope, descriptor hash,
verified context hashes, template/renderer/output/handoff schema versions,
policy version, and exact provider posture. It does not accept credentials,
raw environment values, hash-to-text callbacks, or a placeholder renderer.

- [ ] **Step 1: Write failing exact-binding and secret-safety tests.**

```ts
it("rejects a cross-run provider posture before the renderer sees text", async () => {
  const render = vi.fn(async () => promptEnvelopeFor("run_a"));
  const capability = createProductionAgentPromptCapability({ authority: mountedAuthority(), renderer: { render }, verifyContext: verifiedContexts });
  await expect(capability.render(exactBinding({ runId: "run_b", providerPosture: postureFor("run_a") })))
    .rejects.toMatchObject({ code: "prompt-binding-invalid" });
  expect(render).not.toHaveBeenCalled();
});

it("does not expose hostile renderer text in diagnostics", async () => {
  const capability = createProductionAgentPromptCapability({ authority: mountedAuthority(), renderer: hostileRenderer("sk-live-secret /private/prompt"), verifyContext: verifiedContexts });
  await expect(capability.render(exactBinding())).rejects.toMatchObject({ code: "prompt-binding-invalid" });
  expect(readCapturedDiagnostics()).not.toContain("sk-live-secret");
});
```

Also reject changed scope/template/parser/context hash/policy, stale approval
posture, unverified context, and unapproved transfer. A successful test checks
the canonical envelope hash/audit metadata but never prints envelope text.

- [ ] **Step 2: Run the focused RED command.**

```bash
npm test -- packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts packages/agent/test/prompt-artifacts.test.ts
```

Expected: FAIL because the production prompt capability is absent; fake
envelopes and no credentials are used.

- [ ] **Step 3: Write the minimal exact-binding adapter.**

```ts
export function createProductionAgentPromptCapability(input: {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly renderer: ProductionPromptRenderer;
  readonly verifyContext: (input: VerifyMountedContextForRunInput) => Promise<VerifiedContextBindingSet>;
}): ProductionPromptCapability {
  return Object.freeze({
    capabilityVersion: "production-agent-prompt.v1",
    workspaceId: input.authority.workspaceId,
    mountInstanceId: input.authority.mountInstanceId,
    render: (binding) => renderVerifiedProductionPrompt({ authority: input.authority, renderer: input.renderer, verifyContext: input.verifyContext, binding })
  });
}
```

`renderVerifiedProductionPrompt` normalizes binding before await, rechecks
authority/context/posture, validates the returned envelope, and maps all
caught failures to `prompt-binding-invalid` or `unexpected-safe-failure` with
a stable safe incident identifier. It never logs or persists `text`.

- [ ] **Step 4: Run the focused GREEN command.**

Run the Step 2 command. Expected: PASS with exact run/posture/context binding,
no placeholder fallback, and no secret-shaped text in public diagnostics.

- [ ] **Step 5: Verify, commit, and stop for review.**

Run `git diff --check`, `npm run factory:check`, and `npm run verify`, record
actual evidence, then:

```bash
git add packages/local-runtime/src/agent-runtime-prompt-renderer.ts packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts docs/agentic/claims/task-133-resident-runtime-prompt-renderer.md
git commit -m "feat: bind production agent prompts exactly"
```

This task performs no remote call and does not modify P configuration.

## Task 134: Production Specialist-Runner Registry

**Files:**

- Create: `packages/local-runtime/src/agent-runtime-specialist-runners.ts`
- Create: `packages/local-runtime/test/agent-runtime-specialist-runners.test.ts`
- Read: CF-1 runner contracts; reviewed Tasks 121–124;
  `packages/agent/src/specialist-runner-kernel.ts`; and
  `packages/agent/src/task-orchestrator.ts`.

**Consumes:** verified authority/context/prompt/provider readiness,
`AgentTaskOrchestratorApprovalReader`, H's handoff capability, L's run-bound
budget/terminal policy, and frozen runner registrations. **Produces:**

```ts
export function createProductionSpecialistRunnerCapability(input: {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly registrations: readonly SpecialistRunnerRegistrationBinding[];
  readonly dispatchVerified: (input: VerifiedSpecialistDispatchInput) => Promise<TaskOrchestratorRunnerDispatchResult>;
}): ProductionSpecialistRunnerCapability;

// Returned API:
dispatch(input: VerifiedSpecialistDispatchInput): Promise<TaskOrchestratorRunnerDispatchResult>;
```

Before delegate execution, the registry verifies same workspace/mount,
resident/task/attempt/run, descriptor hash, runner/version, required context
versions/parser identities, source/projection watermarks, provider posture,
approval/budget/lock, prompt binding, adapter families, store binding, and H's
handoff contract. A response-like object or lifecycle event alone is never
completion proof.

- [ ] **Step 1: Write failing readiness-to-dispatch tests.**

```ts
it("does not dispatch when one required adapter family is absent", async () => {
  const dispatchVerified = vi.fn();
  const runners = createProductionSpecialistRunnerCapability({
    authority: mountedAuthority(),
    registrations: [runnerRegistration({ requiredAdapterFamilies: ["handoff.v1", "missing.v1"] })],
    dispatchVerified
  });
  await expect(runners.dispatch(verifiedDispatch({ adapterFamilies: ["handoff.v1"] })))
    .rejects.toMatchObject({ code: "runner-registration-invalid" });
  expect(dispatchVerified).not.toHaveBeenCalled();
});
```

Add separate failures for stale mount/high-water, altered descriptor/context/
prompt, missing approval, exhausted budget, active lock, unready provider,
absent store proof, and a returned model draft lacking verified H handoff
readback. Assert none emits a terminal completion state.

- [ ] **Step 2: Run the focused RED command.**

```bash
npm test -- packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/agent/test/specialist-runner-kernel.test.ts
```

Expected: FAIL because the production registry is absent and the delegate spy
is uncalled.

- [ ] **Step 3: Write the minimal readiness-validated registry.**

```ts
export function createProductionSpecialistRunnerCapability(input: {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly registrations: readonly SpecialistRunnerRegistrationBinding[];
  readonly dispatchVerified: (input: VerifiedSpecialistDispatchInput) => Promise<TaskOrchestratorRunnerDispatchResult>;
}): ProductionSpecialistRunnerCapability {
  return Object.freeze({
    capabilityVersion: "production-specialist-runner-registry.v1",
    workspaceId: input.authority.workspaceId,
    mountInstanceId: input.authority.mountInstanceId,
    registrations: Object.freeze([...input.registrations]),
    async dispatch(dispatch) {
      await verifySpecialistDispatchReadiness({ authority: input.authority, registrations: input.registrations, dispatch });
      return verifyDurableRunnerResult(await input.dispatchVerified(dispatch), dispatch);
    }
  });
}
```

`verifySpecialistDispatchReadiness` stops before a delegate call.
`verifyDurableRunnerResult` requires H's typed material, manifest, ledger, and
lifecycle readback. Both normalize before await and expose frozen safe codes.

- [ ] **Step 4: Run the focused GREEN command.**

Run the Step 2 command. Expected: PASS; deterministic fakes prove no
lifecycle-only success can replace durable evidence.

- [ ] **Step 5: Verify, commit, and stop for review.**

Run `git diff --check`, `npm run factory:check`, and `npm run verify`; record
actual outputs, then:

```bash
git add packages/local-runtime/src/agent-runtime-specialist-runners.ts packages/local-runtime/test/agent-runtime-specialist-runners.test.ts docs/agentic/claims/task-134-resident-runtime-specialist-runners.md
git commit -m "feat: validate production specialist runner readiness"
```

Do not modify H schemas or W lifecycle code.

## Task 135: Mounted Derivative and Handoff Stores

**Files:**

- Create: `packages/local-runtime/src/mounted-agent-artifact-stores.ts`
- Create: `packages/local-runtime/test/mounted-agent-artifact-stores.test.ts`
- Read: CF-1 storage contracts; reviewed Tasks 121–123 and 125;
  `packages/agent/src/specialist-handoffs.ts`; and
  `packages/agent/src/specialist-handoff-manifest.ts`.

**Consumes:** one `MountedWorkspaceRuntimeAuthority`, mounted derivative
authority, and H's canonical material/manifest parsers and hashes. It never
receives a filesystem path, temporary directory, cache, or generic blob-store
fallback. **Produces:**

```ts
export function createMountedAgentArtifactStores(input: {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly mountedDerivativeStore: MountedDerivativeStoreAuthority;
  readonly materialBackend: MountedHandoffMaterialBackend;
  readonly manifestBackend: MountedHandoffManifestBackend;
}): MountedAgentArtifactStores;
```

The stores expose separate `writeMaterial`/`readMaterialExact` and
`writeManifest`/`readManifestExact` APIs. Receipts have type-specific hash,
size, and authority hash. Manifest write accepts only verified material
readback for the same run/authority; terminal handoff accepts only verified
manifest readback bound to that exact material hash.

- [ ] **Step 1: Write failing persistence-order and no-fallback tests.**

```ts
it("rejects a manifest before verified material readback and never writes a local copy", async () => {
  const backends = mountedStoreBackends({ materialReadback: "mismatched-hash" });
  const stores = createMountedAgentArtifactStores({ authority: mountedAuthority(), ...backends });
  await expect(stores.handoffMaterialStore.writeMaterial(materialWrite()))
    .resolves.toMatchObject({ materialHash: expect.stringMatching(/^sha256:/) });
  await expect(stores.handoffManifestStore.writeManifest(manifestWrite({ materialHash: "sha256:claimed" })))
    .rejects.toMatchObject({ code: "handoff-readback-failed" });
  expect(backends.manifest.write).not.toHaveBeenCalled();
  expect(backends.fallbackWrite).not.toHaveBeenCalled();
});
```

Cover canonical-byte/hash mismatch, swapped receipt, cross-run/mount switch,
absent schema, derivative write without exact readback, backend failure, stale
authority, and plausible returned hash without readback. Every result remains
typed blocked/failed/resumable evidence, never terminal completion.

- [ ] **Step 2: Run the focused RED command.**

```bash
npm test -- packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/agent/test/specialist-handoff-projection.test.ts
```

Expected: FAIL because the adapter is absent; no fallback spy is called.

- [ ] **Step 3: Write distinct mounted adapters.**

```ts
export function createMountedAgentArtifactStores(input: {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly mountedDerivativeStore: MountedDerivativeStoreAuthority;
  readonly materialBackend: MountedHandoffMaterialBackend;
  readonly manifestBackend: MountedHandoffManifestBackend;
}): MountedAgentArtifactStores {
  return Object.freeze({
    storesVersion: "mounted-agent-artifact-stores.v1",
    workspaceId: input.authority.workspaceId,
    mountInstanceId: input.authority.mountInstanceId,
    derivativeStore: createVerifiedMountedDerivativeStore(input),
    handoffMaterialStore: createVerifiedMountedMaterialStore(input),
    handoffManifestStore: createVerifiedMountedManifestStore(input),
    verifyBinding: (binding) => verifyMountedStoreBinding(input.authority, binding)
  });
}
```

Each writer normalizes input before await, rechecks mount/policy/lock, validates
canonical bytes and expected type-specific hash, writes only to mounted
backend, and performs exact readback. The material adapter creates verified
material evidence; manifest requires it and verifies the same material hash.
No error path writes elsewhere.

- [ ] **Step 4: Run the focused GREEN command.**

Run the Step 2 command. Expected: PASS and proves material-before-manifest and
manifest-before-recorded prerequisites with no internal copy.

- [ ] **Step 5: Verify, commit, and stop for review.**

Run `git diff --check`, `npm run factory:check`, and `npm run verify`; record
actual evidence, then:

```bash
git add packages/local-runtime/src/mounted-agent-artifact-stores.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts docs/agentic/claims/task-135-resident-mounted-artifact-stores.md
git commit -m "feat: require mounted agent artifact readback"
```

A persistence/authority mismatch is fail-closed, not permission to change H's
handoff contract.

## Task 140: Runtime Readiness And Factory Composition

**Files:**

- Modify: `packages/local-runtime/src/agent-runtime-factory.ts`
- Create: `packages/local-runtime/test/agent-runtime-composition.test.ts`
- Read: reviewed Tasks 132–139, `packages/local-runtime/src/runtime-factory.ts`,
  `packages/agent/src/runtime-types.ts`, and all CF-1 component contracts.

**Consumes:** reviewed R adapters; L policy/budget; H handoff; W mounted
lifecycle/supervisor; P's sole provider configuration/policy; existing
approval/workflow registries; and `LocalRuntimeHandle`. **Produces:**

```ts
export interface ProductionAgentRuntimeCompositionInput {
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

export function createProductionAgentRuntimeCapabilities(
  input: ProductionAgentRuntimeCompositionInput
): AgentTaskOrchestratorRuntimeCapabilities;
```

`defaultLocalAgentRuntimeFactory` calls this only after portable workspace
mount and `residentIdentity.ready()` prove exact ready `agent_default` for the
same workspace. It validates/freezes all inputs and returns the existing
`agent-task-orchestrator-runtime-capabilities.v1` structure with real mounted
registries. It never constructs SQLite, memory, temporary-file, alternate-
workspace, no-op renderer, or no-op runner fallback capabilities.

- [ ] **Step 1: Write failing composition and readiness tests.**

```ts
it("constructs the sole production factory only from matching mounted capabilities", () => {
  const capabilities = createProductionAgentRuntimeCapabilities(compositionInput({
    mountedAuthority: mountedAuthority({ workspaceId: "ws_a", mountInstanceId: "mount_a" }),
    residentIdentity: readyIdentity({ workspaceId: "ws_a" }),
    contextCapability: mountedContext({ workspaceId: "ws_a", mountInstanceId: "mount_a" }),
    promptCapability: productionPrompt({ workspaceId: "ws_a", mountInstanceId: "mount_a" }),
    runnerCapability: productionRunners({ workspaceId: "ws_a", mountInstanceId: "mount_a" }),
    artifactStores: mountedStores({ workspaceId: "ws_a", mountInstanceId: "mount_a" })
  }));
  expect(capabilities.schemaVersion).toBe("agent-task-orchestrator-runtime-capabilities.v1");
  expect(capabilities.contextRegistry).not.toBe(createContextPackRegistry());
});

it("keeps structural-ready waiting-for-approval non-executable without fallback", () => {
  const readiness = projectProductionRuntimeReadiness(compositionInput({ providerResult: "waiting-for-approval" }));
  expect(readiness.structuralStatus).toBe("ready");
  expect(readiness.providerInvocation.state).toBe("waiting-for-human-approval");
  expect(readiness.executable).toBe(false);
});
```

Add failure injection for absent mount, identity mismatch/not-ready, stale
high-water/policy/lock, invalid context/prompt, unready/blocked/unavailable
provider policy, missing runner registration, mounted-store unavailable,
handoff readback failure, version conflict, and hostile thrown object. Each
test asserts a specification safe category, absence of raw prompt/secret/path/
error data, and no fallback factory/write call.

- [ ] **Step 2: Run the focused RED command.**

```bash
npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts
```

Expected: FAIL because production composition/readiness is absent. Existing
route tests preserve development fail-closed behavior until implementation.

- [ ] **Step 3: Replace only default-factory collaborators after validation.**

```ts
export function createProductionAgentRuntimeCapabilities(
  input: ProductionAgentRuntimeCompositionInput
): AgentTaskOrchestratorRuntimeCapabilities {
  const verified = verifyProductionCompositionInput(input);
  return Object.freeze({
    schemaVersion: "agent-task-orchestrator-runtime-capabilities.v1",
    workflowRegistry: verified.workflowRegistry,
    contextRegistry: verified.contextCapability.registry,
    promptRendererRegistry: { render: verified.promptCapability.render },
    providerRegistry: verified.providerPolicyCapability.providerRegistry,
    providerPolicy: createRunScopedProviderPolicy(verified),
    approvalReader: verified.approvalReader,
    runnerRegistry: { dispatch: verified.runnerCapability.dispatch },
    handoffCapability: verified.handoffCapability
  });
}
```

`verifyProductionCompositionInput` compares exact composition version,
workspace/mount, ready identity, policy/lock/high-water, capability/schema
versions, and registration provenance. It freezes normalized data and maps
failures to the approved safe categories. The adjacent internal
`projectProductionRuntimeReadiness` recomputes structural/component facts and
provider invocation readiness; `executable` is true only with structural
`ready` plus current `ready-to-invoke` requirements. The default factory gets
P/W capabilities through their reviewed APIs and preserves fail-closed
diagnostics when preconditions are unavailable.

- [ ] **Step 4: Run the focused GREEN command.**

Run the Step 2 command. Expected: PASS; normal fixtures wire actual R/P/H/W/L
capabilities and every injected mismatch fails closed with no second factory or
fallback write.

- [ ] **Step 5: Run cross-lane verification, commit, and stop for review.**

After the coordinator records all predecessor SHAs, run:

```bash
npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/agent-runtime-context-packs.test.ts packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts
git diff --check
npm run factory:check
npm run verify
```

Expected: focused suites, full deterministic verifier, UI build, and factory
readiness pass. Then:

```bash
git add packages/local-runtime/src/agent-runtime-factory.ts packages/local-runtime/test/agent-runtime-composition.test.ts docs/agentic/claims/task-140-resident-runtime-composition.md
git commit -m "feat: compose verified production agent runtime"
```

Stop for fresh review/coordinator integration. Do not add a route, UI consumer,
provider configuration change, live call, or merge into `neo`.

## Failure, Rollback, and Real Nous Gate

| Failure category | Deterministic proof | Required result |
| --- | --- | --- |
| `workspace-unavailable` / `mounted-store-unavailable` | Remove/unread one mounted dependency before compose/write. | Stop new work; no local, memory, temp-file, or alternate-workspace copy. |
| `workspace-identity-mismatch` / `resident-identity-not-ready` | Swap workspace/mount or return non-ready identity. | No claim, render, dispatch, transfer, or replacement identity event. |
| `authority-stale-or-unverified` | Advance ledger/policy/lock/source binding between checks. | Reverify or return safe blocked/resumable state. |
| `context-capability-invalid` / `prompt-binding-invalid` | Forge parser/ref/payload/run/scope/template/posture. | Stop before renderer/provider; safe category/action only. |
| `provider-policy-unready` / `runner-registration-invalid` | Missing approval, lock, budget, provider, adapter, or store proof. | `executable: false`; delegate uncalled; no alternate backend. |
| `handoff-readback-failed` | Swap receipt or force exact readback mismatch. | No terminal success/internal copy; retain H typed safe evidence. |
| `composition-version-conflict` / `unexpected-safe-failure` | Incompatible frozen version or hostile throw. | Block with safe code/incident ID; leak no raw value. |

Rollback is forward-only. On an integrated defect the coordinator first stops
new dispatch through non-executable readiness, preserves durable handoff
state, then authorizes a scoped R repair that restores the former fail-closed
factory behavior or corrects the adapter. The repair reruns Task 140 focused
and cross-lane suites, `npm run verify`, and fresh review. It never deletes
durable evidence, writes a shadow store, fabricates terminal handoff, or
switches provider.

Tasks 132–135 and 140 call no Nous service. After reviewed factory and Wave 3
evidence-triage prerequisites merge, the coordinator may run
`npm run agent:nous:smoke` only when P policy selects approved Nous, current
provider-byte-transfer approval/budget/locks/mounted authority pass, and safe
durable output can be read back. Record only provider/model IDs, hashes, event
IDs, counts, categories, and readback markers. Outage, denial/staleness,
budget exhaustion, or readback failure is blocked/resumable—not a synthetic
pass or a reason to try another provider.

## Acceptance Mapping and Self-Review

| Lane R obligation | Implementation proof | Wave 4/release proof |
| --- | --- | --- |
| Mounted restart composition | Tasks 132, 135, and 140 reconstruct only from mounted authority. | A-01 restart and served-checkout release gate. |
| Authoritative context | Task 132 rejects swapped workspace/parser/ref/hash/source/selection/high-water. | A-01 and A-10. |
| Exact prompt/provider | Task 133 binds run/posture/template/context/policy and rejects raw/placeholder paths. | A-03 real Nous when selected; A-10. |
| Runner durability | Task 134 requires readiness and H readback, not lifecycle-only success. | A-03 and A-06. |
| Mounted store readback | Task 135 proves material-before-manifest and manifest-before-recorded. | A-01 and A-10. |
| Runtime readiness | Task 140 derives structural/provider states and blocks partial provenance. | A-03 and A-10. |
| Disconnect/reconnect | R components reject stale/switch inputs and write no fallback while consuming W authority. | A-02. |

- **Spec coverage:** all R design families—mounted context, prompt,
  provider-policy posture, runner, stores, readiness, failures, provenance,
  singular factory, rollback, and later Nous evidence—map to a task and test.
- **Type consistency:** CF-1 consumed contracts are named once; the same
  capability/function signatures are used in Tasks 132–135 and 140.
- **Ownership/parallel safety:** 132–135 have disjoint exact files after named
  dependencies; 140 waits for integrated 132–139. P/H/W/L/U/A ownership is
  preserved.
- **No-placeholder review:** every task has exact files, interfaces, RED and
  GREEN commands, test snippets, full verification, commit scope, review gate,
  and stop condition.
- **Plan stop:** this document authorizes no code. A fresh Task 109 plan review
  and coordinator lane-plan approval are required before an implementation
  child receives its own scoped authorization.
