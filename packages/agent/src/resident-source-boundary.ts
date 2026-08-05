import { hashAgentToolPreview, type AgentToolPreview, type ResidentSourceBoundaryBinding } from "./tool-gateway.js";
import {
  assertResidentSourceBoundaryApprovalCurrent,
  type ResidentSourceBoundaryApprovalBinding
} from "../../ingestion/src/resident-source-boundary.js";
import type { MountedWorkspace } from "../../ingestion/src/mount-contract.js";

export interface ResidentSourceBoundaryApprovalRequest extends ResidentSourceBoundaryBinding {
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
    regularFileCount: value.regularFileCount,
    includedFileCount: value.includedFileCount,
    excludedFileCount: value.excludedFileCount,
    totalBytes: value.totalBytes
  };
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
    regularFileCount: binding.regularFileCount,
    includedFileCount: binding.includedFileCount,
    excludedFileCount: binding.excludedFileCount,
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
