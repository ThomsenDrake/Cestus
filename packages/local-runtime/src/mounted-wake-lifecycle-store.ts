import { existsSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  validateKnowledgeEvent,
  type ActorRef,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import { isConcurrencyConflict } from "../../ontology/src/event-ledger.js";
import type {
  ActiveClaimReconciliationPort,
  ClaimReconciliationAdmissionTuple,
  ClaimReconciliationReadback,
  DurableSupervisorLeasePort,
  RevalidatedActiveClaimEvidence,
  SupervisorLeaseAdmissionInput,
  WakeLifecycleEvidenceDto,
  WakeLifecyclePort,
  WakeRuntimePort
} from "../../agent/src/wake-supervisor.js";
import {
  inspectFactoryAuthenticatedMountedWakeCapabilityForMountedWakeLifecycleStore,
  type FactoryAuthenticatedMountedWakeCapability
} from "./mounted-artifact-authority-operation.js";

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
  readonly observedActiveClaim?: RevalidatedActiveClaimEvidence;
}

interface PortableWorkspaceMountedFactsPort {
  read(): Promise<
    | { readonly ok: true; readonly facts: PortableWorkspaceMountedFacts }
    | { readonly ok: false; readonly category: "workspace-unavailable" | "workspace-identity-mismatch" | "workspace-readback-failed" | "active-lock" }
  >;
}

interface MountedSnapshot {
  readonly facts: PortableWorkspaceMountedFacts;
  readonly events: readonly KnowledgeEvent[];
}

interface MountedWorkspaceBinding {
  readonly workspaceId: string;
  readonly rootDir: string;
  readonly manifestPath: string;
  readonly ledgerPath: string;
  readonly blobRoot: string;
  readonly derivativeRoot: string;
  readonly jobRoot: string;
  readonly projectionRoot: string;
  readonly cacheRoot: string;
  readonly configRoot: string;
}

interface LeaseAdmissionState {
  readonly facts: PortableWorkspaceMountedFacts;
  readonly causation: { readonly causationId: string; readonly correlationId: string };
}

interface NormalizedWakeInstant {
  readonly iso: string;
  readonly milliseconds: number;
}

type ReconciliationAppendInput = Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0];
type ReconciliationLookupInput = Parameters<ActiveClaimReconciliationPort["readByIdempotencyKey"]>[0];
type FactoryAuthenticatedMountedWakeState = ReturnType<
  typeof inspectFactoryAuthenticatedMountedWakeCapabilityForMountedWakeLifecycleStore
>;

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
  readonly capability: FactoryAuthenticatedMountedWakeCapability;
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

interface NormalizedLifecycleAppend extends MountedWakeLifecycleAppendInput {
  readonly commandId?: string;
  readonly sourceEventIds?: readonly string[];
  readonly pauseRequestEventId?: string;
  readonly leaseId?: string;
  readonly leaseExpiresAt?: string;
  readonly reconciliationEventId?: string;
  readonly reconciliationReadbackEventId?: string;
  readonly reconciliationRecord?: ReconciliationAppendInput["record"];
  readonly reconciliationAdmission?: ReconciliationAppendInput["admission"];
  readonly bindingHighWaterMark?: string;
  readonly expectedHighWaterMark?: string;
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
const maximumWakeSupervisorLeaseDurationMs = 300_000;

class ActiveMountedWakeLockError extends Error {}

export function createMountedWakeLifecycleStore(rawInput: MountedWakeLifecycleStoreInput): MountedWakeLifecycleStore {
  const input = normalizeStoreInput(rawInput);
  const captured = inspectFactoryAuthenticatedMountedWakeCapabilityForMountedWakeLifecycleStore(input.capability);
  const mountedWorkspace = captured.mountedWorkspace;
  const mountedBinding = structuralMountedWorkspaceBinding(captured.workspace);
  const ledger = captured.ledger;
  const workspaceId = mountedBinding.workspaceId;
  let revision = 0;
  let observedEvents: readonly KnowledgeEvent[] = Object.freeze([]);
  let leaseAdmission: LeaseAdmissionState | undefined;
  let activeLeaseEventId: string | undefined;
  let invalidated = false;
  let latestReconciliation: ClaimReconciliationReadback | undefined;

  const requireCurrent = (expectedRevision: number): void => {
    if (invalidated || expectedRevision !== revision) throw new Error("mounted wake lifecycle store is no longer current");
  };

  const assertCurrentLease = (events: readonly KnowledgeEvent[]): void => {
    const leaseEventId = activeLeaseEventId;
    if (leaseEventId === undefined) return;
    const lease = events.find((event): event is KnowledgeEventOf<"agent.wake.supervisor.lease.claimed.v1"> =>
      event.id === leaseEventId && event.type === "agent.wake.supervisor.lease.claimed.v1"
    );
    if (lease === undefined || normalizedWakeInstant(input.now(), "wake lease consumption").milliseconds >= normalizedWakeInstant(lease.payload.leaseExpiresAt, "durable wake lease expiry").milliseconds) {
      invalidated = true;
      revision += 1;
      leaseAdmission = undefined;
      throw new Error("mounted wake lifecycle lease is expired or no longer current");
    }
  };

  const readMountedSnapshot = async (): Promise<MountedSnapshot> => {
    const expectedRevision = revision;
    validateMountedWorkspaceStorage(input.capability, ledger, mountedWorkspace, mountedBinding);
    const events = await ledger.readAll();
    requireCurrent(expectedRevision);
    observeLedger(events, observedEvents);
    observedEvents = Object.freeze(events.map((event) => structuredClone(event)));
    assertCurrentLease(events);

    const identity = events.find((event) =>
      event.type === "agent.identity.initialized" &&
      event.payload.workspaceId === workspaceId &&
      event.payload.residentAgentId === "agent_default"
    );
    if (identity === undefined) {
      throw new Error("mounted wake lifecycle store requires durable resident identity readback");
    }
    const sourceHighWater = events.filter((event) => !wakeLifecycleTypes.has(event.type as MountedWakeLifecycleEventType)).at(-1);
    if (sourceHighWater === undefined) {
      throw new Error("mounted wake lifecycle store requires durable mounted ledger readback");
    }
    if (hasActiveResidentLock(events)) {
      throw new ActiveMountedWakeLockError("mounted wake lifecycle store has an active resident lock");
    }

    const facts = {
      schemaVersion: "portable-workspace-mounted-facts.v1" as const,
      workspaceId,
      residentId: "agent_default" as const,
      workspaceIdentityEventId: identity.id,
      mountInstanceId: `mount_${identity.id.slice("evt_".length)}`,
      mountEvidenceId: identity.id,
      authorityEvidenceId: identity.id,
      ledgerStoreEvidenceId: identity.id,
      artifactStoreEvidenceId: identity.id,
      derivativeStoreEvidenceId: identity.id,
      policyVersion: input.policy.policyVersion,
      policyDigest: input.policy.policyDigest,
      lockStateDigest: input.policy.lockStateDigest,
      policyAndLockReadbackEventId: identity.id,
      highWaterMark: sourceHighWater.id,
      highWaterReadbackEventId: sourceHighWater.id,
      highWaterOrdinal: events.length
    };
    const observedActiveClaim = activeClaimFromEvents(events, workspaceId, input.supervisorEpoch, input.now);
    return Object.freeze({
      events: Object.freeze(events.map((event) => structuredClone(event))),
      facts: Object.freeze(observedActiveClaim === undefined ? facts : { ...facts, observedActiveClaim })
    });
  };

  const readMountedFacts = async (): Promise<PortableWorkspaceMountedFacts> => (await readMountedSnapshot()).facts;

  const appendAndReadBack = async (
    rawAppend: unknown,
    occurrence?: NormalizedWakeInstant
  ): Promise<MountedWakeLifecycleReadback> => {
    const append = normalizeAppendInput(rawAppend);
    const expectedRevision = revision;
    const snapshot = await readMountedSnapshot();
    requireCurrent(expectedRevision);
    const facts = snapshot.facts;
    if (
      append.supervisorEpoch !== undefined && append.supervisorEpoch !== input.supervisorEpoch ||
      append.workspaceIdentityEventId !== undefined && append.workspaceIdentityEventId !== facts.workspaceIdentityEventId ||
      append.expectedHighWaterMark !== undefined && append.expectedHighWaterMark !== facts.highWaterMark
    ) {
      throw new Error("mounted wake lifecycle append does not match current facts");
    }
    validateAppendReferences(append, facts, snapshot.events);
    const event = lifecycleEvent(append, facts, input, snapshot.events, occurrence);
    const expectedSequence = snapshot.events.filter((candidate) => candidate.streamId === event.streamId).length + 1;

    await ledger.append(event, {
      expectedGlobalEventCount: snapshot.events.length,
      expectedNextSequence: expectedSequence
    });
    requireCurrent(expectedRevision);
    const postAppend = await ledger.readAll();
    requireCurrent(expectedRevision);
    observeLedger(postAppend, snapshot.events);
    if (postAppend.length < snapshot.events.length + 1) {
      throw new Error("mounted wake lifecycle append lacks exact durable readback");
    }
    const durable = postAppend[snapshot.events.length];
    if (durable === undefined || durable.sequence !== expectedSequence || !sameAppendableEvent(durable, event)) {
      throw new Error("mounted wake lifecycle append lacks exact durable readback");
    }
    const validation = validateKnowledgeEvent(durable);
    if (!validation.success) throw new Error("mounted wake lifecycle append lacks canonical durable readback");
    observedEvents = Object.freeze(postAppend.map((candidate) => structuredClone(candidate)));

    const stream = await ledger.readStream(event.streamId);
    requireCurrent(expectedRevision);
    const streamReadback = stream.find((candidate) => candidate.id === durable.id);
    if (streamReadback === undefined || !isDeepStrictEqual(streamReadback, durable)) {
      throw new Error("mounted wake lifecycle append lacks exact durable readback");
    }
    return Object.freeze({ event: streamReadback });
  };

  const readOrAcquireSupervisorLease = async (leaseInput?: SupervisorLeaseAdmissionInput) => {
    const expectedRevision = revision;
    const snapshot = await readMountedSnapshot();
    requireCurrent(expectedRevision);
    if (leaseInput !== undefined) validateLeaseAdmissionInput(leaseInput, snapshot.facts);
    const claimedAt = normalizedWakeInstant(input.now(), "wake lease acquisition");
    const foreign = snapshot.events.toReversed().find((event): event is KnowledgeEventOf<"agent.wake.supervisor.lease.claimed.v1"> =>
      event.type === "agent.wake.supervisor.lease.claimed.v1" &&
      event.payload.workspaceId === workspaceId &&
      event.payload.supervisorEpoch !== input.supervisorEpoch &&
      normalizedWakeInstant(event.payload.leaseExpiresAt, "durable wake lease expiry").milliseconds > claimedAt.milliseconds
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

    const causation = leaseInput === undefined
      ? Object.freeze({ causationId: snapshot.facts.workspaceIdentityEventId, correlationId: `corr_wake_${workspaceId}` })
      : Object.freeze({ causationId: leaseInput.causationId, correlationId: leaseInput.correlationId });
    const leaseId = requiredText(input.createSafeId("lease"), "lease id");
    const lease = await appendAndReadBack({
      type: "agent.wake.supervisor.lease.claimed.v1",
      causation,
      leaseId,
      bindingHighWaterMark: snapshot.facts.highWaterMark,
      expectedHighWaterMark: snapshot.facts.highWaterMark,
      supervisorEpoch: input.supervisorEpoch,
      workspaceIdentityEventId: snapshot.facts.workspaceIdentityEventId
    }, claimedAt);
    requireCurrent(expectedRevision);
    if (lease.event.type !== "agent.wake.supervisor.lease.claimed.v1") {
      throw new Error("mounted wake lifecycle lease readback is not canonical");
    }
    const readback = leaseReadback(lease.event, snapshot.facts, input, causation);
    leaseAdmission = Object.freeze({ facts: snapshot.facts, causation });
    activeLeaseEventId = lease.event.id;
    return Object.freeze({ outcome: "acquired-and-read-back" as const, readback });
  };

  const readReconciliation = async (rawLookup: ReconciliationLookupInput): Promise<ClaimReconciliationReadback | undefined> => {
    const lookup = normalizeReconciliationLookup(rawLookup);
    if (lookup.supervisorEpoch !== input.supervisorEpoch) {
      throw new Error("mounted wake lifecycle reconciliation epoch is not current");
    }
    const snapshot = await readMountedSnapshot();
    validateReconciliationAdmission(lookup.admission, lookup, snapshot);
    const matches = snapshot.events.filter((event): event is KnowledgeEventOf<"agent.wake.supervisor.recovery.verified.v1"> =>
      event.type === "agent.wake.supervisor.recovery.verified.v1" &&
      event.payload.reconciliationRecord?.reconciliationIdempotencyKey === lookup.reconciliationIdempotencyKey &&
      event.payload.reconciliationAdmission !== undefined
    );
    if (matches.length > 1) throw new Error("mounted wake lifecycle reconciliation key is not unique");
    const existing = matches[0];
    if (existing === undefined) return undefined;
    const readback = reconciliationReadback(existing);
    validateReconciliationAdmission(readback.admission, {
      workspaceId: lookup.workspaceId,
      residentId: lookup.residentId,
      supervisorEpoch: lookup.supervisorEpoch
    }, snapshot);
    if (
      readback.record.reconciliationIdempotencyKey !== lookup.reconciliationIdempotencyKey ||
      readback.record.workspaceId !== lookup.workspaceId ||
      readback.record.residentId !== lookup.residentId ||
      readback.record.supervisorEpoch !== lookup.supervisorEpoch
    ) {
      throw new Error("mounted wake lifecycle reconciliation readback is not canonical");
    }
    latestReconciliation = readback;
    return readback;
  };

  const appendReconciliation = async (rawAppend: ReconciliationAppendInput): Promise<ClaimReconciliationReadback> => {
    const reconciliation = normalizeReconciliationAppend(rawAppend);
    const lookup = reconciliationLookupFromAppend(reconciliation);
    const existing = await readReconciliation(lookup);
    if (existing !== undefined) {
      if (!isDeepStrictEqual(existing.record, reconciliation.record)) {
        throw new Error("mounted wake lifecycle reconciliation key is already bound");
      }
      return existing;
    }
    const snapshot = await readMountedSnapshot();
    validateReconciliationAppend(reconciliation, snapshot);
    try {
      const appended = await appendAndReadBack({
        type: "agent.wake.supervisor.recovery.verified.v1",
        causation: reconciliation.record.causation,
        reconciliationEventId: reconciliation.observedActiveClaim.priorClaimEventId,
        reconciliationReadbackEventId: reconciliation.observedActiveClaim.readbackEventId,
        reconciliationRecord: reconciliation.record,
        reconciliationAdmission: reconciliation.admission,
        bindingHighWaterMark: reconciliation.admission.highWater.highWaterMark,
        expectedHighWaterMark: snapshot.facts.highWaterMark,
        supervisorEpoch: input.supervisorEpoch,
        workspaceIdentityEventId: snapshot.facts.workspaceIdentityEventId
      });
      if (appended.event.type !== "agent.wake.supervisor.recovery.verified.v1") {
        throw new Error("mounted wake lifecycle reconciliation append is not canonical");
      }
      const readback = reconciliationReadback(appended.event);
      latestReconciliation = readback;
      return readback;
    } catch (error) {
      if (!isConcurrencyConflict(error)) throw error;
      const raced = await readReconciliation(lookup);
      if (raced === undefined || !isDeepStrictEqual(raced.record, reconciliation.record)) throw error;
      return raced;
    }
  };

  const readOrAppendReconciliation = async (key: string): Promise<MountedWakeLifecycleReadback> => {
    const reconciliationKey = requiredText(key, "reconciliation key");
    const snapshot = await readMountedSnapshot();
    const existing = snapshot.events.find((event) =>
      event.type === "agent.wake.supervisor.recovery.verified.v1" &&
      event.context.correlationId === reconciliationKey
    );
    if (existing !== undefined) return Object.freeze({ event: existing });
    return appendAndReadBack({
      type: "agent.wake.supervisor.recovery.verified.v1",
      causation: { causationId: snapshot.facts.workspaceIdentityEventId, correlationId: reconciliationKey },
      reconciliationEventId: snapshot.facts.highWaterMark,
      reconciliationReadbackEventId: snapshot.facts.highWaterReadbackEventId,
      bindingHighWaterMark: snapshot.facts.highWaterMark,
      expectedHighWaterMark: snapshot.facts.highWaterMark
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
    readByIdempotencyKey: readReconciliation,
    appendAndReadBack: appendReconciliation
  });

  const lifecycle: WakeLifecyclePort = Object.freeze({
    async pauseAndReadBack({ command }: Parameters<WakeLifecyclePort["pauseAndReadBack"]>[0]) {
      await readMountedSnapshot();
      const admission = leaseAdmission;
      if (admission === undefined) throw new Error("mounted wake lifecycle pause requires current lease admission");
      const request = await appendAndReadBack({
        type: "agent.wake.supervisor.pause.requested.v1",
        causation: command.causation,
        commandId: command.commandId,
        sourceEventIds: command.sourceEventIds,
        bindingHighWaterMark: admission.facts.highWaterMark,
        supervisorEpoch: input.supervisorEpoch,
        workspaceIdentityEventId: admission.facts.workspaceIdentityEventId
      });
      const paused = await appendAndReadBack({
        type: "agent.wake.supervisor.paused.v1",
        causation: command.causation,
        pauseRequestEventId: request.event.id,
        bindingHighWaterMark: admission.facts.highWaterMark,
        supervisorEpoch: input.supervisorEpoch,
        workspaceIdentityEventId: admission.facts.workspaceIdentityEventId
      });
      return Object.freeze({
        ok: true as const,
        evidence: lifecycleEvidence(paused.event.id, admission.facts, input, command.causation, "paused")
      });
    }
  });

  const runtime: WakeRuntimePort = Object.freeze({
    async wakeOnce({ signal }: Parameters<WakeRuntimePort["wakeOnce"]>[0]) {
      await readMountedSnapshot();
      const admission = leaseAdmission;
      if (admission === undefined) throw new Error("mounted wake runtime requires current lease admission");
      if (signal.source === "command") {
        await appendAndReadBack({
          type: "agent.wake.supervisor.resume.requested.v1",
          causation: admission.causation,
          commandId: signal.idempotencyKey,
          sourceEventIds: signal.sourceEventIds,
          bindingHighWaterMark: admission.facts.highWaterMark,
          supervisorEpoch: input.supervisorEpoch,
          workspaceIdentityEventId: admission.facts.workspaceIdentityEventId
        });
      }
      if (signal.source === "recovery") {
        const sourceId = signal.sourceEventIds.find((eventId) => /^evt_[a-zA-Z0-9_-]+$/.test(eventId)) ?? admission.facts.highWaterMark;
        await appendAndReadBack({
          type: "agent.wake.supervisor.recovery.verified.v1",
          causation: admission.causation,
          reconciliationEventId: latestReconciliation?.reconciliationEventId ?? sourceId,
          reconciliationReadbackEventId: latestReconciliation?.readbackEventId ?? sourceId,
          bindingHighWaterMark: admission.facts.highWaterMark,
          supervisorEpoch: input.supervisorEpoch,
          workspaceIdentityEventId: admission.facts.workspaceIdentityEventId
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
    invalidate() {
      revision += 1;
      invalidated = true;
      leaseAdmission = undefined;
      activeLeaseEventId = undefined;
      latestReconciliation = undefined;
    },
    mountedFacts,
    supervisorLease,
    activeClaimReconciliation,
    lifecycle,
    runtime
  });
}

function lifecycleEvent(
  append: NormalizedLifecycleAppend,
  facts: PortableWorkspaceMountedFacts,
  input: MountedWakeLifecycleStoreInput,
  events: readonly KnowledgeEvent[],
  occurrence?: NormalizedWakeInstant
): AppendableKnowledgeEvent {
  const occurredAt = occurrence ?? normalizedWakeInstant(input.now(), "wake lifecycle occurrence");
  const highWaterMark = append.bindingHighWaterMark ?? facts.highWaterMark;
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
    highWaterMark,
    causation: append.causation
  };
  const payload = append.type === "agent.wake.supervisor.lease.claimed.v1"
    ? {
        ...base,
        leaseId: append.leaseId ?? requiredText(input.createSafeId("lease"), "lease id"),
        leaseExpiresAt: derivedLeaseExpiry(occurredAt, append.leaseExpiresAt)
      }
    : append.type === "agent.wake.supervisor.pause.requested.v1" || append.type === "agent.wake.supervisor.resume.requested.v1"
      ? {
          ...base,
          commandId: append.commandId ?? append.causation.correlationId,
          sourceEventIds: [...(append.sourceEventIds ?? [])]
        }
      : append.type === "agent.wake.supervisor.paused.v1"
        ? { ...base, pauseRequestEventId: append.pauseRequestEventId ?? facts.highWaterMark }
        : append.type === "agent.wake.supervisor.recovery.verified.v1"
          ? {
              ...base,
              reconciliationEventId: append.reconciliationEventId ?? facts.highWaterMark,
              reconciliationReadbackEventId: append.reconciliationReadbackEventId ?? facts.highWaterReadbackEventId,
              ...(append.reconciliationRecord === undefined ? {} : { reconciliationRecord: append.reconciliationRecord }),
              ...(append.reconciliationAdmission === undefined ? {} : { reconciliationAdmission: append.reconciliationAdmission })
            }
          : append.type === "agent.wake.supervisor.degraded.v1"
            ? { ...base, diagnosticId: safeDiagnosticId(input.createSafeId("diagnostic")), category: "scheduler-unavailable" as const }
            : { ...base, diagnosticId: safeDiagnosticId(input.createSafeId("diagnostic")), category: "unrecoverable" as const };
  const contextCausationId = events.some((event) => event.id === append.causation.causationId)
    ? append.causation.causationId
    : undefined;
  return {
    type: append.type,
    version: 1,
    streamId: `agent_wake_supervisor_${facts.workspaceId}_${input.supervisorEpoch}`,
    context: {
      actor: input.actor,
      occurredAt: occurredAt.iso,
      ...(contextCausationId === undefined ? {} : { causationId: contextCausationId }),
      correlationId: append.causation.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload
  } as AppendableKnowledgeEvent;
}

function leaseReadback(
  event: KnowledgeEventOf<"agent.wake.supervisor.lease.claimed.v1">,
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
    expiresAt: event.payload.leaseExpiresAt,
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
  transition: "paused"
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

function reconciliationReadback(
  event: KnowledgeEventOf<"agent.wake.supervisor.recovery.verified.v1">
): ClaimReconciliationReadback {
  const record = event.payload.reconciliationRecord;
  const admission = event.payload.reconciliationAdmission;
  if (record === undefined || admission === undefined) {
    throw new Error("mounted wake lifecycle reconciliation lacks durable canonical state");
  }
  return Object.freeze({
    record: deepFreeze(structuredClone(record)),
    reconciliationEventId: event.id,
    readbackEventId: event.id,
    admission: deepFreeze(structuredClone(admission))
  });
}

function validateLeaseAdmissionInput(input: SupervisorLeaseAdmissionInput, facts: PortableWorkspaceMountedFacts): void {
  const identity = input.admission.identityAndMount;
  if (
    input.residentId !== facts.residentId || input.supervisorEpoch !== identity.supervisorEpoch ||
    input.policyVersion !== facts.policyVersion || input.policyDigest !== facts.policyDigest ||
    input.lockStateDigest !== facts.lockStateDigest || identity.workspaceId !== facts.workspaceId ||
    identity.residentId !== facts.residentId || identity.workspaceIdentityEventId !== facts.workspaceIdentityEventId ||
    identity.mountEvidenceId !== facts.mountEvidenceId || identity.authorityEvidenceId !== facts.authorityEvidenceId
  ) {
    throw new Error("mounted wake lifecycle lease admission does not match current facts");
  }
}

function validateReconciliationAppend(input: ReconciliationAppendInput, snapshot: MountedSnapshot): void {
  validateReconciliationAdmission(input.admission, input, snapshot);
  const events = snapshot.events;
  const observed = input.observedActiveClaim;
  const outage = input.outage;
  const record = input.record;
  const claim = events.find((event): event is KnowledgeEventOf<"agent.task.orchestration.claimed"> =>
    event.id === observed.priorClaimEventId && event.type === "agent.task.orchestration.claimed"
  );
  const readback = events.find((event) => event.id === observed.readbackEventId);
  if (
    claim === undefined || readback === undefined || readback.id !== claim.id ||
    observed.workspaceId !== input.workspaceId || observed.residentId !== input.residentId ||
    observed.supervisorEpoch !== input.supervisorEpoch || observed.claimId !== claim.payload.taskId ||
    observed.attemptId !== claim.payload.attemptId || observed.priorClaimLeaseId !== claim.payload.idempotencyKey ||
    observed.causation.causationId !== claim.payload.causationEventId ||
    observed.causation.correlationId !== claim.context.correlationId ||
    outage.priorClaimEventId !== observed.priorClaimEventId ||
    outage.priorClaimLeaseId !== observed.priorClaimLeaseId ||
    outage.priorAuthorityEvidenceId !== input.admission.authorityIdentityAndMount.authorityEvidenceId ||
    outage.highWaterBeforeOutage !== input.admission.highWater.highWaterMark ||
    record.workspaceId !== input.workspaceId || record.residentId !== input.residentId ||
    record.supervisorEpoch !== input.supervisorEpoch || record.claimId !== observed.claimId ||
    record.attemptId !== observed.attemptId || !isDeepStrictEqual(record.outageObservation, outage) ||
    !isDeepStrictEqual(record.causation, observed.causation) ||
    record.reconciliationIdempotencyKey !== input.reconciliationIdempotencyKey
  ) {
    throw new Error("mounted wake lifecycle reconciliation does not match durable claim facts");
  }
  const tuple = input.admission;
  const authority = record.revalidatedAuthority;
  if (
    authority.identityEventId !== tuple.authorityIdentityAndMount.workspaceIdentityEventId ||
    authority.mountEvidenceId !== tuple.authorityIdentityAndMount.mountEvidenceId ||
    authority.authorityEvidenceId !== tuple.authorityIdentityAndMount.authorityEvidenceId ||
    authority.highWaterAfterRevalidation !== tuple.highWater.highWaterMark ||
    authority.policyVersion !== tuple.policyAndLock.policyVersion || authority.policyDigest !== tuple.policyAndLock.policyDigest ||
    authority.lockStateDigest !== tuple.policyAndLock.lockStateDigest ||
    authority.supervisorLeaseEventId !== tuple.verifiedLease.leaseEventId ||
    authority.supervisorLeaseReadbackEventId !== tuple.verifiedLease.readbackEventId ||
    authority.supervisorLeaseExpiresAt !== tuple.verifiedLease.expiresAt
  ) {
    throw new Error("mounted wake lifecycle reconciliation does not match lease readback");
  }
}

function validateReconciliationAdmission(
  admission: ClaimReconciliationAdmissionTuple,
  lookup: Pick<ReconciliationLookupInput, "workspaceId" | "residentId" | "supervisorEpoch">,
  snapshot: MountedSnapshot
): void {
  const identity = admission.authorityIdentityAndMount;
  const lease = admission.verifiedLease;
  const facts = snapshot.facts;
  const leaseEvent = snapshot.events.find((event): event is KnowledgeEventOf<"agent.wake.supervisor.lease.claimed.v1"> =>
    event.id === lease.leaseEventId && event.type === "agent.wake.supervisor.lease.claimed.v1"
  );
  const eventIds = new Set(snapshot.events.map((event) => event.id));
  if (
    lookup.workspaceId !== facts.workspaceId || lookup.residentId !== facts.residentId ||
    lookup.supervisorEpoch !== identity.supervisorEpoch ||
    identity.workspaceId !== facts.workspaceId || identity.residentId !== facts.residentId ||
    identity.workspaceIdentityEventId !== facts.workspaceIdentityEventId ||
    identity.mountEvidenceId !== facts.mountEvidenceId || identity.authorityEvidenceId !== facts.authorityEvidenceId ||
    leaseEvent === undefined || lease.readbackEventId !== leaseEvent.id ||
    lease.workspaceId !== facts.workspaceId || lease.residentId !== facts.residentId ||
    lease.supervisorEpoch !== identity.supervisorEpoch || lease.workspaceIdentityEventId !== identity.workspaceIdentityEventId ||
    lease.mountEvidenceId !== identity.mountEvidenceId || lease.authorityEvidenceId !== identity.authorityEvidenceId ||
    lease.policyVersion !== facts.policyVersion || lease.policyDigest !== facts.policyDigest ||
    lease.lockStateDigest !== facts.lockStateDigest || lease.highWaterMark !== facts.highWaterMark ||
    leaseEvent.payload.workspaceId !== lease.workspaceId || leaseEvent.payload.residentId !== lease.residentId ||
    leaseEvent.payload.supervisorEpoch !== lease.supervisorEpoch ||
    leaseEvent.payload.workspaceIdentityEventId !== lease.workspaceIdentityEventId ||
    leaseEvent.payload.mountEvidenceId !== lease.mountEvidenceId ||
    leaseEvent.payload.authorityEvidenceId !== lease.authorityEvidenceId ||
    leaseEvent.payload.policyVersion !== lease.policyVersion || leaseEvent.payload.policyDigest !== lease.policyDigest ||
    leaseEvent.payload.lockStateDigest !== lease.lockStateDigest || leaseEvent.payload.highWaterMark !== lease.highWaterMark ||
    lease.expiresAt !== leaseEvent.payload.leaseExpiresAt || !isDeepStrictEqual(lease.causation, leaseEvent.payload.causation) ||
    !isDeepStrictEqual(admission.policyAndLock, lease.policyAndLock) ||
    !isDeepStrictEqual(admission.highWater, lease.highWater) ||
    !eventIds.has(admission.highWater.highWaterMark) || !eventIds.has(admission.highWater.readbackEventId) ||
    !eventIds.has(admission.policyAndLock.readbackEventId)
  ) {
    throw new Error("mounted wake lifecycle reconciliation admission lacks exact durable readback");
  }
}

function validateAppendReferences(
  append: NormalizedLifecycleAppend,
  facts: PortableWorkspaceMountedFacts,
  events: readonly KnowledgeEvent[]
): void {
  const ids = new Set(events.map((event) => event.id));
  for (const eventId of [
    facts.workspaceIdentityEventId,
    facts.mountEvidenceId,
    facts.authorityEvidenceId,
    facts.ledgerStoreEvidenceId,
    facts.artifactStoreEvidenceId,
    facts.derivativeStoreEvidenceId,
    facts.policyAndLockReadbackEventId,
    facts.highWaterMark,
    facts.highWaterReadbackEventId,
    append.bindingHighWaterMark,
    append.pauseRequestEventId,
    append.reconciliationEventId,
    append.reconciliationReadbackEventId,
    ...(append.sourceEventIds ?? [])
  ]) {
    if (eventId !== undefined && !ids.has(eventId)) {
      throw new Error("mounted wake lifecycle append references missing durable evidence");
    }
  }
}

function structuralMountedWorkspaceBinding(
  workspace: FactoryAuthenticatedMountedWakeState["workspace"]
): MountedWorkspaceBinding {
  return Object.freeze({
    workspaceId: requiredText(workspace.workspaceId, "mounted workspace id"),
    rootDir: requiredText(workspace.rootDir, "mounted workspace root"),
    manifestPath: requiredText(workspace.manifestPath, "mounted workspace manifest"),
    ledgerPath: requiredText(workspace.ledgerPath, "mounted ledger path"),
    blobRoot: requiredText(workspace.blobRoot, "mounted blob root"),
    derivativeRoot: requiredText(workspace.derivativeRoot, "mounted derivative root"),
    jobRoot: requiredText(workspace.jobRoot, "mounted job root"),
    projectionRoot: requiredText(workspace.projectionRoot, "mounted projection root"),
    cacheRoot: requiredText(workspace.cacheRoot, "mounted cache root"),
    configRoot: requiredText(workspace.configRoot, "mounted config root")
  });
}

function validateMountedWorkspaceStorage(
  capability: FactoryAuthenticatedMountedWakeCapability,
  ledger: FactoryAuthenticatedMountedWakeState["ledger"],
  mountedWorkspace: FactoryAuthenticatedMountedWakeState["mountedWorkspace"],
  binding: MountedWorkspaceBinding
): void {
  const current = inspectFactoryAuthenticatedMountedWakeCapabilityForMountedWakeLifecycleStore(capability);
  const currentBinding = structuralMountedWorkspaceBinding(current.workspace);
  if (
    current.ledger !== ledger || current.mountedWorkspace !== mountedWorkspace ||
    !isDeepStrictEqual(currentBinding, binding) ||
    ![
      binding.rootDir,
      binding.manifestPath,
      binding.ledgerPath,
      binding.blobRoot,
      binding.derivativeRoot,
      binding.jobRoot,
      binding.projectionRoot,
      binding.cacheRoot,
      binding.configRoot
    ].every((path) => existsSync(path))
  ) {
    throw new Error("mounted wake lifecycle runtime storage is no longer current");
  }
}

function observeLedger(next: readonly KnowledgeEvent[], prior: readonly KnowledgeEvent[]): void {
  if (next.length < prior.length) throw new Error("mounted wake lifecycle ledger high-water regressed");
  for (let index = 0; index < prior.length; index += 1) {
    if (!isDeepStrictEqual(next[index], prior[index])) {
      throw new Error("mounted wake lifecycle ledger history was replaced");
    }
  }
  for (const event of next) {
    if (!validateKnowledgeEvent(event).success) {
      throw new Error("mounted wake lifecycle ledger readback is not canonical");
    }
  }
}

function sameAppendableEvent(event: KnowledgeEvent, appendable: AppendableKnowledgeEvent): boolean {
  const { id: _id, sequence: _sequence, ...durable } = event;
  return isDeepStrictEqual(durable, appendable);
}

function activeClaimFromEvents(
  events: readonly KnowledgeEvent[],
  workspaceId: string,
  supervisorEpoch: string,
  now: () => string
): RevalidatedActiveClaimEvidence | undefined {
  const claims = events.filter((event): event is KnowledgeEventOf<"agent.task.orchestration.claimed"> =>
    event.type === "agent.task.orchestration.claimed"
  );
  if (claims.length === 0) return undefined;
  const observedAt = normalizedWakeInstant(now(), "active claim consumption").milliseconds;
  for (const claim of claims.toReversed()) {
    if (normalizedWakeInstant(claim.payload.leaseExpiresAt, "active claim expiry").milliseconds <= observedAt) continue;
    const later = events.slice(events.findIndex((event) => event.id === claim.id) + 1);
    const released = later.some((event) =>
      event.type === "agent.task.orchestration.released" && event.payload.claimEventId === claim.id
    );
    const terminal = later.some((event) =>
      (event.type === "agent.task.orchestration.failed" || event.type === "agent.task.orchestration.completed") &&
      event.payload.taskId === claim.payload.taskId && event.payload.attemptId === claim.payload.attemptId
    );
    if (released || terminal) continue;
    return Object.freeze({
      workspaceId,
      residentId: "agent_default",
      supervisorEpoch,
      claimId: claim.payload.taskId,
      attemptId: claim.payload.attemptId,
      priorClaimEventId: claim.id,
      priorClaimLeaseId: claim.payload.idempotencyKey,
      readbackEventId: claim.id,
      causation: Object.freeze({
        causationId: claim.payload.causationEventId,
        correlationId: claim.context.correlationId
      })
    });
  }
  return undefined;
}

function normalizeStoreInput(value: MountedWakeLifecycleStoreInput): MountedWakeLifecycleStoreInput {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["capability", "actor", "supervisorEpoch", "policy", "now", "createSafeId"]) ||
    !isPlainRecord(value.policy) ||
    typeof value.now !== "function" ||
    typeof value.createSafeId !== "function"
  ) {
    throw new Error("mounted wake lifecycle store input must be plain and complete");
  }
  requiredText(value.supervisorEpoch, "supervisor epoch");
  requiredText(value.policy.policyVersion, "policy version");
  requiredText(value.policy.policyDigest, "policy digest");
  requiredText(value.policy.lockStateDigest, "lock digest");
  return Object.freeze({ ...value, policy: Object.freeze({ ...value.policy }) });
}

function normalizedWakeInstant(value: unknown, label: string): NormalizedWakeInstant {
  if (typeof value !== "string") throw new Error(`${label} must be a finite ISO instant`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} must be a finite ISO instant`);
  return Object.freeze({ iso: new Date(milliseconds).toISOString(), milliseconds });
}

function derivedLeaseExpiry(acquiredAt: NormalizedWakeInstant, suppliedExpiry: string | undefined): string {
  if (suppliedExpiry !== undefined) {
    throw new Error("mounted wake lifecycle lease expiry is derived from its acquisition instant");
  }
  return new Date(acquiredAt.milliseconds + maximumWakeSupervisorLeaseDurationMs).toISOString();
}

function normalizeAppendInput(value: unknown): NormalizedLifecycleAppend {
  if (!isPlainRecord(value) || !isPlainRecord(value.causation) || !wakeLifecycleTypes.has(value.type as MountedWakeLifecycleEventType)) {
    throw new Error("mounted wake lifecycle append input is unsafe");
  }
  const allowedKeys = new Set([
    "type", "causation", "supervisorEpoch", "workspaceIdentityEventId", "commandId", "sourceEventIds",
    "pauseRequestEventId", "leaseId", "leaseExpiresAt", "reconciliationEventId",
    "reconciliationReadbackEventId", "reconciliationRecord", "reconciliationAdmission",
    "bindingHighWaterMark", "expectedHighWaterMark"
  ]);
  if (!Object.keys(value).every((key) => allowedKeys.has(key))) {
    throw new Error("mounted wake lifecycle append input is unsafe");
  }
  const sourceEventIds = value.sourceEventIds === undefined
    ? undefined
    : stringArray(value.sourceEventIds, "source event ids");
  return Object.freeze({
    type: value.type as MountedWakeLifecycleEventType,
    causation: Object.freeze({
      causationId: requiredText(value.causation.causationId, "causation id"),
      correlationId: requiredText(value.causation.correlationId, "correlation id")
    }),
    ...(value.supervisorEpoch === undefined ? {} : { supervisorEpoch: requiredText(value.supervisorEpoch, "supervisor epoch") }),
    ...(value.workspaceIdentityEventId === undefined ? {} : { workspaceIdentityEventId: requiredText(value.workspaceIdentityEventId, "workspace identity") }),
    ...(value.commandId === undefined ? {} : { commandId: requiredText(value.commandId, "command id") }),
    ...(sourceEventIds === undefined ? {} : { sourceEventIds }),
    ...(value.pauseRequestEventId === undefined ? {} : { pauseRequestEventId: requiredText(value.pauseRequestEventId, "pause request event id") }),
    ...(value.leaseId === undefined ? {} : { leaseId: requiredText(value.leaseId, "lease id") }),
    ...(value.leaseExpiresAt === undefined ? {} : { leaseExpiresAt: requiredText(value.leaseExpiresAt, "lease expiry") }),
    ...(value.reconciliationEventId === undefined ? {} : { reconciliationEventId: requiredText(value.reconciliationEventId, "reconciliation event id") }),
    ...(value.reconciliationReadbackEventId === undefined ? {} : { reconciliationReadbackEventId: requiredText(value.reconciliationReadbackEventId, "reconciliation readback event id") }),
    ...(value.reconciliationRecord === undefined ? {} : { reconciliationRecord: clonePlainData(value.reconciliationRecord, "reconciliation record") as ReconciliationAppendInput["record"] }),
    ...(value.reconciliationAdmission === undefined ? {} : { reconciliationAdmission: clonePlainData(value.reconciliationAdmission, "reconciliation admission") as ReconciliationAppendInput["admission"] }),
    ...(value.bindingHighWaterMark === undefined ? {} : { bindingHighWaterMark: requiredText(value.bindingHighWaterMark, "binding high-water") }),
    ...(value.expectedHighWaterMark === undefined ? {} : { expectedHighWaterMark: requiredText(value.expectedHighWaterMark, "expected high-water") })
  });
}

function normalizeReconciliationLookup(value: ReconciliationLookupInput): ReconciliationLookupInput {
  assertPlainData(value, "reconciliation lookup");
  if (!isPlainRecord(value) || !hasExactKeys(value, ["admission", "reconciliationIdempotencyKey", "workspaceId", "residentId", "supervisorEpoch"])) {
    throw new Error("mounted wake lifecycle reconciliation lookup is unsafe");
  }
  requiredText(value.reconciliationIdempotencyKey, "reconciliation key");
  requiredText(value.workspaceId, "reconciliation workspace");
  requiredText(value.supervisorEpoch, "reconciliation epoch");
  if (value.residentId !== "agent_default") throw new Error("mounted wake lifecycle reconciliation resident is unsafe");
  return structuredClone(value);
}

function normalizeReconciliationAppend(value: ReconciliationAppendInput): ReconciliationAppendInput {
  assertPlainData(value, "reconciliation append");
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "admission", "reconciliationIdempotencyKey", "workspaceId", "residentId", "supervisorEpoch",
    "record", "observedActiveClaim", "outage"
  ])) {
    throw new Error("mounted wake lifecycle reconciliation append is unsafe");
  }
  return structuredClone(value);
}

function reconciliationLookupFromAppend(value: ReconciliationAppendInput): ReconciliationLookupInput {
  return Object.freeze({
    admission: value.admission,
    reconciliationIdempotencyKey: value.reconciliationIdempotencyKey,
    workspaceId: value.workspaceId,
    residentId: value.residentId,
    supervisorEpoch: value.supervisorEpoch
  });
}

function assertPlainData(value: unknown, label: string): void {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    for (const entry of value) assertPlainData(entry, label);
    return;
  }
  if (!isPlainRecord(value)) throw new Error(`${label} must contain plain data`);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!("value" in descriptor)) throw new Error(`${label} must contain plain data`);
    assertPlainData(descriptor.value, label);
  }
}

function clonePlainData(value: unknown, label: string): unknown {
  assertPlainData(value, label);
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return isDeepStrictEqual(actual, [...keys].sort());
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return Object.freeze(value.map((entry) => requiredText(entry, label)));
}

function isPlainRecord(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length > 0) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => "value" in descriptor && descriptor.get === undefined && descriptor.set === undefined);
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be nonempty`);
  return value;
}

function safeDiagnosticId(value: string): string {
  const safe = requiredText(value, "diagnostic id").replace(/[^a-zA-Z0-9_-]/g, "_");
  return safe.startsWith("diag_") ? safe : `diag_${safe}`;
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
