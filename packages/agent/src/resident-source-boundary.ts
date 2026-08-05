import { hashAgentToolPreview, type AgentToolPreview, type ResidentSourceBoundaryBinding } from "./tool-gateway.js";
import {
  assertResidentSourceBoundaryApprovalCurrent,
  type ResidentSourceBoundaryApprovalBinding
} from "../../ingestion/src/resident-source-boundary.js";
import type { MountedWorkspace } from "../../ingestion/src/mount-contract.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { KnowledgeEventOf } from "../../ontology/src/contracts.js";

export interface ResidentSourceBoundaryApprovalRequest extends ResidentSourceBoundaryBinding {
  readonly ledger: EventLedger;
  readonly gateway: {
    requestTool(input: {
      readonly toolRequestId: string;
      readonly residentAgentId: string;
      readonly taskId: string;
      readonly runId: string;
      readonly toolId: string;
      readonly toolVersion: string;
      readonly sideEffectClass: "local-derivative";
      readonly requiredApprovalClass: "human-review";
      readonly preview: AgentToolPreview;
      readonly scope: string;
      readonly estimatedEffect: string;
      readonly inputArtifactHashes: readonly string[];
      readonly residentSourceBoundary: ResidentSourceBoundaryBinding;
    }): Promise<{ readonly payload: { readonly requiredApprovalClass: string } }>;
  };
  readonly toolRequestId: string;
  readonly taskId: string;
  readonly runId: string;
}

/** Creates the one existing human-review request; it has no execution operation. */
export async function requestResidentSourceBoundaryApproval(
  value: ResidentSourceBoundaryApprovalRequest
) {
  const binding: ResidentSourceBoundaryBinding = {
    workflowId: value.workflowId,
    workspaceId: value.workspaceId,
    sourceCollectionId: value.sourceCollectionId,
    sourceIdentity: value.sourceIdentity,
    sourceRootHash: value.sourceRootHash,
    discoveryArtifactHash: value.discoveryArtifactHash,
    discoveryHash: value.discoveryHash,
    manifestArtifactHash: value.manifestArtifactHash,
    manifestHash: value.manifestHash,
    archivePolicy: value.archivePolicy,
    regularFileCount: value.regularFileCount,
    includedFileCount: value.includedFileCount,
    excludedFileCount: value.excludedFileCount,
    includedBytes: value.includedBytes,
    excludedBytes: value.excludedBytes,
    totalBytes: value.totalBytes
  };
  const existing = await existingWorkflowRequest(value.ledger, binding, value.toolRequestId);
  if (existing !== undefined) return existing;
  const preview = residentSourceBoundaryPreview(binding);
  return await value.gateway.requestTool({
    toolRequestId: value.toolRequestId,
    residentAgentId: "agent_default",
    taskId: value.taskId,
    runId: value.runId,
    toolId: "ingestion.source-boundary.approve",
    toolVersion: "1.0.0",
    sideEffectClass: "local-derivative",
    requiredApprovalClass: "human-review",
    preview,
    scope: preview.scope,
    estimatedEffect: preview.estimatedEffect,
    inputArtifactHashes: [binding.discoveryArtifactHash, binding.manifestArtifactHash],
    residentSourceBoundary: binding
  });
}

async function existingWorkflowRequest(
  ledger: EventLedger,
  binding: ResidentSourceBoundaryBinding,
  toolRequestId: string
): Promise<KnowledgeEventOf<"agent.tool.requested"> | undefined> {
  const requests = (await ledger.readAll()).filter((event): event is KnowledgeEventOf<"agent.tool.requested"> =>
    event.type === "agent.tool.requested" && event.payload.residentSourceBoundary?.workflowId === binding.workflowId
  );
  if (requests.length === 0) return undefined;
  if (requests.length !== 1) throw new Error("Workflow has multiple resident source boundary requests.");
  const request = requests[0];
  const previous = request.payload.residentSourceBoundary;
  if (request.payload.toolRequestId !== toolRequestId || previous === undefined || !sameBinding(previous, binding)) {
    throw new Error("Workflow already has a different resident source boundary authority request.");
  }
  return request;
}

function sameBinding(left: ResidentSourceBoundaryBinding, right: ResidentSourceBoundaryBinding): boolean {
  return (
    left.workflowId === right.workflowId && left.workspaceId === right.workspaceId &&
    left.sourceCollectionId === right.sourceCollectionId && left.sourceIdentity === right.sourceIdentity &&
    left.sourceRootHash === right.sourceRootHash && left.discoveryArtifactHash === right.discoveryArtifactHash &&
    left.discoveryHash === right.discoveryHash && left.manifestArtifactHash === right.manifestArtifactHash &&
    left.manifestHash === right.manifestHash && left.regularFileCount === right.regularFileCount &&
    left.includedFileCount === right.includedFileCount && left.excludedFileCount === right.excludedFileCount &&
    left.archivePolicy === right.archivePolicy && left.includedBytes === right.includedBytes && left.excludedBytes === right.excludedBytes &&
    left.totalBytes === right.totalBytes
  );
}

export function residentSourceBoundaryPreview(binding: ResidentSourceBoundaryBinding): AgentToolPreview {
  return Object.freeze({
    summary: "Human review is required for a resident source boundary.",
    scope: "Resident source boundary approval.",
    estimatedEffect: "Approval only authorizes a later scanning slice.",
    workflowId: binding.workflowId,
    workspaceId: binding.workspaceId,
    sourceCollectionId: binding.sourceCollectionId,
    sourceIdentity: binding.sourceIdentity,
    sourceRootHash: binding.sourceRootHash,
    discoveryHash: binding.discoveryHash,
    manifestHash: binding.manifestHash,
    archivePolicy: binding.archivePolicy,
    regularFileCount: binding.regularFileCount,
    includedFileCount: binding.includedFileCount,
    excludedFileCount: binding.excludedFileCount,
    includedBytes: binding.includedBytes,
    excludedBytes: binding.excludedBytes,
    totalBytes: binding.totalBytes,
    artifactHashes: [binding.discoveryArtifactHash, binding.manifestArtifactHash]
  });
}

/** Revalidates the exact mounted protected preview before the existing human gateway decides. */
export async function assertResidentSourceBoundaryCurrentPreview(input: {
  readonly workspace: MountedWorkspace;
  readonly binding: ResidentSourceBoundaryBinding;
  readonly assertCurrent?: () => void | Promise<void>;
}): Promise<void> {
  await assertResidentSourceBoundaryApprovalCurrent({
    workspace: input.workspace,
    binding: input.binding as ResidentSourceBoundaryApprovalBinding,
    ...(input.assertCurrent === undefined ? {} : { assertCurrent: input.assertCurrent })
  });
}

export function hashResidentSourceBoundaryPreview(binding: ResidentSourceBoundaryBinding): `sha256:${string}` {
  return hashAgentToolPreview(residentSourceBoundaryPreview(binding));
}
