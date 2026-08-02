import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildAgentProjection,
  buildSpecialistHandoffProjection,
  buildTaskAttemptId,
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
import { mountPortableWorkspace, type MountedPortableWorkspace } from "../../workspace/src/index.js";
import { createMountedPromptArtifactStore } from "./mounted-prompt-artifact-store.js";
import {
  captureFactoryIssuedMountedRuntime,
  inspectFactoryIssuedMountedRuntimeCapture,
  type LocalRuntimeHandle
} from "./runtime-factory.js";
import type { LocalAgentRuntimeFactory } from "./agent-runtime-factory.js";
import { createWakeSupervisorRuntime, type WakeSupervisorRuntime } from "./wake-supervisor-runtime.js";
import { issueMountedArtifactAuthorityOperationForFactory } from "./mounted-artifact-authority-operation.js";
import {
  consumeMountedHandoffAuthorityController,
  createPortableMountedAgentArtifactStoreProducer,
  type FactoryPortableMountedAgentHandoffProducerResultV1
} from "./portable-mounted-agent-artifact-stores.js";

const mountedTaskSchemaVersion = "agent-mounted-task-result.v1" as const;
const residentAgentId = "agent_default" as const;
const fakeProviderId = "provider_fake_local" as const;
const fakeModelFamily = "fake-local" as const;
const remoteProviderId = "provider_remote_gated" as const;
const remoteModelFamily = "remote-model" as const;

type LocalAgentRuntime = ReturnType<LocalAgentRuntimeFactory>;
type ContentHash = `sha256:${string}`;

export type MountedEvidenceTriageProviderMode = "local-fake" | "remote-gated";

export interface RunMountedEvidenceTriageTaskInput {
  readonly handle: LocalRuntimeHandle;
  readonly runtime: LocalAgentRuntime;
  readonly now: () => string;
  readonly taskId: string;
  readonly runId: string;
  readonly evidenceIds: readonly string[];
  readonly providerMode: MountedEvidenceTriageProviderMode;
}

export interface ReconstructMountedEvidenceTriageTaskInput {
  readonly handle: LocalRuntimeHandle;
  readonly taskId: string;
  readonly runId: string;
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
  readonly status: 400 | 404 | 409;
  readonly safeMessage: string;
  readonly allowedRepairActions: readonly string[];

  constructor(
    status: 400 | 404 | 409,
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
  readonly controller: FactoryPortableMountedAgentHandoffProducerResultV1["controller"];
  stop(): Promise<void>;
}

export async function runMountedEvidenceTriageTask(
  input: RunMountedEvidenceTriageTaskInput
): Promise<AgentMountedTaskResultDto> {
  const operationTimestamp = input.now();
  const operationNow = () => operationTimestamp;
  const authority = await captureMountedTaskAuthority(input.handle);
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
  const existingRun = projectionBeforeRun.runs.get(input.runId);
  if (existingRun !== undefined) {
    if (existingRun.taskId === input.taskId && existingRun.state === "completed" &&
      task.status === "completed" && input.providerMode === "local-fake" &&
      sameOrderedStrings(existingRun.sourceEventIds, sourceEventIdsFor(evidence))) {
      return await reconstructMountedEvidenceTriageTask({
        handle: input.handle,
        taskId: input.taskId,
        runId: input.runId
      });
    }
    if (existingRun.taskId === input.taskId && existingRun.state === "running" &&
      task.status === "waiting-for-approval" && input.providerMode === "remote-gated" &&
      sameOrderedStrings(existingRun.sourceEventIds, sourceEventIdsFor(evidence))) {
      return await reconstructMountedWaitingEvidenceTriageTask({
        handle: input.handle,
        taskId: input.taskId,
        runId: input.runId
      });
    }
    throw mountedConflict("Mounted resident run already exists and is not exactly replayable.");
  }
  const priorTaskRuns = [...projectionBeforeRun.runs.values()].filter((run) => run.taskId === input.taskId);
  const priorTaskAttempts = [...projectionBeforeRun.taskOrchestrator.attempts.values()]
    .filter((attempt) => attempt.taskId === input.taskId);
  if (task.status !== "queued" || priorTaskRuns.length !== 0 || priorTaskAttempts.length !== 0) {
    throw mountedConflict("Mounted resident task is not an untouched queued evidence-triage task.");
  }
  await verifyMountedEvidenceSourceBytes(authority, evidence);
  const handoffAuthority = input.providerMode === "local-fake"
    ? await acquireMountedTaskHandoffAuthority({
        handle: input.handle,
        authority,
        taskId: input.taskId,
        runId: input.runId,
        now: operationNow
      })
    : undefined;
  try {
    await authority.revalidate();
    const started = await input.runtime.startRun({
      runId: input.runId,
      taskId: input.taskId,
      runType: "evidence-triage",
      startedBy: residentAgentId,
      sourceEventIds: sourceEventIdsFor(evidence),
      inputArtifactHashes: uniqueHashes(evidence.map((binding) => binding.contentHash)),
      scope: { kind: "workspace", refs: [authority.workspaceId] }
    });
    await authority.revalidate();
    if (!started.ok) {
      throw mountedConflict("Mounted resident run could not be started safely.");
    }

    const contextEvents = Object.freeze(await input.handle.ledger.readAll());
    const contextRegistry = createMountedEvidenceTriageContextRegistry({
      authority,
      taskId: input.taskId,
      evidence,
      events: contextEvents,
      now: operationNow
    });
    const scope = Object.freeze({ kind: "task", refs: Object.freeze([input.taskId]) });
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
    const promptStore = await createMountedPromptArtifactStore({ handle: input.handle });
    await promptStore.put(promptArtifact);
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
    const workspaceManifestArtifact = await stores.manifest.put(
      await authority.readWorkspaceManifestArtifact()
    );
    if (workspaceManifestArtifact.contentHash !== authority.workspaceManifestHash) {
      throw mountedConflict("Mounted workspace manifest provenance could not be stored exactly.");
    }
    await seedContextProvenanceArtifacts(stores.manifest, contextPacks, contextEvents);
    await authority.revalidate();
    const workflow = await runEvidenceTriageWorkflow({
      ledger: revalidatingMountedLedger(input.handle.ledger, authority),
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
      runtime: revalidatingMountedRuntime(input.runtime, authority),
      providerReadiness: { cards: [fakeProviderReadinessCard()] },
      mountedPromptReadbackWitness: promptReadback.witness,
      derivativeStore: stores.material,
      handoffMaterialStore: stores.material,
      handoffManifestStore: stores.manifest,
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
      controller: handoffAuthority.controller,
      taskId: input.taskId,
      runId: input.runId,
      readback: workflow.readback
    });

    const recorded = latestRecordedHandoff(await input.handle.ledger.readAll(), input.taskId, input.runId);
    const memoryId = `mem_${input.runId}_handoff`;
    await authority.revalidate();
    const memory = await input.runtime.recordMemory({
      memoryId,
      scope: "task",
      memoryKind: "agent-observation",
      summary: "Mounted evidence triage handoff is ready for local review.",
      sourceEventIds: uniqueStrings([...recorded.payload.sourceEventIds, recorded.id]),
      artifactHashes: uniqueHashes([
        authority.workspaceManifestHash,
        requireContentHash(recorded.payload.handoffManifestHash),
        requireContentHash(recorded.payload.promptArtifactHash),
        ...recorded.payload.outputArtifactHashes.map(requireContentHash)
      ]),
      confidence: 1
    });
    await authority.revalidate();
    if (!memory.ok) {
      throw mountedConflict("Mounted evidence triage memory could not be recorded safely.");
    }
    return await reconstructMountedEvidenceTriageTask({
      handle: input.handle,
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
}): Promise<MountedTaskHandoffAuthority> {
  await input.authority.revalidate();
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
    const operation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
    const prepared = await createPortableMountedAgentArtifactStoreProducer(operation).bind({
      taskId: input.taskId,
      attemptId: buildTaskAttemptId({
        taskId: input.taskId,
        runType: "evidence-triage",
        retryGeneration: 0
      }),
      approvedRunId: input.runId,
      runType: "evidence-triage",
      retryGeneration: 0
    });
    await input.authority.revalidate();
    const issuedWakeRuntime = wakeRuntime;
    return Object.freeze({
      binding: prepared.binding,
      controller: prepared.controller,
      stop: async () => await issuedWakeRuntime.stop()
    });
  } catch {
    await wakeRuntime?.stop().catch(() => undefined);
    throw mountedConflict("A current mounted handoff authority could not be issued for this task.");
  }
}

async function consumeMountedTaskHandoffAuthority(input: {
  readonly handle: LocalRuntimeHandle;
  readonly controller: MountedTaskHandoffAuthority["controller"];
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
    await consumeMountedHandoffAuthorityController(input.controller, [
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

export async function reconstructMountedEvidenceTriageTask(
  input: ReconstructMountedEvidenceTriageTaskInput
): Promise<AgentMountedTaskResultDto> {
  const authority = await captureMountedTaskAuthority(input.handle);
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
  const stores = await authority.handoffStores({ sourceArtifactHashes });
  const handoffProjection = await buildSpecialistHandoffProjection({
    events,
    manifestReader: stores.reader,
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
    const bytes = await stores.reader.get(artifactHash);
    if (hashBytes(bytes) !== artifactHash) {
      throw mountedConflict("Mounted derivative artifact readback did not match its ledger hash.");
    }
  }
  const promptStore = await createMountedPromptArtifactStore({ handle: input.handle });
  const authoritativeContextPacks = await rehydrateMountedContextPacks(stores.reader, manifest.contextPackRefs);
  const prompt = await promptStore.read({
    inputArtifactHash: promptArtifactHash,
    authoritativeResolvedContextPacks: authoritativeContextPacks
  });
  if (prompt.envelope.manifest.inputArtifactHash !== recorded.payload.promptArtifactHash) {
    throw mountedConflict("Mounted prompt readback did not match the durable handoff.");
  }
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
  if (memory === undefined || memory.scope !== "task" ||
    !expectedMemoryArtifacts.every((artifactHash) => memory.artifactHashes.includes(artifactHash)) ||
    workspaceManifestArtifacts.length !== 1 ||
    workspaceManifestArtifacts[0] !== authority.workspaceManifestHash ||
    !memory.sourceEventIds.includes(recorded.id)) {
    throw mountedConflict("Mounted task completion memory does not match the durable handoff.");
  }
  const workspaceManifestBytes = await stores.reader.get(authority.workspaceManifestHash);
  if (hashBytes(workspaceManifestBytes) !== authority.workspaceManifestHash) {
    throw mountedConflict("Mounted workspace manifest provenance did not read back exactly.");
  }
  await authority.revalidate();
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
    memoryId
  });
}

async function reconstructMountedWaitingEvidenceTriageTask(
  input: ReconstructMountedEvidenceTriageTaskInput
): Promise<AgentMountedTaskResultDto> {
  const authority = await captureMountedTaskAuthority(input.handle);
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

async function captureMountedTaskAuthority(handle: LocalRuntimeHandle): Promise<MountedTaskAuthority> {
  let inspected: ReturnType<typeof inspectFactoryIssuedMountedRuntimeCapture>;
  let capturedManifestBytes: Buffer;
  let capturedManifestHash: ContentHash;
  let capturedActiveLocksHash: ContentHash;
  let capturedPolicy: MountedResidentPolicySnapshot;
  try {
    inspected = inspectFactoryIssuedMountedRuntimeCapture(captureFactoryIssuedMountedRuntime(handle));
    capturedManifestBytes = await readFile(inspected.mountedWorkspace.manifestPath);
    capturedManifestHash = hashBytes(capturedManifestBytes);
    const events = await inspected.ledger.readAll();
    const projection = buildAgentProjection(events);
    capturedPolicy = mountedResidentPolicySnapshot(events, inspected.mountedWorkspace.workspaceId);
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
  const capturedWorkspace = inspected.mountedWorkspace;
  const revalidate = async (): Promise<void> => {
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
    const events = await inspected.ledger.readAll();
    const projection = buildAgentProjection(events);
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

async function readMountedStoreHash(
  contentHash: ContentHash,
  readers: readonly MountedStoreReader[],
  revalidate: () => Promise<void>
): Promise<Buffer> {
  await revalidate();
  for (const reader of readers) {
    if (reader.allowedHashes !== undefined && !reader.allowedHashes.has(contentHash)) continue;
    try {
      const bytes = await reader.store.get(contentHash);
      if (hashBytes(bytes) !== contentHash) {
        throw mountedConflict("Mounted handoff artifact bytes do not match their content hash.");
      }
      await revalidate();
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
    await input.authority.revalidate();
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
        await input.authority.revalidate();
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
        await input.authority.revalidate();
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
        await input.authority.revalidate();
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
    await input.authority.revalidate();
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
  ledger: EventLedger,
  authority: MountedTaskAuthority
): EventLedger {
  return Object.freeze({
    async append(event: AppendableKnowledgeEvent, options?: AppendOptions) {
      await authority.revalidate();
      const appended = await ledger.append(event, options);
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
  authority: MountedTaskAuthority
) {
  return Object.freeze({
    async invokeModel(command: Parameters<LocalAgentRuntime["invokeModel"]>[0]) {
      await authority.revalidate();
      const result = await runtime.invokeModel(command);
      await authority.revalidate();
      return result;
    }
  });
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
