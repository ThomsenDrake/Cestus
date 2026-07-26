import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { isProxy } from "node:util/types";
import {
  validateKnowledgeEvent,
  type ActorRef,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import { isConcurrencyConflict } from "../../ontology/src/event-ledger.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import dispatcherDefault from "../../agent/src/domain-execution-dispatcher.js";
import { createResidentLoopToolGateway } from "../../agent/src/resident-loop-tool-gateway.js";
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
  createResidentPlanObservationStoreV2,
  residentLoopStreamId,
  type ResidentPlanObservationStoreV2
} from "../../agent/src/plan-observation-contracts.js";
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

interface ResidentLoopFactoryBinding {
  readonly provider: {
    readonly schemaVersion: "mounted-provider-authority-readback.v1";
    readonly stage: "locator";
    readonly workspaceId: string;
    readonly mountInstanceId: string;
    readonly admissionGenerationId: string;
    readonly policyVersion: string;
    readonly policyDigest: string;
    readonly lockStateDigest: string;
    readonly highWaterMark: string;
    readonly highWaterOrdinal: number;
    readonly durableLedgerEventCount: number;
  };
  readonly handoff: {
    readonly taskId: string;
    readonly attemptId: string;
    readonly runId: string;
    readonly runType: string;
    readonly retryGeneration: number;
    readonly authorityBinding: Readonly<Record<string, unknown>>;
  };
}

export interface ExactResidentLoopSuspensionLocator {
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly checkpointSemanticKey: string;
}

export interface ResidentLoopUnavailableV1 {
  readonly schemaVersion: "resident-loop-unavailable.v1";
  readonly outcome: "unavailable";
  readonly category: "workspace-unavailable";
  readonly durable: false;
  readonly allowedActions: readonly ["remount", "resume"];
  readonly safeDiagnosticId: string;
}

export interface OpaqueResidentLoopCurrentnessToken {
  readonly schemaVersion: "resident-loop-currentness-token.v1";
}

export interface OpaqueResidentLoopSuspensionOnlyCapability {
  readonly schemaVersion: "resident-loop-suspension-only-capability.v1";
}

export interface OpaqueReleasedCheckpointReadback {
  readonly schemaVersion: "resident-loop-released-checkpoint-readback.v1";
}

export interface ResidentLoopMountedAuthorityPort {
  reverifyAfterAwait(
    token: OpaqueResidentLoopCurrentnessToken
  ): Promise<
    | {
        readonly kind: "current";
        readonly token: OpaqueResidentLoopCurrentnessToken;
      }
    | {
        readonly kind: "recordable-stale";
        readonly capability: OpaqueResidentLoopSuspensionOnlyCapability;
      }
    | { readonly kind: "unavailable" }
  >;
  suspendAndRelease(
    input: unknown,
    authority:
      | OpaqueResidentLoopCurrentnessToken
      | OpaqueResidentLoopSuspensionOnlyCapability
  ): Promise<OpaqueReleasedCheckpointReadback | ResidentLoopUnavailableV1>;
  recoverSuspensionPrefix(
    locator: ExactResidentLoopSuspensionLocator
  ): Promise<OpaqueReleasedCheckpointReadback | ResidentLoopUnavailableV1>;
  reclaimAndReverify(
    anchor: unknown
  ): Promise<OpaqueResidentLoopCurrentnessToken | undefined>;
}

export interface MountedResidentLoopCapabilities {
  readonly planObservation: ResidentPlanObservationStoreV2;
  readonly gateway: object;
  readonly mountedAuthority: ResidentLoopMountedAuthorityPort;
  readonly currentnessToken: OpaqueResidentLoopCurrentnessToken;
  readonly handoffReader: {
    readExact(contentHash: `sha256:${string}`): Promise<Uint8Array>;
  };
}

interface ResidentAuthoritySnapshot {
  readonly facts: PortableWorkspaceMountedFacts;
  readonly events: readonly KnowledgeEvent[];
  readonly activeLockIds: readonly string[];
}

interface MountedResidentStoreState {
  readonly input: MountedWakeLifecycleStoreInput;
  readonly authority: FactoryAuthenticatedMountedWakeStoreAuthority;
  readonly binding: MountedWorkspaceBinding;
  readonly ledger: FactoryAuthenticatedMountedWakeStoreAuthority["ledger"];
  readonly readSnapshot: () => Promise<ResidentAuthoritySnapshot>;
  readonly requireCurrent: (expectedRevision: number) => void;
  readonly revision: () => number;
  bound: boolean;
}

interface CurrentnessState {
  readonly owner: ResidentLoopBoundState;
  readonly snapshot: ResidentAuthoritySnapshot;
}

interface SuspensionOnlyState {
  readonly owner: ResidentLoopBoundState;
  readonly snapshot: ResidentAuthoritySnapshot;
}

interface ResidentLoopBoundState {
  readonly mounted: MountedResidentStoreState;
  readonly binding: ResidentLoopFactoryBinding;
  readonly planObservation: ResidentPlanObservationStoreV2;
}

type ReconciliationAppendInput = Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0];
type ReconciliationLookupInput = Parameters<ActiveClaimReconciliationPort["readByIdempotencyKey"]>[0];
type ResidentCheckpointEvent = KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
type ResidentClaimEvent = KnowledgeEventOf<"agent.task.orchestration.claimed">;
type ResidentReleaseEvent = KnowledgeEventOf<"agent.task.orchestration.released">;
type ResidentSuspensionEvent = KnowledgeEventOf<"agent.resident-loop.suspended.v2">;
type ResidentResultEvent = KnowledgeEventOf<"agent.resident-loop.result.recorded.v2">;
type FactoryAuthenticatedMountedWakeStoreAuthority = ReturnType<
  typeof inspectFactoryAuthenticatedMountedWakeCapabilityForMountedWakeLifecycleStore
>;

const mountedResidentStoreStates = new WeakMap<MountedWakeLifecycleStore, MountedResidentStoreState>();
const issuedResidentCurrentness = new WeakMap<object, CurrentnessState>();
const issuedResidentSuspensionOnly = new WeakMap<object, SuspensionOnlyState>();
const issuedReleasedCheckpointReadbacks = new WeakSet<object>();

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
  const storeAuthority = inspectFactoryAuthenticatedMountedWakeCapabilityForMountedWakeLifecycleStore(input.capability);
  const mountedWorkspace = storeAuthority.mountedWorkspace;
  const mountedBinding = structuralMountedWorkspaceBinding(storeAuthority.workspace);
  const ledger = storeAuthority.ledger;
  const workspaceId = mountedBinding.workspaceId;
  let revision = 0;
  let observedEvents: readonly KnowledgeEvent[] = Object.freeze([]);
  let leaseAdmission: LeaseAdmissionState | undefined;
  let activeLeaseEventId: string | undefined;
  let activeLeaseExpiresAt: string | undefined;
  let invalidated = false;
  let latestReconciliation: ClaimReconciliationReadback | undefined;

  const invalidateLocal = (): void => {
    if (invalidated) return;
    revision += 1;
    invalidated = true;
    leaseAdmission = undefined;
    activeLeaseEventId = undefined;
    activeLeaseExpiresAt = undefined;
    latestReconciliation = undefined;
  };

  const requireCurrent = (expectedRevision: number): void => {
    if (invalidated || expectedRevision !== revision) throw new Error("mounted wake lifecycle store is no longer current");
  };

  const assertLeaseCurrent = (): void => {
    if (activeLeaseExpiresAt === undefined) return;
    if (
      normalizedWakeInstant(input.now(), "wake lease consumption").milliseconds
      >= normalizedWakeInstant(activeLeaseExpiresAt, "durable wake lease expiry").milliseconds
    ) {
      invalidateLocal();
      throw new Error("mounted wake lifecycle lease is expired or no longer current");
    }
  };

  const assertCurrentLease = (events: readonly KnowledgeEvent[]): void => {
    const leaseEventId = activeLeaseEventId;
    if (leaseEventId === undefined) return;
    const lease = events.find((event): event is KnowledgeEventOf<"agent.wake.supervisor.lease.claimed.v1"> =>
      event.id === leaseEventId && event.type === "agent.wake.supervisor.lease.claimed.v1"
    );
    if (
      lease === undefined
      || activeLeaseExpiresAt === undefined
      || normalizedWakeInstant(lease.payload.leaseExpiresAt, "durable wake lease expiry").iso !== activeLeaseExpiresAt
    ) {
      invalidateLocal();
      throw new Error("mounted wake lifecycle lease is expired or no longer current");
    }
    assertLeaseCurrent();
  };

  storeAuthority.bindCurrentness(Object.freeze({
    revalidate: assertLeaseCurrent,
    invalidate: invalidateLocal
  }));

  const readResidentAuthoritySnapshot = async (): Promise<ResidentAuthoritySnapshot> => {
    const expectedRevision = revision;
    validateMountedWorkspaceStorage(storeAuthority, ledger, mountedWorkspace, mountedBinding);
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
    const sourceHighWaterIndex = events.findLastIndex(
      (event) => !wakeLifecycleTypes.has(event.type as MountedWakeLifecycleEventType)
    );
    if (sourceHighWaterIndex < 0) {
      throw new Error("mounted wake lifecycle store requires durable mounted ledger readback");
    }
    const sourceHighWater = events[sourceHighWaterIndex]!;

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
      highWaterOrdinal: sourceHighWaterIndex + 1
    };
    const observedActiveClaim = activeClaimFromEvents(events, workspaceId, input.supervisorEpoch, input.now);
    return Object.freeze({
      events: Object.freeze(events.map((event) => structuredClone(event))),
      facts: Object.freeze(observedActiveClaim === undefined ? facts : { ...facts, observedActiveClaim }),
      activeLockIds: activeResidentLockIds(events)
    });
  };

  const readMountedSnapshot = async (): Promise<MountedSnapshot> => {
    const snapshot = await readResidentAuthoritySnapshot();
    if (snapshot.activeLockIds.length > 0) {
      throw new ActiveMountedWakeLockError("mounted wake lifecycle store has an active resident lock");
    }
    return Object.freeze({ facts: snapshot.facts, events: snapshot.events });
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
    activeLeaseExpiresAt = normalizedWakeInstant(
      lease.event.payload.leaseExpiresAt,
      "durable wake lease expiry"
    ).iso;
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

  const store: MountedWakeLifecycleStore = Object.freeze({
    readMountedFacts,
    appendAndReadBack,
    readOrAcquireSupervisorLease,
    readOrAppendReconciliation,
    invalidate() {
      storeAuthority.invalidate();
    },
    mountedFacts,
    supervisorLease,
    activeClaimReconciliation,
    lifecycle,
    runtime
  });
  mountedResidentStoreStates.set(store, {
    input,
    authority: storeAuthority,
    binding: mountedBinding,
    ledger,
    readSnapshot: readResidentAuthoritySnapshot,
    requireCurrent,
    revision: () => revision,
    bound: false
  });
  return store;
}

export async function bindMountedResidentLoopAuthorityForFactory(
  store: MountedWakeLifecycleStore,
  rawBinding: unknown,
  domainExecution: unknown
): Promise<MountedResidentLoopCapabilities> {
  const mounted = mountedResidentStoreStates.get(store);
  if (
    mounted === undefined ||
    mounted.bound ||
    domainExecution === null ||
    typeof domainExecution !== "object"
  ) {
    throw new Error("mounted resident-loop factory binding is unavailable");
  }
  const binding = normalizeResidentFactoryBinding(rawBinding);
  const snapshot = await mounted.readSnapshot();
  assertResidentFactoryBindingCurrent(binding, snapshot, mounted);

  const domainPort = dispatcherDefault.bindPackageOwnedResidentDomainExecutionPort({
    capability: domainExecution,
    mountedLedger: mounted.ledger,
    workspaceId: binding.provider.workspaceId,
    residentAgentId: "agent_default",
    taskId: binding.handoff.taskId
  });
  if (domainPort === null || typeof domainPort !== "object") {
    throw new Error("mounted resident-loop dispatcher did not issue its package-owned port");
  }

  const planObservation = createResidentPlanObservationStoreV2({
    ledger: mounted.ledger,
    actor: mounted.input.actor,
    now: mounted.input.now
  });
  const ownerShell = {} as ResidentLoopBoundState;
  let gatewayToken = issueCurrentness(ownerShell, snapshot);
  const reverifyGatewayCurrentness = async (
    afterEffect = false
  ): Promise<OpaqueResidentLoopCurrentnessToken> => {
    if (afterEffect) {
      const issued = issuedResidentCurrentness.get(gatewayToken);
      if (issued === undefined) {
        throw new Error("mounted resident-loop effect currentness was already consumed");
      }
      issuedResidentCurrentness.delete(gatewayToken);
      const current = await issued.owner.mounted.readSnapshot();
      if (!sameResidentMountedIdentity(issued, current)) {
        throw new Error("mounted resident-loop authority changed across the effect boundary");
      }
      gatewayToken = issueCurrentness(issued.owner, current);
      return gatewayToken;
    }
    const result = await reverifyCurrentness(gatewayToken);
    if (result.kind !== "current") {
      throw new Error("mounted resident-loop authority changed across the effect boundary");
    }
    gatewayToken = result.token;
    return gatewayToken;
  };
  let trustedIdOrdinal = 0;
  const gateway = createResidentLoopToolGateway({
    ledger: mounted.ledger,
    now: mounted.input.now,
    residentDomainExecutionPort: domainPort,
    reverifyBeforeEffect: () => reverifyGatewayCurrentness(false),
    reverifyAfterEffect: () => reverifyGatewayCurrentness(true),
    createTrustedToolRequestId: () => {
      trustedIdOrdinal += 1;
      const entropy = requiredText(
        mounted.input.createSafeId("reconciliation"),
        "resident tool-request entropy"
      );
      return `toolreq_${createHash("sha256")
        .update("resident-loop-tool-request.v1\n")
        .update(entropy)
        .update("\n")
        .update(String(trustedIdOrdinal))
        .digest("hex")}`;
    }
  });
  const owner: ResidentLoopBoundState = Object.freeze({
    mounted,
    binding,
    planObservation
  });
  Object.assign(ownerShell, owner);
  Object.freeze(ownerShell);
  mounted.bound = true;

  const mountedAuthority: ResidentLoopMountedAuthorityPort = Object.freeze({
    reverifyAfterAwait: reverifyCurrentness,
    suspendAndRelease: async (
      candidate: unknown,
      authority: OpaqueResidentLoopCurrentnessToken | OpaqueResidentLoopSuspensionOnlyCapability
    ) =>
      await suspendAndReleaseResidentPrefix(ownerShell, candidate, authority),
    recoverSuspensionPrefix: async (locator: ExactResidentLoopSuspensionLocator) =>
      await recoverResidentSuspensionPrefix(ownerShell, locator),
    reclaimAndReverify: async (anchor: unknown) =>
      await reclaimResidentSuspension(ownerShell, anchor)
  });
  const handoffReader = createMountedResidentHandoffReader(ownerShell);
  return Object.freeze({
    planObservation,
    gateway,
    mountedAuthority,
    currentnessToken: issueCurrentness(ownerShell, snapshot),
    handoffReader
  });
}

function issueCurrentness(
  owner: ResidentLoopBoundState,
  snapshot: ResidentAuthoritySnapshot
): OpaqueResidentLoopCurrentnessToken {
  const token = Object.freeze({
    schemaVersion: "resident-loop-currentness-token.v1" as const
  });
  issuedResidentCurrentness.set(token, { owner, snapshot });
  return token;
}

function issueSuspensionOnly(
  owner: ResidentLoopBoundState,
  snapshot: ResidentAuthoritySnapshot
): OpaqueResidentLoopSuspensionOnlyCapability {
  const capability = Object.freeze({
    schemaVersion: "resident-loop-suspension-only-capability.v1" as const
  });
  issuedResidentSuspensionOnly.set(capability, { owner, snapshot });
  return capability;
}

async function reverifyCurrentness(
  token: OpaqueResidentLoopCurrentnessToken
): Promise<
  | { readonly kind: "current"; readonly token: OpaqueResidentLoopCurrentnessToken }
  | { readonly kind: "recordable-stale"; readonly capability: OpaqueResidentLoopSuspensionOnlyCapability }
  | { readonly kind: "unavailable" }
> {
  const issued = issuedResidentCurrentness.get(token);
  if (issued === undefined) throw new Error("resident-loop currentness token was not issued or was already consumed");
  issuedResidentCurrentness.delete(token);
  let current: ResidentAuthoritySnapshot;
  try {
    current = await issued.owner.mounted.readSnapshot();
  } catch {
    return Object.freeze({ kind: "unavailable" as const });
  }
  if (sameResidentCurrentness(issued, current)) {
    return Object.freeze({
      kind: "current" as const,
      token: issueCurrentness(issued.owner, current)
    });
  }
  return Object.freeze({
    kind: "recordable-stale" as const,
    capability: issueSuspensionOnly(issued.owner, current)
  });
}

function sameResidentCurrentness(
  prior: CurrentnessState,
  current: ResidentAuthoritySnapshot
): boolean {
  const before = prior.snapshot;
  const binding = prior.owner.binding;
  return current.facts.workspaceId === before.facts.workspaceId &&
    current.facts.workspaceId === binding.provider.workspaceId &&
    current.facts.residentId === "agent_default" &&
    current.facts.mountInstanceId === before.facts.mountInstanceId &&
    current.facts.workspaceIdentityEventId === before.facts.workspaceIdentityEventId &&
    current.facts.ledgerStoreEvidenceId === before.facts.ledgerStoreEvidenceId &&
    current.facts.artifactStoreEvidenceId === before.facts.artifactStoreEvidenceId &&
    current.facts.policyVersion === before.facts.policyVersion &&
    current.facts.policyDigest === before.facts.policyDigest &&
    current.facts.lockStateDigest === before.facts.lockStateDigest &&
    current.activeLockIds.length === 0 &&
    isPermittedResidentLedgerAdvance(before.events, current.events, binding);
}

function sameResidentMountedIdentity(
  prior: CurrentnessState,
  current: ResidentAuthoritySnapshot
): boolean {
  const before = prior.snapshot.facts;
  const after = current.facts;
  return current.activeLockIds.length === 0 &&
    after.workspaceId === before.workspaceId &&
    after.workspaceId === prior.owner.binding.provider.workspaceId &&
    after.residentId === "agent_default" &&
    after.mountInstanceId === before.mountInstanceId &&
    after.workspaceIdentityEventId === before.workspaceIdentityEventId &&
    after.ledgerStoreEvidenceId === before.ledgerStoreEvidenceId &&
    after.artifactStoreEvidenceId === before.artifactStoreEvidenceId &&
    after.policyVersion === before.policyVersion &&
    after.policyDigest === before.policyDigest &&
    after.lockStateDigest === before.lockStateDigest &&
    current.events.length >= prior.snapshot.events.length &&
    prior.snapshot.events.every((event, index) => isDeepStrictEqual(current.events[index], event));
}

function isPermittedResidentLedgerAdvance(
  prior: readonly KnowledgeEvent[],
  current: readonly KnowledgeEvent[],
  binding: ResidentLoopFactoryBinding
): boolean {
  if (current.length < prior.length) return false;
  for (let index = 0; index < prior.length; index += 1) {
    if (!isDeepStrictEqual(prior[index], current[index])) return false;
  }
  return current.slice(prior.length).every((event) => {
    if (wakeLifecycleTypes.has(event.type as MountedWakeLifecycleEventType)) return true;
    const payload = event.payload as Record<string, unknown>;
    if (event.type.startsWith("agent.resident-domain.")) {
      const locator = payload.logicalLocator as Record<string, unknown> | undefined;
      return locator !== undefined &&
        locator.workspaceId === binding.provider.workspaceId &&
        locator.residentAgentId === "agent_default" &&
        locator.taskId === binding.handoff.taskId &&
        locator.attemptId === binding.handoff.attemptId &&
        locator.runId === binding.handoff.runId;
    }
    if (event.type.startsWith("agent.resident-")) {
      return payload.workspaceId === binding.provider.workspaceId &&
        payload.residentAgentId === "agent_default" &&
        payload.taskId === binding.handoff.taskId &&
        payload.attemptId === binding.handoff.attemptId &&
        payload.runId === binding.handoff.runId;
    }
    if (event.type.startsWith("agent.task.orchestration.")) {
      return payload.taskId === binding.handoff.taskId &&
        payload.attemptId === binding.handoff.attemptId;
    }
    return false;
  });
}

function unavailableResidentLoop(owner: ResidentLoopBoundState): ResidentLoopUnavailableV1 {
  return Object.freeze({
    schemaVersion: "resident-loop-unavailable.v1" as const,
    outcome: "unavailable" as const,
    category: "workspace-unavailable" as const,
    durable: false as const,
    allowedActions: Object.freeze(["remount", "resume"] as const),
    safeDiagnosticId: safeDiagnosticId(owner.mounted.input.createSafeId("diagnostic"))
  });
}

function createMountedResidentHandoffReader(
  owner: ResidentLoopBoundState
): MountedResidentLoopCapabilities["handoffReader"] {
  const material = new FileBlobStore(join(
    owner.mounted.binding.derivativeRoot,
    "specialist-handoff-material"
  ));
  const manifest = new FileBlobStore(join(
    owner.mounted.binding.derivativeRoot,
    "specialist-handoff-manifest"
  ));
  return Object.freeze({
    async readExact(contentHash: `sha256:${string}`): Promise<Uint8Array> {
      if (!/^sha256:[a-f0-9]{64}$/.test(contentHash)) {
        throw new Error("mounted resident handoff reader requires one exact content hash");
      }
      const before = await owner.mounted.readSnapshot();
      const matches: Buffer[] = [];
      for (const fixedStore of [material, manifest]) {
        try {
          matches.push(await fixedStore.get(contentHash));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      const after = await owner.mounted.readSnapshot();
      const proof: CurrentnessState = { owner, snapshot: before };
      if (!sameResidentMountedIdentity(proof, after) || matches.length !== 1) {
        throw new Error("mounted resident handoff hash is missing, ambiguous, or stale");
      }
      return Uint8Array.from(matches[0]!);
    }
  });
}

async function suspendAndReleaseResidentPrefix(
  owner: ResidentLoopBoundState,
  rawCheckpoint: unknown,
  authority: OpaqueResidentLoopCurrentnessToken | OpaqueResidentLoopSuspensionOnlyCapability
): Promise<OpaqueReleasedCheckpointReadback | ResidentLoopUnavailableV1> {
  const consumed = consumeSuspensionAuthority(owner, authority);
  let snapshot: ResidentAuthoritySnapshot;
  try {
    snapshot = await owner.mounted.readSnapshot();
  } catch {
    return unavailableResidentLoop(owner);
  }
  const currentEnough = consumed.kind === "current"
    ? sameResidentCurrentness(consumed.state, snapshot)
    : sameResidentMountedIdentity(
        { owner: consumed.state.owner, snapshot: consumed.state.snapshot },
        snapshot
      );
  if (!currentEnough) return unavailableResidentLoop(owner);
  const payload = normalizeResidentCheckpointPayload(owner, rawCheckpoint);
  assertResidentCheckpointBinding(owner, payload, snapshot);
  const checkpoint = await readOrAppendResidentCheckpoint(owner, payload);
  return await completeResidentSuspensionPrefix(owner, checkpoint);
}

async function recoverResidentSuspensionPrefix(
  owner: ResidentLoopBoundState,
  rawLocator: ExactResidentLoopSuspensionLocator
): Promise<OpaqueReleasedCheckpointReadback | ResidentLoopUnavailableV1> {
  let snapshot: ResidentAuthoritySnapshot;
  try {
    snapshot = await owner.mounted.readSnapshot();
  } catch {
    return unavailableResidentLoop(owner);
  }
  const locator = normalizeResidentSuspensionLocator(rawLocator);
  if (
    locator.taskId !== owner.binding.handoff.taskId ||
    locator.attemptId !== owner.binding.handoff.attemptId ||
    locator.runId !== owner.binding.handoff.runId ||
    snapshot.facts.workspaceId !== owner.binding.provider.workspaceId
  ) {
    throw new Error("resident-loop suspension locator does not match mounted authority");
  }
  const stream = await owner.mounted.ledger.readStream(orchestrationStreamId(
    locator.taskId,
    owner.binding.handoff.runType
  ));
  const checkpoints = stream.filter((event): event is ResidentCheckpointEvent =>
    event.type === "agent.task.orchestration.checkpointed" &&
    event.payload.checkpointKind === "resident-loop-suspension" &&
    event.payload.resumeIdempotencyKey === locator.checkpointSemanticKey
  );
  if (checkpoints.length !== 1 || checkpoints[0] === undefined) {
    throw new Error("resident-loop recovery requires one already durable checkpoint");
  }
  assertResidentCheckpointBinding(owner, checkpoints[0].payload, snapshot);
  return await completeResidentSuspensionPrefix(owner, checkpoints[0]);
}

async function reclaimResidentSuspension(
  owner: ResidentLoopBoundState,
  anchor: unknown
): Promise<OpaqueResidentLoopCurrentnessToken | undefined> {
  const locator = normalizeResidentSuspensionLocator(anchor);
  const released = await recoverResidentSuspensionPrefix(owner, locator);
  if (released.schemaVersion === "resident-loop-unavailable.v1") return undefined;
  const snapshot = await owner.mounted.readSnapshot().catch(() => undefined);
  if (snapshot === undefined || snapshot.activeLockIds.length > 0) return undefined;
  const checkpoint = await readResidentCheckpointByLocator(owner, locator);
  const instruction = checkpoint.payload.residentLoopSuspension;
  if (instruction === undefined) throw new Error("resident-loop recovery checkpoint instruction is absent");
  const claim = await readOrAppendResidentReclaim(owner, checkpoint);
  if (claim === undefined) return undefined;
  const afterClaim = await owner.mounted.readSnapshot().catch(() => undefined);
  if (
    afterClaim === undefined ||
    afterClaim.activeLockIds.length > 0 ||
    !afterClaim.events.some((event) => event.id === claim.id)
  ) {
    return undefined;
  }
  return issueCurrentness(owner, afterClaim);
}

async function readOrAppendResidentReclaim(
  owner: ResidentLoopBoundState,
  checkpoint: ResidentCheckpointEvent
): Promise<ResidentClaimEvent | undefined> {
  const instruction = checkpoint.payload.residentLoopSuspension!;
  const ledger = owner.mounted.ledger;
  const stream = await ledger.readStream(checkpoint.streamId);
  const allEvents = await ledger.readAll();
  const original = stream.find((event): event is ResidentClaimEvent =>
    event.id === instruction.orchestrationClaimEventId &&
    event.type === "agent.task.orchestration.claimed"
  );
  const release = stream.find((event): event is ResidentReleaseEvent =>
    event.type === "agent.task.orchestration.released" &&
    event.payload.releaseReason === "resident-loop-suspended" &&
    event.payload.checkpointEventId === checkpoint.id &&
    event.payload.claimEventId === instruction.orchestrationClaimEventId
  );
  if (original === undefined || release === undefined) {
    throw new Error("resident-loop reclaim requires its exact released claim");
  }
  if (stream.some((event) =>
    (event.type === "agent.task.orchestration.completed" ||
      event.type === "agent.task.orchestration.failed") &&
    event.payload.taskId === checkpoint.payload.taskId &&
    event.payload.attemptId === checkpoint.payload.attemptId
  )) {
    return undefined;
  }
  const nextGeneration = original.payload.leaseClaimGeneration + 1;
  const laterClaims = stream.filter((event): event is ResidentClaimEvent =>
    event.type === "agent.task.orchestration.claimed" &&
    event.payload.taskId === original.payload.taskId &&
    event.payload.attemptId === original.payload.attemptId &&
    event.payload.leaseClaimGeneration === nextGeneration
  );
  if (laterClaims.length > 1) throw new Error("resident-loop reclaim generation is ambiguous");
  if (laterClaims[0] !== undefined) {
    if (laterClaims[0].context.causationId !== release.id) return undefined;
    return laterClaims[0];
  }
  const claimed = normalizedWakeInstant(owner.mounted.input.now(), "resident-loop reclaim");
  const leaseExpiresAt = new Date(claimed.milliseconds + maximumWakeSupervisorLeaseDurationMs).toISOString();
  const appendable: AppendableKnowledgeEvent<"agent.task.orchestration.claimed"> = {
    type: "agent.task.orchestration.claimed",
    version: 1,
    streamId: checkpoint.streamId,
    context: {
      actor: owner.mounted.input.actor,
      occurredAt: claimed.iso,
      causationId: release.id,
      correlationId: checkpoint.context.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      taskId: original.payload.taskId,
      runType: original.payload.runType,
      attemptId: original.payload.attemptId,
      retryGeneration: original.payload.retryGeneration,
      leaseClaimGeneration: nextGeneration,
      workerId: owner.mounted.input.actor.id,
      claimedAt: claimed.iso,
      leaseExpiresAt,
      idempotencyKey: [
        "resident-loop-reclaim",
        original.payload.taskId,
        original.payload.attemptId,
        String(nextGeneration)
      ].join(":"),
      selectedOrderingPosition: original.payload.selectedOrderingPosition,
      activeBudgetSnapshot: original.payload.activeBudgetSnapshot,
      causationEventId: release.id
    }
  };
  const appended = await ledger.append(appendable, {
    expectedNextSequence: stream.length + 1,
    expectedGlobalEventCount: allEvents.length
  });
  const reread = (await ledger.readStream(checkpoint.streamId)).find((event): event is ResidentClaimEvent =>
    event.id === appended.id &&
    event.type === "agent.task.orchestration.claimed"
  );
  if (
    reread === undefined ||
    reread.payload.leaseClaimGeneration !== nextGeneration ||
    reread.context.causationId !== release.id
  ) {
    throw new Error("resident-loop reclaim lacks exact durable claim reread");
  }
  return reread;
}

function consumeSuspensionAuthority(
  owner: ResidentLoopBoundState,
  authority: OpaqueResidentLoopCurrentnessToken | OpaqueResidentLoopSuspensionOnlyCapability
):
  | { readonly kind: "current"; readonly state: CurrentnessState }
  | { readonly kind: "recordable-stale"; readonly state: SuspensionOnlyState } {
  const current = issuedResidentCurrentness.get(authority);
  if (current !== undefined) {
    issuedResidentCurrentness.delete(authority);
    if (current.owner !== owner) throw new Error("resident-loop currentness belongs to another mounted authority");
    return Object.freeze({ kind: "current" as const, state: current });
  }
  const stale = issuedResidentSuspensionOnly.get(authority);
  if (stale === undefined) {
    throw new Error("resident-loop suspension requires one live currentness or suspension-only capability");
  }
  issuedResidentSuspensionOnly.delete(authority);
  if (stale.owner !== owner) throw new Error("resident-loop suspension capability belongs to another mounted authority");
  return Object.freeze({ kind: "recordable-stale" as const, state: stale });
}

async function completeResidentSuspensionPrefix(
  owner: ResidentLoopBoundState,
  checkpoint: ResidentCheckpointEvent
): Promise<OpaqueReleasedCheckpointReadback | ResidentLoopUnavailableV1> {
  const instruction = checkpoint.payload.residentLoopSuspension;
  if (instruction === undefined) throw new Error("resident-loop checkpoint lacks its strict suspension instruction");
  const ledger = owner.mounted.ledger;
  const residentStreamId = residentLoopStreamId({
    taskId: instruction.taskId,
    attemptId: instruction.attemptId,
    runId: instruction.runId
  });
  let residentStream = await ledger.readStream(residentStreamId);
  let suspensions = matchingResidentSuspensions(residentStream, checkpoint);
  if (suspensions.length > 1) throw new Error("resident-loop suspension semantic key is duplicated");
  let suspension = suspensions[0];
  if (suspension === undefined) {
    const material = requireResidentSuspensionMaterial(owner, checkpoint, residentStream);
    suspension = await owner.planObservation.appendSuspension(material.suspension);
    const reread = await owner.planObservation.readSuspension(suspension.id);
    if (reread === undefined || !isDeepStrictEqual(reread, suspension)) {
      throw new Error("resident-loop suspension lacks exact durable reread");
    }
    residentStream = await ledger.readStream(residentStreamId);
    suspensions = matchingResidentSuspensions(residentStream, checkpoint);
    if (suspensions.length !== 1) throw new Error("resident-loop suspension append is not unique");
    suspension = suspensions[0]!;
  }

  let results = matchingResidentResults(residentStream, suspension);
  if (results.length > 1) throw new Error("resident-loop resumable-result semantic key is duplicated");
  let result = results[0];
  if (result === undefined) {
    const material = requireResidentSuspensionMaterial(owner, checkpoint, residentStream);
    result = await owner.planObservation.appendResult({
      ...material.binding,
      schemaVersion: "resident-loop-result.v2",
      planId: material.plan.payload.planId,
      planRevision: material.plan.payload.planRevision,
      planReadback: material.planReadback,
      finalObservationReadback: material.finalObservationReadback,
      causationId: suspension.id,
      outcome: "resumable",
      category: instruction.suspensionCategory,
      resultHash: instruction.resultSemanticKey,
      resumeAnchor: {
        checkpointEventId: suspension.id,
        nextSafeAction: instruction.nextSafeAction,
        resumptionDeadlineAt: instruction.resumptionDeadlineAt
      }
    });
    const reread = await owner.planObservation.readResult(result.id);
    if (reread === undefined || !isDeepStrictEqual(reread, result)) {
      throw new Error("resident-loop resumable result lacks exact durable reread");
    }
    residentStream = await ledger.readStream(residentStreamId);
    results = matchingResidentResults(residentStream, suspension);
    if (results.length !== 1) throw new Error("resident-loop resumable result append is not unique");
    result = results[0]!;
  }

  const release = await readOrAppendResidentRelease(owner, checkpoint, suspension, result);
  return issueReleasedCheckpointReadback(checkpoint, suspension, result, release);
}

function requireResidentSuspensionMaterial(
  owner: ResidentLoopBoundState,
  checkpoint: ResidentCheckpointEvent,
  stream: readonly KnowledgeEvent[]
): {
  readonly plan: KnowledgeEventOf<"agent.resident-plan.recorded.v2">;
  readonly observation: KnowledgeEventOf<"agent.resident-observation.recorded.v2">;
  readonly binding: Readonly<Record<string, unknown>>;
  readonly planReadback: Readonly<Record<string, unknown>>;
  readonly finalObservationReadback: Readonly<Record<string, unknown>>;
  readonly suspension: Readonly<Record<string, unknown>>;
} {
  const instruction = checkpoint.payload.residentLoopSuspension;
  if (instruction === undefined) throw new Error("resident-loop checkpoint instruction is absent");
  const plan = stream.find((event): event is KnowledgeEventOf<"agent.resident-plan.recorded.v2"> =>
    event.id === instruction.planRecordEventId &&
    event.type === "agent.resident-plan.recorded.v2"
  );
  const observation = stream.find((event): event is KnowledgeEventOf<"agent.resident-observation.recorded.v2"> =>
    event.id === instruction.finalObservationEventId &&
    event.type === "agent.resident-observation.recorded.v2"
  );
  if (plan === undefined || observation === undefined) {
    throw new Error("resident-loop suspension requires exact durable plan and observation readbacks");
  }
  for (const field of ["workspaceId", "residentAgentId", "taskId", "attemptId", "runId", "planId", "planRevision"] as const) {
    if (plan.payload[field] !== observation.payload[field]) {
      throw new Error("resident-loop suspension plan and observation bindings differ");
    }
  }
  if (
    plan.payload.workspaceId !== owner.binding.provider.workspaceId ||
    plan.payload.taskId !== owner.binding.handoff.taskId ||
    plan.payload.attemptId !== owner.binding.handoff.attemptId ||
    plan.payload.runId !== owner.binding.handoff.runId
  ) {
    throw new Error("resident-loop suspension material is foreign to mounted authority");
  }
  const binding = Object.freeze({
    residentAgentId: observation.payload.residentAgentId,
    workspaceId: observation.payload.workspaceId,
    taskId: observation.payload.taskId,
    attemptId: observation.payload.attemptId,
    runId: observation.payload.runId,
    runMode: observation.payload.runMode,
    workflowDescriptor: observation.payload.workflowDescriptor,
    policy: observation.payload.policy,
    authority: observation.payload.authority,
    sourceEventIds: observation.payload.sourceEventIds,
    contextPackRefs: observation.payload.contextPackRefs,
    budget: observation.payload.budget,
    correlationId: observation.payload.correlationId
  });
  const planReadback = Object.freeze({
    planRecordEventId: plan.id,
    workspaceId: plan.payload.workspaceId,
    residentAgentId: plan.payload.residentAgentId,
    taskId: plan.payload.taskId,
    attemptId: plan.payload.attemptId,
    runId: plan.payload.runId,
    planId: plan.payload.planId,
    planRevision: plan.payload.planRevision
  });
  const finalObservationReadback = Object.freeze({
    observationEventId: observation.id,
    workspaceId: observation.payload.workspaceId,
    residentAgentId: observation.payload.residentAgentId,
    taskId: observation.payload.taskId,
    attemptId: observation.payload.attemptId,
    runId: observation.payload.runId,
    planId: observation.payload.planId,
    planRevision: observation.payload.planRevision
  });
  const suspension = Object.freeze({
    ...binding,
    schemaVersion: "resident-loop-suspension.v2",
    planId: plan.payload.planId,
    planRevision: plan.payload.planRevision,
    planReadback,
    finalObservationReadback,
    causationId: checkpoint.id,
    suspensionCategory: instruction.suspensionCategory,
    checkpoint: residentSuspensionCheckpoint(instruction, checkpoint.id)
  });
  return Object.freeze({
    plan,
    observation,
    binding,
    planReadback,
    finalObservationReadback,
    suspension
  });
}

function residentSuspensionCheckpoint(
  instruction: NonNullable<ResidentCheckpointEvent["payload"]["residentLoopSuspension"]>,
  checkpointEventId: string
): Readonly<Record<string, unknown>> {
  const common = {
    orchestrationCheckpointEventId: checkpointEventId,
    resumptionDeadlineAt: instruction.resumptionDeadlineAt,
    nextSafeAction: instruction.nextSafeAction
  };
  if (instruction.suspensionCategory === "approval-required") {
    if (instruction.requestEventId === undefined) {
      throw new Error("approval suspension requires its exact request");
    }
    return Object.freeze({
      authorizationKind: "awaiting-human-approval",
      ...common,
      requestEventId: instruction.requestEventId
    });
  }
  if (instruction.suspensionCategory !== "effect-outcome-unknown") {
    if (
      instruction.requestEventId !== undefined ||
      instruction.executionClaimEventId !== undefined ||
      instruction.logicalLocator !== undefined
    ) {
      throw new Error("ordinary suspension cannot carry gateway claim authority");
    }
    return Object.freeze({ authorizationKind: "not-applicable", ...common });
  }
  if (
    instruction.logicalLocator === undefined ||
    instruction.requestEventId === undefined ||
    instruction.executionClaimEventId === undefined ||
    instruction.executionCapabilityHash === undefined
  ) {
    throw new Error("unknown effect suspension requires exact claimed gateway authority");
  }
  const humanFields = [
    instruction.decisionEventId,
    instruction.approvedBy,
    instruction.approvedPreviewHash
  ];
  if (humanFields.every((field) => field === undefined)) {
    return Object.freeze({
      authorizationKind: "effect-outcome-unknown-automatic",
      ...common,
      logicalLocator: instruction.logicalLocator,
      requestEventId: instruction.requestEventId,
      executionClaimEventId: instruction.executionClaimEventId,
      executionCapabilityHash: instruction.executionCapabilityHash
    });
  }
  if (humanFields.some((field) => field === undefined)) {
    throw new Error("unknown human effect suspension requires its complete approval tuple");
  }
  return Object.freeze({
    authorizationKind: "effect-outcome-unknown-human",
    ...common,
    logicalLocator: instruction.logicalLocator,
    requestEventId: instruction.requestEventId,
    decisionEventId: instruction.decisionEventId,
    approvedBy: instruction.approvedBy,
    approvedPreviewHash: instruction.approvedPreviewHash,
    executionClaimEventId: instruction.executionClaimEventId,
    executionCapabilityHash: instruction.executionCapabilityHash
  });
}

function normalizeResidentFactoryBinding(value: unknown): ResidentLoopFactoryBinding {
  const binding = exactResidentRecord(value, ["provider", "handoff"], "resident factory authority binding");
  const provider = exactResidentRecord(binding.provider, [
    "schemaVersion",
    "stage",
    "workspaceId",
    "mountInstanceId",
    "admissionGenerationId",
    "policyVersion",
    "policyDigest",
    "lockStateDigest",
    "highWaterMark",
    "highWaterOrdinal",
    "durableLedgerEventCount"
  ], "resident provider authority readback");
  const handoff = exactResidentRecord(binding.handoff, [
    "taskId",
    "attemptId",
    "runId",
    "runType",
    "retryGeneration",
    "authorityBinding"
  ], "resident handoff authority readback");
  const authorityBinding = exactResidentRecord(
    handoff.authorityBinding,
    [
      "workspaceIdentityHash",
      "mountGeneration",
      "ledgerStoreIdentity",
      "artifactStoreIdentity",
      "ledgerHighWaterEventId",
      "policyHash",
      "activeLocksHash"
    ],
    "resident handoff authority binding"
  );
  if (
    !Object.isFrozen(value) ||
    !Object.isFrozen(binding.provider) ||
    !Object.isFrozen(binding.handoff) ||
    !Object.isFrozen(handoff.authorityBinding) ||
    provider.schemaVersion !== "mounted-provider-authority-readback.v1" ||
    provider.stage !== "locator" ||
    !Number.isInteger(provider.highWaterOrdinal) ||
    (provider.highWaterOrdinal as number) < 0 ||
    !Number.isInteger(provider.durableLedgerEventCount) ||
    (provider.durableLedgerEventCount as number) < 0 ||
    !Number.isInteger(handoff.retryGeneration) ||
    (handoff.retryGeneration as number) < 0
  ) {
    throw new Error("resident factory authority binding is not an exact issued readback");
  }
  for (const [field, raw] of Object.entries({
    workspaceId: provider.workspaceId,
    mountInstanceId: provider.mountInstanceId,
    admissionGenerationId: provider.admissionGenerationId,
    policyVersion: provider.policyVersion,
    policyDigest: provider.policyDigest,
    lockStateDigest: provider.lockStateDigest,
    highWaterMark: provider.highWaterMark,
    taskId: handoff.taskId,
    attemptId: handoff.attemptId,
    runId: handoff.runId,
    runType: handoff.runType
  })) {
    requiredText(raw, field);
  }
  return Object.freeze({
    provider: Object.freeze({ ...provider }) as unknown as ResidentLoopFactoryBinding["provider"],
    handoff: Object.freeze({
      ...handoff,
      authorityBinding: Object.freeze({ ...authorityBinding })
    }) as unknown as ResidentLoopFactoryBinding["handoff"]
  });
}

function assertResidentFactoryBindingCurrent(
  binding: ResidentLoopFactoryBinding,
  snapshot: ResidentAuthoritySnapshot,
  mounted: MountedResidentStoreState
): void {
  const facts = snapshot.facts;
  if (
    snapshot.activeLockIds.length > 0 ||
    facts.workspaceId !== binding.provider.workspaceId ||
    facts.mountInstanceId !== binding.provider.mountInstanceId ||
    facts.policyVersion !== binding.provider.policyVersion ||
    facts.policyDigest !== binding.provider.policyDigest ||
    facts.lockStateDigest !== binding.provider.lockStateDigest ||
    facts.highWaterMark !== binding.provider.highWaterMark ||
    facts.highWaterOrdinal !== binding.provider.highWaterOrdinal ||
    snapshot.events.length !== binding.provider.durableLedgerEventCount ||
    mounted.binding.workspaceId !== binding.provider.workspaceId
  ) {
    throw new Error("resident factory authority binding is stale or foreign");
  }
  const claims = snapshot.events.filter((event): event is KnowledgeEventOf<"agent.task.orchestration.claimed"> =>
    event.type === "agent.task.orchestration.claimed" &&
    event.payload.taskId === binding.handoff.taskId &&
    event.payload.attemptId === binding.handoff.attemptId &&
    event.payload.retryGeneration === binding.handoff.retryGeneration &&
    event.payload.runType === binding.handoff.runType
  );
  if (claims.length !== 1) {
    throw new Error("resident factory authority binding requires one exact mounted orchestration claim");
  }
}

function normalizeResidentCheckpointPayload(
  owner: ResidentLoopBoundState,
  value: unknown
): ResidentCheckpointEvent["payload"] {
  const copied = copyResidentOwnData(value);
  if (copied === null || typeof copied !== "object" || Array.isArray(copied)) {
    throw new Error("resident-loop checkpoint input must be plain own-data");
  }
  const payload = copied as ResidentCheckpointEvent["payload"];
  const instruction = payload.residentLoopSuspension;
  if (
    payload.checkpointKind !== "resident-loop-suspension" ||
    instruction === undefined ||
    payload.taskId !== instruction.taskId ||
    payload.attemptId !== instruction.attemptId ||
    payload.runId !== instruction.runId ||
    payload.leaseClaimGeneration !== instruction.leaseClaimGeneration ||
    payload.safeNextActions.length === 0 ||
    !payload.safeNextActions.includes(instruction.nextSafeAction)
  ) {
    throw new Error("resident-loop checkpoint input lacks its exact strict instruction");
  }
  const candidate = {
    id: "evt_resident_checkpoint_validation",
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId: orchestrationStreamId(payload.taskId, payload.runType),
    sequence: 1,
    context: {
      actor: owner.mounted.input.actor,
      occurredAt: payload.checkpointedAt,
      causationId: instruction.orchestrationClaimEventId,
      correlationId: `corr_${payload.taskId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload
  };
  const parsed = validateKnowledgeEvent(candidate);
  if (!parsed.success || parsed.data.type !== "agent.task.orchestration.checkpointed") {
    throw new Error("resident-loop checkpoint input is not canonical");
  }
  return parsed.data.payload;
}

function assertResidentCheckpointBinding(
  owner: ResidentLoopBoundState,
  payload: ResidentCheckpointEvent["payload"],
  snapshot: ResidentAuthoritySnapshot
): void {
  const instruction = payload.residentLoopSuspension;
  if (
    instruction === undefined ||
    payload.checkpointKind !== "resident-loop-suspension" ||
    payload.taskId !== owner.binding.handoff.taskId ||
    payload.attemptId !== owner.binding.handoff.attemptId ||
    payload.runId !== owner.binding.handoff.runId ||
    payload.runType !== owner.binding.handoff.runType ||
    payload.retryGeneration !== owner.binding.handoff.retryGeneration ||
    instruction.taskId !== owner.binding.handoff.taskId ||
    instruction.attemptId !== owner.binding.handoff.attemptId ||
    instruction.runId !== owner.binding.handoff.runId ||
    snapshot.facts.workspaceId !== owner.binding.provider.workspaceId
  ) {
    throw new Error("resident-loop checkpoint does not match mounted task authority");
  }
  const claim = snapshot.events.find((event): event is KnowledgeEventOf<"agent.task.orchestration.claimed"> =>
    event.id === instruction.orchestrationClaimEventId &&
    event.type === "agent.task.orchestration.claimed"
  );
  if (
    claim === undefined ||
    claim.payload.taskId !== payload.taskId ||
    claim.payload.attemptId !== payload.attemptId ||
    claim.payload.runType !== payload.runType ||
    claim.payload.retryGeneration !== payload.retryGeneration ||
    claim.payload.leaseClaimGeneration !== payload.leaseClaimGeneration
  ) {
    throw new Error("resident-loop checkpoint does not name its exact durable claim");
  }
}

async function readOrAppendResidentCheckpoint(
  owner: ResidentLoopBoundState,
  payload: ResidentCheckpointEvent["payload"]
): Promise<ResidentCheckpointEvent> {
  const instruction = payload.residentLoopSuspension!;
  const ledger = owner.mounted.ledger;
  const streamId = orchestrationStreamId(payload.taskId, payload.runType);
  const [stream, allEvents] = await Promise.all([ledger.readStream(streamId), ledger.readAll()]);
  const matching = stream.filter((event): event is ResidentCheckpointEvent =>
    event.type === "agent.task.orchestration.checkpointed" &&
    event.payload.checkpointKind === "resident-loop-suspension" &&
    event.payload.resumeIdempotencyKey === payload.resumeIdempotencyKey
  );
  if (matching.length > 1) throw new Error("resident-loop checkpoint semantic key is duplicated");
  if (matching[0] !== undefined) {
    if (
      canonicalResidentJson(matching[0].payload) !== canonicalResidentJson(payload) ||
      matching[0].context.causationId !== instruction.orchestrationClaimEventId
    ) {
      throw new Error("resident-loop checkpoint semantic key binds different canonical bytes");
    }
    return matching[0];
  }
  const appendable: AppendableKnowledgeEvent<"agent.task.orchestration.checkpointed"> = {
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId,
    context: {
      actor: owner.mounted.input.actor,
      occurredAt: payload.checkpointedAt,
      causationId: instruction.orchestrationClaimEventId,
      correlationId: `corr_${payload.taskId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload
  };
  const appended = await ledger.append(appendable, {
    expectedNextSequence: stream.length + 1,
    expectedGlobalEventCount: allEvents.length
  });
  const reread = (await ledger.readStream(streamId)).filter((event): event is ResidentCheckpointEvent =>
    event.id === appended.id && event.type === "agent.task.orchestration.checkpointed"
  );
  if (reread.length !== 1 || canonicalResidentJson(reread[0]!.payload) !== canonicalResidentJson(payload)) {
    throw new Error("resident-loop checkpoint lacks exact durable reread");
  }
  return reread[0]!;
}

function matchingResidentSuspensions(
  stream: readonly KnowledgeEvent[],
  checkpoint: ResidentCheckpointEvent
): ResidentSuspensionEvent[] {
  const instruction = checkpoint.payload.residentLoopSuspension!;
  return stream.filter((event): event is ResidentSuspensionEvent =>
    event.type === "agent.resident-loop.suspended.v2" &&
    event.context.causationId === checkpoint.id &&
    event.payload.checkpoint.orchestrationCheckpointEventId === checkpoint.id &&
    event.payload.suspensionCategory === instruction.suspensionCategory
  );
}

function matchingResidentResults(
  stream: readonly KnowledgeEvent[],
  suspension: ResidentSuspensionEvent
): ResidentResultEvent[] {
  return stream.filter((event): event is ResidentResultEvent =>
    event.type === "agent.resident-loop.result.recorded.v2" &&
    event.context.causationId === suspension.id &&
    event.payload.outcome === "resumable" &&
    event.payload.category === suspension.payload.suspensionCategory &&
    event.payload.resumeAnchor?.checkpointEventId === suspension.id
  );
}

async function readOrAppendResidentRelease(
  owner: ResidentLoopBoundState,
  checkpoint: ResidentCheckpointEvent,
  suspension: ResidentSuspensionEvent,
  result: ResidentResultEvent
): Promise<ResidentReleaseEvent> {
  const ledger = owner.mounted.ledger;
  const payload = checkpoint.payload;
  const instruction = payload.residentLoopSuspension!;
  const streamId = checkpoint.streamId;
  const [stream, allEvents] = await Promise.all([ledger.readStream(streamId), ledger.readAll()]);
  const releases = stream.filter((event): event is ResidentReleaseEvent =>
    event.type === "agent.task.orchestration.released" &&
    event.payload.releaseReason === "resident-loop-suspended" &&
    event.payload.checkpointEventId === checkpoint.id
  );
  if (releases.length > 1) throw new Error("resident-loop checkpoint release is duplicated");
  if (releases[0] !== undefined) {
    if (
      releases[0].payload.claimEventId !== instruction.orchestrationClaimEventId ||
      releases[0].context.causationId !== result.id
    ) {
      throw new Error("resident-loop checkpoint release binds different canonical bytes");
    }
    return releases[0];
  }
  const releasedAt = normalizedWakeInstant(
    owner.mounted.input.now(),
    "resident-loop suspension release"
  ).iso;
  const appendable: AppendableKnowledgeEvent<"agent.task.orchestration.released"> = {
    type: "agent.task.orchestration.released",
    version: 1,
    streamId,
    context: {
      actor: owner.mounted.input.actor,
      occurredAt: releasedAt,
      causationId: result.id,
      correlationId: checkpoint.context.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      taskId: payload.taskId,
      runType: payload.runType,
      attemptId: payload.attemptId,
      retryGeneration: payload.retryGeneration,
      leaseClaimGeneration: payload.leaseClaimGeneration,
      releasedBy: owner.mounted.input.actor.id,
      releasedAt,
      releaseReason: "resident-loop-suspended",
      claimEventId: instruction.orchestrationClaimEventId,
      checkpointEventId: checkpoint.id,
      safeNextActions: [...payload.safeNextActions]
    }
  };
  const appended = await ledger.append(appendable, {
    expectedNextSequence: stream.length + 1,
    expectedGlobalEventCount: allEvents.length
  });
  const reread = (await ledger.readStream(streamId)).find((event): event is ResidentReleaseEvent =>
    event.id === appended.id && event.type === "agent.task.orchestration.released"
  );
  if (
    reread === undefined ||
    reread.payload.checkpointEventId !== checkpoint.id ||
    reread.context.causationId !== result.id
  ) {
    throw new Error("resident-loop release lacks exact durable reread");
  }
  void suspension;
  return reread;
}

function issueReleasedCheckpointReadback(
  checkpoint: ResidentCheckpointEvent,
  suspension: ResidentSuspensionEvent,
  result: ResidentResultEvent,
  release: ResidentReleaseEvent
): OpaqueReleasedCheckpointReadback {
  const readback = Object.freeze({
    schemaVersion: "resident-loop-released-checkpoint-readback.v1" as const,
    checkpointEventId: checkpoint.id,
    suspensionEventId: suspension.id,
    resultEventId: result.id,
    releaseEventId: release.id
  });
  issuedReleasedCheckpointReadbacks.add(readback);
  return readback;
}

async function readResidentCheckpointByLocator(
  owner: ResidentLoopBoundState,
  locator: ExactResidentLoopSuspensionLocator
): Promise<ResidentCheckpointEvent> {
  const stream = await owner.mounted.ledger.readStream(orchestrationStreamId(
    locator.taskId,
    owner.binding.handoff.runType
  ));
  const matches = stream.filter((event): event is ResidentCheckpointEvent =>
    event.type === "agent.task.orchestration.checkpointed" &&
    event.payload.checkpointKind === "resident-loop-suspension" &&
    event.payload.resumeIdempotencyKey === locator.checkpointSemanticKey
  );
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new Error("resident-loop checkpoint locator is absent or ambiguous");
  }
  return matches[0];
}

function normalizeResidentSuspensionLocator(value: unknown): ExactResidentLoopSuspensionLocator {
  const locator = exactResidentRecord(value, [
    "taskId",
    "attemptId",
    "runId",
    "checkpointSemanticKey"
  ], "resident-loop suspension locator");
  return Object.freeze({
    taskId: requiredText(locator.taskId, "resident suspension task ID"),
    attemptId: requiredText(locator.attemptId, "resident suspension attempt ID"),
    runId: requiredText(locator.runId, "resident suspension run ID"),
    checkpointSemanticKey: requiredText(
      locator.checkpointSemanticKey,
      "resident suspension checkpoint semantic key"
    )
  });
}

function orchestrationStreamId(taskId: string, runType: string): string {
  return `agent_task_orchestration_${taskId}_${runType}`;
}

function exactResidentRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    throw new Error(`${label} must be a plain own-data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(descriptors, key)) ||
    Object.values(descriptors).some((descriptor) =>
      !descriptor.enumerable || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined
    )
  ) {
    throw new Error(`${label} must contain exactly its frozen fields`);
  }
  return value as Record<string, unknown>;
}

function copyResidentOwnData(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("resident-loop input numbers must be finite");
    return value;
  }
  if (typeof value !== "object" || isProxy(value)) {
    throw new Error("resident-loop input must contain only plain own-data");
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) {
      throw new Error("resident-loop input arrays must be dense and ordinary");
    }
    return Object.freeze(value.map((entry) => copyResidentOwnData(entry)));
  }
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new Error("resident-loop input objects must use a plain prototype");
  }
  const copy: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error("resident-loop input cannot contain symbol keys");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new Error("resident-loop input cannot contain accessors or hidden fields");
    }
    copy[key] = copyResidentOwnData(descriptor.value);
  }
  return Object.freeze(copy);
}

function canonicalResidentJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalResidentJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalResidentJson(Reflect.get(value, key))}`
    ).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
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
  workspace: FactoryAuthenticatedMountedWakeStoreAuthority["workspace"]
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
  authority: FactoryAuthenticatedMountedWakeStoreAuthority,
  ledger: FactoryAuthenticatedMountedWakeStoreAuthority["ledger"],
  mountedWorkspace: FactoryAuthenticatedMountedWakeStoreAuthority["mountedWorkspace"],
  binding: MountedWorkspaceBinding
): void {
  authority.revalidate();
  const currentBinding = structuralMountedWorkspaceBinding(authority.workspace);
  if (
    authority.ledger !== ledger || authority.mountedWorkspace !== mountedWorkspace ||
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
    !hasExactKeys(value as unknown as Record<string, unknown>, ["capability", "actor", "supervisorEpoch", "policy", "now", "createSafeId"]) ||
    !isPlainRecord(value.policy) ||
    !hasExactKeys(value.policy, ["policyVersion", "policyDigest", "lockStateDigest"]) ||
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

function hasExactKeys(value: object, keys: readonly string[]): boolean {
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
  return activeResidentLockIds(events).length > 0;
}

function activeResidentLockIds(events: readonly KnowledgeEvent[]): readonly string[] {
  const activeLocks = new Set<string>();
  for (const event of events) {
    if (event.type === "agent.lock.activated" && event.payload.residentAgentId === "agent_default") {
      activeLocks.add(event.payload.lockId);
    }
    if (event.type === "agent.lock.cleared") activeLocks.delete(event.payload.lockId);
  }
  return Object.freeze([...activeLocks].sort());
}
