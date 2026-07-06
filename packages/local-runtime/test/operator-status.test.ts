import { describe, expect, it } from "vitest";
import { operatorStatusDtoSchema } from "../../operator-status/src/contracts.js";
import { buildOperatorStatusDto } from "../src/operator-status.js";

describe("operator status aggregation", () => {
  const now = () => "2026-07-06T21:00:00.000Z";

  it("reports mounted workspace, ingestion action gate, legacy samples, and PRR readiness", async () => {
    const status = await buildOperatorStatusDto({
      now,
      runtime: {
        available: true,
        storageStrategy: "portable-workspace",
        bindMode: "loopback",
        workspaceMounted: true,
        safeMessage: "Runtime ready."
      },
      workspace: async () => ({
        schemaVersion: "workspace-ops.v1",
        command: "verify workspace",
        ok: true,
        status: "ready",
        workspace: {
          workspaceId: "ws_case_001",
          label: "Case 001",
          manifestVersion: 1,
          rootUri: "file:///workspace",
          layoutContractVersion: "portable-workspace-layout.v1-provisional"
        },
        payload: {
          schemaVersion: "workspace-ops.v1",
          mountStatus: {
            status: "available",
            safeMessage: "Workspace is available.",
            nextCommandHints: [
              {
                allowedNextCommands: ["verify workspace"],
                safeReason: "Verify workspace state.",
                requiresHumanApproval: false
              }
            ]
          },
          manifest: {
            readable: true,
            valid: true,
            manifestVersion: 1,
            safeSummary: "Manifest valid."
          },
          layout: {
            contractVersion: "portable-workspace-layout.v1-provisional",
            readable: true,
            requiredRoots: []
          },
          ledger: { readable: true, eventCount: 14, highWaterMark: 14 },
          blobStore: {
            available: true,
            contentAddressedRootCount: 2,
            aggregateBytes: 2048,
            missingBlobCount: 0,
            hashMismatchCount: 0
          },
          projections: { available: true, staleCount: 0, rebuildable: true },
          jobs: { available: true, queuedCount: 0, failedCount: 0 },
          diagnostics: { visible: true, errorCount: 0, warningCount: 0 },
          backup: { manifestAvailable: false, stale: true }
        },
        diagnostics: [],
        proposedActions: []
      }),
      ingestion: async () => ({
        workspace: {
          mounted: true,
          workspaceId: "ws_case_001",
          label: "Case 001",
          capabilities: {
            canReadLedger: true,
            canAppendLedger: true,
            canWriteBlobs: true,
            canWriteDerivatives: true,
            canWriteJobState: true
          },
          review: {
            sourceCollectionId: "src_old_archive",
            label: "Old archive",
            latestScanBatchId: "scan_001",
            totals: {
              observedFiles: 8,
              uniqueContent: 6,
              duplicateOccurrences: 2,
              skipped: 0,
              bytes: 4096,
              estimatedNewBlobBytes: 2048
            },
            approvalRequired: true,
            duplicateGroups: [],
            evidenceLinks: [],
            parseJobs: [],
            diagnostics: []
          },
          diagnostics: []
        },
        jobs: { jobs: [] },
        diagnostics: { diagnostics: [] }
      }),
      legacy: async () => ({
        sourceCollectionId: "src_old_archive",
        rawImportRequiresApproval: false,
        ontologyStagingApproved: false,
        firstArtifactAsk: [
          "Read-only folder tree listing of the old Cestus root",
          "Two to five sanitized metadata or ontology files",
          "Any old manifest, index, registry, or graph export file if present"
        ],
        diagnostics: []
      }),
      prr: async () => ({
        cards: [],
        diagnostics: []
      })
    });

    expect(operatorStatusDtoSchema.parse(status)).toEqual(status);
    expect(status.summary.overallState).toBe("action-required");
    expect(status.sections.map((section) => [section.sectionId, section.state])).toEqual([
      ["workspace", "ready"],
      ["ingestion", "action-required"],
      ["legacy-import", "action-required"],
      ["prr", "ready"]
    ]);
    expect(JSON.stringify(status)).not.toMatch(/token|password|private key/i);
  });

  it("turns provider failure into unavailable section state without failing the whole DTO", async () => {
    const status = await buildOperatorStatusDto({
      now,
      runtime: { available: true, safeMessage: "Runtime ready." },
      workspace: async () => {
        throw new Error("workspace unavailable");
      },
      ingestion: async () => ({
        workspace: { mounted: false, diagnostics: [] },
        jobs: { jobs: [] },
        diagnostics: { diagnostics: [] }
      }),
      legacy: async () => {
        throw new Error("legacy unavailable");
      },
      prr: async () => ({ cards: [], diagnostics: [] })
    });

    expect(operatorStatusDtoSchema.parse(status)).toEqual(status);
    expect(status.sections.find((section) => section.sectionId === "workspace")?.state).toBe(
      "unavailable"
    );
    expect(status.sections.find((section) => section.sectionId === "legacy-import")?.state).toBe(
      "unavailable"
    );
  });

  it("treats approved legacy staging with a report as ready even when generic sample ask text is present", async () => {
    const status = await buildOperatorStatusDto({
      now,
      runtime: { available: true, safeMessage: "Runtime ready." },
      workspace: readyWorkspace,
      ingestion: readyIngestion,
      legacy: async () => ({
        sourceCollectionId: "src_old_archive",
        latestReportId: "legacy_report_001",
        rawImportRequiresApproval: false,
        ontologyStagingApproved: true,
        firstArtifactAsk: [
          "Read-only folder tree listing of the old Cestus root",
          "Two to five sanitized metadata or ontology files"
        ],
        diagnostics: []
      }),
      prr: readyPrr
    });

    expect(operatorStatusDtoSchema.parse(status)).toEqual(status);
    expect(status.sections.find((section) => section.sectionId === "legacy-import")?.state).toBe(
      "ready"
    );
    expect(status.summary.overallState).not.toBe("action-required");
  });

  it("does not throw or leak unsafe provider reference text", async () => {
    const status = await buildOperatorStatusDto({
      now,
      runtime: { available: true, safeMessage: "Runtime ready." },
      workspace: readyWorkspace,
      ingestion: async () => ({
        workspace: {
          mounted: true,
          workspaceId: "ws_case_001",
          label: "Case 001",
          review: {
            sourceCollectionId: "src_token=abc123",
            label: "Old archive",
            totals: emptyIngestionTotals(),
            approvalRequired: false,
            duplicateGroups: [],
            evidenceLinks: [],
            parseJobs: [],
            diagnostics: []
          },
          diagnostics: []
        },
        jobs: { jobs: [] },
        diagnostics: { diagnostics: [] }
      }),
      legacy: readyLegacy,
      prr: readyPrr
    });

    expect(operatorStatusDtoSchema.parse(status)).toEqual(status);
    expect(JSON.stringify(status)).not.toContain("token=abc123");
    expect(JSON.stringify(status)).not.toContain("abc123");
    expect(status.sections.find((section) => section.sectionId === "ingestion")?.state).toMatch(
      /^(ready|unavailable)$/
    );
  });

  it("surfaces one unavailable provider in the aggregate summary", async () => {
    const status = await buildOperatorStatusDto({
      now,
      runtime: { available: true, safeMessage: "Runtime ready." },
      workspace: async () => {
        throw new Error("workspace unavailable");
      },
      ingestion: readyIngestion,
      legacy: readyLegacy,
      prr: readyPrr
    });

    expect(operatorStatusDtoSchema.parse(status)).toEqual(status);
    expect(status.sections.find((section) => section.sectionId === "workspace")?.state).toBe(
      "unavailable"
    );
    expect(status.summary.overallState).toBe("degraded");
  });
});

async function readyWorkspace() {
  return {
    schemaVersion: "workspace-ops.v1" as const,
    command: "verify workspace" as const,
    ok: true,
    status: "ready" as const,
    workspace: {
      workspaceId: "ws_case_001",
      label: "Case 001",
      manifestVersion: 1,
      rootUri: "file:///workspace",
      layoutContractVersion: "portable-workspace-layout.v1-provisional"
    },
    payload: {
      schemaVersion: "workspace-ops.v1" as const,
      mountStatus: {
        status: "available" as const,
        safeMessage: "Workspace is available.",
        nextCommandHints: [
          {
            allowedNextCommands: ["verify workspace" as const],
            safeReason: "Verify workspace state.",
            requiresHumanApproval: false
          }
        ]
      },
      manifest: {
        readable: true,
        valid: true,
        manifestVersion: 1,
        safeSummary: "Manifest valid."
      },
      layout: {
        contractVersion: "portable-workspace-layout.v1-provisional",
        readable: true,
        requiredRoots: []
      },
      ledger: { readable: true, eventCount: 14, highWaterMark: 14 },
      blobStore: {
        available: true,
        contentAddressedRootCount: 2,
        aggregateBytes: 2048,
        missingBlobCount: 0,
        hashMismatchCount: 0
      },
      projections: { available: true, staleCount: 0, rebuildable: true },
      jobs: { available: true, queuedCount: 0, failedCount: 0 },
      diagnostics: { visible: true, errorCount: 0, warningCount: 0 },
      backup: { manifestAvailable: false, stale: true }
    },
    diagnostics: [],
    proposedActions: []
  };
}

async function readyIngestion() {
  return {
    workspace: {
      mounted: true,
      workspaceId: "ws_case_001",
      label: "Case 001",
      review: {
        sourceCollectionId: "src_old_archive",
        label: "Old archive",
        latestScanBatchId: "scan_001",
        totals: emptyIngestionTotals(),
        approvalRequired: false,
        duplicateGroups: [],
        evidenceLinks: [],
        parseJobs: [],
        diagnostics: []
      },
      diagnostics: []
    },
    jobs: { jobs: [] },
    diagnostics: { diagnostics: [] }
  };
}

async function readyLegacy() {
  return {
    sourceCollectionId: "src_old_archive",
    latestReportId: "legacy_report_001",
    rawImportRequiresApproval: false,
    ontologyStagingApproved: true,
    firstArtifactAsk: [],
    diagnostics: []
  };
}

async function readyPrr() {
  return { cards: [], diagnostics: [] };
}

function emptyIngestionTotals() {
  return {
    observedFiles: 0,
    uniqueContent: 0,
    duplicateOccurrences: 0,
    skipped: 0,
    bytes: 0,
    estimatedNewBlobBytes: 0
  };
}
