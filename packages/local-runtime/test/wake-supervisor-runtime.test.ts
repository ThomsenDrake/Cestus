import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssertionService } from "../../ontology/src/assertion-service.js";
import type { KnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
import { hashAgentToolPreview } from "../../agent/src/tool-gateway.js";
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
  });

  it.each([
    "copied-runtime",
    "swapped-runtime",
    "pre-core-runtime",
    "copied-core-binding",
    "copied-provider-binding",
    "copied-handoff-binding",
    "copied-dispatcher-capability",
    "swapped-dispatcher-capability"
  ] as const)("rejects %s at its issued construction identity", async (mutation) => {
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
        : mutation === "pre-core-runtime"
          ? (await unstartedResidentFixture(`identity-${mutation}`)).composition.wakeRuntime
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
  });

  it("rejects state zero without creating a caller-invented checkpoint", async () => {
    const empty = await issuedResidentFixture("state-0");
    const emptyBefore = await empty.handle.ledger.readAll();
    await expect(
      empty.capabilities.mountedAuthority.recoverSuspensionPrefix(
        residentSuspensionLocator(empty)
      )
    ).rejects.toThrow(/checkpoint|durable|absent|state/i);
    expect(await empty.handle.ledger.readAll()).toEqual(emptyBefore);
  });

  it.each([1, 2, 3, 4] as const)(
    "recovers canonical prefix state %i by appending only its missing suffix",
    async (state) => {
      const partial = await seededResidentPrefix(`state-${state}`, state);
      expect(partial.appendedTypes).toEqual(residentPrefixTypes.slice(0, state));
      const beforeRecovery = await partial.handle.ledger.readAll();
      const recovered = await partial.capabilities.mountedAuthority
        .recoverSuspensionPrefix(partial.locator);
      expect(recovered).toMatchObject({
        schemaVersion: "resident-loop-released-checkpoint-readback.v1"
      });
      const afterRecovery = await partial.handle.ledger.readAll();
      expect(afterRecovery.slice(beforeRecovery.length).map((event) => event.type))
        .toEqual(residentPrefixTypes.slice(state));
      if (state === 4) {
        expect(recovered).toEqual(partial.readback);
        expect(afterRecovery).toEqual(beforeRecovery);
      }
    }
  );

  it("keeps currentness only across the exact approved resident causal advance", async () => {
    const mounted = await issuedResidentFixture("current-approved");
    const oldToken = mounted.capabilities.currentnessToken;
    await residentSuspensionMaterial(mounted);
    const beforeReverify = await mounted.handle.ledger.readAll();

    const result = await mounted.capabilities.mountedAuthority.reverifyAfterAwait(oldToken);
    expect(result.kind).toBe("current");
    if (result.kind !== "current") throw new Error("approved resident advance must remain current");
    expect(result.token).not.toBe(oldToken);
    expect(await mounted.handle.ledger.readAll()).toEqual(beforeReverify);
    await expect(
      mounted.capabilities.mountedAuthority.reverifyAfterAwait(oldToken)
    ).rejects.toThrow(/consumed|issued|currentness/i);
  });

  it.each([
    "competing-release",
    "terminal",
    "new-generation",
    "changed-run",
    "changed-causation",
    "changed-owner",
    "target-suffix",
    "foreign-suffix"
  ] as const)("classifies the real durable %s currentness transition exactly", async (mutation) => {
    const mounted = await issuedResidentFixture(`current-${mutation}`);
    const oldToken = mounted.capabilities.currentnessToken;
    await appendResidentCurrentnessMutation(mounted, mutation);
    const beforeReverify = await mounted.handle.ledger.readAll();

    const result = await mounted.capabilities.mountedAuthority.reverifyAfterAwait(oldToken);
    expect(result.kind, mutation).toBe("recordable-stale");
    if (result.kind !== "recordable-stale") {
      throw new Error(`${mutation} must issue only suspension-only authority`);
    }
    expect(result.capability).not.toBe(oldToken);
    expect(Reflect.ownKeys(result.capability).map(String)).toEqual(["schemaVersion"]);
    expect(await mounted.handle.ledger.readAll(), mutation).toEqual(beforeReverify);
    await expect(
      mounted.capabilities.mountedAuthority.reverifyAfterAwait(oldToken),
      mutation
    ).rejects.toThrow(/consumed|issued|currentness/i);
  });

  it("returns unavailable and consumes the old token when the authenticated store is invalidated", async () => {
    const mounted = await issuedResidentFixture("current-unavailable");
    const oldToken = mounted.capabilities.currentnessToken;
    const before = await mounted.handle.ledger.readAll();
    await mounted.composition.stop();

    await expect(
      mounted.capabilities.mountedAuthority.reverifyAfterAwait(oldToken)
    ).resolves.toEqual({ kind: "unavailable" });
    expect(await mounted.handle.ledger.readAll()).toEqual(before);
    await expect(
      mounted.capabilities.mountedAuthority.reverifyAfterAwait(oldToken)
    ).rejects.toThrow(/consumed|issued|currentness/i);
  });

  it("rejects copied and foreign currentness identities without consuming the real tokens", async () => {
    const local = await issuedResidentFixture("current-copy-local");
    const foreign = await issuedResidentFixture("current-copy-foreign");
    const localBefore = await local.handle.ledger.readAll();
    const foreignBefore = await foreign.handle.ledger.readAll();
    const copied = Object.freeze({ ...local.capabilities.currentnessToken });

    await expect(
      local.capabilities.mountedAuthority.reverifyAfterAwait(copied),
      "copied token"
    ).rejects.toThrow(/issued|currentness|consumed/i);
    await expect(
      local.capabilities.mountedAuthority.reverifyAfterAwait(
        foreign.capabilities.currentnessToken
      ),
      "foreign token"
    ).rejects.toThrow(/owner|mounted|authority/i);
    await expect(
      local.capabilities.mountedAuthority.reverifyAfterAwait(
        local.capabilities.currentnessToken
      )
    ).resolves.toMatchObject({ kind: "current" });
    expect(await local.handle.ledger.readAll()).toEqual(localBefore);
    expect(await foreign.handle.ledger.readAll()).toEqual(foreignBefore);
  });

  it.each([
    "changed-s",
    "changed-r",
    "changed-release",
    "semantic-key",
    "causation",
    "order",
    "result",
    "deadline",
    "next-action",
    "duplicate",
    "skipped",
    "missing",
    "extra-target-suffix"
  ] as const)("rejects the hostile target prefix mutation %s without append or effect", async (mutation) => {
    const hostile = await seededResidentPrefix(`hostile-${mutation}`, 4);
    await appendHostileResidentPrefixMutation(hostile, mutation);
    const before = await hostile.handle.ledger.readAll();
    const effectsBefore = residentEffectEventIds(before);

    await expect(
      hostile.capabilities.mountedAuthority.recoverSuspensionPrefix(hostile.locator),
      mutation
    ).rejects.toThrow(/prefix|checkpoint|suspension|result|release|canonical|semantic|order|durable/i);
    expect(await hostile.handle.ledger.readAll(), mutation).toEqual(before);
    expect(residentEffectEventIds(await hostile.handle.ledger.readAll()), mutation)
      .toEqual(effectsBefore);
  });

  it("ignores an independent foreign-stream suffix while preserving exact target readback", async () => {
    const target = await seededResidentPrefix("foreign-control-target", 4);
    const foreign = await seededResidentPrefix("foreign-control-other", 4);
    const beforeTarget = await target.handle.ledger.readAll();
    const beforeForeign = await foreign.handle.ledger.readAll();

    await expect(
      target.capabilities.mountedAuthority.recoverSuspensionPrefix(target.locator)
    ).resolves.toEqual(target.readback);
    expect(await target.handle.ledger.readAll()).toEqual(beforeTarget);
    expect(await foreign.handle.ledger.readAll()).toEqual(beforeForeign);
  });

  it.each([
    "budget-exhausted",
    "authority-stale",
    "context-stale",
    "provider-unavailable"
  ] as const)("reclaims an eligible released ordinary %s prefix without gateway authority", async (category) => {
    const released = await seededResidentPrefix(`reclaim-${category}`, 4, category);
    const before = await released.handle.ledger.readAll();
    const token = await released.capabilities.mountedAuthority.reclaimAndReverify(
      released.locator
    );
    expect(token).toMatchObject({ schemaVersion: "resident-loop-currentness-token.v1" });
    const appended = (await released.handle.ledger.readAll()).slice(before.length);
    expect(appended.map((event) => event.type)).toEqual([
      "agent.task.orchestration.claimed"
    ]);
    const suspension = released.suspension!;
    expect(Reflect.ownKeys(suspension.payload.checkpoint).sort()).toEqual([
      "authorizationKind",
      "nextSafeAction",
      "orchestrationCheckpointEventId",
      "resumptionDeadlineAt"
    ]);
    expect(residentEffectEventIds(appended)).toEqual([]);
  });

  it("does not reclaim approval-required work before one later matching decision", async () => {
    const released = await seededResidentPrefix(
      "reclaim-approval-pending",
      4,
      "approval-required"
    );
    const before = await released.handle.ledger.readAll();
    await expect(
      released.capabilities.mountedAuthority.reclaimAndReverify(released.locator)
    ).resolves.toBeUndefined();
    expect(await released.handle.ledger.readAll()).toEqual(before);
  });

  it("reclaims approval-required work only after the independent matching decision", async () => {
    const released = await seededResidentPrefix(
      "reclaim-approval-approved",
      4,
      "approval-required"
    );
    await appendResidentApprovalDecision(released);
    const before = await released.handle.ledger.readAll();
    const token = await released.capabilities.mountedAuthority.reclaimAndReverify(
      released.locator
    );
    expect(token).toMatchObject({ schemaVersion: "resident-loop-currentness-token.v1" });
    expect((await released.handle.ledger.readAll()).slice(before.length).map((event) => event.type))
      .toEqual(["agent.task.orchestration.claimed"]);
  });

  it("reclaims unknown outcome only from the exact reread-only nonexecutable claimed stage", async () => {
    const released = await seededResidentPrefix(
      "reclaim-effect-unknown",
      4,
      "effect-outcome-unknown"
    );
    const instruction = released.checkpoint.payload.residentLoopSuspension!;
    const before = await released.handle.ledger.readAll();
    const requestBefore = before.find((event) => event.id === instruction.requestEventId);
    const claimedBefore = residentRecord(
      await callResidentGateway(
        released.capabilities.gateway,
        "rereadAndIssueFromLedger",
        instruction.logicalLocator
      ),
      "unknown-effect exact claimed reread"
    );
    expect(claimedBefore).toMatchObject({
      stage: "claimed",
      category: "effect-outcome-unknown",
      requestEventId: instruction.requestEventId,
      executionClaimEventId: instruction.executionClaimEventId
    });
    expect(claimedBefore).not.toHaveProperty("outcomeReceiptEventId");
    expect(claimedBefore).not.toHaveProperty("resultEventId");

    const token = await released.capabilities.mountedAuthority.reclaimAndReverify(
      released.locator
    );
    expect(token).toMatchObject({ schemaVersion: "resident-loop-currentness-token.v1" });
    const after = await released.handle.ledger.readAll();
    expect(after.find((event) => event.id === instruction.requestEventId)).toEqual(requestBefore);
    expect(after.slice(before.length).map((event) => event.type))
      .toEqual(["agent.task.orchestration.claimed"]);
    expect(residentEffectEventIds(after)).toEqual(residentEffectEventIds(before));
  });

  it.each(["canceled", "terminal"] as const)(
    "does not reclaim %s resident work and appends no claim",
    async (status) => {
      const released = await seededResidentPrefix(`reclaim-ineligible-${status}`, 4);
      await appendResidentIneligibleTransition(released, status);
      const before = await released.handle.ledger.readAll();
      await expect(
        released.capabilities.mountedAuthority.reclaimAndReverify(released.locator),
        status
      ).resolves.toBeUndefined();
      expect(await released.handle.ledger.readAll(), status).toEqual(before);
    }
  );
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
  const domainPreviewPort = dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort({
    capability: domainExecution,
    mountedLedger: handle.ledger,
    workspaceId,
    residentAgentId: "agent_default",
    taskId
  });
  return Object.freeze({
    handle,
    composition,
    binding,
    domainExecution,
    domainPreviewPort,
    taskId,
    attemptId,
    runId,
    runType,
    claim
  });
}

async function unstartedResidentFixture(suffix: string) {
  const { handle } = await fixture({ supervisorEpoch: `epoch_unstarted_${suffix}` });
  const composition = createResidentLoopFactoryComposition(Object.freeze({
    runtimeHandle: handle,
    actor: { id: "agent_wake_resident", kind: "agent", label: "Wake resident authority" },
    supervisorEpoch: `epoch_unstarted_${suffix}`,
    policy: Object.freeze({
      policyVersion: "policy.wake-resident.v1",
      policyDigest: residentHash("a"),
      lockStateDigest: residentHash("b")
    }),
    now: () => "2026-07-16T00:00:00.000Z",
    createSafeId: (kind: "lease" | "diagnostic" | "reconciliation") =>
      `${kind}_unstarted_${suffix}`
  }));
  return Object.freeze({ composition });
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
  let claimedToolStep: KnowledgeEventOf<"agent.resident-tool-step.recorded.v2"> | undefined;
  if (
    suspensionCategory === "approval-required" ||
    suspensionCategory === "effect-outcome-unknown"
  ) {
    const durableRequest = await appendResidentRequestedStage(
      mounted,
      plan,
      logicalLocator
    );
    requestEventId = durableRequest.id;
    if (suspensionCategory === "effect-outcome-unknown") {
      if (durableRequest.payload.authorizationKind !== "human-approval") {
        throw new Error("resident unknown fixture requires one human gateway request");
      }
      decisionEventId = `evt_wake_resident_decision_${suffix}`;
      approvedBy = "actor_wake_resident_reviewer";
      if (!/^sha256:[a-f0-9]{64}$/.test(durableRequest.payload.previewHash)) {
        throw new Error("resident unknown fixture requires its exact approved preview hash");
      }
      approvedPreviewHash = durableRequest.payload.previewHash as `sha256:${string}`;
      const humanDecisionEventId = decisionEventId;
      const humanApprovedBy = approvedBy;
      const humanApprovedPreviewHash = approvedPreviewHash;
      const approval = await mounted.handle.ledger.append({
        type: "agent.resident-domain.human-approved.v1",
        version: 1,
        streamId: durableRequest.streamId,
        context: {
          actor: { id: humanApprovedBy, kind: "human", label: "Wake resident reviewer" },
          occurredAt: "2026-07-16T00:00:00.000Z",
          causationId: durableRequest.id,
          correlationId: durableRequest.payload.correlationId,
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0", agent: "0.1.0" }
        },
        payload: {
          schemaVersion: "resident-domain-human-approved.v1",
          logicalLocator,
          executionCapabilityHash,
          causationId: durableRequest.id,
          correlationId: durableRequest.payload.correlationId,
          authorizationKind: "human-approval",
          requestEventId: durableRequest.id,
          decisionEventId: humanDecisionEventId,
          approvedBy: humanApprovedBy,
          approvedPreviewHash: humanApprovedPreviewHash
        }
      });
      const executionClaim = await mounted.handle.ledger.append({
        type: "agent.resident-domain.execution-claimed.v1",
        version: 1,
        streamId: durableRequest.streamId,
        context: {
          actor: { id: "agent_wake_resident", kind: "agent", label: "Wake resident authority" },
          occurredAt: "2026-07-16T00:00:00.000Z",
          causationId: approval.id,
          correlationId: durableRequest.payload.correlationId,
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0", agent: "0.1.0" }
        },
        payload: {
          schemaVersion: "resident-domain-execution-claimed.v1",
          logicalLocator,
          executionCapabilityHash,
          causationId: approval.id,
          correlationId: durableRequest.payload.correlationId,
          requestEventId: durableRequest.id,
          authorization: {
            authorizationKind: "human-approval",
            decisionEventId: humanDecisionEventId,
            approvedBy: humanApprovedBy,
            approvedPreviewHash: humanApprovedPreviewHash
          },
          claimedAt: "2026-07-16T00:00:00.000Z"
        }
      });
      executionClaimEventId = executionClaim.id;
      claimedToolStep = await mounted.capabilities.planObservation.appendToolStep({
        ...common,
        schemaVersion: "resident-tool-step-record.v2",
        budget: residentBudget(
          { contextBytes: 1, toolSteps: 1 },
          { toolSteps: 1 }
        ),
        causationId: plan.id,
        planId: plan.payload.planId,
        planRevision: plan.payload.planRevision,
        planReadback,
        stepOrdinal: 1,
        toolRequestId,
        toolId: "ontology.assertion.accept",
        toolVersion: "0.1.0",
        allowlistEntryHash: plan.payload.steps[0]!.allowlistEntryHash,
        sideEffectClass: durableRequest.payload.sideEffectClass,
        requiredApprovalClass: durableRequest.payload.requiredApprovalClass,
        state: "suspended",
        previewHash: durableRequest.payload.previewHash,
        gatewayReadbacks: {
          authorizationKind: "human-approval",
          stage: "claimed",
          requestEventId: durableRequest.id,
          decisionEventId: humanDecisionEventId,
          approvedBy: humanApprovedBy,
          approvedPreviewHash: humanApprovedPreviewHash,
          executionClaimEventId: executionClaim.id
        },
        inputArtifactHashes: [...durableRequest.payload.inputArtifactHashes],
        resultArtifactHashes: []
      });
    }
  }
  const observation = await mounted.capabilities.planObservation.appendObservation({
    ...common,
    schemaVersion: "resident-observation-record.v2",
    budget: residentBudget(
      {
        contextBytes: 1,
        ...(claimedToolStep === undefined ? {} : { toolSteps: 1 }),
        observationRecords: 1
      },
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
    common,
    checkpoint,
    locator,
    plan,
    planReadback,
    observation,
    logicalLocator,
    requestEventId,
    executionClaimEventId,
    claimedToolStep,
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

function residentFixtureSuspensionCheckpoint(
  instruction: {
    readonly suspensionCategory:
      | "budget-exhausted"
      | "approval-required"
      | "authority-stale"
      | "context-stale"
      | "provider-unavailable"
      | "effect-outcome-unknown";
    readonly requestEventId?: string | undefined;
    readonly logicalLocator?: unknown | undefined;
    readonly decisionEventId?: string | undefined;
    readonly approvedBy?: string | undefined;
    readonly approvedPreviewHash?: `sha256:${string}` | undefined;
    readonly executionClaimEventId?: string | undefined;
    readonly executionCapabilityHash?: string | undefined;
    readonly resumptionDeadlineAt: string;
    readonly nextSafeAction: string;
  },
  checkpointEventId: string
) {
  const common = {
    orchestrationCheckpointEventId: checkpointEventId,
    resumptionDeadlineAt: instruction.resumptionDeadlineAt,
    nextSafeAction: instruction.nextSafeAction
  };
  if (instruction.suspensionCategory === "approval-required") {
    if (instruction.requestEventId === undefined) {
      throw new Error("approval fixture requires its exact gateway request");
    }
    return {
      authorizationKind: "awaiting-human-approval" as const,
      ...common,
      requestEventId: instruction.requestEventId
    };
  }
  if (instruction.suspensionCategory !== "effect-outcome-unknown") {
    return { authorizationKind: "not-applicable" as const, ...common };
  }
  if (
    instruction.logicalLocator === undefined ||
    instruction.requestEventId === undefined ||
    instruction.executionClaimEventId === undefined ||
    instruction.executionCapabilityHash === undefined
  ) {
    throw new Error("unknown-effect fixture requires exact claimed gateway authority");
  }
  if (
    instruction.decisionEventId === undefined &&
    instruction.approvedBy === undefined &&
    instruction.approvedPreviewHash === undefined
  ) {
    return {
      authorizationKind: "effect-outcome-unknown-automatic" as const,
      ...common,
      logicalLocator: instruction.logicalLocator,
      requestEventId: instruction.requestEventId,
      executionClaimEventId: instruction.executionClaimEventId,
      executionCapabilityHash: instruction.executionCapabilityHash
    };
  }
  if (
    instruction.decisionEventId === undefined ||
    instruction.approvedBy === undefined ||
    instruction.approvedPreviewHash === undefined
  ) {
    throw new Error("unknown-effect fixture requires a complete human approval tuple");
  }
  return {
    authorizationKind: "effect-outcome-unknown-human" as const,
    ...common,
    logicalLocator: instruction.logicalLocator,
    requestEventId: instruction.requestEventId,
    decisionEventId: instruction.decisionEventId,
    approvedBy: instruction.approvedBy,
    approvedPreviewHash: instruction.approvedPreviewHash,
    executionClaimEventId: instruction.executionClaimEventId,
    executionCapabilityHash: instruction.executionCapabilityHash
  };
}

async function seededResidentPrefix(
  suffix: string,
  state: 1 | 2 | 3 | 4,
  suspensionCategory:
    | "budget-exhausted"
    | "approval-required"
    | "authority-stale"
    | "context-stale"
    | "provider-unavailable"
    | "effect-outcome-unknown" = "context-stale"
) {
  const mounted = await issuedResidentFixture(suffix);
  const material = await residentSuspensionMaterial(mounted, suspensionCategory);
  const before = await mounted.handle.ledger.readAll();
  const checkpoint = await mounted.handle.ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId: `agent_task_orchestration_${mounted.taskId}_${mounted.runType}`,
    context: {
      actor: { id: "agent_wake_resident", kind: "agent", label: "Wake resident authority" },
      occurredAt: material.checkpoint.checkpointedAt,
      causationId: mounted.claim.id,
      correlationId: `corr_${mounted.taskId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: material.checkpoint
  }) as KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
  let suspension: KnowledgeEventOf<"agent.resident-loop.suspended.v2"> | undefined;
  let result: KnowledgeEventOf<"agent.resident-loop.result.recorded.v2"> | undefined;
  let release: KnowledgeEventOf<"agent.task.orchestration.released"> | undefined;
  if (state >= 2) {
    suspension = await mounted.capabilities.planObservation.appendSuspension({
      ...material.common,
      schemaVersion: "resident-loop-suspension.v2",
      budget: residentBudget(
        {
          contextBytes: 1,
          ...(material.claimedToolStep === undefined ? {} : { toolSteps: 1 }),
          observationRecords: 1,
          approvalSuspensionMs: 1
        },
        { approvalSuspensionMs: 1 }
      ),
      causationId: checkpoint.id,
      planId: material.plan.payload.planId,
      planRevision: material.plan.payload.planRevision,
      planReadback: material.planReadback,
      finalObservationReadback: {
        observationEventId: material.observation.id,
        workspaceId: material.common.workspaceId,
        residentAgentId: material.common.residentAgentId,
        taskId: material.common.taskId,
        attemptId: material.common.attemptId,
        runId: material.common.runId,
        planId: material.plan.payload.planId,
        planRevision: material.plan.payload.planRevision
      },
      suspensionCategory: material.checkpoint.residentLoopSuspension.suspensionCategory,
      checkpoint: {
        ...residentFixtureSuspensionCheckpoint(
          material.checkpoint.residentLoopSuspension,
          checkpoint.id
        )
      }
    });
  }
  if (state >= 3 && suspension !== undefined) {
    result = await mounted.capabilities.planObservation.appendResult({
      ...material.common,
      schemaVersion: "resident-loop-result.v2",
      budget: residentBudget(
        {
          contextBytes: 1,
          ...(material.claimedToolStep === undefined ? {} : { toolSteps: 1 }),
          observationRecords: 1,
          approvalSuspensionMs: 1,
          activeExecutionMs: 1
        },
        { activeExecutionMs: 1 }
      ),
      causationId: suspension.id,
      planId: material.plan.payload.planId,
      planRevision: material.plan.payload.planRevision,
      planReadback: material.planReadback,
      finalObservationReadback: {
        observationEventId: material.observation.id,
        workspaceId: material.common.workspaceId,
        residentAgentId: material.common.residentAgentId,
        taskId: material.common.taskId,
        attemptId: material.common.attemptId,
        runId: material.common.runId,
        planId: material.plan.payload.planId,
        planRevision: material.plan.payload.planRevision
      },
      outcome: "resumable",
      category: material.checkpoint.residentLoopSuspension.suspensionCategory,
      resultHash: material.checkpoint.residentLoopSuspension.resultSemanticKey,
      resumeAnchor: {
        checkpointEventId: suspension.id,
        nextSafeAction: material.checkpoint.residentLoopSuspension.nextSafeAction,
        resumptionDeadlineAt:
          material.checkpoint.residentLoopSuspension.resumptionDeadlineAt
      }
    });
  }
  if (state >= 4 && result !== undefined) {
    release = await mounted.handle.ledger.append({
      type: "agent.task.orchestration.released",
      version: 1,
      streamId: checkpoint.streamId,
      context: {
        actor: { id: "agent_wake_resident", kind: "agent", label: "Wake resident authority" },
        occurredAt: "2026-07-16T00:00:00.000Z",
        causationId: result.id,
        correlationId: checkpoint.context.correlationId,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        taskId: mounted.taskId,
        runType: mounted.runType,
        attemptId: mounted.attemptId,
        retryGeneration: 0,
        leaseClaimGeneration: mounted.claim.payload.leaseClaimGeneration,
        releasedBy: "agent_wake_resident",
        releasedAt: "2026-07-16T00:00:00.000Z",
        releaseReason: "resident-loop-suspended",
        claimEventId: mounted.claim.id,
        checkpointEventId: checkpoint.id,
        safeNextActions: [...material.checkpoint.safeNextActions]
      }
    }) as KnowledgeEventOf<"agent.task.orchestration.released">;
  }
  const after = await mounted.handle.ledger.readAll();
  const readback = state === 4
    ? Object.freeze({
        schemaVersion: "resident-loop-released-checkpoint-readback.v1" as const,
        checkpointEventId: checkpoint.id,
        suspensionEventId: suspension!.id,
        resultEventId: result!.id,
        releaseEventId: release!.id
      })
    : undefined;
  return Object.freeze({
    ...mounted,
    locator: material.locator,
    readback,
    checkpoint,
    suspension,
    result,
    release,
    appendedTypes: after
      .slice(before.length)
      .map((event) => event.type)
      .filter((type): type is typeof residentPrefixTypes[number] =>
        residentPrefixTypes.includes(type as typeof residentPrefixTypes[number])
      )
  });
}

async function appendResidentCurrentnessMutation(
  mounted: Awaited<ReturnType<typeof issuedResidentFixture>>,
  mutation:
    | "competing-release"
    | "terminal"
    | "new-generation"
    | "changed-run"
    | "changed-causation"
    | "changed-owner"
    | "target-suffix"
    | "foreign-suffix"
) {
  const correlationId = `corr_${mounted.taskId}`;
  const streamId = `agent_task_orchestration_${mounted.taskId}_${mounted.runType}`;
  const context = {
    actor: mutation === "changed-owner"
      ? { id: "agent_foreign_owner", kind: "agent" as const, label: "Foreign owner" }
      : { id: "agent_wake_resident", kind: "agent" as const, label: "Wake resident authority" },
    occurredAt: "2026-07-16T00:00:00.000Z",
    causationId: mutation === "changed-causation"
      ? (await mounted.handle.ledger.readAll())[0]!.id
      : mounted.claim.id,
    correlationId,
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
  if (
    mutation === "competing-release" ||
    mutation === "changed-causation" ||
    mutation === "changed-owner"
  ) {
    await mounted.handle.ledger.append({
      type: "agent.task.orchestration.released",
      version: 1,
      streamId,
      context,
      payload: {
        taskId: mounted.taskId,
        runType: mounted.runType,
        attemptId: mounted.attemptId,
        retryGeneration: 0,
        leaseClaimGeneration: mounted.claim.payload.leaseClaimGeneration,
        releasedBy: context.actor.id,
        releasedAt: context.occurredAt,
        releaseReason: "worker-shutdown",
        claimEventId: mounted.claim.id,
        safeNextActions: ["reclaim only after exact durable authority revalidation"]
      }
    });
    return;
  }
  if (mutation === "terminal" || mutation === "changed-run") {
    await mounted.handle.ledger.append({
      type: "agent.task.orchestration.failed",
      version: 1,
      streamId,
      context,
      payload: {
        taskId: mounted.taskId,
        runType: mounted.runType,
        attemptId: mounted.attemptId,
        retryGeneration: 0,
        failedAt: context.occurredAt,
        category: "model-output-invalid",
        message: "The mounted resident attempt terminated durably.",
        retryable: false,
        allowedActions: ["inspect exact durable failure"],
        ...(mutation === "changed-run" ? { runId: `run_foreign_${mounted.taskId}` } : {}),
        relatedEventIds: [mounted.claim.id]
      }
    });
    return;
  }
  if (mutation === "new-generation" || mutation === "foreign-suffix") {
    const foreign = mutation === "foreign-suffix";
    const taskId = foreign ? `task_foreign_${mounted.taskId}` : mounted.taskId;
    await mounted.handle.ledger.append({
      type: "agent.task.orchestration.claimed",
      version: 1,
      streamId: foreign
        ? `agent_task_orchestration_${taskId}_${mounted.runType}`
        : streamId,
      context,
      payload: {
        ...mounted.claim.payload,
        taskId,
        leaseClaimGeneration: mounted.claim.payload.leaseClaimGeneration + 1,
        idempotencyKey: `claim_${mutation}_${mounted.taskId}`,
        selectedOrderingPosition: {
          ...mounted.claim.payload.selectedOrderingPosition,
          taskId
        },
        causationEventId: mounted.claim.id
      }
    });
    return;
  }
  await mounted.handle.ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId,
    context,
    payload: {
      taskId: mounted.taskId,
      runType: mounted.runType,
      attemptId: mounted.attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: mounted.claim.payload.leaseClaimGeneration,
      checkpointKind: "context-ready",
      checkpointedAt: context.occurredAt,
      runId: mounted.runId,
      resumeIdempotencyKey: `unrecognized-target-suffix-${mounted.taskId}`,
      contextBindings: [],
      safeNextActions: ["inspect exact durable target suffix"]
    }
  });
}

async function appendHostileResidentPrefixMutation(
  mounted: Awaited<ReturnType<typeof seededResidentPrefix>>,
  mutation:
    | "changed-s"
    | "changed-r"
    | "changed-release"
    | "semantic-key"
    | "causation"
    | "order"
    | "result"
    | "deadline"
    | "next-action"
    | "duplicate"
    | "skipped"
    | "missing"
    | "extra-target-suffix"
) {
  const checkpoint = mounted.checkpoint;
  const suspension = mounted.suspension!;
  const result = mounted.result!;
  const release = mounted.release!;
  if (
    mutation === "changed-s" ||
    mutation === "causation" ||
    mutation === "order" ||
    mutation === "duplicate"
  ) {
    await mounted.handle.ledger.append({
      type: suspension.type,
      version: suspension.version,
      streamId: suspension.streamId,
      context: {
        ...suspension.context,
        causationId: mutation === "causation"
          ? mounted.claim.id
          : mutation === "order"
            ? result.id
            : suspension.context.causationId
      },
      payload: mutation === "changed-s"
        ? {
            ...suspension.payload,
            checkpoint: {
              ...suspension.payload.checkpoint,
              resumptionDeadlineAt: "2026-07-16T02:00:00.000Z"
            }
          }
        : {
            ...suspension.payload,
            causationId: mutation === "causation"
              ? mounted.claim.id
              : mutation === "order"
                ? result.id
                : suspension.payload.causationId,
            checkpoint: mutation === "causation" || mutation === "order"
              ? {
                  ...suspension.payload.checkpoint,
                  orchestrationCheckpointEventId: mutation === "causation"
                    ? mounted.claim.id
                    : result.id
                }
              : suspension.payload.checkpoint
          }
    });
    return;
  }
  if (mutation === "changed-r" || mutation === "result") {
    await mounted.handle.ledger.append({
      type: result.type,
      version: result.version,
      streamId: result.streamId,
      context: result.context,
      payload: mutation === "changed-r"
        ? { ...result.payload, resultHash: residentHash("c") }
        : {
            ...result.payload,
            resumeAnchor: {
              ...result.payload.resumeAnchor!,
              nextSafeAction: "a changed target-prefix action"
            }
          }
    });
    return;
  }
  if (mutation === "changed-release") {
    await mounted.handle.ledger.append({
      type: release.type,
      version: release.version,
      streamId: release.streamId,
      context: { ...release.context, causationId: mounted.claim.id },
      payload: release.payload
    });
    return;
  }
  if (
    mutation === "semantic-key" ||
    mutation === "deadline" ||
    mutation === "next-action"
  ) {
    const instruction = checkpoint.payload.residentLoopSuspension!;
    await mounted.handle.ledger.append({
      type: checkpoint.type,
      version: checkpoint.version,
      streamId: checkpoint.streamId,
      context: checkpoint.context,
      payload: {
        ...checkpoint.payload,
        residentLoopSuspension: {
          ...instruction,
          ...(mutation === "semantic-key"
            ? { suspensionSemanticKey: residentHash("d") }
            : {}),
          ...(mutation === "deadline"
            ? { resumptionDeadlineAt: "2026-07-16T02:00:00.000Z" }
            : {}),
          ...(mutation === "next-action"
            ? { nextSafeAction: "a changed checkpoint action" }
            : {})
        }
      }
    });
    return;
  }
  if (mutation === "skipped") {
    await mounted.handle.ledger.append({
      type: "agent.task.orchestration.released",
      version: 1,
      streamId: checkpoint.streamId,
      context: { ...release.context, causationId: mounted.claim.id },
      payload: {
        ...release.payload,
        releaseReason: "worker-shutdown",
        checkpointEventId: undefined,
        safeNextActions: ["inspect the prematurely skipped target suffix"]
      }
    });
    return;
  }
  if (mutation === "missing") {
    await mounted.handle.ledger.append({
      type: "agent.task.orchestration.checkpointed",
      version: 1,
      streamId: checkpoint.streamId,
      context: checkpoint.context,
      payload: {
        taskId: mounted.taskId,
        runType: mounted.runType,
        attemptId: mounted.attemptId,
        retryGeneration: 0,
        leaseClaimGeneration: mounted.claim.payload.leaseClaimGeneration,
        checkpointKind: "context-ready",
        checkpointedAt: checkpoint.payload.checkpointedAt,
        runId: mounted.runId,
        resumeIdempotencyKey: checkpoint.payload.resumeIdempotencyKey,
        contextBindings: [],
        safeNextActions: ["inspect the target checkpoint missing its resident instruction"]
      }
    });
    return;
  }
  await mounted.handle.ledger.append({
    type: "agent.task.orchestration.failed",
    version: 1,
    streamId: checkpoint.streamId,
    context: { ...release.context, causationId: release.id },
    payload: {
      taskId: mounted.taskId,
      runType: mounted.runType,
      attemptId: mounted.attemptId,
      retryGeneration: 0,
      failedAt: release.context.occurredAt,
      category: "model-output-invalid",
      message: "An extra target-stream suffix follows the released resident prefix.",
      retryable: false,
      allowedActions: ["inspect exact durable target suffix"],
      runId: mounted.runId,
      relatedEventIds: [release.id]
    }
  });
}

async function appendResidentRequestedStage(
  mounted: Awaited<ReturnType<typeof issuedResidentFixture>>,
  plan: KnowledgeEventOf<"agent.resident-plan.recorded.v2">,
  logicalLocator: Readonly<Record<string, unknown>>
) {
  const prepare = Reflect.get(
    mounted.domainPreviewPort,
    "prepareResidentDomainExecution"
  );
  if (typeof prepare !== "function") {
    throw new Error("package-owned resident preview port is required");
  }
  const portPreview = residentRecord(
    await Reflect.apply(prepare, mounted.domainPreviewPort, [{
      phase: "preview",
      logicalLocator
    }]),
    "package-owned resident current preview"
  );
  const currentPreview = residentRecord(
    portPreview.currentPreview,
    "package-owned resident preview envelope"
  );
  const descriptor = residentRecord(
    portPreview.descriptor,
    "package-owned resident descriptor"
  );
  const step = plan.payload.steps[0];
  if (step === undefined) throw new Error("resident request fixture requires its planned step");
  const executionCapabilityHash = String(portPreview.executionCapabilityHash);
  if (!/^sha256:[a-f0-9]{64}$/.test(executionCapabilityHash)) {
    throw new Error("resident request fixture requires its package capability hash");
  }
  const streamId = `agent_resident_domain_${createHash("sha256")
    .update(residentCanonicalJson(logicalLocator))
    .digest("hex")}`;
  return await mounted.handle.ledger.append({
    type: "agent.resident-domain.requested.v1",
    version: 1,
    streamId,
    context: {
      actor: { id: "agent_wake_resident", kind: "agent", label: "Wake resident authority" },
      occurredAt: "2026-07-16T00:00:00.000Z",
      causationId: plan.id,
      correlationId: plan.payload.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      schemaVersion: "resident-domain-requested.v1",
      logicalLocator: logicalLocator as never,
      executionCapabilityHash: executionCapabilityHash as `sha256:${string}`,
      causationId: plan.id,
      correlationId: plan.payload.correlationId,
      authorizationKind: Number(portPreview.catalogOrdinal) === 10
        ? "automatic-policy"
        : "human-approval",
      planRecordEventId: plan.id,
      previewHash: hashAgentToolPreview(currentPreview.preview as never),
      allowlistEntryHash: step.allowlistEntryHash,
      sideEffectClass: descriptor.sideEffectClass as never,
      expectedSafeOutputClass: step.expectedSafeOutputClass,
      requiredApprovalClass: descriptor.requiredApprovalClass as never,
      sourceEventIds: [...plan.payload.sourceEventIds],
      contextPackRefs: [...plan.payload.contextPackRefs],
      inputArtifactHashes: [...(currentPreview.inputArtifactHashes as readonly `sha256:${string}`[])],
      policy: plan.payload.policy,
      authority: plan.payload.authority,
      budget: plan.payload.budget
    }
  }) as KnowledgeEventOf<"agent.resident-domain.requested.v1">;
}

async function appendResidentApprovalDecision(
  mounted: Awaited<ReturnType<typeof seededResidentPrefix>>
) {
  const instruction = mounted.checkpoint.payload.residentLoopSuspension!;
  const request = (await mounted.handle.ledger.readAll()).find(
    (event): event is KnowledgeEventOf<"agent.resident-domain.requested.v1"> =>
      event.id === instruction.requestEventId &&
      event.type === "agent.resident-domain.requested.v1"
  );
  if (request === undefined || request.payload.authorizationKind !== "human-approval") {
    throw new Error("approval reclaim fixture requires one exact human request");
  }
  await mounted.handle.ledger.append({
    type: "agent.resident-domain.human-approved.v1",
    version: 1,
    streamId: request.streamId,
    context: {
      actor: { id: "actor_wake_resident_reviewer", kind: "human", label: "Wake resident reviewer" },
      occurredAt: "2026-07-16T00:30:00.000Z",
      causationId: request.id,
      correlationId: request.payload.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      schemaVersion: "resident-domain-human-approved.v1",
      logicalLocator: request.payload.logicalLocator,
      executionCapabilityHash: request.payload.executionCapabilityHash,
      causationId: request.id,
      correlationId: request.payload.correlationId,
      authorizationKind: "human-approval",
      requestEventId: request.id,
      decisionEventId: `evt_wake_resident_reclaim_decision_${mounted.taskId}`,
      approvedBy: "actor_wake_resident_reviewer",
      approvedPreviewHash: request.payload.previewHash
    }
  });
}

async function appendResidentIneligibleTransition(
  mounted: Awaited<ReturnType<typeof seededResidentPrefix>>,
  status: "canceled" | "terminal"
) {
  if (status === "canceled") {
    await mounted.handle.ledger.append({
      type: "agent.task.status.changed",
      version: 1,
      streamId: `agent_task_${mounted.taskId}`,
      context: {
        actor: { id: "agent_wake_resident", kind: "agent", label: "Wake resident authority" },
        occurredAt: "2026-07-16T00:30:00.000Z",
        causationId: mounted.release!.id,
        correlationId: `corr_${mounted.taskId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        taskId: mounted.taskId,
        status: "canceled",
        changedBy: "agent_wake_resident",
        reason: "The durable task was canceled before reclaim."
      }
    });
    return;
  }
  await mounted.handle.ledger.append({
    type: "agent.task.orchestration.failed",
    version: 1,
    streamId: mounted.checkpoint.streamId,
    context: {
      ...mounted.release!.context,
      occurredAt: "2026-07-16T00:30:00.000Z",
      causationId: mounted.release!.id
    },
    payload: {
      taskId: mounted.taskId,
      runType: mounted.runType,
      attemptId: mounted.attemptId,
      retryGeneration: 0,
      failedAt: "2026-07-16T00:30:00.000Z",
      category: "model-output-invalid",
      message: "The durable resident work became terminal before reclaim.",
      retryable: false,
      allowedActions: ["inspect exact durable failure"],
      runId: mounted.runId,
      relatedEventIds: [mounted.release!.id]
    }
  });
}

function residentEffectEventIds(events: readonly KnowledgeEvent[]): readonly string[] {
  return events
    .filter((event) =>
      event.type === "agent.resident-domain.outcome-observed.v1" ||
      event.type === "agent.resident-domain.completed.v1"
    )
    .map((event) => event.id);
}

function residentCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => residentCanonicalJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${residentCanonicalJson(record[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
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
