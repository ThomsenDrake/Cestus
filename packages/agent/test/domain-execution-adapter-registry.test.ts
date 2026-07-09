import { describe, expect, it } from "vitest";
import {
  buildAcceptedGraphReviewApprovalPreview,
  buildDestructiveRepairApprovalPreview,
  buildExportReportApprovalPreview,
  buildLegacyStagingApprovalPreview,
  buildPrrCorrespondenceApprovalPreview,
  buildProviderByteTransferApprovalPreview,
  createResidentAgentDomainAdapterRegistry,
  rebuildAcceptedGraphReviewCurrentPreview,
  rebuildBlockedCanonicalRepairCurrentPreview,
  rebuildDestructiveRepairCurrentPreview,
  rebuildExportReportCurrentPreview,
  rebuildLegacyStagingCurrentPreview,
  rebuildPrrCorrespondenceCurrentPreview,
  rebuildProviderByteTransferCurrentPreview,
  residentAgentDomainAdapterDescriptors,
  type AgentDomainToolFamily,
  type AgentToolFailureCategory
} from "../src/index.js";

const expectedFamilyCounts: Readonly<Record<AgentDomainToolFamily, number>> = Object.freeze({
  "provider-byte-transfer": 2,
  "prr-correspondence": 2,
  "accepted-graph-review": 1,
  "export-report": 2,
  "destructive-repair": 2,
  "legacy-staging": 2
});

const expectedProfiles: Readonly<Record<AgentDomainToolFamily, ReadonlySet<string>>> = Object.freeze({
  "provider-byte-transfer": new Set(["external-byte-transfer|provider-byte-transfer"]),
  "prr-correspondence": new Set(["external-message-send|external-message-send"]),
  "accepted-graph-review": new Set(["ledger-review|ledger-review"]),
  "export-report": new Set(["export-or-publication|export-or-publication"]),
  "destructive-repair": new Set(["destructive-or-repair|destructive-or-repair"]),
  "legacy-staging": new Set(["ledger-review|ledger-review", "ledger-proposal|none"])
});

const authoritativeTargets: Readonly<Record<AgentDomainToolFamily, ReadonlySet<string>>> = Object.freeze({
  "provider-byte-transfer": new Set(["IngestionRuntime.providerExecutionService"]),
  "prr-correspondence": new Set([
    "PrrCorrespondenceService.sendInitialRequest",
    "PrrCorrespondenceService.sendFollowUp"
  ]),
  "accepted-graph-review": new Set(["ontology.assertion-service"]),
  "export-report": new Set([
    "GovernanceService.recordExportGenerated",
    "GovernanceService.recordReportGenerated"
  ]),
  "destructive-repair": new Set([
    "workspace-ops.rebuildProjection",
    "AppendOnlyWorkspaceRepairService"
  ]),
  "legacy-staging": new Set(["legacy.import-runtime"])
});

const expectedPreviewBuilderIds: Readonly<Record<AgentDomainToolFamily, string>> = Object.freeze({
  "provider-byte-transfer": buildProviderByteTransferApprovalPreview.name,
  "prr-correspondence": buildPrrCorrespondenceApprovalPreview.name,
  "accepted-graph-review": buildAcceptedGraphReviewApprovalPreview.name,
  "export-report": buildExportReportApprovalPreview.name,
  "destructive-repair": buildDestructiveRepairApprovalPreview.name,
  "legacy-staging": buildLegacyStagingApprovalPreview.name
});

const expectedCurrentPreviewRebuilderIds: Readonly<Record<string, string>> = Object.freeze({
  "provider.bytes.transfer": rebuildProviderByteTransferCurrentPreview.name,
  "ingestion.provider-parse.execute": rebuildProviderByteTransferCurrentPreview.name,
  "prr.initial-send.execute": rebuildPrrCorrespondenceCurrentPreview.name,
  "prr.follow-up.execute": rebuildPrrCorrespondenceCurrentPreview.name,
  "ontology.assertion.accept": rebuildAcceptedGraphReviewCurrentPreview.name,
  "governance.export.generate": rebuildExportReportCurrentPreview.name,
  "governance.report.generate": rebuildExportReportCurrentPreview.name,
  "workspace.projection-rebuild.execute": rebuildDestructiveRepairCurrentPreview.name,
  "workspace.canonical-repair.record": rebuildBlockedCanonicalRepairCurrentPreview.name,
  "legacy.staging.approve": rebuildLegacyStagingCurrentPreview.name,
  "legacy.staging.execute": rebuildLegacyStagingCurrentPreview.name
});

const schedulerStaleCheckIds = [
  "preview-hash",
  "source-event-ids",
  "input-artifact-hashes",
  "freshness-checks"
] as const;
const schedulerLockCheckIds = ["active-locks"] as const;
const schedulerProvenanceRequirements = [
  "source-event-ids",
  "input-artifact-hashes",
  "provenance-refs"
] as const;
const schedulerFailureCategories = [
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
] as const satisfies readonly AgentToolFailureCategory[];
const safeFailureCategories = new Set<AgentToolFailureCategory>([
  "approval-required",
  ...schedulerFailureCategories,
  "data-loss-risk"
]);

describe("resident-agent domain adapter registry", () => {
  it("registers every descriptor once across six distinct adapter families", () => {
    const registry = createResidentAgentDomainAdapterRegistry();
    const listed = registry.list();
    const keys = listed.map((descriptor) => `${descriptor.toolId}@${descriptor.toolVersion}`);

    expect(listed).toHaveLength(11);
    expect(new Set(keys).size).toBe(keys.length);
    expect(registry.listFamilies()).toEqual(Object.keys(expectedFamilyCounts).sort());
    for (const [family, expectedCount] of Object.entries(expectedFamilyCounts)) {
      expect(registry.listFamily(family as AgentDomainToolFamily)).toHaveLength(expectedCount);
    }
    expect(listed).toEqual(residentAgentDomainAdapterDescriptors);
    expect(Object.isFrozen(listed)).toBe(true);
  });

  it("publishes complete AI-legible execution metadata without unsafe construction", () => {
    for (const descriptor of residentAgentDomainAdapterDescriptors) {
      expect(Object.isFrozen(descriptor)).toBe(true);
      expect(descriptor.previewBuilderId).toBe(expectedPreviewBuilderIds[descriptor.family]);
      expect(descriptor.currentPreviewRebuilderId).toBe(expectedCurrentPreviewRebuilderIds[descriptor.toolId]);
      expect(descriptor.resultMapperId).toBe(
        `${descriptor.toolId}.result-mapper.${descriptor.toolVersion}.${descriptor.outputSchemaId}`
      );
      expect(descriptor.executionEffect).toMatch(/^[a-z0-9][a-z0-9._-]+$/);
      expect(descriptor.staleCheckIds).toEqual(schedulerStaleCheckIds);
      expect(descriptor.lockCheckIds).toEqual(schedulerLockCheckIds);
      expect(descriptor.provenanceRequirements).toEqual(schedulerProvenanceRequirements);
      expect(descriptor.safeFailureCategories.length).toBeGreaterThan(0);
      expect(descriptor.idempotencyKeyFields.length).toBeGreaterThan(0);
      expect(descriptor.targetDomainService.length).toBeGreaterThan(0);
      expect(descriptor.forbiddenEffects.length).toBeGreaterThan(0);
      expect(descriptor.forbiddenEffects).not.toContain(descriptor.executionEffect);
      expect(authoritativeTargets[descriptor.family].has(descriptor.targetDomainService)).toBe(true);
      expect(expectedProfiles[descriptor.family].has(
        `${descriptor.sideEffectClass}|${descriptor.requiredApprovalClass}`
      )).toBe(true);
      for (const category of descriptor.safeFailureCategories) {
        expect(safeFailureCategories.has(category)).toBe(true);
      }
      expect(descriptor.safeFailureCategories).toEqual(expect.arrayContaining([...schedulerFailureCategories]));
      for (const values of [
        descriptor.staleCheckIds,
        descriptor.lockCheckIds,
        descriptor.provenanceRequirements,
        descriptor.safeFailureCategories
      ]) {
        expect(Object.isFrozen(values)).toBe(true);
        expect(new Set(values).size).toBe(values.length);
      }
    }
  });

  it("dispatches descriptor discovery by exact tool ID and version", () => {
    const registry = createResidentAgentDomainAdapterRegistry();

    for (const descriptor of residentAgentDomainAdapterDescriptors) {
      expect(registry.require(descriptor.toolId, descriptor.toolVersion)).toBe(descriptor);
      expect(registry.requireByKey(`${descriptor.toolId}@${descriptor.toolVersion}`)).toBe(descriptor);
    }
    expect(() => registry.require("provider.bytes.transfer", "9.9.9")).toThrow(/not found/i);
    expect(() => registry.requireByKey("provider.bytes.transfer")).toThrow(/toolId@toolVersion/i);
  });
});
