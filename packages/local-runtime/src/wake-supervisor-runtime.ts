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
import type { ActorRef } from "../../ontology/src/contracts.js";
import { registerMountedArtifactAuthorityIssuerForWakeRuntime } from "./mounted-artifact-authority-operation.js";
import {
  createMountedWakeLifecycleStore,
  type MountedWakePolicySnapshot
} from "./mounted-wake-lifecycle-store.js";
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
      start: async () => (await supervisor()).start(),
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
  return Object.freeze(runtime);
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
