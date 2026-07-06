import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { LegacyCestusInspector } from "../src/legacy-inspector.js";
import { conservativeJsonMetadataPlugin, LegacyDetectorRegistry } from "../src/legacy-plugins.js";
import { writeLegacyCestusFixture } from "./fixtures/legacy-cestus-fixtures.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "legacy-cestus-"));
  writeLegacyCestusFixture(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("LegacyCestusInspector", () => {
  it("inspects a mixed old-Cestus tree without importing evidence", async () => {
    const ledger = new InMemoryEventLedger();
    const inspector = new LegacyCestusInspector({
      ledger,
      detectorRegistry: new LegacyDetectorRegistry([conservativeJsonMetadataPlugin]),
      actor: { id: "actor_system", kind: "system", label: "Legacy inspector" }
    });

    const reportInput = await inspector.inspect({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      rootDir: root
    });

    expect(reportInput.files).toHaveLength(4);
    expect(reportInput.scan.totals.observedFiles).toBe(4);
    expect(reportInput.scan.totals.uniqueContent).toBe(3);
    expect(reportInput.detections.map((detection) => detection.sourcePath)).toEqual([
      "ontology/claims.json",
      "ontology/corrupt.json"
    ]);
    expect((await ledger.readAll()).map((event) => event.type)).not.toContain("evidence.ingested");
  });
});
