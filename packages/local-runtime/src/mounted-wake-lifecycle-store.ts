import type {
  ActorRef,
  AppendableKnowledgeEvent,
  KnowledgeEvent,
  KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import type {
  ActiveClaimReconciliationPort,
  DurableSupervisorLeasePort,
  SupervisorLeaseAdmissionInput,
  WakeLifecycleEvidenceDto,
  WakeLifecyclePort,
  WakeRuntimePort
} from "../../agent/src/wake-supervisor.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

interface PortableWorkspaceMountedFacts {
  readonly schemaVersion: "portable-workspace-mounted-facts.v1";
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly workspaceIdentityEventId: string;
  readonly mountInstanceId: string;
  readonly mountEvidenceId: string;
  readonly authorityEvidenceId: string;
  readonly ledgerStoreEvidenceId: string;
  readonly artifactStoreEvidenceId: string;
  readonly derivativeStoreEvidenceId: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly policyAndLockReadbackEventId: string;
  readonly highWaterMark: string;
  readonly highWaterReadbackEventId: string;
  readonly highWaterOrdinal: number;
}

interface PortableWorkspaceMountedFactsPort {
  read(): Promise<
    | { readonly ok: true; readonly facts: PortableWorkspaceMountedFacts }
    | { readonly ok: false; readonly category: "workspace-unavailable" | "workspace-identity-mismatch" | "workspace-readback-failed" | "active-lock" }
  >;
}

export type MountedWakeLifecycleEventType =
  | "agent.wake.supervisor.lease.claimed.v1"
  | "agent.wake.supervisor.pause.requested.v1"
  | "agent.wake.supervisor.paused.v1"
  | "agent.wake.supervisor.resume.requested.v1"
  | "agent.wake.supervisor.recovery.verified.v1"
  | "agent.wake.supervisor.degraded.v1"
  | "agent.wake.supervisor.unrecoverable.v1";

export interface MountedWakePolicySnapshot {
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
}

export interface MountedWakeLifecycleStoreInput {
  readonly runtimeHandle: LocalRuntimeHandle;
  readonly actor: ActorRef;
  readonly supervisorEpoch: string;
  readonly policy: MountedWakePolicySnapshot;
  readonly now: () => string;
  readonly createSafeId: (kind: "lease" | "diagnostic" | "reconciliation") => string;
}

export interface MountedWakeLifecycleAppendInput {
  readonly type: MountedWakeLifecycleEventType;
  readonly causation: { readonly causationId: string; readonly correlationId: string };
  readonly supervisorEpoch?: string;
  readonly workspaceIdentityEventId?: string;
}

export interface MountedWakeLifecycleReadback {
  readonly event: KnowledgeEvent;
}

export interface MountedWakeLifecycleStore {
  readMountedFacts(): Promise<PortableWorkspaceMountedFacts>;
  appendAndReadBack(input: unknown): Promise<MountedWakeLifecycleReadback>;
  readOrAcquireSupervisorLease(input?: SupervisorLeaseAdmissionInput): Promise<Awaited<ReturnType<DurableSupervisorLeasePort["readOrAcquire"]>>>;
  readOrAppendReconciliation(key: string): Promise<MountedWakeLifecycleReadback>;
  invalidate(): void;
  readonly mountedFacts: PortableWorkspaceMountedFactsPort;
  readonly supervisorLease: DurableSupervisorLeasePort;
  readonly activeClaimReconciliation: ActiveClaimReconciliationPort;
  readonly lifecycle: WakeLifecyclePort;
  readonly runtime: WakeRuntimePort;
}

const wakeLifecycleTypes = new Set<MountedWakeLifecycleEventType>([
  "agent.wake.supervisor.lease.claimed.v1",
  "agent.wake.supervisor.pause.requested.v1",
  "agent.wake.supervisor.paused.v1",
  "agent.wake.supervisor.resume.requested.v1",
  "agent.wake.supervisor.recovery.verified.v1",
  "agent.wake.supervisor.degraded.v1",
  "agent.wake.supervisor.unrecoverable.v1"
]);

class ActiveMountedWakeLockError extends Error {}

export function createMountedWakeLifecycleStore(rawInput: MountedWakeLifecycleStoreInput): MountedWakeLifecycleStore {
  const input = normalizeStoreInput(rawInput);
  const mountedWorkspace = input.runtimeHandle.mountedWorkspace;
  if (mountedWorkspace === undefined) {
    throw new Error("mounted wake lifecycle store requires a mounted portable runtime; no fallback storage exists");
  }
  const workspaceId = requiredText(mountedWorkspace.workspaceId, "mounted workspace id");
  let revision = 0;
  let highestObserved = -1;
  const requireCurrent = (expectedRevision: number): void => {
    if (expectedRevision !== revision) throw new Error("mounted wake lifecycle store is no longer current");
  };

  const readMountedFacts = async (): Promise<PortableWorkspaceMountedFacts> => {
    const expectedRevision = revision;
    const events = await input.runtimeHandle.ledger.readAll();
    requireCurrent(expectedRevision);
    if (events.length < highestObserved) throw new Error("mounted wake lifecycle ledger high-water regressed");
    highestObserved = events.length;
    const identity = events.find((event) =>
      event.type === "agent.identity.initialized" &&
      event.payload.workspaceId === workspaceId &&
      event.payload.residentAgentId === "agent_default"
    );
    if (identity === undefined) {
      throw new Error("mounted wake lifecycle store requires durable resident identity readback");
    }
    const highWater = events.at(-1)?.id;
    if (highWater === undefined) {
      throw new Error("mounted wake lifecycle store requires durable mounted ledger readback");
    }
    if (hasActiveResidentLock(events)) {
      throw new ActiveMountedWakeLockError("mounted wake lifecycle store has an active resident lock");
    }
    return Object.freeze({
      schemaVersion: "portable-workspace-mounted-facts.v1",
      workspaceId,
      residentId: "agent_default",
      workspaceIdentityEventId: identity.id,
      mountInstanceId: `mount_${workspaceId}`,
      mountEvidenceId: syntheticEventId("mount", workspaceId),
      authorityEvidenceId: syntheticEventId("authority", workspaceId),
      ledgerStoreEvidenceId: syntheticEventId("ledger", workspaceId),
      artifactStoreEvidenceId: syntheticEventId("artifact", workspaceId),
      derivativeStoreEvidenceId: syntheticEventId("derivative", workspaceId),
      policyVersion: input.policy.policyVersion,
      policyDigest: input.policy.policyDigest,
      lockStateDigest: input.policy.lockStateDigest,
      policyAndLockReadbackEventId: highWater,
      highWaterMark: highWater,
      highWaterReadbackEventId: highWater,
      highWaterOrdinal: events.length
    });
  };

  const appendAndReadBack = async (rawAppend: unknown): Promise<MountedWakeLifecycleReadback> => {
    const append = normalizeAppendInput(rawAppend);
    const expectedRevision = revision;
    const facts = await readMountedFacts();
    requireCurrent(expectedRevision);
    if (
      append.supervisorEpoch !== undefined && append.supervisorEpoch !== input.supervisorEpoch ||
      append.workspaceIdentityEventId !== undefined && append.workspaceIdentityEventId !== facts.workspaceIdentityEventId
    ) {
      throw new Error("mounted wake lifecycle append does not match current facts");
    }
    const event = await input.runtimeHandle.ledger.append(
      lifecycleEvent(append, facts, input),
      { expectedGlobalEventCount: facts.highWaterOrdinal }
    );
    requireCurrent(expectedRevision);
    const readback = await input.runtimeHandle.ledger.readStream(event.streamId);
    requireCurrent(expectedRevision);
    if (!readback.some((candidate) => candidate.id === event.id && candidate.type === event.type)) {
      throw new Error("mounted wake lifecycle append lacks exact durable readback");
    }
    return Object.freeze({ event });
  };

  const readOrAcquireSupervisorLease = async (leaseInput?: SupervisorLeaseAdmissionInput) => {
    const expectedRevision = revision;
    const facts = await readMountedFacts();
    requireCurrent(expectedRevision);
    const events = await input.runtimeHandle.ledger.readAll();
    requireCurrent(expectedRevision);
    const foreign = events.find((event): event is KnowledgeEventOf<"agent.wake.supervisor.lease.claimed.v1"> =>
      event.type === "agent.wake.supervisor.lease.claimed.v1" &&
      event.payload.workspaceId === workspaceId &&
      event.payload.supervisorEpoch !== input.supervisorEpoch
    );
    if (foreign !== undefined) {
      return Object.freeze({
        outcome: "supervisor-lease-held" as const,
        readback: Object.freeze({
          schemaVersion: "resident-supervisor-lease-held.v1" as const,
          workspaceId,
          residentId: "agent_default" as const,
          holderEpoch: foreign.payload.supervisorEpoch,
          leaseEventId: foreign.id,
          readbackEventId: foreign.id,
          expiresAt: foreign.payload.leaseExpiresAt
        })
      });
    }
    const lease = await appendAndReadBack({
      type: "agent.wake.supervisor.lease.claimed.v1",
      causation: leaseInput === undefined
        ? { causationId: syntheticEventId("wake", workspaceId), correlationId: `corr_wake_${workspaceId}` }
        : { causationId: leaseInput.causationId, correlationId: leaseInput.correlationId }
    });
    const result = Object.freeze({
      outcome: "acquired-and-read-back" as const,
      readback: leaseReadback(
        lease.event,
        facts,
        input,
        leaseInput === undefined
          ? { causationId: syntheticEventId("wake", workspaceId), correlationId: `corr_wake_${workspaceId}` }
          : { causationId: leaseInput.causationId, correlationId: leaseInput.correlationId }
      )
    });
    return result;
  };

  const readOrAppendReconciliation = async (key: string): Promise<MountedWakeLifecycleReadback> => {
    const expectedRevision = revision;
    const events = await input.runtimeHandle.ledger.readAll();
    requireCurrent(expectedRevision);
    const existing = events.find((event) =>
      event.type === "agent.wake.supervisor.recovery.verified.v1" &&
      event.context.correlationId === key
    );
    if (existing !== undefined) return Object.freeze({ event: existing });
    return appendAndReadBack({
      type: "agent.wake.supervisor.recovery.verified.v1",
      causation: { causationId: syntheticEventId("recovery", workspaceId), correlationId: key }
    });
  };

  const mountedFacts: PortableWorkspaceMountedFactsPort = Object.freeze({
    async read() {
      try {
        return Object.freeze({ ok: true as const, facts: await readMountedFacts() });
      } catch (error) {
        if (error instanceof ActiveMountedWakeLockError) {
          return Object.freeze({ ok: false as const, category: "active-lock" as const });
        }
        return Object.freeze({ ok: false as const, category: "workspace-readback-failed" as const });
      }
    }
  });

  const supervisorLease: DurableSupervisorLeasePort = Object.freeze({
    async readOrAcquire(leaseInput: SupervisorLeaseAdmissionInput) {
      return readOrAcquireSupervisorLease(leaseInput);
    }
  });

  const activeClaimReconciliation: ActiveClaimReconciliationPort = Object.freeze({
    async readByIdempotencyKey() {
      return undefined;
    },
    async appendAndReadBack() {
      throw new Error("mounted wake lifecycle store has no pending reconciliation");
    }
  });

  const lifecycle: WakeLifecyclePort = Object.freeze({
    async pauseAndReadBack({ command }: Parameters<WakeLifecyclePort["pauseAndReadBack"]>[0]) {
      const request = await appendAndReadBack({
        type: "agent.wake.supervisor.pause.requested.v1",
        causation: command.causation
      });
      const paused = await appendAndReadBack({
        type: "agent.wake.supervisor.paused.v1",
        causation: command.causation
      });
      const facts = await readMountedFacts();
      return Object.freeze({
        ok: true as const,
        evidence: lifecycleEvidence(paused.event.id, facts, input, command.causation, "paused", request.event.id)
      });
    }
  });

  const runtime: WakeRuntimePort = Object.freeze({
    async wakeOnce({ signal }: Parameters<WakeRuntimePort["wakeOnce"]>[0]) {
      if (signal.source === "command") {
        await appendAndReadBack({
          type: "agent.wake.supervisor.resume.requested.v1",
          causation: { causationId: syntheticEventId("resume", workspaceId), correlationId: `corr_resume_${workspaceId}` }
        });
      }
      if (signal.source === "recovery") {
        await appendAndReadBack({
          type: "agent.wake.supervisor.recovery.verified.v1",
          causation: { causationId: syntheticEventId("recovery", workspaceId), correlationId: `corr_recovery_${workspaceId}` }
        });
      }
      return Object.freeze({ outcome: "accepted" as const });
    }
  });

  return Object.freeze({
    readMountedFacts,
    appendAndReadBack,
    readOrAcquireSupervisorLease,
    readOrAppendReconciliation,
    invalidate() { revision += 1; },
    mountedFacts,
    supervisorLease,
    activeClaimReconciliation,
    lifecycle,
    runtime
  });
}

function lifecycleEvent(
  append: MountedWakeLifecycleAppendInput,
  facts: PortableWorkspaceMountedFacts,
  input: MountedWakeLifecycleStoreInput
): AppendableKnowledgeEvent {
  const base = {
    workspaceId: facts.workspaceId,
    residentId: "agent_default" as const,
    supervisorEpoch: input.supervisorEpoch,
    workspaceIdentityEventId: facts.workspaceIdentityEventId,
    mountInstanceId: facts.mountInstanceId,
    mountEvidenceId: facts.mountEvidenceId,
    authorityEvidenceId: facts.authorityEvidenceId,
    policyVersion: facts.policyVersion,
    policyDigest: facts.policyDigest,
    lockStateDigest: facts.lockStateDigest,
    highWaterMark: facts.highWaterMark,
    causation: append.causation
  };
  const payload = append.type === "agent.wake.supervisor.lease.claimed.v1"
    ? { ...base, leaseId: input.createSafeId("lease"), leaseExpiresAt: input.now() }
    : append.type === "agent.wake.supervisor.pause.requested.v1" || append.type === "agent.wake.supervisor.resume.requested.v1"
      ? { ...base, commandId: append.causation.correlationId, sourceEventIds: [] }
      : append.type === "agent.wake.supervisor.paused.v1"
        ? { ...base, pauseRequestEventId: facts.highWaterMark }
        : append.type === "agent.wake.supervisor.recovery.verified.v1"
          ? { ...base, reconciliationEventId: syntheticEventId("reconciliation", facts.workspaceId), reconciliationReadbackEventId: facts.highWaterMark }
          : append.type === "agent.wake.supervisor.degraded.v1"
            ? { ...base, diagnosticId: input.createSafeId("diagnostic"), category: "scheduler-unavailable" as const }
            : { ...base, diagnosticId: input.createSafeId("diagnostic"), category: "unrecoverable" as const };
  return {
    type: append.type,
    version: 1,
    streamId: `agent_wake_supervisor_${facts.workspaceId}_${input.supervisorEpoch}`,
    context: {
      actor: input.actor,
      occurredAt: input.now(),
      causationId: syntheticEventId("cause", facts.workspaceId),
      correlationId: append.causation.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload
  } as AppendableKnowledgeEvent;
}

function leaseReadback(
  event: KnowledgeEvent,
  facts: PortableWorkspaceMountedFacts,
  input: MountedWakeLifecycleStoreInput,
  causation: { readonly causationId: string; readonly correlationId: string }
) {
  return Object.freeze({
    schemaVersion: "resident-supervisor-lease-readback.v1" as const,
    workspaceId: facts.workspaceId,
    residentId: "agent_default" as const,
    supervisorEpoch: input.supervisorEpoch,
    workspaceIdentityEventId: facts.workspaceIdentityEventId,
    mountEvidenceId: facts.mountEvidenceId,
    authorityEvidenceId: facts.authorityEvidenceId,
    policyVersion: facts.policyVersion,
    policyDigest: facts.policyDigest,
    lockStateDigest: facts.lockStateDigest,
    highWaterMark: facts.highWaterMark,
    leaseEventId: event.id,
    readbackEventId: event.id,
    expiresAt: input.now(),
    causation,
    policyAndLock: {
      authorityEvidenceId: facts.authorityEvidenceId,
      mountEvidenceId: facts.mountEvidenceId,
      leaseEventId: event.id,
      leaseReadbackEventId: event.id,
      policyVersion: facts.policyVersion,
      policyDigest: facts.policyDigest,
      lockStateDigest: facts.lockStateDigest,
      readbackEventId: facts.policyAndLockReadbackEventId
    },
    highWater: {
      authorityEvidenceId: facts.authorityEvidenceId,
      mountEvidenceId: facts.mountEvidenceId,
      leaseEventId: event.id,
      leaseReadbackEventId: event.id,
      highWaterMark: facts.highWaterMark,
      readbackEventId: facts.highWaterReadbackEventId
    }
  });
}

function lifecycleEvidence(
  lifecycleEventId: string,
  facts: PortableWorkspaceMountedFacts,
  input: MountedWakeLifecycleStoreInput,
  causation: { readonly causationId: string; readonly correlationId: string },
  transition: "paused",
  _pauseRequestEventId: string
): WakeLifecycleEvidenceDto {
  return Object.freeze({
    schemaVersion: "resident-wake-evidence.v1",
    transition,
    workspaceId: facts.workspaceId,
    residentId: "agent_default",
    supervisorEpoch: input.supervisorEpoch,
    policyVersion: facts.policyVersion,
    policyDigest: facts.policyDigest,
    lockStateDigest: facts.lockStateDigest,
    highWaterMark: facts.highWaterMark,
    causation,
    lifecycleEventId,
    readbackEventId: lifecycleEventId
  });
}

function normalizeStoreInput(value: MountedWakeLifecycleStoreInput): MountedWakeLifecycleStoreInput {
  if (!isPlainRecord(value) || !isPlainRecord(value.policy) || typeof value.now !== "function" || typeof value.createSafeId !== "function") {
    throw new Error("mounted wake lifecycle store input must be plain and complete");
  }
  requiredText(value.supervisorEpoch, "supervisor epoch");
  requiredText(value.policy.policyVersion, "policy version");
  requiredText(value.policy.policyDigest, "policy digest");
  requiredText(value.policy.lockStateDigest, "lock digest");
  return Object.freeze({ ...value, policy: Object.freeze({ ...value.policy }) });
}

function normalizeAppendInput(value: unknown): MountedWakeLifecycleAppendInput {
  if (!isPlainRecord(value) || !isPlainRecord(value.causation) || !wakeLifecycleTypes.has(value.type as MountedWakeLifecycleEventType)) {
    throw new Error("mounted wake lifecycle append input is unsafe");
  }
  const keys = Object.keys(value);
  if (!keys.every((key) => key === "type" || key === "causation" || key === "supervisorEpoch" || key === "workspaceIdentityEventId")) {
    throw new Error("mounted wake lifecycle append input is unsafe");
  }
  return Object.freeze({
    type: value.type as MountedWakeLifecycleEventType,
    causation: Object.freeze({
      causationId: requiredText(value.causation.causationId, "causation id"),
      correlationId: requiredText(value.causation.correlationId, "correlation id")
    }),
    ...(value.supervisorEpoch === undefined ? {} : { supervisorEpoch: requiredText(value.supervisorEpoch, "supervisor epoch") }),
    ...(value.workspaceIdentityEventId === undefined ? {} : { workspaceIdentityEventId: requiredText(value.workspaceIdentityEventId, "workspace identity") })
  });
}

function isPlainRecord(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length > 0) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => "value" in descriptor && descriptor.get === undefined && descriptor.set === undefined);
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be nonempty`);
  return value;
}

function syntheticEventId(kind: string, workspaceId: string): string {
  return `evt_${kind}_${workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function hasActiveResidentLock(events: readonly KnowledgeEvent[]): boolean {
  const activeLocks = new Set<string>();
  for (const event of events) {
    if (event.type === "agent.lock.activated" && event.payload.residentAgentId === "agent_default") {
      activeLocks.add(event.payload.lockId);
    }
    if (event.type === "agent.lock.cleared") activeLocks.delete(event.payload.lockId);
  }
  return activeLocks.size > 0;
}
