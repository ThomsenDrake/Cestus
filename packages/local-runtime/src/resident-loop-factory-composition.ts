import { types } from "node:util";
import {
  consumeMountedSpecialistHandoffAuthorityWitness,
  type ConsumedMountedSpecialistHandoffAuthorityWitness,
  type HandoffAuthorityBinding,
  type MountedSpecialistHandoffAuthorityWitness
} from "../../agent/src/specialist-handoff-authority.js";
import { hashCanonicalSpecialistHandoffJson } from "../../agent/src/specialist-handoff-manifest.js";
import {
  inspectMountedProviderAuthority,
  type MountedProviderAuthority,
  type MountedProviderAuthorityReadback
} from "./mounted-provider-authority.js";
import {
  createWakeSupervisorRuntime,
  registerResidentLoopFactoryAuthorityReadback,
  type WakeSupervisorRuntime,
  type WakeSupervisorRuntimeInput
} from "./wake-supervisor-runtime.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

export interface ResidentLoopFactoryCompositionInput {
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

export interface ResidentLoopFactoryAuthorityBindInput {
  readonly providerAuthority: MountedProviderAuthority;
  readonly handoffAuthorityWitness: MountedSpecialistHandoffAuthorityWitness;
}

export interface ResidentLoopFactoryAuthorityReadback {
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

export interface ResidentLoopFactoryComposition {
  /** W's bounded public control surface; it never exposes a runtime handle. */
  readonly wakeRuntime: WakeSupervisorRuntime;
  start(): Promise<Awaited<ReturnType<WakeSupervisorRuntime["supervision"]["start"]>>>;
  bind(input: unknown): Promise<ResidentLoopFactoryAuthorityReadback>;
  stop(): Promise<void>;
}

interface NormalizedCompositionInput extends ResidentLoopFactoryCompositionInput {
  readonly policy: ResidentLoopFactoryCompositionInput["policy"];
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

/**
 * The Core card is deliberately a verifier/composer, not an alternate issuer:
 * W authenticates the Task135D handle first; PM and H retain their own opaque
 * identity capabilities.  Only the verified readbacks cross this boundary.
 */
export function createResidentLoopFactoryComposition(rawInput: unknown): ResidentLoopFactoryComposition {
  const input = normalizeCompositionInput(rawInput);
  // W immediately authenticates the exact Task135D handle identity before any
  // handle member is observed by this module.
  const wakeRuntime = createWakeSupervisorRuntime({
    runtimeHandle: input.runtimeHandle,
    actor: input.actor,
    supervisorEpoch: input.supervisorEpoch,
    policy: input.policy,
    now: input.now,
    createSafeId: input.createSafeId
  });

  let stopped = false;
  let started = false;
  let startPromise: Promise<Awaited<ReturnType<WakeSupervisorRuntime["supervision"]["start"]>>> | undefined;

  const start = async (): Promise<Awaited<ReturnType<WakeSupervisorRuntime["supervision"]["start"]>>> => {
    if (stopped) throw unavailable();
    startPromise ??= wakeRuntime.supervision.start().then((result) => {
      if (result.outcome !== "accepted" || result.status.residentId !== "agent_default") throw unavailable();
      started = true;
      return result;
    }).catch(() => {
      throw unavailable();
    });
    return await startPromise;
  };

  const bind = async (rawBindInput: unknown): Promise<ResidentLoopFactoryAuthorityReadback> => {
    const bindInput = normalizeBindInput(rawBindInput);
    if (stopped || !started) throw unavailable();

    const before = await currentFactoryState(input.runtimeHandle, wakeRuntime);
    const providerBefore = await providerReadback(bindInput.providerAuthority);
    const afterProviderBefore = await currentFactoryState(input.runtimeHandle, wakeRuntime);
    if (!sameFactoryState(before, afterProviderBefore)) throw unavailable();

    const handoff = await handoffReadback(bindInput.handoffAuthorityWitness);
    await handoff.revalidateCurrent();

    const providerAfter = await providerReadback(bindInput.providerAuthority);
    const after = await currentFactoryState(input.runtimeHandle, wakeRuntime);
    if (!sameFactoryState(before, after) || !sameProviderReadback(providerBefore, providerAfter)) throw unavailable();
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
    registerResidentLoopFactoryAuthorityReadback(wakeRuntime, readback);
    return readback;
  };

  return Object.freeze({
    wakeRuntime,
    start,
    bind,
    async stop() {
      if (stopped) return;
      stopped = true;
      try {
        await wakeRuntime.stop();
      } catch {
        throw unavailable();
      }
    }
  });
}

function normalizeCompositionInput(value: unknown): NormalizedCompositionInput {
  const record = exactOwnDataRecord(value, ["runtimeHandle", "actor", "supervisorEpoch", "policy", "now", "createSafeId"]);
  const runtimeHandle = record.runtimeHandle;
  if (runtimeHandle === null || typeof runtimeHandle !== "object" || types.isProxy(runtimeHandle)) throw unavailable();
  if (typeof record.now !== "function" || typeof record.createSafeId !== "function") throw unavailable();

  const actor = normalizeActor(record.actor);
  const policy = normalizePolicy(record.policy);
  const supervisorEpoch = text(record.supervisorEpoch);
  return Object.freeze({
    runtimeHandle: runtimeHandle as LocalRuntimeHandle,
    actor,
    supervisorEpoch,
    policy,
    now: record.now as () => string,
    createSafeId: record.createSafeId as (kind: "lease" | "diagnostic" | "reconciliation") => string
  });
}

function normalizeBindInput(value: unknown): ResidentLoopFactoryAuthorityBindInput {
  const record = exactOwnDataRecord(value, ["providerAuthority", "handoffAuthorityWitness"]);
  if (record.providerAuthority === null || typeof record.providerAuthority !== "object" || types.isProxy(record.providerAuthority)) {
    throw unavailable();
  }
  if (record.handoffAuthorityWitness === null || typeof record.handoffAuthorityWitness !== "object" || types.isProxy(record.handoffAuthorityWitness)) {
    throw unavailable();
  }
  return Object.freeze({
    providerAuthority: record.providerAuthority as MountedProviderAuthority,
    handoffAuthorityWitness: record.handoffAuthorityWitness as MountedSpecialistHandoffAuthorityWitness
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
    // Task135D identity.  It is used solely to bind H's opaque identity hash
    // to the same durable mounted ledger, never returned to the caller.
    const mountedWorkspace = runtimeHandle.mountedWorkspace;
    const ledger = runtimeHandle.ledger;
    if (mountedWorkspace === undefined || mountedWorkspace.workspaceId !== before.workspaceId) throw unavailable();
    const events = await ledger.readAll();
    const after = await wakeRuntime.supervision.status();
    if (!sameWakeStatus(before, after) || !Array.isArray(events)) throw unavailable();

    const identities = events.filter((event) =>
      event.type === "agent.identity.initialized" &&
      event.payload.workspaceId === before.workspaceId &&
      event.payload.residentAgentId === "agent_default"
    );
    if (identities.length !== 1 || identities[0] === undefined) throw unavailable();
    const identity = identities[0];
    if (typeof identity.id !== "string" || !identity.id.startsWith("evt_")) throw unavailable();

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

async function providerReadback(authority: MountedProviderAuthority): Promise<MountedProviderAuthorityReadback> {
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
  const expectedWorkspaceIdentityHash = hashCanonicalSpecialistHandoffJson({
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
    binding.mountGeneration !== mountedGeneration(provider.admissionGenerationId) ||
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

function sameFactoryState(left: FactoryCurrentness, right: FactoryCurrentness): boolean {
  return left.ledger === right.ledger &&
    left.workspaceId === right.workspaceId &&
    left.workspaceIdentityEventId === right.workspaceIdentityEventId &&
    left.policyVersion === right.policyVersion &&
    left.policyDigest === right.policyDigest &&
    left.lockStateDigest === right.lockStateDigest &&
    left.highWaterMark === right.highWaterMark &&
    left.ledgerEventCount === right.ledgerEventCount;
}

function sameProviderReadback(left: MountedProviderAuthorityReadback, right: MountedProviderAuthorityReadback): boolean {
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

function freezeProviderReadback(readback: MountedProviderAuthorityReadback): MountedProviderAuthorityReadback {
  return Object.freeze({ ...readback });
}

function normalizeActor(value: unknown): WakeSupervisorRuntimeInput["actor"] {
  const actor = exactOwnDataRecord(value, ["id", "kind", "label"]);
  const kind = actor.kind;
  if (kind !== "human" && kind !== "extractor" && kind !== "system" && kind !== "agent") throw unavailable();
  return Object.freeze({ id: text(actor.id), kind, label: text(actor.label) });
}

function normalizePolicy(value: unknown): ResidentLoopFactoryCompositionInput["policy"] {
  const policy = exactOwnDataRecord(value, ["policyVersion", "policyDigest", "lockStateDigest"]);
  return Object.freeze({
    policyVersion: text(policy.policyVersion),
    policyDigest: hash(policy.policyDigest),
    lockStateDigest: hash(policy.lockStateDigest)
  });
}

function exactOwnDataRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
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
  if (actualKeys.length !== sortedExpected.length || actualKeys.some((key, index) => key !== sortedExpected[index])) throw unavailable();

  const record: Record<string, unknown> = Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
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
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) throw unavailable();
  return value as `sha256:${string}`;
}

function unavailable(): Error {
  return new Error("resident loop factory composition is unavailable");
}
