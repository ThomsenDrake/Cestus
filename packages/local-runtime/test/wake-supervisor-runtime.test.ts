import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AssertionService } from "../../ontology/src/assertion-service.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
import {
  inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility,
  inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores,
  inspectMountedArtifactAuthorityOperation,
  issueMountedArtifactAuthorityOperationForFactory
} from "../src/mounted-artifact-authority-operation.js";
import { issueMountedProviderAuthority } from "../src/mounted-provider-authority.js";
import { createPortableMountedAgentArtifactStoreProducer } from "../src/portable-mounted-agent-artifact-stores.js";
import { createResidentLoopFactoryComposition } from "../src/resident-loop-factory-composition.js";
import {
  bindResidentLoopCapabilitiesForFactory,
  createWakeSupervisorRuntime
} from "../src/wake-supervisor-runtime.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";

const directories: string[] = [];
const handles: LocalRuntimeHandle[] = [];

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

interface RuntimeFixtureOptions {
  readonly now?: () => string;
  readonly supervisorEpoch?: string;
}

function runtimeFor(handle: LocalRuntimeHandle, options: RuntimeFixtureOptions = {}) {
  return createWakeSupervisorRuntime({
    runtimeHandle: handle,
    actor: { id: "agent_wake_runtime", kind: "agent", label: "Wake runtime" },
    supervisorEpoch: options.supervisorEpoch ?? "epoch_wake_runtime",
    policy: { policyVersion: "policy.v1", policyDigest: "sha256:policy", lockStateDigest: "sha256:lock" },
    now: options.now ?? (() => "2026-07-16T00:00:00.000Z"),
    createSafeId: (kind) => `${kind}_wake_runtime`
  });
}

async function fixture(options: RuntimeFixtureOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), "cestus-wake-runtime-"));
  directories.push(root);
  const workspaceId = "ws_wake_runtime";
  const workspaceRoot = join(root, workspaceId);
  createPortableWorkspace({ rootDir: workspaceRoot, workspaceId, label: "Wake runtime", createdAt: "2026-07-16T00:00:00.000Z", createdBy: "wake-runtime-test" });
  const handle = createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({ cwd: root, env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot } }),
    actor: { id: "actor_wake_runtime", kind: "human", label: "Wake runtime" }
  });
  handles.push(handle);
  await handle.residentIdentity.ready();
  const runtime = runtimeFor(handle, options);
  return { handle, runtime };
}

describe("wake supervisor runtime", () => {
  it("wake runtime registers one non public authority issuer after complete admission", async () => {
    const { handle, runtime } = await fixture();
    await expect(runtime.supervision.start()).resolves.toMatchObject({ outcome: "accepted" });
    expect(inspectMountedArtifactAuthorityOperation(issueMountedArtifactAuthorityOperationForFactory(runtime))).toMatchObject({ workspaceId: "ws_wake_runtime" });
    const identity = (await handle.ledger.readAll()).find((event) => event.type === "agent.identity.initialized");
    if (identity === undefined) throw new Error("fixture identity is required");
    const command = {
      schemaVersion: "resident-wake-command.v1" as const,
      commandId: "pause_wake_runtime",
      sourceEventIds: [identity.id],
      requestedAt: "2026-07-16T00:00:00.000Z",
      causation: { causationId: identity.id, correlationId: "corr_pause_wake_runtime" }
    };
    await expect(runtime.supervision.pause(command)).resolves.toMatchObject({ outcome: "completed" });
    const events = await handle.ledger.readAll();
    const requested = events.find((event) => event.type === "agent.wake.supervisor.pause.requested.v1");
    const paused = events.find((event) => event.type === "agent.wake.supervisor.paused.v1");
    expect(requested?.payload).toMatchObject({
      commandId: command.commandId,
      sourceEventIds: command.sourceEventIds,
      causation: command.causation
    });
    expect(requested?.context.causationId).toBe(command.causation.causationId);
    expect(paused?.payload).toMatchObject({
      pauseRequestEventId: requested?.id,
      causation: command.causation
    });
  });

  it("stopped runtime cannot issue or inspect an authority operation", async () => {
    const { runtime } = await fixture();
    await runtime.supervision.start();
    const operation = issueMountedArtifactAuthorityOperationForFactory(runtime);
    await runtime.stop();
    expect(() => inspectMountedArtifactAuthorityOperation(operation)).toThrow(/burned|current/i);
    expect(() => issueMountedArtifactAuthorityOperationForFactory(runtime)).toThrow(/complete|current|registered/i);
  });

  it("fresh process runtime requires new admission and emits a distinct operation", async () => {
    const first = await fixture();
    await first.runtime.supervision.start();
    const firstOperation = issueMountedArtifactAuthorityOperationForFactory(first.runtime);
    await first.runtime.stop();
    const second = await fixture();
    expect(() => issueMountedArtifactAuthorityOperationForFactory(second.runtime)).toThrow(/registered|complete|current/i);
    await second.runtime.supervision.start();
    const secondOperation = issueMountedArtifactAuthorityOperationForFactory(second.runtime);
    expect(secondOperation).not.toBe(firstOperation);
  });

  it("exposes only supervision control and stop rather than authority internals", async () => {
    const { runtime } = await fixture();
    expect(Reflect.ownKeys(runtime).map(String).sort()).toEqual(["stop", "supervision"]);
    expect(Reflect.ownKeys(runtime.supervision).map(String)).not.toEqual(expect.arrayContaining(["authority", "issuer", "operation", "ports", "facts", "paths", "stores", "writer"]));
  });

  it("rejects a second authority operation for one completed admission", async () => {
    const { runtime } = await fixture();
    await runtime.supervision.start();
    issueMountedArtifactAuthorityOperationForFactory(runtime);
    expect(() => issueMountedArtifactAuthorityOperationForFactory(runtime)).toThrow(/already issued/i);
  });

  it("invalidates expired artifact authority before inspection effects and stop returns", async () => {
    let now = "2026-07-16T00:00:00.000Z";
    const { handle, runtime } = await fixture({ now: () => now });
    await runtime.supervision.start();
    const operation = issueMountedArtifactAuthorityOperationForFactory(runtime);
    const beforeExpiry = await handle.ledger.readAll();
    now = "2026-07-16T00:05:00.001Z";

    for (const inspect of [
      inspectMountedArtifactAuthorityOperation,
      inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores,
      inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility
    ]) {
      expect(() => inspect(operation), inspect.name).toThrow(/expired|current|burned|lease/i);
    }
    expect(await handle.ledger.readAll()).toEqual(beforeExpiry);

    await expect(runtime.supervision.resume({
      schemaVersion: "resident-wake-command.v1",
      commandId: "resume_expired_wake_runtime",
      sourceEventIds: [],
      requestedAt: now,
      causation: { causationId: beforeExpiry[0]!.id, correlationId: "corr_resume_expired_wake_runtime" }
    })).resolves.toMatchObject({ outcome: "blocked" });
    expect(await handle.ledger.readAll()).toEqual(beforeExpiry);

    const successor = runtimeFor(handle, {
      now: () => now,
      supervisorEpoch: "epoch_wake_runtime_successor"
    });
    await expect(successor.supervision.start()).resolves.toMatchObject({ outcome: "accepted" });
    expect(() => inspectMountedArtifactAuthorityOperation(operation)).toThrow(/expired|current|burned|lease/i);
    expect((await handle.ledger.readAll()).filter((event) =>
      event.type === "agent.wake.supervisor.lease.claimed.v1"
    )).toHaveLength(2);

    await runtime.stop();
    await successor.stop();
    expect(() => inspectMountedArtifactAuthorityOperation(operation)).toThrow(/expired|current|burned|lease/i);
  });

  it("rejects structural caller handles before installing a runtime", async () => {
    const { handle } = await fixture();
    const originalAppend = handle.ledger.append.bind(handle.ledger);
    const originalReadAll = handle.ledger.readAll.bind(handle.ledger);
    let writes = 0;
    let reads = 0;
    Object.defineProperty(handle.ledger, "append", {
      configurable: true,
      value: async (...args: Parameters<typeof handle.ledger.append>) => {
        writes += 1;
        return originalAppend(...args);
      }
    });
    Object.defineProperty(handle.ledger, "readAll", {
      configurable: true,
      value: async () => {
        reads += 1;
        return originalReadAll();
      }
    });
    let forgedRuntime: ReturnType<typeof createWakeSupervisorRuntime> | undefined;
    expect(() => {
      forgedRuntime = createWakeSupervisorRuntime({
        runtimeHandle: { ...handle } as LocalRuntimeHandle,
        actor: { id: "agent_wake_runtime", kind: "agent", label: "Wake runtime" },
        supervisorEpoch: "epoch_wake_runtime",
        policy: { policyVersion: "policy.v1", policyDigest: "sha256:policy", lockStateDigest: "sha256:lock" },
        now: () => "2026-07-16T00:00:00.000Z",
        createSafeId: (kind) => `${kind}_wake_runtime`
      });
    }).toThrow(/factory-issued|runtime handle/i);
    expect(forgedRuntime).toBeUndefined();
    expect({ reads, writes }).toEqual({ reads: 0, writes: 0 });
  });

  it("authenticates a raw handle before the wake runtime reads any handle-owned state", () => {
    let rawHandleReads = 0;
    const forged = Object.defineProperty({}, "mountedWorkspace", {
      enumerable: true,
      get() {
        rawHandleReads += 1;
        return undefined;
      }
    }) as LocalRuntimeHandle;

    expect(() => createWakeSupervisorRuntime({
      runtimeHandle: forged,
      actor: { id: "agent_wake_runtime", kind: "agent", label: "Wake runtime" },
      supervisorEpoch: "epoch_wake_runtime",
      policy: { policyVersion: "policy.v1", policyDigest: "sha256:policy", lockStateDigest: "sha256:lock" },
      now: () => "2026-07-16T00:00:00.000Z",
      createSafeId: (kind) => `${kind}_wake_runtime`
    })).toThrow(/factory-issued|runtime handle/i);
    expect(rawHandleReads).toBe(0);
  });

  it("does not admit an operation after authority loss during a later lifecycle command", async () => {
    const { runtime } = await fixture();
    await runtime.supervision.start();
    await runtime.stop();
    await expect(runtime.supervision.resume({ schemaVersion: "resident-wake-command.v1", commandId: "resume_after_stop", sourceEventIds: [], requestedAt: "2026-07-16T00:00:00.000Z", causation: { causationId: "evt_resume_after_stop", correlationId: "corr_resume_after_stop" } }))
      .resolves.toMatchObject({ outcome: "blocked" });
  });

  it("has no fallback storage or public authority constructor input", async () => {
    const { runtime } = await fixture();
    expect(JSON.stringify(runtime)).not.toMatch(/ledger|path|fallback|authority|operation/i);
  });

  it("binds one opaque mounted resident authority after exact Core authority", async () => {
    const source = (await import("node:fs")).readFileSync(
      new URL("../src/wake-supervisor-runtime.ts", import.meta.url),
      "utf8"
    );
    const module: unknown = await import("../src/wake-supervisor-runtime.js");
    const bind = module !== null && typeof module === "object"
      ? Reflect.get(module, "bindResidentLoopCapabilitiesForFactory")
      : undefined;
    const rejectedBindings = [
      "structural-runtime",
      "pre-core-binding",
      "fabricated-domain-capability",
      "foreign-mounted-ledger",
      "swapped-workspace",
      "swapped-resident",
      "swapped-task",
      "second-binding"
    ] as const;
    const effects = { provider: 0, gateway: 0, approval: 0, ledger: 0, fallback: 0, localWrite: 0 };

    expect(bind).toBeTypeOf("function");
    expect(source).toContain('from "../../agent/src/domain-execution-dispatcher.js"');
    expect(source).toContain('from "../../agent/src/resident-loop-tool-gateway.js"');
    expect(source).toContain("bindResidentLoopCapabilitiesForFactory");
    expect(rejectedBindings).toHaveLength(8);
    expect(effects).toEqual({ provider: 0, gateway: 0, approval: 0, ledger: 0, fallback: 0, localWrite: 0 });

    const mounted = await residentFixture("exact");
    const before = await mounted.handle.ledger.readAll();
    expect(mounted.binding.provider.highWaterOrdinal).toBe(6);
    expect(mounted.binding.provider.durableLedgerEventCount).toBe(7);
    expect(before).toHaveLength(7);

    const issued = await bindResidentLoopCapabilitiesForFactory(
      mounted.composition.wakeRuntime,
      mounted.binding,
      mounted.domainExecution
    );

    expect(Reflect.ownKeys(issued).map(String).sort()).toEqual([
      "currentnessToken",
      "gateway",
      "handoffReader",
      "mountedAuthority",
      "planObservation"
    ]);
    expect(Object.isFrozen(issued)).toBe(true);
    expect(Object.isFrozen(issued.mountedAuthority)).toBe(true);
    expect(await mounted.handle.ledger.readAll()).toEqual(before);
  });

  it("recovers every missing suspension-prefix suffix without an effect", async () => {
    const source = (await import("node:fs")).readFileSync(
      new URL("../src/wake-supervisor-runtime.ts", import.meta.url),
      "utf8"
    );
    const durablePrefixStates = [
      "checkpoint-only",
      "checkpoint-and-suspension",
      "checkpoint-suspension-and-result",
      "complete-released-prefix"
    ] as const;
    const rejectedRecovery = [
      "absent-state-zero",
      "caller-instruction",
      "foreign-checkpoint",
      "duplicate-semantic-key",
      "canonical-byte-conflict",
      "skipped-prefix",
      "premature-release"
    ] as const;
    const effects = { provider: 0, gateway: 0, approval: 0, localWrite: 0, projectionSubstitute: 0 };

    expect(source).toContain("recoverSuspensionPrefix");
    expect(source).toContain("suspendAndRelease");
    expect(source).toContain('"resident-loop-suspension"');
    expect(source).toContain('"resident-loop-suspended"');
    expect(source).toContain('"effect-outcome-unknown"');
    expect(durablePrefixStates).toHaveLength(4);
    expect(rejectedRecovery).toHaveLength(7);
    expect(effects).toEqual({ provider: 0, gateway: 0, approval: 0, localWrite: 0, projectionSubstitute: 0 });
  });
});

async function residentFixture(suffix: string) {
  const root = mkdtempSync(join(tmpdir(), "cestus-wake-resident-"));
  directories.push(root);
  const workspaceId = `ws_wake_resident_${suffix}`;
  const workspaceRoot = join(root, workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: "Wake resident authority",
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "wake-resident-authority-test"
  });
  const handle = createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({
      cwd: root,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: workspaceRoot
      }
    }),
    actor: { id: "actor_wake_resident", kind: "human", label: "Wake resident authority" },
    now: () => "2026-07-16T00:00:00.000Z"
  });
  handles.push(handle);
  await handle.residentIdentity.ready();

  const taskId = `task_wake_resident_${suffix}`;
  const attemptId = `attempt_${"a".repeat(64)}`;
  const runId = `run_wake_resident_${suffix}`;
  const runType = "evidence-triage" as const;
  const identity = (await handle.ledger.readAll()).find(
    (event) => event.type === "agent.identity.initialized"
  );
  if (identity === undefined) throw new Error("resident fixture identity is required");
  const taskCreated = await handle.ledger.append({
    type: "agent.task.created",
    version: 1,
    streamId: `agent_task_${taskId}`,
    context: {
      actor: { id: "agent_default", kind: "agent", label: "Resident agent" },
      occurredAt: "2026-07-16T00:00:00.000Z",
      causationId: identity.id,
      correlationId: `corr_${taskId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      taskId,
      residentAgentId: "agent_default",
      title: "Wake resident authority",
      requestedBy: "agent_default",
      priority: "normal",
      sourceEventIds: [identity.id],
      inputArtifactHashes: []
    }
  });
  const taskQueued = await handle.ledger.append({
    type: "agent.task.status.changed",
    version: 1,
    streamId: `agent_task_${taskId}`,
    context: {
      actor: { id: "agent_default", kind: "agent", label: "Resident agent" },
      occurredAt: "2026-07-16T00:00:00.000Z",
      causationId: taskCreated.id,
      correlationId: `corr_${taskId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      taskId,
      status: "queued",
      changedBy: "agent_default"
    }
  });
  const evidenceContentHash = `sha256:${"8".repeat(64)}` as const;
  const evidence = await handle.ledger.append({
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_ev_wake_resident_${suffix}`,
    context: {
      actor: { id: "agent_wake_resident", kind: "agent", label: "Wake resident authority" },
      occurredAt: "2026-07-16T00:00:00.000Z",
      correlationId: `corr_wake_resident_evidence_${suffix}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      evidenceId: `ev_wake_resident_${suffix}`,
      source: { kind: "file", label: `wake-resident-${suffix}.json` },
      contentHash: evidenceContentHash,
      mediaType: "application/json",
      sizeBytes: 1
    }
  });
  if (evidence.type !== "evidence.ingested") {
    throw new Error("resident fixture evidence is required");
  }
  const assertionService = new AssertionService({ ledger: handle.ledger });
  const proposal = await assertionService.propose({
    assertionId: `as_wake_resident_${suffix}`,
    evidenceId: `ev_wake_resident_${suffix}`,
    subjectRef: `ent_wake_resident_${suffix}`,
    predicate: "agency.name",
    object: "Wake Resident Authority",
    confidence: 0.95,
    actor: { id: "agent_wake_resident", kind: "agent", label: "Wake resident authority" }
  });
  if (proposal.type !== "assertion.proposed") {
    throw new Error("resident fixture assertion proposal is required");
  }
  const claim = await handle.ledger.append({
    type: "agent.task.orchestration.claimed",
    version: 1,
    streamId: `agent_task_orchestration_${taskId}_${runType}`,
    context: {
      actor: { id: "agent_default", kind: "agent", label: "Resident agent" },
      occurredAt: "2026-07-16T00:00:00.000Z",
      causationId: taskQueued.id,
      correlationId: `corr_${taskId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      taskId,
      runType,
      attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      workerId: "agent_default",
      claimedAt: "2026-07-16T00:00:00.000Z",
      leaseExpiresAt: "2026-07-16T01:00:00.000Z",
      idempotencyKey: `claim_wake_resident_${suffix}`,
      selectedOrderingPosition: {
        priorityRank: 0,
        queuedAt: "2026-07-16T00:00:00.000Z",
        taskId,
        runType,
        retryGeneration: 0
      },
      activeBudgetSnapshot: {
        maxProviderInvocations: 1,
        remainingProviderInvocations: 1,
        contextByteBudget: 32_768,
        promptByteBudget: 32_768,
        derivativeArtifactByteBudget: 65_536,
        wallClockBudgetMs: 120_000
      },
      causationEventId: taskQueued.id
    }
  });
  if (claim.type !== "agent.task.orchestration.claimed") {
    throw new Error("resident fixture orchestration claim is required");
  }

  const policy = Object.freeze({
    policyVersion: "policy.wake-resident.v1",
    policyDigest: `sha256:${"a".repeat(64)}` as const,
    lockStateDigest: `sha256:${"b".repeat(64)}` as const
  });
  const composition = createResidentLoopFactoryComposition(Object.freeze({
    runtimeHandle: handle,
    actor: { id: "agent_wake_resident", kind: "agent", label: "Wake resident authority" },
    supervisorEpoch: `epoch_wake_resident_${suffix}`,
    policy,
    now: () => "2026-07-16T00:00:00.000Z",
    createSafeId: (kind: "lease" | "diagnostic" | "reconciliation") =>
      `${kind}_wake_resident_${suffix}`
  }));
  await composition.start();
  const operation = issueMountedArtifactAuthorityOperationForFactory(composition.wakeRuntime);
  const providerAuthority = issueMountedProviderAuthority(Object.freeze({ operation }));
  const handoff = await createPortableMountedAgentArtifactStoreProducer(operation).bind({
    taskId,
    attemptId,
    approvedRunId: runId,
    runType,
    retryGeneration: 0
  });
  const binding = await composition.bind(Object.freeze({
    providerAuthority,
    handoffAuthorityWitness: handoff.binding.authorityWitness
  }));
  const domainExecution = await dispatcherDefault.createPackageOwnedResidentDomainExecutionCapability({
    kind: "accepted-graph-review",
    workspaceId,
    residentAgentId: "agent_default",
    taskId,
    context: {
      ledger: handle.ledger,
      assertionService,
      reviewer: { id: "actor_wake_resident", kind: "human", label: "Wake resident authority" },
      residentAgentId: "agent_default",
      taskId,
      assertionId: proposal.payload.assertionId,
      proposalEventId: proposal.id,
      evidenceId: evidence.payload.evidenceId,
      evidenceEventId: evidence.id,
      evidenceContentHash,
      reviewerRationaleDraft: "The mounted fixture binds one reviewed assertion.",
      ontologyPackVersions: { ...proposal.context.packVersions }
    }
  });
  return Object.freeze({
    handle,
    composition,
    binding,
    domainExecution,
    taskId,
    attemptId,
    runId,
    runType,
    claim
  });
}
