import { describe, expect, it } from "vitest";
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import { buildIngestionProjection } from "../src/projection.js";
import { buildIngestionReviewDto } from "../src/read-api.js";
import { goldenIngestionLedgerEvents } from "./fixtures/golden-ingestion-ledger.js";

const fixedHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

describe("buildIngestionProjection", () => {
  it("rebuilds source, scan, occurrence, import, evidence link, and parse state", () => {
    for (const event of goldenIngestionLedgerEvents) {
      expect(validateKnowledgeEvent(event).success, event.type).toBe(true);
    }

    const projection = buildIngestionProjection(goldenIngestionLedgerEvents);

    expect(projection.sources.get("src_drive_001")?.latestScanBatchId).toBe("scan_001");
    expect(projection.duplicatesByHash.get(fixedHash)).toEqual(["occ_001", "occ_002"]);
    expect(projection.evidenceByHash.get(fixedHash)).toBe("ev_ing_001");
  });

  it("quarantines unrecognized runtime events as projection diagnostics", () => {
    const projection = buildIngestionProjection([
      ...goldenIngestionLedgerEvents,
      {
        id: "evt_ing_future_event",
        type: "ingestion.future.created",
        streamId: "ingestion_import_src_drive_001_scan_001_imp_001",
        context: {
          occurredAt: "2026-07-05T12:06:00.000Z"
        },
        payload: {
          sourceCollectionId: "src_drive_001"
        }
      }
    ]);

    expect(projection.diagnostics.get("diag_projection_unrecognized_evt_ing_future_event")).toMatchObject({
      diagnosticId: "diag_projection_unrecognized_evt_ing_future_event",
      eventId: "evt_ing_future_event",
      severity: "warning",
      category: "projection",
      sourceCollectionId: "src_drive_001",
      message: "Unrecognized event type ingestion.future.created"
    });
    expect(projection.diagnosticsBySourceCollectionId.get("src_drive_001")).toContain(
      "diag_projection_unrecognized_evt_ing_future_event"
    );
  });

  it("does not invent scan state when quarantining an event for a missing scan", () => {
    const projection = buildIngestionProjection([
      goldenIngestionLedgerEvents[0],
      {
        id: "evt_ing_future_missing_scan",
        type: "ingestion.future.created",
        streamId: "ingestion_scan_scan_missing",
        context: {
          occurredAt: "2026-07-05T12:06:00.000Z"
        },
        payload: {
          sourceCollectionId: "src_drive_001",
          scanBatchId: "scan_missing"
        }
      }
    ]);

    expect(projection.diagnostics.get("diag_projection_unrecognized_evt_ing_future_missing_scan")).toMatchObject({
      diagnosticId: "diag_projection_unrecognized_evt_ing_future_missing_scan",
      eventId: "evt_ing_future_missing_scan",
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_missing",
      message: "Unrecognized event type ingestion.future.created"
    });
    expect(projection.scans.has("scan_missing")).toBe(false);
  });

  it("associates encoded diagnostic streams when IDs contain marker substrings", () => {
    const sourceCollectionId = "src_drive_scan_shadow_001";
    const scanBatchId = "scan_batch_imp_shadow_001";
    const importBatchId = "imp_import_scan_shadow_001";
    const diagnosticId = "diag_marker_substring_stream";
    const diagnosticStreamId = encodedDiagnosticStreamId(sourceCollectionId, scanBatchId, importBatchId);
    const context = {
      actor: { id: "actor_system", kind: "system" as const, label: "Cestus" },
      occurredAt: "2026-07-06T16:00:00.000Z",
      correlationId: "corr_marker_substring_stream",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    };

    const projection = buildIngestionProjection([
      {
        id: "evt_marker_source_registered",
        type: "ingestion.source.registered",
        version: 1,
        streamId: `ingestion_source_${sourceCollectionId}`,
        sequence: 1,
        context,
        payload: {
          sourceCollectionId,
          label: "Marker substring source",
          mode: "read-only",
          adapter: { name: "local-filesystem", version: "0.1.0" },
          rootUri: "file:///source",
          workspaceUri: "cestus-workspace://marker"
        }
      },
      {
        id: "evt_marker_scan_started",
        type: "ingestion.scan.started",
        version: 1,
        streamId: `ingestion_scan_${scanBatchId}`,
        sequence: 1,
        context,
        payload: {
          scanBatchId,
          sourceCollectionId,
          hashPolicy: "sha256-dry-run",
          startedAt: "2026-07-06T16:00:00.000Z"
        }
      },
      {
        id: "evt_marker_scan_completed",
        type: "ingestion.scan.completed",
        version: 1,
        streamId: `ingestion_scan_${scanBatchId}`,
        sequence: 2,
        context,
        payload: {
          scanBatchId,
          sourceCollectionId,
          completedAt: "2026-07-06T16:01:00.000Z",
          inventoryHash: fixedHash,
          totals: {
            observedFiles: 0,
            uniqueContent: 0,
            duplicateOccurrences: 0,
            skipped: 0,
            bytes: 0,
            estimatedNewBlobBytes: 0
          }
        }
      },
      {
        id: "evt_marker_diagnostic",
        type: "diagnostic.recorded",
        version: 1,
        streamId: diagnosticStreamId,
        sequence: 1,
        context,
        payload: {
          diagnosticId,
          severity: "error",
          category: "ingestion",
          message: "Approved dry-run inventory no longer matches current source bytes.",
          repairHint: {
            contract: "IngestionRuntime.importApproved",
            violatedPath: "approvedDryRunInventory",
            allowedActions: ["rerun dry-run scan"]
          }
        }
      }
    ]);

    expect(projection.diagnostics.get(diagnosticId)).toMatchObject({
      diagnosticId,
      sourceCollectionId,
      scanBatchId,
      streamId: diagnosticStreamId
    });
    expect(projection.scans.get(scanBatchId)?.diagnosticIds).toContain(diagnosticId);
    expect(buildIngestionReviewDto(projection, sourceCollectionId).diagnostics).toContainEqual(
      expect.objectContaining({ diagnosticId, category: "ingestion" })
    );
  });

  it("quarantines malformed known ingestion events as validation diagnostics", () => {
    const malformedScanCompleted = {
      ...goldenIngestionLedgerEvents[4],
      payload: {
        ...goldenIngestionLedgerEvents[4]?.payload,
        totals: {
          observedFiles: 2,
          uniqueContent: 1,
          duplicateOccurrences: 1,
          skipped: 0,
          estimatedNewBlobBytes: 4
        }
      }
    };

    const projection = buildIngestionProjection([
      ...goldenIngestionLedgerEvents.slice(0, 4),
      malformedScanCompleted
    ]);

    expect(projection.diagnostics.get("diag_projection_validation_evt_ing_scan_completed")).toMatchObject({
      diagnosticId: "diag_projection_validation_evt_ing_scan_completed",
      eventId: "evt_ing_scan_completed",
      severity: "error",
      category: "validation",
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      message: "Validation failed for event type ingestion.scan.completed",
      validationIssues: [
        expect.objectContaining({
          path: "payload.totals.bytes",
          message: expect.any(String)
        })
      ]
    });
  });

  it("clears parse failure fields when a retry later succeeds", () => {
    const projection = buildIngestionProjection([
      ...goldenIngestionLedgerEvents.slice(0, 9),
      {
        ...goldenIngestionLedgerEvents[9],
        id: "evt_ing_parse_failed",
        type: "ingestion.parse.failed",
        sequence: 2,
        payload: {
          parseJobId: "parse_001",
          sourceCollectionId: "src_drive_001",
          importBatchId: "imp_001",
          evidenceId: "ev_ing_001",
          lane: "local",
          parser: { name: "local-text", version: "0.1.0" },
          failedAt: "2026-07-05T12:04:30.000Z",
          message: "temporary parser failure",
          retryable: true
        }
      },
      {
        ...goldenIngestionLedgerEvents[9],
        sequence: 3
      }
    ]);

    expect(projection.parseJobs.get("parse_001")).toEqual(
      expect.objectContaining({
        state: "succeeded",
        completedEventId: "evt_ing_parse_completed",
        completedAt: "2026-07-05T12:05:00.000Z",
        outputHash: fixedHash
      })
    );
    expect(projection.parseJobs.get("parse_001")).not.toHaveProperty("failedEventId");
    expect(projection.parseJobs.get("parse_001")).not.toHaveProperty("failedAt");
    expect(projection.parseJobs.get("parse_001")).not.toHaveProperty("message");
    expect(projection.parseJobs.get("parse_001")).not.toHaveProperty("retryable");
  });

  it("clears parse completion fields when a later terminal failure is replayed", () => {
    const projection = buildIngestionProjection([
      ...goldenIngestionLedgerEvents,
      {
        ...goldenIngestionLedgerEvents[9],
        id: "evt_ing_parse_failed",
        type: "ingestion.parse.failed",
        sequence: 3,
        payload: {
          parseJobId: "parse_001",
          sourceCollectionId: "src_drive_001",
          importBatchId: "imp_001",
          evidenceId: "ev_ing_001",
          lane: "local",
          parser: { name: "local-text", version: "0.1.0" },
          failedAt: "2026-07-05T12:06:00.000Z",
          message: "terminal parser failure",
          retryable: false
        }
      }
    ]);

    expect(projection.parseJobs.get("parse_001")).toEqual(
      expect.objectContaining({
        state: "failed",
        failedEventId: "evt_ing_parse_failed",
        failedAt: "2026-07-05T12:06:00.000Z",
        message: "terminal parser failure",
        retryable: false
      })
    );
    expect(projection.parseJobs.get("parse_001")).not.toHaveProperty("completedEventId");
    expect(projection.parseJobs.get("parse_001")).not.toHaveProperty("completedAt");
    expect(projection.parseJobs.get("parse_001")).not.toHaveProperty("outputHash");
  });

  it("keys provider approvals by source, import, and provider job identity", () => {
    const firstProviderApproval = {
      id: "evt_ing_provider_approved_001",
      type: "ingestion.provider.approved",
      version: 1,
      streamId: "ingestion_provider_src_drive_001_imp_001_provider_shared",
      sequence: 1,
      context: {
        actor: { id: "actor_investigator", kind: "human", label: "Investigator" },
        occurredAt: "2026-07-05T12:06:00.000Z",
        correlationId: "corr_provider_shared",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0" }
      },
      payload: {
        providerJobId: "provider_shared",
        sourceCollectionId: "src_drive_001",
        importBatchId: "imp_001",
        provider: { name: "mistral-document-ai", version: "0.1.0" },
        approvedBy: "actor_investigator",
        approvedAt: "2026-07-05T12:06:00.000Z",
        eligibleMediaTypes: ["application/pdf"],
        maxBytesPerFile: 50000000,
        policy: "send-all-technically-eligible"
      }
    };
    const secondProviderApproval = {
      ...firstProviderApproval,
      id: "evt_ing_provider_approved_002",
      streamId: "ingestion_provider_src_drive_002_imp_002_provider_shared",
      context: {
        ...firstProviderApproval.context,
        correlationId: "corr_provider_shared_second"
      },
      payload: {
        ...firstProviderApproval.payload,
        sourceCollectionId: "src_drive_002",
        importBatchId: "imp_002",
        approvedAt: "2026-07-05T12:07:00.000Z",
        eligibleMediaTypes: ["image/png"]
      }
    };

    expect(validateKnowledgeEvent(firstProviderApproval).success).toBe(true);
    expect(validateKnowledgeEvent(secondProviderApproval).success).toBe(true);

    const projection = buildIngestionProjection([firstProviderApproval, secondProviderApproval]);

    expect(projection.providerApprovals).toHaveLength(2);
    expect(projection.providerApprovals.get("ingestion_provider_src_drive_001_imp_001_provider_shared")).toMatchObject({
      approvedEventId: "evt_ing_provider_approved_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      providerJobId: "provider_shared"
    });
    expect(projection.providerApprovals.get("ingestion_provider_src_drive_002_imp_002_provider_shared")).toMatchObject({
      approvedEventId: "evt_ing_provider_approved_002",
      sourceCollectionId: "src_drive_002",
      importBatchId: "imp_002",
      providerJobId: "provider_shared"
    });
  });
});

function encodedDiagnosticStreamId(sourceCollectionId: string, scanBatchId: string, importBatchId: string): string {
  return `ingestion_diagnostic_v1.${base64Url(sourceCollectionId)}.${base64Url(scanBatchId)}.${base64Url(importBatchId)}`;
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
