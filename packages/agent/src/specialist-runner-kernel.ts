import { createHash } from "node:crypto";
import type { ActorRef, AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import {
  rebuildProviderByteTransferCurrentPreview,
  type RebuildProviderByteTransferCurrentPreviewInput
} from "./adapters/provider-byte-transfer.js";
import {
  buildPromptArtifact,
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
import type { ContextPackRef, ContextPackRegistry } from "./context-packs.js";
import type { AgentFailureCategory } from "./projection-types.js";
import { specialistWorkflowDescriptorFor, type SpecialistWorkflowDescriptor } from "./specialist-workflows.js";
import type { AgentSpecialistRunType } from "./specialists.js";
import { hashAgentToolPreview } from "./tool-gateway.js";

const agentCoreVersion = "0.1.0";
const agentPackVersions = { core: "0.1.0", agent: "0.1.0" } as const;

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

export interface SpecialistRunnerBaseInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly contextPacks: ContextPackRegistry;
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
}

export interface PreparedSpecialistRun {
  readonly descriptor: SpecialistWorkflowDescriptor;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly promptArtifact: PromptArtifactEnvelope;
}

export async function prepareSpecialistRun(
  input: SpecialistRunnerBaseInput,
  runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">
): Promise<PreparedSpecialistRun> {
  const descriptor = specialistWorkflowDescriptorFor(runType);
  const run = buildAgentProjection(await input.ledger.readAll()).runs.get(input.runId);
  if (run === undefined || run.runType !== runType || run.residentAgentId !== "agent_default") {
    throw new Error("Specialist workflow requires a matching agent_default run.");
  }
  if (run.taskId !== input.taskId) {
    throw new Error("Specialist workflow task does not match the target run.");
  }

  const contextPackRefs = await Promise.all(
    descriptor.contextPacks.map(async (requirement) => await input.contextPacks.build(requirement.contextPackId))
  );
  const generated = buildPromptArtifact({
    promptTemplateId: descriptor.promptTemplate.promptTemplateId,
    promptTemplateVersion: descriptor.promptTemplate.promptTemplateVersion,
    generatedAt: input.now(),
    runType,
    safetyClass: "workspace-safe",
    transferApprovalClass: "none",
    contextPackRefs,
    text: promptText(runType, contextPackRefs),
    safeSummary: `${descriptor.label} prompt contains safe context-pack references only.`
  });
  const promptArtifact = input.promptArtifact ?? generated;
  assertPromptMatchesRun(promptArtifact, runType, contextPackRefs);

  return Object.freeze({ descriptor, contextPackRefs: Object.freeze(contextPackRefs), promptArtifact });
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
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
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

function promptText(runType: string, refs: readonly ContextPackRef[]): string {
  return [
    `${runType} structured local-derivative request`,
    "Use only safe context-pack identifiers, hashes, and summaries.",
    "Return JSON only. Do not authorize sends, legal escalation, graph acceptance, export, publication, repair, or provider transfer.",
    ...refs.map((ref) => `context=${ref.contextPackId} hash=${ref.contentHash} summary=${ref.safeSummary}`)
  ].join("\n");
}

function assertPromptMatchesRun(
  artifact: PromptArtifactEnvelope,
  runType: AgentSpecialistRunType,
  refs: readonly ContextPackRef[]
): void {
  if (artifact.manifest.runType !== runType) {
    throw new Error("Prompt artifact run type does not match specialist workflow.");
  }
  const expected = refs.map((ref) => ref.contentHash).sort().join(",");
  const actual = artifact.manifest.contextPackRefs.map((ref) => ref.contentHash).sort().join(",");
  if (actual !== expected) {
    throw new Error("Prompt artifact context provenance does not match the current workflow context.");
  }
}
