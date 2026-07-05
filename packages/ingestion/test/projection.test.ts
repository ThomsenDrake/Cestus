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
});
