import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  buildAgentProjection,
  buildSpecialistHandoffProjection,
  buildSelectionManifestHash,
  createAgentToolGateway,
  createContextPackRegistry,
  contextPackRefSchema,
  hashAgentToolPreview,
  hashCanonicalSpecialistHandoffJson,
  investigativeRegistrationIdentity,
  investigativeContextPackDescriptors,
  investigativeContextPackPayloadParsers,
  operationalContextPackDescriptors,
  operationalContextPackPayloadParsers,
  parsePromptArtifactEnvelope,
  productionSpecialistPromptRegistrationFor,
  providerParseExecuteDescriptor,
  recoverAuthorityBoundSpecialistHandoffTerminalSuffix,
  registerInvestigativeContextPacks,
  registerOperationalContextPackBuilders,
  renderProductionSpecialistPrompt,
  runEvidenceTriageWorkflow,
  serializePromptArtifactEnvelope,
  serializeContextPackPayload,
  parseAuthorityBoundSpecialistHandoffManifest,
  verifyAuthorityBoundSpecialistHandoffManifest,
  type AgentToolPreview,
  type AgentContextPackJsonValue,
  type AcceptedGraphAssertionRow,
  type ContextPackRef,
  type GovernanceRestrictionRow,
  type InvestigativeContextPackDependencies,
  type InvestigativeEvidenceRow,
  type InvestigativeSelectionManifest,
  type InvestigativeSelectionManifestBody,
  type OperationalContextPackProvider,
  type ProviderSetupCard,
  type SpecialistHandoffReadback,
  type AuthorityBoundSpecialistHandoffManifest,
  type SpecialistHandoffManifestStore,
  type VerifiedResolvedContextPack
} from "../../agent/src/index.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { buildGovernanceProjection } from "../../ontology/src/governance-projection.js";
import { defaultGovernancePolicy } from "../../ontology/src/governance-policy.js";
import { buildGraphProjection } from "../../ontology/src/graph-projection.js";
import type {
  ActorRef,
  AppendableKnowledgeEvent,
  KnowledgeEvent,
  KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import type { AppendOptions, EventLedger } from "../../ontology/src/event-ledger.js";
import { hasPrecommitGuardedAppend } from "../../ontology/src/sqlite-event-ledger.js";
import { mountPortableWorkspace, type MountedPortableWorkspace } from "../../workspace/src/index.js";
import { createMountedPromptArtifactStore } from "./mounted-prompt-artifact-store.js";
import {
  assertMountedResidentTaskRuntimeBinding,
  bindMountedEvidenceTriageHandoffForLocalAgentRuntimeFactory,
  mountedResidentTaskLocalAgentRuntimeFactory,
  type LocalAgentRuntimeFactory,
  type LocalAgentRuntimeFactoryInput
} from "./agent-runtime-factory.js";
import {
  createWakeSupervisorRuntime,
  inspectPortableWorkspaceCurrentness,
  type MountedEvidenceTriageHandoffAcquirer,
  type ResidentAdmittedLocalTask,
  type ResidentBackgroundExecutionPort,
  type WakeSupervisorRuntime
} from "./wake-supervisor-runtime.js";
import {
  consumeMountedHandoffAuthorityController,
  type FactoryPortableMountedAgentHandoffProducerResultV1
} from "./portable-mounted-agent-artifact-stores.js";

const mountedTaskSchemaVersion = "agent-mounted-task-result.v1" as const;
const mountedTaskAdmissionSchemaVersion = "agent-mounted-task-admission.v1" as const;
const mountedTaskExecutionInputSchemaVersion = "agent-mounted-task-execution-input.v1" as const;
const mountedTaskAdmissionManifestPathSegments = Object.freeze([
  "agent-mounted-task-admission",
  "input"
] as const);
const residentAgentId = "agent_default" as const;
const fakeProviderId = "provider_fake_local" as const;
const fakeModelFamily = "fake-local" as const;
const remoteProviderId = "provider_remote_gated" as const;
const remoteModelFamily = "remote-model" as const;

type LocalAgentRuntime = ReturnType<LocalAgentRuntimeFactory>;
type LocalRuntimeHandle = LocalAgentRuntimeFactoryInput["handle"];
type ContentHash = `sha256:${string}`;

const mountedTaskAdmissionEventIdSchema = z.string().regex(/^evt_[a-zA-Z0-9_-]+$/);
const mountedTaskAdmissionHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const mountedTaskAdmissionEvidenceBindingSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  evidenceEventId: mountedTaskAdmissionEventIdSchema,
  linkEventId: mountedTaskAdmissionEventIdSchema,
  contentHash: mountedTaskAdmissionHashSchema,
  mediaType: z.string().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  sourceCollectionId: z.string().regex(/^src_[a-zA-Z0-9_-]+$/),
  importBatchId: z.string().regex(/^imp_[a-zA-Z0-9_-]+$/),
  occurrenceIds: z.array(z.string().regex(/^occ_[a-zA-Z0-9_-]+$/)).min(1)
}).strict();
const mountedTaskExecutionInputManifestSchema = z.object({
  schemaVersion: z.literal(mountedTaskExecutionInputSchemaVersion),
  workspaceId: z.string().regex(/^ws_[a-zA-Z0-9_-]+$/),
  workspaceManifestHash: mountedTaskAdmissionHashSchema,
  residentAgentId: z.literal(residentAgentId),
  taskId: z.string().regex(/^task_[a-zA-Z0-9_-]+$/),
  runId: z.string().regex(/^run_[a-zA-Z0-9_-]+$/),
  runType: z.literal("evidence-triage"),
  providerMode: z.enum(["local-fake", "remote-gated"]),
  evidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)).min(1),
  evidenceBindings: z.array(mountedTaskAdmissionEvidenceBindingSchema).min(1),
  sourceEventIds: z.array(mountedTaskAdmissionEventIdSchema).min(2),
  policyEventId: mountedTaskAdmissionEventIdSchema,
  policyId: z.string().regex(/^agent_policy_[a-zA-Z0-9_-]+$/),
  policyVersion: z.string().min(1),
  policyHash: mountedTaskAdmissionHashSchema,
  activeLocksHash: mountedTaskAdmissionHashSchema
}).strict().superRefine((value, ctx) => {
  const bindingEvidenceIds = value.evidenceBindings.map((binding) => binding.evidenceId);
  if (new Set(value.evidenceIds).size !== value.evidenceIds.length ||
    !sameOrderedStrings(value.evidenceIds, bindingEvidenceIds)) {
    ctx.addIssue({
      code: "custom",
      path: ["evidenceIds"],
      message: "evidence ids must uniquely and exactly follow the evidence bindings"
    });
  }
  const expectedSources = value.evidenceBindings.flatMap((binding) => [
    binding.evidenceEventId,
    binding.linkEventId
  ]);
  if (new Set(value.sourceEventIds).size !== value.sourceEventIds.length ||
    !sameOrderedStrings(value.sourceEventIds, expectedSources)) {
    ctx.addIssue({
      code: "custom",
      path: ["sourceEventIds"],
      message: "source event ids must uniquely and exactly follow the evidence bindings"
    });
  }
});

type ParsedMountedTaskExecutionInputManifest = z.infer<typeof mountedTaskExecutionInputManifestSchema>;

interface MountedTaskExecutionInputEvidenceBinding {
  readonly evidenceId: string;
  readonly evidenceEventId: string;
  readonly linkEventId: string;
  readonly contentHash: string;
  readonly mediaType?: string | undefined;
  readonly sizeBytes?: number | undefined;
  readonly sourceCollectionId: string;
  readonly importBatchId: string;
  readonly occurrenceIds: readonly string[];
}

interface MountedTaskExecutionInputManifest {
  readonly schemaVersion: typeof mountedTaskExecutionInputSchemaVersion;
  readonly workspaceId: string;
  readonly workspaceManifestHash: string;
  readonly residentAgentId: typeof residentAgentId;
  readonly taskId: string;
  readonly runId: string;
  readonly runType: "evidence-triage";
  readonly providerMode: MountedEvidenceTriageProviderMode;
  readonly evidenceIds: readonly string[];
  readonly evidenceBindings: readonly MountedTaskExecutionInputEvidenceBinding[];
  readonly sourceEventIds: readonly string[];
  readonly policyEventId: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly policyHash: string;
  readonly activeLocksHash: string;
}

export type MountedEvidenceTriageProviderMode = "local-fake" | "remote-gated";

export interface RunMountedEvidenceTriageTaskInput {
  readonly handle: LocalRuntimeHandle;
  readonly runtime: LocalAgentRuntime;
  readonly now: () => string;
  readonly taskId: string;
  readonly runId: string;
  readonly evidenceIds: readonly string[];
  readonly providerMode: MountedEvidenceTriageProviderMode;
  /** Service-owned one-shot capability; never accepted from an HTTP payload. */
  readonly acquireHandoffAuthority?: MountedEvidenceTriageHandoffAcquirer | undefined;
  /** Deterministic post-terminal crash seam for recovery tests. */
  readonly beforeCompletionMemoryForTest?: (() => void | Promise<void>) | undefined;
  /** Deterministic local effect-boundary seam for cancellation tests. */
  readonly beforeLocalEffectForTest?: (() => void | Promise<void>) | undefined;
  /** Deterministic seam immediately before the inner run-start snapshot. */
  readonly beforeRunStartSnapshotForTest?: (() => void | Promise<void>) | undefined;
  /** Deterministic seam after run-start commit and before task-running validation. */
  readonly beforeTaskRunningForTest?: (() => void | Promise<void>) | undefined;
}

export interface AdmitMountedEvidenceTriageTaskInput
  extends RunMountedEvidenceTriageTaskInput {
  /** Deterministic crash/currentness seam for admission-boundary tests. */
  readonly beforeAdmissionPrecommitForTest?: (() => void) | undefined;
}

export interface AgentMountedTaskAdmissionDto {
  readonly schemaVersion: typeof mountedTaskAdmissionSchemaVersion;
  readonly state: "admitted";
  readonly admissionId: string;
  readonly residentAgentId: typeof residentAgentId;
  readonly taskId: string;
  readonly runId: string;
  readonly providerMode: MountedEvidenceTriageProviderMode;
  readonly sourceEventIds: readonly string[];
}

export interface MountedTaskBackgroundExecutionObservation {
  readonly taskId: string;
  readonly runId: string;
  readonly outcome: "completed" | "failed";
}

export function createMountedEvidenceTriageBackgroundExecutionPort(input: {
  readonly handle: LocalRuntimeHandle;
  readonly now: () => string;
  readonly beforeCompletionMemoryForTest?: (() => void | Promise<void>) | undefined;
  readonly beforeLocalEffectForTest?: (() => void | Promise<void>) | undefined;
  readonly beforeRunStartSnapshotForTest?: (() => void | Promise<void>) | undefined;
  readonly beforeTaskRunningForTest?: (() => void | Promise<void>) | undefined;
  readonly afterExecutionSettledForTest?: (
    observation: MountedTaskBackgroundExecutionObservation
  ) => void | undefined;
  readonly afterPendingScanForTest?: (
    tasks: readonly ResidentAdmittedLocalTask[]
  ) => void | undefined;
}): ResidentBackgroundExecutionPort {
  return Object.freeze({
    async pendingLocalTasks(): Promise<readonly ResidentAdmittedLocalTask[]> {
      const events = await input.handle.ledger.readAll();
      const projection = buildAgentProjection(events);
      const grouped = new Map<string, MountedTaskAdmissionEvent[]>();
      for (const event of events) {
        if (event.type !== "agent.mounted-task.execution.admitted.v1") continue;
        const key = `${event.payload.taskId}\u0000${event.payload.runId}`;
        const group = grouped.get(key) ?? [];
        group.push(event);
        grouped.set(key, group);
      }
      const pending: ResidentAdmittedLocalTask[] = [];
      for (const admissions of grouped.values()) {
        if (admissions.length !== 1) continue;
        const admission = admissions[0]!;
        if (admission.payload.providerMode !== "local-fake") continue;
        const task = projection.tasks.get(admission.payload.taskId);
        const run = projection.runs.get(admission.payload.runId);
        if (task === undefined || task.residentAgentId !== residentAgentId ||
          task.status === "canceled" || task.status === "failed" || run?.state === "failed") continue;
        if (task.status === "completed" || run?.state === "completed") {
          const memoryId = `mem_${admission.payload.runId}_handoff`;
          const memoryEvents = events.filter((event) =>
            event.type === "agent.memory.recorded" && event.payload.memoryId === memoryId
          );
          const completedTogether = task.status === "completed" && run?.state === "completed";
          const recoverableTerminalPrefix = task.status === "running" && run?.state === "completed";
          if ((!completedTogether && !recoverableTerminalPrefix) || memoryEvents.length !== 0) continue;
        }
        const validationRuntime = mountedResidentTaskLocalAgentRuntimeFactory({
          handle: input.handle,
          actor: residentActor,
          now: input.now
        });
        const authority = await captureMountedTaskAuthority(input.handle, validationRuntime);
        try {
          await assertCurrentAdmissionBinding({
            handle: input.handle,
            events,
            authority,
            taskId: admission.payload.taskId,
            runId: admission.payload.runId,
            providerMode: "local-fake"
          });
        } catch {
          await recordStaleMountedTaskAdmissionDiagnostic({
            handle: input.handle,
            authority,
            admission,
            now: input.now
          });
          continue;
        }
        pending.push(Object.freeze({ taskId: admission.payload.taskId, runId: admission.payload.runId }));
      }
      const result = Object.freeze(pending);
      input.afterPendingScanForTest?.(result);
      return result;
    },
    async execute(
      task: ResidentAdmittedLocalTask,
      acquireHandoff: MountedEvidenceTriageHandoffAcquirer
    ): Promise<void> {
      let outcome: MountedTaskBackgroundExecutionObservation["outcome"] = "failed";
      try {
        const admissions = admissionEventsFor(await input.handle.ledger.readAll(), task.taskId, task.runId);
        if (admissions.length !== 1 || admissions[0]!.payload.providerMode !== "local-fake") {
          throw mountedConflict("Background execution requires one exact durable local-fake admission.");
        }
        const admission = admissions[0]!;
        const runtime = mountedResidentTaskLocalAgentRuntimeFactory({
          handle: input.handle,
          actor: residentActor,
          now: input.now
        });
        const authority = await captureMountedTaskAuthority(input.handle, runtime);
        const validated = await assertCurrentAdmissionBinding({
          handle: input.handle,
          events: await input.handle.ledger.readAll(),
          authority,
          taskId: admission.payload.taskId,
          runId: admission.payload.runId,
          providerMode: "local-fake"
        });
        await runMountedEvidenceTriageTask({
          handle: input.handle,
          runtime,
          now: input.now,
          taskId: admission.payload.taskId,
          runId: admission.payload.runId,
          evidenceIds: validated.evidence.map((binding) => binding.evidenceId),
          providerMode: "local-fake",
          acquireHandoffAuthority: acquireHandoff,
          ...(input.beforeCompletionMemoryForTest === undefined
            ? {}
            : { beforeCompletionMemoryForTest: input.beforeCompletionMemoryForTest }),
          ...(input.beforeLocalEffectForTest === undefined
            ? {}
            : { beforeLocalEffectForTest: input.beforeLocalEffectForTest }),
          ...(input.beforeRunStartSnapshotForTest === undefined
            ? {}
            : { beforeRunStartSnapshotForTest: input.beforeRunStartSnapshotForTest }),
          ...(input.beforeTaskRunningForTest === undefined
            ? {}
            : { beforeTaskRunningForTest: input.beforeTaskRunningForTest })
        });
        outcome = "completed";
      } finally {
        input.afterExecutionSettledForTest?.(Object.freeze({
          taskId: task.taskId,
          runId: task.runId,
          outcome
        }));
      }
    }
  });
}

async function recordStaleMountedTaskAdmissionDiagnostic(input: {
  readonly handle: LocalRuntimeHandle;
  readonly authority: MountedTaskAuthority;
  readonly admission: MountedTaskAdmissionEvent;
  readonly now: () => string;
}): Promise<void> {
  const digest = createHash("sha256").update(input.admission.id).digest("hex").slice(0, 32);
  const diagnosticId = `diag_mounted_admission_${digest}`;
  const streamId = `diagnostic_${diagnosticId}`;
  const payload = Object.freeze({
    diagnosticId,
    severity: "error" as const,
    category: "validation" as const,
    message: "Mounted local task admission is stale and was skipped.",
    repairHint: Object.freeze({
      contract: "agent.mounted-task.execution.admitted.v1",
      violatedPath: "payload.admissionManifestHash",
      allowedActions: Object.freeze([
        "review the stale admission",
        "create a new task and admission"
      ])
    })
  });
  const exactExisting = (events: readonly KnowledgeEvent[]) => events.filter((event) =>
    event.type === "diagnostic.recorded" &&
    event.streamId === streamId &&
    event.context.causationId === input.admission.id &&
    event.payload.diagnosticId === diagnosticId &&
    event.payload.severity === payload.severity &&
    event.payload.category === payload.category &&
    event.payload.message === payload.message &&
    event.payload.repairHint.contract === payload.repairHint.contract &&
    event.payload.repairHint.violatedPath === payload.repairHint.violatedPath &&
    sameOrderedStrings(event.payload.repairHint.allowedActions, payload.repairHint.allowedActions)
  );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await input.authority.revalidate();
    const events = await input.handle.ledger.readAll();
    const stream = events.filter((event) => event.streamId === streamId);
    const exact = exactExisting(stream);
    if (stream.length !== 0) {
      if (stream.length === 1 && exact.length === 1) return;
      throw mountedConflict("Mounted stale-admission diagnostic provenance is ambiguous.");
    }
    if (!hasPrecommitGuardedAppend(input.handle.ledger)) {
      throw mountedConflict("Mounted stale-admission diagnostic write boundary is unavailable.");
    }
    const event: AppendableKnowledgeEvent<"diagnostic.recorded"> = {
      type: "diagnostic.recorded",
      version: 1,
      streamId,
      context: agentEventContext(input.now, `corr_${diagnosticId}`, input.admission.id),
      payload: {
        ...payload,
        repairHint: {
          ...payload.repairHint,
          allowedActions: [...payload.repairHint.allowedActions]
        }
      }
    };
    try {
      await input.handle.ledger.appendWithPrecommitGuard(event, {
        expectedGlobalEventCount: events.length,
        expectedNextSequence: 1
      }, () => {
        const currentness = inspectPortableWorkspaceCurrentness(input.handle);
        if (!currentness.ok) throw new Error(currentness.category ?? "workspace-unavailable");
      });
      await input.authority.revalidate();
      return;
    } catch {
      const reread = await input.handle.ledger.readAll();
      const rereadStream = reread.filter((candidate) => candidate.streamId === streamId);
      if (rereadStream.length === 1 && exactExisting(rereadStream).length === 1) return;
      if (attempt === 1) {
        throw mountedConflict("Mounted stale-admission diagnostic could not be recorded safely.");
      }
    }
  }
}

export interface ReconstructMountedEvidenceTriageTaskInput {
  readonly handle: LocalRuntimeHandle;
  readonly runtime: LocalAgentRuntime;
  readonly taskId: string;
  readonly runId: string;
  /** Internal recovery mode; HTTP readback never enables this. */
  readonly allowMissingMemoryForRecovery?: boolean | undefined;
}

export interface AgentMountedTaskContextBindingDto {
  readonly contextPackId: string;
  readonly contentHash: ContentHash;
  readonly sourceEventIds: readonly string[];
}

export interface AgentMountedTaskResultDto {
  readonly schemaVersion: typeof mountedTaskSchemaVersion;
  readonly state: "completed" | "waiting-for-approval";
  readonly residentAgentId: typeof residentAgentId;
  readonly taskId: string;
  readonly runId: string;
  readonly contextBindings: readonly AgentMountedTaskContextBindingDto[];
  readonly promptArtifactHash: ContentHash;
  readonly handoff?: {
    readonly status: "ready-for-review";
    readonly manifestHash: ContentHash;
    readonly outputArtifactHashes: readonly ContentHash[];
    readonly sourceEventIds: readonly string[];
    readonly policyHash: ContentHash;
  };
  readonly memoryId?: string;
  readonly approval?: {
    readonly toolRequestId: string;
    readonly requiredApprovalClass: "provider-byte-transfer";
    readonly previewHash: ContentHash;
  };
}

export class MountedResidentTaskError extends Error {
  readonly status: 400 | 404 | 409 | 503;
  readonly safeMessage: string;
  readonly allowedRepairActions: readonly string[];

  constructor(
    status: 400 | 404 | 409 | 503,
    safeMessage: string,
    allowedRepairActions: readonly string[]
  ) {
    super("mounted-resident-task-failed");
    this.name = "MountedResidentTaskError";
    this.status = status;
    this.safeMessage = safeMessage;
    this.allowedRepairActions = Object.freeze([...allowedRepairActions]);
  }
}

type MountedTaskAdmissionEvent = KnowledgeEventOf<"agent.mounted-task.execution.admitted.v1">;

export async function admitMountedEvidenceTriageTask(
  input: AdmitMountedEvidenceTriageTaskInput
): Promise<AgentMountedTaskAdmissionDto> {
  assertMountedResidentTaskRuntimeBinding({ handle: input.handle, runtime: input.runtime });
  const authority = await captureMountedTaskAuthority(input.handle, input.runtime);
  await authority.revalidate();
  const events = await input.handle.ledger.readAll();
  const projection = buildAgentProjection(events);
  if (projection.identity?.residentAgentId !== residentAgentId ||
    projection.identity.workspaceId !== authority.workspaceId) {
    throw mountedConflict("Resident identity does not match the mounted workspace.");
  }
  const task = projection.tasks.get(input.taskId);
  if (task === undefined || task.residentAgentId !== residentAgentId) {
    throw new MountedResidentTaskError(404, "Mounted resident task was not found.", [
      "create the task under the mounted resident agent before admitting it"
    ]);
  }
  const evidence = exactEvidenceBindings(events, input.evidenceIds);
  const manifest = buildMountedTaskExecutionInputManifest({
    authority,
    taskId: input.taskId,
    runId: input.runId,
    providerMode: input.providerMode,
    evidence
  });
  const manifestBytes = serializeMountedTaskExecutionInputManifest(manifest);
  const admissionManifestHash = hashBytes(manifestBytes);
  const admissionId = `admission_${admissionManifestHash.slice("sha256:".length)}`;
  const existing = admissionEventsFor(events, input.taskId, input.runId);
  if (existing.length !== 0) {
    const exact = existing.find((event) => admissionMatches(event, manifest, admissionManifestHash));
    if (exact === undefined || existing.length !== 1) {
      throw mountedConflict("Mounted task execution admission conflicts with its durable binding.");
    }
    const stored = await readMountedTaskExecutionInputManifest(input.handle, exact);
    assertMountedTaskExecutionInputManifestEquality(stored, manifest, admissionManifestHash);
    await authority.revalidate();
    return admissionDto(exact);
  }
  const priorTaskRuns = [...projection.runs.values()].filter((run) => run.taskId === input.taskId);
  const priorTaskAttempts = [...projection.taskOrchestrator.attempts.values()]
    .filter((attempt) => attempt.taskId === input.taskId);
  if (task.status !== "queued" || priorTaskRuns.length !== 0 || priorTaskAttempts.length !== 0) {
    throw mountedConflict("Mounted resident task is not untouched and eligible for execution admission.");
  }
  await verifyMountedEvidenceSourceBytes(authority, evidence);
  await authority.revalidate();
  if (!hasPrecommitGuardedAppend(input.handle.ledger)) {
    throw new MountedResidentTaskError(503,
      "Mounted task admission requires the current portable workspace write boundary.",
      ["restart the local runtime", "inspect workspace diagnostics"]);
  }
  const storedManifest = await storeMountedTaskExecutionInputManifest({
    handle: input.handle,
    authority,
    manifest,
    bytes: manifestBytes,
    expectedHash: admissionManifestHash
  });
  assertMountedTaskExecutionInputManifestEquality(storedManifest, manifest, admissionManifestHash);
  const streamId = mountedTaskAdmissionStreamId(input.taskId, input.runId);
  const stream = await input.handle.ledger.readStream(streamId);
  const taskCausation = events.findLast((event) =>
    (event.type === "agent.task.created" || event.type === "agent.task.status.changed") &&
    event.payload.taskId === input.taskId
  );
  if (taskCausation === undefined) {
    throw mountedConflict("Mounted task creation provenance is unavailable.");
  }
  const admittedAt = input.now();
  const event: AppendableKnowledgeEvent<"agent.mounted-task.execution.admitted.v1"> = {
    type: "agent.mounted-task.execution.admitted.v1",
    version: 1,
    streamId,
    context: agentEventContext(() => admittedAt, `corr_${admissionId}`, taskCausation.id),
    payload: {
      admissionId,
      admissionManifestHash,
      workspaceId: manifest.workspaceId,
      workspaceManifestHash: manifest.workspaceManifestHash,
      residentAgentId: manifest.residentAgentId,
      taskId: manifest.taskId,
      runId: manifest.runId,
      runType: manifest.runType,
      providerMode: manifest.providerMode,
      sourceEventIds: [...manifest.sourceEventIds],
      policyEventId: manifest.policyEventId,
      policyId: manifest.policyId,
      policyVersion: manifest.policyVersion,
      policyHash: manifest.policyHash,
      activeLocksHash: manifest.activeLocksHash,
      admittedBy: residentAgentId,
      admittedAt
    }
  };
  let appended: KnowledgeEvent;
  try {
    appended = await input.handle.ledger.appendWithPrecommitGuard(event, {
      expectedGlobalEventCount: events.length,
      expectedNextSequence: stream.length + 1
    }, () => {
      input.beforeAdmissionPrecommitForTest?.();
      const currentness = inspectPortableWorkspaceCurrentness(input.handle);
      if (!currentness.ok) {
        throw new Error(currentness.category ?? "workspace-unavailable");
      }
    });
  } catch {
    const reread = admissionEventsFor(await input.handle.ledger.readAll(), input.taskId, input.runId);
    const exact = reread.find((candidate) => admissionMatches(
      candidate,
      manifest,
      admissionManifestHash
    ));
    if (exact !== undefined && reread.length === 1) {
      const stored = await readMountedTaskExecutionInputManifest(input.handle, exact);
      assertMountedTaskExecutionInputManifestEquality(stored, manifest, admissionManifestHash);
      return admissionDto(exact);
    }
    const currentness = inspectPortableWorkspaceCurrentness(input.handle);
    if (!currentness.ok) {
      throw mountedConflict("The portable workspace changed before execution admission committed.");
    }
    throw mountedConflict("Mounted task execution admission lost currentness before commit.");
  }
  if (appended.type !== "agent.mounted-task.execution.admitted.v1") {
    throw mountedConflict("Mounted task execution admission readback was invalid.");
  }
  await authority.revalidate();
  const readback = admissionEventsFor(await input.handle.ledger.readAll(), input.taskId, input.runId);
  const exact = readback.find((candidate) => candidate.id === appended.id &&
    admissionMatches(candidate, manifest, admissionManifestHash));
  if (exact === undefined || readback.length !== 1) {
    throw mountedConflict("Mounted task execution admission did not read back exactly.");
  }
  const readbackManifest = await readMountedTaskExecutionInputManifest(input.handle, exact);
  assertMountedTaskExecutionInputManifestEquality(readbackManifest, manifest, admissionManifestHash);
  return admissionDto(exact);
}

interface EvidenceBinding {
  readonly evidenceId: string;
  readonly evidenceEventId: string;
  readonly linkEventId: string;
  readonly contentHash: ContentHash;
  readonly mediaType?: string;
  readonly sizeBytes?: number;
  readonly sourceCollectionId: string;
  readonly importBatchId: string;
  readonly occurrenceIds: readonly string[];
}

interface MountedTaskAuthority {
  readonly workspaceId: string;
  readonly workspaceManifestHash: ContentHash;
  readonly policyEventId: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly policyHash: ContentHash;
  readonly allowedRunTypes: readonly string[];
  readonly activeLocksHash: ContentHash;
  revalidate(): Promise<void>;
  readWorkspaceManifestArtifact(): Promise<Buffer>;
  readSourceArtifact(contentHash: ContentHash): Promise<Buffer>;
  handoffStores(input?: {
    readonly materialStore?: SpecialistHandoffManifestStore;
    readonly manifestStore?: SpecialistHandoffManifestStore;
    readonly sourceArtifactHashes?: readonly ContentHash[];
  }): Promise<{
    readonly material: SpecialistHandoffManifestStore;
    readonly manifest: SpecialistHandoffManifestStore;
    readonly reader: SpecialistHandoffManifestStore;
  }>;
  withHandoffReadSnapshot<T>(
    input: { readonly sourceArtifactHashes?: readonly ContentHash[] },
    read: (reader: SpecialistHandoffManifestStore) => Promise<T>
  ): Promise<T>;
}

interface MountedResidentPolicySnapshot {
  readonly eventId: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly policyHash: ContentHash;
  readonly allowedRunTypes: readonly string[];
}

interface MountedTaskHandoffAuthority {
  readonly binding: FactoryPortableMountedAgentHandoffProducerResultV1["binding"];
  consume(eventIds: readonly string[]): Promise<void>;
  stop(): Promise<void>;
}

export async function runMountedEvidenceTriageTask(
  input: RunMountedEvidenceTriageTaskInput
): Promise<AgentMountedTaskResultDto> {
  assertMountedResidentTaskRuntimeBinding({ handle: input.handle, runtime: input.runtime });
  let operationTimestamp = input.now();
  const operationNow = () => operationTimestamp;
  const authority = await captureMountedTaskAuthority(input.handle, input.runtime);
  await authority.revalidate();
  const eventsBeforeRun = await input.handle.ledger.readAll();
  const projectionBeforeRun = buildAgentProjection(eventsBeforeRun);
  const task = projectionBeforeRun.tasks.get(input.taskId);
  if (projectionBeforeRun.identity?.residentAgentId !== residentAgentId ||
    projectionBeforeRun.identity.workspaceId !== authority.workspaceId) {
    throw mountedConflict("Resident identity does not match the mounted workspace.");
  }
  if (task === undefined || task.residentAgentId !== residentAgentId) {
    throw new MountedResidentTaskError(404, "Mounted resident task was not found.", [
      "create the task under the mounted resident agent before running it"
    ]);
  }
  const evidence = exactEvidenceBindings(eventsBeforeRun, input.evidenceIds);
  if (input.acquireHandoffAuthority !== undefined) {
    await assertCurrentAdmissionBinding({
      handle: input.handle,
      events: eventsBeforeRun,
      authority,
      evidence,
      taskId: input.taskId,
      runId: input.runId,
      providerMode: input.providerMode
    });
  }
  const existingRun = projectionBeforeRun.runs.get(input.runId);
  let resumeLocalRun = false;
  if (existingRun !== undefined) {
    if (existingRun.taskId === input.taskId && existingRun.state === "completed" &&
      input.providerMode === "local-fake" &&
      sameOrderedStrings(existingRun.sourceEventIds, sourceEventIdsFor(evidence))) {
      if (task.status === "completed") {
        return await ensureMountedCompletionMemory(input);
      }
      if (task.status === "running" && task.runId === input.runId) {
        const startedEvent = eventsBeforeRun.find((event) =>
          event.type === "agent.specialist-run.started" && event.payload.runId === input.runId
        );
        if (startedEvent === undefined) {
          throw mountedConflict("Mounted resident terminal recovery start provenance is unavailable.");
        }
        operationTimestamp = startedEvent.context.occurredAt;
        const recoveryHandoffAuthority = await acquireMountedTaskHandoffAuthority({
          handle: input.handle,
          authority,
          taskId: input.taskId,
          runId: input.runId,
          now: operationNow,
          ...(input.acquireHandoffAuthority === undefined
            ? {}
            : { acquireHandoffAuthority: input.acquireHandoffAuthority })
        });
        try {
          const stores = await authority.handoffStores({
            materialStore: recoveryHandoffAuthority.binding.materialStore,
            manifestStore: recoveryHandoffAuthority.binding.manifestStore
          });
          const recovered = await recoverAuthorityBoundSpecialistHandoffTerminalSuffix({
            ledger: revalidatingMountedLedger(input.handle, authority, {
              taskId: input.taskId,
              runId: input.runId,
              allowedTaskStatuses: ["running"],
              allowedRunStates: ["completed"]
            }),
            manifestStore: stores.manifest,
            actor: residentActor,
            taskId: input.taskId,
            runId: input.runId,
            handoffAuthorityWitness: recoveryHandoffAuthority.binding.authorityWitness
          });
          await consumeMountedTaskHandoffAuthority({
            handle: input.handle,
            authority: recoveryHandoffAuthority,
            taskId: input.taskId,
            runId: input.runId,
            readback: recovered.readback
          });
        } catch {
          throw mountedConflict("Mounted resident terminal recovery prefix is missing, ambiguous, or inconsistent.");
        } finally {
          await recoveryHandoffAuthority.stop().catch(() => undefined);
        }
        return await ensureMountedCompletionMemory(input);
      }
    }
    if (existingRun.taskId === input.taskId && existingRun.state === "running" &&
      task.status === "waiting-for-approval" && input.providerMode === "remote-gated" &&
      sameOrderedStrings(existingRun.sourceEventIds, sourceEventIdsFor(evidence))) {
      return await reconstructMountedWaitingEvidenceTriageTask({
        handle: input.handle,
        runtime: input.runtime,
        taskId: input.taskId,
        runId: input.runId
      });
    }
    if (existingRun.taskId === input.taskId && existingRun.state === "running" &&
      input.providerMode === "local-fake" &&
      (task.status === "queued" || task.status === "running") &&
      sameOrderedStrings(existingRun.sourceEventIds, sourceEventIdsFor(evidence))) {
      const startedEvent = eventsBeforeRun.find((event) =>
        event.type === "agent.specialist-run.started" && event.payload.runId === input.runId
      );
      if (startedEvent === undefined) {
        throw mountedConflict("Mounted resident run start provenance is unavailable.");
      }
      operationTimestamp = startedEvent.context.occurredAt;
      resumeLocalRun = true;
    } else {
      throw mountedConflict("Mounted resident run already exists and is not exactly replayable.");
    }
  }
  const priorTaskRuns = [...projectionBeforeRun.runs.values()].filter((run) => run.taskId === input.taskId);
  const priorTaskAttempts = [...projectionBeforeRun.taskOrchestrator.attempts.values()]
    .filter((attempt) => attempt.taskId === input.taskId);
  if (!resumeLocalRun &&
    (task.status !== "queued" || priorTaskRuns.length !== 0 || priorTaskAttempts.length !== 0)) {
    throw mountedConflict("Mounted resident task is not an untouched queued evidence-triage task.");
  }
  await verifyMountedEvidenceSourceBytes(authority, evidence);
  const handoffAuthority = input.providerMode === "local-fake"
    ? await acquireMountedTaskHandoffAuthority({
        handle: input.handle,
        authority,
        taskId: input.taskId,
        runId: input.runId,
        now: operationNow,
        ...(input.acquireHandoffAuthority === undefined
          ? {}
          : { acquireHandoffAuthority: input.acquireHandoffAuthority })
      })
    : undefined;
  try {
    await authority.revalidate();
    if (resumeLocalRun) {
      await ensureResumedMountedTaskRunning({
        handle: input.handle,
        now: operationNow,
        taskId: input.taskId,
        runId: input.runId,
        authority
      });
    } else {
      await startMountedEvidenceTriageRun({
        handle: input.handle,
        now: operationNow,
        taskId: input.taskId,
        runId: input.runId,
        authority,
        evidence,
        ...(input.beforeRunStartSnapshotForTest === undefined
          ? {}
          : { beforeRunStartSnapshotForTest: input.beforeRunStartSnapshotForTest }),
        ...(input.beforeTaskRunningForTest === undefined
          ? {}
          : { beforeTaskRunningForTest: input.beforeTaskRunningForTest })
      });
    }

    const allContextEvents = Object.freeze(await input.handle.ledger.readAll());
    const contextEvents = resumeLocalRun
      ? mountedRunInitialContextEvents(allContextEvents, input.taskId, input.runId)
      : allContextEvents;
    const contextRegistry = createMountedEvidenceTriageContextRegistry({
      authority,
      taskId: input.taskId,
      evidence,
      events: contextEvents,
      now: operationNow
    });
    const scope = Object.freeze({ kind: "task", refs: Object.freeze([input.taskId]) });
    await authority.revalidate();
    const contextPacks = await resolveEvidenceTriageContextPacks(contextRegistry);
    const promptArtifact = renderProductionSpecialistPrompt({
      runType: "evidence-triage",
      runId: input.runId,
      taskId: input.taskId,
      generatedAt: operationTimestamp,
      scope,
      resolvedContextPacks: contextPacks
    });
    await authority.revalidate();
    await input.beforeLocalEffectForTest?.();
    await assertMountedTaskEffectAllowed(input.handle, input.taskId, input.runId, ["running"]);
    const promptStore = await createMountedPromptArtifactStore({ handle: input.handle });
    await promptStore.put(promptArtifact);
    await assertMountedTaskEffectAllowed(input.handle, input.taskId, input.runId, ["running"]);
    await authority.revalidate();
    const promptReadback = await promptStore.read({
      inputArtifactHash: promptArtifact.manifest.inputArtifactHash as ContentHash,
      authoritativeResolvedContextPacks: contextPacks
    });
    if (promptReadback.witness === undefined || promptReadback.envelope.manifest.inputArtifactHash !== promptArtifact.manifest.inputArtifactHash) {
      throw mountedConflict("Mounted prompt readback did not match the exact resident run context.");
    }
    await authority.revalidate();

    const providerParsePreview = evidenceTriageProviderParsePreview({
      taskId: input.taskId,
      runId: input.runId,
      evidence,
      promptArtifactHash: promptArtifact.manifest.inputArtifactHash as ContentHash
    });
    if (input.providerMode === "remote-gated") {
      return await suspendMountedTaskForRemoteApproval({
        ...input,
        now: operationNow,
        authority,
        contextPacks,
        promptArtifactHash: promptArtifact.manifest.inputArtifactHash as ContentHash,
        preview: remoteProviderTransferPreview({
          taskId: input.taskId,
          runId: input.runId,
          evidence,
          contextPacks,
          promptArtifactHash: promptArtifact.manifest.inputArtifactHash as ContentHash
        })
      });
    }

    if (handoffAuthority === undefined) {
      throw mountedConflict("Mounted local handoff authority is unavailable.");
    }
    const stores = await authority.handoffStores({
      materialStore: handoffAuthority.binding.materialStore,
      manifestStore: handoffAuthority.binding.manifestStore,
      sourceArtifactHashes: evidence.map((binding) => binding.contentHash)
    });
    const effectStores = {
      material: taskFencedManifestStore(stores.material, input.handle, input.taskId, input.runId),
      manifest: taskFencedManifestStore(stores.manifest, input.handle, input.taskId, input.runId)
    };
    const workspaceManifestArtifact = await effectStores.manifest.put(
      await authority.readWorkspaceManifestArtifact()
    );
    if (workspaceManifestArtifact.contentHash !== authority.workspaceManifestHash) {
      throw mountedConflict("Mounted workspace manifest provenance could not be stored exactly.");
    }
    await seedContextProvenanceArtifacts(effectStores.manifest, contextPacks, contextEvents);
    await authority.revalidate();
    const executionLedger = revalidatingMountedLedger(input.handle, authority, {
      taskId: input.taskId,
      runId: input.runId,
      allowedTaskStatuses: ["running"],
      allowedRunStates: ["running", "completed"]
    });
    const workflow = await runEvidenceTriageWorkflow({
      ledger: executionLedger,
      actor: residentActor,
      now: operationNow,
      contextPacks: contextRegistry,
      scope,
      runId: input.runId,
      taskId: input.taskId,
      providerId: fakeProviderId,
      modelFamily: fakeModelFamily,
      credentialRef: {
        credentialRefId: "agent_credref_fake_local",
        providerId: fakeProviderId,
        kind: "local-no-secret",
        safeLabel: "Deterministic mounted local provider"
      },
      runtime: revalidatingMountedRuntime(
        input.runtime,
        authority,
        executionLedger,
        operationNow,
        input.handle,
        input.taskId,
        input.runId
      ),
      providerReadiness: { cards: [fakeProviderReadinessCard()] },
      mountedPromptReadbackWitness: promptReadback.witness,
      derivativeStore: effectStores.material,
      handoffMaterialStore: effectStores.material,
      handoffManifestStore: effectStores.manifest,
      handoffAuthorityWitness: handoffAuthority.binding.authorityWitness,
      evidenceIds: input.evidenceIds,
      providerParseApprovalPreview: providerParsePreview
    });
    if (workflow.handoff.status !== "ready-for-review" || workflow.readback === undefined) {
      throw mountedConflict("Mounted evidence triage did not produce a reviewable local handoff.");
    }
    await authority.revalidate();

    await consumeMountedTaskHandoffAuthority({
      handle: input.handle,
      authority: handoffAuthority,
      taskId: input.taskId,
      runId: input.runId,
      readback: workflow.readback
    });

    const recorded = latestRecordedHandoff(await input.handle.ledger.readAll(), input.taskId, input.runId);
    await authority.revalidate();
    await input.beforeCompletionMemoryForTest?.();
    await appendMountedCompletionMemory({
      handle: input.handle,
      authority,
      now: operationNow,
      taskId: input.taskId,
      runId: input.runId,
      recorded,
      artifactHashes: uniqueHashes([
        authority.workspaceManifestHash,
        requireContentHash(recorded.payload.handoffManifestHash),
        requireContentHash(recorded.payload.promptArtifactHash),
        ...recorded.payload.outputArtifactHashes.map(requireContentHash)
      ])
    });
    return await reconstructMountedEvidenceTriageTask({
      handle: input.handle,
      runtime: input.runtime,
      taskId: input.taskId,
      runId: input.runId
    });
  } finally {
    await handoffAuthority?.stop().catch(() => undefined);
  }
}

async function acquireMountedTaskHandoffAuthority(input: {
  readonly handle: LocalRuntimeHandle;
  readonly authority: MountedTaskAuthority;
  readonly taskId: string;
  readonly runId: string;
  readonly now: () => string;
  readonly acquireHandoffAuthority?: MountedEvidenceTriageHandoffAcquirer | undefined;
}): Promise<MountedTaskHandoffAuthority> {
  await input.authority.revalidate();
  if (input.acquireHandoffAuthority !== undefined) {
    try {
      const acquired = await input.acquireHandoffAuthority();
      await input.authority.revalidate();
      return Object.freeze({
        binding: acquired.binding,
        consume: async (eventIds: readonly string[]) => await acquired.consume(eventIds),
        stop: async () => undefined
      });
    } catch {
      throw mountedConflict("A current supervised handoff authority could not be acquired for this task.");
    }
  }
  let safeIdSequence = 0;
  let wakeRuntime: WakeSupervisorRuntime | undefined;
  try {
    wakeRuntime = createWakeSupervisorRuntime({
      runtimeHandle: input.handle,
      actor: residentActor,
      supervisorEpoch: `epoch_${input.runId}_mounted_task`,
      policy: {
        policyVersion: input.authority.policyVersion,
        policyDigest: input.authority.policyHash,
        lockStateDigest: input.authority.activeLocksHash
      },
      now: input.now,
      createSafeId: (kind) => `${kind}_${input.runId}_mounted_task_${++safeIdSequence}`
    });
    const started = await wakeRuntime.supervision.start();
    if (started.outcome !== "accepted") {
      throw new Error("mounted wake authority was not accepted");
    }
    const prepared = await bindMountedEvidenceTriageHandoffForLocalAgentRuntimeFactory({
      wakeRuntime,
      taskId: input.taskId,
      runId: input.runId
    });
    await input.authority.revalidate();
    const issuedWakeRuntime = wakeRuntime;
    return Object.freeze({
      binding: prepared.binding,
      consume: async (eventIds: readonly string[]) => {
        await consumeMountedHandoffAuthorityController(prepared.controller, eventIds);
      },
      stop: async () => await issuedWakeRuntime.stop()
    });
  } catch {
    await wakeRuntime?.stop().catch(() => undefined);
    throw mountedConflict("A current mounted handoff authority could not be issued for this task.");
  }
}

async function consumeMountedTaskHandoffAuthority(input: {
  readonly handle: LocalRuntimeHandle;
  readonly authority: MountedTaskHandoffAuthority;
  readonly taskId: string;
  readonly runId: string;
  readonly readback: SpecialistHandoffReadback;
}): Promise<void> {
  const orchestration = (await input.handle.ledger.readAll()).filter((event): event is KnowledgeEventOf<"agent.task.orchestration.completed"> =>
    event.type === "agent.task.orchestration.completed" &&
    event.payload.taskId === input.taskId &&
    event.payload.runId === input.runId &&
    event.payload.handoffRecordedEventId === input.readback.recordedEventId &&
    event.payload.specialistRunCompletedEventId === input.readback.terminalRunEventId
  );
  if (orchestration.length !== 1) {
    throw mountedConflict("Mounted handoff orchestration completion is missing or ambiguous.");
  }
  try {
    await input.authority.consume([
      input.readback.finalOutputEventId,
      input.readback.preparedEventId,
      input.readback.recordedEventId,
      input.readback.terminalRunEventId,
      orchestration[0]!.id,
      input.readback.taskStatusEventId
    ]);
  } catch {
    throw mountedConflict("Mounted handoff authority did not confirm the exact terminal event chain.");
  }
}

async function verifyMountedEvidenceSourceBytes(
  authority: MountedTaskAuthority,
  evidence: readonly EvidenceBinding[]
): Promise<void> {
  for (const binding of evidence) {
    const bytes = await authority.readSourceArtifact(binding.contentHash);
    if (binding.sizeBytes !== undefined && bytes.byteLength !== binding.sizeBytes) {
      throw mountedConflict("Mounted evidence source size does not match its ledger binding.");
    }
  }
}

async function ensureResumedMountedTaskRunning(input: {
  readonly handle: LocalRuntimeHandle;
  readonly now: () => string;
  readonly taskId: string;
  readonly runId: string;
  readonly authority: MountedTaskAuthority;
}): Promise<void> {
  await input.authority.revalidate();
  const events = await input.handle.ledger.readAll();
  const projection = buildAgentProjection(events);
  const task = projection.tasks.get(input.taskId);
  const run = projection.runs.get(input.runId);
  if (run === undefined || run.state !== "running" || run.taskId !== input.taskId) {
    throw mountedConflict("Mounted local run is not resumable.");
  }
  if (task?.status === "running" && task.runId === input.runId) return;
  if (task?.status !== "queued") {
    throw mountedConflict("Mounted local task status is not resumable.");
  }
  const started = events.find((event) =>
    event.type === "agent.specialist-run.started" && event.payload.runId === input.runId
  );
  if (started === undefined || !hasPrecommitGuardedAppend(input.handle.ledger)) {
    throw mountedConflict("Mounted local run recovery write boundary is unavailable.");
  }
  const taskStream = await input.handle.ledger.readStream(`agent_task_${input.taskId}`);
  await input.handle.ledger.appendWithPrecommitGuard({
    type: "agent.task.status.changed",
    version: 1,
    streamId: `agent_task_${input.taskId}`,
    context: agentEventContext(input.now, `corr_${input.taskId}`, started.id),
    payload: {
      taskId: input.taskId,
      status: "running",
      changedBy: residentAgentId,
      reason: "Specialist run started.",
      runId: input.runId
    }
  } satisfies AppendableKnowledgeEvent<"agent.task.status.changed">, {
    expectedGlobalEventCount: events.length,
    expectedNextSequence: taskStream.length + 1
  }, () => {
    const currentness = inspectPortableWorkspaceCurrentness(input.handle);
    if (!currentness.ok) throw new Error(currentness.category ?? "workspace-unavailable");
  });
  await input.authority.revalidate();
}

async function startMountedEvidenceTriageRun(input: {
  readonly handle: LocalRuntimeHandle;
  readonly now: () => string;
  readonly taskId: string;
  readonly runId: string;
  readonly authority: MountedTaskAuthority;
  readonly evidence: readonly EvidenceBinding[];
  readonly beforeRunStartSnapshotForTest?: (() => void | Promise<void>) | undefined;
  readonly beforeTaskRunningForTest?: (() => void | Promise<void>) | undefined;
}): Promise<void> {
  await input.authority.revalidate();
  await input.beforeRunStartSnapshotForTest?.();
  const events = await input.handle.ledger.readAll();
  const projectionAtStart = buildAgentProjection(events);
  const taskAtStart = projectionAtStart.tasks.get(input.taskId);
  if (taskAtStart === undefined || taskAtStart.residentAgentId !== residentAgentId ||
    taskAtStart.status !== "queued" || taskAtStart.runId !== undefined ||
    projectionAtStart.runs.has(input.runId)) {
    throw mountedConflict("Mounted resident task is no longer an exact unstarted queued task.");
  }
  const expectedRunStartGlobalEventCount = events.length;
  const taskCausation = events.findLast((event) =>
    (event.type === "agent.task.created" || event.type === "agent.task.status.changed") &&
    event.payload.taskId === input.taskId
  );
  if (taskCausation === undefined) throw mountedConflict("Mounted task start provenance is unavailable.");
  const ledger = revalidatingMountedLedger(input.handle, input.authority);
  const startedEvent: AppendableKnowledgeEvent<"agent.specialist-run.started"> = {
    type: "agent.specialist-run.started",
    version: 1,
    streamId: `agent_run_${input.runId}`,
    context: agentEventContext(input.now, `corr_${input.runId}`, taskCausation.id),
    payload: {
      runId: input.runId,
      residentAgentId,
      runType: "evidence-triage",
      startedBy: residentAgentId,
      taskId: input.taskId,
      workspaceId: input.authority.workspaceId,
      sourceEventIds: [...sourceEventIdsFor(input.evidence)],
      inputArtifactHashes: [...uniqueHashes(input.evidence.map((binding) => binding.contentHash))]
    }
  };
  const started = await ledger.append(startedEvent, {
    expectedGlobalEventCount: expectedRunStartGlobalEventCount,
    expectedNextSequence: 1
  });
  await input.beforeTaskRunningForTest?.();
  const afterStart = await ledger.readAll();
  const projectionAfterStart = buildAgentProjection(afterStart);
  const taskAfterStart = projectionAfterStart.tasks.get(input.taskId);
  const runAfterStart = projectionAfterStart.runs.get(input.runId);
  if (taskAfterStart === undefined || taskAfterStart.residentAgentId !== residentAgentId ||
    taskAfterStart.status !== "queued" || runAfterStart === undefined ||
    runAfterStart.residentAgentId !== residentAgentId || runAfterStart.taskId !== input.taskId ||
    runAfterStart.workspaceId !== input.authority.workspaceId || runAfterStart.state !== "running") {
    throw mountedConflict("Mounted resident task is no longer queued for its exact started run.");
  }
  const expectedGlobalEventCount = afterStart.length;
  const taskStream = await ledger.readStream(`agent_task_${input.taskId}`);
  const runningEvent: AppendableKnowledgeEvent<"agent.task.status.changed"> = {
    type: "agent.task.status.changed",
    version: 1,
    streamId: `agent_task_${input.taskId}`,
    context: agentEventContext(input.now, `corr_${input.taskId}`, started.id),
    payload: {
      taskId: input.taskId,
      status: "running",
      changedBy: residentAgentId,
      reason: "Specialist run started.",
      runId: input.runId
    }
  };
  if (!hasPrecommitGuardedAppend(input.handle.ledger)) {
    throw mountedConflict("Mounted task-running write boundary is unavailable.");
  }
  await input.authority.revalidate();
  await input.handle.ledger.appendWithPrecommitGuard(runningEvent, {
    expectedGlobalEventCount,
    expectedNextSequence: taskStream.length + 1
  }, () => {
    const currentness = inspectPortableWorkspaceCurrentness(input.handle);
    if (!currentness.ok) throw new Error(currentness.category ?? "workspace-unavailable");
  });
  await input.authority.revalidate();
}

function mountedRunInitialContextEvents(
  events: readonly KnowledgeEvent[],
  taskId: string,
  runId: string
): readonly KnowledgeEvent[] {
  const boundary = events.findIndex((event) =>
    event.type === "agent.task.status.changed" && event.payload.taskId === taskId &&
    event.payload.runId === runId && event.payload.status === "running"
  );
  if (boundary < 0) {
    throw mountedConflict("Mounted run context checkpoint is unavailable.");
  }
  return Object.freeze(events.slice(0, boundary + 1));
}

export async function reconstructMountedEvidenceTriageTask(
  input: ReconstructMountedEvidenceTriageTaskInput
): Promise<AgentMountedTaskResultDto> {
  const authority = await captureMountedTaskAuthority(input.handle, input.runtime);
  await authority.revalidate();
  const events = await input.handle.ledger.readAll();
  const projection = buildAgentProjection(events);
  const task = projection.tasks.get(input.taskId);
  const run = projection.runs.get(input.runId);
  if (projection.identity?.residentAgentId !== residentAgentId ||
    projection.identity.workspaceId !== authority.workspaceId) {
    throw mountedConflict("Resident identity does not match the authenticated portable workspace.");
  }
  if (task === undefined || run === undefined) {
    throw new MountedResidentTaskError(404, "Completed mounted evidence triage handoff was not found.", [
      "refresh the resident task after local completion"
    ]);
  }
  if (task.residentAgentId !== residentAgentId ||
    run.residentAgentId !== residentAgentId ||
    run.taskId !== input.taskId ||
    run.runType !== "evidence-triage") {
    throw mountedConflict("Completed task and run identity bindings do not agree.");
  }
  if (run.state === "running" && task.status === "waiting-for-approval") {
    return await reconstructMountedWaitingEvidenceTriageTask(input);
  }
  if (run.state !== "completed" || task.status !== "completed") {
    throw mountedConflict("Mounted task and run are not durably completed together.");
  }

  const recorded = latestRecordedHandoff(events, input.taskId, input.runId);
  if (recorded.payload.promptArtifactHash === undefined || recorded.payload.status !== "ready-for-review") {
    throw mountedConflict("Mounted handoff is missing its exact prompt or terminal review state.");
  }
  const initialStores = await authority.handoffStores();
  const handoffManifestHash = requireContentHash(recorded.payload.handoffManifestHash);
  const promptArtifactHash = requireContentHash(recorded.payload.promptArtifactHash);
  const outputArtifactHashes = recorded.payload.outputArtifactHashes.map(requireContentHash);
  const manifestBytes = await initialStores.manifest.get(handoffManifestHash);
  if (hashBytes(manifestBytes) !== handoffManifestHash) {
    throw mountedConflict("Mounted handoff manifest bytes do not match their ledger hash.");
  }
  const manifestValue = parseJson(manifestBytes);
  const verified = verifyAuthorityBoundSpecialistHandoffManifest({
    manifest: manifestValue,
    handoffManifestHash
  });
  const manifest = parseAuthorityBoundSpecialistHandoffManifest(manifestValue);
  const sourceArtifactHashes = sourceArtifactHashesForManifest(events, manifest);
  await authority.withHandoffReadSnapshot({ sourceArtifactHashes }, async (snapshotReader) => {
    const reader = cachedMountedStoreReader(snapshotReader, [
      { contentHash: handoffManifestHash, bytes: manifestBytes }
    ]);
    const handoffProjection = await buildSpecialistHandoffProjection({
      events,
      manifestReader: reader,
      taskId: input.taskId,
      runId: input.runId
    });
    const readback = handoffProjection.selectedReadback;
    if (handoffProjection.state !== "task-completed" || handoffProjection.diagnostics.length !== 0 ||
      readback === undefined || readback.diagnostics.length !== 0 ||
      readback.manifestHash !== handoffManifestHash || readback.recordedEventId !== recorded.id ||
      readback.taskId !== input.taskId || readback.runId !== input.runId) {
      throw mountedConflict("Mounted handoff does not replay as one authority-bound completed task.");
    }
    if (verified.taskId !== input.taskId || verified.runId !== input.runId ||
      manifest.taskId !== input.taskId || manifest.runId !== input.runId ||
      manifest.residentAgentId !== residentAgentId ||
      manifest.promptArtifactHash !== recorded.payload.promptArtifactHash ||
      manifest.authorityBinding.policyHash !== authority.policyHash ||
      manifest.authorityBinding.activeLocksHash !== authority.activeLocksHash ||
      !sameOrderedStrings(manifest.sourceEventIds, recorded.payload.sourceEventIds) ||
      !sameOrderedStrings(
        manifest.outputArtifacts.map((artifact) => artifact.artifactHash),
        outputArtifactHashes
      )) {
      throw mountedConflict("Ledger and mounted handoff bindings do not agree exactly.");
    }
    for (const artifactHash of outputArtifactHashes) {
      const bytes = await reader.get(artifactHash);
      if (hashBytes(bytes) !== artifactHash) {
        throw mountedConflict("Mounted derivative artifact readback did not match its ledger hash.");
      }
    }
    const promptStore = await createMountedPromptArtifactStore({ handle: input.handle });
    const authoritativeContextPacks = await rehydrateMountedContextPacks(reader, manifest.contextPackRefs);
    const prompt = await promptStore.read({
      inputArtifactHash: promptArtifactHash,
      authoritativeResolvedContextPacks: authoritativeContextPacks
    });
    if (prompt.envelope.manifest.inputArtifactHash !== recorded.payload.promptArtifactHash) {
      throw mountedConflict("Mounted prompt readback did not match the durable handoff.");
    }
    const workspaceManifestBytes = await reader.get(authority.workspaceManifestHash);
    if (hashBytes(workspaceManifestBytes) !== authority.workspaceManifestHash) {
      throw mountedConflict("Mounted workspace manifest provenance did not read back exactly.");
    }
  });
  const memoryId = `mem_${input.runId}_handoff`;
  const memory = projection.activeMemory.find((candidate) => candidate.memoryId === memoryId);
  const expectedMemoryArtifacts = uniqueHashes([
    handoffManifestHash,
    promptArtifactHash,
    ...outputArtifactHashes
  ]);
  const workspaceManifestArtifacts = memory?.artifactHashes.filter(
    (artifactHash) => !expectedMemoryArtifacts.includes(requireContentHash(artifactHash))
  ) ?? [];
  if (memory !== undefined && (memory.scope !== "task" ||
    !expectedMemoryArtifacts.every((artifactHash) => memory.artifactHashes.includes(artifactHash)) ||
    workspaceManifestArtifacts.length !== 1 ||
    workspaceManifestArtifacts[0] !== authority.workspaceManifestHash ||
    !memory.sourceEventIds.includes(recorded.id))) {
    throw mountedConflict("Mounted task completion memory does not match the durable handoff.");
  }
  if (memory === undefined && input.allowMissingMemoryForRecovery !== true) {
    throw mountedConflict("Mounted task completion memory does not match the durable handoff.");
  }
  return Object.freeze({
    schemaVersion: mountedTaskSchemaVersion,
    state: "completed",
    residentAgentId,
    taskId: input.taskId,
    runId: input.runId,
    contextBindings: contextBindingsFromRefs(verified.contextPackRefs),
    promptArtifactHash,
    handoff: Object.freeze({
      status: "ready-for-review" as const,
      manifestHash: handoffManifestHash,
      outputArtifactHashes: Object.freeze(outputArtifactHashes),
      sourceEventIds: Object.freeze([...recorded.payload.sourceEventIds]),
      policyHash: manifest.authorityBinding.policyHash
    }),
    ...(memory === undefined ? {} : { memoryId })
  });
}

async function ensureMountedCompletionMemory(
  input: {
    readonly handle: LocalRuntimeHandle;
    readonly runtime: LocalAgentRuntime;
    readonly now: () => string;
    readonly taskId: string;
    readonly runId: string;
  }
): Promise<AgentMountedTaskResultDto> {
  const partial = await reconstructMountedEvidenceTriageTask({
    handle: input.handle,
    runtime: input.runtime,
    taskId: input.taskId,
    runId: input.runId,
    allowMissingMemoryForRecovery: true
  });
  if (partial.memoryId !== undefined) return partial;
  if (partial.handoff === undefined) {
    throw mountedConflict("Mounted completed handoff recovery is incomplete.");
  }
  const authority = await captureMountedTaskAuthority(input.handle, input.runtime);
  const recorded = latestRecordedHandoff(await input.handle.ledger.readAll(), input.taskId, input.runId);
  await appendMountedCompletionMemory({
    handle: input.handle,
    authority,
    now: input.now,
    taskId: input.taskId,
    runId: input.runId,
    recorded,
    artifactHashes: uniqueHashes([
      authority.workspaceManifestHash,
      partial.handoff.manifestHash,
      partial.promptArtifactHash,
      ...partial.handoff.outputArtifactHashes
    ])
  });
  return await reconstructMountedEvidenceTriageTask({
    handle: input.handle,
    runtime: input.runtime,
    taskId: input.taskId,
    runId: input.runId
  });
}

async function appendMountedCompletionMemory(input: {
  readonly handle: LocalRuntimeHandle;
  readonly authority: MountedTaskAuthority;
  readonly now: () => string;
  readonly taskId: string;
  readonly runId: string;
  readonly recorded: KnowledgeEventOf<"agent.specialist-handoff.recorded">;
  readonly artifactHashes: readonly ContentHash[];
}): Promise<void> {
  const memoryId = `mem_${input.runId}_handoff`;
  const sourceEventIds = uniqueStrings([...input.recorded.payload.sourceEventIds, input.recorded.id]);
  const artifactHashes = uniqueHashes(input.artifactHashes);
  const ledger = revalidatingMountedLedger(input.handle, input.authority, {
    taskId: input.taskId,
    runId: input.runId,
    allowedTaskStatuses: ["completed"],
    allowedRunStates: ["completed"]
  });
  const events = await ledger.readAll();
  const stream = await ledger.readStream(`agent_memory_${memoryId}`);
  const existing = stream.filter((event): event is KnowledgeEventOf<"agent.memory.recorded"> =>
    event.type === "agent.memory.recorded"
  );
  if (existing.length !== 0) {
    const exact = existing.find((event) =>
      event.payload.memoryId === memoryId && event.payload.residentAgentId === residentAgentId &&
      event.payload.scope === "task" && event.payload.memoryKind === "agent-observation" &&
      event.payload.summary === "Mounted evidence triage handoff is ready for local review." &&
      sameOrderedStrings(event.payload.sourceEventIds ?? [], sourceEventIds) &&
      sameOrderedStrings(event.payload.artifactHashes ?? [], artifactHashes) &&
      event.payload.confidence === 1
    );
    if (exact === undefined || existing.length !== 1) {
      throw mountedConflict("Mounted completion memory recovery is ambiguous.");
    }
    return;
  }
  const memoryEvent: AppendableKnowledgeEvent<"agent.memory.recorded"> = {
    type: "agent.memory.recorded",
    version: 1,
    streamId: `agent_memory_${memoryId}`,
    context: agentEventContext(input.now, `corr_${memoryId}`, input.recorded.id),
    payload: {
      memoryId,
      residentAgentId,
      scope: "task",
      memoryKind: "agent-observation",
      summary: "Mounted evidence triage handoff is ready for local review.",
      sourceEventIds: [...sourceEventIds],
      artifactHashes: [...artifactHashes],
      confidence: 1,
      createdAt: input.now()
    }
  };
  await ledger.append(memoryEvent, {
    expectedGlobalEventCount: events.length,
    expectedNextSequence: 1
  });
}

async function reconstructMountedWaitingEvidenceTriageTask(
  input: ReconstructMountedEvidenceTriageTaskInput
): Promise<AgentMountedTaskResultDto> {
  const authority = await captureMountedTaskAuthority(input.handle, input.runtime);
  await authority.revalidate();
  const events = await input.handle.ledger.readAll();
  const projection = buildAgentProjection(events);
  const task = projection.tasks.get(input.taskId);
  const run = projection.runs.get(input.runId);
  if (projection.identity?.residentAgentId !== residentAgentId ||
    projection.identity.workspaceId !== authority.workspaceId) {
    throw mountedConflict("Resident identity does not match the authenticated portable workspace.");
  }
  if (task === undefined || run === undefined) {
    throw new MountedResidentTaskError(404, "Waiting mounted evidence triage run was not found.", [
      "refresh the resident task and its approval request"
    ]);
  }
  if (task.residentAgentId !== residentAgentId || task.status !== "waiting-for-approval" ||
    task.runId !== input.runId || run.residentAgentId !== residentAgentId ||
    run.taskId !== input.taskId || run.runType !== "evidence-triage" || run.state !== "running") {
    throw mountedConflict("Mounted task and run are not one durable waiting evidence-triage chain.");
  }
  const toolRequestId = `toolreq_${input.runId}_provider_transfer`;
  const requests = events.filter((event): event is KnowledgeEventOf<"agent.tool.requested"> =>
    event.type === "agent.tool.requested" && event.payload.runId === input.runId
  );
  const request = requests.length === 1 ? requests[0] : undefined;
  const projectedRequest = projection.toolRequests.get(toolRequestId);
  const waitingStatuses = events.filter((event): event is KnowledgeEventOf<"agent.task.status.changed"> =>
    event.type === "agent.task.status.changed" && event.payload.taskId === input.taskId &&
    event.payload.runId === input.runId && event.payload.status === "waiting-for-approval"
  );
  if (request === undefined || request.payload.toolRequestId !== toolRequestId ||
    request.payload.toolId !== "agent.provider-byte-transfer.execute" ||
    request.payload.requiredApprovalClass !== "provider-byte-transfer" ||
    projectedRequest?.state !== "requested" || projectedRequest.previewHash !== request.payload.previewHash ||
    waitingStatuses.length !== 1 ||
    !sameStringSet(request.payload.sourceEventIds ?? [], run.sourceEventIds) ||
    events.some((event) =>
      (event.type === "agent.model-invocation.requested" ||
        event.type === "agent.model-invocation.completed" ||
        event.type === "agent.model-invocation.failed") &&
      event.payload.runId === input.runId) ||
    events.some((event) => event.type === "agent.specialist-handoff.recorded" && event.payload.runId === input.runId) ||
    events.some((event) => event.type === "agent.memory.recorded" &&
      event.payload.sourceEventIds?.some((eventId) => run.eventIds.includes(eventId)))) {
    throw mountedConflict("Mounted waiting approval chain is missing, stale, terminal, or ambiguous.");
  }
  const promptArtifactHash = requireContentHash(request.payload.inputArtifactHashes?.[0]);
  const prompt = await readMountedWaitingPromptArtifact(input.handle, authority, promptArtifactHash);
  if (prompt.manifest.inputArtifactHash !== promptArtifactHash || prompt.manifest.runType !== "evidence-triage") {
    throw mountedConflict("Mounted waiting prompt artifact does not match the exact resident run.");
  }
  await authority.revalidate();
  return Object.freeze({
    schemaVersion: mountedTaskSchemaVersion,
    state: "waiting-for-approval",
    residentAgentId,
    taskId: input.taskId,
    runId: input.runId,
    contextBindings: contextBindingsFromRefs(prompt.manifest.contextPackRefs),
    promptArtifactHash,
    approval: Object.freeze({
      toolRequestId,
      requiredApprovalClass: "provider-byte-transfer" as const,
      previewHash: requireContentHash(request.payload.previewHash)
    })
  });
}

async function readMountedWaitingPromptArtifact(
  handle: LocalRuntimeHandle,
  authority: MountedTaskAuthority,
  inputArtifactHash: ContentHash
) {
  await authority.revalidate();
  const mountedWorkspace = handle.mountedWorkspace;
  if (mountedWorkspace === undefined) {
    throw mountedConflict("The authenticated portable workspace mount is unavailable.");
  }
  const digest = inputArtifactHash.slice("sha256:".length);
  const path = join(
    mountedWorkspace.paths.blobRoot,
    "agent-prompt-artifacts",
    "sha256",
    digest.slice(0, 2),
    `${digest}.json`
  );
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    throw mountedConflict("The durable mounted waiting prompt artifact is unavailable.");
  }

  const preliminary = parsePromptArtifactEnvelope(bytes);
  if (preliminary.manifest.inputArtifactHash !== inputArtifactHash) {
    throw mountedConflict("The durable mounted waiting prompt artifact hash does not match its run.");
  }
  const persisted = plainRecord(parseJson(bytes));
  const persistedPacks = persisted?.resolvedContextPacks;
  if (!Array.isArray(persistedPacks)) {
    throw mountedConflict("The durable mounted waiting prompt lacks its resolved context provenance.");
  }
  const payloads = new Map<ContentHash, Buffer>();
  for (const candidate of persistedPacks) {
    const record = plainRecord(candidate);
    if (record === undefined || record.ref === undefined || record.payload === undefined) {
      throw mountedConflict("The durable mounted waiting prompt has invalid resolved context provenance.");
    }
    let ref: ContextPackRef;
    try {
      ref = contextPackRefSchema.parse(record.ref);
    } catch {
      throw mountedConflict("The durable mounted waiting prompt has invalid context references.");
    }
    const payload = Buffer.from(serializeContextPackPayload(record.payload));
    if (hashBytes(payload) !== ref.contentHash || payload.byteLength !== ref.sizeBytes ||
      !preliminary.manifest.contextPackRefs.some((expected) =>
        expected.contextPackId === ref.contextPackId && expected.version === ref.version &&
        expected.contentHash === ref.contentHash && expected.sizeBytes === ref.sizeBytes
      )) {
      throw mountedConflict("The durable mounted waiting prompt context bytes do not match their references.");
    }
    const existing = payloads.get(requireContentHash(ref.contentHash));
    if (existing !== undefined && !existing.equals(payload)) {
      throw mountedConflict("The durable mounted waiting prompt has ambiguous context bytes.");
    }
    payloads.set(requireContentHash(ref.contentHash), payload);
  }
  const verifiedPacks = await rehydrateMountedContextPacks(Object.freeze({
    async put() {
      throw mountedConflict("Mounted waiting prompt reconstruction is read-only.");
    },
    async get(contentHash: ContentHash) {
      const payload = payloads.get(contentHash);
      if (payload === undefined) {
        throw mountedConflict("The durable mounted waiting prompt is missing referenced context bytes.");
      }
      return Buffer.from(payload);
    }
  }), preliminary.manifest.contextPackRefs);
  const envelope = parsePromptArtifactEnvelope(bytes, {
    authoritativeResolvedContextPacks: verifiedPacks
  });
  if (!Buffer.from(serializePromptArtifactEnvelope(envelope)).equals(bytes)) {
    throw mountedConflict("The durable mounted waiting prompt bytes are not canonical.");
  }
  await authority.revalidate();
  return envelope;
}

async function rehydrateMountedContextPacks(
  store: SpecialistHandoffManifestStore,
  refs: readonly ContextPackRef[]
) {
  const registry = createContextPackRegistry({
    payloadResolver: async (ref) => parseContextPayload(await store.get(requireContentHash(ref.contentHash)))
  });
  for (const ref of refs) {
    const trustedRef = contextPackRefSchema.parse(ref);
    const investigativeIndex = investigativeContextPackDescriptors.findIndex(
      (descriptor) => descriptor.contextPackId === ref.contextPackId && descriptor.version === ref.version
    );
    if (investigativeIndex >= 0) {
      const descriptor = investigativeContextPackDescriptors[investigativeIndex]!;
      const parser = investigativeContextPackPayloadParsers.find(
        (candidate) => candidate.contextPackId === ref.contextPackId && candidate.version === ref.version
      );
      if (parser === undefined) throw mountedConflict("Mounted investigative context parser is unavailable.");
      registry.register({
        descriptor,
        build: () => trustedRef,
        parsePayload: (payload, parsedRef) => parser.parsePayload(payload, parsedRef) as unknown as AgentContextPackJsonValue
      });
      continue;
    }
    const operationalIndex = operationalContextPackDescriptors.findIndex(
      (descriptor) => descriptor.contextPackId === ref.contextPackId && descriptor.version === ref.version
    );
    if (operationalIndex < 0) throw mountedConflict("Mounted context descriptor is unavailable.");
    const descriptor = operationalContextPackDescriptors[operationalIndex]!;
    const parser = operationalContextPackPayloadParsers[`${ref.contextPackId}@${ref.version}` as keyof typeof operationalContextPackPayloadParsers];
    if (parser === undefined) throw mountedConflict("Mounted operational context parser is unavailable.");
    registry.register({ descriptor, build: () => trustedRef, parsePayload: parser });
  }
  return Object.freeze(await Promise.all(refs.map(async (ref) => await registry.buildResolved(ref.contextPackId))));
}

function parseContextPayload(bytes: Buffer): AgentContextPackJsonValue {
  try {
    return JSON.parse(bytes.toString("utf8")) as AgentContextPackJsonValue;
  } catch {
    throw mountedConflict("Mounted context payload bytes are not canonical JSON.");
  }
}

async function suspendMountedTaskForRemoteApproval(input: RunMountedEvidenceTriageTaskInput & {
  readonly authority: MountedTaskAuthority;
  readonly contextPacks: readonly { readonly ref: ContextPackRef }[];
  readonly promptArtifactHash: ContentHash;
  readonly preview: AgentToolPreview;
}): Promise<AgentMountedTaskResultDto> {
  await input.authority.revalidate();
  const toolRequestId = `toolreq_${input.runId}_provider_transfer`;
  const gateway = createAgentToolGateway({
    ledger: input.handle.ledger,
    actor: residentActor,
    now: input.now
  });
  const requested = await gateway.requestTool({
    toolRequestId,
    residentAgentId,
    taskId: input.taskId,
    runId: input.runId,
    toolId: "agent.provider-byte-transfer.execute",
    toolVersion: "1.0.0",
    sideEffectClass: "external-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    preview: input.preview,
    inputArtifactHashes: uniqueHashes([
      input.promptArtifactHash,
      ...input.contextPacks.map((pack) => pack.ref.contentHash as ContentHash)
    ])
  });
  await input.authority.revalidate();
  const taskStream = await input.handle.ledger.readStream(`agent_task_${input.taskId}`);
  await input.handle.ledger.append({
    type: "agent.task.status.changed",
    version: 1,
    streamId: `agent_task_${input.taskId}`,
    context: agentEventContext(input.now, `corr_${input.taskId}`, requested.id),
    payload: {
      taskId: input.taskId,
      status: "waiting-for-approval",
      changedBy: residentAgentId,
      reason: "Provider byte transfer requires explicit human approval.",
      runId: input.runId
    }
  } satisfies AppendableKnowledgeEvent<"agent.task.status.changed">, {
    expectedNextSequence: taskStream.length + 1
  });
  await input.authority.revalidate();
  return Object.freeze({
    schemaVersion: mountedTaskSchemaVersion,
    state: "waiting-for-approval",
    residentAgentId,
    taskId: input.taskId,
    runId: input.runId,
    contextBindings: contextBindingsFromRefs(input.contextPacks.map((pack) => pack.ref)),
    promptArtifactHash: input.promptArtifactHash,
    approval: Object.freeze({
      toolRequestId,
      requiredApprovalClass: "provider-byte-transfer" as const,
      previewHash: hashAgentToolPreview(input.preview)
    })
  });
}

async function captureMountedTaskAuthority(
  handle: LocalRuntimeHandle,
  runtime: LocalAgentRuntime
): Promise<MountedTaskAuthority> {
  let capturedWorkspace: MountedPortableWorkspace;
  let capturedManifestBytes: Buffer;
  let capturedManifestHash: ContentHash;
  let capturedActiveLocksHash: ContentHash;
  let capturedPolicy: MountedResidentPolicySnapshot;
  try {
    assertMountedResidentTaskRuntimeBinding({ handle, runtime });
    if (handle.config.storage.strategy !== "portable-workspace" || handle.mountedWorkspace === undefined ||
      handle.config.storage.workspaceRoot !== handle.mountedWorkspace.rootDir ||
      handle.config.storage.sqlitePath !== handle.mountedWorkspace.paths.ledgerPath ||
      handle.config.storage.expectedWorkspaceId !== undefined &&
        handle.config.storage.expectedWorkspaceId !== handle.mountedWorkspace.workspaceId) {
      throw new Error("portable-runtime-binding-mismatch");
    }
    capturedWorkspace = handle.mountedWorkspace;
    capturedManifestBytes = await readFile(capturedWorkspace.manifestPath);
    capturedManifestHash = hashBytes(capturedManifestBytes);
    const events = await handle.ledger.readAll();
    const projection = buildAgentProjection(events);
    capturedPolicy = mountedResidentPolicySnapshot(events, capturedWorkspace.workspaceId);
    capturedActiveLocksHash = activeLocksHash(projection);
    if (!capturedPolicy.allowedRunTypes.includes("evidence-triage")) {
      throw new Error("policy-excludes-evidence-triage");
    }
    if ([...projection.locks.values()].some((lock) => lock.state === "active")) {
      throw new Error("active-lock");
    }
  } catch {
    throw mountedConflict("A current authenticated portable workspace mount is required.");
  }
  const revalidate = async (): Promise<void> => {
    try {
      assertMountedResidentTaskRuntimeBinding({ handle, runtime });
    } catch {
      throw mountedConflict("The factory-bound mounted resident runtime is no longer current.");
    }
    if (handle.mountedWorkspace !== capturedWorkspace) {
      throw mountedConflict("The authenticated portable workspace mount is unavailable or changed.");
    }
    const mounted = mountPortableWorkspace({
      rootDir: capturedWorkspace.rootDir,
      expectedWorkspaceId: capturedWorkspace.workspaceId
    });
    if (!mounted.ok || !sameWorkspaceTuple(capturedWorkspace, mounted.workspace)) {
      throw mountedConflict("The authenticated portable workspace mount is unavailable or changed.");
    }
    let currentManifestHash: ContentHash;
    try {
      currentManifestHash = hashBytes(await readFile(mounted.workspace.manifestPath));
    } catch {
      throw mountedConflict("The authenticated portable workspace mount is unavailable or changed.");
    }
    if (currentManifestHash !== capturedManifestHash) {
      throw mountedConflict("The authenticated portable workspace mount is stale.");
    }
    const events = await handle.ledger.readAll();
    const projection = buildAgentProjection(events);
    if (mountedResidentSupervisionIsPaused(events)) {
      throw mountedConflict("Resident supervision is paused for mounted task execution.");
    }
    const currentPolicy = mountedResidentPolicySnapshot(events, capturedWorkspace.workspaceId);
    if (currentPolicy.eventId !== capturedPolicy.eventId ||
      currentPolicy.policyId !== capturedPolicy.policyId ||
      currentPolicy.policyVersion !== capturedPolicy.policyVersion ||
      currentPolicy.policyHash !== capturedPolicy.policyHash ||
      !sameOrderedStrings(currentPolicy.allowedRunTypes, capturedPolicy.allowedRunTypes) ||
      !currentPolicy.allowedRunTypes.includes("evidence-triage")) {
      throw mountedConflict("The mounted resident policy changed or no longer allows evidence triage.");
    }
    if (activeLocksHash(projection) !== capturedActiveLocksHash ||
      [...projection.locks.values()].some((lock) => lock.state === "active")) {
      throw mountedConflict("The mounted resident task is blocked by an active workspace lock.");
    }
    if (projection.identity !== undefined &&
      (projection.identity.residentAgentId !== residentAgentId || projection.identity.workspaceId !== capturedWorkspace.workspaceId)) {
      throw mountedConflict("Resident identity does not match the authenticated portable workspace.");
    }
  };
  await revalidate();
  return Object.freeze({
    workspaceId: capturedWorkspace.workspaceId,
    workspaceManifestHash: capturedManifestHash,
    policyEventId: capturedPolicy.eventId,
    policyId: capturedPolicy.policyId,
    policyVersion: capturedPolicy.policyVersion,
    policyHash: capturedPolicy.policyHash,
    allowedRunTypes: capturedPolicy.allowedRunTypes,
    activeLocksHash: capturedActiveLocksHash,
    revalidate,
    async readWorkspaceManifestArtifact(): Promise<Buffer> {
      await revalidate();
      return Buffer.from(capturedManifestBytes);
    },
    async readSourceArtifact(contentHash: ContentHash): Promise<Buffer> {
      await revalidate();
      const sourceBlobStore = new FileBlobStore(capturedWorkspace.paths.blobRoot);
      let bytes: Buffer;
      try {
        bytes = await sourceBlobStore.get(contentHash);
      } catch {
        throw mountedConflict("Mounted evidence source bytes are unavailable.");
      }
      if (hashBytes(bytes) !== contentHash) {
        throw mountedConflict("Mounted evidence source bytes do not match their ledger hash.");
      }
      await revalidate();
      return bytes;
    },
    async handoffStores(storeInput: {
      readonly materialStore?: SpecialistHandoffManifestStore;
      readonly manifestStore?: SpecialistHandoffManifestStore;
      readonly sourceArtifactHashes?: readonly ContentHash[];
    } = {}): Promise<{
      readonly material: SpecialistHandoffManifestStore;
      readonly manifest: SpecialistHandoffManifestStore;
      readonly reader: SpecialistHandoffManifestStore;
    }> {
      await revalidate();
      const materialTarget = storeInput.materialStore ?? new FileBlobStore(
        join(capturedWorkspace.paths.derivativeRoot, "specialist-handoff-material")
      );
      const manifestTarget = storeInput.manifestStore ?? new FileBlobStore(
        join(capturedWorkspace.paths.derivativeRoot, "specialist-handoff-manifest")
      );
      if (materialTarget === manifestTarget) {
        throw mountedConflict("Mounted handoff material and manifest stores must remain distinct.");
      }
      const sourceHashes = new Set<ContentHash>(storeInput.sourceArtifactHashes ?? []);
      const sourceStore = sourceBlobStoreFor(capturedWorkspace);
      const material = mountedCanonicalStore({
        target: materialTarget,
        readers: [
          { store: manifestTarget },
          { store: sourceStore, allowedHashes: sourceHashes }
        ],
        revalidate
      });
      const manifest = mountedCanonicalStore({
        target: manifestTarget,
        readers: [
          { store: materialTarget },
          { store: sourceStore, allowedHashes: sourceHashes }
        ],
        revalidate
      });
      const reader = mountedCompositeReader({
        readers: [
          { store: manifestTarget },
          { store: materialTarget },
          { store: sourceStore, allowedHashes: sourceHashes }
        ],
        revalidate
      });
      return Object.freeze({ material, manifest, reader });
    },
    async withHandoffReadSnapshot<T>(
      storeInput: { readonly sourceArtifactHashes?: readonly ContentHash[] },
      read: (reader: SpecialistHandoffManifestStore) => Promise<T>
    ): Promise<T> {
      await revalidate();
      const sourceHashes = new Set<ContentHash>(storeInput.sourceArtifactHashes ?? []);
      const sourceStore = sourceBlobStoreFor(capturedWorkspace);
      let active = true;
      const reader = mountedReadSnapshotReader({
        readers: [
          { store: new FileBlobStore(join(capturedWorkspace.paths.derivativeRoot, "specialist-handoff-manifest")) },
          { store: new FileBlobStore(join(capturedWorkspace.paths.derivativeRoot, "specialist-handoff-material")) },
          { store: sourceStore, allowedHashes: sourceHashes }
        ],
        isActive: () => active
      });
      try {
        const result = await read(reader);
        await revalidate();
        return result;
      } finally {
        active = false;
      }
    }
  });
}

function mountedCanonicalStore(input: {
  readonly target: SpecialistHandoffManifestStore;
  readonly readers: readonly MountedStoreReader[];
  readonly revalidate: () => Promise<void>;
}): SpecialistHandoffManifestStore {
  return Object.freeze({
    async put(content: Buffer) {
      await input.revalidate();
      const stored = await input.target.put(content);
      await input.revalidate();
      return Object.freeze({ contentHash: stored.contentHash, sizeBytes: stored.sizeBytes });
    },
    async get(contentHash: ContentHash) {
      return await readMountedStoreHash(contentHash, [
        { store: input.target },
        ...input.readers
      ], input.revalidate);
    }
  });
}

interface MountedStoreReader {
  readonly store: SpecialistHandoffManifestStore;
  readonly allowedHashes?: ReadonlySet<ContentHash>;
}

function mountedCompositeReader(input: {
  readonly readers: readonly MountedStoreReader[];
  readonly revalidate: () => Promise<void>;
}): SpecialistHandoffManifestStore {
  return Object.freeze({
    async put() {
      throw mountedConflict("Mounted composite artifact readers cannot write fallback copies.");
    },
    async get(contentHash: ContentHash) {
      return await readMountedStoreHash(contentHash, input.readers, input.revalidate);
    }
  });
}

function mountedReadSnapshotReader(input: {
  readonly readers: readonly MountedStoreReader[];
  readonly isActive: () => boolean;
}): SpecialistHandoffManifestStore {
  return Object.freeze({
    async put() {
      throw mountedConflict("Mounted read snapshots cannot write fallback copies.");
    },
    async get(contentHash: ContentHash) {
      if (!input.isActive()) {
        throw mountedConflict("Mounted read snapshot authority has expired.");
      }
      const bytes = await readMountedStoreHashExact(contentHash, input.readers);
      if (!input.isActive()) {
        throw mountedConflict("Mounted read snapshot authority has expired.");
      }
      return bytes;
    }
  });
}

function cachedMountedStoreReader(
  store: SpecialistHandoffManifestStore,
  initial: readonly { readonly contentHash: ContentHash; readonly bytes: Buffer }[] = []
): SpecialistHandoffManifestStore {
  const cache = new Map<ContentHash, Buffer>();
  for (const item of initial) {
    if (hashBytes(item.bytes) !== item.contentHash) {
      throw mountedConflict("Mounted read cache seed did not match its content hash.");
    }
    cache.set(item.contentHash, Buffer.from(item.bytes));
  }
  return Object.freeze({
    async put() {
      throw mountedConflict("Mounted read caches cannot write fallback copies.");
    },
    async get(contentHash: ContentHash) {
      const cached = cache.get(contentHash);
      if (cached !== undefined) return Buffer.from(cached);
      const bytes = await store.get(contentHash);
      if (hashBytes(bytes) !== contentHash) {
        throw mountedConflict("Mounted cached read did not match its content hash.");
      }
      cache.set(contentHash, Buffer.from(bytes));
      return Buffer.from(bytes);
    }
  });
}

async function readMountedStoreHash(
  contentHash: ContentHash,
  readers: readonly MountedStoreReader[],
  revalidate: () => Promise<void>
): Promise<Buffer> {
  await revalidate();
  const bytes = await readMountedStoreHashExact(contentHash, readers);
  await revalidate();
  return bytes;
}

async function readMountedStoreHashExact(
  contentHash: ContentHash,
  readers: readonly MountedStoreReader[]
): Promise<Buffer> {
  for (const reader of readers) {
    if (reader.allowedHashes !== undefined && !reader.allowedHashes.has(contentHash)) continue;
    try {
      const bytes = await reader.store.get(contentHash);
      if (hashBytes(bytes) !== contentHash) {
        throw mountedConflict("Mounted handoff artifact bytes do not match their content hash.");
      }
      return bytes;
    } catch (error) {
      if (error instanceof MountedResidentTaskError) throw error;
    }
  }
  throw mountedConflict("Mounted handoff artifact bytes are unavailable from their canonical store.");
}

function sourceBlobStoreFor(workspace: MountedPortableWorkspace): FileBlobStore {
  return new FileBlobStore(workspace.paths.blobRoot);
}

async function seedContextProvenanceArtifacts(
  store: SpecialistHandoffManifestStore,
  contextPacks: readonly { readonly ref: ContextPackRef; readonly payload: unknown }[],
  events: readonly KnowledgeEvent[]
): Promise<void> {
  const seeded = new Set<ContentHash>();
  const putExact = async (contentHash: ContentHash, bytes: Buffer, label: string): Promise<void> => {
    if (seeded.has(contentHash)) return;
    if (hashBytes(bytes) !== contentHash) {
      throw mountedConflict(`Mounted ${label} bytes did not match their provenance hash.`);
    }
    const stored = await store.put(bytes);
    if (stored.contentHash !== contentHash || stored.sizeBytes !== bytes.byteLength) {
      throw mountedConflict(`Mounted ${label} could not be stored exactly.`);
    }
    seeded.add(contentHash);
  };
  for (const pack of contextPacks) {
    const payload = plainRecord(pack.payload);
    const selectionManifest = plainRecord(payload?.selectionManifest);
    const manifestHash = selectionManifest?.manifestHash;
    if (selectionManifest !== undefined && typeof manifestHash === "string" &&
      isContentHash(manifestHash) && (pack.ref.artifactHashes ?? []).includes(manifestHash)) {
      const { manifestHash: _manifestHash, ...manifestBody } = selectionManifest;
      await putExact(
        manifestHash,
        Buffer.from(serializeContextPackPayload(manifestBody)),
        "context selection manifest"
      );
    }
    const items = plainRecord(payload?.items);
    const assertions = Array.isArray(items?.assertions) ? items.assertions : [];
    for (const assertion of assertions) {
      const row = plainRecord(assertion);
      if (row === undefined || typeof row.rowHash !== "string" || !isContentHash(row.rowHash) ||
        !(pack.ref.artifactHashes ?? []).includes(row.rowHash)) continue;
      const { rowHash, ...rowMaterial } = row;
      await putExact(rowHash, Buffer.from(serializeContextPackPayload(rowMaterial)), "accepted graph row");
    }
  }
  const referencedHashes = new Set(contextPacks.flatMap((pack) => pack.ref.artifactHashes ?? []));
  for (const event of events) {
    const bytes = canonicalEventArtifactBytes(event);
    const contentHash = hashBytes(bytes);
    if (referencedHashes.has(contentHash)) {
      await putExact(contentHash, bytes, "event provenance artifact");
    }
  }
}

function createMountedEvidenceTriageContextRegistry(input: {
  readonly authority: MountedTaskAuthority;
  readonly taskId: string;
  readonly evidence: readonly EvidenceBinding[];
  readonly events: readonly KnowledgeEvent[];
  readonly now: () => string;
}) {
  const registry = createContextPackRegistry();
  const investigativeScope = Object.freeze({ kind: "task" as const, id: input.taskId });
  const acceptedAssertions = acceptedGraphAssertionRows(input.events, input.evidence);
  const governanceRestrictions = mountedGovernanceRestrictionRows(input.events, input.evidence);
  const window = Object.freeze({
    cursor: `cursor_${input.taskId}`,
    offset: 0,
    limit: Math.max(1, input.evidence.length + acceptedAssertions.length + governanceRestrictions.length),
    stableSort: "ref-kind-ref-id-content-hash-v1" as const
  });
  const selection = async (contextPackId: string): Promise<InvestigativeSelectionManifest> => {
    const evidenceRefs = input.evidence.map((binding) => Object.freeze({
      refKind: "evidence" as const,
      refId: binding.evidenceId,
      sortKey: `evidence/${binding.evidenceId}/${binding.contentHash}`,
      contentHash: binding.contentHash,
      sourceEventIds: Object.freeze([binding.evidenceEventId, binding.linkEventId]),
      mandatory: true
    }));
    const includedRefs = contextPackId === "evidence-summary.v1"
      ? evidenceRefs
      : contextPackId === "accepted-graph-projection.v1"
        ? [...evidenceRefs, ...acceptedAssertions.map((row) => Object.freeze({
            refKind: "assertion" as const,
            refId: row.assertionId,
            sortKey: `assertion/${row.assertionId}/${row.rowHash}`,
            rowHash: row.rowHash,
            sourceEventIds: row.sourceEventIds,
            mandatory: true
          }))]
        : contextPackId === "governance-locks.v1"
          ? [...evidenceRefs, ...governanceRestrictions.map((row) => Object.freeze({
              refKind: "governance-restriction" as const,
              refId: row.restrictionId,
              sortKey: `governance-restriction/${row.restrictionId}`,
              sourceEventIds: row.sourceEventIds,
              mandatory: true
            }))]
          : [];
    const selectionWindow = Object.freeze({ ...window, limit: Math.max(1, includedRefs.length) });
    const body: InvestigativeSelectionManifestBody = {
      manifestVersion: "investigative-selection-manifest.v1",
      scope: investigativeScope,
      sourceProjectionHighWaterMarks: {
        ingestion: input.events.length,
        graph: input.events.length,
        governance: input.events.length,
        agent: input.events.length
      },
      ordering: "ref-kind-ref-id-content-hash-v1",
      window: selectionWindow,
      totalEligibleCount: includedRefs.length,
      includedRefs,
      aggregateOmissions: Object.freeze([])
    };
    return Object.freeze({ ...body, manifestHash: buildSelectionManifestHash(body) });
  };
  const deps: InvestigativeContextPackDependencies = {
    now: input.now,
    policyVersion: input.authority.policyVersion,
    ontologyCoreVersion: "0.1.0",
    packVersions: { core: "0.1.0", ingestion: "0.1.0", agent: "0.1.0" },
    registrationIdentity: investigativeRegistrationIdentity,
    selection: {
      capabilityVersion: "investigative-selection.v1",
      select: async ({ contextPackId }) => await selection(contextPackId)
    },
    evidenceReader: {
      readEvidenceByIds: async ({ evidenceIds, contentHashes }) => {
        return evidenceIds.map((evidenceId, index): InvestigativeEvidenceRow => {
          const binding = input.evidence.find((candidate) => candidate.evidenceId === evidenceId);
          if (binding === undefined || binding.contentHash !== contentHashes[index]) {
            throw mountedConflict("Evidence context no longer matches the mounted source binding.");
          }
          return Object.freeze({
            evidenceId: binding.evidenceId,
            ingestionEventId: binding.evidenceEventId,
            contentHash: binding.contentHash,
            ...(binding.mediaType === undefined ? {} : { mediaType: binding.mediaType }),
            ...(binding.sizeBytes === undefined ? {} : { sizeBytes: binding.sizeBytes }),
            sourceCollectionId: binding.sourceCollectionId,
            importBatchId: binding.importBatchId,
            occurrenceIds: binding.occurrenceIds,
            parseJobs: Object.freeze([]),
            governanceTags: Object.freeze([]),
            safeNarrative: "Mounted evidence metadata is bound for local triage."
          });
        });
      }
    },
    graphReader: {
      readAcceptedGraphByIds: async ({ assertionIds, entityIds, relationshipIds }) => Object.freeze({
        assertions: Object.freeze(assertionIds.map((assertionId) => {
          const row = acceptedAssertions.find((candidate) => candidate.assertionId === assertionId);
          if (row === undefined) throw mountedConflict("Accepted graph projection row is unavailable.");
          return row;
        })),
        entities: Object.freeze([]),
        relationships: Object.freeze([]),
        relationshipProjectionAvailable: entityIds.length === 0 && relationshipIds.length === 0
      })
    },
    governanceReader: {
      readActiveRestrictionsByIds: async ({ restrictionIds }) => Object.freeze(restrictionIds.map((restrictionId) => {
        const row = governanceRestrictions.find((candidate) => candidate.restrictionId === restrictionId);
        if (row === undefined) throw mountedConflict("Governance restriction projection row is unavailable.");
        return row;
      }))
    },
    agentLockReader: { readActiveLocksByIds: async () => Object.freeze([]) },
    eventReader: {
      readEventsByIds: async ({ eventIds }) => {
        return eventIds.map((eventId) => {
          const event = input.events.find((candidate) => candidate.id === eventId);
          if (event === undefined) throw mountedConflict("Mounted evidence provenance event is unavailable.");
          return Object.freeze({
            eventId: event.id,
            type: event.type,
            ontologyCoreVersion: event.context.coreVersion,
            packVersions: Object.freeze({ ...event.context.packVersions }),
            contentHash: hashBytes(canonicalEventArtifactBytes(event))
          });
        });
      }
    },
    evidenceSourcePosture: {
      postureVersion: "ingestion-current-source-posture.v1",
      checkEvidence: async ({ evidenceId, contentHash }) => {
        const binding = input.evidence.find((candidate) => candidate.evidenceId === evidenceId);
        if (binding === undefined || binding.contentHash !== contentHash) {
          return Object.freeze({
            ok: false as const,
            code: "stale-source" as const,
            stalenessInputs: Object.freeze([])
          });
        }
        const bytes = await input.authority.readSourceArtifact(binding.contentHash);
        if (binding.sizeBytes !== undefined && bytes.byteLength !== binding.sizeBytes) {
          return Object.freeze({
            ok: false as const,
            code: "stale-source" as const,
            stalenessInputs: Object.freeze([])
          });
        }
        return Object.freeze({
          ok: true as const,
          stalenessInputs: Object.freeze([{
            kind: "source-byte-current-hash",
            ref: evidenceId,
            value: contentHash
          }])
        });
      }
    }
  };
  registerInvestigativeContextPacks(registry, {
    deps,
    scope: investigativeScope,
    window
  });
  registerOperationalContextPackBuilders(registry, operationalContextProvider(input));
  assertPackageOwnedContextRegistrations(registry);
  return registry;
}

function operationalContextProvider(input: {
  readonly authority: MountedTaskAuthority;
  readonly taskId: string;
  readonly events: readonly KnowledgeEvent[];
  readonly now: () => string;
}): OperationalContextPackProvider {
  const scope = Object.freeze({ kind: "task" as const, id: input.taskId });
  const readProjection = async () => {
    return { events: input.events, projection: buildAgentProjection(input.events) };
  };
  return {
    providerId: "mounted_resident_task_context",
    capabilities: ["workspace-runtime-status", "task-run-history", "agent-memory-summary"],
    policyVersion: input.authority.policyVersion,
    generatedAt: input.now(),
    scope,
    sizeBudgets: {
      workspaceRuntimeStatus: 16_384,
      taskRunHistory: 32_768,
      agentMemorySummary: 16_384
    },
    async workspaceRuntimeStatus() {
      const { events } = await readProjection();
      return {
        runtimeHighWaterMark: events.length,
        workspaceMounted: true,
        workspaceId: input.authority.workspaceId,
        storageStrategy: "portable-workspace",
        bindPosture: "authenticated-mounted",
        authPosture: "local-runtime-authenticated",
        providerStates: [{ providerId: fakeProviderId, state: "ready" }],
        diagnostics: [],
        projectionHighWaterMarks: { agent: events.length, ingestion: events.length },
        omissionCodes: []
      };
    },
    async taskRunHistorySnapshot() {
      const { events, projection } = await readProjection();
      const tasks = [...projection.tasks.values()]
        .filter((task) => task.taskId === input.taskId)
        .map((task) => ({
          taskId: task.taskId,
          status: task.status,
          priority: task.priority,
          createdAt: task.createdAt,
          ...(task.updatedAt === undefined ? {} : { updatedAt: task.updatedAt }),
          residentAgentId: task.residentAgentId,
          requestedBy: task.requestedBy,
          ...(task.runId === undefined ? {} : { runId: task.runId }),
          sourceEventIds: task.eventIds,
          inputArtifactHashes: task.inputArtifactHashes
        }));
      const runs = [...projection.runs.values()]
        .filter((run) => run.taskId === input.taskId)
        .map((run) => ({
          runId: run.runId,
          state: run.state,
          runType: run.runType,
          residentAgentId: run.residentAgentId,
          startedBy: run.startedBy,
          startedAt: run.startedAt,
          taskId: input.taskId,
          ...(run.workspaceId === undefined ? {} : { workspaceId: run.workspaceId }),
          sourceEventIds: run.eventIds,
          inputArtifactHashes: run.inputArtifactHashes,
          relatedEventIds: run.relatedEventIds,
          ...(run.state === "completed" && run.completedAt !== undefined ? {
            completedAt: run.completedAt,
            outputArtifactHashes: run.outputArtifactHashes
          } : {}),
          ...(run.state === "failed" && run.failedAt !== undefined &&
            run.failureCategory !== undefined && run.retryable !== undefined ? {
            failedAt: run.failedAt,
            failureCategory: run.failureCategory,
            retryable: run.retryable,
            allowedActions: run.allowedActions
          } : {}),
          stepCount: run.stepIds.length,
          invocationIds: run.invocationIds,
          toolRequestIds: run.toolRequestIds
        }));
      const sourceEventIds = uniqueStrings([
        ...tasks.flatMap((task) => projection.tasks.get(task.taskId)?.eventIds ?? []),
        ...runs.flatMap((run) => projection.runs.get(run.runId)?.eventIds ?? [])
      ]);
      const totalCount = tasks.length + runs.length;
      return {
        projectionHighWaterMark: events.length,
        projectionSourceRef: "agent.projection.task-run-history",
        tasks,
        runs,
        modelInvocations: [],
        toolRequests: [],
        aggregateCounts: { tasks: tasks.length, runs: runs.length, total: totalCount },
        sourceEventIds,
        artifactHashes: uniqueHashes([
          ...tasks.flatMap((task) => task.inputArtifactHashes ?? []),
          ...runs.flatMap((run) => run.inputArtifactHashes ?? [])
        ] as ContentHash[]),
        window: {
          order: "updatedAt:desc",
          limit: 25,
          hasMore: false,
          totalCount,
          omissionCodes: []
        },
        ...(totalCount === 0 ? {
          emptyProof: {
            projectionName: "agent.projection.task-run-history",
            scope,
            projectionHighWaterMark: events.length,
            sourceEventCount: 0,
            generatedAt: input.now(),
            emptyReasonCode: "empty"
          }
        } : {})
      };
    },
    async agentMemorySnapshot() {
      const { events, projection } = await readProjection();
      const activeMemory = projection.activeMemory
        .filter((memory) => memory.scope === "task" &&
          memoryHasExactTaskProvenance(memory.sourceEventIds, input.taskId, events, projection))
        .map((memory) => ({
          memoryId: memory.memoryId,
          scope: memory.scope,
          memoryKind: memory.memoryKind,
          summary: memory.summary,
          confidence: memory.confidence,
          sourceEventIds: memory.sourceEventIds,
          artifactHashes: memory.artifactHashes
        }));
      const sourceEventIds = uniqueStrings(activeMemory.flatMap((memory) => memory.sourceEventIds));
      const artifactHashes = uniqueHashes(activeMemory.flatMap((memory) => memory.artifactHashes) as ContentHash[]);
      return {
        projectionHighWaterMark: events.length,
        projectionSourceRef: "agent.projection.memory",
        activeMemory,
        aggregateCounts: { active: activeMemory.length, totalCount: activeMemory.length },
        sourceEventIds,
        artifactHashes,
        window: {
          order: "createdAt:asc",
          limit: 25,
          hasMore: false,
          totalCount: activeMemory.length,
          omissionCodes: []
        },
        ...(activeMemory.length === 0 ? {
          emptyProof: {
            projectionName: "agent.projection.memory",
            scope,
            projectionHighWaterMark: events.length,
            sourceEventCount: 0,
            generatedAt: input.now(),
            emptyReasonCode: "empty"
          }
        } : {})
      };
    }
  };
}

function acceptedGraphAssertionRows(
  events: readonly KnowledgeEvent[],
  evidence: readonly EvidenceBinding[]
): readonly AcceptedGraphAssertionRow[] {
  const evidenceById = new Map(evidence.map((binding) => [binding.evidenceId, binding]));
  const projection = buildGraphProjection(events);
  const rows: AcceptedGraphAssertionRow[] = [];
  for (const assertion of projection.assertions.values()) {
    const binding = evidenceById.get(assertion.evidenceId);
    if (binding === undefined || assertion.acceptedByEventId === undefined) continue;
    const proposed = events.find((event): event is KnowledgeEventOf<"assertion.proposed"> =>
      event.id === assertion.proposedByEventId && event.type === "assertion.proposed");
    const accepted = events.find((event): event is KnowledgeEventOf<"assertion.accepted"> =>
      event.id === assertion.acceptedByEventId && event.type === "assertion.accepted");
    if (proposed === undefined || accepted === undefined || accepted.context.actor.kind !== "human" ||
      accepted.context.causationId !== proposed.id || accepted.payload.assertionId !== assertion.assertionId) {
      throw mountedConflict("Accepted graph assertion lacks exact human review provenance.");
    }
    const sourceEventIds = Object.freeze([proposed.id, accepted.id].sort());
    const rowMaterial = Object.freeze({
      assertionId: assertion.assertionId,
      evidenceId: assertion.evidenceId,
      evidenceContentHash: binding.contentHash,
      proposedByEventId: proposed.id,
      acceptedByEventId: accepted.id,
      sourceEventIds,
      safeStatement: `Human-reviewed assertion ${assertion.assertionId} is present in the read-only accepted graph.`
    });
    rows.push(Object.freeze({
      ...rowMaterial,
      rowHash: hashBytes(Buffer.from(serializeContextPackPayload(rowMaterial)))
    }));
  }
  return Object.freeze(rows.sort((left, right) => left.assertionId.localeCompare(right.assertionId)));
}

function mountedGovernanceRestrictionRows(
  events: readonly KnowledgeEvent[],
  evidence: readonly EvidenceBinding[]
): readonly GovernanceRestrictionRow[] {
  const projection = buildGovernanceProjection(events);
  const installedPolicy = events.findLast((event): event is KnowledgeEventOf<"governance.policy.installed"> =>
    event.type === "governance.policy.installed"
  );
  const policyVersion = installedPolicy?.payload.version ?? defaultGovernancePolicy.version;
  const rows: GovernanceRestrictionRow[] = [];
  for (const binding of evidence) {
    const posture = projection.evidenceGovernance.get(binding.evidenceId);
    if (posture?.quarantined !== true) continue;
    const quarantine = events.findLast((event): event is KnowledgeEventOf<"evidence.quarantined"> =>
      event.type === "evidence.quarantined" && event.payload.evidenceId === binding.evidenceId
    );
    if (quarantine === undefined || quarantine.context.actor.kind !== "human" ||
      quarantine.context.actor.id !== quarantine.payload.quarantinedBy) {
      throw mountedConflict("Active governance restriction lacks exact human provenance.");
    }
    rows.push(Object.freeze({
      sourceLabel: "governance-derived-restriction",
      restrictionId: quarantine.payload.quarantineId,
      restrictionKind: `quarantine-${quarantine.payload.lockLevel}`,
      affectedRef: `evidence:${binding.evidenceId}`,
      sourceEventIds: Object.freeze([quarantine.id]),
      projectionProvenanceRefs: Object.freeze([quarantine.id]),
      policyVersion,
      safeReasonCode: "evidence-quarantine-active"
    }));
  }
  return Object.freeze(rows.sort((left, right) => left.restrictionId.localeCompare(right.restrictionId)));
}

function memoryHasExactTaskProvenance(
  sourceEventIds: readonly string[],
  taskId: string,
  events: readonly KnowledgeEvent[],
  projection: ReturnType<typeof buildAgentProjection>
): boolean {
  const scopedTaskIds: string[] = [];
  for (const sourceEventId of sourceEventIds) {
    const event = events.find((candidate) => candidate.id === sourceEventId);
    if (event === undefined) return false;
    const payload = plainRecord(event.payload);
    const eventTaskId = payload?.taskId;
    if (typeof eventTaskId === "string") {
      scopedTaskIds.push(eventTaskId);
      continue;
    }
    const runId = payload?.runId;
    if (typeof runId === "string") {
      const runTaskId = projection.runs.get(runId)?.taskId;
      if (runTaskId !== undefined) scopedTaskIds.push(runTaskId);
    }
  }
  return scopedTaskIds.length > 0 && scopedTaskIds.every((candidate) => candidate === taskId);
}

function canonicalEventArtifactBytes(event: KnowledgeEvent): Buffer {
  return Buffer.from(serializeContextPackPayload(event as unknown as AgentContextPackJsonValue));
}

function revalidatingMountedLedger(
  handle: LocalRuntimeHandle,
  authority: MountedTaskAuthority,
  taskFence?: {
    readonly taskId: string;
    readonly runId: string;
    readonly allowedTaskStatuses: readonly string[];
    readonly allowedRunStates: readonly string[];
  }
): EventLedger {
  const ledger = handle.ledger;
  return Object.freeze({
    async append(event: AppendableKnowledgeEvent, options?: AppendOptions) {
      await authority.revalidate();
      const fenceEvents = taskFence === undefined
        ? undefined
        : await assertMountedTaskEffectAllowed(
            handle,
            taskFence.taskId,
            taskFence.runId,
            taskFence.allowedTaskStatuses,
            taskFence.allowedRunStates
          );
      if (!hasPrecommitGuardedAppend(ledger)) {
        throw mountedConflict("Mounted execution write boundary is unavailable.");
      }
      const guardedOptions = {
        ...(options ?? {}),
        ...(fenceEvents === undefined || options?.expectedGlobalEventCount !== undefined
          ? {}
          : { expectedGlobalEventCount: fenceEvents.length })
      };
      const appended = await ledger.appendWithPrecommitGuard(event, guardedOptions, () => {
        const currentness = inspectPortableWorkspaceCurrentness(handle);
        if (!currentness.ok) throw new Error(currentness.category ?? "workspace-unavailable");
      });
      await authority.revalidate();
      return appended;
    },
    async readStream(streamId: string) {
      await authority.revalidate();
      return await ledger.readStream(streamId);
    },
    async readAll() {
      await authority.revalidate();
      return await ledger.readAll();
    }
  });
}

function revalidatingMountedRuntime(
  runtime: LocalAgentRuntime,
  authority: MountedTaskAuthority,
  ledger: EventLedger,
  now: () => string,
  handle: LocalRuntimeHandle,
  taskId: string,
  runId: string
) {
  return Object.freeze({
    async invokeModel(command: Parameters<LocalAgentRuntime["invokeModel"]>[0]) {
      await authority.revalidate();
      await assertMountedTaskEffectAllowed(handle, taskId, runId, ["running"]);
      if (command.providerId === fakeProviderId && command.modelFamily === fakeModelFamily &&
        command.invocationId.endsWith("_evidence_triage")) {
        const replay = await replayMountedLocalFakeInvocation(ledger, command, authority, now);
        if (replay !== undefined) return replay;
      }
      const result = await runtime.invokeModel(command);
      await assertMountedTaskEffectAllowed(handle, taskId, runId, ["running"]);
      await authority.revalidate();
      return result;
    }
  });
}

async function assertMountedTaskEffectAllowed(
  handle: LocalRuntimeHandle,
  taskId: string,
  runId: string,
  allowedTaskStatuses: readonly string[],
  allowedRunStates: readonly string[] = ["running"]
): Promise<readonly KnowledgeEvent[]> {
  const before = inspectPortableWorkspaceCurrentness(handle);
  if (!before.ok) throw mountedConflict("Mounted task effect boundary lost portable workspace currentness.");
  const events = await handle.ledger.readAll();
  const projection = buildAgentProjection(events);
  const task = projection.tasks.get(taskId);
  const run = projection.runs.get(runId);
  const after = inspectPortableWorkspaceCurrentness(handle);
  if (!after.ok || mountedResidentSupervisionIsPaused(events) ||
    task === undefined || run === undefined || task.runId !== runId ||
    run.taskId !== taskId || !allowedTaskStatuses.includes(task.status) || !allowedRunStates.includes(run.state)) {
    throw mountedConflict("Mounted task is no longer current for execution effects.");
  }
  return Object.freeze(events);
}

function mountedResidentSupervisionIsPaused(events: readonly KnowledgeEvent[]): boolean {
  const latestPause = events.findLastIndex((event) => event.type === "agent.wake.supervisor.paused.v1");
  const latestResume = events.findLastIndex((event) =>
    event.type === "agent.wake.supervisor.resume.requested.v1" ||
    event.type === "agent.wake.supervisor.recovery.verified.v1"
  );
  return latestPause > latestResume;
}

function taskFencedManifestStore(
  store: SpecialistHandoffManifestStore,
  handle: LocalRuntimeHandle,
  taskId: string,
  runId: string
): SpecialistHandoffManifestStore {
  const assertCurrent = async () => await assertMountedTaskEffectAllowed(
    handle,
    taskId,
    runId,
    ["running", "completed"],
    ["running", "completed"]
  );
  return Object.freeze({
    async put(content: Buffer) {
      await assertCurrent();
      const stored = await store.put(content);
      await assertCurrent();
      return stored;
    },
    async get(contentHash: ContentHash) {
      await assertCurrent();
      const bytes = await store.get(contentHash);
      await assertCurrent();
      return bytes;
    }
  });
}

async function replayMountedLocalFakeInvocation(
  ledger: EventLedger,
  command: Parameters<LocalAgentRuntime["invokeModel"]>[0],
  authority: MountedTaskAuthority,
  now: () => string
): Promise<Awaited<ReturnType<LocalAgentRuntime["invokeModel"]>> | undefined> {
  const streamId = `agent_model_invocation_${command.invocationId}`;
  const stream = await ledger.readStream(streamId);
  if (stream.length === 0) return undefined;
  const requested = stream.find((event): event is KnowledgeEventOf<"agent.model-invocation.requested"> =>
    event.type === "agent.model-invocation.requested"
  );
  const completed = stream.find((event): event is KnowledgeEventOf<"agent.model-invocation.completed"> =>
    event.type === "agent.model-invocation.completed"
  );
  if (requested === undefined || stream.some((event) => event.type === "agent.model-invocation.failed") ||
    requested.sequence !== 1 || requested.payload.invocationId !== command.invocationId ||
    requested.payload.runId !== command.runId || requested.payload.providerId !== fakeProviderId ||
    requested.payload.modelFamily !== fakeModelFamily ||
    requested.payload.inputArtifactHash !== command.inputArtifactHash ||
    requested.payload.credentialRefId !== command.credentialRef.credentialRefId ||
    requested.payload.credentialKind !== command.credentialRef.kind) {
    throw mountedConflict("Mounted local provider checkpoint does not match the admitted invocation.");
  }
  const outputText = mountedLocalEvidenceTriageOutputText();
  const outputArtifactHash = mountedLocalInvocationOutputHash({
    invocationId: command.invocationId,
    runId: command.runId,
    inputArtifactHash: command.inputArtifactHash,
    outputText
  });
  const usage = Object.freeze({
    inputUnits: command.inputArtifactHash.length + command.modelFamily.length,
    outputUnits: outputText.length
  });
  let terminal = completed;
  if (terminal === undefined) {
    if (stream.length !== 1) {
      throw mountedConflict("Mounted local provider checkpoint is ambiguous.");
    }
    await authority.revalidate();
    terminal = await ledger.append({
      type: "agent.model-invocation.completed",
      version: 1,
      streamId,
      context: agentEventContext(now, `corr_${command.invocationId}`, requested.id),
      payload: {
        invocationId: command.invocationId,
        runId: command.runId,
        providerId: fakeProviderId,
        outputArtifactHash,
        completedAt: now(),
        modelFamily: fakeModelFamily,
        usage: {
          inputTokens: usage.inputUnits,
          outputTokens: usage.outputUnits,
          totalTokens: usage.inputUnits + usage.outputUnits
        }
      }
    } satisfies AppendableKnowledgeEvent<"agent.model-invocation.completed">, {
      expectedNextSequence: 2
    }) as KnowledgeEventOf<"agent.model-invocation.completed">;
  }
  if (terminal.sequence !== 2 || terminal.payload.invocationId !== command.invocationId ||
    terminal.payload.runId !== command.runId || terminal.payload.providerId !== fakeProviderId ||
    terminal.payload.modelFamily !== fakeModelFamily ||
    terminal.payload.outputArtifactHash !== outputArtifactHash) {
    throw mountedConflict("Mounted local provider completion checkpoint does not replay exactly.");
  }
  await authority.revalidate();
  return Object.freeze({
    ok: true as const,
    invocationId: command.invocationId,
    outputArtifactHash,
    usage,
    ...(command.returnOutputText === true ? { outputText } : {}),
    eventIds: Object.freeze([requested.id, terminal.id])
  });
}

function mountedLocalEvidenceTriageOutputText(): string {
  return JSON.stringify({
    dossierSummary: "Mounted evidence metadata was triaged into review-only local derivative artifacts.",
    safeSummaries: [],
    governanceFlags: [],
    duplicateGroups: [],
    evidenceGaps: [],
    assertionCandidates: [],
    requestProviderParseApproval: false,
    requestGovernanceReview: false,
    requestQuarantineReview: false,
    requestAssertionProposalReview: false
  });
}

function mountedLocalInvocationOutputHash(input: {
  readonly invocationId: string;
  readonly runId: string;
  readonly inputArtifactHash: string;
  readonly outputText: string;
}): ContentHash {
  return `sha256:${createHash("sha256")
    .update(input.invocationId)
    .update("\0")
    .update(input.runId)
    .update("\0")
    .update(input.inputArtifactHash)
    .update("\0")
    .update(input.outputText)
    .digest("hex")}`;
}

function assertPackageOwnedContextRegistrations(registry: ReturnType<typeof createContextPackRegistry>): void {
  const expected = productionSpecialistPromptRegistrationFor("evidence-triage").contextRequirements
    .filter((requirement) => requirement.requirementMode === "always")
    .map((requirement) => requirement.contextPackId);
  const registered = registry.listDescriptors().map((descriptor) => descriptor.contextPackId);
  if (expected.length !== registered.length || expected.some((contextPackId) => !registered.includes(contextPackId))) {
    throw mountedConflict("Required package-owned evidence-triage context registrations are unavailable.");
  }
}

async function resolveEvidenceTriageContextPacks(registry: ReturnType<typeof createContextPackRegistry>) {
  const requirements = productionSpecialistPromptRegistrationFor("evidence-triage").contextRequirements
    .filter((requirement) => requirement.requirementMode === "always")
    .sort((left, right) => left.order - right.order);
  return Object.freeze(await Promise.all(
    requirements.map(async (requirement) => await registry.buildResolved(requirement.contextPackId))
  ));
}

function exactEvidenceBindings(
  events: readonly KnowledgeEvent[],
  requestedEvidenceIds: readonly string[]
): readonly EvidenceBinding[] {
  if (requestedEvidenceIds.length === 0 || new Set(requestedEvidenceIds).size !== requestedEvidenceIds.length) {
    throw new MountedResidentTaskError(400, "Evidence triage requires unique mounted evidence references.", [
      "select one or more unique mounted evidence items"
    ]);
  }
  return Object.freeze(requestedEvidenceIds.map((evidenceId) => {
    const ingested = events.filter((event): event is KnowledgeEventOf<"evidence.ingested"> =>
      event.type === "evidence.ingested" && event.payload.evidenceId === evidenceId
    );
    if (ingested.length !== 1) {
      throw mountedConflict("Mounted evidence provenance is missing or ambiguous.");
    }
    const evidence = ingested[0]!;
    const linked = events.filter((event): event is KnowledgeEventOf<"ingestion.evidence.linked"> =>
      event.type === "ingestion.evidence.linked" &&
      event.payload.evidenceId === evidenceId &&
      event.payload.contentHash === evidence.payload.contentHash
    );
    if (linked.length !== 1) {
      throw mountedConflict("Mounted evidence source linkage is missing or ambiguous.");
    }
    const link = linked[0]!;
    return Object.freeze({
      evidenceId,
      evidenceEventId: evidence.id,
      linkEventId: link.id,
      contentHash: evidence.payload.contentHash as ContentHash,
      ...(evidence.payload.mediaType === undefined ? {} : { mediaType: evidence.payload.mediaType }),
      ...(evidence.payload.sizeBytes === undefined ? {} : { sizeBytes: evidence.payload.sizeBytes }),
      sourceCollectionId: link.payload.sourceCollectionId,
      importBatchId: link.payload.importBatchId,
      occurrenceIds: Object.freeze([...link.payload.occurrenceIds])
    });
  }));
}

function mountedTaskAdmissionStreamId(taskId: string, runId: string): string {
  return `agent_mounted_task_execution_${taskId}_${runId}`;
}

function admissionEventsFor(
  events: readonly KnowledgeEvent[],
  taskId: string,
  runId: string
): readonly MountedTaskAdmissionEvent[] {
  return Object.freeze(events.filter((event): event is MountedTaskAdmissionEvent =>
    event.type === "agent.mounted-task.execution.admitted.v1" &&
    event.payload.taskId === taskId && event.payload.runId === runId
  ));
}

function admissionMatches(
  event: MountedTaskAdmissionEvent,
  manifest: MountedTaskExecutionInputManifest,
  admissionManifestHash: ContentHash
): boolean {
  return event.payload.admissionId ===
      `admission_${admissionManifestHash.slice("sha256:".length)}` &&
    event.payload.admissionManifestHash === admissionManifestHash &&
    event.payload.workspaceId === manifest.workspaceId &&
    event.payload.workspaceManifestHash === manifest.workspaceManifestHash &&
    event.payload.residentAgentId === manifest.residentAgentId &&
    event.payload.taskId === manifest.taskId &&
    event.payload.runId === manifest.runId &&
    event.payload.runType === manifest.runType &&
    event.payload.providerMode === manifest.providerMode &&
    sameOrderedStrings(event.payload.sourceEventIds, manifest.sourceEventIds) &&
    event.payload.policyEventId === manifest.policyEventId &&
    event.payload.policyId === manifest.policyId &&
    event.payload.policyVersion === manifest.policyVersion &&
    event.payload.policyHash === manifest.policyHash &&
    event.payload.activeLocksHash === manifest.activeLocksHash &&
    event.payload.admittedBy === residentAgentId;
}

function admissionDto(event: MountedTaskAdmissionEvent): AgentMountedTaskAdmissionDto {
  return Object.freeze({
    schemaVersion: mountedTaskAdmissionSchemaVersion,
    state: "admitted" as const,
    admissionId: event.payload.admissionId,
    residentAgentId,
    taskId: event.payload.taskId,
    runId: event.payload.runId,
    providerMode: event.payload.providerMode,
    sourceEventIds: Object.freeze([...event.payload.sourceEventIds])
  });
}

async function assertCurrentAdmissionBinding(input: {
  readonly handle: LocalRuntimeHandle;
  readonly events: readonly KnowledgeEvent[];
  readonly authority: MountedTaskAuthority;
  readonly evidence?: readonly EvidenceBinding[] | undefined;
  readonly taskId: string;
  readonly runId: string;
  readonly providerMode: MountedEvidenceTriageProviderMode;
}): Promise<{
  readonly admission: MountedTaskAdmissionEvent;
  readonly manifest: MountedTaskExecutionInputManifest;
  readonly evidence: readonly EvidenceBinding[];
}> {
  await input.authority.revalidate();
  const admissions = admissionEventsFor(input.events, input.taskId, input.runId);
  if (admissions.length !== 1) {
    throw mountedConflict("Background execution requires one exact durable admission.");
  }
  const admission = admissions[0]!;
  const storedManifest = await readMountedTaskExecutionInputManifest(input.handle, admission);
  const evidence = input.evidence ?? exactEvidenceBindings(input.events, storedManifest.evidenceIds);
  const expectedManifest = buildMountedTaskExecutionInputManifest({
    authority: input.authority,
    taskId: input.taskId,
    runId: input.runId,
    providerMode: input.providerMode,
    evidence
  });
  const expectedHash = hashBytes(serializeMountedTaskExecutionInputManifest(expectedManifest));
  assertMountedTaskExecutionInputManifestEquality(storedManifest, expectedManifest, expectedHash);
  if (!admissionMatches(admission, expectedManifest, expectedHash)) {
    throw mountedConflict("Durable execution admission is stale relative to the current mounted authority.");
  }
  await verifyMountedEvidenceSourceBytes(input.authority, evidence);
  await input.authority.revalidate();
  return Object.freeze({ admission, manifest: storedManifest, evidence });
}

function buildMountedTaskExecutionInputManifest(input: {
  readonly authority: MountedTaskAuthority;
  readonly taskId: string;
  readonly runId: string;
  readonly providerMode: MountedEvidenceTriageProviderMode;
  readonly evidence: readonly EvidenceBinding[];
}): MountedTaskExecutionInputManifest {
  const parsed = mountedTaskExecutionInputManifestSchema.safeParse({
    schemaVersion: mountedTaskExecutionInputSchemaVersion,
    workspaceId: input.authority.workspaceId,
    workspaceManifestHash: input.authority.workspaceManifestHash,
    residentAgentId,
    taskId: input.taskId,
    runId: input.runId,
    runType: "evidence-triage",
    providerMode: input.providerMode,
    evidenceIds: input.evidence.map((binding) => binding.evidenceId),
    evidenceBindings: input.evidence.map((binding) => ({
      evidenceId: binding.evidenceId,
      evidenceEventId: binding.evidenceEventId,
      linkEventId: binding.linkEventId,
      contentHash: binding.contentHash,
      ...(binding.mediaType === undefined ? {} : { mediaType: binding.mediaType }),
      ...(binding.sizeBytes === undefined ? {} : { sizeBytes: binding.sizeBytes }),
      sourceCollectionId: binding.sourceCollectionId,
      importBatchId: binding.importBatchId,
      occurrenceIds: [...binding.occurrenceIds]
    })),
    sourceEventIds: [...sourceEventIdsFor(input.evidence)],
    policyEventId: input.authority.policyEventId,
    policyId: input.authority.policyId,
    policyVersion: input.authority.policyVersion,
    policyHash: input.authority.policyHash,
    activeLocksHash: input.authority.activeLocksHash
  });
  if (!parsed.success) {
    throw mountedConflict("Mounted task execution inputs are not valid for durable admission.");
  }
  return freezeMountedTaskExecutionInputManifest(parsed.data);
}

function serializeMountedTaskExecutionInputManifest(
  manifest: MountedTaskExecutionInputManifest
): Buffer {
  try {
    return Buffer.from(serializeContextPackPayload(manifest));
  } catch {
    throw mountedConflict("Mounted task execution inputs are not canonical secret-safe JSON.");
  }
}

function parseMountedTaskExecutionInputManifest(bytes: Buffer): MountedTaskExecutionInputManifest {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw mountedConflict("Mounted task admission manifest is not valid canonical JSON.");
  }
  const parsed = mountedTaskExecutionInputManifestSchema.safeParse(value);
  if (!parsed.success) {
    throw mountedConflict("Mounted task admission manifest does not match its strict execution-input contract.");
  }
  const manifest = freezeMountedTaskExecutionInputManifest(parsed.data);
  if (!bytes.equals(serializeMountedTaskExecutionInputManifest(manifest))) {
    throw mountedConflict("Mounted task admission manifest bytes are not canonical.");
  }
  return manifest;
}

function freezeMountedTaskExecutionInputManifest(
  manifest: ParsedMountedTaskExecutionInputManifest
): MountedTaskExecutionInputManifest {
  return Object.freeze({
    ...manifest,
    evidenceIds: Object.freeze([...manifest.evidenceIds]),
    evidenceBindings: Object.freeze(manifest.evidenceBindings.map((binding) => Object.freeze({
      ...binding,
      occurrenceIds: Object.freeze([...binding.occurrenceIds])
    }))),
    sourceEventIds: Object.freeze([...manifest.sourceEventIds])
  });
}

function mountedTaskExecutionInputStore(handle: LocalRuntimeHandle): FileBlobStore {
  const mounted = handle.mountedWorkspace;
  if (mounted === undefined) {
    throw mountedConflict("Mounted task admission storage is unavailable.");
  }
  return new FileBlobStore(join(
    mounted.paths.jobRoot,
    ...mountedTaskAdmissionManifestPathSegments
  ));
}

function requireCurrentMountedTaskAdmissionWorkspace(handle: LocalRuntimeHandle): void {
  const currentness = inspectPortableWorkspaceCurrentness(handle);
  if (!currentness.ok) {
    throw mountedConflict("The portable workspace is not current for mounted task admission.");
  }
}

async function storeMountedTaskExecutionInputManifest(input: {
  readonly handle: LocalRuntimeHandle;
  readonly authority: MountedTaskAuthority;
  readonly manifest: MountedTaskExecutionInputManifest;
  readonly bytes: Buffer;
  readonly expectedHash: ContentHash;
}): Promise<MountedTaskExecutionInputManifest> {
  await input.authority.revalidate();
  requireCurrentMountedTaskAdmissionWorkspace(input.handle);
  let storedHash: ContentHash;
  try {
    const stored = await mountedTaskExecutionInputStore(input.handle).put(input.bytes);
    storedHash = stored.contentHash;
  } catch {
    throw mountedConflict("Mounted task admission manifest could not be stored safely.");
  }
  requireCurrentMountedTaskAdmissionWorkspace(input.handle);
  await input.authority.revalidate();
  if (storedHash !== input.expectedHash) {
    throw mountedConflict("Mounted task admission manifest hash does not match its canonical bytes.");
  }
  const readback = await readMountedTaskExecutionInputBytes(input.handle, input.expectedHash);
  if (!readback.equals(input.bytes)) {
    throw mountedConflict("Mounted task admission manifest did not read back exactly.");
  }
  const parsed = parseMountedTaskExecutionInputManifest(readback);
  assertMountedTaskExecutionInputManifestEquality(parsed, input.manifest, input.expectedHash);
  return parsed;
}

async function readMountedTaskExecutionInputBytes(
  handle: LocalRuntimeHandle,
  manifestHash: ContentHash
): Promise<Buffer> {
  requireCurrentMountedTaskAdmissionWorkspace(handle);
  let bytes: Buffer;
  try {
    bytes = await mountedTaskExecutionInputStore(handle).get(manifestHash);
  } catch {
    throw mountedConflict("Mounted task admission manifest is missing or unreadable.");
  }
  requireCurrentMountedTaskAdmissionWorkspace(handle);
  if (hashBytes(bytes) !== manifestHash) {
    throw mountedConflict("Mounted task admission manifest hash readback failed.");
  }
  return bytes;
}

async function readMountedTaskExecutionInputManifest(
  handle: LocalRuntimeHandle,
  admission: MountedTaskAdmissionEvent
): Promise<MountedTaskExecutionInputManifest> {
  const manifestHash = requireContentHash(admission.payload.admissionManifestHash);
  const manifest = parseMountedTaskExecutionInputManifest(
    await readMountedTaskExecutionInputBytes(handle, manifestHash)
  );
  if (!admissionMatches(admission, manifest, manifestHash)) {
    throw mountedConflict("Mounted task admission event does not match its execution-input manifest.");
  }
  return manifest;
}

function assertMountedTaskExecutionInputManifestEquality(
  actual: MountedTaskExecutionInputManifest,
  expected: MountedTaskExecutionInputManifest,
  expectedHash: ContentHash
): void {
  const actualBytes = serializeMountedTaskExecutionInputManifest(actual);
  const expectedBytes = serializeMountedTaskExecutionInputManifest(expected);
  if (hashBytes(actualBytes) !== expectedHash || !actualBytes.equals(expectedBytes)) {
    throw mountedConflict("Mounted task admission manifest is stale relative to its exact execution inputs.");
  }
}

function sourceArtifactHashesForManifest(
  events: readonly KnowledgeEvent[],
  manifest: AuthorityBoundSpecialistHandoffManifest
): readonly ContentHash[] {
  const sourceEventIds = new Set(manifest.sourceEventIds);
  const hashes = events.filter((event): event is KnowledgeEventOf<"evidence.ingested"> =>
    event.type === "evidence.ingested" && sourceEventIds.has(event.id)
  ).map((event) => requireContentHash(event.payload.contentHash));
  if (hashes.length === 0 || hashes.some((hash) =>
    !manifest.contextPackRefs.some((ref) => (ref.artifactHashes ?? []).includes(hash))
  )) {
    throw mountedConflict("Mounted handoff source artifact bindings are incomplete.");
  }
  return uniqueHashes(hashes);
}

function evidenceTriageProviderParsePreview(input: {
  readonly taskId: string;
  readonly runId: string;
  readonly evidence: readonly EvidenceBinding[];
  readonly promptArtifactHash: ContentHash;
}): AgentToolPreview {
  return Object.freeze({
    schemaVersion: "agent-domain-preview.v1",
    summary: "Review a future provider parse request; no provider parse is executed by local evidence triage.",
    toolId: providerParseExecuteDescriptor.toolId,
    toolVersion: providerParseExecuteDescriptor.toolVersion,
    sideEffectClass: "external-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    inputSchemaId: providerParseExecuteDescriptor.inputSchemaId,
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId,
    evidenceBindings: input.evidence.map((binding) => Object.freeze({
      evidenceId: binding.evidenceId,
      evidenceEventId: binding.evidenceEventId,
      linkEventId: binding.linkEventId,
      contentHash: binding.contentHash
    })),
    relatedEventIds: sourceEventIdsFor(input.evidence),
    artifactHashes: uniqueHashes([
      ...input.evidence.map((binding) => binding.contentHash),
      input.promptArtifactHash
    ]),
    promptArtifactHash: input.promptArtifactHash
  });
}

function remoteProviderTransferPreview(input: {
  readonly taskId: string;
  readonly runId: string;
  readonly evidence: readonly EvidenceBinding[];
  readonly contextPacks: readonly { readonly ref: ContextPackRef }[];
  readonly promptArtifactHash: ContentHash;
}): AgentToolPreview {
  return Object.freeze({
    schemaVersion: "agent-provider-transfer-preview.v1",
    summary: "Transfer the exact mounted prompt bytes to a remote model provider after explicit approval.",
    scope: `mounted evidence triage run ${input.runId}`,
    estimatedEffect: "Remote provider receives the exact approved prompt bytes once.",
    taskId: input.taskId,
    runId: input.runId,
    residentAgentId,
    providerId: remoteProviderId,
    modelFamily: remoteModelFamily,
    contextBindings: input.contextPacks.map((pack) => ({
      contextPackId: pack.ref.contextPackId,
      contentHash: pack.ref.contentHash
    })),
    promptArtifactHash: input.promptArtifactHash,
    relatedEventIds: sourceEventIdsFor(input.evidence),
    artifactHashes: uniqueHashes([
      input.promptArtifactHash,
      ...input.contextPacks.map((pack) => pack.ref.contentHash as ContentHash)
    ])
  });
}

function latestRecordedHandoff(
  events: readonly KnowledgeEvent[],
  taskId: string,
  runId: string
): KnowledgeEventOf<"agent.specialist-handoff.recorded"> {
  const matches = events.filter((event): event is KnowledgeEventOf<"agent.specialist-handoff.recorded"> =>
    event.type === "agent.specialist-handoff.recorded" &&
    event.payload.taskId === taskId &&
    event.payload.runId === runId
  );
  if (matches.length !== 1) {
    throw mountedConflict("Mounted resident handoff is missing or ambiguous.");
  }
  return matches[0]!;
}

function contextBindingsFromRefs(refs: readonly ContextPackRef[]): readonly AgentMountedTaskContextBindingDto[] {
  return Object.freeze(refs.map((ref) => Object.freeze({
    contextPackId: ref.contextPackId,
    contentHash: ref.contentHash as ContentHash,
    sourceEventIds: Object.freeze([...(ref.sourceEventIds ?? ref.provenanceRefs).filter((value) => value.startsWith("evt_"))])
  })));
}

function mountedResidentPolicySnapshot(
  events: readonly KnowledgeEvent[],
  workspaceId: string
): MountedResidentPolicySnapshot {
  const candidates = events.filter((event) =>
    event.type === "agent.identity.initialized" && event.payload.residentAgentId === residentAgentId ||
    event.type === "agent.identity.updated" && event.payload.residentAgentId === residentAgentId &&
      (event.payload.policyId !== undefined || event.payload.allowedRunTypes !== undefined) ||
    event.type === "agent.policy.installed" && event.payload.residentAgentId === residentAgentId
  );
  const event = candidates.at(-1);
  if (event === undefined) {
    throw mountedConflict("Mounted resident policy provenance is unavailable.");
  }
  const eventIndex = events.findIndex((candidate) => candidate.id === event.id);
  const identity = buildAgentProjection(events.slice(0, eventIndex + 1)).identity;
  if (identity?.residentAgentId !== residentAgentId || identity.workspaceId !== workspaceId ||
    identity.policyId === undefined || identity.allowedRunTypes.length === 0) {
    throw mountedConflict("Mounted resident policy projection is incomplete.");
  }
  if (event.type === "agent.policy.installed" &&
    (event.context.actor.kind !== "human" || event.context.actor.id !== event.payload.installedBy)) {
    throw mountedConflict("Mounted resident policy installation lacks human provenance.");
  }
  if (event.type === "agent.identity.updated" && event.context.actor.kind !== "human") {
    throw mountedConflict("Mounted resident policy update lacks human provenance.");
  }
  if (event.type === "agent.identity.initialized" &&
    event.context.actor.id !== event.payload.initializedBy) {
    throw mountedConflict("Mounted resident policy initialization provenance is invalid.");
  }
  const policyVersion = event.type === "agent.policy.installed"
    ? event.payload.version
    : event.type === "agent.identity.updated"
      ? `agent-identity-policy-update.v${event.version}`
      : `agent-identity-policy-initialized.v${event.version}`;
  const allowedRunTypes = Object.freeze([...identity.allowedRunTypes]);
  return Object.freeze({
    eventId: event.id,
    policyId: identity.policyId,
    policyVersion,
    policyHash: hashCanonicalSpecialistHandoffJson({
      schemaVersion: "agent-mounted-resident-policy-snapshot.v1",
      workspaceId,
      residentAgentId,
      policyEventId: event.id,
      policyEventType: event.type,
      policyEventSequence: event.sequence,
      policyId: identity.policyId,
      policyVersion,
      allowedRunTypes,
      eventPayload: event.payload
    }),
    allowedRunTypes
  });
}

function activeLocksHash(projection: ReturnType<typeof buildAgentProjection>): ContentHash {
  return hashCanonicalSpecialistHandoffJson({
    schemaVersion: "agent-mounted-task-active-locks.v1",
    activeLocks: [...projection.locks.values()]
      .filter((lock) => lock.state === "active")
      .map((lock) => ({ lockId: lock.lockId, kind: lock.kind }))
      .sort((left, right) => left.lockId.localeCompare(right.lockId))
  });
}

function sourceEventIdsFor(evidence: readonly EvidenceBinding[]): readonly string[] {
  return Object.freeze(evidence.flatMap((binding) => [binding.evidenceEventId, binding.linkEventId]));
}

function fakeProviderReadinessCard(): ProviderSetupCard {
  return {
    providerId: fakeProviderId,
    label: "Fake Local Model Provider",
    backendKind: "local-engine" as const,
    capabilitySummary: ["text"],
    credentialKindSummary: ["local-no-secret"],
    state: "works-locally" as const,
    requiredApprovalClass: "none" as const,
    credentialHealth: "not-required" as const,
    dataHandlingPosture: "local-only" as const,
    safeActionIds: ["action_use_local_provider"]
  };
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

function agentEventContext(now: () => string, correlationId: string, causationId?: string) {
  return {
    actor: residentActor,
    occurredAt: now(),
    correlationId,
    ...(causationId === undefined ? {} : { causationId }),
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}

const residentActor: ActorRef = Object.freeze({
  id: residentAgentId,
  kind: "agent",
  label: "Resident Cestus Agent"
});

function parseJson(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw mountedConflict("Mounted handoff bytes are not valid canonical JSON.");
  }
}

function plainRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function isContentHash(value: string): value is ContentHash {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function hashBytes(bytes: Uint8Array): ContentHash {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function uniqueHashes(values: readonly ContentHash[]): readonly ContentHash[] {
  return Object.freeze([...new Set(values)]);
}

function requireContentHash(value: string | undefined): ContentHash {
  if (value === undefined || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw mountedConflict("Mounted resident task contains an invalid content hash binding.");
  }
  return value as ContentHash;
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function mountedConflict(message: string): MountedResidentTaskError {
  return new MountedResidentTaskError(409, message, [
    "remount the current portable workspace and retry",
    "inspect resident task provenance without invoking a provider"
  ]);
}
