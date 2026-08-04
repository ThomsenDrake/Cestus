import { randomUUID } from "node:crypto";
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
import { buildAgentProjection } from "../../agent/src/projection.js";
import {
  consumeMountedSpecialistHandoffAuthorityWitness,
  type ConsumedMountedSpecialistHandoffAuthorityWitness,
  type HandoffAuthorityBinding,
  type MountedSpecialistHandoffAuthorityWitness
} from "../../agent/src/specialist-handoff-authority.js";
import { hashCanonicalSpecialistHandoffJson } from "../../agent/src/specialist-handoff-manifest.js";
import type { ActorRef, KnowledgeEvent } from "../../ontology/src/contracts.js";
import { mountPortableWorkspace, type MountedPortableWorkspace } from "../../workspace/src/index.js";
import {
  registerMountedArtifactAuthorityIssuerForWakeRuntime
} from "./mounted-artifact-authority-operation.js";
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
import {
  type FactoryPortableMountedAgentHandoffProducerResultV1,
  type PortableMountedAgentHandoffBinding
} from "./portable-mounted-agent-artifact-stores.js";
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

export interface PortableWorkspaceCurrentness {
  readonly ok: boolean;
  readonly category?: "workspace-unavailable" | "workspace-identity-mismatch";
}

export interface ResidentSupervisionSnapshot {
  readonly supervisorState: WakeStatusDto["supervisorState"];
  readonly workspaceState: WakeStatusDto["workspaceState"];
  readonly workspaceId?: string | undefined;
  readonly nextWakeAt?: string | undefined;
  readonly activeCycle: boolean;
  readonly provenanceEventIds: readonly string[];
  readonly diagnostics: readonly {
    readonly category: string;
    readonly safeMessage: string;
    readonly allowedRepairActions: readonly string[];
  }[];
}

export interface ResidentSupervisionRuntime {
  snapshot(): Promise<ResidentSupervisionSnapshot>;
  pause(): Promise<ResidentSupervisionSnapshot>;
  resume(): Promise<ResidentSupervisionSnapshot>;
  signalLocalAdmission(): void;
  executeSourcedInvestigation(task: ResidentSourcedInvestigationTask): Promise<unknown>;
  quiesceTask(taskId: string): Promise<void>;
  stop(): Promise<void>;
}

export interface ResidentAdmittedLocalTask {
  readonly taskId: string;
  readonly runId: string;
}

export type ResidentSourcedInvestigationTask = ResidentAdmittedLocalTask & (
  | {
      readonly runType: "timeline-builder" | "contradiction-finder";
      readonly evidenceIds: readonly string[];
    }
  | {
      readonly runType: "investigation-planner";
      readonly investigationId: string;
    }
  | {
      readonly runType: "prr-negotiation";
      readonly prrRequestId: string;
      readonly correspondenceId: string;
      readonly jurisdictionRuleRefs: readonly string[];
    }
);

export interface ResidentSourcedInvestigationExecutionPort {
  execute(
    task: ResidentSourcedInvestigationTask,
    handoff: FactoryPortableMountedAgentHandoffProducerResultV1
  ): Promise<unknown>;
}

export type MountedSourcedInvestigationHandoffIssuer = (
  wakeRuntime: WakeSupervisorRuntime,
  task: ResidentSourcedInvestigationTask
) => Promise<FactoryPortableMountedAgentHandoffProducerResultV1>;

export interface MountedEvidenceTriageHandoffCapability {
  readonly binding: PortableMountedAgentHandoffBinding;
  consume(eventIds: readonly string[]): Promise<void>;
}

export type MountedEvidenceTriageHandoffAcquirer =
  () => Promise<MountedEvidenceTriageHandoffCapability>;

export type MountedEvidenceTriageHandoffIssuer = (
  wakeRuntime: WakeSupervisorRuntime,
  task: ResidentAdmittedLocalTask
) => Promise<MountedEvidenceTriageHandoffCapability>;

export interface ResidentBackgroundExecutionPort {
  pendingLocalTasks(): Promise<readonly ResidentAdmittedLocalTask[]>;
  execute(
    task: ResidentAdmittedLocalTask,
    acquireHandoff: MountedEvidenceTriageHandoffAcquirer
  ): Promise<void>;
}

export interface ResidentSupervisionRuntimeInput {
  readonly runtimeHandle: LocalRuntimeHandle;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly createSupervisorOwnerId?: (() => string) | undefined;
  readonly backgroundExecution?: ResidentBackgroundExecutionPort | undefined;
  readonly issueMountedEvidenceTriageHandoff?: MountedEvidenceTriageHandoffIssuer | undefined;
  readonly sourcedInvestigationExecution?: ResidentSourcedInvestigationExecutionPort | undefined;
  readonly issueMountedSourcedInvestigationHandoff?: MountedSourcedInvestigationHandoffIssuer | undefined;
  readonly beforeLeaseExpiryPollForTest?: (() => void | Promise<void>) | undefined;
}

export class ResidentSourcedInvestigationLeaseUnavailableError extends Error {
  readonly status = 409 as const;
  readonly safeMessage = "The current resident wake lease has already issued its one-shot investigation authority.";
  readonly allowedRepairActions = Object.freeze([
    "retry after the current resident wake lease expires",
    "inspect resident supervision status without invoking a provider"
  ]);

  constructor() {
    super("resident-sourced-investigation-lease-unavailable");
    this.name = "ResidentSourcedInvestigationLeaseUnavailableError";
  }
}

/**
 * Owns the resident wake lease for the lifetime of the local service. Browser
 * requests only observe this owner or append explicit human control commands.
 */
export function createResidentSupervisionRuntime(
  input: ResidentSupervisionRuntimeInput
): ResidentSupervisionRuntime {
  const supervisorOwnerId = residentSupervisorOwnerId(input.createSupervisorOwnerId);
  const supervisorEpoch = `epoch_local_supervision_${supervisorOwnerId}`;
  let wakeRuntime: WakeSupervisorRuntime | undefined;
  let wakeStatus: WakeStatusDto | undefined;
  let stopped = false;
  let authorityLost = false;
  let safeIdOrdinal = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pollCycle: Promise<void> | undefined;
  let backgroundRetryTimer: ReturnType<typeof setTimeout> | undefined;
  let backgroundCycle: Promise<void> | undefined;
  let backgroundCycleScheduled = false;
  let backgroundRescanRequested = false;
  let activeCycle = false;
  let activeTaskId: string | undefined;
  let sourcedExecutionCycle: {
    readonly taskId: string;
    readonly promise: Promise<unknown>;
  } | undefined;
  let sourcedHandoffWakeRuntime: WakeSupervisorRuntime | undefined;
  let pausePending = false;
  let pendingPauseControls = 0;
  let supervisionControlTail: Promise<void> = Promise.resolve();
  let residentExecutionTail: Promise<void> = Promise.resolve();
  let stopPromise: Promise<void> | undefined;

  const supervision: ResidentSupervisionRuntime = Object.freeze({
    async snapshot() {
      assertServiceRunning();
      const currentness = inspectPortableWorkspaceCurrentness(input.runtimeHandle);
      if (!currentness.ok) {
        authorityLost = true;
        cancelTimer();
        const issued = wakeRuntime;
        if (issued !== undefined) {
          await issued.stop();
          forgetWakeRuntime(issued);
        }
        wakeStatus = undefined;
        return unavailableSnapshot(input, currentness.category ?? "workspace-unavailable");
      }

      const durable = await durableSupervisionState(input.runtimeHandle, input.now());
      if (authorityLost) {
        return reconnectedSnapshot(input, durable);
      }
      if (durable.mode === "paused") {
        pausePending = true;
        cancelTimer();
        cancelBackgroundRetry();
        return pausedSnapshot(input, durable, wakeStatus, activeCycle);
      }
      if (wakeRuntime === undefined) {
        const issued = await issueWakeRuntime("startup");
        wakeStatus = (await issued.supervision.start()).status;
      } else {
        wakeStatus = await wakeRuntime.supervision.status();
      }
      const snapshot = runningSnapshot(input, await durableSupervisionState(input.runtimeHandle, input.now()), wakeStatus, activeCycle);
      scheduleWake(snapshot.nextWakeAt);
      return snapshot;
    },

    async pause() {
      assertServiceRunning();
      requireCurrentWorkspace(input.runtimeHandle);
      pendingPauseControls += 1;
      pausePending = true;
      cancelTimer();
      cancelBackgroundRetry();
      backgroundRescanRequested = false;
      try {
        return await serializeSupervisionControl(async () => {
          assertServiceRunning();
          requireCurrentWorkspace(input.runtimeHandle);
          let durablePauseRecorded = false;
          try {
            let durable = await durableSupervisionState(input.runtimeHandle, input.now());
            if (durable.mode !== "paused") {
              if (wakeRuntime === undefined) {
                const issued = await issueWakeRuntime("pause");
                wakeStatus = (await issued.supervision.start()).status;
              }
              const command = await wakeCommand(input, "pause", nextCommandId("pause"));
              const result = await wakeRuntime!.supervision.pause(command);
              wakeStatus = result.status;
              if (result.outcome !== "completed") {
                throw new Error("Resident supervision pause was not durably recorded.");
              }
              durable = await durableSupervisionState(input.runtimeHandle, input.now());
            }
            if (durable.mode !== "paused") {
              throw new Error("Resident supervision pause was not durably recorded.");
            }
            durablePauseRecorded = true;
            await quiesceBackgroundExecution();
            const issued = wakeRuntime;
            if (issued !== undefined) {
              await issued.stop();
              forgetWakeRuntime(issued);
            }
            return pausedSnapshot(input, durable, wakeStatus, activeCycle);
          } catch (error) {
            if (!durablePauseRecorded && pendingPauseControls === 1) {
              pausePending = false;
              scheduleBackgroundCycle();
            }
            throw error;
          }
        });
      } finally {
        pendingPauseControls -= 1;
      }
    },

    async resume() {
      assertServiceRunning();
      return await serializeSupervisionControl(async () => {
        assertServiceRunning();
        requireCurrentWorkspace(input.runtimeHandle);
        const durable = await awaitServiceRunning(
          durableSupervisionState(input.runtimeHandle, input.now())
        );
        if (!authorityLost && durable.mode !== "paused" && wakeRuntime !== undefined) {
          if (pendingPauseControls === 0) pausePending = false;
          wakeStatus = await awaitServiceRunning(wakeRuntime.supervision.status());
          return runningSnapshot(input, durable, wakeStatus, activeCycle);
        }
        const priorWake = wakeRuntime;
        if (priorWake !== undefined) {
          await awaitServiceRunning(priorWake.stop());
          forgetWakeRuntime(priorWake);
        }
        const operation = authorityLost ? "recover" : "resume";
        if (operation === "recover" && durable.nextWakeAt !== undefined &&
          !await awaitServiceRunning(fenceOwnedLeaseForRecovery())) {
          const reconnected = await awaitServiceRunning(
            durableSupervisionState(input.runtimeHandle, input.now())
          );
          return reconnectedSnapshot(input, reconnected);
        }
        const issued = await awaitServiceRunning(issueWakeRuntime(operation));
        const command = await awaitServiceRunning(
          wakeCommand(input, operation, nextCommandId(operation))
        );
        const result = operation === "recover"
          ? await awaitServiceRunning(issued.supervision.recover(command))
          : await awaitServiceRunning(issued.supervision.resume(command));
        wakeStatus = result.status;
        if (result.outcome === "blocked") {
          if (result.blocked?.category === "supervisor-lease-held") {
            authorityLost = true;
            await awaitServiceRunning(issued.stop().catch(() => undefined));
            forgetWakeRuntime(issued);
            const reconnected = await awaitServiceRunning(
              durableSupervisionState(input.runtimeHandle, input.now())
            );
            return reconnectedSnapshot(input, reconnected);
          }
          throw new Error("Resident supervision could not be resumed safely.");
        }
        authorityLost = false;
        if (pendingPauseControls === 0) pausePending = false;
        const resumed = await awaitServiceRunning(
          durableSupervisionState(input.runtimeHandle, input.now())
        );
        const snapshot = runningSnapshot(
          input,
          resumed,
          wakeStatus,
          activeCycle
        );
        scheduleWake(snapshot.nextWakeAt);
        scheduleBackgroundCycle();
        return snapshot;
      });
    },

    signalLocalAdmission() {
      assertServiceRunning();
      scheduleBackgroundCycle();
    },

    async executeSourcedInvestigation(task: ResidentSourcedInvestigationTask) {
      assertServiceRunning();
      const execution = input.sourcedInvestigationExecution;
      const issuer = input.issueMountedSourcedInvestigationHandoff;
      if (execution === undefined || issuer === undefined) {
        throw new Error("Mounted sourced-investigation execution is unavailable.");
      }
      return await serializeSupervisionControl(async () => {
        assertServiceRunning();
        requireCurrentWorkspace(input.runtimeHandle);
        if (pausePending || activeCycle ||
          (await durableSupervisionState(input.runtimeHandle, input.now())).mode === "paused") {
          throw new Error("Resident supervision is not available for sourced investigation.");
        }
        if (sourcedHandoffWakeRuntime !== undefined) {
          if (wakeRuntime !== sourcedHandoffWakeRuntime) {
            sourcedHandoffWakeRuntime = undefined;
          } else if (!await retireExpiredSourcedWake(sourcedHandoffWakeRuntime)) {
            throw new ResidentSourcedInvestigationLeaseUnavailableError();
          }
        }
        return await serializeResidentExecution(async () => {
          assertServiceRunning();
          requireCurrentWorkspace(input.runtimeHandle);
          if (pausePending || activeCycle ||
            (await durableSupervisionState(input.runtimeHandle, input.now())).mode === "paused") {
            throw new Error("Resident supervision is not available for sourced investigation.");
          }
          const operationTimestamp = input.now();
          const operationNow = () => operationTimestamp;
          const issued = wakeRuntime ?? await issueWakeRuntime(`sourced_${task.runId}`, operationNow);
          if (wakeStatus === undefined) {
            const started = await issued.supervision.start();
            wakeStatus = started.status;
            if (started.outcome !== "accepted") {
              await issued.stop().catch(() => undefined);
              wakeStatus = undefined;
              forgetWakeRuntime(issued);
              throw new Error("Resident supervision lease is unavailable for sourced investigation.");
            }
          }
          activeCycle = true;
          activeTaskId = task.taskId;
          const cycle = (async () => {
            const handoff = await issuer(issued, task);
            sourcedHandoffWakeRuntime = issued;
            return await execution.execute(task, handoff);
          })();
          const trackedCycle = Object.freeze({ taskId: task.taskId, promise: cycle });
          sourcedExecutionCycle = trackedCycle;
          try {
            return await cycle;
          } finally {
            if (sourcedExecutionCycle === trackedCycle) sourcedExecutionCycle = undefined;
            activeCycle = false;
            activeTaskId = undefined;
          }
        });
      });
    },

    async quiesceTask(taskId: string) {
      assertServiceRunning();
      while (activeTaskId === taskId) {
        const sourcedCycle = sourcedExecutionCycle;
        if (sourcedCycle !== undefined && sourcedCycle.taskId === taskId) {
          await sourcedCycle.promise.catch(() => undefined);
          continue;
        }
        const cycle = backgroundCycle;
        if (cycle === undefined) return;
        await cycle.catch(() => undefined);
      }
    },

    async stop() {
      if (stopPromise !== undefined) return await stopPromise;
      stopped = true;
      pausePending = true;
      cancelTimer();
      cancelBackgroundRetry();
      backgroundRescanRequested = false;
      stopPromise = (async () => {
        await pollCycle?.catch(() => undefined);
        await backgroundCycle?.catch(() => undefined);
        await supervisionControlTail;
        const issued = wakeRuntime;
        wakeStatus = undefined;
        if (issued !== undefined) await issued.stop();
        forgetWakeRuntime(issued);
      })();
      return await stopPromise;
    }
  });

  scheduleBackgroundCycle();
  return supervision;

  async function issueWakeRuntime(
    reason: string,
    operationNow: () => string = input.now
  ): Promise<WakeSupervisorRuntime> {
    requireCurrentWorkspace(input.runtimeHandle);
    if (wakeRuntime !== undefined) {
      throw new Error("Resident wake runtime replacement requires retiring the current identity first.");
    }
    const events = await input.runtimeHandle.ledger.readAll();
    const mounted = input.runtimeHandle.mountedWorkspace;
    if (mounted === undefined) throw new Error("Portable workspace supervision is unavailable.");
    const policy = residentSupervisionPolicy(events, mounted.workspaceId);
    wakeRuntime = createWakeSupervisorRuntime({
      runtimeHandle: input.runtimeHandle,
      actor: input.actor,
      supervisorEpoch,
      policy,
      now: operationNow,
      createSafeId(kind) {
        safeIdOrdinal += 1;
        return `${kind}_local_supervision_${supervisorOwnerId}_${safeIdOrdinal}_${reason}`;
      }
    });
    return wakeRuntime;
  }

  async function retireExpiredSourcedWake(issued: WakeSupervisorRuntime): Promise<boolean> {
    if (wakeRuntime !== issued || sourcedHandoffWakeRuntime !== issued) return false;
    requireCurrentWorkspace(input.runtimeHandle);
    const observedAt = input.now();
    const observedAtMs = Date.parse(observedAt);
    const events = await input.runtimeHandle.ledger.readAll();
    requireCurrentWorkspace(input.runtimeHandle);
    const lease = events.findLast((event): event is Extract<KnowledgeEvent, {
      readonly type: "agent.wake.supervisor.lease.claimed.v1";
    }> => event.type === "agent.wake.supervisor.lease.claimed.v1" &&
      event.payload.supervisorEpoch === supervisorEpoch
    );
    const expiresAtMs = lease === undefined ? Number.NaN : Date.parse(lease.payload.leaseExpiresAt);
    if (!Number.isFinite(observedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs > observedAtMs) {
      return false;
    }
    await issued.stop();
    requireCurrentWorkspace(input.runtimeHandle);
    if (wakeRuntime !== issued) {
      throw new Error("Resident sourced-investigation wake identity changed during expiry retirement.");
    }
    forgetWakeRuntime(issued);
    wakeStatus = undefined;
    return true;
  }

  function forgetWakeRuntime(issued: WakeSupervisorRuntime | undefined): void {
    if (issued === undefined) return;
    if (wakeRuntime === issued) wakeRuntime = undefined;
    if (sourcedHandoffWakeRuntime === issued) sourcedHandoffWakeRuntime = undefined;
  }

  async function fenceOwnedLeaseForRecovery(): Promise<boolean> {
    const issued = await issueWakeRuntime("recovery_fence");
    try {
      const started = await issued.supervision.start();
      wakeStatus = started.status;
      if (started.outcome !== "accepted") return false;
      const command = await wakeCommand(input, "pause", nextCommandId("recovery_fence"));
      const paused = await issued.supervision.pause(command);
      wakeStatus = paused.status;
      return paused.outcome === "completed";
    } finally {
      await issued.stop().catch(() => undefined);
      forgetWakeRuntime(issued);
    }
  }

  function nextCommandId(operation: string): string {
    safeIdOrdinal += 1;
    return `${operation}_local_supervision_${supervisorOwnerId}_${safeIdOrdinal}`;
  }

  function scheduleWake(nextWakeAt: string | undefined): void {
    cancelTimer();
    if (nextWakeAt === undefined || stopped) return;
    const delay = Math.max(1, Date.parse(nextWakeAt) - Date.parse(input.now()) + 1);
    timer = setTimeout(() => {
      timer = undefined;
      if (pollCycle !== undefined || stopped) return;
      pollCycle = pollAfterLeaseExpiry().finally(() => {
        pollCycle = undefined;
      });
    }, delay);
    timer.unref?.();
  }

  async function pollAfterLeaseExpiry(): Promise<void> {
    if (stopped) return;
    await input.beforeLeaseExpiryPollForTest?.();
    if (stopped) return;
    const currentness = inspectPortableWorkspaceCurrentness(input.runtimeHandle);
    if (!currentness.ok) {
      authorityLost = true;
      const issued = wakeRuntime;
      if (issued !== undefined) await issued.stop();
      forgetWakeRuntime(issued);
      wakeStatus = undefined;
      return;
    }
    try {
      const priorWake = wakeRuntime;
      if (priorWake !== undefined) await priorWake.stop();
      forgetWakeRuntime(priorWake);
      if (stopped) return;
      const issued = await issueWakeRuntime("poll");
      if (stopped) {
        await issued.stop().catch(() => undefined);
        forgetWakeRuntime(issued);
        return;
      }
      const signalId = nextCommandId("poll");
      wakeStatus = (await issued.supervision.signal({
        schemaVersion: "resident-wake-signal.v1",
        source: "poll",
        idempotencyKey: signalId,
        sourceEventIds: [],
        requestedAt: input.now()
      })).status;
      const snapshot = runningSnapshot(
        input,
        await durableSupervisionState(input.runtimeHandle, input.now()),
        wakeStatus,
        activeCycle
      );
      scheduleWake(snapshot.nextWakeAt);
      scheduleBackgroundCycle();
    } catch {
      authorityLost = true;
      const failedWake = wakeRuntime;
      if (failedWake !== undefined) await failedWake.stop().catch(() => undefined);
      forgetWakeRuntime(failedWake);
      wakeStatus = undefined;
    }
  }

  function cancelTimer(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function assertServiceRunning(): void {
    if (stopped) throw new Error("Resident supervision service is stopped.");
  }

  async function awaitServiceRunning<T>(operation: Promise<T>): Promise<T> {
    const result = await operation;
    assertServiceRunning();
    return result;
  }

  function scheduleBackgroundCycle(): void {
    if (stopped || pausePending || input.backgroundExecution === undefined) return;
    cancelBackgroundRetry();
    if (backgroundCycleScheduled || backgroundCycle !== undefined) {
      backgroundRescanRequested = true;
      return;
    }
    backgroundCycleScheduled = true;
    queueMicrotask(() => {
      backgroundCycleScheduled = false;
      if (stopped) return;
      if (backgroundCycle !== undefined) {
        backgroundRescanRequested = true;
        return;
      }
      backgroundCycle = runBackgroundCycle().catch(() => {
        scheduleBackgroundRetry();
      }).finally(() => {
        backgroundCycle = undefined;
        if (backgroundRescanRequested) {
          backgroundRescanRequested = false;
          scheduleBackgroundCycle();
        }
      });
    });
  }

  async function runBackgroundCycle(): Promise<void> {
    const port = input.backgroundExecution;
    if (port === undefined || stopped || pausePending) return;
    const currentness = inspectPortableWorkspaceCurrentness(input.runtimeHandle);
    if (!currentness.ok) {
      authorityLost = true;
      return;
    }
    if ((await durableSupervisionState(input.runtimeHandle, input.now())).mode === "paused") return;
    const tasks = await port.pendingLocalTasks();
    for (const task of tasks) {
      if (stopped || pausePending) return;
      requireCurrentWorkspace(input.runtimeHandle);
      if ((await durableSupervisionState(input.runtimeHandle, input.now())).mode === "paused") {
        pausePending = true;
        return;
      }
      await serializeResidentExecution(async () => {
        if (stopped || pausePending) return;
        requireCurrentWorkspace(input.runtimeHandle);
        if ((await durableSupervisionState(input.runtimeHandle, input.now())).mode === "paused") {
          pausePending = true;
          return;
        }
        const operationTimestamp = input.now();
        const operationNow = () => operationTimestamp;
        const issued = wakeRuntime ?? await issueWakeRuntime(`task_${task.runId}`, operationNow);
        if (wakeStatus === undefined) {
          const started = await issued.supervision.start();
          wakeStatus = started.status;
          if (started.outcome !== "accepted") {
            await issued.stop().catch(() => undefined);
            forgetWakeRuntime(issued);
            wakeStatus = undefined;
            throw new Error("Resident supervision lease is not available for the local task.");
          }
        }
        activeCycle = true;
        activeTaskId = task.taskId;
        try {
          await port.execute(task, mountedEvidenceTriageHandoffAcquirer(
            issued,
            task,
            input.issueMountedEvidenceTriageHandoff
          ));
        } finally {
          activeCycle = false;
          activeTaskId = undefined;
          await issued.stop().catch(() => undefined);
          forgetWakeRuntime(issued);
          wakeStatus = undefined;
        }
      });
    }
  }

  function scheduleBackgroundRetry(): void {
    if (stopped || pausePending || input.backgroundExecution === undefined || backgroundRetryTimer !== undefined) return;
    backgroundRetryTimer = setTimeout(() => {
      backgroundRetryTimer = undefined;
      scheduleBackgroundCycle();
    }, 100);
    backgroundRetryTimer.unref?.();
  }

  function cancelBackgroundRetry(): void {
    if (backgroundRetryTimer !== undefined) clearTimeout(backgroundRetryTimer);
    backgroundRetryTimer = undefined;
  }

  function serializeSupervisionControl<T>(operation: () => Promise<T>): Promise<T> {
    const previous = supervisionControlTail;
    const current = previous.then(operation);
    supervisionControlTail = current.then(
      () => undefined,
      () => undefined
    );
    return current;
  }

  function serializeResidentExecution<T>(operation: () => Promise<T>): Promise<T> {
    const previous = residentExecutionTail;
    const current = previous.then(operation);
    residentExecutionTail = current.then(
      () => undefined,
      () => undefined
    );
    return current;
  }

  async function quiesceBackgroundExecution(): Promise<void> {
    while (backgroundCycleScheduled || backgroundCycle !== undefined) {
      const cycle = backgroundCycle;
      if (cycle !== undefined) {
        await cycle.catch(() => undefined);
        continue;
      }
      await Promise.resolve();
    }
  }
}

function mountedEvidenceTriageHandoffAcquirer(
  wakeRuntime: WakeSupervisorRuntime,
  task: ResidentAdmittedLocalTask,
  issuer: MountedEvidenceTriageHandoffIssuer | undefined
): MountedEvidenceTriageHandoffAcquirer {
  let acquired = false;
  return async () => {
    if (acquired) throw new Error("Mounted task handoff acquisition is one-shot.");
    acquired = true;
    if (issuer === undefined) {
      throw new Error("Mounted task handoff issuance is unavailable.");
    }
    return await issuer(wakeRuntime, task);
  };
}

function residentSupervisorOwnerId(factory: (() => string) | undefined): string {
  const ownerId = factory?.() ?? randomUUID().replaceAll("-", "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(ownerId)) {
    throw new Error("Resident supervision owner id is invalid.");
  }
  return ownerId;
}

interface DurableSupervisionState {
  readonly mode: "running" | "paused";
  readonly nextWakeAt?: string | undefined;
  readonly provenanceEventIds: readonly string[];
}

export function inspectPortableWorkspaceCurrentness(
  handle: LocalRuntimeHandle
): PortableWorkspaceCurrentness {
  const captured = handle.mountedWorkspace;
  if (captured === undefined || handle.config.storage.strategy !== "portable-workspace") {
    return Object.freeze({ ok: false, category: "workspace-unavailable" as const });
  }
  const mounted = mountPortableWorkspace({
    rootDir: captured.rootDir,
    expectedWorkspaceId: captured.workspaceId
  });
  if (!mounted.ok) {
    return Object.freeze({
      ok: false,
      category: mounted.diagnostic.code === "workspace-identity-mismatch"
        ? "workspace-identity-mismatch" as const
        : "workspace-unavailable" as const
    });
  }
  return sameWorkspaceTuple(captured, mounted.workspace)
    ? Object.freeze({ ok: true })
    : Object.freeze({ ok: false, category: "workspace-identity-mismatch" as const });
}

function requireCurrentWorkspace(handle: LocalRuntimeHandle): void {
  const currentness = inspectPortableWorkspaceCurrentness(handle);
  if (!currentness.ok) {
    throw new Error(currentness.category ?? "workspace-unavailable");
  }
}

function sameWorkspaceTuple(left: MountedPortableWorkspace, right: MountedPortableWorkspace): boolean {
  return left.workspaceId === right.workspaceId &&
    left.label === right.label &&
    left.rootDir === right.rootDir &&
    left.manifestPath === right.manifestPath &&
    left.paths.ledgerPath === right.paths.ledgerPath &&
    left.paths.blobRoot === right.paths.blobRoot &&
    left.paths.derivativeRoot === right.paths.derivativeRoot &&
    left.paths.jobRoot === right.paths.jobRoot &&
    left.paths.projectionRoot === right.paths.projectionRoot &&
    left.paths.cacheRoot === right.paths.cacheRoot &&
    left.paths.configRoot === right.paths.configRoot;
}

async function durableSupervisionState(
  handle: LocalRuntimeHandle,
  observedAt: string
): Promise<DurableSupervisionState> {
  const events = await handle.ledger.readAll();
  const lifecycle = events.filter((event) => isWakeLifecycleEvent(event));
  const latestPause = lifecycle.findLastIndex((event) => event.type === "agent.wake.supervisor.paused.v1");
  const latestResume = lifecycle.findLastIndex((event) =>
    event.type === "agent.wake.supervisor.resume.requested.v1" ||
    event.type === "agent.wake.supervisor.recovery.verified.v1"
  );
  const mode = latestPause > latestResume ? "paused" : "running";
  const latestLease = lifecycle.findLast((event) =>
    event.type === "agent.wake.supervisor.lease.claimed.v1" &&
    Date.parse(event.payload.leaseExpiresAt) > Date.parse(observedAt)
  );
  return Object.freeze({
    mode,
    ...(mode === "running" && latestLease?.type === "agent.wake.supervisor.lease.claimed.v1"
      ? { nextWakeAt: latestLease.payload.leaseExpiresAt }
      : {}),
    provenanceEventIds: Object.freeze(lifecycle.slice(-24).map((event) => event.id))
  });
}

function isWakeLifecycleEvent(event: KnowledgeEvent): boolean {
  return event.type === "agent.wake.supervisor.lease.claimed.v1" ||
    event.type === "agent.wake.supervisor.pause.requested.v1" ||
    event.type === "agent.wake.supervisor.paused.v1" ||
    event.type === "agent.wake.supervisor.resume.requested.v1" ||
    event.type === "agent.wake.supervisor.recovery.verified.v1" ||
    event.type === "agent.wake.supervisor.degraded.v1" ||
    event.type === "agent.wake.supervisor.unrecoverable.v1";
}

function residentSupervisionPolicy(
  events: readonly KnowledgeEvent[],
  workspaceId: string
): MountedWakePolicySnapshot {
  const candidates = events.filter((event) =>
    event.type === "agent.identity.initialized" && event.payload.residentAgentId === "agent_default" ||
    event.type === "agent.identity.updated" && event.payload.residentAgentId === "agent_default" &&
      (event.payload.policyId !== undefined || event.payload.allowedRunTypes !== undefined) ||
    event.type === "agent.policy.installed" && event.payload.residentAgentId === "agent_default"
  );
  const policyEvent = candidates.at(-1);
  if (policyEvent === undefined) {
    throw new Error("Resident supervision policy provenance is unavailable.");
  }
  const eventIndex = events.findIndex((candidate) => candidate.id === policyEvent.id);
  const identity = buildAgentProjection(events.slice(0, eventIndex + 1)).identity;
  if (identity?.residentAgentId !== "agent_default" || identity.workspaceId !== workspaceId ||
    identity.policyId === undefined || identity.allowedRunTypes.length === 0) {
    throw new Error("Resident supervision policy provenance is unavailable.");
  }
  if (policyEvent.type === "agent.policy.installed" &&
    (policyEvent.context.actor.kind !== "human" || policyEvent.context.actor.id !== policyEvent.payload.installedBy)) {
    throw new Error("Resident supervision policy provenance is unavailable.");
  }
  if (policyEvent.type === "agent.identity.updated" && policyEvent.context.actor.kind !== "human") {
    throw new Error("Resident supervision policy provenance is unavailable.");
  }
  if (policyEvent.type === "agent.identity.initialized" &&
    policyEvent.context.actor.id !== policyEvent.payload.initializedBy) {
    throw new Error("Resident supervision policy provenance is unavailable.");
  }
  const policyVersion = policyEvent.type === "agent.policy.installed"
    ? policyEvent.payload.version
    : policyEvent.type === "agent.identity.updated"
      ? `agent-identity-policy-update.v${policyEvent.version}`
      : `agent-identity-policy-initialized.v${policyEvent.version}`;
  const allowedRunTypes = Object.freeze([...identity.allowedRunTypes]);
  const projection = buildAgentProjection(events);
  const activeLocks = [...projection.locks.values()]
    .filter((lock) => lock.state === "active")
    .map((lock) => ({ lockId: lock.lockId, kind: lock.kind }))
    .sort((left, right) => left.lockId.localeCompare(right.lockId));
  return Object.freeze({
    policyVersion,
    policyDigest: hashCanonicalSpecialistHandoffJson({
      schemaVersion: "agent-mounted-resident-policy-snapshot.v1",
      workspaceId,
      residentAgentId: "agent_default",
      policyEventId: policyEvent.id,
      policyEventType: policyEvent.type,
      policyEventSequence: policyEvent.sequence,
      policyId: identity.policyId,
      policyVersion,
      allowedRunTypes,
      eventPayload: policyEvent.payload
    }),
    lockStateDigest: hashCanonicalSpecialistHandoffJson({
      schemaVersion: "agent-mounted-task-active-locks.v1",
      activeLocks
    })
  });
}

async function wakeCommand(
  input: ResidentSupervisionRuntimeInput,
  operation: "pause" | "resume" | "recover",
  commandId: string
): Promise<WakeCommandInput> {
  const events = await input.runtimeHandle.ledger.readAll();
  const causationEvent = events.at(-1);
  if (causationEvent === undefined) {
    throw new Error("Resident supervision command requires durable causation.");
  }
  return Object.freeze({
    schemaVersion: "resident-wake-command.v1",
    commandId,
    sourceEventIds: Object.freeze([causationEvent.id]),
    requestedAt: input.now(),
    causation: Object.freeze({
      causationId: causationEvent.id,
      correlationId: `corr_${commandId}_${operation}`
    })
  });
}

function runningSnapshot(
  input: ResidentSupervisionRuntimeInput,
  durable: DurableSupervisionState,
  status: WakeStatusDto | undefined,
  backgroundActiveCycle = false
): ResidentSupervisionSnapshot {
  return Object.freeze({
    supervisorState: status?.supervisorState ?? "running",
    workspaceState: status?.workspaceState ?? "available",
    ...(input.runtimeHandle.mountedWorkspace === undefined
      ? {}
      : { workspaceId: input.runtimeHandle.mountedWorkspace.workspaceId }),
    ...(durable.nextWakeAt === undefined ? {} : { nextWakeAt: durable.nextWakeAt }),
    activeCycle: backgroundActiveCycle || (status?.activeCycle ?? false),
    provenanceEventIds: durable.provenanceEventIds,
    diagnostics: Object.freeze((status?.diagnostics ?? []).map((diagnostic) => Object.freeze({
      category: diagnostic.category,
      safeMessage: wakeDiagnosticMessage(diagnostic.category),
      allowedRepairActions: Object.freeze([...diagnostic.allowedCommandIds])
    })))
  });
}

function pausedSnapshot(
  input: ResidentSupervisionRuntimeInput,
  durable: DurableSupervisionState,
  status: WakeStatusDto | undefined,
  backgroundActiveCycle = false
): ResidentSupervisionSnapshot {
  return Object.freeze({
    supervisorState: "paused",
    workspaceState: "available",
    ...(input.runtimeHandle.mountedWorkspace === undefined
      ? {}
      : { workspaceId: input.runtimeHandle.mountedWorkspace.workspaceId }),
    activeCycle: backgroundActiveCycle || (status?.activeCycle ?? false),
    provenanceEventIds: durable.provenanceEventIds,
    diagnostics: Object.freeze([])
  });
}

function unavailableSnapshot(
  input: ResidentSupervisionRuntimeInput,
  category: "workspace-unavailable" | "workspace-identity-mismatch"
): ResidentSupervisionSnapshot {
  const identityMismatch = category === "workspace-identity-mismatch";
  return Object.freeze({
    supervisorState: "workspace-unavailable",
    workspaceState: identityMismatch ? "identity-mismatch" : "unavailable",
    ...(input.runtimeHandle.mountedWorkspace === undefined
      ? {}
      : { workspaceId: input.runtimeHandle.mountedWorkspace.workspaceId }),
    activeCycle: false,
    provenanceEventIds: Object.freeze([]),
    diagnostics: Object.freeze([Object.freeze({
      category,
      safeMessage: identityMismatch
        ? "The connected portable workspace identity does not match the admitted workspace."
        : "The portable workspace is unavailable; resident work and writes remain stopped.",
      allowedRepairActions: Object.freeze([
        "reconnect the same portable workspace",
        "refresh agent status"
      ])
    })])
  });
}

function reconnectedSnapshot(
  input: ResidentSupervisionRuntimeInput,
  durable: DurableSupervisionState
): ResidentSupervisionSnapshot {
  return Object.freeze({
    supervisorState: "paused",
    workspaceState: "available",
    ...(input.runtimeHandle.mountedWorkspace === undefined
      ? {}
      : { workspaceId: input.runtimeHandle.mountedWorkspace.workspaceId }),
    activeCycle: false,
    provenanceEventIds: durable.provenanceEventIds,
    diagnostics: Object.freeze([Object.freeze({
      category: "workspace-reconnected",
      safeMessage: "The same portable workspace is available and awaits explicit recovery.",
      allowedRepairActions: Object.freeze(["resume"])
    })])
  });
}

function wakeDiagnosticMessage(category: string): string {
  if (category === "supervisor-lease-held") return "Another admitted local supervisor currently owns the resident wake lease.";
  if (category === "active-lock") return "An active workspace lock blocks resident work.";
  if (category === "workspace-identity-mismatch") return "The portable workspace identity does not match the admitted workspace.";
  if (category === "workspace-unavailable") return "The portable workspace is unavailable.";
  return "Resident supervision requires inspection before more work can start.";
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
  readonly runtimeHandle: LocalRuntimeHandle;
  coreReady: boolean;
  stopped: boolean;
  residentBindingInFlight: boolean;
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
      const residentState = residentWakeRuntimeStates.get(runtime);
      if (residentState === undefined) {
        throw new Error("wake runtime resident authority state is unavailable");
      }
      residentState.stopped = true;
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
    runtimeHandle: input.runtimeHandle,
    coreReady: false,
    stopped: false,
    residentBindingInFlight: false,
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
      state.stopped ||
      state.residentBindingInFlight ||
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
  domainExecution: unknown,
  runtimeHandle: LocalRuntimeHandle
): Promise<MountedResidentLoopCapabilities> {
  const state = residentWakeRuntimeStates.get(wakeRuntime);
  if (
    state === undefined ||
    state.factoryBinding === undefined ||
    binding !== state.factoryBinding.readback ||
    state.runtimeHandle !== runtimeHandle ||
    !state.coreReady ||
    state.stopped ||
    state.residentBindingInFlight ||
    state.residentBound
  ) {
    throw new Error("wake runtime resident capability binding requires exact unconsumed Core authority");
  }
  const registered = state.factoryBinding;
  state.residentBindingInFlight = true;
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
  let issued: MountedResidentLoopCapabilities;
  try {
    issued = await bindMountedResidentLoopAuthorityForFactory(
      state.store,
      binding,
      domainExecution
    );
  } catch (error) {
    state.residentBindingInFlight = false;
    throw error;
  }
  state.residentBound = true;
  state.residentBindingInFlight = false;
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
