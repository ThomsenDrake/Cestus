import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { serializeContextPackPayload, type ContextPackRef } from "./context-packs.js";
import {
  buildSpecialistHandoffMaterial,
  parseSpecialistHandoffMaterial,
  type SpecialistHandoffMaterial
} from "./specialist-handoff-manifest.js";
import type { KnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { validateProductionSpecialistProviderOutput } from "./production-specialist-output-contracts.js";
import type { PromptArtifactEnvelope } from "./prompt-artifacts.js";
import {
  parseLegacySpecialistWorkflowHandoff,
  type LegacySpecialistWorkflowHandoffDto,
  type SpecialistWorkflowHandoffDto,
  type SpecialistWorkflowOutputArtifactDto
} from "./specialist-handoffs.js";
import {
  appendSpecialistFailure,
  appendSpecialistFinalOutputStep,
  finalizeSpecialistRunAfterHandoff,
  governanceLockIsActive,
  invokeSpecialistModel,
  prepareSpecialistRun,
  recordSpecialistHandoff,
  writeSpecialistDerivativeArtifact,
  type PreparedSpecialistRun,
  type SpecialistHandoffManifestStore,
  type SpecialistRunnerBaseInput
} from "./specialist-runner-kernel.js";
import { taskOrchestrationStreamId } from "./task-orchestrator-events.js";

export interface RunInvestigationPlannerWorkflowInput extends SpecialistRunnerBaseInput {
  readonly investigationId?: string;
  /** Exact mounted artifact capability for durable handoff dependencies and outputs. */
  readonly handoffStore?: SpecialistHandoffManifestStore;
}

export interface InvestigationPlannerWorkflowDiagnostic {
  readonly category: "source-stale" | "artifact-missing";
  readonly safeSummary: string;
}

export type InvestigationPlannerWorkflowHandoff =
  | (LegacySpecialistWorkflowHandoffDto & { readonly lifecycle: "no-output" | "output-persisted" })
  | (SpecialistWorkflowHandoffDto & { readonly lifecycle: "handoff-recorded" });

export interface RunInvestigationPlannerWorkflowResult {
  readonly handoff: InvestigationPlannerWorkflowHandoff;
  readonly diagnostics: readonly InvestigationPlannerWorkflowDiagnostic[];
  readonly eventIds: readonly string[];
}

export async function runInvestigationPlannerWorkflow(
  input: RunInvestigationPlannerWorkflowInput
): Promise<RunInvestigationPlannerWorkflowResult> {
  if (input.investigationId === undefined) {
    return blockedHandoff(input, "Investigation scope is required before planning can begin.");
  }
  if (!(await hasAuthoritativeInvestigationPlannerAttempt(input))) {
    return blockedHandoff(
      input,
      "Investigation planner orchestration attempt is missing, stale, or does not bind the exact resident task and run."
    );
  }
  if (input.handoffStore !== undefined) {
    const resumed = await resumeDurableFinalOutput(input, input.handoffStore);
    if (resumed !== undefined) return resumed;
  }
  const prepared = await prepareSpecialistRun(input, "investigation-planner");
  if (hasStaleEvidence(prepared.contextPackRefs)) {
    return blockedHandoff(
      input,
      "Evidence is stale and must be refreshed before investigation planning can continue.",
      prepared.contextPackRefs,
      [{
        category: "source-stale",
        safeSummary: "Evidence context indicates a stale source and no advisory handoff was recorded."
      }]
    );
  }
  if (governanceLockIsActive(prepared.contextPackRefs)) {
    return blockedHandoff(input, "Active governance lock blocks investigation planning.", prepared.contextPackRefs);
  }
  const handoffStore = requireHandoffStore(input);
  const sourceEventIds = await verifiedSourceEventIds(input, prepared.contextPackRefs);
  if (sourceEventIds === undefined) {
    return blockedHandoff(
      input,
      "Evidence source bindings are stale and must be refreshed before investigation planning can continue.",
      prepared.contextPackRefs,
      [{
        category: "source-stale",
        safeSummary: "Evidence source bindings are not current and no advisory handoff was recorded."
      }]
    );
  }
  try {
    await persistHandoffDependencies(handoffStore, prepared);
  } catch {
    return blockedHandoff(
      input,
      "Investigation planning could not verify durable handoff dependencies.",
      prepared.contextPackRefs,
      [{
        category: "artifact-missing",
        safeSummary: "Durable context or prompt artifact readback was unavailable and no advisory handoff was recorded."
      }]
    );
  }

  const invocationId = `inv_${input.runId}_investigation_planner`;
  const invocation = await invokeSpecialistModel(input, prepared, invocationId);
  const output = parseModelOutput(invocation.outputText);
  if (output === undefined) {
    return await failedModelOutputResult(input, prepared, handoffStore, sourceEventIds, invocation.eventIds);
  }
  const artifactPayload = {
    schemaVersion: "investigation-planner-handoff.v1",
    runId: input.runId,
    taskId: input.taskId,
    investigationId: input.investigationId,
    objectiveRefs: [...output.objectiveRefs],
    gapIds: [...output.gapIds],
    taskCandidates: output.taskCandidates.map((candidate) => ({
      taskId: candidate.taskId,
      summary: candidate.summary,
      priorityRationale: candidate.priorityRationale,
      linkedRefs: [...candidate.linkedRefs],
      approvalRequirements: [...candidate.approvalRequirements]
    })),
    prrDraftCandidates: [...output.prrDraftCandidates],
    sourceEventIds: [...sourceEventIds],
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash
  };
  const outputArtifacts: SpecialistWorkflowOutputArtifactDto[] = [];
  let planArtifact: Awaited<ReturnType<typeof writeSpecialistDerivativeArtifact>>;
  let tasksArtifact: Awaited<ReturnType<typeof writeSpecialistDerivativeArtifact>>;
  let draftsArtifact: Awaited<ReturnType<typeof writeSpecialistDerivativeArtifact>>;
  try {
    planArtifact = await writeSpecialistDerivativeArtifact({
      derivativeStore: handoffStore,
      artifactKind: "investigation-plan-artifact",
      payload: {
        ...artifactPayload,
        artifactKind: "investigation-plan-artifact",
        planSummary: output.planSummary
      }
    });
    outputArtifacts.push(investigationOutputArtifact(
      input.runId,
      "investigation-plan-artifact",
      planArtifact.artifactHash
    ));
    tasksArtifact = await writeSpecialistDerivativeArtifact({
      derivativeStore: handoffStore,
      artifactKind: "task-suggestion-bundle",
      payload: {
        ...artifactPayload,
        artifactKind: "task-suggestion-bundle",
        planSummary: output.planSummary
      }
    });
    outputArtifacts.push(investigationOutputArtifact(
      input.runId,
      "task-suggestion-bundle",
      tasksArtifact.artifactHash
    ));
    draftsArtifact = await writeSpecialistDerivativeArtifact({
      derivativeStore: handoffStore,
      artifactKind: "draft-prr-candidate-bundle",
      payload: {
        ...artifactPayload,
        artifactKind: "draft-prr-candidate-bundle",
        planSummary: output.planSummary
      }
    });
    outputArtifacts.push(investigationOutputArtifact(
      input.runId,
      "draft-prr-candidate-bundle",
      draftsArtifact.artifactHash
    ));
  } catch {
    return await failedDerivativeArtifactResult(
      input,
      prepared,
      handoffStore,
      sourceEventIds,
      invocation.eventIds,
      outputArtifacts
    );
  }
  const material = buildSpecialistHandoffMaterial({
    status: "ready-for-review",
    safeSummary: "Investigation plan, local task suggestions, and PRR draft candidates are ready for review.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash as `sha256:${string}`,
    outputArtifacts,
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_review`,
      label: "Review the investigation planning artifacts",
      kind: "review",
      effect: "none",
      artifactId: `artifact_${input.runId}_plan`
    }],
    sourceEventIds,
    relatedEventIds: [...invocation.eventIds]
  });
  return await recordDurableHandoff({ input, handoffStore, material, eventIds: invocation.eventIds });
}

async function hasAuthoritativeInvestigationPlannerAttempt(
  input: RunInvestigationPlannerWorkflowInput
): Promise<boolean> {
  const runStream = await input.ledger.readStream(`agent_run_${input.runId}`);
  const started = runStream.filter((event): event is KnowledgeEventOf<"agent.specialist-run.started"> =>
    event.type === "agent.specialist-run.started" &&
    event.payload.runId === input.runId &&
    event.payload.residentAgentId === "agent_default"
  );
  if (
    started.length !== 1 ||
    started[0]!.payload.runType !== "investigation-planner" ||
    started[0]!.payload.taskId !== input.taskId
  ) {
    return false;
  }

  const orchestration = await input.ledger.readStream(
    taskOrchestrationStreamId(input.taskId, "investigation-planner")
  );
  const checkpoints = orchestration.filter((event): event is KnowledgeEventOf<"agent.task.orchestration.checkpointed"> =>
    event.type === "agent.task.orchestration.checkpointed" &&
    event.payload.taskId === input.taskId &&
    event.payload.runType === "investigation-planner" &&
    event.payload.checkpointKind === "runner-dispatching" &&
    event.payload.runId === input.runId &&
    event.payload.attemptId.length > 0 &&
    Number.isInteger(event.payload.retryGeneration) &&
    event.payload.retryGeneration >= 0 &&
    Number.isInteger(event.payload.leaseClaimGeneration) &&
    event.payload.leaseClaimGeneration > 0
  );
  if (checkpoints.length !== 1) return false;
  const checkpoint = checkpoints[0]!;
  const claims = orchestration.filter((event): event is KnowledgeEventOf<"agent.task.orchestration.claimed"> =>
    event.type === "agent.task.orchestration.claimed" &&
    event.payload.taskId === input.taskId &&
    event.payload.runType === "investigation-planner" &&
    event.payload.attemptId === checkpoint.payload.attemptId &&
    event.payload.retryGeneration === checkpoint.payload.retryGeneration &&
    event.payload.leaseClaimGeneration === checkpoint.payload.leaseClaimGeneration
  );
  if (
    claims.length !== 1 ||
    checkpoint.context.causationId !== claims[0]!.id ||
    claims[0]!.sequence >= checkpoint.sequence
  ) {
    return false;
  }
  return !orchestration.some((event): event is KnowledgeEventOf<"agent.task.orchestration.released"> =>
    event.type === "agent.task.orchestration.released" &&
    event.payload.taskId === input.taskId &&
    event.payload.runType === "investigation-planner" &&
    event.payload.attemptId === checkpoint.payload.attemptId &&
    event.payload.retryGeneration === checkpoint.payload.retryGeneration &&
    event.payload.leaseClaimGeneration === checkpoint.payload.leaseClaimGeneration &&
    event.payload.claimEventId === claims[0]!.id
  );
}

async function resumeDurableFinalOutput(
  input: RunInvestigationPlannerWorkflowInput,
  handoffStore: SpecialistHandoffManifestStore
): Promise<RunInvestigationPlannerWorkflowResult | undefined> {
  const stream = await input.ledger.readStream(`agent_run_${input.runId}`);
  const finalOutputs = stream.filter((event): event is KnowledgeEventOf<"agent.specialist-run.step.recorded"> =>
    event.type === "agent.specialist-run.step.recorded" &&
    event.payload.runId === input.runId &&
    event.payload.stepKind === "final-output"
  );
  if (finalOutputs.length === 0) return undefined;
  if (finalOutputs.length !== 1) {
    return blockedHandoff(input, "A unique durable final-output step is required before investigation handoff recovery.");
  }
  const finalOutput = finalOutputs[0]!;
  if (!isExactInvestigationPlannerRecovery(stream, input)) {
    return blockedHandoff(
      input,
      "Recovered final output does not belong to the exact investigation planner specialist run."
    );
  }
  const persisted = await readOutputPersistedRecovery(input, handoffStore, finalOutput);
  if (persisted === undefined) {
    return blockedHandoff(input, "Recovered final output cannot be read back as a durable investigation planner handoff.");
  }
  let recorded: Awaited<ReturnType<typeof recordSpecialistHandoff>>;
  try {
    recorded = await recordSpecialistHandoff({
      ledger: input.ledger,
      manifestStore: handoffStore,
      actor: input.actor,
      now: input.now,
      runId: input.runId,
      taskId: input.taskId
    });
  } catch {
    return persisted;
  }
  if (recorded.manifest.finalOutputEventId !== finalOutput.id) {
    return blockedHandoff(input, "Recovered investigation handoff did not read back the exact durable final-output event.");
  }
  try {
    const finalized = await finalizeSpecialistRunAfterHandoff({
      ledger: input.ledger,
      actor: input.actor,
      now: input.now,
      recorded
    });
    return Object.freeze({
      handoff: Object.freeze({ ...recorded.handoff, lifecycle: "handoff-recorded" as const }),
      diagnostics: Object.freeze([]),
      eventIds: Object.freeze([finalOutput.id, recorded.prepared.id, recorded.recorded.id, finalized.terminal.id])
    });
  } catch {
    return Object.freeze({
      handoff: Object.freeze({ ...recorded.handoff, lifecycle: "handoff-recorded" as const }),
      diagnostics: Object.freeze([Object.freeze({
        category: "artifact-missing" as const,
        safeSummary: "The durable handoff was recovered, but terminal run finalization must be retried."
      })]),
      eventIds: Object.freeze([finalOutput.id, recorded.prepared.id, recorded.recorded.id])
    });
  }
}

function isExactInvestigationPlannerRecovery(
  stream: readonly KnowledgeEvent[],
  input: RunInvestigationPlannerWorkflowInput
): boolean {
  const started = stream.filter((event): event is KnowledgeEventOf<"agent.specialist-run.started"> =>
    event.type === "agent.specialist-run.started" &&
    event.payload.runId === input.runId &&
    event.payload.residentAgentId === "agent_default"
  );
  return started.length === 1 &&
    started[0]!.payload.runType === "investigation-planner" &&
    started[0]!.payload.taskId === input.taskId;
}

async function readOutputPersistedRecovery(
  input: RunInvestigationPlannerWorkflowInput,
  handoffStore: SpecialistHandoffManifestStore,
  finalOutput: KnowledgeEventOf<"agent.specialist-run.step.recorded">
): Promise<RunInvestigationPlannerWorkflowResult | undefined> {
  const materialHash = finalOutput.payload.handoffMaterialArtifactHash;
  if (materialHash === undefined) return undefined;
  try {
    const bytes = await handoffStore.get(materialHash as `sha256:${string}`);
    if (!Buffer.isBuffer(bytes) || hashBytes(bytes) !== materialHash) return undefined;
    const material = parseSpecialistHandoffMaterial(JSON.parse(bytes.toString("utf8")));
    if (
      finalOutput.payload.stepId !== `step_${input.runId}_final_output` ||
      finalOutput.payload.stepKind !== "final-output" ||
      finalOutput.payload.stepSchemaId !== "investigation-planner-handoff.v1" ||
      finalOutput.payload.idempotencyKey !==
        `specialist-final-output:${input.runId}:${input.taskId}:investigation-planner:${material.status}:${materialHash}`
    ) {
      return undefined;
    }
    return outputPersistedResult({
      input,
      handoffStore,
      material,
      eventIds: material.relatedEventIds
    }, finalOutput.id);
  } catch {
    return undefined;
  }
}

function blockedHandoff(
  input: RunInvestigationPlannerWorkflowInput,
  summary: string,
  contextPackRefs: readonly import("./context-packs.js").ContextPackRef[] = [],
  diagnostics: readonly InvestigationPlannerWorkflowDiagnostic[] = []
): RunInvestigationPlannerWorkflowResult {
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1", runType: "investigation-planner", runId: input.runId, taskId: input.taskId,
    residentAgentId: "agent_default", generatedAt: input.now(), status: "blocked", safeSummary: summary,
    contextPackRefs, outputArtifacts: [], toolRequestIds: [], approvalRequirements: [],
    nextSafeActions: [{ actionId: `action_${input.runId}_inspect`, label: "Inspect investigation scope and governance status", kind: "inspect", effect: "none" }]
  });
  return resultWithLegacyHandoff(handoff, [], diagnostics);
}

function hasStaleEvidence(contextPackRefs: readonly import("./context-packs.js").ContextPackRef[]): boolean {
  return contextPackRefs.some((ref) =>
    ref.contextPackId === "evidence-summary.v1" &&
    (ref.stalenessInputs ?? []).some((input) => /^(?:source-)?stale(?:-source)?$/i.test(input.kind))
  );
}

function resultWithLegacyHandoff(
  handoff: LegacySpecialistWorkflowHandoffDto,
  eventIds: readonly string[],
  diagnostics: readonly InvestigationPlannerWorkflowDiagnostic[] = [],
  lifecycle: "no-output" | "output-persisted" = "no-output"
): RunInvestigationPlannerWorkflowResult {
  return Object.freeze({
    handoff: Object.freeze({ ...handoff, lifecycle }),
    diagnostics: Object.freeze(diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic }))),
    eventIds: Object.freeze([...eventIds])
  });
}

function requireHandoffStore(input: RunInvestigationPlannerWorkflowInput): SpecialistHandoffManifestStore {
  const store = input.handoffStore;
  if (store === undefined || typeof store.put !== "function" || typeof store.get !== "function") {
    throw new Error("A durable investigation handoff store is required before model invocation.");
  }
  return store;
}

async function verifiedSourceEventIds(
  input: RunInvestigationPlannerWorkflowInput,
  contextPackRefs: readonly ContextPackRef[]
): Promise<readonly string[] | undefined> {
  const sourceEventIds = uniqueStrings(contextPackRefs.flatMap((ref) => ref.sourceEventIds ?? []));
  if (sourceEventIds.length === 0) return undefined;
  const eventIds = new Set((await input.ledger.readAll()).map((event) => event.id));
  return sourceEventIds.every((eventId) => eventIds.has(eventId)) ? sourceEventIds : undefined;
}

async function persistHandoffDependencies(
  store: SpecialistHandoffManifestStore,
  prepared: PreparedSpecialistRun
): Promise<void> {
  const resolvedContextPacks = prepared.promptArtifact.resolvedContextPacks;
  if (resolvedContextPacks === undefined || resolvedContextPacks.length !== prepared.contextPackRefs.length) {
    throw new Error("Durable investigation handoff requires exact resolved context packs.");
  }
  for (const resolved of resolvedContextPacks) {
    const matchingRef = prepared.contextPackRefs.find((ref) =>
      ref.contextPackId === resolved.ref.contextPackId && ref.contentHash === resolved.ref.contentHash
    );
    if (matchingRef === undefined) {
      throw new Error("Resolved context pack does not match the durable handoff binding.");
    }
    await writeAndReadExact(store, resolved.ref.contentHash as `sha256:${string}`, Buffer.from(serializeContextPackPayload(resolved.payload)));
  }
  for (const artifactHash of prepared.contextPackRefs.flatMap((ref) => ref.artifactHashes ?? [])) {
    await readAndVerifyExisting(store, artifactHash as `sha256:${string}`);
  }
  await writeAndReadExact(
    store,
    prepared.promptArtifact.manifest.inputArtifactHash as `sha256:${string}`,
    canonicalPromptArtifactBytes(prepared.promptArtifact)
  );
}

async function writeAndReadExact(
  store: SpecialistHandoffManifestStore,
  expectedHash: `sha256:${string}`,
  bytes: Buffer
): Promise<void> {
  const stored = await store.put(bytes);
  if (stored.contentHash !== expectedHash || stored.sizeBytes !== bytes.byteLength) {
    throw new Error("Durable investigation handoff dependency store returned a mismatched receipt.");
  }
  const readback = await store.get(expectedHash);
  if (!Buffer.isBuffer(readback) || !readback.equals(bytes)) {
    throw new Error("Durable investigation handoff dependency readback did not match exact bytes.");
  }
}

async function readAndVerifyExisting(store: SpecialistHandoffManifestStore, expectedHash: `sha256:${string}`): Promise<void> {
  const readback = await store.get(expectedHash);
  if (!Buffer.isBuffer(readback) || hashBytes(readback) !== expectedHash) {
    throw new Error("Durable investigation handoff dependency artifact is unavailable or mismatched.");
  }
}

function canonicalPromptArtifactBytes(envelope: PromptArtifactEnvelope): Buffer {
  const { inputArtifactHash: _inputArtifactHash, ...manifest } = envelope.manifest;
  return Buffer.from(serializeContextPackPayload({ manifest, text: envelope.text }));
}

function hashBytes(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

function investigationOutputArtifact(
  runId: string,
  artifactKind: "investigation-plan-artifact" | "task-suggestion-bundle" | "draft-prr-candidate-bundle",
  artifactHash: `sha256:${string}`
): SpecialistWorkflowOutputArtifactDto {
  const details = artifactKind === "investigation-plan-artifact"
    ? { artifactId: `artifact_${runId}_plan`, safeSummary: "Local investigation plan artifact hash is ready for review." }
    : artifactKind === "task-suggestion-bundle"
      ? { artifactId: `artifact_${runId}_tasks`, safeSummary: "Local task suggestions require investigator review." }
      : { artifactId: `artifact_${runId}_prr_drafts`, safeSummary: "Local PRR draft candidates have not been sent." };
  return Object.freeze({
    ...details,
    artifactKind,
    schemaId: "investigation-planner-handoff.v1",
    artifactHash
  });
}

async function recordDurableHandoff(input: {
  readonly input: RunInvestigationPlannerWorkflowInput;
  readonly handoffStore: SpecialistHandoffManifestStore;
  readonly material: SpecialistHandoffMaterial;
  readonly eventIds: readonly string[];
}): Promise<RunInvestigationPlannerWorkflowResult> {
  let finalOutput: Awaited<ReturnType<typeof appendSpecialistFinalOutputStep>>;
  try {
    finalOutput = await appendSpecialistFinalOutputStep({
      ledger: input.input.ledger,
      materialStore: input.handoffStore,
      actor: input.input.actor,
      now: input.input.now,
      runId: input.input.runId,
      taskId: input.input.taskId,
      handoffMaterial: input.material
    });
  } catch {
    return await finalOutputStorageFailureResult(input);
  }
  let recorded: Awaited<ReturnType<typeof recordSpecialistHandoff>>;
  try {
    recorded = await recordSpecialistHandoff({
      ledger: input.input.ledger,
      manifestStore: input.handoffStore,
      actor: input.input.actor,
      now: input.input.now,
      runId: input.input.runId,
      taskId: input.input.taskId
    });
  } catch {
    return outputPersistedResult(input, finalOutput.id);
  }
  try {
    const finalized = await finalizeSpecialistRunAfterHandoff({
      ledger: input.input.ledger,
      actor: input.input.actor,
      now: input.input.now,
      recorded
    });
    return Object.freeze({
      handoff: Object.freeze({ ...recorded.handoff, lifecycle: "handoff-recorded" as const }),
      diagnostics: Object.freeze([]),
      eventIds: Object.freeze([...input.eventIds, finalOutput.id, recorded.prepared.id, recorded.recorded.id, finalized.terminal.id])
    });
  } catch {
    return Object.freeze({
      handoff: Object.freeze({ ...recorded.handoff, lifecycle: "handoff-recorded" as const }),
      diagnostics: Object.freeze([Object.freeze({
        category: "artifact-missing" as const,
        safeSummary: "The durable handoff was recorded, but terminal run finalization must be retried."
      })]),
      eventIds: Object.freeze([...input.eventIds, finalOutput.id, recorded.prepared.id, recorded.recorded.id])
    });
  }
}

async function finalOutputStorageFailureResult(input: {
  readonly input: RunInvestigationPlannerWorkflowInput;
  readonly handoffStore: SpecialistHandoffManifestStore;
  readonly material: SpecialistHandoffMaterial;
  readonly eventIds: readonly string[];
}): Promise<RunInvestigationPlannerWorkflowResult> {
  let failureEventId: string | undefined;
  try {
    const failure = await appendSpecialistFailure({
      ledger: input.input.ledger,
      actor: input.input.actor,
      now: input.input.now,
      runId: input.input.runId,
      category: "external-effect-failed",
      message: "Investigation planner handoff material could not be persisted.",
      retryable: true,
      allowedActions: ["repair durable investigation handoff storage and retry"],
      ...(input.eventIds.at(-1) === undefined ? {} : { causationId: input.eventIds.at(-1) })
    });
    failureEventId = failure.id;
  } catch {
    // The returned handoff remains secret-safe even when the ledger is unavailable.
  }
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "investigation-planner",
    runId: input.input.runId,
    taskId: input.input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.input.now(),
    status: "failed",
    safeSummary: "Investigation planning could not persist its durable handoff material.",
    contextPackRefs: input.material.contextPackRefs,
    promptArtifactHash: input.material.promptArtifactHash,
    outputArtifacts: input.material.outputArtifacts,
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.input.runId}_repair_handoff_storage`,
      label: "Repair durable investigation handoff storage and retry",
      kind: "retry",
      effect: "none",
      ...(input.material.outputArtifacts[0] === undefined ? {} : { artifactId: input.material.outputArtifacts[0].artifactId })
    }],
    failure: {
      category: "external-effect-failed",
      code: "investigation-planner-final-output-storage-failed",
      safeSummary: "Durable handoff material storage failed after safe model invocation.",
      retryable: true
    }
  });
  return resultWithLegacyHandoff(
    handoff,
    [...input.eventIds, ...(failureEventId === undefined ? [] : [failureEventId])],
    [{
      category: "artifact-missing",
      safeSummary: "Durable handoff material storage was unavailable after safe model invocation."
    }]
  );
}

function outputPersistedResult(input: {
  readonly input: RunInvestigationPlannerWorkflowInput;
  readonly handoffStore: SpecialistHandoffManifestStore;
  readonly material: SpecialistHandoffMaterial;
  readonly eventIds: readonly string[];
}, finalOutputEventId: string): RunInvestigationPlannerWorkflowResult {
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "investigation-planner",
    runId: input.input.runId,
    taskId: input.input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.input.now(),
    status: "blocked",
    safeSummary: "Investigation output is persisted, but durable handoff recording must resume after storage is restored.",
    contextPackRefs: input.material.contextPackRefs,
    promptArtifactHash: input.material.promptArtifactHash,
    outputArtifacts: input.material.outputArtifacts,
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.input.runId}_resume_handoff_recording`,
      label: "Restore durable handoff storage and resume recording",
      kind: "retry",
      effect: "none",
      ...(input.material.outputArtifacts[0] === undefined ? {} : { artifactId: input.material.outputArtifacts[0].artifactId })
    }]
  });
  return resultWithLegacyHandoff(
    handoff,
    [...input.eventIds, finalOutputEventId],
    [{
      category: "artifact-missing",
      safeSummary: "Final output is ledger-bound, but durable handoff manifest recording must be resumed."
    }],
    "output-persisted"
  );
}

function parseModelOutput(outputText: string) {
  try {
    const output = validateProductionSpecialistProviderOutput({
      runType: "investigation-planner",
      value: JSON.parse(outputText)
    });
    return output.runType === "investigation-planner" ? output.value : undefined;
  } catch {
    return undefined;
  }
}

async function failedModelOutputResult(
  input: RunInvestigationPlannerWorkflowInput,
  prepared: PreparedSpecialistRun,
  handoffStore: SpecialistHandoffManifestStore,
  sourceEventIds: readonly string[],
  invocationEventIds: readonly string[]
): Promise<RunInvestigationPlannerWorkflowResult> {
  const material = buildSpecialistHandoffMaterial({
    status: "failed",
    safeSummary: "Investigation planning could not produce valid structured artifacts.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash as `sha256:${string}`,
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_retry_model`,
      label: "Retry investigation planner model output",
      kind: "retry",
      effect: "none"
    }],
    failure: {
      category: "model-output-invalid",
      code: "investigation-planner-model-output-invalid",
      safeSummary: "Model output failed investigation planner schema validation.",
      retryable: true
    },
    sourceEventIds,
    relatedEventIds: uniqueStrings(invocationEventIds)
  });
  return await recordDurableHandoff({
    input,
    handoffStore,
    material,
    eventIds: invocationEventIds
  });
}

async function failedDerivativeArtifactResult(
  input: RunInvestigationPlannerWorkflowInput,
  prepared: PreparedSpecialistRun,
  handoffStore: SpecialistHandoffManifestStore,
  sourceEventIds: readonly string[],
  invocationEventIds: readonly string[],
  outputArtifacts: readonly SpecialistWorkflowOutputArtifactDto[]
): Promise<RunInvestigationPlannerWorkflowResult> {
  const material = buildSpecialistHandoffMaterial({
    status: "failed",
    safeSummary: "Investigation planning could not publish local derivative artifacts.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash as `sha256:${string}`,
    outputArtifacts,
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_retry_storage`,
      label: "Retry investigation planning after derivative storage is healthy",
      kind: "retry",
      effect: "none"
    }],
    failure: {
      category: "external-effect-failed",
      code: "investigation-planner-derivative-storage-failed",
      safeSummary: "Derivative artifact storage failed before the investigation handoff could complete.",
      retryable: true
    },
    sourceEventIds,
    relatedEventIds: uniqueStrings(invocationEventIds)
  });
  return await recordDurableHandoff({
    input,
    handoffStore,
    material,
    eventIds: invocationEventIds
  });
}
