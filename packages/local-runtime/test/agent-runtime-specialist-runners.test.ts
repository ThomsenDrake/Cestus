import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  createProductionSpecialistRunnerCapability,
  type FactoryClosedSpecialistRunnerBinding,
  type MountedAgentArtifactStores,
  type MountedWorkspaceRuntimeAuthority,
  type ProductionSpecialistRunnerCapability,
  type SpecialistRunnerRegistrationBinding,
  type Task134FrozenRegistrationProvenanceV1,
  type VerifiedSpecialistDispatchInput,
  type VerifiedSpecialistRunnerDispatchResult
} from "../src/agent-runtime-specialist-runners.js";
import {
  dispatchVerifiedTaskRunner,
  type TaskOrchestratorHandoffCapability,
  type TaskOrchestratorRunnerDispatchInput,
  type TaskOrchestratorRunnerRegistry
} from "../../agent/src/task-orchestrator.js";

const publicDispatch = Object.freeze({
  taskId: "task_runtime",
  runType: "evidence-triage" as const,
  attemptId: "attempt_runtime",
  approvedRunId: "run_runtime"
});

describe("production specialist runner capability", () => {
  it("rejects every frozen factory-closure counterfactual before Task134 activity", async () => {
    const cases: readonly RejectBeforeActivityCase[] = [
      {
        id: "forged-caller-stores",
        code: "runner-registration-invalid",
        invoke: async (fixture) => await fixture.registry.dispatch({
          ...publicDispatch,
          artifactStores: fixture.artifactStores
        } as unknown as TaskOrchestratorRunnerDispatchInput)
      },
      {
        id: "incompatible-task-id",
        code: "runner-registration-invalid",
        invoke: async (fixture) => await dispatchVerifiedTaskRunner({
          ...publicDispatch,
          taskId: "task_other",
          verifiedProviderApproval: true,
          verifiedContextBindings: true,
          registry: fixture.registry
        })
      },
      {
        id: "incompatible-run-type",
        code: "runner-registration-invalid",
        invoke: async (fixture) => await dispatchVerifiedTaskRunner({
          ...publicDispatch,
          runType: "investigation-planner",
          verifiedProviderApproval: true,
          verifiedContextBindings: true,
          registry: fixture.registry
        })
      },
      {
        id: "incompatible-attempt-id",
        code: "runner-registration-invalid",
        invoke: async (fixture) => await dispatchVerifiedTaskRunner({
          ...publicDispatch,
          attemptId: "attempt_other",
          verifiedProviderApproval: true,
          verifiedContextBindings: true,
          registry: fixture.registry
        })
      },
      {
        id: "incompatible-approved-run-id",
        code: "runner-registration-invalid",
        invoke: async (fixture) => await dispatchVerifiedTaskRunner({
          ...publicDispatch,
          approvedRunId: "run_other",
          verifiedProviderApproval: true,
          verifiedContextBindings: true,
          registry: fixture.registry
        })
      }
    ];

    for (const testCase of cases) {
      const fixture = testCase.createFixture?.() ?? createTask134RejectBeforeActivityFixture();
      await expect(testCase.invoke(fixture)).rejects.toMatchObject({ code: testCase.code });
      expect(fixture.readRejectBeforeActivityCounters()).toEqual([
        ["delegate", 0],
        ["handoff-prepare", 0],
        ["handoff-readback", 0],
        ["mounted-material-trace", 0],
        ["mounted-manifest-trace", 0],
        ["fallback-write", 0]
      ]);
    }

    const counters = new Map<string, number>([
      ["delegate", 0],
      ["handoff-prepare", 0],
      ["handoff-readback", 0],
      ["mounted-material-trace", 0],
      ["mounted-manifest-trace", 0],
      ["fallback-write", 0]
    ]);
    expect(() => createTask134RejectBeforeActivityFixture({ swappedStore: true, counters }))
      .toThrow(expect.objectContaining({ code: "workspace-identity-mismatch" }));
    expect(readCounters(counters)).toEqual([
      ["delegate", 0],
      ["handoff-prepare", 0],
      ["handoff-readback", 0],
      ["mounted-material-trace", 0],
      ["mounted-manifest-trace", 0],
      ["fallback-write", 0]
    ]);

    expect(() => createTask134RejectBeforeActivityFixture({ registered: false, counters }))
      .toThrow(expect.objectContaining({ code: "runner-registration-invalid" }));
    expect(readCounters(counters)).toEqual([
      ["delegate", 0],
      ["handoff-prepare", 0],
      ["handoff-readback", 0],
      ["mounted-material-trace", 0],
      ["mounted-manifest-trace", 0],
      ["fallback-write", 0]
    ]);
  });

  it("dispatches only the test-only factory-closed tuple through the public orchestrator caller", async () => {
    const fixture = createTask134RejectBeforeActivityFixture();

    await dispatchVerifiedTaskRunner({
      ...publicDispatch,
      verifiedProviderApproval: true,
      verifiedContextBindings: true,
      registry: fixture.registry
    });

    expect(fixture.dispatchVerified).toHaveBeenCalledTimes(1);
    expect(fixture.dispatchVerified).toHaveBeenCalledWith(expect.objectContaining({
      authority: expect.objectContaining({ workspaceId: fixture.authority.workspaceId }),
      artifactStores: expect.objectContaining({ workspaceId: fixture.artifactStores.workspaceId }),
      registration: expect.objectContaining({ runnerId: fixture.registration.runnerId }),
      registrationProvenance: expect.objectContaining({ runnerId: fixture.registrationProvenance.runnerId }),
      handoffCapability: expect.any(Object)
    }));
    expect(fixture.readRejectBeforeActivityCounters()).toEqual([
      ["delegate", 1],
      ["handoff-prepare", 0],
      ["handoff-readback", 1],
      ["mounted-material-trace", 1],
      ["mounted-manifest-trace", 1],
      ["fallback-write", 0]
    ]);
  });

  it("rejects stale readiness, descriptor/context/prompt mismatch, admission blockers, and absent store proof before delegate", async () => {
    const cases: readonly Partial<VerifiedSpecialistDispatchInput["readiness"]>[] = [
      { authorityHighWaterMark: 41 },
      { workflowDescriptorHash: "sha256:descriptor_other" },
      { contextBindingHash: "sha256:context_other" },
      { promptBindingHash: "sha256:prompt_other" },
      { approvalVerified: false },
      { budgetAvailable: false },
      { activeLock: true },
      { providerReady: false },
      { storeBindingVerified: false }
    ];

    for (const readiness of cases) {
      const counters = new Map<string, number>([
        ["delegate", 0],
        ["handoff-prepare", 0],
        ["handoff-readback", 0],
        ["mounted-material-trace", 0],
        ["mounted-manifest-trace", 0],
        ["fallback-write", 0]
      ]);
      expect(() => createTask134RejectBeforeActivityFixture({ readiness, counters }))
        .toThrow(expect.objectContaining({ code: "runner-registration-invalid" }));
      expect(readCounters(counters)).toEqual([
        ["delegate", 0],
        ["handoff-prepare", 0],
        ["handoff-readback", 0],
        ["mounted-material-trace", 0],
        ["mounted-manifest-trace", 0],
        ["fallback-write", 0]
      ]);
    }
  });

  it("rejects a lifecycle-shaped delegate result that lacks typed durable H readback", async () => {
    const fixture = createTask134RejectBeforeActivityFixture({ result: "lifecycle-only" });

    await expect(dispatchVerifiedTaskRunner({
      ...publicDispatch,
      verifiedProviderApproval: true,
      verifiedContextBindings: true,
      registry: fixture.registry
    })).rejects.toMatchObject({ code: "handoff-readback-failed" });
    expect(fixture.readRejectBeforeActivityCounters()).toEqual([
      ["delegate", 1],
      ["handoff-prepare", 0],
      ["handoff-readback", 0],
      ["mounted-material-trace", 0],
      ["mounted-manifest-trace", 0],
      ["fallback-write", 0]
    ]);
  });

  it("retains the normalized public dispatch snapshot when store verification awaits", async () => {
    const fixture = createTask134RejectBeforeActivityFixture({ holdStoreVerification: true });
    const mutableDispatch: {
      taskId: string;
      runType: TaskOrchestratorRunnerDispatchInput["runType"];
      attemptId: string;
      approvedRunId: string;
    } = { ...publicDispatch };
    const pending = fixture.capability.dispatch(mutableDispatch);

    await fixture.waitForStoreVerification();
    mutableDispatch.taskId = "task_swapped_after_await";
    fixture.releaseStoreVerification();
    await expect(pending).resolves.toEqual(expect.objectContaining({ durableHandoff: expect.any(Object) }));

    expect(fixture.dispatchVerified).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task_runtime" }));
    expect(fixture.readRejectBeforeActivityCounters()).toEqual([
      ["delegate", 1],
      ["handoff-prepare", 0],
      ["handoff-readback", 1],
      ["mounted-material-trace", 1],
      ["mounted-manifest-trace", 1],
      ["fallback-write", 0]
    ]);
  });

  it("requires the actual injected H readback instead of a delegate-supplied readback shape", async () => {
    const fixture = createTask134RejectBeforeActivityFixture({ handoffReadbackResult: "forged" });

    await expect(fixture.capability.dispatch(publicDispatch)).rejects.toMatchObject({ code: "handoff-readback-failed" });
    expect(fixture.readRejectBeforeActivityCounters()).toEqual([
      ["delegate", 1],
      ["handoff-prepare", 0],
      ["handoff-readback", 1],
      ["mounted-material-trace", 1],
      ["mounted-manifest-trace", 1],
      ["fallback-write", 0]
    ]);
  });

  it("rejects a direct counterfeit tuple before store verification or delegation", async () => {
    const fixture = createTask134RejectBeforeActivityFixture();

    await expect(fixture.capability.dispatch({
      ...publicDispatch,
      artifactStores: fixture.artifactStores,
      registrationProvenance: fixture.registrationProvenance,
      handoffCapability: fixture.handoffCapability
    } as unknown as TaskOrchestratorRunnerDispatchInput)).rejects.toMatchObject({ code: "runner-registration-invalid" });
    expect(fixture.readRejectBeforeActivityCounters()).toEqual([
      ["delegate", 0],
      ["handoff-prepare", 0],
      ["handoff-readback", 0],
      ["mounted-material-trace", 0],
      ["mounted-manifest-trace", 0],
      ["fallback-write", 0]
    ]);
  });
});

interface Task134FrozenRegistrationProvenanceInput extends Task134FrozenRegistrationProvenanceV1 {}

interface Task134FactoryClosedDispatchFixtureV1 {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly artifactStores: MountedAgentArtifactStores;
  readonly registration: SpecialistRunnerRegistrationBinding;
  readonly registrationProvenance: Task134FrozenRegistrationProvenanceInput;
  readonly handoffCapability: TaskOrchestratorHandoffCapability;
  readonly capability: ProductionSpecialistRunnerCapability;
  readonly registry: TaskOrchestratorRunnerRegistry;
  readonly dispatchVerified: ReturnType<typeof vi.fn>;
  waitForStoreVerification(): Promise<void>;
  releaseStoreVerification(): void;
  readRejectBeforeActivityCounters(): readonly (readonly [string, number])[];
}

interface RejectBeforeActivityCase {
  readonly id: string;
  readonly code: "runner-registration-invalid" | "workspace-identity-mismatch";
  readonly createFixture?: () => Task134FactoryClosedDispatchFixtureV1;
  readonly invoke: (fixture: Task134FactoryClosedDispatchFixtureV1) => Promise<unknown>;
}

function createTask134RejectBeforeActivityFixture(options: {
  readonly registered?: boolean;
  readonly swappedStore?: boolean;
  readonly expected?: Partial<Pick<TaskOrchestratorRunnerDispatchInput, "taskId" | "runType" | "attemptId" | "approvedRunId">>;
  readonly readiness?: Partial<VerifiedSpecialistDispatchInput["readiness"]>;
  readonly result?: "durable" | "lifecycle-only";
  readonly holdStoreVerification?: boolean;
  readonly handoffReadbackResult?: "valid" | "forged";
  readonly counters?: Map<string, number>;
} = {}): Task134FactoryClosedDispatchFixtureV1 {
  const counters = options.counters ?? new Map<string, number>([
    ["delegate", 0],
    ["handoff-prepare", 0],
    ["handoff-readback", 0],
    ["mounted-material-trace", 0],
    ["mounted-manifest-trace", 0],
    ["fallback-write", 0]
  ]);
  const authority = mountedAuthority();
  const storeVerification = deferred<void>();
  const artifactStores = mountedStores(authority, counters, options.swappedStore === true, {
    hold: options.holdStoreVerification === true ? storeVerification : undefined
  });
  const registration = runnerRegistration();
  const registrationProvenance = registrationProvenanceFor(registration);
  const handoffCapability = handoffCapabilityFor(counters, options.handoffReadbackResult ?? "valid");
  const expected = Object.freeze({ ...publicDispatch, ...options.expected });
  const dispatchVerified = vi.fn(async (input: VerifiedSpecialistDispatchInput): Promise<VerifiedSpecialistRunnerDispatchResult> => {
    increment(counters, "delegate");
    if (options.result === "lifecycle-only") {
      return Object.freeze({}) as unknown as VerifiedSpecialistRunnerDispatchResult;
    }
    increment(counters, "mounted-material-trace");
    increment(counters, "mounted-manifest-trace");
    return durableRunnerResult(input);
  });
  const closedBinding: FactoryClosedSpecialistRunnerBinding = Object.freeze({
    bindingVersion: "task134-factory-closed-specialist-runner.v1",
    artifactStores,
    registration,
    registrationProvenance,
    handoffCapability,
    readiness: closedReadiness(authority, registration, expected, options.readiness)
  });
  const capability = createProductionSpecialistRunnerCapability({
    authority,
    registrations: options.registered === false ? [runnerRegistration({ runnerId: "other-runner" })] : [registration],
    closedBinding,
    dispatchVerified
  });

  if (artifactStores.workspaceId !== authority.workspaceId || artifactStores.mountInstanceId !== authority.mountInstanceId) {
    throw Object.freeze({ code: "workspace-identity-mismatch" });
  }

  const registry: TaskOrchestratorRunnerRegistry = Object.freeze({
    async dispatch(input: TaskOrchestratorRunnerDispatchInput) {
      if (!hasOnlyPublicDispatchFields(input)) {
        throw Object.freeze({ code: "runner-registration-invalid" });
      }
      return await capability.dispatch(input);
    }
  });

  return Object.freeze({
    authority,
    artifactStores,
    registration,
    registrationProvenance,
    handoffCapability,
    capability,
    registry,
    dispatchVerified,
    waitForStoreVerification: async () => await storeVerification.started,
    releaseStoreVerification: () => storeVerification.release(undefined),
    readRejectBeforeActivityCounters: () => readCounters(counters)
  });
}

async function dispatchClosedFixture(
  capability: ProductionSpecialistRunnerCapability,
  input: {
    readonly input: TaskOrchestratorRunnerDispatchInput;
    readonly expected: TaskOrchestratorRunnerDispatchInput;
    readonly authority: MountedWorkspaceRuntimeAuthority;
    readonly artifactStores: MountedAgentArtifactStores;
    readonly registration: SpecialistRunnerRegistrationBinding;
    readonly registrationProvenance: Task134FrozenRegistrationProvenanceInput;
    readonly handoffCapability: TaskOrchestratorHandoffCapability;
    readonly readiness?: Partial<VerifiedSpecialistDispatchInput["readiness"]>;
  }
) {
  const readiness = Object.freeze({
    residentAgentId: "agent_default" as const,
    workspaceId: input.authority.workspaceId,
    mountInstanceId: input.authority.mountInstanceId,
    expectedTaskId: input.expected.taskId,
    expectedRunType: input.expected.runType,
    expectedAttemptId: input.expected.attemptId,
    expectedRunId: input.expected.approvedRunId,
    authorityHighWaterMark: input.authority.ledgerHighWaterMark,
    workflowDescriptorHash: input.registration.workflowDescriptorHash,
    expectedContextBindingHash: "sha256:context_runtime" as const,
    contextBindingHash: "sha256:context_runtime" as const,
    expectedPromptBindingHash: "sha256:prompt_runtime" as const,
    promptBindingHash: "sha256:prompt_runtime" as const,
    approvalVerified: true,
    budgetAvailable: true,
    activeLock: false,
    providerReady: true,
    storeBindingVerified: true,
    adapterFamilies: Object.freeze([...input.registration.requiredAdapterFamilies]),
    ...input.readiness
  });
  return await capability.dispatch(Object.freeze({
    ...input.input,
    authority: input.authority,
    artifactStores: input.artifactStores,
    registration: input.registration,
    registrationProvenance: input.registrationProvenance,
    handoffCapability: input.handoffCapability,
    readiness
  }));
}

function mountedAuthority(): MountedWorkspaceRuntimeAuthority {
  return Object.freeze({
    authorityVersion: "mounted-workspace-runtime-authority.v1" as const,
    workspaceId: "ws_runtime",
    mountInstanceId: "mount_runtime",
    ledgerHighWaterMark: 42
  });
}

function mountedStores(
  authority: MountedWorkspaceRuntimeAuthority,
  counters: Map<string, number>,
  swapped: boolean,
  options: { readonly hold?: Deferred<void> | undefined }
): MountedAgentArtifactStores {
  return Object.freeze({
    storesVersion: "mounted-agent-artifact-stores.v1" as const,
    workspaceId: swapped ? "ws_other" : authority.workspaceId,
    mountInstanceId: swapped ? "mount_other" : authority.mountInstanceId,
    async verifyBinding() {
      if (options.hold !== undefined) {
        options.hold.startedResolve();
        await options.hold.released;
      }
      return Object.freeze({
        bindingVersion: "mounted-store-binding-readback.v1" as const,
        workspaceId: authority.workspaceId,
        mountInstanceId: authority.mountInstanceId,
        verified: true
      });
    },
    materialTrace() {
      increment(counters, "mounted-material-trace");
    },
    manifestTrace() {
      increment(counters, "mounted-manifest-trace");
    }
  });
}

function runnerRegistration(overrides: Partial<SpecialistRunnerRegistrationBinding> = {}): SpecialistRunnerRegistrationBinding {
  return Object.freeze({
    runType: "evidence-triage" as const,
    runnerId: "evidence-triage-runner",
    runnerVersion: 1,
    workflowDescriptorHash: "sha256:descriptor_runtime" as const,
    requiredContextPackIds: Object.freeze(["workspace-overview.v1"]),
    promptTemplateId: "evidence-triage.v1",
    providerPolicyVersion: "provider-policy.v1",
    handoffSchemaVersion: "specialist-handoff.v1",
    requiredAdapterFamilies: Object.freeze(["handoff.v1"]),
    ...overrides
  });
}

function registrationProvenanceFor(registration: SpecialistRunnerRegistrationBinding): Task134FrozenRegistrationProvenanceInput {
  return Object.freeze({
    runnerId: registration.runnerId,
    runnerVersion: registration.runnerVersion,
    workflowDescriptorHash: registration.workflowDescriptorHash
  });
}

function handoffCapabilityFor(
  counters: Map<string, number>,
  readbackResult: "valid" | "forged"
): TaskOrchestratorHandoffCapability {
  return Object.freeze({
    async prepare() {
      increment(counters, "handoff-prepare");
      throw new Error("Task134 fixture never prepares a handoff directly.");
    },
    async bind() {
      throw new Error("Task134 fixture never binds a handoff directly.");
    },
    async readback(input: Parameters<TaskOrchestratorHandoffCapability["readback"]>[0]) {
      increment(counters, "handoff-readback");
      if (readbackResult === "forged") {
        return Object.freeze({ ...input.recorded }) as never;
      }
      return input.recorded;
    }
  });
}

function durableRunnerResult(input: VerifiedSpecialistDispatchInput): VerifiedSpecialistRunnerDispatchResult {
  const materialStore = Object.freeze({
    async put() {
      return Object.freeze({ contentHash: "sha256:material_runtime" as const, sizeBytes: 1 });
    },
    async get() {
      return Buffer.from("material");
    }
  });
  const manifestStore = Object.freeze({
    async put() {
      return Object.freeze({ contentHash: "sha256:manifest_runtime" as const, sizeBytes: 1 });
    },
    async get() {
      return Buffer.from("manifest");
    }
  });
  const recorded = Object.freeze({
    manifest: Object.freeze({}) as never,
    handoff: Object.freeze({}) as never,
    prepared: Object.freeze({}) as never,
    recorded: Object.freeze({ payload: Object.freeze({ runId: input.approvedRunId }) }) as never,
    manifestStore
  });
  return Object.freeze({
    durableHandoff: Object.freeze({
      runId: input.approvedRunId,
      taskId: input.taskId,
      materialStore,
      manifestStore,
      handoffMaterial: Object.freeze({}) as never
    }),
    handoffReadbackInput: Object.freeze({
      claim: Object.freeze({ payload: Object.freeze({ taskId: input.taskId }) }) as never,
      recorded,
      expectedRunId: input.approvedRunId
    })
  });
}

function closedReadiness(
  authority: MountedWorkspaceRuntimeAuthority,
  registration: SpecialistRunnerRegistrationBinding,
  expected: TaskOrchestratorRunnerDispatchInput,
  overrides: Partial<VerifiedSpecialistDispatchInput["readiness"]> | undefined
) {
  return Object.freeze({
    residentAgentId: "agent_default" as const,
    workspaceId: authority.workspaceId,
    mountInstanceId: authority.mountInstanceId,
    expectedTaskId: expected.taskId,
    expectedRunType: expected.runType,
    expectedAttemptId: expected.attemptId,
    expectedRunId: expected.approvedRunId,
    authorityHighWaterMark: authority.ledgerHighWaterMark,
    workflowDescriptorHash: registration.workflowDescriptorHash,
    expectedContextBindingHash: "sha256:context_runtime" as const,
    contextBindingHash: "sha256:context_runtime" as const,
    expectedPromptBindingHash: "sha256:prompt_runtime" as const,
    promptBindingHash: "sha256:prompt_runtime" as const,
    approvalVerified: true,
    budgetAvailable: true,
    activeLock: false,
    providerReady: true,
    storeBindingVerified: true,
    adapterFamilies: Object.freeze([...registration.requiredAdapterFamilies]),
    ...overrides
  });
}

interface Deferred<Value> {
  readonly started: Promise<void>;
  readonly released: Promise<Value>;
  startedResolve(): void;
  release(value: Value): void;
}

function deferred<Value>(): Deferred<Value> {
  let startedResolve: () => void = () => {};
  let release: (value: Value) => void = () => {};
  const started = new Promise<void>((resolve) => {
    startedResolve = resolve;
  });
  const released = new Promise<Value>((resolve) => {
    release = resolve;
  });
  return Object.freeze({ started, released, startedResolve, release });
}

function hasOnlyPublicDispatchFields(value: TaskOrchestratorRunnerDispatchInput): boolean {
  return Object.keys(value).sort().join(",") === "approvedRunId,attemptId,runType,taskId";
}

function increment(counters: Map<string, number>, key: string): void {
  counters.set(key, (counters.get(key) ?? 0) + 1);
}

function readCounters(counters: Map<string, number>): readonly (readonly [string, number])[] {
  return Object.freeze([
    ["delegate", counters.get("delegate") ?? 0] as const,
    ["handoff-prepare", counters.get("handoff-prepare") ?? 0] as const,
    ["handoff-readback", counters.get("handoff-readback") ?? 0] as const,
    ["mounted-material-trace", counters.get("mounted-material-trace") ?? 0] as const,
    ["mounted-manifest-trace", counters.get("mounted-manifest-trace") ?? 0] as const,
    ["fallback-write", counters.get("fallback-write") ?? 0] as const
  ]);
}
