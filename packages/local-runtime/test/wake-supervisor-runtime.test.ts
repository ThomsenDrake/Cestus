import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssertionService } from "../../ontology/src/assertion-service.js";
import type { KnowledgeEventOf } from "../../ontology/src/contracts.js";
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
    const mounted = await residentFixture("exact");
    const before = await mounted.handle.ledger.readAll();
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

    await expect(bindResidentLoopCapabilitiesForFactory(
      mounted.composition.wakeRuntime,
      mounted.binding,
      mounted.domainExecution
    )).rejects.toThrow(/unconsumed|authority|bound/i);
    expect(await mounted.handle.ledger.readAll()).toEqual(before);

    for (const mutation of [
      "copied-runtime",
      "swapped-runtime",
      "copied-core-binding",
      "copied-provider-binding",
      "copied-handoff-binding",
      "copied-dispatcher-capability",
      "swapped-dispatcher-capability"
    ] as const) {
      const local = await residentFixture(`identity-${mutation}`);
      const foreign = mutation.startsWith("swapped")
        ? await residentFixture(`identity-${mutation}-foreign`)
        : undefined;
      const beforeLocal = await local.handle.ledger.readAll();
      const beforeForeign = foreign === undefined
        ? undefined
        : await foreign.handle.ledger.readAll();
      const runtime = mutation === "copied-runtime"
        ? Object.freeze({ ...local.composition.wakeRuntime })
        : mutation === "swapped-runtime"
          ? foreign!.composition.wakeRuntime
          : local.composition.wakeRuntime;
      const binding = mutation === "copied-core-binding"
        ? Object.freeze({ ...local.binding })
        : mutation === "copied-provider-binding"
          ? Object.freeze({
              ...local.binding,
              provider: Object.freeze({ ...local.binding.provider })
            })
          : mutation === "copied-handoff-binding"
            ? Object.freeze({
                ...local.binding,
                handoff: Object.freeze({
                  ...local.binding.handoff,
                  authorityBinding: Object.freeze({
                    ...local.binding.handoff.authorityBinding
                  })
                })
              })
            : local.binding;
      const domainExecution = mutation === "copied-dispatcher-capability"
        ? Object.freeze({ ...local.domainExecution })
        : mutation === "swapped-dispatcher-capability"
          ? foreign!.domainExecution
          : local.domainExecution;

      await expect(
        bindResidentLoopCapabilitiesForFactory(runtime, binding, domainExecution),
        mutation
      ).rejects.toThrow(/authority|binding|capability|dispatcher|runtime|mounted/i);
      expect(await local.handle.ledger.readAll(), mutation).toEqual(beforeLocal);
      if (foreign !== undefined) {
        expect(await foreign.handle.ledger.readAll(), mutation).toEqual(beforeForeign);
      }
    }
  });

  it("recovers every missing suspension-prefix suffix without an effect", async () => {
    const empty = await issuedResidentFixture("state-0");
    const emptyBefore = await empty.handle.ledger.readAll();
    await expect(
      empty.capabilities.mountedAuthority.recoverSuspensionPrefix(
        residentSuspensionLocator(empty)
      )
    ).rejects.toThrow(/checkpoint|durable|absent|state/i);
    expect(await empty.handle.ledger.readAll()).toEqual(emptyBefore);

    for (const [label, stopBeforeType, expectedBefore] of [
      ["state-1", "agent.resident-loop.suspended.v2", ["agent.task.orchestration.checkpointed"]],
      [
        "state-2",
        "agent.resident-loop.result.recorded.v2",
        ["agent.task.orchestration.checkpointed", "agent.resident-loop.suspended.v2"]
      ],
      [
        "state-3",
        "agent.task.orchestration.released",
        [
          "agent.task.orchestration.checkpointed",
          "agent.resident-loop.suspended.v2",
          "agent.resident-loop.result.recorded.v2"
        ]
      ]
    ] as const) {
      const partial = await capturedResidentPrefix(label, stopBeforeType);
      expect(partial.appendedTypes).toEqual(expectedBefore);
      const beforeRecovery = await partial.handle.ledger.readAll();
      const recovered = await partial.capabilities.mountedAuthority
        .recoverSuspensionPrefix(partial.locator);
      expect(recovered).toMatchObject({
        schemaVersion: "resident-loop-released-checkpoint-readback.v1"
      });
      const afterRecovery = await partial.handle.ledger.readAll();
      expect(afterRecovery.slice(beforeRecovery.length).map((event) => event.type))
        .toEqual(residentPrefixTypes.slice(expectedBefore.length));
    }

    const complete = await issuedResidentFixture("state-4");
    const material = await residentSuspensionMaterial(complete);
    const current = await complete.capabilities.mountedAuthority.reverifyAfterAwait(
      complete.capabilities.currentnessToken
    );
    expect(current.kind).toBe("current");
    if (current.kind !== "current") throw new Error("current resident authority is required");
    const released = await complete.capabilities.mountedAuthority.suspendAndRelease(
      material.checkpoint,
      current.token
    );
    expect(released).toMatchObject({
      schemaVersion: "resident-loop-released-checkpoint-readback.v1"
    });
    const completedEvents = await complete.handle.ledger.readAll();
    const completedAgain = await complete.capabilities.mountedAuthority
      .recoverSuspensionPrefix(material.locator);
    expect(completedAgain).toEqual(released);
    expect(await complete.handle.ledger.readAll()).toEqual(completedEvents);
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

const residentPrefixTypes = Object.freeze([
  "agent.task.orchestration.checkpointed",
  "agent.resident-loop.suspended.v2",
  "agent.resident-loop.result.recorded.v2",
  "agent.task.orchestration.released"
] as const);

async function issuedResidentFixture(suffix: string) {
  const mounted = await residentFixture(suffix);
  const capabilities = await bindResidentLoopCapabilitiesForFactory(
    mounted.composition.wakeRuntime,
    mounted.binding,
    mounted.domainExecution
  );
  return Object.freeze({ ...mounted, capabilities });
}

function residentSuspensionLocator(
  mounted: Pick<Awaited<ReturnType<typeof residentFixture>>, "taskId" | "attemptId" | "runId">
) {
  return Object.freeze({
    taskId: mounted.taskId,
    attemptId: mounted.attemptId,
    runId: mounted.runId,
    checkpointSemanticKey: `resident-suspension-${mounted.taskId}`
  });
}

async function residentSuspensionMaterial(
  mounted: Awaited<ReturnType<typeof issuedResidentFixture>>,
  suspensionCategory:
    | "budget-exhausted"
    | "approval-required"
    | "authority-stale"
    | "context-stale"
    | "provider-unavailable"
    | "effect-outcome-unknown" = "context-stale"
) {
  const suffix = mounted.taskId.slice("task_wake_resident_".length);
  const correlationId = `corr_${mounted.taskId}`;
  const authority = mounted.binding.handoff.authorityBinding;
  const common = {
    residentAgentId: "agent_default" as const,
    workspaceId: mounted.binding.provider.workspaceId,
    taskId: mounted.taskId,
    attemptId: mounted.attemptId,
    runId: mounted.runId,
    runMode: "evidence-triage" as const,
    workflowDescriptor: {
      workflowDescriptorId: "workflow_evidence_triage",
      workflowDescriptorVersion: "v1",
      workflowDescriptorHash: residentHash("1")
    },
    policy: {
      policyId: "agent_policy_default",
      policyVersion: mounted.binding.provider.policyVersion,
      policyHash: authority.policyHash
    },
    authority,
    sourceEventIds: [mounted.claim.id],
    contextPackRefs: [{
      contextPackId: `context_pack_wake_resident_${suffix}`,
      contentHash: residentHash("2")
    }],
    correlationId
  };
  const planId = `plan_wake_resident_${suffix}`;
  const prepared = await callResidentGateway(
    mounted.capabilities.gateway,
    "preparePlannedStepBindings",
    {
      workspaceId: common.workspaceId,
      residentAgentId: common.residentAgentId,
      taskId: common.taskId,
      attemptId: common.attemptId,
      runId: common.runId,
      planId,
      planRevision: 0,
      steps: [{
        ordinal: 1,
        toolId: "ontology.assertion.accept",
        toolVersion: "0.1.0"
      }]
    }
  );
  if (!Array.isArray(prepared) || prepared.length !== 1) {
    throw new Error("resident fixture requires one package-owned gateway binding");
  }
  const preparedBinding = residentRecord(prepared[0], "resident gateway binding");
  const toolRequestId = String(preparedBinding.toolRequestId);
  const executionCapabilityHash = preparedBinding.executionCapabilityHash;
  if (
    !toolRequestId.startsWith("toolreq_") ||
    typeof executionCapabilityHash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(executionCapabilityHash)
  ) {
    throw new Error("resident fixture gateway binding is malformed");
  }
  const plan = await mounted.capabilities.planObservation.appendPlan({
    ...common,
    schemaVersion: "resident-plan-record.v2",
    budget: residentBudget({ contextBytes: 1 }, { contextBytes: 1 }),
    causationId: mounted.claim.id,
    planId,
    planRevision: 0,
    priorPlanReadback: null,
    replanObservationReadback: null,
    steps: [{
      ordinal: 1,
      purpose: "Capture one safe mounted resident observation.",
      toolId: "ontology.assertion.accept",
      toolVersion: "0.1.0",
      allowlistEntryHash: residentHash("3"),
      expectedSafeOutputClass: "observation",
      prerequisiteStepOrdinals: [],
      toolRequestId,
      executionCapabilityHash
    }]
  });
  const planReadback = {
    planRecordEventId: plan.id,
    workspaceId: common.workspaceId,
    residentAgentId: common.residentAgentId,
    taskId: common.taskId,
    attemptId: common.attemptId,
    runId: common.runId,
    planId: plan.payload.planId,
    planRevision: plan.payload.planRevision
  };
  const logicalLocator = Object.freeze({
    workspaceId: common.workspaceId,
    residentAgentId: common.residentAgentId,
    taskId: common.taskId,
    attemptId: common.attemptId,
    runId: common.runId,
    planId: plan.payload.planId,
    planRevision: plan.payload.planRevision,
    stepOrdinal: 1,
    toolRequestId,
    toolId: "ontology.assertion.accept",
    toolVersion: "0.1.0",
    executionCapabilityHash
  });
  let requestEventId: string | undefined;
  let decisionEventId: string | undefined;
  let approvedBy: string | undefined;
  let approvedPreviewHash: `sha256:${string}` | undefined;
  let executionClaimEventId: string | undefined;
  if (
    suspensionCategory === "approval-required" ||
    suspensionCategory === "effect-outcome-unknown"
  ) {
    const requested = residentRecord(
      await callResidentGateway(
        mounted.capabilities.gateway,
        "requestFreshAuthorized",
        logicalLocator
      ),
      "resident gateway requested stage"
    );
    requestEventId = String(requested.requestEventId);
    if (suspensionCategory === "effect-outcome-unknown") {
      const request = (await mounted.handle.ledger.readAll()).find(
        (event): event is KnowledgeEventOf<"agent.resident-domain.requested.v1"> =>
          event.id === requestEventId &&
          event.type === "agent.resident-domain.requested.v1"
      );
      if (
        request === undefined ||
        request.payload.authorizationKind !== "human-approval"
      ) {
        throw new Error("resident unknown fixture requires one human gateway request");
      }
      decisionEventId = `evt_wake_resident_decision_${suffix}`;
      approvedBy = "actor_wake_resident_reviewer";
      const exactApprovedPreviewHash =
        request.payload.previewHash as `sha256:${string}`;
      approvedPreviewHash = exactApprovedPreviewHash;
      const approval = await mounted.handle.ledger.append({
        type: "agent.resident-domain.human-approved.v1",
        version: 1,
        streamId: request.streamId,
        context: {
          actor: {
            id: approvedBy,
            kind: "human",
            label: "Wake resident reviewer"
          },
          occurredAt: "2026-07-16T00:00:00.000Z",
          causationId: request.id,
          correlationId: request.payload.correlationId,
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0", agent: "0.1.0" }
        },
        payload: {
          schemaVersion: "resident-domain-human-approved.v1",
          logicalLocator,
          executionCapabilityHash,
          causationId: request.id,
          correlationId: request.payload.correlationId,
          authorizationKind: "human-approval",
          requestEventId: request.id,
          decisionEventId,
          approvedBy,
          approvedPreviewHash: exactApprovedPreviewHash
        }
      });
      const executionClaim = await mounted.handle.ledger.append({
        type: "agent.resident-domain.execution-claimed.v1",
        version: 1,
        streamId: request.streamId,
        context: {
          actor: {
            id: "agent_wake_resident",
            kind: "agent",
            label: "Wake resident authority"
          },
          occurredAt: "2026-07-16T00:00:00.000Z",
          causationId: approval.id,
          correlationId: request.payload.correlationId,
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0", agent: "0.1.0" }
        },
        payload: {
          schemaVersion: "resident-domain-execution-claimed.v1",
          logicalLocator,
          executionCapabilityHash,
          causationId: approval.id,
          correlationId: request.payload.correlationId,
          requestEventId: request.id,
          authorization: {
            authorizationKind: "human-approval",
            decisionEventId,
            approvedBy,
            approvedPreviewHash: exactApprovedPreviewHash
          },
          claimedAt: "2026-07-16T00:00:00.000Z"
        }
      });
      executionClaimEventId = executionClaim.id;
      const recovered = residentRecord(
        await callResidentGateway(
          mounted.capabilities.gateway,
          "rereadAndIssueFromLedger",
          logicalLocator
        ),
        "resident gateway claimed recovery"
      );
      expect(recovered).toMatchObject({
        stage: "claimed",
        category: "effect-outcome-unknown",
        requestEventId: request.id,
        executionClaimEventId: executionClaim.id
      });
      expect(recovered).not.toHaveProperty("outcomeReceiptEventId");
      expect(recovered).not.toHaveProperty("resultEventId");
    }
  }
  const observation = await mounted.capabilities.planObservation.appendObservation({
    ...common,
    schemaVersion: "resident-observation-record.v2",
    budget: residentBudget(
      { contextBytes: 1, observationRecords: 1 },
      { observationRecords: 1 }
    ),
    causationId: plan.id,
    observationId: `observation_wake_resident_${suffix}`,
    planId: plan.payload.planId,
    planRevision: plan.payload.planRevision,
    planReadback,
    stepOrdinal: 1,
    kind: "tool-result",
    safeSummary: "The mounted resident observation is durable.",
    artifactHashes: [residentHash("5")],
    toolRequestId,
    modelInvocationEventId: `evt_wake_resident_model_${suffix}`
  });
  const locator = residentSuspensionLocator(mounted);
  const nextSafeAction = "resume-from-durable-checkpoint";
  const checkpoint = Object.freeze({
    taskId: mounted.taskId,
    runType: mounted.runType,
    attemptId: mounted.attemptId,
    retryGeneration: 0,
    leaseClaimGeneration: mounted.claim.payload.leaseClaimGeneration,
    checkpointKind: "resident-loop-suspension" as const,
    checkpointedAt: "2026-07-16T00:00:00.000Z",
    runId: mounted.runId,
    resumeIdempotencyKey: locator.checkpointSemanticKey,
    contextBindings: [],
    residentLoopSuspension: {
      schemaVersion: "resident-loop-suspension-instruction.v1" as const,
      residentAgentId: "agent_default" as const,
      taskId: mounted.taskId,
      attemptId: mounted.attemptId,
      runId: mounted.runId,
      planRecordEventId: plan.id,
      finalObservationEventId: observation.id,
      suspensionCategory,
      ...(requestEventId === undefined ? {} : { requestEventId }),
      resumptionDeadlineAt: "2026-07-16T01:00:00.000Z",
      nextSafeAction,
      orchestrationClaimEventId: mounted.claim.id,
      leaseClaimGeneration: mounted.claim.payload.leaseClaimGeneration,
      suspensionSemanticKey: residentHash("6"),
      resultSemanticKey: residentHash("7"),
      ...(suspensionCategory !== "effect-outcome-unknown"
        ? {}
        : {
            logicalLocator,
            decisionEventId,
            approvedBy,
            approvedPreviewHash,
            executionClaimEventId,
            executionCapabilityHash
          })
    },
    safeNextActions: [nextSafeAction]
  });
  return Object.freeze({
    checkpoint,
    locator,
    plan,
    observation,
    logicalLocator,
    requestEventId,
    toolRequestId
  });
}

async function capturedResidentPrefix(
  suffix: string,
  stopBeforeType: typeof residentPrefixTypes[number]
) {
  const mounted = await issuedResidentFixture(suffix);
  const material = await residentSuspensionMaterial(mounted);
  const current = await mounted.capabilities.mountedAuthority.reverifyAfterAwait(
    mounted.capabilities.currentnessToken
  );
  if (current.kind !== "current") {
    throw new Error("captured resident prefix requires current mounted authority");
  }
  const before = await mounted.handle.ledger.readAll();
  const append = mounted.handle.ledger.append.bind(mounted.handle.ledger);
  const spy = vi.spyOn(mounted.handle.ledger, "append").mockImplementation(
    async (event, options) => {
      if (event.type === stopBeforeType) {
        throw new Error(`simulated resident prefix crash before ${stopBeforeType}`);
      }
      return await append(event, options);
    }
  );
  try {
    await expect(
      mounted.capabilities.mountedAuthority.suspendAndRelease(
        material.checkpoint,
        current.token
      )
    ).rejects.toThrow(/simulated resident prefix crash/);
  } finally {
    spy.mockRestore();
  }
  const after = await mounted.handle.ledger.readAll();
  return Object.freeze({
    ...mounted,
    locator: material.locator,
    appendedTypes: after
      .slice(before.length)
      .map((event) => event.type)
      .filter((type): type is typeof residentPrefixTypes[number] =>
        residentPrefixTypes.includes(type as typeof residentPrefixTypes[number])
      )
  });
}

function residentHash(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

async function callResidentGateway(
  gateway: object,
  methodName: string,
  input: unknown
): Promise<unknown> {
  const method = Reflect.get(gateway, methodName);
  if (typeof method !== "function") {
    throw new Error(`resident fixture gateway lacks ${methodName}`);
  }
  return await Reflect.apply(method, gateway, [input]);
}

function residentRecord(
  value: unknown,
  label: string
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function residentBudget(
  consumedOverrides: Readonly<Partial<Record<ResidentBudgetField, number>>>,
  actionOverrides: Readonly<Partial<Record<ResidentBudgetField, number>>>
) {
  const ceilings = {
    planRevisions: 3,
    observationRecords: 16,
    toolSteps: 12,
    providerInvocations: 3,
    providerRequestBytes: 1_048_576,
    providerResponseBytes: 1_048_576,
    contextBytes: 1_048_576,
    derivativeArtifactBytes: 16_777_216,
    activeExecutionMs: 900_000,
    approvalSuspensionMs: 86_400_000
  };
  const consumed = Object.fromEntries(
    Object.keys(ceilings).map((field) => [
      field,
      consumedOverrides[field as ResidentBudgetField] ?? 0
    ])
  ) as Record<ResidentBudgetField, number>;
  const actionConsumption = Object.fromEntries(
    Object.keys(ceilings).map((field) => [
      field,
      actionOverrides[field as ResidentBudgetField] ?? 0
    ])
  ) as Record<ResidentBudgetField, number>;
  const remaining = Object.fromEntries(
    Object.entries(ceilings).map(([field, ceiling]) => [
      field,
      ceiling - consumed[field as ResidentBudgetField]
    ])
  ) as Record<ResidentBudgetField, number>;
  return Object.freeze({
    ceilings: Object.freeze(ceilings),
    consumed: Object.freeze(consumed),
    remaining: Object.freeze(remaining),
    actionConsumption: Object.freeze(actionConsumption)
  });
}

type ResidentBudgetField =
  | "planRevisions"
  | "observationRecords"
  | "toolSteps"
  | "providerInvocations"
  | "providerRequestBytes"
  | "providerResponseBytes"
  | "contextBytes"
  | "derivativeArtifactBytes"
  | "activeExecutionMs"
  | "approvalSuspensionMs";
