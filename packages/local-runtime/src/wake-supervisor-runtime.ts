import { types } from "node:util";
import {
  createWakeSupervisor,
  type ActiveClaimReconciliationPort,
  type DurableSupervisorLeasePort,
  type SupervisorLeaseAdmissionInput,
  type WakeCommandInput,
  type WakeSignal,
  type WakeStatusDto,
  type WakeSupervisorCommandResultDto,
  type WorkspaceAdmissionSnapshot,
  type WorkspaceAvailabilityAuthority
} from "../../agent/src/wake-supervisor.js";
import {
  consumeMountedSpecialistHandoffAuthorityWitness,
  type ConsumedMountedSpecialistHandoffAuthorityWitness,
  type HandoffAuthorityBinding,
  type MountedSpecialistHandoffAuthorityWitness
} from "../../agent/src/specialist-handoff-authority.js";
import { hashCanonicalSpecialistHandoffJson } from "../../agent/src/specialist-handoff-manifest.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import { registerMountedArtifactAuthorityIssuerForWakeRuntime } from "./mounted-artifact-authority-operation.js";
import {
  bindMountedResidentLoopAuthorityForFactory,
  createMountedWakeLifecycleStore,
  type MountedResidentLoopCapabilities,
  type MountedWakePolicySnapshot
} from "./mounted-wake-lifecycle-store.js";
import {
  inspectMountedProviderAuthority,
  type MountedProviderAuthority,
  type MountedProviderAuthorityReadback
} from "./mounted-provider-authority.js";
import { createPortableWorkspaceLifecyclePorts } from "./portable-workspace-lifecycle.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

export interface WakeSupervisorRuntimeInput {
  readonly runtimeHandle: LocalRuntimeHandle;
  readonly actor: ActorRef;
  readonly supervisorEpoch: string;
  readonly policy: MountedWakePolicySnapshot;
  readonly now: () => string;
  readonly createSafeId: (kind: "lease" | "diagnostic" | "reconciliation") => string;
}

export interface SupervisionControlPort {
  start(): Promise<WakeSupervisorCommandResultDto>;
  signal(input: WakeSignal): Promise<WakeSupervisorCommandResultDto>;
  pause(input: WakeCommandInput): Promise<WakeSupervisorCommandResultDto>;
  resume(input: WakeCommandInput): Promise<WakeSupervisorCommandResultDto>;
  recover(input: WakeCommandInput): Promise<WakeSupervisorCommandResultDto>;
  status(): Promise<WakeStatusDto>;
}

export interface WakeSupervisorRuntime {
  readonly supervision: SupervisionControlPort;
  stop(): Promise<void>;
}

interface InternalResidentLoopFactoryCompositionInput {
  readonly runtimeHandle: LocalRuntimeHandle;
  readonly actor: WakeSupervisorRuntimeInput["actor"];
  readonly supervisorEpoch: string;
  readonly policy: {
    readonly policyVersion: string;
    readonly policyDigest: `sha256:${string}`;
    readonly lockStateDigest: `sha256:${string}`;
  };
  readonly now: () => string;
  readonly createSafeId: (kind: "lease" | "diagnostic" | "reconciliation") => string;
}

interface InternalResidentLoopFactoryAuthorityBindInput {
  readonly providerAuthority: MountedProviderAuthority;
  readonly handoffAuthorityWitness: MountedSpecialistHandoffAuthorityWitness;
}

interface InternalResidentLoopFactoryAuthorityReadback {
  readonly provider: MountedProviderAuthorityReadback;
  readonly handoff: {
    readonly taskId: string;
    readonly attemptId: string;
    readonly runId: string;
    readonly runType: string;
    readonly retryGeneration: number;
    readonly authorityBinding: HandoffAuthorityBinding;
  };
}

interface InternalResidentLoopFactoryComposition {
  readonly wakeRuntime: WakeSupervisorRuntime;
  start(): Promise<WakeSupervisorCommandResultDto>;
  bind(input: unknown): Promise<InternalResidentLoopFactoryAuthorityReadback>;
  stop(): Promise<void>;
}

interface NormalizedCompositionInput
  extends InternalResidentLoopFactoryCompositionInput {
  readonly policy: InternalResidentLoopFactoryCompositionInput["policy"];
}

interface FactoryCurrentness {
  readonly ledger: LocalRuntimeHandle["ledger"];
  readonly workspaceId: string;
  readonly workspaceIdentityEventId: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly highWaterMark: string;
  readonly ledgerEventCount: number;
}

interface ResidentWakeRuntimeState {
  readonly store: ReturnType<typeof createMountedWakeLifecycleStore>;
  coreReady: boolean;
  residentBound: boolean;
  factoryBinding?: {
    readonly readback: object;
    readonly provider: object;
    readonly handoff: object;
    readonly authorityBinding: object;
  };
}

const residentWakeRuntimeStates = new WeakMap<WakeSupervisorRuntime, ResidentWakeRuntimeState>();

export function createWakeSupervisorRuntime(rawInput: WakeSupervisorRuntimeInput): WakeSupervisorRuntime {
  const input = normalizeInput(rawInput);
  const capability = registerMountedArtifactAuthorityIssuerForWakeRuntime({
    phase: "authenticate",
    runtimeHandle: input.runtimeHandle
  });
  const store = createMountedWakeLifecycleStore({
    capability,
    actor: input.actor,
    supervisorEpoch: input.supervisorEpoch,
    policy: input.policy,
    now: input.now,
    createSafeId: input.createSafeId
  });
  let supervisorPromise: Promise<ReturnType<typeof createWakeSupervisor>> | undefined;
  const runtime: WakeSupervisorRuntime = {
    supervision: Object.freeze({
      start: async () => {
        const result = await (await supervisor()).start();
        if (result.outcome === "accepted") {
          const residentState = residentWakeRuntimeStates.get(runtime);
          if (residentState === undefined) {
            throw new Error("wake runtime resident authority state is unavailable");
          }
          residentState.coreReady = true;
        }
        return result;
      },
      signal: async (signal: WakeSignal) => (await supervisor()).signal(signal),
      pause: async (command: WakeCommandInput) => (await supervisor()).pause(command),
      resume: async (command: WakeCommandInput) => (await supervisor()).resume(command),
      recover: async (command: WakeCommandInput) => (await supervisor()).recover(command),
      status: async () => (await supervisor()).status()
    }),
    async stop() {
      try {
        if (supervisorPromise !== undefined) await supervisorPromise.then((created) => created.stop());
      } finally {
        store.invalidate();
      }
    }
  };
  const supervisor = (): Promise<ReturnType<typeof createWakeSupervisor>> => {
    supervisorPromise ??= (async () => {
      const facts = await store.readMountedFacts();
      const lifecyclePorts = createPortableWorkspaceLifecyclePorts({
        workspaceId: facts.workspaceId,
        residentId: "agent_default",
        supervisorEpoch: input.supervisorEpoch,
        mountedFacts: store.mountedFacts,
        supervisorLease: store.supervisorLease,
        activeClaimReconciliation: store.activeClaimReconciliation,
        now: input.now,
        createSafeOutageObservationId: () => input.createSafeId("reconciliation")
      });
      const supervisorPorts = createSupervisorPorts(lifecyclePorts);
      const created = createWakeSupervisor({
        residentId: "agent_default",
        supervisorEpoch: input.supervisorEpoch,
        workspaceId: facts.workspaceId,
        policyVersion: input.policy.policyVersion,
        policyDigest: input.policy.policyDigest,
        lockStateDigest: input.policy.lockStateDigest,
        expectedHighWaterMark: facts.highWaterMark,
        authority: supervisorPorts.authority,
        lease: supervisorPorts.supervisorLease,
        reconciliation: supervisorPorts.activeClaimReconciliation,
        runtime: store.runtime,
        lifecycle: store.lifecycle,
        now: input.now
      });
      registerMountedArtifactAuthorityIssuerForWakeRuntime({
        phase: "bind",
        capability,
        wakeRuntime: runtime,
        lifecyclePorts
      });
      return created;
    })();
    return supervisorPromise;
  };
  const issuedRuntime = Object.freeze(runtime);
  residentWakeRuntimeStates.set(issuedRuntime, {
    store,
    coreReady: false,
    residentBound: false
  });
  return issuedRuntime;
}

interface PrivateResidentLoopFactoryWakeIssuance {
  readonly wakeRuntime: WakeSupervisorRuntime;
  readonly registerReadback: (readback: object) => void;
}

function issueResidentLoopFactoryWakeRuntime(
  input: WakeSupervisorRuntimeInput
): PrivateResidentLoopFactoryWakeIssuance {
  const wakeRuntime = createWakeSupervisorRuntime(input);
  const state = residentWakeRuntimeStates.get(wakeRuntime);
  if (state === undefined) {
    throw new Error("wake runtime factory authority registration is unavailable");
  }
  const registerReadback = (readback: object): void => {
    if (
      !state.coreReady ||
      state.residentBound ||
      state.factoryBinding !== undefined
    ) {
      throw new Error("wake runtime factory authority registration is unavailable");
    }
    if (!Object.isFrozen(readback)) {
      throw new Error("wake runtime factory authority registration is unavailable");
    }
    const provider = Reflect.get(readback, "provider");
    const handoff = Reflect.get(readback, "handoff");
    const authorityBinding = handoff === null || typeof handoff !== "object"
      ? undefined
      : Reflect.get(handoff, "authorityBinding");
    if (
      provider === null ||
      typeof provider !== "object" ||
      !Object.isFrozen(provider) ||
      handoff === null ||
      typeof handoff !== "object" ||
      !Object.isFrozen(handoff) ||
      authorityBinding === null ||
      typeof authorityBinding !== "object" ||
      !Object.isFrozen(authorityBinding)
    ) {
      throw new Error("wake runtime factory authority registration is unavailable");
    }
    state.factoryBinding = Object.freeze({
      readback,
      provider,
      handoff,
      authorityBinding
    });
  };
  return Object.freeze({ wakeRuntime, registerReadback });
}

/**
 * The Core card is deliberately a verifier/composer, not an alternate issuer:
 * W authenticates the Task135D handle first; PM and H retain their own opaque
 * identity capabilities. Only the verified readbacks cross this boundary.
 */
export function createResidentLoopFactoryCompositionForFacade(
  rawInput: unknown
): InternalResidentLoopFactoryComposition {
  const input = normalizeCompositionInput(rawInput);
  const issuance = issueResidentLoopFactoryWakeRuntime(input);

  let stopped = false;
  let started = false;
  let startPromise: Promise<WakeSupervisorCommandResultDto> | undefined;

  const start = async (): Promise<WakeSupervisorCommandResultDto> => {
    if (stopped) throw unavailable();
    startPromise ??= issuance.wakeRuntime.supervision.start().then((result) => {
      if (
        result.outcome !== "accepted" ||
        result.status.residentId !== "agent_default"
      ) {
        throw unavailable();
      }
      started = true;
      return result;
    }).catch(() => {
      throw unavailable();
    });
    return await startPromise;
  };

  const bind = async (
    rawBindInput: unknown
  ): Promise<InternalResidentLoopFactoryAuthorityReadback> => {
    const bindInput = normalizeBindInput(rawBindInput);
    if (stopped || !started) throw unavailable();

    const before = await currentFactoryState(
      input.runtimeHandle,
      issuance.wakeRuntime
    );
    const providerBefore = await providerReadback(bindInput.providerAuthority);
    const afterProviderBefore = await currentFactoryState(
      input.runtimeHandle,
      issuance.wakeRuntime
    );
    if (!sameFactoryState(before, afterProviderBefore)) throw unavailable();

    const handoff = await handoffReadback(
      bindInput.handoffAuthorityWitness
    );
    await handoff.revalidateCurrent();

    const providerAfter = await providerReadback(
      bindInput.providerAuthority
    );
    const after = await currentFactoryState(
      input.runtimeHandle,
      issuance.wakeRuntime
    );
    if (
      !sameFactoryState(before, after) ||
      !sameProviderReadback(providerBefore, providerAfter)
    ) {
      throw unavailable();
    }
    assertExactAuthorityAgreement(after, providerAfter, handoff);

    const readback = Object.freeze({
      provider: freezeProviderReadback(providerAfter),
      handoff: Object.freeze({
        taskId: handoff.taskLifecycle.taskId,
        attemptId: handoff.taskLifecycle.attemptId,
        runId: handoff.taskLifecycle.runId,
        runType: handoff.taskLifecycle.runType,
        retryGeneration: handoff.taskLifecycle.retryGeneration,
        authorityBinding: Object.freeze({ ...handoff.binding })
      })
    });
    issuance.registerReadback(readback);
    return readback;
  };

  return Object.freeze({
    wakeRuntime: issuance.wakeRuntime,
    start,
    bind,
    async stop() {
      if (stopped) return;
      stopped = true;
      try {
        await issuance.wakeRuntime.stop();
      } catch {
        throw unavailable();
      }
    }
  });
}

export async function bindResidentLoopCapabilitiesForFactory(
  wakeRuntime: WakeSupervisorRuntime,
  binding: unknown,
  domainExecution: unknown
): Promise<MountedResidentLoopCapabilities> {
  const state = residentWakeRuntimeStates.get(wakeRuntime);
  if (state === undefined || !state.coreReady || state.residentBound) {
    throw new Error("wake runtime resident capability binding requires exact unconsumed Core authority");
  }
  const registered = state.factoryBinding;
  if (registered === undefined || binding !== registered.readback) {
    throw new Error("wake runtime resident capability binding requires exact issued factory authority");
  }
  const provider = binding === null || typeof binding !== "object"
    ? undefined
    : Reflect.get(binding, "provider");
  const handoff = binding === null || typeof binding !== "object"
    ? undefined
    : Reflect.get(binding, "handoff");
  const authorityBinding = handoff === null || typeof handoff !== "object"
    ? undefined
    : Reflect.get(handoff, "authorityBinding");
  if (
    provider !== registered.provider ||
    handoff !== registered.handoff ||
    authorityBinding !== registered.authorityBinding
  ) {
    throw new Error("wake runtime resident capability binding requires exact issued factory authority");
  }
  const issued = await bindMountedResidentLoopAuthorityForFactory(
    state.store,
    binding,
    domainExecution
  );
  const { recoverSuspensionPrefix, suspendAndRelease } = issued.mountedAuthority;
  const mountedSuspensionContract = Object.freeze([
    "resident-loop-suspension",
    "resident-loop-suspended",
    "effect-outcome-unknown"
  ] as const);
  if (
    typeof recoverSuspensionPrefix !== "function" ||
    typeof suspendAndRelease !== "function" ||
    mountedSuspensionContract.length !== 3
  ) {
    throw new Error("wake runtime resident suspension authority is incomplete");
  }
  state.residentBound = true;
  return issued;
}

function normalizeCompositionInput(
  value: unknown
): NormalizedCompositionInput {
  const record = exactOwnDataRecord(value, [
    "runtimeHandle",
    "actor",
    "supervisorEpoch",
    "policy",
    "now",
    "createSafeId"
  ]);
  const runtimeHandle = record.runtimeHandle;
  if (
    runtimeHandle === null ||
    typeof runtimeHandle !== "object" ||
    types.isProxy(runtimeHandle)
  ) {
    throw unavailable();
  }
  if (
    typeof record.now !== "function" ||
    typeof record.createSafeId !== "function"
  ) {
    throw unavailable();
  }

  const actor = normalizeActor(record.actor);
  const policy = normalizePolicy(record.policy);
  const supervisorEpoch = text(record.supervisorEpoch);
  return Object.freeze({
    runtimeHandle: runtimeHandle as LocalRuntimeHandle,
    actor,
    supervisorEpoch,
    policy,
    now: record.now as () => string,
    createSafeId: record.createSafeId as (
      kind: "lease" | "diagnostic" | "reconciliation"
    ) => string
  });
}

function normalizeBindInput(
  value: unknown
): InternalResidentLoopFactoryAuthorityBindInput {
  const record = exactOwnDataRecord(value, [
    "providerAuthority",
    "handoffAuthorityWitness"
  ]);
  if (
    record.providerAuthority === null ||
    typeof record.providerAuthority !== "object" ||
    types.isProxy(record.providerAuthority)
  ) {
    throw unavailable();
  }
  if (
    record.handoffAuthorityWitness === null ||
    typeof record.handoffAuthorityWitness !== "object" ||
    types.isProxy(record.handoffAuthorityWitness)
  ) {
    throw unavailable();
  }
  return Object.freeze({
    providerAuthority:
      record.providerAuthority as MountedProviderAuthority,
    handoffAuthorityWitness:
      record.handoffAuthorityWitness as MountedSpecialistHandoffAuthorityWitness
  });
}

async function currentFactoryState(
  runtimeHandle: LocalRuntimeHandle,
  wakeRuntime: WakeSupervisorRuntime
): Promise<FactoryCurrentness> {
  try {
    const before = await wakeRuntime.supervision.status();
    if (before.residentId !== "agent_default") throw unavailable();

    // This read occurs only after W's constructor has authenticated the exact
    // Task135D identity. It is used solely to bind H's opaque identity hash
    // to the same durable mounted ledger, never returned to the caller.
    const mountedWorkspace = runtimeHandle.mountedWorkspace;
    const ledger = runtimeHandle.ledger;
    if (
      mountedWorkspace === undefined ||
      mountedWorkspace.workspaceId !== before.workspaceId
    ) {
      throw unavailable();
    }
    const events = await ledger.readAll();
    const after = await wakeRuntime.supervision.status();
    if (!sameWakeStatus(before, after) || !Array.isArray(events)) {
      throw unavailable();
    }

    const identities = events.filter((event) =>
      event.type === "agent.identity.initialized" &&
      event.payload.workspaceId === before.workspaceId &&
      event.payload.residentAgentId === "agent_default"
    );
    if (identities.length !== 1 || identities[0] === undefined) {
      throw unavailable();
    }
    const identity = identities[0];
    if (
      typeof identity.id !== "string" ||
      !identity.id.startsWith("evt_")
    ) {
      throw unavailable();
    }

    return Object.freeze({
      ledger,
      workspaceId: before.workspaceId,
      workspaceIdentityEventId: identity.id,
      policyVersion: before.policyVersion,
      policyDigest: before.policyDigest,
      lockStateDigest: before.lockStateDigest,
      highWaterMark: before.highWaterMark,
      ledgerEventCount: events.length
    });
  } catch {
    throw unavailable();
  }
}

async function providerReadback(
  authority: MountedProviderAuthority
): Promise<MountedProviderAuthorityReadback> {
  try {
    return await inspectMountedProviderAuthority(authority);
  } catch {
    throw unavailable();
  }
}

async function handoffReadback(
  witness: MountedSpecialistHandoffAuthorityWitness
): Promise<ConsumedMountedSpecialistHandoffAuthorityWitness> {
  try {
    return await consumeMountedSpecialistHandoffAuthorityWitness(witness);
  } catch {
    throw unavailable();
  }
}

function assertExactAuthorityAgreement(
  factory: FactoryCurrentness,
  provider: MountedProviderAuthorityReadback,
  handoff: ConsumedMountedSpecialistHandoffAuthorityWitness
): void {
  const binding = handoff.binding;
  const expectedWorkspaceIdentityHash =
    hashCanonicalSpecialistHandoffJson({
      schemaVersion: "mounted-handoff-workspace-identity.v1",
      workspaceId: factory.workspaceId,
      workspaceIdentityEventId: factory.workspaceIdentityEventId
    });
  if (
    provider.schemaVersion !== "mounted-provider-authority-readback.v1" ||
    provider.stage !== "locator" ||
    provider.workspaceId !== factory.workspaceId ||
    provider.policyVersion !== factory.policyVersion ||
    provider.policyDigest !== factory.policyDigest ||
    provider.lockStateDigest !== factory.lockStateDigest ||
    provider.highWaterMark !== factory.highWaterMark ||
    provider.durableLedgerEventCount !== factory.ledgerEventCount ||
    binding.workspaceIdentityHash !== expectedWorkspaceIdentityHash ||
    binding.mountGeneration !==
      mountedGeneration(provider.admissionGenerationId) ||
    binding.ledgerStoreIdentity !== factory.workspaceIdentityEventId ||
    binding.artifactStoreIdentity !== factory.workspaceIdentityEventId ||
    binding.ledgerHighWaterEventId !== provider.highWaterMark ||
    binding.policyHash !== provider.policyDigest ||
    binding.activeLocksHash !== provider.lockStateDigest ||
    handoff.taskLifecycle.taskId.length === 0 ||
    handoff.taskLifecycle.attemptId.length === 0 ||
    handoff.taskLifecycle.runId.length === 0
  ) {
    throw unavailable();
  }
}

function mountedGeneration(value: string): string {
  const match = /^admission_generation_([0-9]+)$/.exec(value);
  if (match === null || match[1] === undefined) throw unavailable();
  return `admission:${match[1]}`;
}

function sameFactoryState(
  left: FactoryCurrentness,
  right: FactoryCurrentness
): boolean {
  return left.ledger === right.ledger &&
    left.workspaceId === right.workspaceId &&
    left.workspaceIdentityEventId === right.workspaceIdentityEventId &&
    left.policyVersion === right.policyVersion &&
    left.policyDigest === right.policyDigest &&
    left.lockStateDigest === right.lockStateDigest &&
    left.highWaterMark === right.highWaterMark &&
    left.ledgerEventCount === right.ledgerEventCount;
}

function sameProviderReadback(
  left: MountedProviderAuthorityReadback,
  right: MountedProviderAuthorityReadback
): boolean {
  return left.workspaceId === right.workspaceId &&
    left.mountInstanceId === right.mountInstanceId &&
    left.admissionGenerationId === right.admissionGenerationId &&
    left.policyVersion === right.policyVersion &&
    left.policyDigest === right.policyDigest &&
    left.lockStateDigest === right.lockStateDigest &&
    left.highWaterMark === right.highWaterMark &&
    left.highWaterOrdinal === right.highWaterOrdinal &&
    left.durableLedgerEventCount === right.durableLedgerEventCount;
}

function sameWakeStatus(
  left: Awaited<ReturnType<WakeSupervisorRuntime["supervision"]["status"]>>,
  right: Awaited<ReturnType<WakeSupervisorRuntime["supervision"]["status"]>>
): boolean {
  return left.workspaceId === right.workspaceId &&
    left.residentId === right.residentId &&
    left.supervisorEpoch === right.supervisorEpoch &&
    left.policyVersion === right.policyVersion &&
    left.policyDigest === right.policyDigest &&
    left.lockStateDigest === right.lockStateDigest &&
    left.highWaterMark === right.highWaterMark &&
    left.workspaceState === right.workspaceState;
}

function freezeProviderReadback(
  readback: MountedProviderAuthorityReadback
): MountedProviderAuthorityReadback {
  return Object.freeze({ ...readback });
}

function normalizeActor(value: unknown): WakeSupervisorRuntimeInput["actor"] {
  const actor = exactOwnDataRecord(value, ["id", "kind", "label"]);
  const kind = actor.kind;
  if (
    kind !== "human" &&
    kind !== "extractor" &&
    kind !== "system" &&
    kind !== "agent"
  ) {
    throw unavailable();
  }
  return Object.freeze({
    id: text(actor.id),
    kind,
    label: text(actor.label)
  });
}

function normalizePolicy(
  value: unknown
): InternalResidentLoopFactoryCompositionInput["policy"] {
  const policy = exactOwnDataRecord(value, [
    "policyVersion",
    "policyDigest",
    "lockStateDigest"
  ]);
  return Object.freeze({
    policyVersion: text(policy.policyVersion),
    policyDigest: hash(policy.policyDigest),
    lockStateDigest: hash(policy.lockStateDigest)
  });
}

function exactOwnDataRecord(
  value: unknown,
  expectedKeys: readonly string[]
): Record<string, unknown> {
  if (
    types.isProxy(value) ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Object.keys(descriptors).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpected.length ||
    actualKeys.some((key, index) => key !== sortedExpected[index])
  ) {
    throw unavailable();
  }

  const record: Record<string, unknown> = Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw unavailable();
    }
    record[key] = descriptor.value;
  }
  return Object.freeze(record);
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw unavailable();
  return value;
}

function hash(value: unknown): `sha256:${string}` {
  if (
    typeof value !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(value)
  ) {
    throw unavailable();
  }
  return value as `sha256:${string}`;
}

function unavailable(): Error {
  return new Error("resident loop factory composition is unavailable");
}

/**
 * The wake supervisor copies untrusted port results at its boundary. The
 * mounted lifecycle deliberately accepts only its original, authority-issued
 * token, so this private bridge restores the current issued identity after
 * exact structural matching. It never accepts a caller-created admission.
 */
function createSupervisorPorts(lifecyclePorts: ReturnType<typeof createPortableWorkspaceLifecyclePorts>) {
  let currentAdmission: WorkspaceAdmissionSnapshot | undefined;
  const restoreAdmission = (candidate: WorkspaceAdmissionSnapshot): WorkspaceAdmissionSnapshot => {
    const current = currentAdmission;
    if (current === undefined || !sameAdmission(candidate, current)) {
      throw new Error("wake supervisor admission is no longer current");
    }
    return current;
  };
  const authority: WorkspaceAvailabilityAuthority = Object.freeze({
    async revalidate(request: Parameters<WorkspaceAvailabilityAuthority["revalidate"]>[0]) {
      const result = await lifecyclePorts.authority.revalidate(request);
      currentAdmission = result.ok ? result.admission : undefined;
      return result;
    },
    invalidate(reason: "shutdown" | "authority-loss" | "admission-mismatch") {
      currentAdmission = undefined;
      lifecyclePorts.authority.invalidate?.(reason);
    },
    subscribeInvalidation(listener: Parameters<NonNullable<WorkspaceAvailabilityAuthority["subscribeInvalidation"]>>[0]) {
      return lifecyclePorts.authority.subscribeInvalidation?.(listener) ?? (() => undefined);
    }
  });
  const supervisorLease: DurableSupervisorLeasePort = Object.freeze({
    async readOrAcquire(input: SupervisorLeaseAdmissionInput) {
      return lifecyclePorts.supervisorLease.readOrAcquire(Object.freeze({
        ...input,
        admission: restoreAdmission(input.admission)
      }));
    }
  });
  const activeClaimReconciliation: ActiveClaimReconciliationPort = Object.freeze({
    async readByIdempotencyKey(input: Parameters<ActiveClaimReconciliationPort["readByIdempotencyKey"]>[0]) {
      return lifecyclePorts.activeClaimReconciliation.readByIdempotencyKey(Object.freeze({
        ...input,
        admission: restoreTupleAdmission(input.admission, restoreAdmission)
      }));
    },
    async appendAndReadBack(input: Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0]) {
      return lifecyclePorts.activeClaimReconciliation.appendAndReadBack(Object.freeze({
        ...input,
        admission: restoreTupleAdmission(input.admission, restoreAdmission)
      }));
    }
  });
  return Object.freeze({ authority, supervisorLease, activeClaimReconciliation });
}

function restoreTupleAdmission(
  tuple: Parameters<ActiveClaimReconciliationPort["readByIdempotencyKey"]>[0]["admission"],
  restoreAdmission: (candidate: WorkspaceAdmissionSnapshot) => WorkspaceAdmissionSnapshot
) {
  const admission = restoreAdmission(Object.freeze({
    identityAndMount: tuple.authorityIdentityAndMount,
    admissionGeneration: tuple.admissionGeneration
  }));
  return Object.freeze({
    ...tuple,
    authorityIdentityAndMount: admission.identityAndMount,
    admissionGeneration: admission.admissionGeneration
  });
}

function sameAdmission(left: WorkspaceAdmissionSnapshot, right: WorkspaceAdmissionSnapshot): boolean {
  const a = left.identityAndMount;
  const b = right.identityAndMount;
  return a.workspaceId === b.workspaceId
    && a.residentId === b.residentId
    && a.supervisorEpoch === b.supervisorEpoch
    && a.workspaceIdentityEventId === b.workspaceIdentityEventId
    && a.mountEvidenceId === b.mountEvidenceId
    && a.authorityEvidenceId === b.authorityEvidenceId
    && left.admissionGeneration.schemaVersion === right.admissionGeneration.schemaVersion
    && left.admissionGeneration.generationId === right.admissionGeneration.generationId;
}

function normalizeInput(value: WakeSupervisorRuntimeInput): WakeSupervisorRuntimeInput {
  if (!isPlainRecord(value) || !isPlainRecord(value.policy) || typeof value.now !== "function" || typeof value.createSafeId !== "function") {
    throw new Error("wake supervisor runtime input must be a plain complete object");
  }
  if (typeof value.supervisorEpoch !== "string" || value.supervisorEpoch.length === 0) {
    throw new Error("wake supervisor epoch is required");
  }
  return Object.freeze({ ...value, policy: Object.freeze({ ...value.policy }) });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length > 0) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => "value" in descriptor && descriptor.get === undefined && descriptor.set === undefined);
}
