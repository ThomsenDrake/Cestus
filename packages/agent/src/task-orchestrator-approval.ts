import type { KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { RebuildProviderByteTransferCurrentPreviewInput } from "./adapters/provider-byte-transfer.js";
import type { ContextPackRef } from "./context-packs.js";
import type { PromptArtifactEnvelope } from "./prompt-artifacts.js";
import type { CredentialReference } from "./provider.js";
import {
  assertSelectedSpecialistProviderByteTransferApproval,
  type SpecialistRunnerProviderReadiness,
  type SpecialistRunnerProviderTransferApprovalProof
} from "./specialist-runner-kernel.js";
import type { AgentApprovedToolPreviewResult } from "./scheduler-types.js";

const contentHashPattern = /^sha256:[a-f0-9]{64}$/;
const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;
const arrayIndexPattern = /^(0|[1-9]\d*)$/;

export interface TaskOrchestratorProviderApprovalProof extends SpecialistRunnerProviderTransferApprovalProof {
  readonly runId: string;
  readonly toolRequestId: string;
  readonly approvalRequirementId: string;
  readonly promptArtifactHash: `sha256:${string}`;
  readonly contextBindingHashes: readonly `sha256:${string}`[];
  readonly credentialRef: CredentialReference;
  readonly providerReadiness: SpecialistRunnerProviderReadiness;
  readonly promptArtifact: PromptArtifactEnvelope;
  readonly currentPreviewInput: RebuildProviderByteTransferCurrentPreviewInput;
}

export interface InspectTaskOrchestratorProviderApprovalInput {
  readonly ledger: EventLedger;
  readonly taskId: string;
  readonly residentAgentId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly proof: TaskOrchestratorProviderApprovalProof;
}

export type TaskOrchestratorProviderApprovalInspection =
  | { readonly status: "approved"; readonly approvalEventId: string }
  | { readonly status: "waiting"; readonly reason: string };

export interface CreateTaskOrchestratorProviderApprovalAdapterInput {
  readonly rebuildCurrentPreview?: (
    input: RebuildProviderByteTransferCurrentPreviewInput
  ) => Promise<AgentApprovedToolPreviewResult>;
}

/**
 * Reuses the runner's consume-time provider approval assertion. This adapter
 * only reports resumability and does not invoke a provider or domain adapter.
 */
export function createTaskOrchestratorProviderApprovalAdapter(
  input: CreateTaskOrchestratorProviderApprovalAdapterInput = {}
) {
  return Object.freeze({
    async inspect(
      inspection: InspectTaskOrchestratorProviderApprovalInput
    ): Promise<TaskOrchestratorProviderApprovalInspection> {
      try {
        if (!taskOrchestratorApprovalProofBindsPromptEnvelope(inspection.proof)) {
          return { status: "waiting", reason: "provider-byte-transfer-proof-missing-or-stale" };
        }
        const approval = await assertSelectedSpecialistProviderByteTransferApproval({
          ledger: inspection.ledger,
          runId: inspection.proof.runId,
          taskId: inspection.taskId,
          providerId: inspection.providerId,
          modelFamily: inspection.modelId,
          credentialRef: inspection.proof.credentialRef,
          providerReadiness: inspection.proof.providerReadiness,
          providerTransferApproval: inspection.proof,
          promptArtifact: inspection.proof.promptArtifact,
          ...(input.rebuildCurrentPreview === undefined ? {} : { rebuildCurrentPreview: input.rebuildCurrentPreview })
        });
        if (approval?.status === "blocked") {
          return { status: "waiting", reason: "provider-byte-transfer-proof-missing-or-stale" };
        }
      } catch {
        return { status: "waiting", reason: "provider-byte-transfer-proof-missing-or-stale" };
      }

      const events = await inspection.ledger.readStream(`agent_tool_request_${inspection.proof.toolRequestId}`);
      const requested = events.find((event): event is KnowledgeEventOf<"agent.tool.requested"> =>
        event.type === "agent.tool.requested"
      );
      const approved = events.at(-1)?.type === "agent.tool.approved" ? events.at(-1) : undefined;
      if (requested?.id !== inspection.proof.approvalRequirementId || approved === undefined) {
        return { status: "waiting", reason: "provider-byte-transfer-request-missing-or-stale" };
      }
      return { status: "approved", approvalEventId: approved.id };
    }
  });
}

export function taskOrchestratorApprovalPromptArtifactHash(
  proof: TaskOrchestratorProviderApprovalProof
): string {
  return proofPromptArtifactEnvelope(proof)?.manifest.inputArtifactHash ??
    proof.currentPreviewInput.approvedPromptArtifact.inputArtifactHash;
}

export function taskOrchestratorApprovalContextBindingHashes(
  proof: TaskOrchestratorProviderApprovalProof
): readonly string[] {
  return taskOrchestratorApprovalContextPackRefs(proof).map((ref) => ref.contentHash);
}

export function taskOrchestratorApprovalContextPackRefs(
  proof: TaskOrchestratorProviderApprovalProof
): readonly ContextPackRef[] {
  return proofPromptArtifactEnvelope(proof)?.manifest.contextPackRefs ??
    proof.currentPreviewInput.approvedPromptArtifact.contextPackRefs;
}

function taskOrchestratorApprovalProofBindsPromptEnvelope(
  proof: TaskOrchestratorProviderApprovalProof
): boolean {
  if (proofPromptArtifactEnvelope(proof) === undefined) {
    return false;
  }
  return proof.promptArtifactHash === taskOrchestratorApprovalPromptArtifactHash(proof) &&
    sameOrderedStrings(proof.contextBindingHashes, taskOrchestratorApprovalContextBindingHashes(proof));
}

function proofPromptArtifactEnvelope(
  proof: TaskOrchestratorProviderApprovalProof
): PromptArtifactEnvelope | undefined {
  const candidate: unknown = proof.promptArtifact;
  if (!isPlainRecord(candidate)) {
    return undefined;
  }
  const manifest = ownDataProperty(candidate, "manifest");
  if (!isPlainRecord(manifest)) {
    return undefined;
  }
  const inputArtifactHash = ownDataProperty(manifest, "inputArtifactHash");
  const contextPackRefs = densePlainDataArray(ownDataProperty(manifest, "contextPackRefs"));
  const production = ownDataProperty(manifest, "production");
  if (typeof inputArtifactHash !== "string" || !contentHashPattern.test(inputArtifactHash) ||
    contextPackRefs === undefined || contextPackRefs.length === 0) {
    return undefined;
  }
  // An approval proof is always evidence of the original v1 bytes. A v2
  // envelope is only consumable later alongside this retained v1 source.
  if (production !== undefined && (
    !isPlainRecord(production) ||
    ownDataProperty(production, "schemaVersion") !== "agent-production-prompt-binding.v1"
  )) {
    return undefined;
  }
  if (contextPackRefs.some((ref) => !isCheckpointableContextPackRef(ref))) {
    return undefined;
  }
  return candidate as unknown as PromptArtifactEnvelope;
}

function isCheckpointableContextPackRef(ref: unknown): boolean {
  if (!isPlainRecord(ref)) {
    return false;
  }
  const contextPackId = ownDataProperty(ref, "contextPackId");
  const contentHash = ownDataProperty(ref, "contentHash");
  const sizeBytes = ownDataProperty(ref, "sizeBytes");
  const provenanceRefs = densePlainDataArray(ownDataProperty(ref, "provenanceRefs"));
  const sourceEventIds = densePlainDataArray(ownDataProperty(ref, "sourceEventIds"));
  const artifactHashes = densePlainDataArray(ownDataProperty(ref, "artifactHashes"));
  const hasCheckpointableEventIds =
    (sourceEventIds !== undefined && sourceEventIds.length > 0 &&
      sourceEventIds.every((value) => typeof value === "string" && eventIdPattern.test(value))) ||
    (sourceEventIds === undefined &&
      provenanceRefs !== undefined &&
      provenanceRefs.every((value) => typeof value === "string" && eventIdPattern.test(value)));
  return typeof contextPackId === "string" &&
    contextPackId.length > 0 &&
    typeof contentHash === "string" &&
    contentHashPattern.test(contentHash) &&
    typeof sizeBytes === "number" &&
    Number.isInteger(sizeBytes) &&
    sizeBytes >= 0 &&
    provenanceRefs !== undefined &&
    provenanceRefs.length > 0 &&
    provenanceRefs.every((value) => typeof value === "string" && value.length > 0) &&
    hasCheckpointableEventIds &&
    (artifactHashes === undefined ||
      artifactHashes.every((value) => typeof value === "string" && contentHashPattern.test(value)));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownDataProperty(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

function densePlainDataArray(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length > 0) {
    return undefined;
  }
  const length = value.length;
  if (!Number.isSafeInteger(length)) {
    return undefined;
  }
  const propertyNames = Object.getOwnPropertyNames(value);
  for (const name of propertyNames) {
    if (name === "length") {
      continue;
    }
    if (!arrayIndexPattern.test(name) || Number(name) >= length) {
      return undefined;
    }
  }
  const items: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) {
      return undefined;
    }
    items.push(descriptor.value);
  }
  return items;
}


function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
