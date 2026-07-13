import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import type { ActorRef, AppendableKnowledgeEvent, KnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { isConcurrencyConflict, type EventLedger } from "../../ontology/src/event-ledger.js";
import {
  rebuildProviderByteTransferCurrentPreview,
  type RebuildProviderByteTransferCurrentPreviewInput
} from "./adapters/provider-byte-transfer.js";
import {
  assertPromptArtifactCanTransferToRemoteProvider,
  promptArtifactAuditMetadata,
  type PromptArtifactEnvelope
} from "./prompt-artifacts.js";
import { buildAgentProjection } from "./projection.js";
import type { CredentialReference } from "./provider.js";
import {
  providerReadinessDtoSchema,
  providerSetupCardSchema,
  type ProviderReadinessDto,
  type ProviderSetupCard
} from "./provider-readiness.js";
import type { InvokeAgentModelInput, InvokeAgentModelResult } from "./runtime.js";
import type { AgentRuntimeResult } from "./runtime-types.js";
import {
  assertResolvedContextPacksForExecution,
  type ContextPackRef,
  type ContextPackRegistry
} from "./context-packs.js";
import type { AgentFailureCategory } from "./projection-types.js";
import type { AgentApprovedToolPreviewResult } from "./scheduler-types.js";
import { specialistWorkflowDescriptorFor, type SpecialistWorkflowDescriptor } from "./specialist-workflows.js";
import type { AgentSpecialistRunType } from "./specialists.js";
import {
  productionSpecialistPromptRegistrationFor,
  productionSpecialistPromptRegistrations,
  renderProductionSpecialistPrompt,
  verifyProductionSpecialistPromptArtifact,
  type ProductionRunScope,
  type ProductionSpecialistPromptRegistration
} from "./production-specialist-prompts.js";
import { mintProductionSpecialistInvocationProof } from "./production-specialist-invocation-proof.js";
import { hashAgentToolPreview } from "./tool-gateway.js";
import {
  buildSpecialistHandoffManifest,
  canonicalSpecialistHandoffMaterialBytes,
  canonicalSpecialistHandoffJson,
  computeSpecialistHandoffId,
  hashSpecialistHandoffManifest,
  hashSpecialistHandoffMaterial,
  parseSpecialistHandoffMaterial,
  verifySpecialistHandoffManifest,
  type SpecialistHandoffManifest,
  type SpecialistHandoffMaterial
} from "./specialist-handoff-manifest.js";
import {
  authoritativeFinalOutputStepSchemaId as authoritativeProjectedFinalOutputStepSchemaId,
  buildSpecialistHandoffProjection
} from "./specialist-handoff-projection.js";
import type {
  SpecialistWorkflowHandoffDto
} from "./specialist-handoffs.js";

const agentCoreVersion = "0.1.0";
const agentPackVersions = { core: "0.1.0", agent: "0.1.0" } as const;
const unsafeJsonObjectKeys = new Set(["__proto__", "constructor", "prototype"]);

export interface SpecialistRunnerModelInvoker {
  invokeModel(command: InvokeAgentModelInput): Promise<AgentRuntimeResult<InvokeAgentModelResult>>;
}

export type SpecialistRunnerProviderReadiness =
  | ProviderReadinessDto
  | { readonly cards: readonly ProviderSetupCard[] };

export interface SpecialistRunnerProviderTransferApprovalProof {
  readonly currentPreviewInput: RebuildProviderByteTransferCurrentPreviewInput;
  readonly approvedPreviewHash: `sha256:${string}`;
}

export interface AssertSelectedSpecialistProviderByteTransferApprovalInput {
  readonly ledger: EventLedger;
  readonly runId: string;
  readonly taskId: string;
  readonly providerId: string;
  readonly modelFamily: string;
  readonly credentialRef: CredentialReference;
  readonly providerReadiness: SpecialistRunnerProviderReadiness;
  readonly providerTransferApproval: SpecialistRunnerProviderTransferApprovalProof;
  readonly promptArtifact: PromptArtifactEnvelope;
  readonly rebuildCurrentPreview?: ((
    input: RebuildProviderByteTransferCurrentPreviewInput
  ) => Promise<AgentApprovedToolPreviewResult>) | undefined;
}

export interface SpecialistDerivativeArtifactStore {
  put(content: Buffer): Promise<{
    readonly contentHash: `sha256:${string}`;
    readonly sizeBytes: number;
  }>;
}

export interface SpecialistHandoffManifestStore {
  put(content: Buffer): Promise<{ readonly contentHash: `sha256:${string}`; readonly sizeBytes: number }>;
  get(contentHash: `sha256:${string}`): Promise<Buffer>;
}

export interface AppendSpecialistFinalOutputStepInput {
  readonly ledger: EventLedger;
  readonly materialStore: SpecialistHandoffManifestStore;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly runId: string;
  readonly taskId?: string;
  readonly handoffMaterial: SpecialistHandoffMaterial;
}

export interface RecordSpecialistHandoffInput {
  readonly ledger: EventLedger;
  readonly manifestStore: SpecialistHandoffManifestStore;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly runId: string;
  readonly taskId?: string;
}

interface ResolvedRecordSpecialistHandoffInput extends RecordSpecialistHandoffInput {
  readonly runType: AgentSpecialistRunType;
  readonly material: SpecialistHandoffMaterial;
  readonly handoffRevision: number;
}

export interface RecordSpecialistHandoffResult {
  readonly manifest: SpecialistHandoffManifest;
  readonly handoff: SpecialistWorkflowHandoffDto;
  readonly prepared: KnowledgeEventOf<"agent.specialist-handoff.prepared">;
  readonly recorded: KnowledgeEventOf<"agent.specialist-handoff.recorded">;
  readonly manifestStore: SpecialistHandoffManifestStore;
}

export interface FinalizeSpecialistRunAfterHandoffInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly recorded: RecordSpecialistHandoffResult;
  readonly appendTaskStatus?: false;
}

export interface FinalizeSpecialistRunAfterHandoffResult {
  readonly terminal: KnowledgeEventOf<"agent.specialist-run.completed"> | KnowledgeEventOf<"agent.specialist-run.failed">;
  readonly taskStatus?: KnowledgeEventOf<"agent.task.status.changed">;
}

export interface SpecialistMountedDerivativeBlobStore {
  put(content: Buffer): Promise<{
    readonly contentHash: `sha256:${string}`;
    readonly sizeBytes: number;
    readonly path: string;
  }>;
}

export interface StoredSpecialistDerivativeArtifact {
  readonly artifactHash: `sha256:${string}`;
  readonly sizeBytes: number;
}

export interface SpecialistRunnerBaseInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly contextPacks: ContextPackRegistry;
  readonly scope?: ProductionRunScope;
  readonly productionPromptRegistrations?: readonly ProductionSpecialistPromptRegistration[];
  readonly runId: string;
  readonly taskId: string;
  readonly providerId: string;
  readonly modelFamily: string;
  readonly credentialRef: CredentialReference;
  /** Resident runtime configured with the selected provider, e.g. Nous Portal. */
  readonly runtime: SpecialistRunnerModelInvoker;
  readonly providerReadiness: SpecialistRunnerProviderReadiness;
  readonly providerTransferApproval?: SpecialistRunnerProviderTransferApprovalProof;
  readonly promptArtifact?: PromptArtifactEnvelope;
  readonly derivativeStore?: SpecialistDerivativeArtifactStore | undefined;
}

export interface PreparedSpecialistRun {
  readonly descriptor: SpecialistWorkflowDescriptor;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly promptArtifact: PromptArtifactEnvelope;
}

interface PreparedSpecialistRunBinding {
  readonly input: SpecialistRunnerBaseInput;
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly generatedAt: string;
}

interface CurrentProductionSpecialistRun {
  readonly descriptor: SpecialistWorkflowDescriptor;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly renderInput: {
    readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
    readonly runId: string;
    readonly taskId: string;
    readonly generatedAt: string;
    readonly scope: ProductionRunScope;
    readonly resolvedContextPacks: ReturnType<typeof assertResolvedContextPacksForExecution>;
  };
}

const preparedSpecialistRunBindings = new WeakMap<PreparedSpecialistRun, PreparedSpecialistRunBinding>();

export async function prepareSpecialistRun(
  input: SpecialistRunnerBaseInput,
  runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">
): Promise<PreparedSpecialistRun> {
  const current = await currentProductionSpecialistRun(input, runType, input.now());
  const promptArtifact = input.promptArtifact === undefined
    ? renderProductionSpecialistPrompt(current.renderInput)
    : verifyProductionSpecialistPromptArtifact({ ...current.renderInput, artifact: input.promptArtifact });
  const prepared = Object.freeze({
    descriptor: current.descriptor,
    contextPackRefs: Object.freeze(current.contextPackRefs),
    promptArtifact
  });
  preparedSpecialistRunBindings.set(prepared, Object.freeze({ input, runType, generatedAt: current.renderInput.generatedAt }));
  return prepared;
}

async function currentProductionSpecialistRun(
  input: SpecialistRunnerBaseInput,
  runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">,
  generatedAt: string
): Promise<CurrentProductionSpecialistRun> {
  const descriptor = specialistWorkflowDescriptorFor(runType);
  const registration = productionRegistrationFor(input, runType, descriptor);
  const run = buildAgentProjection(await input.ledger.readAll()).runs.get(input.runId);
  if (run === undefined || run.runType !== runType || run.residentAgentId !== "agent_default") {
    throw new Error("Specialist workflow requires a matching agent_default run.");
  }
  if (run.taskId !== input.taskId) {
    throw new Error("Specialist workflow task does not match the target run.");
  }

  const scope: ProductionRunScope = input.scope ?? Object.freeze({ kind: "task", refs: Object.freeze([input.taskId]) });
  const applicableRequirements = registration.contextRequirements.filter((requirement) =>
    requirement.requirementMode === "always" || scope.associatedPrrRequestId !== undefined
  );
  const resolvedContextPacks = await Promise.all(
    applicableRequirements.map(async (requirement) => await input.contextPacks.buildResolved(requirement.contextPackId))
  );
  const contextPackRefs = resolvedContextPacks.map((resolved) => resolved.ref);
  const verifiedResolvedContextPacks = assertResolvedContextPacksForExecution(contextPackRefs, resolvedContextPacks);
  const renderInput = {
    runType,
    runId: input.runId,
    taskId: input.taskId,
    generatedAt,
    scope,
    resolvedContextPacks: verifiedResolvedContextPacks
  };
  return Object.freeze({ descriptor, contextPackRefs: Object.freeze(contextPackRefs), renderInput });
}

export async function invokeSpecialistModel(
  input: SpecialistRunnerBaseInput,
  prepared: PreparedSpecialistRun,
  invocationId: string
): Promise<{
  readonly outputText: string;
  readonly outputArtifactHash: `sha256:${string}`;
  readonly eventIds: readonly string[];
}> {
  const binding = preparedSpecialistRunBindings.get(prepared);
  if (binding === undefined || binding.input !== input) {
    throw new Error("Prepared specialist run does not belong to the current invocation input.");
  }
  const current = await currentProductionSpecialistRun(input, binding.runType, binding.generatedAt);
  verifyProductionSpecialistPromptArtifact({ ...current.renderInput, artifact: prepared.promptArtifact });
  await assertProviderReadinessAllowsInvocation(input, prepared.promptArtifact);
  const productionInvocationProof = mintProductionSpecialistInvocationProof({
    runId: input.runId,
    taskId: input.taskId,
    providerId: input.providerId,
    modelFamily: input.modelFamily,
    credentialRefId: input.credentialRef.credentialRefId,
    inputArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    promptArtifact: prepared.promptArtifact
  });
  const result = await input.runtime.invokeModel({
    invocationId,
    runId: input.runId,
    providerId: input.providerId,
    modelFamily: input.modelFamily,
    inputArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    safetyClass: prepared.promptArtifact.manifest.safetyClass,
    credentialRef: input.credentialRef,
    promptArtifact: prepared.promptArtifact,
    productionInvocationProof,
    returnOutputText: true
  });
  if (!result.ok || result.outputText === undefined) {
    throw new Error("Configured provider invocation failed safely.");
  }
  return Object.freeze({
    outputText: result.outputText,
    outputArtifactHash: result.outputArtifactHash as `sha256:${string}`,
    eventIds: Object.freeze([...result.eventIds])
  });
}

/**
 * Rechecks a selected remote specialist invocation's existing approval proof.
 * This is assertion-only: it grants no invocation authority and never calls a provider.
 */
export async function assertSelectedSpecialistProviderByteTransferApproval(
  input: AssertSelectedSpecialistProviderByteTransferApprovalInput
): Promise<void> {
  const promptArtifact = input.promptArtifact;
  assertPromptArtifactCanTransferToRemoteProvider(promptArtifact);
  const card = providerReadinessCards(input.providerReadiness).find((candidate) => candidate.providerId === input.providerId);
  if (card === undefined) {
    throw new Error("Selected provider readiness is unavailable for specialist invocation.");
  }
  if (
    card.state === "requires-byte-transfer-approval" &&
    card.requiredApprovalClass === "provider-byte-transfer" &&
    card.credentialHealth === "local-binding-healthy" &&
    promptArtifact.manifest.safetyClass === "provider-approved" &&
    promptArtifact.manifest.transferApprovalClass === "provider-byte-transfer"
  ) {
    await assertProviderByteTransferApproved(input, card, promptArtifact);
    return;
  }
  throw new Error("Selected provider readiness is not ready for provider byte-transfer approval.");
}

async function assertProviderReadinessAllowsInvocation(
  input: SpecialistRunnerBaseInput,
  promptArtifact: PromptArtifactEnvelope
): Promise<void> {
  const card = providerReadinessCards(input.providerReadiness).find((candidate) => candidate.providerId === input.providerId);
  if (card === undefined) {
    throw new Error("Selected provider readiness is unavailable for specialist invocation.");
  }
  if (card.state === "ready" || card.state === "works-locally") {
    return;
  }
  if (
    card.state !== "requires-byte-transfer-approval" ||
    card.requiredApprovalClass !== "provider-byte-transfer" ||
    card.credentialHealth !== "local-binding-healthy" ||
    promptArtifact.manifest.safetyClass !== "provider-approved" ||
    promptArtifact.manifest.transferApprovalClass !== "provider-byte-transfer"
  ) {
    throw new Error("Selected provider readiness is not ready for specialist invocation.");
  }
  if (input.providerTransferApproval === undefined) {
    throw new Error("Provider byte-transfer approval is required before remote specialist invocation.");
  }
  await assertSelectedSpecialistProviderByteTransferApproval({
    ledger: input.ledger,
    runId: input.runId,
    taskId: input.taskId,
    providerId: input.providerId,
    modelFamily: input.modelFamily,
    credentialRef: input.credentialRef,
    providerReadiness: input.providerReadiness,
    providerTransferApproval: input.providerTransferApproval,
    promptArtifact
  });
}

async function assertProviderByteTransferApproved(
  input: AssertSelectedSpecialistProviderByteTransferApprovalInput,
  currentCard: ProviderSetupCard,
  promptArtifact: PromptArtifactEnvelope
): Promise<void> {
  const proof = input.providerTransferApproval;
  if (proof === undefined) {
    throw new Error("Provider byte-transfer approval is required before remote specialist invocation.");
  }
  const promptAudit = promptArtifactAuditMetadata(promptArtifact);
  const current = await (input.rebuildCurrentPreview ?? rebuildProviderByteTransferCurrentPreview)(proof.currentPreviewInput);
  if (current.activeLocks.length > 0) {
    throw new Error("Provider byte-transfer approval proof includes active locks.");
  }
  const preview = current.preview as Record<string, unknown>;
  const previewModelFamily = previewModelFamilyFor(preview);
  const approvedProviderCapability = proof.currentPreviewInput.approvedProviderCapability;
  const previewHash = hashAgentToolPreview(current.preview);
  if (previewHash !== proof.approvedPreviewHash) {
    throw new Error("Provider byte-transfer approval preview hash does not match the current preview.");
  }
  if (
    preview.runId !== input.runId ||
    preview.taskId !== input.taskId ||
    preview.residentAgentId !== "agent_default" ||
    preview.providerId !== input.providerId ||
    (previewModelFamily !== undefined && previewModelFamily !== input.modelFamily) ||
    approvedProviderCapability.providerId !== input.providerId ||
    !approvedProviderCapability.modelFamilies.includes(input.modelFamily) ||
    proof.currentPreviewInput.credentialRefId !== input.credentialRef.credentialRefId ||
    proof.currentPreviewInput.approvedProviderReadiness.providerId !== currentCard.providerId ||
    proof.currentPreviewInput.approvedProviderReadiness.credentialRefId !== currentCard.credentialRefId ||
    proof.currentPreviewInput.approvedProviderReadiness.state !== currentCard.state ||
    proof.currentPreviewInput.approvedProviderReadiness.requiredApprovalClass !== currentCard.requiredApprovalClass ||
    proof.currentPreviewInput.approvedProviderReadiness.credentialHealth !== currentCard.credentialHealth ||
    proof.currentPreviewInput.approvedPromptArtifact.inputArtifactHash !== promptAudit.inputArtifactHash ||
    proof.currentPreviewInput.approvedPromptArtifact.safetyClass !== promptAudit.safetyClass ||
    proof.currentPreviewInput.approvedPromptArtifact.transferApprovalClass !== promptAudit.transferApprovalClass
  ) {
    throw new Error("Provider byte-transfer approval proof does not match the selected specialist invocation.");
  }

  const toolEvents = await input.ledger.readStream(`agent_tool_request_${proof.currentPreviewInput.toolRequestId}`);
  const requested = toolEvents.find((event): event is Extract<KnowledgeEvent, { type: "agent.tool.requested" }> =>
    event.type === "agent.tool.requested"
  );
  if (
    requested === undefined ||
    requested.payload.runId !== input.runId ||
    requested.payload.toolId !== preview.toolId ||
    requested.payload.toolVersion !== preview.toolVersion ||
    requested.payload.requiredApprovalClass !== "provider-byte-transfer" ||
    requested.payload.previewHash !== proof.approvedPreviewHash ||
    !sameOrderedStrings(requested.payload.sourceEventIds ?? [], current.sourceEventIds) ||
    !sameOrderedStrings(requested.payload.inputArtifactHashes ?? [], current.inputArtifactHashes)
  ) {
    throw new Error("Provider byte-transfer tool request is missing or stale.");
  }

  const approved = toolEvents.findLast((event): event is Extract<KnowledgeEvent, { type: "agent.tool.approved" }> =>
    event.type === "agent.tool.approved"
  );
  const latest = toolEvents.at(-1);
  if (
    approved === undefined ||
    latest?.type !== "agent.tool.approved" ||
    approved.context.actor.kind !== "human" ||
    approved.context.actor.id !== approved.payload.approvedBy ||
    approved.context.causationId !== requested.id ||
    approved.context.actor.id === requested.payload.requestedBy ||
    approved.context.actor.id === requested.context.actor.id ||
    approved.payload.approvalClass !== "provider-byte-transfer" ||
    approved.payload.approvedBy !== proof.currentPreviewInput.reviewer.id ||
    approved.payload.approvedPreviewHash !== proof.approvedPreviewHash
  ) {
    throw new Error("Provider byte-transfer human approval is missing or stale.");
  }

  const events = await input.ledger.readAll();
  const providerApproval = events.find((event): event is Extract<KnowledgeEvent, { type: "ingestion.provider.approved" }> =>
    event.id === proof.currentPreviewInput.approvalEventId &&
    event.type === "ingestion.provider.approved"
  );
  if (
    providerApproval === undefined ||
    providerApproval.context.actor.kind !== "human" ||
    providerApproval.context.actor.id !== providerApproval.payload.approvedBy ||
    providerApproval.payload.approvedBy !== proof.currentPreviewInput.reviewer.id ||
    providerApproval.payload.providerJobId !== proof.currentPreviewInput.providerJobId ||
    providerApproval.payload.sourceCollectionId !== proof.currentPreviewInput.sourceCollectionId ||
    providerApproval.payload.importBatchId !== proof.currentPreviewInput.importBatchId ||
    providerApproval.payload.provider.name !== proof.currentPreviewInput.providerId ||
    providerApproval.payload.provider.version !== proof.currentPreviewInput.approvedProviderCapability.adapterVersion
  ) {
    throw new Error("Provider byte-transfer domain approval event is missing or stale.");
  }
}

function previewModelFamilyFor(preview: Record<string, unknown>): string | undefined {
  const modelId = preview.modelId;
  if (typeof modelId === "string") {
    return modelId;
  }
  const modelFamily = preview.modelFamily;
  return typeof modelFamily === "string" ? modelFamily : undefined;
}

function providerReadinessCards(
  providerReadiness: SpecialistRunnerProviderReadiness
): readonly ProviderSetupCard[] {
  if ("schemaVersion" in providerReadiness) {
    return providerReadinessDtoSchema.parse(providerReadiness).cards;
  }
  return providerReadiness.cards.map((card) => providerSetupCardSchema.parse(card));
}

function productionRegistrationFor(
  input: SpecialistRunnerBaseInput,
  runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">,
  descriptor: SpecialistWorkflowDescriptor
): ProductionSpecialistPromptRegistration {
  const canonical = productionSpecialistPromptRegistrationFor(runType);
  const registrations = input.productionPromptRegistrations ?? productionSpecialistPromptRegistrations;
  const registration = registrations.find((candidate) =>
    candidate.runType === canonical.runType &&
    candidate.promptTemplateId === canonical.promptTemplateId &&
    candidate.promptTemplateVersion === canonical.promptTemplateVersion &&
    candidate.rendererId === canonical.rendererId &&
    candidate.rendererVersion === canonical.rendererVersion &&
    candidate.rendererHash === canonical.rendererHash &&
    candidate.providerOutputSchemaId === canonical.providerOutputSchemaId &&
    candidate.providerOutputSchemaVersion === canonical.providerOutputSchemaVersion &&
    candidate.handoffSchemaId === canonical.handoffSchemaId &&
    candidate.handoffSchemaVersion === canonical.handoffSchemaVersion &&
    candidate.safetyClass === "provider-approved" &&
    candidate.transferApprovalClass === "provider-byte-transfer"
  );
  if (registration === undefined) {
    throw new Error("Production specialist prompt registration is unavailable for this run.");
  }
  if (
    descriptor.promptTemplate.promptTemplateId !== registration.promptTemplateId ||
    descriptor.promptTemplate.promptTemplateVersion !== registration.promptTemplateVersion ||
    descriptor.promptTemplate.providerOutputSchemaId !== registration.providerOutputSchemaId ||
    descriptor.promptTemplate.providerOutputSchemaVersion !== registration.providerOutputSchemaVersion ||
    descriptor.promptTemplate.handoffSchemaId !== registration.handoffSchemaId ||
    descriptor.promptTemplate.handoffSchemaVersion !== registration.handoffSchemaVersion ||
    descriptor.promptTemplate.safetyClass !== registration.safetyClass ||
    descriptor.promptTemplate.transferApprovalClass !== registration.transferApprovalClass
  ) {
    throw new Error("Specialist workflow descriptor does not match the production prompt registration.");
  }
  return registration;
}

export function expectedNextSequenceFromStream(events: readonly KnowledgeEvent[]): number {
  const last = events.at(-1);
  return last === undefined ? 1 : last.sequence + 1;
}

export async function appendSpecialistFinalOutputStep(
  rawInput: AppendSpecialistFinalOutputStepInput
): Promise<KnowledgeEventOf<"agent.specialist-run.step.recorded">> {
  const input = snapshotFinalOutputInput(rawInput);
  assertManifestStoreAvailable(input.materialStore);
  const stream = await input.ledger.readStream(`agent_run_${input.runId}`);
  const started = matchingStartedEvent(stream, input.runId, input.taskId);
  const stepSchemaId = authoritativeFinalOutputStepSchemaId(started.payload.runType);
  const materialBytes = canonicalSpecialistHandoffMaterialBytes(input.handoffMaterial);
  const materialHash = hashSpecialistHandoffMaterial(input.handoffMaterial);
  const storedMaterial = await input.materialStore.put(materialBytes);
  if (storedMaterial.contentHash !== materialHash || storedMaterial.sizeBytes !== materialBytes.byteLength) {
    throw new Error("Handoff material store did not confirm the canonical material bytes.");
  }
  const materialReadback = await input.materialStore.get(materialHash);
  if (!Buffer.isBuffer(materialReadback) || !materialReadback.equals(materialBytes)) {
    throw new Error("Handoff material exact-byte readback failed before final-output append.");
  }
  const material = parseSpecialistHandoffMaterial(JSON.parse(materialReadback.toString("utf8")));
  const priorRecorded = latestRecordedHandoff(stream);
  await assertHandoffMaterialAuthority(input.ledger, input.materialStore, material, started, priorRecorded, undefined);
  const inputArtifactHashes = canonicalMaterialInputHashes(material);
  const outputArtifactHashes = material.outputArtifacts.map((artifact) => artifact.artifactHash);
  const stepId = `step_${input.runId}_final_output`;
  const idempotencyKey = finalOutputIdempotencyKey(input.runId, input.taskId, started.payload.runType, material, materialHash);
  const existing = stream.filter((event): event is KnowledgeEventOf<"agent.specialist-run.step.recorded"> =>
    event.type === "agent.specialist-run.step.recorded" && event.payload.stepKind === "final-output"
  );
  if (existing.length > 0) {
    const exact = assertFinalOutputEventsCanAppendOrReuse({
      events: existing,
      runId: input.runId,
      stepId,
      stepSchemaId,
      idempotencyKey,
      materialHash,
      inputArtifactHashes,
      outputArtifactHashes,
      material,
      priorRecorded
    });
    if (exact !== undefined) return exact;
  }

  const event: AppendableKnowledgeEvent<"agent.specialist-run.step.recorded"> = {
    type: "agent.specialist-run.step.recorded",
    version: 1,
    streamId: `agent_run_${input.runId}`,
    context: {
      actor: input.actor,
      occurredAt: input.now(),
      correlationId: `corr_${input.runId}_final_output`,
      coreVersion: agentCoreVersion,
      packVersions: agentPackVersions
    },
    payload: {
      runId: input.runId,
      stepId,
      summary: "Canonical specialist handoff material and output artifacts are persisted.",
      stepKind: "final-output",
      stepSchemaId,
      idempotencyKey,
      handoffMaterialArtifactHash: materialHash,
      inputArtifactHashes,
      outputArtifactHashes
    }
  };
  return await appendWithExactRaceRecovery({
    ledger: input.ledger,
    streamId: `agent_run_${input.runId}`,
    expectedNextSequence: expectedNextSequenceFromStream(stream),
    event,
    findExact: (events) => events.find((candidate): candidate is KnowledgeEventOf<"agent.specialist-run.step.recorded"> =>
      candidate.type === "agent.specialist-run.step.recorded" && finalOutputMatches(candidate, input.runId, stepId, stepSchemaId, idempotencyKey, materialHash, inputArtifactHashes, outputArtifactHashes)
    ),
    validateReread: (events) => {
      assertFinalOutputEventsCanAppendOrReuse({
        events: events.filter((candidate): candidate is KnowledgeEventOf<"agent.specialist-run.step.recorded"> =>
          candidate.type === "agent.specialist-run.step.recorded" &&
          candidate.payload.runId === input.runId &&
          candidate.payload.stepKind === "final-output"
        ),
        runId: input.runId,
        stepId,
        stepSchemaId,
        idempotencyKey,
        materialHash,
        inputArtifactHashes,
        outputArtifactHashes,
        material,
        priorRecorded
      });
    },
    conflictMessage: "Conflicting final-output specialist step exists on the run stream."
  });
}

export async function recordSpecialistHandoff(rawInput: RecordSpecialistHandoffInput): Promise<RecordSpecialistHandoffResult> {
  const input = snapshotRecordHandoffInput(rawInput);
  assertManifestStoreAvailable(input.manifestStore);
  const stream = await input.ledger.readStream(`agent_run_${input.runId}`);
  const started = matchingStartedEvent(stream, input.runId, input.taskId);

  const { finalOutput, material, recorded: alreadyRecorded } = await selectFinalOutputForHandoff(stream, input);
  if (alreadyRecorded !== undefined) {
    return await readRecordedHandoffResult(input, stream, alreadyRecorded);
  }

  const priorRecorded = priorRecordedForMaterial(stream, material);
  const handoffRevision = material.supersedesHandoffId === undefined ? 1 : (priorRecorded?.payload.handoffRevision ?? 0) + 1;
  const resolved: ResolvedRecordSpecialistHandoffInput = Object.freeze({
    ...input,
    runType: started.payload.runType,
    material,
    handoffRevision
  });
  await assertHandoffMaterialAuthority(input.ledger, input.manifestStore, material, started, priorRecorded, finalOutput);
  const outputArtifactHashes = material.outputArtifacts.map((artifact) => artifact.artifactHash);
  if (!sameOrderedStrings(finalOutput.payload.outputArtifactHashes ?? [], outputArtifactHashes)) {
    throw new Error("Specialist handoff output artifacts do not match the ledger-bound final-output step.");
  }

  const handoffId = computeSpecialistHandoffId({
    runId: input.runId,
    ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
    runType: resolved.runType,
    status: material.status,
    finalOutputEventId: finalOutput.id,
    outputArtifactHashes,
    handoffRevision,
    ...(material.supersedesHandoffId === undefined ? {} : { supersedesHandoffId: material.supersedesHandoffId })
  });
  const manifest = buildSpecialistHandoffManifest({
    handoffId,
    handoffRevision,
    runId: input.runId,
    ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
    runType: resolved.runType,
    residentAgentId: "agent_default",
    generatedAt: finalOutput.context.occurredAt,
    status: material.status,
    safeSummary: material.safeSummary,
    stateKind: stateKindForHandoffStatus(material.status),
    finalOutputStepId: finalOutput.payload.stepId,
    finalOutputEventId: finalOutput.id,
    handoffMaterialArtifactHash: contentHashFromLedger(finalOutput.payload.handoffMaterialArtifactHash!),
    contextPackRefs: material.contextPackRefs,
    ...(material.promptArtifactHash === undefined ? {} : { promptArtifactHash: material.promptArtifactHash }),
    outputArtifacts: material.outputArtifacts,
    toolRequestIds: material.toolRequestIds,
    approvalRequirements: material.approvalRequirements,
    nextSafeActions: material.nextSafeActions,
    ...(material.failure === undefined ? {} : { failure: material.failure }),
    sourceEventIds: material.sourceEventIds,
    relatedEventIds: material.relatedEventIds,
    ...(material.supersedesHandoffId === undefined ? {} : { supersedesHandoffId: material.supersedesHandoffId }),
    ...(material.supersedesEventId === undefined ? {} : { supersedesEventId: material.supersedesEventId })
  });
  const manifestBytes = canonicalSpecialistHandoffJson(manifest);
  const expectedManifestHash = hashSpecialistHandoffManifest(manifest);
  const stored = await input.manifestStore.put(manifestBytes);
  if (stored.contentHash !== expectedManifestHash || stored.sizeBytes !== manifestBytes.byteLength) {
    throw new Error("Manifest store did not confirm the exact content-addressed manifest bytes.");
  }
  const readback = await input.manifestStore.get(stored.contentHash);
  if (!Buffer.isBuffer(readback) || !readback.equals(manifestBytes)) {
    throw new Error("Manifest readback did not match the verified content-addressed manifest bytes.");
  }

  const binding = compactHandoffBinding(manifest, stored.contentHash);
  const prepared = await appendOrReusePreparedHandoff(resolved, stream, binding, finalOutput);
  const afterPrepared = await input.ledger.readStream(`agent_run_${input.runId}`);
  const existingRecorded = afterPrepared.filter((event): event is KnowledgeEventOf<"agent.specialist-handoff.recorded"> =>
    event.type === "agent.specialist-handoff.recorded" && event.payload.runId === input.runId
  );
  if (existingRecorded.length > 0) {
    const exact = existingRecorded.find((event) =>
      event.payload.preparedEventId === prepared.id &&
      sameCanonicalValue(omitRecordedTimestamp(event.payload), binding)
    );
    if (exact === undefined && material.supersedesHandoffId === undefined) {
      throw new Error("Conflicting recorded specialist handoff exists on the run stream.");
    }
    if (exact !== undefined) {
      const projection = await assertHandoffProjection(input.ledger, input.manifestStore, input.runId, input.taskId, "handoff-recorded");
      if (projection.selectedHandoff?.handoffId !== manifest.handoffId) {
        throw new Error("Recorded handoff projection does not select the verified manifest handoff.");
      }
      return Object.freeze({ manifest, handoff: manifest.handoff, prepared, recorded: exact, manifestStore: input.manifestStore });
    }
  }
  await assertPreparedHandoffProjection(input.ledger, input.manifestStore, input.runId, input.taskId, prepared.id);
  assertSupersessionCanRecord(afterPrepared, manifest, prepared);
  const recorded = await appendOrReuseRecordedHandoff(resolved, afterPrepared, binding, prepared);
  const projection = await assertHandoffProjection(input.ledger, input.manifestStore, input.runId, input.taskId, "handoff-recorded");
  if (projection.selectedHandoff?.handoffId !== manifest.handoffId) {
    throw new Error("Recorded handoff projection does not select the verified manifest handoff.");
  }
  return Object.freeze({ manifest, handoff: manifest.handoff, prepared, recorded, manifestStore: input.manifestStore });
}

export async function finalizeSpecialistRunAfterHandoff(
  rawInput: FinalizeSpecialistRunAfterHandoffInput
): Promise<FinalizeSpecialistRunAfterHandoffResult> {
  const input = snapshotFinalizeHandoffInput(rawInput);
  const result = input.recorded;
  if (result === undefined || result.recorded === undefined || result.manifest === undefined || result.manifestStore === undefined) {
    throw new Error("A verified failed handoff is required before terminal specialist run failure.");
  }
  const { manifest, recorded, manifestStore } = await resolveFinalizationReadback(input.ledger, result);

  const runStream = await input.ledger.readStream(`agent_run_${manifest.runId}`);
  const terminal = await appendOrReuseTerminalRun(input, manifest, recorded, runStream);
  return Object.freeze({ terminal });
}

export async function assertSpecialistStepNotRecorded(
  ledger: EventLedger,
  runId: string,
  stepId: string
): Promise<void> {
  const run = buildAgentProjection(await ledger.readAll()).runs.get(runId);
  if (run?.stepIds.includes(stepId)) {
    throw new Error("Specialist run has already recorded this local derivative step.");
  }
}

export async function appendSpecialistDerivativeStep(input: {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly runId: string;
  readonly stepId: string;
  readonly summary: string;
  readonly invocationId?: string;
  readonly toolRequestId?: string;
  readonly inputArtifactHashes: readonly string[];
  readonly outputArtifactHashes: readonly string[];
  readonly causationId?: string | undefined;
}): Promise<KnowledgeEvent> {
  const event: AppendableKnowledgeEvent<"agent.specialist-run.step.recorded"> = {
    type: "agent.specialist-run.step.recorded",
    version: 1,
    streamId: `agent_run_${input.runId}`,
    context: {
      actor: input.actor,
      occurredAt: input.now(),
      correlationId: `corr_${input.runId}_${input.stepId}`,
      coreVersion: agentCoreVersion,
      packVersions: agentPackVersions,
      ...(input.causationId === undefined ? {} : { causationId: input.causationId })
    },
    payload: {
      runId: input.runId,
      stepId: input.stepId,
      summary: input.summary,
      ...(input.invocationId === undefined ? {} : { invocationId: input.invocationId }),
      ...(input.toolRequestId === undefined ? {} : { toolRequestId: input.toolRequestId }),
      inputArtifactHashes: [...input.inputArtifactHashes],
      outputArtifactHashes: [...input.outputArtifactHashes]
    }
  };
  return await input.ledger.append(event);
}

export async function appendSpecialistCompletion(input: {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly runId: string;
  readonly summary: string;
  readonly outputArtifactHashes: readonly string[];
  readonly relatedEventIds: readonly string[];
}): Promise<KnowledgeEvent> {
  const event: AppendableKnowledgeEvent<"agent.specialist-run.completed"> = {
    type: "agent.specialist-run.completed",
    version: 1,
    streamId: `agent_run_${input.runId}`,
    context: {
      actor: input.actor,
      occurredAt: input.now(),
      correlationId: `corr_${input.runId}_completed`,
      coreVersion: agentCoreVersion,
      packVersions: agentPackVersions,
      ...(input.relatedEventIds.at(-1) === undefined ? {} : { causationId: input.relatedEventIds.at(-1) })
    },
    payload: {
      runId: input.runId,
      completedAt: input.now(),
      outputArtifactHashes: [...input.outputArtifactHashes],
      ...(input.relatedEventIds.length === 0 ? {} : { relatedEventIds: [...input.relatedEventIds] }),
      summary: input.summary
    }
  };
  return await input.ledger.append(event);
}

export async function appendSpecialistFailure(input: {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly runId: string;
  readonly category: AgentFailureCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly allowedActions: readonly string[];
  readonly causationId?: string | undefined;
}): Promise<KnowledgeEvent> {
  const event: AppendableKnowledgeEvent<"agent.specialist-run.failed"> = {
    type: "agent.specialist-run.failed",
    version: 1,
    streamId: `agent_run_${input.runId}`,
    context: {
      actor: input.actor,
      occurredAt: input.now(),
      correlationId: `corr_${input.runId}_failed`,
      coreVersion: agentCoreVersion,
      packVersions: agentPackVersions,
      ...(input.causationId === undefined ? {} : { causationId: input.causationId })
    },
    payload: {
      runId: input.runId,
      failedAt: input.now(),
      category: input.category,
      message: input.message,
      retryable: input.retryable,
      allowedActions: [...input.allowedActions]
    }
  };
  return await input.ledger.append(event);
}

function snapshotFinalOutputInput(input: AppendSpecialistFinalOutputStepInput): AppendSpecialistFinalOutputStepInput {
  const values = handoffInputValues(input, "Append specialist final-output input", [
    "ledger", "materialStore", "actor", "now", "runId", "taskId", "handoffMaterial"
  ]);
  const normalized = normalizeSpecialistJsonValue(withoutUndefined({
    actor: values.actor,
    runId: values.runId,
    taskId: values.taskId,
    handoffMaterial: values.handoffMaterial
  }), "Append specialist final-output input") as Record<string, unknown>;
  const material = parseSpecialistHandoffMaterial(normalized.handoffMaterial);
  return Object.freeze({
    ledger: values.ledger as EventLedger,
    materialStore: values.materialStore as SpecialistHandoffManifestStore,
    now: values.now as () => string,
    actor: normalized.actor as ActorRef,
    runId: normalized.runId as string,
    ...(normalized.taskId === undefined ? {} : { taskId: normalized.taskId as string }),
    handoffMaterial: material
  });
}

function snapshotRecordHandoffInput(input: RecordSpecialistHandoffInput): RecordSpecialistHandoffInput {
  const values = handoffInputValues(input, "Record specialist handoff input", [
    "ledger", "manifestStore", "actor", "now", "runId", "taskId"
  ]);
  const normalized = normalizeSpecialistJsonValue(withoutUndefined({
    actor: values.actor,
    runId: values.runId,
    taskId: values.taskId
  }), "Record specialist handoff input") as Record<string, unknown>;
  return Object.freeze({
    ledger: values.ledger as EventLedger,
    manifestStore: values.manifestStore as SpecialistHandoffManifestStore,
    now: values.now as () => string,
    actor: normalized.actor as ActorRef,
    runId: normalized.runId as string,
    ...(normalized.taskId === undefined ? {} : { taskId: normalized.taskId as string })
  }) as RecordSpecialistHandoffInput;
}

function snapshotFinalizeHandoffInput(input: FinalizeSpecialistRunAfterHandoffInput): FinalizeSpecialistRunAfterHandoffInput {
  const values = handoffInputValues(input, "Finalize specialist handoff input", ["ledger", "actor", "now", "recorded", "appendTaskStatus"]);
  const resultValues = handoffInputValues(values.recorded as RecordSpecialistHandoffResult, "Recorded specialist handoff result", [
    "manifest", "handoff", "prepared", "recorded", "manifestStore"
  ]);
  const normalized = normalizeSpecialistJsonValue(withoutUndefined({
    actor: values.actor,
    manifest: resultValues.manifest,
    handoff: resultValues.handoff,
    prepared: resultValues.prepared,
    recorded: resultValues.recorded
  }), "Finalize specialist handoff input") as Record<string, unknown>;
  return Object.freeze({
    ledger: values.ledger as EventLedger,
    now: values.now as () => string,
    actor: normalized.actor as ActorRef,
    ...(values.appendTaskStatus === false ? { appendTaskStatus: false } : {}),
    recorded: Object.freeze({
      manifest: normalized.manifest as SpecialistHandoffManifest,
      handoff: normalized.handoff as SpecialistWorkflowHandoffDto,
      prepared: normalized.prepared as KnowledgeEventOf<"agent.specialist-handoff.prepared">,
      recorded: normalized.recorded as KnowledgeEventOf<"agent.specialist-handoff.recorded">,
      manifestStore: resultValues.manifestStore as SpecialistHandoffManifestStore
    })
  });
}

function handoffInputValues(input: unknown, label: string, fields: readonly string[]): Record<string, unknown> {
  if (typeof input !== "object" || input === null || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
    throw new Error(`${label} must be a plain own-data object.`);
  }
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (descriptor === undefined) {
      values[field] = undefined;
      continue;
    }
    if (!("value" in descriptor)) {
      throw new Error(`${label}.${field} must be an own data property.`);
    }
    values[field] = descriptor.value;
  }
  return values;
}

function withoutUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function contentHashFromLedger(value: string): `sha256:${string}` {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error("Ledger handoff manifest hash is invalid.");
  }
  return value as `sha256:${string}`;
}

function finalOutputIdempotencyKey(
  runId: string,
  taskId: string | undefined,
  runType: AgentSpecialistRunType,
  material: SpecialistHandoffMaterial,
  materialHash: `sha256:${string}`
): string {
  return `specialist-final-output:${runId}:${taskId ?? "none"}:${runType}:${material.status}:${materialHash}`;
}

function finalOutputMatches(
  event: KnowledgeEventOf<"agent.specialist-run.step.recorded">,
  runId: string,
  stepId: string,
  stepSchemaId: string,
  idempotencyKey: string,
  materialHash: `sha256:${string}`,
  inputArtifactHashes: readonly string[],
  outputArtifactHashes: readonly string[]
): boolean {
  return event.payload.runId === runId &&
    event.payload.stepId === stepId &&
    event.payload.stepSchemaId === stepSchemaId &&
    event.payload.idempotencyKey === idempotencyKey &&
    event.payload.handoffMaterialArtifactHash === materialHash &&
    sameOrderedStrings(event.payload.inputArtifactHashes ?? [], inputArtifactHashes) &&
    sameOrderedStrings(event.payload.outputArtifactHashes ?? [], outputArtifactHashes);
}

function assertFinalOutputEventsCanAppendOrReuse(input: {
  readonly events: readonly KnowledgeEventOf<"agent.specialist-run.step.recorded">[];
  readonly runId: string;
  readonly stepId: string;
  readonly stepSchemaId: string;
  readonly idempotencyKey: string;
  readonly materialHash: `sha256:${string}`;
  readonly inputArtifactHashes: readonly string[];
  readonly outputArtifactHashes: readonly string[];
  readonly material: SpecialistHandoffMaterial;
  readonly priorRecorded: KnowledgeEventOf<"agent.specialist-handoff.recorded"> | undefined;
}): KnowledgeEventOf<"agent.specialist-run.step.recorded"> | undefined {
  const exact = input.events.filter((event) => finalOutputMatches(
    event,
    input.runId,
    input.stepId,
    input.stepSchemaId,
    input.idempotencyKey,
    input.materialHash,
    input.inputArtifactHashes,
    input.outputArtifactHashes
  ));
  if (exact.length > 1) {
    throw new Error("Conflicting final-output specialist step exists on the run stream.");
  }
  const conflict = input.events.find((event) =>
    exact[0]?.id !== event.id &&
    !isPriorSupersessionFinalOutput(event, input)
  );
  if (conflict !== undefined) {
    throw new Error("Conflicting final-output specialist step exists on the run stream.");
  }
  return exact[0];
}

function isPriorSupersessionFinalOutput(
  event: KnowledgeEventOf<"agent.specialist-run.step.recorded">,
  input: {
    readonly runId: string;
    readonly stepId: string;
    readonly stepSchemaId: string;
    readonly inputArtifactHashes: readonly string[];
    readonly outputArtifactHashes: readonly string[];
    readonly material: SpecialistHandoffMaterial;
    readonly priorRecorded: KnowledgeEventOf<"agent.specialist-handoff.recorded"> | undefined;
  }
): boolean {
  return input.material.supersedesHandoffId !== undefined &&
    input.material.supersedesEventId !== undefined &&
    input.priorRecorded !== undefined &&
    input.priorRecorded.payload.handoffId === input.material.supersedesHandoffId &&
    input.priorRecorded.id === input.material.supersedesEventId &&
    event.id === input.priorRecorded.payload.finalOutputEventId &&
    event.payload.runId === input.runId &&
    event.payload.stepId === input.stepId &&
    event.payload.stepKind === "final-output" &&
    event.payload.stepSchemaId === input.stepSchemaId &&
    event.payload.handoffMaterialArtifactHash === input.priorRecorded.payload.handoffMaterialArtifactHash &&
    event.payload.idempotencyKey === expectedFinalOutputIdempotencyKeyForBinding(input.priorRecorded.payload) &&
    sameOrderedStrings(event.payload.inputArtifactHashes ?? [], input.inputArtifactHashes) &&
    sameOrderedStrings(event.payload.outputArtifactHashes ?? [], input.outputArtifactHashes);
}

function expectedFinalOutputIdempotencyKeyForBinding(
  payload: KnowledgeEventOf<"agent.specialist-handoff.recorded">["payload"]
): string {
  return `specialist-final-output:${payload.runId}:${payload.taskId ?? "none"}:${payload.runType}:${payload.status}:${payload.handoffMaterialArtifactHash}`;
}

async function selectFinalOutputForHandoff(
  events: readonly KnowledgeEvent[],
  input: RecordSpecialistHandoffInput
): Promise<{
  readonly finalOutput: KnowledgeEventOf<"agent.specialist-run.step.recorded">;
  readonly material: SpecialistHandoffMaterial;
  readonly recorded?: KnowledgeEventOf<"agent.specialist-handoff.recorded">;
}> {
  const expectedStepId = `step_${input.runId}_final_output`;
  const candidates = events.filter((event): event is KnowledgeEventOf<"agent.specialist-run.step.recorded"> =>
    event.type === "agent.specialist-run.step.recorded" &&
    event.payload.runId === input.runId &&
    event.payload.stepKind === "final-output"
  );
  if (candidates.length === 0) {
    throw new Error("A ledger-bound final-output step is required before preparing a specialist handoff.");
  }
  const recordedMaterialHashes = new Set(events
    .filter((event): event is KnowledgeEventOf<"agent.specialist-handoff.recorded"> => event.type === "agent.specialist-handoff.recorded")
    .map((event) => event.payload.handoffMaterialArtifactHash));
  const eligible = candidates.filter((candidate) =>
    candidate.payload.handoffMaterialArtifactHash !== undefined && !recordedMaterialHashes.has(candidate.payload.handoffMaterialArtifactHash)
  );
  if (eligible.length !== 1) {
    const exactRecorded = candidates.findLast((candidate) => candidate.payload.handoffMaterialArtifactHash !== undefined && recordedMaterialHashes.has(candidate.payload.handoffMaterialArtifactHash));
    if (eligible.length === 0 && exactRecorded !== undefined) {
      const materialHash = contentHashFromLedger(exactRecorded.payload.handoffMaterialArtifactHash!);
      const bytes = await input.manifestStore.get(materialHash);
      const recorded = events.findLast((event): event is KnowledgeEventOf<"agent.specialist-handoff.recorded"> =>
        event.type === "agent.specialist-handoff.recorded" &&
        event.payload.runId === input.runId &&
        event.payload.handoffMaterialArtifactHash === exactRecorded.payload.handoffMaterialArtifactHash
      );
      if (recorded === undefined) {
        throw new Error("Recorded specialist handoff material binding is missing from the run stream.");
      }
      const material = parseAndVerifyMaterialBytes(bytes, materialHash);
      assertFinalOutputCandidateAuthority(events, input, exactRecorded, materialHash, material);
      return { finalOutput: exactRecorded, material, recorded };
    }
    throw new Error("A unique ledger-bound final-output material event is required before preparing a specialist handoff.");
  }
  const candidate = eligible[0]!;
  if (candidate.payload.stepId !== expectedStepId || candidate.payload.handoffMaterialArtifactHash === undefined) {
    throw new Error("Final-output step identity or material binding does not match the expected durable handoff binding.");
  }
  const materialHash = contentHashFromLedger(candidate.payload.handoffMaterialArtifactHash);
  const bytes = await input.manifestStore.get(materialHash);
  const material = parseAndVerifyMaterialBytes(bytes, materialHash);
  assertFinalOutputCandidateAuthority(events, input, candidate, materialHash, material);
  return { finalOutput: candidate, material };
}

function assertFinalOutputCandidateAuthority(
  events: readonly KnowledgeEvent[],
  input: Pick<RecordSpecialistHandoffInput, "runId" | "taskId">,
  candidate: KnowledgeEventOf<"agent.specialist-run.step.recorded">,
  materialHash: `sha256:${string}`,
  material: SpecialistHandoffMaterial
): void {
  const started = matchingStartedEvent(events, input.runId, input.taskId);
  if (candidate.payload.stepId !== `step_${input.runId}_final_output` ||
    candidate.payload.stepSchemaId !== authoritativeFinalOutputStepSchemaId(started.payload.runType) ||
    candidate.payload.handoffMaterialArtifactHash !== materialHash ||
    candidate.payload.idempotencyKey !== finalOutputIdempotencyKey(input.runId, input.taskId, started.payload.runType, material, materialHash)) {
    throw new Error("Final-output step schema does not match production authority.");
  }
}

function authoritativeFinalOutputStepSchemaId(runType: AgentSpecialistRunType): string {
  const schemaId = authoritativeProjectedFinalOutputStepSchemaId(runType);
  if (schemaId === undefined) {
    throw new Error("Specialist final-output schema authority is unavailable for this run type.");
  }
  return schemaId;
}

function assertSupersessionCanRecord(
  events: readonly KnowledgeEvent[],
  manifest: SpecialistHandoffManifest,
  prepared: KnowledgeEventOf<"agent.specialist-handoff.prepared">
): void {
  if (manifest.supersedesHandoffId === undefined) return;
  const prior = events.find((event): event is KnowledgeEventOf<"agent.specialist-handoff.recorded"> =>
    event.type === "agent.specialist-handoff.recorded" && event.id === manifest.supersedesEventId
  );
  if (prior === undefined ||
    prior.payload.handoffId !== manifest.supersedesHandoffId ||
    prior.payload.handoffRevision + 1 !== manifest.handoffRevision ||
    prepared.context.causationId !== prior.id) {
    throw new Error("Supersession must bind the next revision to its prior recorded handoff before recording.");
  }
}

async function readRecordedHandoffResult(
  input: RecordSpecialistHandoffInput,
  stream: readonly KnowledgeEvent[],
  recorded: KnowledgeEventOf<"agent.specialist-handoff.recorded">
): Promise<RecordSpecialistHandoffResult> {
  const prepared = stream.find((event): event is KnowledgeEventOf<"agent.specialist-handoff.prepared"> =>
    event.type === "agent.specialist-handoff.prepared" && event.id === recorded.payload.preparedEventId
  );
  if (prepared === undefined) {
    throw new Error("Recorded specialist handoff is missing its prepared ledger binding.");
  }

  const handoffManifestHash = contentHashFromLedger(recorded.payload.handoffManifestHash);
  const bytes = await input.manifestStore.get(handoffManifestHash);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new Error("Recorded specialist handoff manifest readback failed.");
  }
  if (!Buffer.isBuffer(bytes) || hashSpecialistHandoffManifest(parsed) !== handoffManifestHash) {
    throw new Error("Recorded specialist handoff manifest readback failed.");
  }
  const handoff = verifySpecialistHandoffManifest({
    manifest: parsed,
    handoffManifestHash,
    verifiedAt: recorded.payload.verifiedAt
  });
  const manifest = parsed as SpecialistHandoffManifest;
  const binding = compactHandoffBinding(manifest, handoffManifestHash);
  if (
    !sameCanonicalValue(prepared.payload, binding) ||
    !sameCanonicalValue(omitRecordedTimestamp(recorded.payload), binding)
  ) {
    throw new Error("Recorded specialist handoff readback does not match its canonical ledger binding.");
  }
  const projection = await assertHandoffProjection(input.ledger, input.manifestStore, input.runId, input.taskId, "handoff-recorded", "task-completed");
  if (projection.selectedHandoff?.handoffId !== manifest.handoffId) {
    throw new Error("Recorded handoff projection does not select the verified manifest handoff.");
  }
  return Object.freeze({ manifest, handoff, prepared, recorded, manifestStore: input.manifestStore });
}

async function assertHandoffMaterialAuthority(
  ledger: EventLedger,
  store: SpecialistHandoffManifestStore,
  material: SpecialistHandoffMaterial,
  started: KnowledgeEventOf<"agent.specialist-run.started">,
  prior: KnowledgeEventOf<"agent.specialist-handoff.recorded"> | undefined,
  finalOutput: KnowledgeEventOf<"agent.specialist-run.step.recorded"> | undefined
): Promise<void> {
  const events = await ledger.readAll();
  const eventIds = new Set(events.map((event) => event.id));
  const inputHashes = new Set(finalOutput?.payload.inputArtifactHashes ?? canonicalMaterialInputHashes(material));
  const outputHashes = finalOutput?.payload.outputArtifactHashes ?? material.outputArtifacts.map((artifact) => artifact.artifactHash);
  await assertReferencedHandoffArtifactsReadable(store, material);
  const topLevelToolRequestIds = new Set(material.toolRequestIds);
  if (!nestedHandoffToolRequestIds(material).every((toolRequestId) => topLevelToolRequestIds.has(toolRequestId))) {
    throw new Error("Nested specialist handoff tool request refs must be included in top-level ledger-bound tool request refs.");
  }
  if (!sameOrderedStrings(outputHashes, material.outputArtifacts.map((artifact) => artifact.artifactHash)) ||
    !material.contextPackRefs.every((ref) => inputHashes.has(ref.contentHash)) ||
    !material.contextPackRefs.every((ref) => (ref.artifactHashes ?? []).every((hash) => inputHashes.has(hash))) ||
    (material.promptArtifactHash !== undefined && !inputHashes.has(material.promptArtifactHash)) ||
    !material.sourceEventIds.every((id) => eventIds.has(id)) ||
    !material.relatedEventIds.every((id) => eventIds.has(id)) ||
    !material.contextPackRefs.every((ref) => (ref.sourceEventIds ?? []).every((id) => eventIds.has(id))) ||
    !material.toolRequestIds.every((toolRequestId) => events.some((event) =>
      event.type === "agent.tool.requested" &&
      event.payload.toolRequestId === toolRequestId &&
      event.payload.runId === started.payload.runId
    ))) {
    throw new Error("Specialist handoff provenance must be ledger-bound to final-output artifacts and event refs.");
  }
  if (prior === undefined) {
    if (material.supersedesHandoffId !== undefined) throw new Error("Supersession material requires a prior recorded handoff anchor.");
    return;
  }
  if (material.supersedesHandoffId === undefined) {
    if (finalOutput !== undefined && finalOutput.payload.handoffMaterialArtifactHash !== prior.payload.handoffMaterialArtifactHash) {
      throw new Error("New handoff material must carry complete supersession anchors.");
    }
    return;
  }
  if (material.supersedesHandoffId !== prior.payload.handoffId || material.supersedesEventId !== prior.id) {
    throw new Error("Supersession material does not match the complete prior recorded anchor.");
  }
  const priorMaterialHash = contentHashFromLedger(prior.payload.handoffMaterialArtifactHash);
  const priorBytes = await store.get(priorMaterialHash);
  const priorMaterial = parseAndVerifyMaterialBytes(priorBytes, priorMaterialHash);
  const stableAnchors: Array<readonly [unknown, unknown]> = [
    [prior.payload.runId, started.payload.runId],
    [prior.payload.taskId, started.payload.taskId],
    [prior.payload.runType, started.payload.runType],
    [priorMaterial.status, material.status],
    [priorMaterial.contextPackRefs, material.contextPackRefs],
    [priorMaterial.promptArtifactHash, material.promptArtifactHash],
    [priorMaterial.outputArtifacts, material.outputArtifacts],
    [priorMaterial.outputArtifacts.map((item) => item.artifactHash), material.outputArtifacts.map((item) => item.artifactHash)],
    [priorMaterial.toolRequestIds, material.toolRequestIds],
    [priorMaterial.approvalRequirements, material.approvalRequirements],
    [priorMaterial.failure, material.failure],
    [priorMaterial.sourceEventIds, material.sourceEventIds],
    [priorMaterial.relatedEventIds, material.relatedEventIds]
  ];
  if (stableAnchors.some(([left, right]) => !sameCanonicalValue(left, right))) {
    throw new Error("Supersession changed the complete prior handoff anchor.");
  }
}

function nestedHandoffToolRequestIds(
  material: Pick<SpecialistHandoffMaterial, "approvalRequirements" | "nextSafeActions" | "failure">
): readonly string[] {
  const requestIds: string[] = [];
  for (const requirement of material.approvalRequirements) {
    if (requirement.toolRequestId !== undefined) requestIds.push(requirement.toolRequestId);
  }
  for (const action of material.nextSafeActions) {
    if (action.toolRequestId !== undefined) requestIds.push(action.toolRequestId);
  }
  if (material.failure?.toolRequestId !== undefined) {
    requestIds.push(material.failure.toolRequestId);
  }
  return requestIds;
}

async function assertReferencedHandoffArtifactsReadable(
  store: SpecialistHandoffManifestStore,
  material: SpecialistHandoffMaterial
): Promise<void> {
  for (const hash of referencedHandoffArtifactHashes(material)) {
    let bytes: Buffer;
    try {
      bytes = await store.get(hash);
    } catch {
      throw new Error("Referenced handoff artifact is missing from the content-addressed store.");
    }
    if (!Buffer.isBuffer(bytes) || hashSpecialistArtifactBytes(bytes) !== hash) {
      throw new Error("Referenced handoff artifact bytes do not match their content-addressed hash.");
    }
  }
}

function referencedHandoffArtifactHashes(material: SpecialistHandoffMaterial): readonly `sha256:${string}`[] {
  return Object.freeze([...new Set([
    ...material.contextPackRefs.map((ref) => ref.contentHash),
    ...material.contextPackRefs.flatMap((ref) => ref.artifactHashes ?? []),
    ...(material.promptArtifactHash === undefined ? [] : [material.promptArtifactHash]),
    ...material.outputArtifacts.map((artifact) => artifact.artifactHash)
  ])].sort()) as readonly `sha256:${string}`[];
}

function matchingStartedEvent(
  events: readonly KnowledgeEvent[],
  runId: string,
  taskId: string | undefined
): KnowledgeEventOf<"agent.specialist-run.started"> {
  const matches = events.filter((event): event is KnowledgeEventOf<"agent.specialist-run.started"> =>
    event.type === "agent.specialist-run.started" && event.payload.runId === runId && event.payload.residentAgentId === "agent_default"
  );
  if (matches.length !== 1) throw new Error("Specialist final-output requires one ledger-bound run identity.");
  const started = matches[0]!;
  if (started.payload.taskId !== taskId) throw new Error("Specialist final-output requires one ledger-bound run identity.");
  return started;
}

function latestRecordedHandoff(events: readonly KnowledgeEvent[]): KnowledgeEventOf<"agent.specialist-handoff.recorded"> | undefined {
  return events.findLast((event): event is KnowledgeEventOf<"agent.specialist-handoff.recorded"> => event.type === "agent.specialist-handoff.recorded");
}

function priorRecordedForMaterial(
  events: readonly KnowledgeEvent[],
  material: SpecialistHandoffMaterial
): KnowledgeEventOf<"agent.specialist-handoff.recorded"> | undefined {
  if (material.supersedesEventId !== undefined) {
    return events.find((event): event is KnowledgeEventOf<"agent.specialist-handoff.recorded"> =>
      event.type === "agent.specialist-handoff.recorded" && event.id === material.supersedesEventId
    );
  }
  return latestRecordedHandoff(events);
}

function parseAndVerifyMaterialBytes(bytes: Buffer, expectedHash: `sha256:${string}`): SpecialistHandoffMaterial {
  if (!Buffer.isBuffer(bytes) || hashSpecialistArtifactBytes(bytes) !== expectedHash) {
    throw new Error("Handoff material bytes do not match the ledger-bound content hash.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("Handoff material bytes are not canonical JSON."); }
  const material = parseSpecialistHandoffMaterial(parsed);
  if (!canonicalSpecialistHandoffMaterialBytes(material).equals(bytes)) {
    throw new Error("Handoff material bytes are not the exact canonical representation.");
  }
  return material;
}

function canonicalMaterialInputHashes(material: SpecialistHandoffMaterial): `sha256:${string}`[] {
  return [...new Set([
    ...material.contextPackRefs.map((ref) => ref.contentHash),
    ...material.contextPackRefs.flatMap((ref) => ref.artifactHashes ?? []),
    ...(material.promptArtifactHash === undefined ? [] : [material.promptArtifactHash])
  ])].sort() as `sha256:${string}`[];
}

function stateKindForHandoffStatus(status: SpecialistWorkflowHandoffDto["status"]): "completed" | "failed" | "resumable" {
  return status === "failed" ? "failed" : status === "ready-for-review" ? "completed" : "resumable";
}

function compactHandoffBinding(
  manifest: SpecialistHandoffManifest,
  handoffManifestHash: `sha256:${string}`
): KnowledgeEventOf<"agent.specialist-handoff.prepared">["payload"] {
  return {
    handoffId: manifest.handoffId,
    handoffRevision: manifest.handoffRevision,
    idempotencyKey: `specialist-handoff:${manifest.runId}:${manifest.taskId ?? "none"}:${manifest.runType}:${manifest.status}:${handoffManifestHash}`,
    handoffManifestHash,
    handoffDtoHash: manifest.handoffDtoHash,
    handoffMaterialArtifactHash: manifest.handoffMaterialArtifactHash,
    runId: manifest.runId,
    ...(manifest.taskId === undefined ? {} : { taskId: manifest.taskId }),
    runType: manifest.runType as AgentSpecialistRunType,
    residentAgentId: manifest.residentAgentId,
    status: manifest.status,
    safeSummary: manifest.safeSummary,
    finalOutputStepId: manifest.finalOutputStepId,
    finalOutputEventId: manifest.finalOutputEventId,
    contextPackHashes: manifest.contextPackRefs.map((ref) => ref.contentHash),
    ...(manifest.promptArtifactHash === undefined ? {} : { promptArtifactHash: manifest.promptArtifactHash }),
    outputArtifactHashes: manifest.outputArtifacts.map((artifact) => artifact.artifactHash),
    toolRequestIds: [...manifest.toolRequestIds],
    sourceEventIds: [...manifest.sourceEventIds],
    relatedEventIds: [...manifest.relatedEventIds],
    ...(manifest.supersedesHandoffId === undefined ? {} : { supersedesHandoffId: manifest.supersedesHandoffId }),
    ...(manifest.supersedesEventId === undefined ? {} : { supersedesEventId: manifest.supersedesEventId })
  };
}

async function appendWithExactRaceRecovery<Event extends KnowledgeEvent>(input: {
  readonly ledger: EventLedger;
  readonly streamId: string;
  readonly expectedNextSequence: number;
  readonly event: AppendableKnowledgeEvent;
  readonly findExact: (events: readonly KnowledgeEvent[]) => Event | undefined;
  readonly validateReread?: (events: readonly KnowledgeEvent[]) => void;
  readonly conflictMessage: string;
}): Promise<Event> {
  try {
    return await input.ledger.append(input.event, { expectedNextSequence: input.expectedNextSequence }) as Event;
  } catch (error) {
    if (!isConcurrencyConflict(error)) throw error;
    const events = await input.ledger.readStream(input.streamId);
    input.validateReread?.(events);
    const exact = input.findExact(events);
    if (exact !== undefined) return exact;
    throw new Error(input.conflictMessage);
  }
}

async function appendOrReusePreparedHandoff(
  input: ResolvedRecordSpecialistHandoffInput,
  stream: readonly KnowledgeEvent[],
  binding: KnowledgeEventOf<"agent.specialist-handoff.prepared">["payload"],
  finalOutput: KnowledgeEventOf<"agent.specialist-run.step.recorded">
): Promise<KnowledgeEventOf<"agent.specialist-handoff.prepared">> {
  const prepared = stream.filter((event): event is KnowledgeEventOf<"agent.specialist-handoff.prepared"> =>
    event.type === "agent.specialist-handoff.prepared" && event.payload.runId === input.runId
  );
  if (prepared.length > 0) {
    const exact = prepared.find((event) => sameCanonicalValue(event.payload, binding));
    if (exact !== undefined) {
      return exact;
    }
    if (binding.supersedesHandoffId === undefined) {
      throw new Error("Conflicting prepared specialist handoff exists on the run stream.");
    }
  }
  const event: AppendableKnowledgeEvent<"agent.specialist-handoff.prepared"> = {
    type: "agent.specialist-handoff.prepared",
    version: 1,
    streamId: `agent_run_${input.runId}`,
    context: {
      actor: input.actor,
      occurredAt: finalOutput.context.occurredAt,
      causationId: binding.supersedesEventId ?? finalOutput.id,
      correlationId: `corr_${input.runId}_handoff_prepared`,
      coreVersion: agentCoreVersion,
      packVersions: agentPackVersions
    },
    payload: binding
  };
  return await appendWithExactRaceRecovery({
    ledger: input.ledger,
    streamId: `agent_run_${input.runId}`,
    expectedNextSequence: expectedNextSequenceFromStream(stream),
    event,
    findExact: (events) => events.find((candidate): candidate is KnowledgeEventOf<"agent.specialist-handoff.prepared"> =>
      candidate.type === "agent.specialist-handoff.prepared" && sameCanonicalValue(candidate.payload, binding)
    ),
    validateReread: (events) => {
      const prepared = events.filter((candidate): candidate is KnowledgeEventOf<"agent.specialist-handoff.prepared"> => candidate.type === "agent.specialist-handoff.prepared");
      if (prepared.some((candidate) => candidate.payload.handoffId === binding.handoffId && !sameCanonicalValue(candidate.payload, binding)) ||
        (binding.supersedesHandoffId === undefined && prepared.some((candidate) => !sameCanonicalValue(candidate.payload, binding)))) {
        throw new Error("Conflicting prepared specialist handoff exists on the run stream.");
      }
    },
    conflictMessage: "Conflicting prepared specialist handoff exists on the run stream."
  });
}

async function appendOrReuseRecordedHandoff(
  input: ResolvedRecordSpecialistHandoffInput,
  stream: readonly KnowledgeEvent[],
  binding: KnowledgeEventOf<"agent.specialist-handoff.prepared">["payload"],
  prepared: KnowledgeEventOf<"agent.specialist-handoff.prepared">
): Promise<KnowledgeEventOf<"agent.specialist-handoff.recorded">> {
  const existing = stream.filter((event): event is KnowledgeEventOf<"agent.specialist-handoff.recorded"> =>
    event.type === "agent.specialist-handoff.recorded" && event.payload.runId === input.runId
  );
  if (existing.length > 0) {
    const exact = existing.find((event) =>
      event.payload.preparedEventId === prepared.id &&
      sameCanonicalValue(omitRecordedTimestamp(event.payload), binding)
    );
    if (exact !== undefined) {
      return exact;
    }
    if (binding.supersedesHandoffId === undefined) {
      throw new Error("Conflicting recorded specialist handoff exists on the run stream.");
    }
  }
  const verifiedAt = input.now();
  const event: AppendableKnowledgeEvent<"agent.specialist-handoff.recorded"> = {
    type: "agent.specialist-handoff.recorded",
    version: 1,
    streamId: `agent_run_${input.runId}`,
    context: {
      actor: input.actor,
      occurredAt: verifiedAt,
      causationId: prepared.id,
      correlationId: `corr_${input.runId}_handoff_recorded`,
      coreVersion: agentCoreVersion,
      packVersions: agentPackVersions
    },
    payload: {
      ...binding,
      preparedEventId: prepared.id,
      verifiedAt
    }
  };
  return await appendWithExactRaceRecovery({
    ledger: input.ledger,
    streamId: `agent_run_${input.runId}`,
    expectedNextSequence: expectedNextSequenceFromStream(stream),
    event,
    findExact: (events) => events.find((candidate): candidate is KnowledgeEventOf<"agent.specialist-handoff.recorded"> =>
      candidate.type === "agent.specialist-handoff.recorded" &&
      candidate.payload.preparedEventId === prepared.id &&
      sameCanonicalValue(omitRecordedTimestamp(candidate.payload), binding)
    ),
    validateReread: (events) => {
      const recorded = events.filter((candidate): candidate is KnowledgeEventOf<"agent.specialist-handoff.recorded"> => candidate.type === "agent.specialist-handoff.recorded");
      if (recorded.some((candidate) =>
        (candidate.payload.preparedEventId === prepared.id || candidate.payload.handoffId === binding.handoffId) &&
        (candidate.payload.preparedEventId !== prepared.id || !sameCanonicalValue(omitRecordedTimestamp(candidate.payload), binding))
      ) || (binding.supersedesHandoffId === undefined && recorded.some((candidate) => !sameCanonicalValue(omitRecordedTimestamp(candidate.payload), binding)))) {
        throw new Error("Conflicting recorded specialist handoff exists on the run stream.");
      }
    },
    conflictMessage: "Conflicting recorded specialist handoff exists on the run stream."
  });
}

async function resolveFinalizationReadback(
  ledger: EventLedger,
  result: RecordSpecialistHandoffResult
): Promise<{
  readonly manifest: SpecialistHandoffManifest;
  readonly recorded: KnowledgeEventOf<"agent.specialist-handoff.recorded">;
  readonly manifestStore: SpecialistHandoffManifestStore;
}> {
  assertManifestStoreAvailable(result.manifestStore);
  const suppliedRecorded = result.recorded;
  const stream = await ledger.readStream(`agent_run_${suppliedRecorded.payload.runId}`);
  const recorded = stream.find((event): event is KnowledgeEventOf<"agent.specialist-handoff.recorded"> =>
    event.type === "agent.specialist-handoff.recorded" && event.id === suppliedRecorded.id
  );
  if (recorded === undefined || !sameCanonicalValue(recorded, suppliedRecorded)) {
    throw new Error("Finalization recorded event does not match ledger readback.");
  }
  const prepared = stream.find((event): event is KnowledgeEventOf<"agent.specialist-handoff.prepared"> =>
    event.type === "agent.specialist-handoff.prepared" && event.id === recorded.payload.preparedEventId
  );
  if (prepared === undefined || !sameCanonicalValue(prepared, result.prepared)) {
    throw new Error("Finalization prepared event does not match ledger readback.");
  }
  const handoffManifestHash = contentHashFromLedger(recorded.payload.handoffManifestHash);
  const bytes = await result.manifestStore.get(handoffManifestHash);
  if (!Buffer.isBuffer(bytes)) {
    throw new Error("Finalization manifest readback did not return bytes.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Finalization manifest readback is malformed.");
  }
  if (hashSpecialistHandoffManifest(parsed) !== handoffManifestHash) {
    throw new Error("Finalization manifest hash does not match ledger readback.");
  }
  const handoff = verifySpecialistHandoffManifest({
    manifest: parsed,
    handoffManifestHash
  });
  const manifest = parsed as SpecialistHandoffManifest;
  if (!sameCanonicalValue(manifest, result.manifest) ||
    !sameCanonicalValue(handoff, result.handoff) ||
    !sameCanonicalValue(omitRecordedTimestamp(recorded.payload), compactHandoffBinding(manifest, handoffManifestHash))) {
    throw new Error("Finalization caller state does not match canonical ledger readback.");
  }
  const projection = await assertHandoffProjection(ledger, result.manifestStore, manifest.runId, manifest.taskId, "handoff-recorded", "task-completed");
  if (projection.selectedHandoff === undefined || !sameCanonicalValue(projection.selectedHandoff, handoff)) {
    throw new Error("Finalization handoff projection does not match canonical ledger readback.");
  }
  return Object.freeze({ manifest, recorded, manifestStore: result.manifestStore });
}

async function assertHandoffProjection(
  ledger: EventLedger,
  manifestStore: SpecialistHandoffManifestStore,
  runId: string,
  taskId: string | undefined,
  expectedState: "handoff-pending" | "handoff-recorded" | "task-completed",
  ...acceptedStates: readonly ("handoff-pending" | "handoff-recorded" | "task-completed")[]
) {
  const projection = await buildSpecialistHandoffProjection({
    events: await ledger.readAll(),
    manifestReader: manifestStore,
    runId,
    ...(taskId === undefined ? {} : { taskId })
  });
  const conflict = projection.diagnostics.find((diagnostic) => diagnostic.code.startsWith("conflicting-"));
  if (conflict !== undefined) {
    throw new Error(`Specialist handoff ${conflict.code} projection verification failed.`);
  }
  if ((projection.state !== expectedState && !acceptedStates.some((state) => state === projection.state)) || projection.diagnostics.length > 0) {
    throw new Error(`Specialist handoff ${expectedState} projection verification failed.`);
  }
  return projection;
}

async function assertPreparedHandoffProjection(
  ledger: EventLedger,
  manifestStore: SpecialistHandoffManifestStore,
  runId: string,
  taskId: string | undefined,
  preparedEventId: string
): Promise<void> {
  const projection = await buildSpecialistHandoffProjection({
    events: await ledger.readAll(),
    manifestReader: manifestStore,
    runId,
    ...(taskId === undefined ? {} : { taskId })
  });
  if (projection.diagnostics.length > 0 || !projection.history.some((entry) => entry.preparedEventId === preparedEventId)) {
    throw new Error(`Specialist handoff prepared projection verification failed: ${projection.diagnostics.map((item) => `${item.code}:${item.message}`).join(",") || "missing-prepared"}.`);
  }
}

async function appendOrReuseTerminalRun(
  input: FinalizeSpecialistRunAfterHandoffInput,
  manifest: SpecialistHandoffManifest,
  recorded: KnowledgeEventOf<"agent.specialist-handoff.recorded">,
  stream: readonly KnowledgeEvent[]
): Promise<KnowledgeEventOf<"agent.specialist-run.completed"> | KnowledgeEventOf<"agent.specialist-run.failed">> {
  const terminal = stream.filter((event): event is KnowledgeEventOf<"agent.specialist-run.completed"> | KnowledgeEventOf<"agent.specialist-run.failed"> =>
    event.type === "agent.specialist-run.completed" || event.type === "agent.specialist-run.failed"
  );
  const expectedType = manifest.status === "failed" ? "agent.specialist-run.failed" : "agent.specialist-run.completed";
  if (terminal.length > 0) {
    const exact = terminal.find((event) => terminalMatchesRecordedHandoff(event, manifest, recorded));
    if (exact !== undefined && terminal.length === 1) return exact;
    throw new Error("Conflicting terminal specialist run event exists on the run stream.");
  }
  const commonContext = {
    actor: input.actor,
    occurredAt: input.now(),
    causationId: recorded.id,
    correlationId: `corr_${manifest.runId}_${manifest.status === "failed" ? "failed" : "completed"}`,
    coreVersion: agentCoreVersion,
    packVersions: agentPackVersions
  };
  if (expectedType === "agent.specialist-run.failed") {
    const failure = manifest.failure;
    if (failure === undefined) throw new Error("A verified failed handoff must include failure details.");
    const event: AppendableKnowledgeEvent<"agent.specialist-run.failed"> = {
      type: "agent.specialist-run.failed",
      version: 1,
      streamId: `agent_run_${manifest.runId}`,
      context: commonContext,
      payload: {
        runId: manifest.runId,
        failedAt: commonContext.occurredAt,
        category: failure.category as AgentFailureCategory,
        message: failure.safeSummary,
        retryable: failure.retryable,
        allowedActions: ["inspect-handoff"],
        relatedEventIds: [recorded.id]
      }
    };
    return await appendWithExactRaceRecovery({
      ledger: input.ledger,
      streamId: `agent_run_${manifest.runId}`,
      expectedNextSequence: expectedNextSequenceFromStream(stream),
      event,
      findExact: (events) => events.find((candidate): candidate is KnowledgeEventOf<"agent.specialist-run.failed"> =>
        candidate.type === "agent.specialist-run.failed" && terminalMatchesRecordedHandoff(candidate, manifest, recorded)
      ),
      validateReread: (events) => assertNoConflictingTerminal(events, manifest, recorded),
      conflictMessage: "Conflicting terminal specialist run event exists on the run stream."
    });
  }
  const event: AppendableKnowledgeEvent<"agent.specialist-run.completed"> = {
    type: "agent.specialist-run.completed",
    version: 1,
    streamId: `agent_run_${manifest.runId}`,
    context: commonContext,
    payload: {
      runId: manifest.runId,
      completedAt: commonContext.occurredAt,
      outputArtifactHashes: manifest.outputArtifacts.map((artifact) => artifact.artifactHash),
      relatedEventIds: [recorded.id],
      summary: manifest.safeSummary
    }
  };
  return await appendWithExactRaceRecovery({
    ledger: input.ledger,
    streamId: `agent_run_${manifest.runId}`,
    expectedNextSequence: expectedNextSequenceFromStream(stream),
    event,
    findExact: (events) => events.find((candidate): candidate is KnowledgeEventOf<"agent.specialist-run.completed"> =>
      candidate.type === "agent.specialist-run.completed" && terminalMatchesRecordedHandoff(candidate, manifest, recorded)
    ),
    validateReread: (events) => assertNoConflictingTerminal(events, manifest, recorded),
    conflictMessage: "Conflicting terminal specialist run event exists on the run stream."
  });
}

function terminalMatchesRecordedHandoff(
  event: KnowledgeEventOf<"agent.specialist-run.completed"> | KnowledgeEventOf<"agent.specialist-run.failed">,
  manifest: SpecialistHandoffManifest,
  recorded: KnowledgeEventOf<"agent.specialist-handoff.recorded">
): boolean {
  if (event.context.causationId !== recorded.id || event.payload.runId !== manifest.runId) return false;
  if (manifest.status === "failed") {
    return event.type === "agent.specialist-run.failed" &&
      event.payload.category === manifest.failure?.category &&
      event.payload.message === manifest.failure?.safeSummary &&
      event.payload.retryable === manifest.failure.retryable &&
      sameOrderedStrings(event.payload.allowedActions, ["inspect-handoff"]) &&
      sameOrderedStrings(event.payload.relatedEventIds ?? [], [recorded.id]);
  }
  return event.type === "agent.specialist-run.completed" &&
    event.payload.summary === manifest.safeSummary &&
    sameOrderedStrings(event.payload.outputArtifactHashes, manifest.outputArtifacts.map((artifact) => artifact.artifactHash)) &&
    sameOrderedStrings(event.payload.relatedEventIds ?? [], [recorded.id]);
}

function assertNoConflictingTerminal(
  events: readonly KnowledgeEvent[],
  manifest: SpecialistHandoffManifest,
  recorded: KnowledgeEventOf<"agent.specialist-handoff.recorded">
): void {
  if (events.some((event) =>
    (event.type === "agent.specialist-run.completed" || event.type === "agent.specialist-run.failed") &&
    !terminalMatchesRecordedHandoff(event, manifest, recorded)
  )) {
    throw new Error("Conflicting terminal specialist run event exists on the run stream.");
  }
}

function omitRecordedTimestamp(payload: KnowledgeEventOf<"agent.specialist-handoff.recorded">["payload"]) {
  const { preparedEventId: _preparedEventId, verifiedAt: _verifiedAt, ...binding } = payload;
  return binding;
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return canonicalSpecialistHandoffJson(left).equals(canonicalSpecialistHandoffJson(right));
}

function assertManifestStoreAvailable(store: SpecialistHandoffManifestStore): void {
  if (typeof store?.put !== "function" || typeof store?.get !== "function") {
    throw new Error("Specialist handoff manifest store get dependency is unavailable.");
  }
}

export function hashSpecialistLocalArtifact(value: unknown): `sha256:${string}` {
  return hashSpecialistArtifactBytes(serializeSpecialistLocalArtifact(value));
}

export function serializeSpecialistLocalArtifact(value: unknown): Buffer {
  return Buffer.from(stableSpecialistJson(normalizeSpecialistJsonValue(value, "Specialist derivative artifact")), "utf8");
}

export function normalizeSpecialistJsonValue(value: unknown, label: string): unknown {
  return normalizeSpecialistJsonValueInner(value, label, new WeakSet<object>());
}

export function assertSpecialistDerivativeStoreAvailable(input: SpecialistRunnerBaseInput): void {
  if (input.derivativeStore === undefined || typeof input.derivativeStore.put !== "function") {
    throw new Error("Specialist derivative artifact store is required before model invocation.");
  }
}

export function createSpecialistDerivativeArtifactStore(
  blobStore: SpecialistMountedDerivativeBlobStore
): SpecialistDerivativeArtifactStore {
  if (blobStore === undefined || typeof blobStore.put !== "function") {
    throw new Error("Mounted derivative blob store is required.");
  }
  return Object.freeze({
    async put(content: Buffer): Promise<{ readonly contentHash: `sha256:${string}`; readonly sizeBytes: number }> {
      const stored = normalizeMountedDerivativeStoreResult(await blobStore.put(content));
      return Object.freeze({
        contentHash: stored.contentHash,
        sizeBytes: stored.sizeBytes
      });
    }
  });
}

export async function writeSpecialistDerivativeArtifact(input: {
  readonly derivativeStore?: SpecialistDerivativeArtifactStore | undefined;
  readonly artifactKind: string;
  readonly payload: unknown;
}): Promise<StoredSpecialistDerivativeArtifact> {
  if (input.derivativeStore === undefined || typeof input.derivativeStore.put !== "function") {
    throw new Error(`Specialist derivative artifact store is required before writing ${input.artifactKind}.`);
  }
  const bytes = serializeSpecialistLocalArtifact(input.payload);
  const expectedHash = hashSpecialistArtifactBytes(bytes);
  const stored = normalizeDerivativeStoreResult(
    await input.derivativeStore.put(bytes),
    input.artifactKind
  );
  if (!/^sha256:[a-f0-9]{64}$/.test(stored.contentHash)) {
    throw new Error(`Specialist derivative store returned an invalid hash for ${input.artifactKind}.`);
  }
  if (stored.contentHash !== expectedHash) {
    throw new Error(`Specialist derivative store returned a stale hash for ${input.artifactKind}.`);
  }
  if (stored.sizeBytes !== bytes.byteLength) {
    throw new Error(`Specialist derivative store returned a stale byte count for ${input.artifactKind}.`);
  }
  return Object.freeze({ artifactHash: stored.contentHash, sizeBytes: stored.sizeBytes });
}

function normalizeDerivativeStoreResult(
  value: unknown,
  artifactKind: string
): { readonly contentHash: `sha256:${string}`; readonly sizeBytes: number } {
  const normalized = normalizeSpecialistJsonValue(
    value,
    `Specialist derivative store result for ${artifactKind}`
  );
  if (normalized === null || typeof normalized !== "object" || Array.isArray(normalized)) {
    throw new Error(`Specialist derivative store result for ${artifactKind} must be a plain object.`);
  }
  const record = normalized as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== "contentHash" || keys[1] !== "sizeBytes") {
    throw new Error(`Specialist derivative store result for ${artifactKind} must contain exactly contentHash and sizeBytes.`);
  }
  const contentHash = record.contentHash;
  const sizeBytes = record.sizeBytes;
  if (typeof contentHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(contentHash)) {
    throw new Error(`Specialist derivative store returned an invalid hash for ${artifactKind}.`);
  }
  if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new Error(`Specialist derivative store returned an invalid byte count for ${artifactKind}.`);
  }
  return Object.freeze({
    contentHash: contentHash as `sha256:${string}`,
    sizeBytes
  });
}

function normalizeMountedDerivativeStoreResult(
  value: unknown
): { readonly contentHash: `sha256:${string}`; readonly sizeBytes: number } {
  const normalized = normalizeSpecialistJsonValue(
    value,
    "Mounted specialist derivative blob store result"
  );
  if (normalized === null || typeof normalized !== "object" || Array.isArray(normalized)) {
    throw new Error("Mounted specialist derivative blob store result must be a plain object.");
  }
  const record = normalized as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== "contentHash" ||
    keys[1] !== "path" ||
    keys[2] !== "sizeBytes"
  ) {
    throw new Error("Mounted specialist derivative blob store result must contain contentHash, path, and sizeBytes.");
  }
  const contentHash = record.contentHash;
  const sizeBytes = record.sizeBytes;
  const path = record.path;
  if (typeof contentHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(contentHash)) {
    throw new Error("Mounted specialist derivative blob store returned an invalid hash.");
  }
  if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new Error("Mounted specialist derivative blob store returned an invalid byte count.");
  }
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("Mounted specialist derivative blob store returned an invalid path marker.");
  }
  return Object.freeze({
    contentHash: contentHash as `sha256:${string}`,
    sizeBytes
  });
}

function hashSpecialistArtifactBytes(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function normalizeSpecialistJsonValueInner(value: unknown, label: string, seen: WeakSet<object>): unknown {
  if (value === null) {
    return null;
  }
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error(`${label} must not contain non-finite numbers.`);
      }
      return value;
    case "object":
      if (Array.isArray(value)) {
        return normalizeSpecialistJsonArray(value, label, seen);
      }
      return normalizeSpecialistJsonObject(value, label, seen);
    default:
      throw new Error(`${label} must be JSON-serializable.`);
  }
}

function normalizeSpecialistJsonArray(value: readonly unknown[], label: string, seen: WeakSet<object>): readonly unknown[] {
  if (seen.has(value)) {
    throw new Error(`${label} contains a cycle.`);
  }
  seen.add(value);
  try {
    rejectSymbolKeys(value, label);
    const ownNames = Object.getOwnPropertyNames(value);
    const allowed = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
    for (const key of ownNames) {
      if (!allowed.has(key)) {
        throw new Error(`${label} contains an unsupported array property.`);
      }
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (lengthDescriptor === undefined || !("value" in lengthDescriptor) || typeof lengthDescriptor.value !== "number") {
      throw new Error(`${label} has an invalid array length descriptor.`);
    }
    const items: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined) {
        throw new Error(`${label} must not contain sparse arrays.`);
      }
      if (!descriptor.enumerable || !("value" in descriptor)) {
        throw new Error(`${label} array items must be enumerable data properties.`);
      }
      items.push(normalizeSpecialistJsonValueInner(descriptor.value, `${label}[${index}]`, seen));
    }
    return Object.freeze(items);
  } finally {
    seen.delete(value);
  }
}

function normalizeSpecialistJsonObject(value: object, label: string, seen: WeakSet<object>): Readonly<Record<string, unknown>> {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must use plain JSON objects.`);
  }
  if (seen.has(value)) {
    throw new Error(`${label} contains a cycle.`);
  }
  seen.add(value);
  try {
    rejectSymbolKeys(value, label);
    const enumerableKeys = Object.keys(value);
    const ownNames = Object.getOwnPropertyNames(value);
    if (ownNames.length !== enumerableKeys.length) {
      throw new Error(`${label} must not contain non-enumerable properties.`);
    }
    const clone: Record<string, unknown> = {};
    for (const key of enumerableKeys) {
      if (unsafeJsonObjectKeys.has(key)) {
        throw new Error(`${label} contains an unsafe key.`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new Error(`${label} must contain only own enumerable data properties.`);
      }
      clone[key] = normalizeSpecialistJsonValueInner(descriptor.value, `${label}.${key}`, seen);
    }
    return Object.freeze(clone);
  } finally {
    seen.delete(value);
  }
}

function rejectSymbolKeys(value: object, label: string): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must not contain symbol-keyed properties.`);
  }
}

function stableSpecialistJson(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string":
    case "boolean":
    case "number":
      return JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) {
        return `[${stableSpecialistJsonArray(value)}]`;
      }
      return stableSpecialistObjectJson(value);
    default:
      throw new Error("Specialist derivative artifacts must be JSON-serializable.");
  }
}

function stableSpecialistJsonArray(value: readonly unknown[]): string {
  const parts: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error("Specialist derivative artifact array was not normalized.");
    }
    parts.push(stableSpecialistJson(descriptor.value));
  }
  return parts.join(",");
}

function stableSpecialistObjectJson(value: object): string {
  const entries = Object.keys(value).sort().map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error("Specialist derivative artifact object was not normalized.");
    }
    return `${JSON.stringify(key)}:${stableSpecialistJson(descriptor.value)}`;
  });
  return `{${entries.join(",")}}`;
}

export function governanceLockIsActive(contextPackRefs: readonly ContextPackRef[]): boolean {
  return contextPackRefs.some((ref) =>
    ref.contextPackId === "governance-locks.v1" &&
    (
      typedGovernanceLockIsActive(ref) ||
      /\b(?:active|present|open|blocking)\b.{0,80}\b(?:governance|legal|export|quarantine|sensitive|provider-transfer|policy|data-loss)?[-\s]?lock\b/i.test(ref.safeSummary)
    )
  );
}

function typedGovernanceLockIsActive(ref: ContextPackRef): boolean {
  return (ref.stalenessInputs ?? []).some((input) =>
    /^(?:active-)?(?:governance|legal|export|quarantine|sensitive|provider-transfer|policy|data-loss)?-?lock(?:-active)?$/i.test(input.kind) ||
    (/^active-lock-count$/i.test(input.kind) && Number(input.value) > 0)
  );
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
