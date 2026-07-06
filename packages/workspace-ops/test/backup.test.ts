import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  backupCheckDtoSchema,
  manifestExportDtoSchema,
  workspaceOpsEnvelopeSchema,
  workspaceOpsSchemaVersion,
  type DiskUsageDto,
  type ManifestExportDto,
  type WorkspaceRefDto
} from "../src/contracts.js";
import { checkBackupManifest, exportWorkspaceManifest } from "../src/backup.js";
import { createProvisionalWorkspaceLayout } from "../src/layout.js";

type WorkspaceRootCategory = DiskUsageDto["categories"][number]["category"];

const workspace: WorkspaceRefDto = {
  workspaceId: "ws_ops_001",
  label: "Ops Fixture",
  manifestVersion: 1,
  rootUri: "file:///workspace",
  layoutContractVersion: "portable-workspace-layout.v1"
};

const layout = createProvisionalWorkspaceLayout("/workspace");

const categoryBytes: DiskUsageDto["categories"] = [
  { category: "manifest", bytes: 1_000, exists: true },
  { category: "ledger", bytes: 2_000, exists: true },
  { category: "blobs", bytes: 3_000, exists: true },
  { category: "derivatives", bytes: 4_000, exists: true },
  { category: "jobs", bytes: 5_000, exists: true },
  { category: "projections", bytes: 6_000, exists: true },
  { category: "cache", bytes: 7_000, exists: true },
  { category: "config", bytes: 8_000, exists: true }
];

const expectedCategories = categoryBytes.map((category) => category.category);

function withRecomputedManifestHash(manifest: ManifestExportDto): ManifestExportDto {
  const { manifestHash: _manifestHash, ...manifestWithoutHash } = manifest;
  return {
    ...manifest,
    manifestHash: hashJson(manifestWithoutHash)
  };
}

function withRecomputedExportHashes(manifest: ManifestExportDto): ManifestExportDto {
  return withRecomputedManifestHash({
    ...manifest,
    sectionHashes: manifest.includedSections.map((sectionId) => ({
      sectionId,
      sectionHash: hashJson(sectionSummary(sectionId, manifest))
    }))
  });
}

function hashJson(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}

function sectionSummary(
  sectionId: ManifestExportDto["includedSections"][number],
  manifest: ManifestExportDto
): unknown {
  switch (sectionId) {
    case "workspace":
      return manifest.workspace;
    case "manifest":
      return manifest.coverage;
    case "layout":
      return { layoutContractVersion: manifest.workspace.layoutContractVersion };
    case "ledger":
      return manifest.ledger;
    case "blobs":
      return manifest.blobStore;
    case "derivatives":
    case "projections":
    case "cache":
    case "config":
    case "jobs":
    case "backup":
      return manifest.artifacts.filter((artifact) => sectionForCategory(artifact.category) === sectionId);
  }
}

function sectionForCategory(
  category: ManifestExportDto["artifacts"][number]["category"]
): ManifestExportDto["includedSections"][number] {
  return category === "backups" ? "backup" : category;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

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

  it("checks a freshly exported manifest as ready", async () => {
    const exported = await exportWorkspaceManifest({
      workspace,
      layout,
      ledgerEventCount: 15,
      ledgerHighWaterMark: 15,
      categoryBytes,
      diagnosticCounts: { errorCount: 0, warningCount: 0 },
      jobCounts: { queuedCount: 0, failedCount: 0 },
      createdAt: "2026-07-06T12:30:00.000Z"
    });

    expect(exported.status).toBe("ready");
    const result = await checkBackupManifest({
      workspace,
      currentLedgerHighWaterMark: 15,
      expectedCategories,
      backupManifest: exported.payload
    });

    expect(result.status).toBe("ready");
    expect(result.payload).toMatchObject({
      schemaVersion: workspaceOpsSchemaVersion,
      backupManifestPresent: true,
      identityMatches: true,
      layoutContractMatches: true,
      currentWorkspaceId: workspace.workspaceId,
      backupWorkspaceId: workspace.workspaceId,
      currentLedgerHighWaterMark: 15,
      backupLedgerHighWaterMark: 15,
      coveredCategories: expectedCategories,
      missingCategories: [],
      stale: false,
      containsSecretShapedFields: false,
      safeNextActions: []
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.proposedActions).toEqual([]);
    expect(backupCheckDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("normalizes duplicate category byte entries into a backup-checkable manifest", async () => {
    const exported = await exportWorkspaceManifest({
      workspace,
      layout,
      ledgerEventCount: 15,
      ledgerHighWaterMark: 15,
      categoryBytes: [
        ...categoryBytes,
        { category: "projections", bytes: 500, exists: true }
      ],
      diagnosticCounts: { errorCount: 0, warningCount: 0 },
      jobCounts: { queuedCount: 0, failedCount: 0 },
      createdAt: "2026-07-06T12:30:00.000Z"
    });

    expect(exported.status).toBe("ready");
    expect(exported.payload?.coverage.coveredCategories).toEqual(expectedCategories);
    expect(exported.payload?.artifacts.map((artifact) => artifact.category)).toEqual(expectedCategories);
    expect(exported.payload?.artifacts.filter((artifact) => artifact.category === "projections")).toHaveLength(1);

    const result = await checkBackupManifest({
      workspace,
      currentLedgerHighWaterMark: 15,
      expectedCategories,
      backupManifest: exported.payload
    });

    expect(result.status).toBe("ready");
    expect(result.diagnostics).toEqual([]);
    expect(result.proposedActions).toEqual([]);
    expect(backupCheckDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("degrades layout contract mismatches instead of exporting a self-invalid manifest", async () => {
    const exported = await exportWorkspaceManifest({
      workspace,
      layout: {
        ...layout,
        layoutContractVersion: "portable-workspace-layout.v1-other" as never
      },
      ledgerEventCount: 15,
      ledgerHighWaterMark: 15,
      categoryBytes,
      diagnosticCounts: { errorCount: 0, warningCount: 0 },
      jobCounts: { queuedCount: 0, failedCount: 0 },
      createdAt: "2026-07-06T12:30:00.000Z"
    });

    expect(exported.status).toBe("degraded");
    expect(exported.payload).toBeUndefined();
    expect(exported.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_manifest_export_layout_contract_mismatch",
        category: "backup"
      })
    );
    expect(exported.proposedActions).toEqual([
      expect.objectContaining({
        kind: "export-manifest",
        requiresHumanApproval: false,
        mutatesCanonicalState: false,
        allowedNextCommands: ["manifest export", "backup check"]
      })
    ]);
    expect(JSON.stringify(exported)).not.toMatch(/PRIVATE-CASE-NOTE|access_token|abc123|canonicalLedgerEvents/);
    expect(workspaceOpsEnvelopeSchema.parse(exported)).toEqual(exported);
  });

  it.each([
    {
      name: "included sections omit roots claimed by coverage",
      mutate(manifest: ManifestExportDto): ManifestExportDto {
        const includedSections = ["layout", "manifest", "workspace"] as const;
        return {
          ...manifest,
          includedSections: [...includedSections],
          sectionHashes: manifest.sectionHashes.filter((sectionHash) =>
            includedSections.includes(sectionHash.sectionId as (typeof includedSections)[number])
          )
        };
      }
    },
    {
      name: "artifact summaries omit roots claimed by coverage",
      mutate(manifest: ManifestExportDto): ManifestExportDto {
        return {
          ...manifest,
          artifacts: manifest.artifacts.filter((artifact) => artifact.category === "ledger")
        };
      }
    }
  ])("degrades internally malformed exported manifests when $name", async ({ mutate }) => {
    const exported = await exportWorkspaceManifest({
      workspace,
      layout,
      ledgerEventCount: 15,
      ledgerHighWaterMark: 15,
      categoryBytes,
      diagnosticCounts: { errorCount: 0, warningCount: 0 },
      jobCounts: { queuedCount: 0, failedCount: 0 },
      createdAt: "2026-07-06T12:30:00.000Z"
    });
    const malformed = withRecomputedManifestHash(mutate(exported.payload as ManifestExportDto));

    const result = await checkBackupManifest({
      workspace,
      currentLedgerHighWaterMark: 15,
      expectedCategories,
      backupManifest: malformed
    });

    expect(result.status).toBe("degraded");
    expect(result.payload).toMatchObject({
      backupManifestPresent: true,
      identityMatches: false,
      layoutContractMatches: false,
      stale: true,
      containsSecretShapedFields: true
    });
    expect(result.payload?.missingCategories).toEqual(expectedCategories);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_backup_manifest_invalid",
        category: "backup"
      })
    );
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
    expect(JSON.stringify(result)).not.toMatch(/canonicalLedgerEvents|evidenceBodies|protected source|private text/i);
    expect(backupCheckDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it.each([
    {
      name: "duplicate artifact summaries",
      async manifest(): Promise<{
        readonly manifest: ManifestExportDto;
        readonly expected: readonly WorkspaceRootCategory[];
      }> {
        const exported = await exportWorkspaceManifest({
          workspace,
          layout,
          ledgerEventCount: 15,
          ledgerHighWaterMark: 15,
          categoryBytes,
          diagnosticCounts: { errorCount: 0, warningCount: 0 },
          jobCounts: { queuedCount: 0, failedCount: 0 },
          createdAt: "2026-07-06T12:30:00.000Z"
        });
        const projectionArtifact = exported.payload?.artifacts.find((artifact) => artifact.category === "projections");
        if (exported.payload === undefined || projectionArtifact === undefined) {
          throw new Error("manifest export fixture did not include projection artifact");
        }

        return {
          manifest: withRecomputedExportHashes({
            ...exported.payload,
            artifacts: [...exported.payload.artifacts, projectionArtifact]
          }),
          expected: expectedCategories
        };
      }
    },
    {
      name: "extra artifact summaries outside claimed coverage",
      async manifest(): Promise<{
        readonly manifest: ManifestExportDto;
        readonly expected: readonly WorkspaceRootCategory[];
      }> {
        const categoryBytesWithoutConfig = categoryBytes.filter((category) => category.category !== "config");
        const exported = await exportWorkspaceManifest({
          workspace,
          layout,
          ledgerEventCount: 15,
          ledgerHighWaterMark: 15,
          categoryBytes: categoryBytesWithoutConfig,
          diagnosticCounts: { errorCount: 0, warningCount: 0 },
          jobCounts: { queuedCount: 0, failedCount: 0 },
          createdAt: "2026-07-06T12:30:00.000Z"
        });
        const fullExport = await exportWorkspaceManifest({
          workspace,
          layout,
          ledgerEventCount: 15,
          ledgerHighWaterMark: 15,
          categoryBytes,
          diagnosticCounts: { errorCount: 0, warningCount: 0 },
          jobCounts: { queuedCount: 0, failedCount: 0 },
          createdAt: "2026-07-06T12:30:00.000Z"
        });
        const configArtifact = fullExport.payload?.artifacts.find((artifact) => artifact.category === "config");
        if (exported.payload === undefined || configArtifact === undefined) {
          throw new Error("manifest export fixture did not include config artifact");
        }

        return {
          manifest: withRecomputedExportHashes({
            ...exported.payload,
            artifacts: [...exported.payload.artifacts, configArtifact]
          }),
          expected: categoryBytesWithoutConfig.map((category) => category.category)
        };
      }
    }
  ])("degrades exported manifests with $name even when hashes are recomputed", async ({ manifest }) => {
    const malformed = await manifest();

    const result = await checkBackupManifest({
      workspace,
      currentLedgerHighWaterMark: 15,
      expectedCategories: malformed.expected,
      backupManifest: malformed.manifest
    });

    expect(result.status).toBe("degraded");
    expect(result.payload).toMatchObject({
      backupManifestPresent: true,
      identityMatches: false,
      layoutContractMatches: false,
      stale: true,
      containsSecretShapedFields: true
    });
    expect(result.payload?.missingCategories).toEqual(malformed.expected);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_backup_manifest_invalid",
        category: "backup"
      })
    );
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
    expect(JSON.stringify(result)).not.toMatch(/canonicalLedgerEvents|evidenceBodies|protected source|private text/i);
    expect(backupCheckDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("normalizes exported timestamps without milliseconds before backup checks", async () => {
    const exported = await exportWorkspaceManifest({
      workspace,
      layout,
      ledgerEventCount: 15,
      ledgerHighWaterMark: 15,
      categoryBytes,
      diagnosticCounts: { errorCount: 0, warningCount: 0 },
      jobCounts: { queuedCount: 0, failedCount: 0 },
      createdAt: "2026-07-06T12:30:00Z"
    });

    expect(exported.status).toBe("ready");
    expect(exported.payload?.exportedAt).toBe("2026-07-06T12:30:00.000Z");
    const result = await checkBackupManifest({
      workspace,
      currentLedgerHighWaterMark: 15,
      expectedCategories,
      backupManifest: exported.payload
    });

    expect(result.status).toBe("ready");
    expect(result.diagnostics).toEqual([]);
    expect(result.proposedActions).toEqual([]);
    expect(backupCheckDtoSchema.parse(result.payload)).toEqual(result.payload);
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
      expect.arrayContaining(["blobs", "projections", "cache", "config"])
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
      identityMatches: false,
      layoutContractMatches: false,
      stale: true,
      containsSecretShapedFields: true
    });
    expect(secretShaped.payload?.missingCategories).toEqual(expectedCategories);
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

  it.each([
    {
      name: "raw canonical ledger event copies",
      backupManifest: {
        workspaceId: workspace.workspaceId,
        layoutContractVersion: workspace.layoutContractVersion,
        ledgerHighWaterMark: 15,
        coveredCategories: expectedCategories,
        exportedAt: "2026-07-06T12:00:00.000Z",
        canonicalLedgerEvents: [{ id: "evt_private", payload: { note: "Mayor met vendor at home." } }]
      },
      leakedText: /Mayor met vendor at home|evt_private|canonicalLedgerEvents/
    },
    {
      name: "private body text without token-like strings",
      backupManifest: {
        workspaceId: workspace.workspaceId,
        layoutContractVersion: workspace.layoutContractVersion,
        ledgerHighWaterMark: 15,
        coveredCategories: expectedCategories,
        exportedAt: "2026-07-06T12:00:00.000Z",
        evidenceBodies: ["Confidential interview notes about a protected source."]
      },
      leakedText: /Confidential interview notes|protected source|evidenceBodies/
    },
    {
      name: "invalid exportedAt values",
      backupManifest: {
        workspaceId: workspace.workspaceId,
        layoutContractVersion: workspace.layoutContractVersion,
        ledgerHighWaterMark: 15,
        coveredCategories: expectedCategories,
        exportedAt: "not-a-date"
      },
      leakedText: /not-a-date/
    },
    {
      name: "rollover exportedAt values",
      backupManifest: {
        workspaceId: workspace.workspaceId,
        layoutContractVersion: workspace.layoutContractVersion,
        ledgerHighWaterMark: 15,
        coveredCategories: expectedCategories,
        exportedAt: "2026-02-31T12:00:00.000Z"
      },
      leakedText: /2026-02-31/
    },
    {
      name: "unexpected keys",
      backupManifest: {
        workspaceId: workspace.workspaceId,
        layoutContractVersion: workspace.layoutContractVersion,
        ledgerHighWaterMark: 15,
        coveredCategories: expectedCategories,
        exportedAt: "2026-07-06T12:00:00.000Z",
        harmlessLookingExtra: "should not be accepted"
      },
      leakedText: /harmlessLookingExtra|should not be accepted/
    }
  ])("degrades unsafe backup manifest shape for $name", async ({ backupManifest, leakedText }) => {
    const result = await checkBackupManifest({
      workspace,
      currentLedgerHighWaterMark: 15,
      expectedCategories,
      backupManifest
    } as never);

    expect(result.status).toBe("degraded");
    expect(result.payload).toMatchObject({
      backupManifestPresent: true,
      identityMatches: false,
      layoutContractMatches: false,
      stale: true,
      containsSecretShapedFields: true
    });
    expect(result.payload?.missingCategories).toEqual(expectedCategories);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_backup_manifest_invalid",
        category: "backup"
      })
    );
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
    expect(JSON.stringify(result)).not.toMatch(leakedText);
    expect(backupCheckDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("does not invoke accessors on allowed backup manifest fields", async () => {
    let getterCalls = 0;
    const backupManifest = {
      layoutContractVersion: workspace.layoutContractVersion,
      ledgerHighWaterMark: 15,
      coveredCategories: expectedCategories,
      exportedAt: "2026-07-06T12:00:00.000Z"
    };
    Object.defineProperty(backupManifest, "workspaceId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("private interview body without token shaped text");
      }
    });

    const result = await checkBackupManifest({
      workspace,
      currentLedgerHighWaterMark: 15,
      expectedCategories,
      backupManifest
    } as never);

    expect(getterCalls).toBe(0);
    expect(result.status).toBe("degraded");
    expect(result.payload).toMatchObject({
      backupManifestPresent: true,
      identityMatches: false,
      layoutContractMatches: false,
      missingCategories: expectedCategories,
      stale: true,
      containsSecretShapedFields: true
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_backup_manifest_invalid",
        category: "backup"
      })
    );
    expect(result.proposedActions).toEqual([
      expect.objectContaining({
        kind: "export-manifest",
        requiresHumanApproval: false,
        mutatesCanonicalState: false,
        allowedNextCommands: ["manifest export", "backup check"]
      })
    ]);
    expect(JSON.stringify(result)).not.toMatch(/private interview body|token shaped text/);
    expect(backupCheckDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });
});
