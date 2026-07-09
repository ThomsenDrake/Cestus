import {
  acceptedGraphAssertionReviewDescriptor,
  buildAcceptedGraphReviewApprovalPreview,
  rebuildAcceptedGraphReviewCurrentPreview
} from "./adapters/accepted-graph-review.js";
import {
  rebuildBlockedCanonicalRepairCurrentPreview,
  buildDestructiveRepairApprovalPreview,
  rebuildDestructiveRepairCurrentPreview,
  workspaceCanonicalRepairDescriptor,
  workspaceProjectionRebuildDescriptor
} from "./adapters/destructive-repair.js";
import {
  buildExportReportApprovalPreview,
  exportGenerateDescriptor,
  rebuildExportReportCurrentPreview,
  reportGenerateDescriptor
} from "./adapters/export-report.js";
import {
  buildLegacyStagingApprovalPreview,
  legacyStagingApproveDescriptor,
  legacyStagingExecuteDescriptor,
  rebuildLegacyStagingCurrentPreview
} from "./adapters/legacy-staging.js";
import {
  buildPrrCorrespondenceApprovalPreview,
  prrFollowUpExecuteDescriptor,
  prrInitialSendExecuteDescriptor,
  rebuildPrrCorrespondenceCurrentPreview
} from "./adapters/prr-correspondence.js";
import {
  buildProviderByteTransferApprovalPreview,
  providerByteTransferDescriptor,
  providerParseExecuteDescriptor,
  rebuildProviderByteTransferCurrentPreview
} from "./adapters/provider-byte-transfer.js";
import {
  createAgentDomainToolRegistry,
  type AgentDomainToolDescriptor,
  type AgentDomainToolFamily
} from "./domain-execution-descriptors.js";
import type { AgentToolFailureCategory } from "./tool-gateway.js";

export type ResidentAgentDomainStaleCheckId =
  | "preview-hash"
  | "source-event-ids"
  | "input-artifact-hashes"
  | "freshness-checks";

export type ResidentAgentDomainLockCheckId = "active-locks";

export type ResidentAgentDomainProvenanceRequirement =
  | "source-event-ids"
  | "input-artifact-hashes"
  | "provenance-refs";

export interface ResidentAgentDomainAdapterDescriptor extends AgentDomainToolDescriptor {
  readonly previewBuilderId: string;
  readonly currentPreviewRebuilderId: string;
  readonly staleCheckIds: readonly ResidentAgentDomainStaleCheckId[];
  readonly lockCheckIds: readonly ResidentAgentDomainLockCheckId[];
  readonly provenanceRequirements: readonly ResidentAgentDomainProvenanceRequirement[];
  readonly resultMapperId: string;
  readonly safeFailureCategories: readonly AgentToolFailureCategory[];
  readonly executionEffect: string;
}

export interface ResidentAgentDomainAdapterRegistry {
  list(): readonly ResidentAgentDomainAdapterDescriptor[];
  listFamilies(): readonly AgentDomainToolFamily[];
  listFamily(family: AgentDomainToolFamily): readonly ResidentAgentDomainAdapterDescriptor[];
  require(toolId: string, toolVersion: string): ResidentAgentDomainAdapterDescriptor;
  requireByKey(toolIdAtVersion: string): ResidentAgentDomainAdapterDescriptor;
}

interface NamedExport {
  readonly name: string;
}

interface AdapterReadinessMetadata {
  readonly previewBuilder: NamedExport;
  readonly currentPreviewRebuilder: NamedExport;
  readonly safeFailureCategories: readonly AgentToolFailureCategory[];
  readonly executionEffect: string;
}

interface AdapterDescriptorDefinition {
  readonly descriptor: AgentDomainToolDescriptor;
  readonly metadata: AdapterReadinessMetadata;
}

const schedulerStaleCheckIds = Object.freeze([
  "preview-hash",
  "source-event-ids",
  "input-artifact-hashes",
  "freshness-checks"
] as const satisfies readonly ResidentAgentDomainStaleCheckId[]);

const schedulerLockCheckIds = Object.freeze([
  "active-locks"
] as const satisfies readonly ResidentAgentDomainLockCheckId[]);

const schedulerProvenanceRequirements = Object.freeze([
  "source-event-ids",
  "input-artifact-hashes",
  "provenance-refs"
] as const satisfies readonly ResidentAgentDomainProvenanceRequirement[]);

const commonApprovalFailures = Object.freeze([
  "approval-stale",
  "permission-denied",
  "secret-detected",
  "legal-lock-active",
  "lock-active",
  "projection-lag",
  "provenance-missing",
  "model-output-invalid",
  "domain-gate-failed",
  "external-effect-failed"
] as const satisfies readonly AgentToolFailureCategory[]);

const descriptorDefinitions = Object.freeze([
  define(providerByteTransferDescriptor, {
    previewBuilder: buildProviderByteTransferApprovalPreview,
    currentPreviewRebuilder: rebuildProviderByteTransferCurrentPreview,
    safeFailureCategories: commonApprovalFailures,
    executionEffect: "provider.bytes.transferred"
  }),
  define(providerParseExecuteDescriptor, {
    previewBuilder: buildProviderByteTransferApprovalPreview,
    currentPreviewRebuilder: rebuildProviderByteTransferCurrentPreview,
    safeFailureCategories: commonApprovalFailures,
    executionEffect: "ingestion.provider.parse.executed"
  }),
  define(prrInitialSendExecuteDescriptor, {
    previewBuilder: buildPrrCorrespondenceApprovalPreview,
    currentPreviewRebuilder: rebuildPrrCorrespondenceCurrentPreview,
    safeFailureCategories: commonApprovalFailures,
    executionEffect: "prr.request.sent"
  }),
  define(prrFollowUpExecuteDescriptor, {
    previewBuilder: buildPrrCorrespondenceApprovalPreview,
    currentPreviewRebuilder: rebuildPrrCorrespondenceCurrentPreview,
    safeFailureCategories: commonApprovalFailures,
    executionEffect: "prr.followup.sent"
  }),
  define(acceptedGraphAssertionReviewDescriptor, {
    previewBuilder: buildAcceptedGraphReviewApprovalPreview,
    currentPreviewRebuilder: rebuildAcceptedGraphReviewCurrentPreview,
    safeFailureCategories: commonApprovalFailures,
    executionEffect: "assertion.accepted"
  }),
  define(exportGenerateDescriptor, {
    previewBuilder: buildExportReportApprovalPreview,
    currentPreviewRebuilder: rebuildExportReportCurrentPreview,
    safeFailureCategories: commonApprovalFailures,
    executionEffect: "export.generated"
  }),
  define(reportGenerateDescriptor, {
    previewBuilder: buildExportReportApprovalPreview,
    currentPreviewRebuilder: rebuildExportReportCurrentPreview,
    safeFailureCategories: commonApprovalFailures,
    executionEffect: "report.generated"
  }),
  define(workspaceProjectionRebuildDescriptor, {
    previewBuilder: buildDestructiveRepairApprovalPreview,
    currentPreviewRebuilder: rebuildDestructiveRepairCurrentPreview,
    safeFailureCategories: commonApprovalFailures,
    executionEffect: "projection.rebuilt"
  }),
  define(workspaceCanonicalRepairDescriptor, {
    previewBuilder: buildDestructiveRepairApprovalPreview,
    currentPreviewRebuilder: rebuildBlockedCanonicalRepairCurrentPreview,
    safeFailureCategories: [...commonApprovalFailures, "data-loss-risk"],
    executionEffect: "data-loss-risk-stop"
  }),
  define(legacyStagingApproveDescriptor, {
    previewBuilder: buildLegacyStagingApprovalPreview,
    currentPreviewRebuilder: rebuildLegacyStagingCurrentPreview,
    safeFailureCategories: [...commonApprovalFailures, "approval-required", "data-loss-risk"],
    executionEffect: "legacy.ontology.staging.approved"
  }),
  define(legacyStagingExecuteDescriptor, {
    previewBuilder: buildLegacyStagingApprovalPreview,
    currentPreviewRebuilder: rebuildLegacyStagingCurrentPreview,
    safeFailureCategories: [...commonApprovalFailures, "approval-required", "data-loss-risk"],
    executionEffect: "assertion.proposed"
  })
] as const satisfies readonly AdapterDescriptorDefinition[]);

const baseRegistry = createAgentDomainToolRegistry(
  descriptorDefinitions.map((definition) => definition.descriptor)
);

export const residentAgentDomainAdapterDescriptors = Object.freeze(
  descriptorDefinitions.map((definition) => enrichDescriptor(
    baseRegistry.require(definition.descriptor.toolId, definition.descriptor.toolVersion),
    definition.metadata
  ))
);

const familyNames = Object.freeze(
  [...new Set(residentAgentDomainAdapterDescriptors.map((descriptor) => descriptor.family))].sort()
);

const descriptorsByFamily = new Map<AgentDomainToolFamily, readonly ResidentAgentDomainAdapterDescriptor[]>(
  familyNames.map((family) => [
    family,
    Object.freeze(residentAgentDomainAdapterDescriptors.filter((descriptor) => descriptor.family === family))
  ])
);

const descriptorsByKey = new Map(
  residentAgentDomainAdapterDescriptors.map((descriptor) => [descriptorKey(descriptor), descriptor])
);

export function createResidentAgentDomainAdapterRegistry(): ResidentAgentDomainAdapterRegistry {
  return Object.freeze({
    list() {
      return residentAgentDomainAdapterDescriptors;
    },
    listFamilies() {
      return familyNames;
    },
    listFamily(family: AgentDomainToolFamily) {
      const descriptors = descriptorsByFamily.get(family);
      if (descriptors === undefined) {
        throw new Error("Resident-agent domain adapter family was not found");
      }
      return descriptors;
    },
    require(toolId: string, toolVersion: string) {
      return requireRegisteredDescriptor(baseRegistry.require(toolId, toolVersion));
    },
    requireByKey(toolIdAtVersion: string) {
      return requireRegisteredDescriptor(baseRegistry.requireByKey(toolIdAtVersion));
    }
  });
}

function define(
  descriptor: AgentDomainToolDescriptor,
  metadata: AdapterReadinessMetadata
): AdapterDescriptorDefinition {
  return Object.freeze({ descriptor, metadata: Object.freeze(metadata) });
}

function enrichDescriptor(
  descriptor: AgentDomainToolDescriptor,
  metadata: AdapterReadinessMetadata
): ResidentAgentDomainAdapterDescriptor {
  const previewBuilderId = requireExportedFunctionName(metadata.previewBuilder, "preview builder");
  const currentPreviewRebuilderId = requireExportedFunctionName(
    metadata.currentPreviewRebuilder,
    "current-preview rebuilder"
  );
  const resultMapperId = requireMetadataId(
    `${descriptor.toolId}.result-mapper.${descriptor.toolVersion}.${descriptor.outputSchemaId}`,
    "result mapper ID"
  );
  const executionEffect = requireMetadataId(metadata.executionEffect, "execution effect");
  if (descriptor.forbiddenEffects.includes(executionEffect)) {
    throw new Error("Resident-agent adapter execution effect conflicts with its forbidden effects");
  }
  return Object.freeze({
    ...descriptor,
    previewBuilderId,
    currentPreviewRebuilderId,
    staleCheckIds: schedulerStaleCheckIds,
    lockCheckIds: schedulerLockCheckIds,
    provenanceRequirements: schedulerProvenanceRequirements,
    resultMapperId,
    safeFailureCategories: freezeUniqueMetadata(metadata.safeFailureCategories, "safe failure category"),
    executionEffect
  });
}

function freezeUniqueMetadata<T extends string>(values: readonly T[], label: string): readonly T[] {
  if (values.length === 0) {
    throw new Error(`Resident-agent adapter ${label}s must not be empty`);
  }
  const safe = values.map((value) => requireMetadataId(value, label) as T);
  if (new Set(safe).size !== safe.length) {
    throw new Error(`Resident-agent adapter ${label}s must be unique`);
  }
  return Object.freeze(safe);
}

function requireExportedFunctionName(value: NamedExport, label: string): string {
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(value.name)) {
    throw new Error(`Resident-agent adapter ${label} must be a named exported function`);
  }
  return value.name;
}

function requireMetadataId(value: string, label: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    throw new Error(`Resident-agent adapter ${label} must be a stable identifier`);
  }
  return value;
}

function requireRegisteredDescriptor(
  descriptor: AgentDomainToolDescriptor
): ResidentAgentDomainAdapterDescriptor {
  const registered = descriptorsByKey.get(descriptorKey(descriptor));
  if (registered === undefined) {
    throw new Error("Resident-agent domain adapter descriptor was not found");
  }
  return registered;
}

function descriptorKey(descriptor: Pick<AgentDomainToolDescriptor, "toolId" | "toolVersion">): string {
  return `${descriptor.toolId}@${descriptor.toolVersion}`;
}
