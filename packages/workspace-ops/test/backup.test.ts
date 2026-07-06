import { describe, expect, it } from "vitest";
import {
  backupCheckDtoSchema,
  manifestExportDtoSchema,
  workspaceOpsEnvelopeSchema,
  workspaceOpsSchemaVersion,
  type DiskUsageDto,
  type WorkspaceRefDto
} from "../src/contracts.js";
import { checkBackupManifest, exportWorkspaceManifest } from "../src/backup.js";
import { createProvisionalWorkspaceLayout } from "../src/layout.js";

const workspace: WorkspaceRefDto = {
  workspaceId: "ws_ops_001",
  label: "Ops Fixture",
  manifestVersion: 1,
  rootUri: "file:///workspace",
  layoutContractVersion: "portable-workspace-layout.v1-provisional"
};

const layout = createProvisionalWorkspaceLayout("/workspace");

const categoryBytes: DiskUsageDto["categories"] = [
  { category: "manifest", bytes: 1_000, exists: true },
  { category: "ledger", bytes: 2_000, exists: true },
  { category: "blobs", bytes: 3_000, exists: true },
  { category: "derivatives", bytes: 4_000, exists: true },
  { category: "jobs", bytes: 5_000, exists: true },
  { category: "projections", bytes: 6_000, exists: true },
  { category: "diagnostics", bytes: 7_000, exists: true },
  { category: "backups", bytes: 8_000, exists: true }
];

const expectedCategories = categoryBytes.map((category) => category.category);

describe("workspace backup manifests", () => {
  it("exports a secret-free manifest summary without copying canonical state", async () => {
    const result = await exportWorkspaceManifest({
      workspace,
      layout,
      ledgerEventCount: 12,
      ledgerHighWaterMark: 12,
      categoryBytes,
      diagnosticCounts: { errorCount: 0, warningCount: 1 },
      jobCounts: { queuedCount: 2, failedCount: 0 },
      createdAt: "2026-07-06T12:00:00.000Z",
      rawEvidenceBodies: ["PRIVATE-CASE-NOTE with access_token=abc123"],
      canonicalLedgerEvents: [{ privateContent: "password hunter2" }]
    } as never);

    expect(result.status).toBe("ready");
    expect(result.payload).toMatchObject({
      schemaVersion: workspaceOpsSchemaVersion,
      workspace,
      ledger: { eventCount: 12, highWaterMark: 12 },
      blobStore: { contentAddressedRootCount: 1, aggregateBytes: 3_000 },
      diagnostics: { errorCount: 0, warningCount: 1 },
      jobs: { queuedCount: 2, failedCount: 0 },
      coverage: { coveredCategories: expectedCategories, missingCategories: [] }
    });
    expect(result.payload?.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.payload?.sectionHashes.length).toBeGreaterThan(0);
    expect(result.payload?.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "blobs", bytes: 3_000, count: 1 }),
        expect.objectContaining({ category: "projections", bytes: 6_000, count: 1 })
      ])
    );

    const json = JSON.stringify(result);
    expect(json).not.toMatch(/access_token|abc123|hunter2|PRIVATE-CASE-NOTE|password/);
    expect(json).not.toContain(layout.blobRoot);
    expect(json).not.toContain(layout.ledgerPath);
    expect(manifestExportDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("reports stale, mismatched, and missing coverage as non-canonical manifest actions", async () => {
    const result = await checkBackupManifest({
      workspace,
      currentLedgerHighWaterMark: 15,
      expectedCategories,
      backupManifest: {
        workspaceId: "ws_other",
        layoutContractVersion: workspace.layoutContractVersion,
        ledgerHighWaterMark: 10,
        coveredCategories: ["ledger"],
        exportedAt: "2026-07-06T11:00:00.000Z"
      }
    });

    expect(result.status).toBe("degraded");
    expect(result.payload).toMatchObject({
      schemaVersion: workspaceOpsSchemaVersion,
      backupManifestPresent: true,
      identityMatches: false,
      layoutContractMatches: true,
      currentWorkspaceId: "ws_ops_001",
      backupWorkspaceId: "ws_other",
      currentLedgerHighWaterMark: 15,
      backupLedgerHighWaterMark: 10,
      stale: true,
      containsSecretShapedFields: false
    });
    expect(result.payload?.missingCategories).toEqual(
      expect.arrayContaining(["blobs", "projections", "diagnostics", "backups"])
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.diagnosticId)).toEqual(
      expect.arrayContaining([
        "diag_backup_workspace_mismatch",
        "diag_backup_manifest_stale",
        "diag_backup_coverage_missing"
      ])
    );
    expect(result.diagnostics.every((diagnostic) => diagnostic.category === "backup")).toBe(true);
    expect(result.proposedActions).toEqual([
      expect.objectContaining({
        kind: "export-manifest",
        requiresHumanApproval: false,
        mutatesCanonicalState: false,
        allowedNextCommands: ["manifest export", "backup check"]
      })
    ]);
    expect(result.proposedActions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "append-repair-event-required" })])
    );
    expect(backupCheckDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("reports missing backup manifests and secret-shaped fields without leaking them", async () => {
    const missing = await checkBackupManifest({
      workspace,
      currentLedgerHighWaterMark: 15,
      expectedCategories,
      backupManifest: undefined
    });

    expect(missing.status).toBe("degraded");
    expect(missing.payload).toMatchObject({
      backupManifestPresent: false,
      identityMatches: false,
      layoutContractMatches: false,
      stale: true
    });
    expect(missing.diagnostics).toContainEqual(
      expect.objectContaining({ diagnosticId: "diag_backup_manifest_missing" })
    );
    expect(backupCheckDtoSchema.parse(missing.payload)).toEqual(missing.payload);
    expect(workspaceOpsEnvelopeSchema.parse(missing)).toEqual(missing);

    const secretShaped = await checkBackupManifest({
      workspace,
      currentLedgerHighWaterMark: 15,
      expectedCategories,
      backupManifest: {
        workspaceId: workspace.workspaceId,
        layoutContractVersion: workspace.layoutContractVersion,
        ledgerHighWaterMark: 15,
        coveredCategories: expectedCategories,
        exportedAt: "2026-07-06T12:00:00.000Z",
        access_token: "abc123"
      }
    } as never);

    expect(secretShaped.status).toBe("degraded");
    expect(secretShaped.payload).toMatchObject({
      identityMatches: true,
      layoutContractMatches: true,
      missingCategories: [],
      stale: false,
      containsSecretShapedFields: true
    });
    expect(secretShaped.diagnostics).toContainEqual(
      expect.objectContaining({ diagnosticId: "diag_backup_manifest_secret_fields" })
    );
    expect(secretShaped.proposedActions).toEqual([
      expect.objectContaining({
        kind: "export-manifest",
        mutatesCanonicalState: false
      })
    ]);
    expect(JSON.stringify(secretShaped)).not.toMatch(/access_token|abc123/);
    expect(backupCheckDtoSchema.parse(secretShaped.payload)).toEqual(secretShaped.payload);
    expect(workspaceOpsEnvelopeSchema.parse(secretShaped)).toEqual(secretShaped);
  });
});
