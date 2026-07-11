import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import type { ActorRef, AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
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
import { hashAgentToolPreview } from "./tool-gateway.js";

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

export interface SpecialistDerivativeArtifactStore {
  put(content: Buffer): Promise<{
    readonly contentHash: `sha256:${string}`;
    readonly sizeBytes: number;
  }>;
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
  const result = await input.runtime.invokeModel({
    invocationId,
    runId: input.runId,
    providerId: input.providerId,
    modelFamily: input.modelFamily,
    inputArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    safetyClass: prepared.promptArtifact.manifest.safetyClass,
    credentialRef: input.credentialRef,
    promptArtifact: prepared.promptArtifact,
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

async function assertProviderReadinessAllowsInvocation(
  input: SpecialistRunnerBaseInput,
  promptArtifact: PromptArtifactEnvelope
): Promise<void> {
  assertPromptArtifactCanTransferToRemoteProvider(promptArtifact);
  const card = providerReadinessCards(input.providerReadiness).find((candidate) => candidate.providerId === input.providerId);
  if (card === undefined) {
    throw new Error("Selected provider readiness is unavailable for specialist invocation.");
  }
  if (card.state === "ready" || card.state === "works-locally") {
    return;
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
  throw new Error("Selected provider readiness is not ready for specialist invocation.");
}

async function assertProviderByteTransferApproved(
  input: SpecialistRunnerBaseInput,
  currentCard: ProviderSetupCard,
  promptArtifact: PromptArtifactEnvelope
): Promise<void> {
  const proof = input.providerTransferApproval;
  if (proof === undefined) {
    throw new Error("Provider byte-transfer approval is required before remote specialist invocation.");
  }
  const promptAudit = promptArtifactAuditMetadata(promptArtifact);
  const current = await rebuildProviderByteTransferCurrentPreview(proof.currentPreviewInput);
  if (current.activeLocks.length > 0) {
    throw new Error("Provider byte-transfer approval proof includes active locks.");
  }
  const preview = current.preview;
  const previewHash = hashAgentToolPreview(current.preview);
  if (previewHash !== proof.approvedPreviewHash) {
    throw new Error("Provider byte-transfer approval preview hash does not match the current preview.");
  }
  if (
    preview.runId !== input.runId ||
    preview.taskId !== input.taskId ||
    preview.residentAgentId !== "agent_default" ||
    preview.providerId !== input.providerId ||
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
