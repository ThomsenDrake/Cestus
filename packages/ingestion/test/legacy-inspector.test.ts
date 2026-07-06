import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { LegacyCestusInspector } from "../src/legacy-inspector.js";
import {
  conservativeJsonMetadataPlugin,
  LegacyDetectorRegistry,
  type LegacyDetectorPlugin
} from "../src/legacy-plugins.js";
import {
  writeLargeLegacyPreviewFixture,
  writeLegacyCestusArchiveFixture,
  writeLegacyCestusFixture
} from "./fixtures/legacy-cestus-fixtures.js";

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

    const eventTypes = (await ledger.readAll()).map((event) => event.type);
    expect(eventTypes.every((type) => [
      "ingestion.scan.started",
      "ingestion.occurrence.observed",
      "ingestion.scan.completed"
    ].includes(type))).toBe(true);
    expect(eventTypes).not.toContain("evidence.ingested");
    expect(eventTypes).not.toContain("assertion.proposed");
    expect(eventTypes).not.toContain("assertion.accepted");
    expect(eventTypes).not.toContain("entity.resolved");
    expect(eventTypes).not.toContain("relationship.accepted");
    expect(eventTypes).not.toContain("legacy.import.report.generated");
    expect(eventTypes).not.toContain("legacy.ontology.staging.approved");
  });

  it("preserves archive-child provenance in file inventory while skipping archive detections", async () => {
    rmSync(root, { recursive: true, force: true });
    root = mkdtempSync(join(tmpdir(), "legacy-cestus-archive-"));
    writeLegacyCestusArchiveFixture(root);
    const inspector = new LegacyCestusInspector({
      ledger: new InMemoryEventLedger(),
      detectorRegistry: new LegacyDetectorRegistry([conservativeJsonMetadataPlugin]),
      actor: { id: "actor_system", kind: "system", label: "Legacy inspector" }
    });

    const reportInput = await inspector.inspect({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      rootDir: root
    });

    expect(reportInput.detections.map((detection) => detection.sourcePath)).toEqual(["ontology/claims.json"]);
    expect(reportInput.files).toContainEqual(expect.objectContaining({
      sourcePath: "archives/legacy.zip",
      internalPath: "ontology/claims.json",
      containerPath: "archives/legacy.zip",
      containerHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      archiveAdapter: { name: "fflate", version: "0.8.x" },
      occurrenceId: expect.stringMatching(/^occ_[a-f0-9]{64}$/),
      status: "new",
      mediaType: "application/json"
    }));
    expect(reportInput.files.find(
      (file) => file.sourcePath === "ontology/claims.json" && file.containerPath === undefined
    )).toMatchObject({
      sourcePath: "ontology/claims.json",
      status: "duplicate",
      mediaType: "application/json"
    });
  });

  it("rejects invalid actors before inspection", () => {
    expect(() => new LegacyCestusInspector({
      ledger: new InMemoryEventLedger(),
      detectorRegistry: new LegacyDetectorRegistry([conservativeJsonMetadataPlugin]),
      actor: { id: "ab", kind: "system", label: "Legacy inspector" }
    })).toThrow(/Invalid legacy inspector actor/);
  });

  it("bounds detector previews for large legacy files", async () => {
    rmSync(root, { recursive: true, force: true });
    root = mkdtempSync(join(tmpdir(), "legacy-cestus-large-"));
    writeLargeLegacyPreviewFixture(root);
    const previewLengths: number[] = [];
    const previewRecorder: LegacyDetectorPlugin = {
      name: "preview-recorder",
      version: "0.1.0",
      detect(input) {
        previewLengths.push(input.previewBytes?.byteLength ?? 0);
        return {
          plugin: { name: "preview-recorder", version: "0.1.0" },
          shape: "preview-recorder",
          confidence: 0.1,
          parserEligible: false,
          reasonCodes: ["preview-length"]
        };
      }
    };
    const inspector = new LegacyCestusInspector({
      ledger: new InMemoryEventLedger(),
      detectorRegistry: new LegacyDetectorRegistry([previewRecorder]),
      actor: { id: "actor_system", kind: "system", label: "Legacy inspector" }
    });

    await inspector.inspect({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      rootDir: root
    });

    expect(previewLengths).toEqual([4096]);
    expect(previewLengths[0]).toBeLessThanOrEqual(4096);
  });
});
