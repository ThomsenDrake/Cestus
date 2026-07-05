import { describe, expect, it } from "vitest";
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import { buildIngestionProjection } from "../src/projection.js";
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
});
