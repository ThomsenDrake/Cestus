import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { types } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
import * as wakeSupervisorSurface from "../../agent/src/wake-supervisor.js";
import { createLegacyImportRuntime, type LegacyImportRuntime } from "../../ingestion/src/legacy-runtime.js";
import { mountedWorkspaceCapabilities } from "../../ingestion/src/mount-contract.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { createAgentProviderConfiguration } from "../src/agent-provider-configuration.js";
import { issueMountedArtifactAuthorityOperationForFactory } from "../src/mounted-artifact-authority-operation.js";
import {
  inspectMountedProviderAuthority,
  issueMountedProviderAuthority
} from "../src/mounted-provider-authority.js";
import { createPortableMountedAgentArtifactStoreProducer } from "../src/portable-mounted-agent-artifact-stores.js";
import * as residentLoopFactoryCompositionSurface from "../src/resident-loop-factory-composition.js";
import type {
  ResidentLoopFactoryAuthorityReadback,
  ResidentLoopFactoryComposition
} from "../src/resident-loop-factory-composition.js";
import { createResidentLoopProviderPosture } from "../src/resident-loop-provider-posture.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";
import type { ResidentLoopFactoryPorts } from "../src/resident-loop-factory-ports.js";
import {
  createWakeSupervisorRuntime,
  type WakeSupervisorRuntime
} from "../src/wake-supervisor-runtime.js";

type FactoryPortsApi = {
  readonly createResidentLoopFactoryPorts: (input: unknown) => ResidentLoopFactoryPorts;
};

type Hash = `sha256:${string}`;

const directories: string[] = [];
const handles: LocalRuntimeHandle[] = [];
const compositions: ResidentLoopFactoryComposition[] = [];
const genericWakeRuntimes: WakeSupervisorRuntime[] = [];
const policy = Object.freeze({
  policyVersion: "policy_factory_ports_v1",
  policyDigest: hash("a"),
  lockStateDigest: hash("b")
});

afterEach(async () => {
  for (const runtime of genericWakeRuntimes.splice(0).reverse()) {
    await runtime.stop().catch(() => undefined);
  }
  for (const composition of compositions.splice(0).reverse()) {
    await composition.stop().catch(() => undefined);
  }
  for (const handle of handles.splice(0)) handle.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("resident loop factory ports", () => {
  it("admits only an exact Core/P2 data pairing and returns no mounted authority", async () => {
    const fixture = await mountedPortsFixture("current");
    const api = await factoryPortsApi();

    let getterCalls = 0;
    let proxyCalls = 0;
    const output = api.createResidentLoopFactoryPorts(Object.freeze({
      authorityReadback: fixture.authorityReadback,
      providerPosture: fixture.providerPosture
    }));

    expect(output).toMatchObject({
      schemaVersion: "resident-loop-factory-ports.v1",
      residentAgentId: "agent_default",
      workspace: fixture.providerPosture.workspace,
      run: fixture.providerPosture.run,
      providerPosture: {
        selection: { providerId: "provider_openai_compatible", modelId: "model_text_1" },
        approval: {
          required: true,
          approvalProfile: "remote-byte-transfer-gated",
          requiredApprovalClass: "provider-byte-transfer"
        }
      }
    });
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.workspace)).toBe(true);
    expect(Object.isFrozen(output.run)).toBe(true);
    expect(Object.isFrozen(output.providerPosture)).toBe(true);
    expect(JSON.stringify(output)).not.toMatch(/(?:runtimeHandle|ledger|witness|authority|credentialValue|secret|token|endpoint|url|host)/i);
    expect(Object.values(output).some((value) => typeof value === "function")).toBe(false);

    const accessor = Object.create(Object.prototype, {
      authorityReadback: { enumerable: true, get() { getterCalls += 1; return fixture.authorityReadback; } },
      providerPosture: { enumerable: true, value: fixture.providerPosture }
    });
    const proxy = new Proxy({ authorityReadback: fixture.authorityReadback, providerPosture: fixture.providerPosture }, {
      get(target, property, receiver) {
        proxyCalls += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    const copiedReadback = Object.freeze({
      ...fixture.authorityReadback,
      provider: Object.freeze({ ...fixture.authorityReadback.provider, workspaceId: "ws_factory_ports_other" })
    });
    const copiedPosture = Object.freeze({
      ...fixture.providerPosture,
      run: Object.freeze({ ...fixture.providerPosture.run, runId: "run_factory_ports_other" })
    });

    expect(() => api.createResidentLoopFactoryPorts(accessor)).toThrow(/factory ports/i);
    expect(() => api.createResidentLoopFactoryPorts(proxy)).toThrow(/factory ports/i);
    expect(() => api.createResidentLoopFactoryPorts({
      authorityReadback: fixture.authorityReadback,
      providerPosture: fixture.providerPosture,
      extra: undefined
    })).toThrow(/factory ports/i);
    expect(() => api.createResidentLoopFactoryPorts(Object.freeze({
      authorityReadback: copiedReadback,
      providerPosture: fixture.providerPosture
    }))).toThrow(/factory ports/i);
    expect(() => api.createResidentLoopFactoryPorts(Object.freeze({
      authorityReadback: fixture.authorityReadback,
      providerPosture: copiedPosture
    }))).toThrow(/factory ports/i);
    expect(getterCalls).toBe(0);
    expect(proxyCalls).toBe(0);
  });

  it("rejects hostile P2 posture text, nested proxies, exact-shape drift, and cross-field substitutions", async () => {
    const fixture = await mountedPortsFixture("hostile-posture");
    const api = await factoryPortsApi();
    let credentialProxyCalls = 0;
    const credentialReference = new Proxy(fixture.providerPosture.credentialReference, {
      get(target, property, receiver) {
        credentialProxyCalls += 1;
        return Reflect.get(target, property, receiver);
      }
    });

    const hostilePostures = [
      Object.freeze({
        ...fixture.providerPosture,
        selection: Object.freeze({ ...fixture.providerPosture.selection, providerId: "sk_live_abcdefghijklmnopqrst" })
      }),
      Object.freeze({
        ...fixture.providerPosture,
        credentialReference
      }),
      Object.freeze({
        ...fixture.providerPosture,
        credentialReference: Object.freeze({
          ...fixture.providerPosture.credentialReference,
          credentialRefId: "sk_live_abcdefghijklmnopqrst"
        })
      }),
      Object.freeze({
        ...fixture.providerPosture,
        credentialReference: Object.freeze({
          ...fixture.providerPosture.credentialReference,
          credentialKind: "subscription-oauth"
        })
      }),
      Object.freeze({
        ...fixture.providerPosture,
        feasibility: Object.freeze({ ...fixture.providerPosture.feasibility, lane: "local-engine" })
      }),
      Object.freeze({
        ...fixture.providerPosture,
        feasibility: Object.freeze({ ...fixture.providerPosture.feasibility, extra: "ignored" })
      }),
      Object.freeze({
        ...fixture.providerPosture,
        feasibility: Object.freeze({ ...fixture.providerPosture.feasibility, feasibilityId: "https://api.example.xyz" })
      }),
      Object.freeze({
        ...fixture.providerPosture,
        capability: Object.freeze({
          ...fixture.providerPosture.capability,
          capabilityId: "provider_other"
        })
      }),
      Object.freeze({
        ...fixture.providerPosture,
        feasibility: Object.freeze({
          ...fixture.providerPosture.feasibility,
          sourceEventIds: Object.freeze(["evt_binding_factory_ports"])
        })
      })
    ];

    for (const providerPosture of hostilePostures) {
      expect(() => api.createResidentLoopFactoryPorts(Object.freeze({
        authorityReadback: fixture.authorityReadback,
        providerPosture
      }))).toThrow(/factory ports/i);
    }
    expect(credentialProxyCalls).toBe(0);
  });

  it("runs createResidentBoundedAgentLoopFactory against the real mounted fixture", async () => {
    const fixture = await mountedFactoryFixture("record29-real-mounted");
    const exactStopFailure = new Error("abstract exact wake owner stop failure");
    const stopFailureFixture = await mountedFactoryFixture(
      "record29-stop-failure",
      { exactStopFailure }
    );
    await expectAlternateActivationPathsRemainInert(fixture);
    const constructionProbe = observeFutureFactoryCompositionConstruction();
    try {
      const factory = await boundedFactory();
      const before = await domainBoundarySnapshot(fixture);

      assertExactFrozenOwnDataSurface(fixture.factoryInput, [
        "authorityReadback",
        "domainExecution",
        "nowMonotonicMs",
        "providerPosture",
        "runtimeHandle",
        "wakeRuntime"
      ]);
      const issued = await factory(fixture.factoryInput);

      assertExactFrozenOwnDataSurface(issued, ["loop", "metadata", "stop"]);
      assertExactFrozenOwnDataSurface(issued.loop, ["advance", "resume"]);
      for (const operation of [
        issued.stop,
        issued.loop.advance,
        issued.loop.resume
      ]) {
        expect(typeof operation).toBe("function");
        expect(types.isProxy(operation)).toBe(false);
      }
      assertExactFrozenDataTree(
        issued.metadata,
        expectedFactoryMetadata(fixture.providerPosture)
      );
      expect(typeof issued.stop).toBe("function");
      expect(fixture.preparationCalls).toEqual({
        construction: 1,
        start: 1,
        preflight: 1,
        bind: 1
      });
      expect(constructionProbe.callCount()).toBe(0);
      assertNoAuthorityEscape(issued, fixture.authorityValues);
      expect(await domainBoundarySnapshot(fixture)).toEqual(before);

      await expect(Promise.all([issued.stop(), issued.stop()])).resolves.toEqual([
        undefined,
        undefined
      ]);
      const afterConcurrentStop = await domainBoundarySnapshot(fixture);
      await expect(issued.stop()).resolves.toBeUndefined();
      expect(await domainBoundarySnapshot(fixture)).toEqual(afterConcurrentStop);
      await expect(fixture.composition.wakeRuntime.supervision.resume({
        schemaVersion: "resident-wake-command.v1",
        commandId: "resume_factory_ports_after_stop",
        sourceEventIds: [],
        requestedAt: "2026-07-19T00:00:00.000Z",
        causation: {
          causationId: "evt_resume_factory_ports_after_stop",
          correlationId: "corr_resume_factory_ports_after_stop"
        }
      })).resolves.toMatchObject({
        outcome: "blocked",
        blocked: { category: "supervisor-stopped" }
      });
      expect(constructionProbe.callCount()).toBe(0);

      const failureProduct = await factory(stopFailureFixture.factoryInput);
      const failedStops = await Promise.allSettled([
        failureProduct.stop(),
        failureProduct.stop()
      ]);
      expect(failedStops.map((settled) => settled.status)).toEqual([
        "rejected",
        "rejected"
      ]);
      const firstFailure = failedStops[0];
      const secondFailure = failedStops[1];
      expect(firstFailure?.status).toBe("rejected");
      expect(secondFailure?.status).toBe("rejected");
      if (firstFailure?.status !== "rejected" || secondFailure?.status !== "rejected") {
        throw new Error("exact wake owner stop failure was not propagated");
      }
      expect(firstFailure.reason).toBe(exactStopFailure);
      expect(secondFailure.reason).toBe(firstFailure.reason);
      await expect(failureProduct.stop()).rejects.toBe(firstFailure.reason);
      expect(stopFailureFixture.exactOwnerStopCallCount()).toBe(1);
      expect(constructionProbe.callCount()).toBe(0);
    } finally {
      constructionProbe.restore();
    }
  });

  it("rejects fabricated swapped stale and substituted dispatcher capabilities", async () => {
    const factory = await boundedFactory();
    const owner = await mountedFactoryFixture("record29-owner");
    const foreign = await mountedFactoryFixture("record29-foreign");
    const stopped = await mountedFactoryFixture("record29-stopped");
    const staleRuntime = await mountedFactoryFixture("record29-stale-runtime");
    const retryable = await mountedFactoryFixture("record29-retryable");
    const burned = await mountedFactoryFixture("record29-burned");
    const staleDomain = await mountedFactoryFixture("record29-stale-domain");
    const single = await mountedFactoryFixture("record29-single");
    const concurrent = await mountedFactoryFixture("record29-concurrent");
    const substituted = await mountedFactoryFixture("record29-substituted");
    const replacement = await mountedFactoryFixture("record29-replacement");
    await stopped.composition.stop();

    const genericRuntime = createWakeSupervisorRuntime({
      runtimeHandle: foreign.handle,
      actor: foreign.actor,
      supervisorEpoch: "epoch_factory_ports_generic",
      policy,
      now: foreign.now,
      createSafeId: (kind) => `${kind}_factory_ports_generic`
    });
    genericWakeRuntimes.push(genericRuntime);

    let runtimeProxyReads = 0;
    let readbackProxyReads = 0;
    let handleProxyReads = 0;
    let topLevelAccessorReads = 0;
    let structuralCompositionCalls = 0;
    let callerStopCalls = 0;
    const runtimeProxy = new Proxy(owner.composition.wakeRuntime, {
      get(target, property, receiver) {
        runtimeProxyReads += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    const readbackProxy = new Proxy(owner.authorityReadback, {
      get(target, property, receiver) {
        readbackProxyReads += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    const handleProxy = new Proxy(owner.handle, {
      get(target, property, receiver) {
        handleProxyReads += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    const copiedRuntime = Object.freeze({
      supervision: owner.composition.wakeRuntime.supervision,
      stop: owner.composition.wakeRuntime.stop
    });
    const copiedReadback = Object.freeze({ ...owner.authorityReadback });
    const copiedHandle = Object.freeze({ ...owner.handle });

    for (const input of [
      preparedFactoryInput(owner, { wakeRuntime: copiedRuntime }),
      preparedFactoryInput(owner, { wakeRuntime: Object.freeze({}) }),
      preparedFactoryInput(owner, { wakeRuntime: runtimeProxy }),
      preparedFactoryInput(owner, { wakeRuntime: foreign.composition.wakeRuntime }),
      preparedFactoryInput(owner, { wakeRuntime: genericRuntime }),
      preparedFactoryInput(owner, { authorityReadback: copiedReadback }),
      preparedFactoryInput(owner, { authorityReadback: Object.freeze({}) }),
      preparedFactoryInput(owner, { authorityReadback: readbackProxy }),
      preparedFactoryInput(owner, { authorityReadback: foreign.authorityReadback }),
      preparedFactoryInput(owner, { runtimeHandle: copiedHandle }),
      preparedFactoryInput(owner, { runtimeHandle: Object.freeze({}) }),
      preparedFactoryInput(owner, { runtimeHandle: handleProxy }),
      preparedFactoryInput(owner, { runtimeHandle: foreign.handle })
    ]) {
      await expectFactoryRejectionBeforeReads(
        [owner, foreign],
        factory,
        input
      );
    }
    await expectFactoryRejectionBeforeReads(
      [stopped],
      factory,
      stopped.factoryInput
    );

    const staleRuntimeBefore = await domainBoundarySnapshot(staleRuntime);
    const staleRuntimeCallsBefore = { ...staleRuntime.runtimeCalls };
    const staleRuntimeProbe = installLedgerActivityProbe(staleRuntime);
    staleRuntime.handle.close();
    try {
      await expect(factory(staleRuntime.factoryInput)).rejects.toThrow(
        /capability|dispatcher|factory|resident|authority|handoff/i
      );
      expect(staleRuntimeProbe.snapshot()).toEqual({
        append: 0,
        readAll: 0,
        readStream: 0
      });
    } finally {
      staleRuntimeProbe.restore();
    }
    expect(staleRuntime.runtimeCalls).toEqual(staleRuntimeCallsBefore);
    expect(snapshotPortableNonLedgerFileSystem(staleRuntime.handle)).toEqual(
      staleRuntimeBefore.portableNonLedgerFileSystem
    );

    const accessorInput = Object.freeze(Object.create(Object.prototype, {
      runtimeHandle: {
        enumerable: true,
        get() {
          topLevelAccessorReads += 1;
          return owner.handle;
        }
      },
      wakeRuntime: { enumerable: true, value: owner.composition.wakeRuntime },
      authorityReadback: { enumerable: true, value: owner.authorityReadback },
      providerPosture: { enumerable: true, value: owner.providerPosture },
      domainExecution: { enumerable: true, value: owner.domainExecution },
      nowMonotonicMs: { enumerable: true, value: owner.nowMonotonicMs }
    }));
    await expectFactoryRejectionBeforeReads([owner], factory, accessorInput);
    expect(topLevelAccessorReads).toBe(0);

    await expectFactoryRejectionBeforeReads(
      [owner],
      factory,
      Object.freeze({
        ...owner.factoryInput,
        composition: Object.freeze({
          start() {
            structuralCompositionCalls += 1;
          }
        })
      })
    );
    await expectFactoryRejectionBeforeReads(
      [owner],
      factory,
      Object.freeze({
        ...owner.factoryInput,
        stop() {
          callerStopCalls += 1;
        }
      })
    );
    expect(structuralCompositionCalls).toBe(0);
    expect(callerStopCalls).toBe(0);
    expect(runtimeProxyReads).toBe(0);
    expect(readbackProxyReads).toBe(0);
    expect(handleProxyReads).toBe(0);

    await expectFactoryRejectionWithoutDomainEffects(
      [retryable],
      factory,
      preparedFactoryInput(retryable, { domainExecution: Object.freeze({}) })
    );
    const retryProduct = await factory(retryable.factoryInput);
    await retryProduct.stop();

    const invalidPosture = Object.freeze({
      ...burned.providerPosture,
      run: Object.freeze({
        ...burned.providerPosture.run,
        runId: "run_factory_ports_other"
      })
    });
    await expectFactoryRejectionWithoutDomainEffects(
      [burned],
      factory,
      preparedFactoryInput(burned, { providerPosture: invalidPosture })
    );
    await expectFactoryRejectionBeforeReads(
      [burned],
      factory,
      burned.factoryInput
    );

    const stalePort = dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort(Object.freeze({
      capability: staleDomain.domainExecution,
      mountedLedger: staleDomain.handle.ledger,
      workspaceId: staleDomain.providerPosture.workspace.workspaceId,
      residentAgentId: "agent_default",
      taskId: staleDomain.providerPosture.run.taskId
    }));
    expect(stalePort).toBeTypeOf("object");
    expect(Object.isFrozen(stalePort)).toBe(true);
    await expectFactoryRejectionWithoutDomainEffects(
      [staleDomain],
      factory,
      staleDomain.factoryInput
    );

    const singleActivity = await captureFactoryLedgerActivity(single, async () => {
      const product = await factory(single.factoryInput);
      await product.stop();
    });
    const concurrentActivity = await captureFactoryLedgerActivity(concurrent, async () => {
      const settled = await Promise.allSettled([
        factory(concurrent.factoryInput),
        factory(concurrent.factoryInput)
      ]);
      expect(settled.map((result) => result.status).sort()).toEqual([
        "fulfilled",
        "rejected"
      ]);
      const fulfilled = settled.find(
        (result): result is PromiseFulfilledResult<FactoryProduct> =>
          result.status === "fulfilled"
      );
      expect(fulfilled).toBeDefined();
      if (fulfilled === undefined) throw new Error("concurrent factory issued no product");
      await fulfilled.value.stop();
    });
    expect(concurrentActivity).toEqual(singleActivity);
    await expectFactoryRejectionBeforeReads(
      [concurrent],
      factory,
      concurrent.factoryInput
    );

    const substitutionFixtures = [substituted, replacement] as const;
    await expectFactoryRejectionWithoutDomainEffects(
      substitutionFixtures,
      factory,
      preparedFactoryInput(substituted, {
        domainExecution: replacement.domainExecution
      })
    );
  });
});

async function factoryPortsApi(): Promise<FactoryPortsApi> {
  const sourceModule = ["..", "src", "resident-loop-factory-ports.js"].join("/");
  const imported: unknown = await import(sourceModule).catch(() => undefined);
  expect(isFactoryPortsApi(imported)).toBe(true);
  if (!isFactoryPortsApi(imported)) throw new Error("resident loop factory ports module is unavailable");
  return imported;
}

function isFactoryPortsApi(value: unknown): value is FactoryPortsApi {
  return value !== null && typeof value === "object" &&
    typeof Reflect.get(value, "createResidentLoopFactoryPorts") === "function";
}

type ProviderPosture = Awaited<ReturnType<ReturnType<typeof createResidentLoopProviderPosture>["read"]>>;
type FactoryMetadata = ReturnType<FactoryPortsApi["createResidentLoopFactoryPorts"]>;
type FactoryProduct = {
  readonly metadata: FactoryMetadata;
  readonly loop: {
    readonly advance: (...args: unknown[]) => unknown;
    readonly resume: (...args: unknown[]) => unknown;
  };
  readonly stop: () => Promise<void>;
};
type BoundedFactory = (input: unknown) => Promise<FactoryProduct>;
type RuntimeBoundaryCalls = {
  preview: number;
  approval: number;
  effect: number;
};
type MountedFactoryFixture = {
  readonly handle: LocalRuntimeHandle;
  readonly actor: {
    readonly id: string;
    readonly kind: "agent";
    readonly label: string;
  };
  readonly now: () => string;
  readonly composition: ResidentLoopFactoryComposition;
  readonly authorityReadback: ResidentLoopFactoryAuthorityReadback;
  readonly providerAuthority: ReturnType<typeof issueMountedProviderAuthority>;
  readonly handoff: Awaited<ReturnType<ReturnType<typeof createPortableMountedAgentArtifactStoreProducer>["bind"]>>;
  readonly providerPosture: ProviderPosture;
  readonly domainExecution: object;
  readonly nowMonotonicMs: () => number;
  readonly factoryInput: Readonly<Record<string, unknown>>;
  readonly exactOwnerStopCallCount: () => number;
  readonly preparationCalls: Readonly<{
    readonly construction: 1;
    readonly start: 1;
    readonly preflight: 1;
    readonly bind: 1;
  }>;
  readonly runtimeCalls: RuntimeBoundaryCalls;
  readonly authorityValues: readonly unknown[];
};

async function mountedPortsFixture(suffix: string) {
  return await mountedFactoryFixture(suffix);
}

async function mountedFactoryFixture(
  suffix: string,
  options: Readonly<{ exactStopFailure?: Error }> = {}
): Promise<MountedFactoryFixture> {
  const root = mkdtempSync(join(tmpdir(), "cestus-factory-ports-"));
  directories.push(root);
  const workspaceId = `ws_factory_ports_${suffix}`;
  const workspaceRoot = join(root, workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: "Factory ports",
    createdAt: "2026-07-19T00:00:00.000Z",
    createdBy: "resident-loop-factory-ports-test"
  });
  const handle = createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({
      cwd: root,
      env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot }
    }),
    actor: { id: "actor_factory_ports", kind: "human", label: "Factory ports" },
    now: () => "2026-07-19T00:00:00.000Z"
  });
  handles.push(handle);
  await handle.residentIdentity.ready();
  const taskId = "task_factory_ports";
  const attemptId = `attempt_${"a".repeat(64)}`;
  const runId = "run_factory_ports";
  const runType = "evidence-triage" as const;
  const handoffLifecycle = Object.freeze({
    taskId,
    attemptId,
    runId,
    runType,
    retryGeneration: 0
  } as const);
  await seedMountedFactoryClaim(handle, suffix, handoffLifecycle);

  const actor = { id: "agent_factory_ports", kind: "agent", label: "Factory ports" } as const;
  const supervisorEpoch = `epoch_factory_ports_${suffix}`;
  const now = () => "2026-07-19T00:00:00.000Z";
  const createSafeId = (kind: "lease" | "diagnostic" | "reconciliation") => `${kind}_factory_ports_${suffix}`;
  const createWakeSupervisor = wakeSupervisorSurface.createWakeSupervisor;
  let exactOwnerStopCalls = 0;
  const supervisorSpy = options.exactStopFailure === undefined
    ? undefined
    : vi.spyOn(
      wakeSupervisorSurface,
      "createWakeSupervisor"
    ).mockImplementation((input) => {
      const created = createWakeSupervisor(input);
      return Object.freeze({
        ...created,
        async stop() {
          exactOwnerStopCalls += 1;
          await created.stop();
          throw options.exactStopFailure;
        }
      });
    });
  const composition = residentLoopFactoryCompositionSurface.createResidentLoopFactoryComposition(Object.freeze({
    runtimeHandle: handle,
    actor,
    supervisorEpoch,
    policy,
    now,
    createSafeId
  }));
  compositions.push(composition);
  try {
    await composition.start();
  } finally {
    supervisorSpy?.mockRestore();
  }
  const operation = issueMountedArtifactAuthorityOperationForFactory(composition.wakeRuntime);
  const providerAuthority = issueMountedProviderAuthority(Object.freeze({ operation }));
  const handoff = await createPortableMountedAgentArtifactStoreProducer(operation).bind({
    taskId,
    attemptId,
    approvedRunId: runId,
    runType,
    retryGeneration: 0
  });
  const authorityReadback = await composition.bind(Object.freeze({
    providerAuthority,
    handoffAuthorityWitness: handoff.binding.authorityWitness
  }));
  const providerReadback = await inspectMountedProviderAuthority(providerAuthority);
  const providerPosture = await createResidentLoopProviderPosture(Object.freeze({
    configuration: createAgentProviderConfiguration(configurationInput()),
    authority: providerAuthority
  })).read({
    workspaceId: providerReadback.workspaceId,
    mountInstanceId: providerReadback.mountInstanceId,
    admissionGenerationId: providerReadback.admissionGenerationId,
    taskId,
    attemptId,
    runId,
    promptArtifactHash: hash("c"),
    approvalPreviewHash: hash("d"),
    policyVersion: providerReadback.policyVersion,
    policyDigest: providerReadback.policyDigest,
    lockStateDigest: providerReadback.lockStateDigest,
    highWaterMark: providerReadback.highWaterMark,
    highWaterOrdinal: providerReadback.highWaterOrdinal
  });

  const connectedRuntime = connectedLegacyRuntime(handle);
  const domainExecution = await dispatcherDefault.createPackageOwnedResidentDomainExecutionCapability(
    Object.freeze({
      kind: "legacy-staging",
      workspaceId,
      residentAgentId: "agent_default",
      taskId,
      context: Object.freeze({
        runtime: connectedRuntime.runtime,
        ledger: handle.ledger,
        residentAgentId: "agent_default",
        sourceCollectionId: `source_collection_factory_ports_${suffix}`,
        scanBatchId: `scan_batch_factory_ports_${suffix}`,
        stagingBatchId: `staging_batch_factory_ports_${suffix}`,
        legacyReportId: `legacy_report_factory_ports_${suffix}`,
        reportHash: hash("f"),
        candidateSetHash: hash("1"),
        selectedCandidateIds: Object.freeze([`candidate_factory_ports_${suffix}`])
      })
    })
  );
  const nowMonotonicMs = () => 0;
  const factoryInput = Object.freeze({
    runtimeHandle: handle,
    wakeRuntime: composition.wakeRuntime,
    authorityReadback,
    providerPosture,
    domainExecution,
    nowMonotonicMs
  });

  return {
    handle,
    actor,
    now,
    composition,
    authorityReadback,
    providerAuthority,
    handoff,
    providerPosture,
    domainExecution,
    nowMonotonicMs,
    factoryInput,
    exactOwnerStopCallCount: () => exactOwnerStopCalls,
    preparationCalls: Object.freeze({
      construction: 1,
      start: 1,
      preflight: 1,
      bind: 1
    }),
    runtimeCalls: connectedRuntime.calls,
    authorityValues: Object.freeze([
      handle,
      handle.ledger,
      handle.mountedWorkspace,
      composition,
      composition.wakeRuntime,
      operation,
      providerAuthority,
      handoff,
      handoff.binding,
      handoff.binding.authorityWitness,
      handoff.controller,
      authorityReadback,
      authorityReadback.provider,
      authorityReadback.handoff,
      authorityReadback.handoff.authorityBinding,
      domainExecution,
      connectedRuntime.runtime
    ])
  };
}

async function seedMountedFactoryClaim(
  handle: LocalRuntimeHandle,
  suffix: string,
  binding: Readonly<{
    readonly taskId: string;
    readonly attemptId: string;
    readonly runId: string;
    readonly runType: "evidence-triage";
  }>
): Promise<void> {
  const { taskId, attemptId, runType } = binding;
  const occurredAt = "2026-07-19T00:00:00.000Z";
  const actor = {
    id: "agent_default",
    kind: "agent" as const,
    label: "Resident agent"
  };
  const identity = (await handle.ledger.readAll()).find(
    (event) => event.type === "agent.identity.initialized"
  );
  if (identity === undefined) {
    throw new Error("factory fixture resident identity is required");
  }
  const taskCreated = await handle.ledger.append({
    type: "agent.task.created",
    version: 1,
    streamId: `agent_task_${taskId}`,
    context: {
      actor,
      occurredAt,
      causationId: identity.id,
      correlationId: `corr_${taskId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      taskId,
      residentAgentId: "agent_default",
      title: "Factory ports",
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
      actor,
      occurredAt,
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
  const claim = await handle.ledger.append({
    type: "agent.task.orchestration.claimed",
    version: 1,
    streamId: `agent_task_orchestration_${taskId}_${runType}`,
    context: {
      actor,
      occurredAt,
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
      claimedAt: occurredAt,
      leaseExpiresAt: "2026-07-19T01:00:00.000Z",
      idempotencyKey: `claim_factory_ports_${suffix}`,
      selectedOrderingPosition: {
        priorityRank: 0,
        queuedAt: occurredAt,
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
    throw new Error("factory fixture orchestration claim is required");
  }
}

function connectedLegacyRuntime(handle: LocalRuntimeHandle): {
  readonly runtime: LegacyImportRuntime;
  readonly calls: RuntimeBoundaryCalls;
} {
  const portable = handle.mountedWorkspace;
  if (portable === undefined) throw new Error("factory fixture requires a mounted portable workspace");
  const actual = createLegacyImportRuntime({
    mountedWorkspace: {
      workspaceId: portable.workspaceId,
      label: "Factory ports legacy runtime",
      ledger: handle.ledger,
      blobStore: new FileBlobStore(portable.paths.blobRoot),
      derivativeStore: new FileBlobStore(portable.paths.derivativeRoot),
      jobStateRoot: portable.paths.jobRoot,
      capabilities: mountedWorkspaceCapabilities({
        canReadLedger: true,
        canAppendLedger: true,
        canWriteBlobs: true,
        canWriteDerivatives: true,
        canWriteJobState: true
      })
    },
    actor: { id: "actor_factory_ports", kind: "human", label: "Factory ports" }
  });
  const calls: RuntimeBoundaryCalls = { preview: 0, approval: 0, effect: 0 };
  const runtime = Object.freeze({
    ...actual,
    async stagingPreview(input: Parameters<LegacyImportRuntime["stagingPreview"]>[0]) {
      calls.preview += 1;
      return await actual.stagingPreview(input);
    },
    async approveStaging(input: Parameters<LegacyImportRuntime["approveStaging"]>[0]) {
      calls.approval += 1;
      return await actual.approveStaging(input);
    },
    async stageApproved(input: Parameters<LegacyImportRuntime["stageApproved"]>[0]) {
      calls.effect += 1;
      return await actual.stageApproved(input);
    }
  }) satisfies LegacyImportRuntime;
  return Object.freeze({ runtime, calls });
}

function expectedFactoryMetadata(
  providerPosture: ProviderPosture
): FactoryMetadata {
  return Object.freeze({
    schemaVersion: "resident-loop-factory-ports.v1",
    residentAgentId: "agent_default",
    workspace: Object.freeze({
      workspaceId: providerPosture.workspace.workspaceId,
      mountInstanceId: providerPosture.workspace.mountInstanceId,
      admissionGenerationId: providerPosture.workspace.admissionGenerationId,
      policyVersion: providerPosture.workspace.policyVersion,
      policyDigest: providerPosture.workspace.policyDigest,
      lockStateDigest: providerPosture.workspace.lockStateDigest,
      highWaterMark: providerPosture.workspace.highWaterMark,
      highWaterOrdinal: providerPosture.workspace.highWaterOrdinal
    }),
    run: Object.freeze({
      taskId: providerPosture.run.taskId,
      attemptId: providerPosture.run.attemptId,
      runId: providerPosture.run.runId
    }),
    providerPosture: Object.freeze({
      selection: Object.freeze({
        providerId: providerPosture.selection.providerId,
        modelId: providerPosture.selection.modelId,
        adapterVersion: providerPosture.selection.adapterVersion
      }),
      capability: Object.freeze({
        capabilityId: providerPosture.capability.capabilityId,
        capabilityVersion: providerPosture.capability.capabilityVersion,
        capabilityHash: providerPosture.capability.capabilityHash,
        capabilityRevision: providerPosture.capability.capabilityRevision
      }),
      approval: Object.freeze({
        required: true,
        approvalProfile: providerPosture.approval.approvalProfile,
        requiredApprovalClass: providerPosture.approval.requiredApprovalClass
      }),
      binding: Object.freeze({
        promptArtifactHash: providerPosture.binding.promptArtifactHash,
        approvalPreviewHash: providerPosture.binding.approvalPreviewHash
      })
    })
  });
}

function assertExactFrozenDataTree(actual: unknown, expected: unknown): void {
  expect(actual).toStrictEqual(expected);
  const visit = (actualValue: unknown, expectedValue: unknown): void => {
    if (
      expectedValue === null ||
      typeof expectedValue !== "object"
    ) {
      return;
    }
    expect(actualValue).not.toBeNull();
    expect(typeof actualValue).toBe("object");
    if (actualValue === null || typeof actualValue !== "object") return;
    expect(types.isProxy(actualValue)).toBe(false);
    expect(Array.isArray(actualValue)).toBe(false);
    expect(Object.getPrototypeOf(actualValue)).toBe(Object.prototype);
    expect(Object.isFrozen(actualValue)).toBe(true);
    const actualKeys = Reflect.ownKeys(actualValue);
    expect(
      actualKeys.every((key) => typeof key === "string"),
      "factory metadata must not contain symbol-keyed fields"
    ).toBe(true);
    expect(
      actualKeys.filter((key): key is string => typeof key === "string").sort()
    ).toEqual(Object.keys(expectedValue).sort());
    for (const key of Object.keys(expectedValue)) {
      const descriptor = Object.getOwnPropertyDescriptor(actualValue, key);
      expect(descriptor?.enumerable).toBe(true);
      expect(descriptor?.get).toBeUndefined();
      expect(descriptor?.set).toBeUndefined();
      if (descriptor !== undefined && Object.hasOwn(descriptor, "value")) {
        visit(descriptor.value, Reflect.get(expectedValue, key));
      }
    }
  };
  visit(actual, expected);
}

function assertExactFrozenOwnDataSurface(
  value: unknown,
  expectedKeys: readonly string[]
): asserts value is Readonly<Record<string, unknown>> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe("object");
  if (value === null || typeof value !== "object") return;
  expect(types.isProxy(value)).toBe(false);
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  expect(Object.isFrozen(value)).toBe(true);
  expect(Reflect.ownKeys(value).sort()).toEqual([...expectedKeys].sort());
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    expect(descriptor?.enumerable).toBe(true);
    expect(descriptor?.get).toBeUndefined();
    expect(descriptor?.set).toBeUndefined();
    expect(descriptor !== undefined && Object.hasOwn(descriptor, "value")).toBe(true);
  }
}

function observeFutureFactoryCompositionConstruction(): {
  readonly callCount: () => number;
  readonly restore: () => void;
} {
  const createComposition =
    residentLoopFactoryCompositionSurface.createResidentLoopFactoryComposition;
  let calls = 0;
  const createSpy = vi.spyOn(
    residentLoopFactoryCompositionSurface,
    "createResidentLoopFactoryComposition"
  ).mockImplementation((rawInput: unknown) => {
    calls += 1;
    return createComposition(rawInput);
  });
  return Object.freeze({
    callCount: () => calls,
    restore: () => createSpy.mockRestore()
  });
}

async function expectAlternateActivationPathsRemainInert(
  fixture: MountedFactoryFixture
): Promise<void> {
  const before = await domainBoundarySnapshot(fixture);
  const [
    defaultRuntimeSurface,
    routeSurface,
    operatorStatusSurface,
    httpHandlerSurface,
    serverSurface
  ] = await Promise.all([
    import("../src/agent-runtime-factory.js"),
    import("../src/agent-http-routes.js"),
    import("../src/operator-status-providers.js"),
    import("../src/http-handler.js"),
    import("../src/server.js")
  ]);

  for (const surface of [
    defaultRuntimeSurface,
    routeSurface,
    operatorStatusSurface,
    httpHandlerSurface,
    serverSurface
  ]) {
    expect(
      Reflect.has(surface, "createResidentBoundedAgentLoopFactory"),
      "bounded factory must not be exposed through an alternate activation surface"
    ).toBe(false);
  }

  const defaultRuntimeInput = {
    handle: fixture.handle,
    actor: fixture.actor,
    now: fixture.now
  };
  expect(
    () => defaultRuntimeSurface.defaultLocalAgentRuntimeFactory(defaultRuntimeInput)
  ).toThrow(/blocked\.factory-context-attestation-required/i);

  const routeResponse = await routeSurface.handleAgentHttpRoute({
    request: { method: "GET", url: "/api/agent/status" },
    handle: fixture.handle,
    actor: fixture.actor,
    now: fixture.now
  });
  expect(routeResponse?.status).toBe(500);

  const providers = operatorStatusSurface.createDefaultOperatorStatusProviders({
    config: fixture.handle.config,
    actor: { id: "actor_factory_ports", kind: "human", label: "Factory ports" },
    handle: fixture.handle,
    now: fixture.now
  });
  const agentStatusProvider = providers.agent;
  expect(agentStatusProvider).toBeTypeOf("function");
  if (agentStatusProvider === undefined) {
    throw new Error("default operator status agent provider is unavailable");
  }
  await expect(agentStatusProvider()).rejects.toThrow(
    /blocked\.factory-context-attestation-required/i
  );

  expect(await domainBoundarySnapshot(fixture)).toEqual(before);
}

async function boundedFactory(): Promise<BoundedFactory> {
  const modulePath = ["..", "src", "resident-loop-factory-ports.js"].join("/");
  const imported: unknown = await import(modulePath);
  const candidate = imported !== null && typeof imported === "object"
    ? Reflect.get(imported, "createResidentBoundedAgentLoopFactory")
    : undefined;
  expect(
    candidate,
    "approved createResidentBoundedAgentLoopFactory deep API is absent"
  ).toBeTypeOf("function");
  if (typeof candidate !== "function") {
    throw new Error("approved createResidentBoundedAgentLoopFactory deep API is absent");
  }

  return async (input: unknown) => {
    const product: unknown = await Reflect.apply(candidate, undefined, [input]);
    if (product === null || typeof product !== "object") {
      throw new Error("bounded resident loop factory returned no product");
    }
    return product as FactoryProduct;
  };
}

function preparedFactoryInput(
  fixture: MountedFactoryFixture,
  replacements: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...fixture.factoryInput, ...replacements });
}

async function expectFactoryRejectionWithoutDomainEffects(
  fixtures: readonly MountedFactoryFixture[],
  factory: BoundedFactory,
  input: unknown
): Promise<void> {
  const before = await domainBoundarySnapshots(fixtures);
  await expect(factory(input)).rejects.toThrow(
    /capability|dispatcher|factory|resident|authority|handoff/i
  );
  expect(await domainBoundarySnapshots(fixtures)).toEqual(before);
}

async function expectFactoryRejectionBeforeReads(
  fixtures: readonly MountedFactoryFixture[],
  factory: BoundedFactory,
  input: unknown
): Promise<void> {
  const before = await domainBoundarySnapshots(fixtures);
  const probes = fixtures.map(installLedgerActivityProbe);
  try {
    await expect(factory(input)).rejects.toThrow(
      /capability|dispatcher|factory|resident|authority|handoff/i
    );
    for (const probe of probes) {
      expect(probe.snapshot()).toEqual({
        append: 0,
        readAll: 0,
        readStream: 0
      });
    }
  } finally {
    for (const probe of probes.reverse()) probe.restore();
  }
  expect(await domainBoundarySnapshots(fixtures)).toEqual(before);
}

type LedgerActivity = Readonly<{
  append: number;
  readAll: number;
  readStream: number;
}>;

function installLedgerActivityProbe(fixture: MountedFactoryFixture): {
  readonly snapshot: () => LedgerActivity;
  readonly restore: () => void;
} {
  const append = vi.spyOn(fixture.handle.ledger, "append");
  const readAll = vi.spyOn(fixture.handle.ledger, "readAll");
  const readStream = vi.spyOn(fixture.handle.ledger, "readStream");
  append.mockClear();
  readAll.mockClear();
  readStream.mockClear();
  return Object.freeze({
    snapshot: () => Object.freeze({
      append: append.mock.calls.length,
      readAll: readAll.mock.calls.length,
      readStream: readStream.mock.calls.length
    }),
    restore: () => {
      readStream.mockRestore();
      readAll.mockRestore();
      append.mockRestore();
    }
  });
}

async function captureFactoryLedgerActivity(
  fixture: MountedFactoryFixture,
  execute: () => Promise<void>
): Promise<LedgerActivity> {
  const before = await domainBoundarySnapshot(fixture);
  const probe = installLedgerActivityProbe(fixture);
  let activity: LedgerActivity;
  try {
    await execute();
    activity = probe.snapshot();
  } finally {
    probe.restore();
  }
  expect(await domainBoundarySnapshot(fixture)).toEqual(before);
  return activity!;
}

async function domainBoundarySnapshots(
  fixtures: readonly MountedFactoryFixture[]
): Promise<readonly Awaited<ReturnType<typeof domainBoundarySnapshot>>[]> {
  return await Promise.all(fixtures.map(domainBoundarySnapshot));
}

async function domainBoundarySnapshot(fixture: MountedFactoryFixture) {
  const events = await fixture.handle.ledger.readAll();
  return Object.freeze({
    ledgerEventCount: events.length,
    providerLedgerEvents: countEvents(events, (type) =>
      /(?:provider|model).*(?:request|invocation|response|completion)/i.test(type)
    ),
    gatewayLedgerEvents: countEvents(events, (type) =>
      /^agent\.(?:tool|domain|resident-domain)\./i.test(type)
    ),
    approvalLedgerEvents: countEvents(events, (type) =>
      /(?:approved|approval|permission\.granted)(?:\.v\d+)?$/i.test(type)
    ),
    effectLedgerEvents: countEvents(events, (type) =>
      /(?:assertion\.(?:proposed|accepted)|entity\.resolved|relationship\.accepted|export|report|correspondence)/i.test(type)
    ),
    runtimePreviewCalls: fixture.runtimeCalls.preview,
    runtimeApprovalCalls: fixture.runtimeCalls.approval,
    runtimeEffectCalls: fixture.runtimeCalls.effect,
    portableNonLedgerFileSystem: snapshotPortableNonLedgerFileSystem(fixture.handle)
  });
}

function countEvents(
  events: readonly KnowledgeEvent[],
  predicate: (type: string) => boolean
): number {
  return events.filter((event) => predicate(event.type)).length;
}

function snapshotPortableNonLedgerFileSystem(
  handle: LocalRuntimeHandle
): readonly string[] {
  const mounted = handle.mountedWorkspace;
  if (mounted === undefined) {
    throw new Error("factory effect snapshot requires a mounted portable workspace");
  }
  const roots = [
    ["blobRoot", mounted.paths.blobRoot],
    ["derivativeRoot", mounted.paths.derivativeRoot],
    ["jobRoot", mounted.paths.jobRoot],
    ["projectionRoot", mounted.paths.projectionRoot],
    ["cacheRoot", mounted.paths.cacheRoot],
    ["configRoot", mounted.paths.configRoot]
  ] as const;
  return Object.freeze(roots.flatMap(([label, root]) => snapshotFileSystemRoot(label, root)));
}

function snapshotFileSystemRoot(label: string, root: string): readonly string[] {
  if (!existsSync(root)) return Object.freeze([`${label}:<absent>`]);
  const entries: string[] = [];
  const visit = (absolutePath: string, relativePath: string): void => {
    const stat = lstatSync(absolutePath);
    const location = relativePath.length === 0 ? "." : relativePath;
    const metadata = `${stat.mode}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    if (stat.isDirectory()) {
      entries.push(`${label}:${location}:directory:${metadata}`);
      for (const entry of readdirSync(absolutePath, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
        visit(join(absolutePath, entry.name), relativePath.length === 0
          ? entry.name
          : `${relativePath}/${entry.name}`);
      }
      return;
    }
    if (stat.isFile()) {
      const digest = createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
      entries.push(`${label}:${location}:file:${metadata}:sha256:${digest}`);
      return;
    }
    if (stat.isSymbolicLink()) {
      entries.push(`${label}:${location}:symlink:${metadata}:${readlinkSync(absolutePath)}`);
      return;
    }
    entries.push(`${label}:${location}:other:${metadata}`);
  };
  visit(root, "");
  return Object.freeze(entries);
}

function assertNoAuthorityEscape(
  product: FactoryProduct,
  authorityValues: readonly unknown[]
): void {
  const forbidden = new Set(authorityValues.filter((value) => value !== undefined));
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (
      value === null ||
      (typeof value !== "object" && typeof value !== "function")
    ) {
      return;
    }
    const reference = value as object;
    if (seen.has(reference)) return;
    expect(forbidden.has(reference), "factory product escaped an input authority identity").toBe(false);
    seen.add(reference);
    for (const key of Reflect.ownKeys(reference)) {
      expect(
        typeof key,
        "factory product must not hide authority behind a symbol-keyed property"
      ).toBe("string");
      if (typeof key === "string") {
        expect(key).not.toMatch(
          /runtime|handle|ledger|authority|witness|store|reader|operation|controller|adapter|executor|descriptor|credentialValue|secret/i
        );
      }
      const descriptor = Object.getOwnPropertyDescriptor(reference, key);
      expect(descriptor?.get, "factory product must not expose authority through an accessor").toBeUndefined();
      if (descriptor !== undefined && Object.hasOwn(descriptor, "value")) {
        visit(descriptor.value);
      }
    }
  };
  visit(product.loop);
  visit(product.stop);
}

function configurationInput() {
  return {
    capabilities: [{
      capability: {
        providerId: "provider_openai_compatible", label: "OpenAI compatible provider", adapterVersion: "adapter_provider_v1",
        backendKind: "openai-compatible-api", modelFamilies: ["model_text_1"], modalities: ["text"],
        toolSupport: "function-calling", structuredOutputSupport: "schema-strict",
        contextLimits: { maxInputTokens: 8192, maxOutputTokens: 2048 },
        credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
        dataHandlingNotes: "Remote provider requires approved byte transfer.", costPolicy: "metered-api",
        workspaceScopes: ["workspace"], approvalProfile: "remote-byte-transfer-gated",
        diagnosticContract: ["needs-api-key", "requires-byte-transfer-approval"], fakeSupport: false
      },
      capabilityHash: hash("e"), capabilitySourceEventId: "evt_capability_factory_ports", capabilityRevision: "capability_revision_factory_ports"
    }],
    credentialReferences: [{
      credentialRefId: "agent_credref_factory_ports", providerId: "provider_openai_compatible", credentialKind: "api-key-bearer",
      scopeKind: "workspace", capabilityScopes: ["model-inference"], safeLabel: "OpenAI compatible account reference",
      authorizedBy: "human_operator", authorizedAt: "2026-07-18T12:00:00.000Z", status: "healthy",
      policyVersion: policy.policyVersion, sourceEventIds: ["evt_binding_factory_ports"]
    }],
    endpointPolicies: [{
      endpointPolicyId: "endpoint_policy_factory_ports", providerId: "provider_openai_compatible", modelId: "model_text_1",
      adapterVersion: "adapter_provider_v1", policyVersion: policy.policyVersion, scope: "exact-provider-model",
      status: "approved", sourceEventIds: ["evt_endpoint_factory_ports"]
    }],
    feasibility: [{
      feasibilityId: "provider_feasibility_factory_ports", state: "current", lane: "byok", providerId: "provider_openai_compatible",
      modelId: "model_text_1", capabilityHash: hash("e"), capabilitySourceEventId: "evt_capability_factory_ports",
      capabilityRevision: "capability_revision_factory_ports", credentialRefId: "agent_credref_factory_ports",
      credentialKind: "api-key-bearer", endpointPolicyId: "endpoint_policy_factory_ports", policyVersion: policy.policyVersion,
      assessedAt: "2026-07-18T12:00:00.000Z",
      sourceEventIds: ["evt_binding_factory_ports", "evt_capability_factory_ports", "evt_endpoint_factory_ports"]
    }]
  };
}

function hash(character: string): Hash {
  return `sha256:${character.repeat(64)}`;
}
