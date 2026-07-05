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
});
