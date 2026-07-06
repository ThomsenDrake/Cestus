import { describe, expect, it } from "vitest";
import { conservativeJsonMetadataPlugin, LegacyDetectorRegistry } from "../src/legacy-plugins.js";
import { firstLegacyArtifactAsk } from "../src/legacy-types.js";

const contentHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;

describe("legacy detector registry", () => {
  it("exposes the first artifact ask for user recon", () => {
    expect(firstLegacyArtifactAsk).toEqual([
      "Read-only folder tree listing of the old Cestus root",
      "Two to five sanitized metadata or ontology files",
      "Any old manifest, index, registry, or graph export file if present"
    ]);
  });

  it("runs detector plugins in deterministic order and result ordering", () => {
    const registry = new LegacyDetectorRegistry([
      conservativeJsonMetadataPlugin,
      {
        name: "zzz-fixture-detector",
        version: "0.1.0",
        detect(input) {
          return {
            plugin: { name: "zzz-fixture-detector", version: "0.1.0" },
            shape: "fixture",
            confidence: input.sourcePath.endsWith(".json") ? 0.51 : 0,
            parserEligible: false,
            reasonCodes: ["fixture"]
          };
        }
      }
    ]);

    const detections = registry.detect({
      sourcePath: "ontology/person.json",
      sizeBytes: 28,
      contentHash,
      mediaType: "application/json",
      previewText: "{\"legacyCestusType\":\"claims\"}",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001"
    });

    expect(detections.map((detection) => detection.plugin.name)).toEqual([
      "legacy-json-metadata",
      "zzz-fixture-detector"
    ]);
    expect(detections[0]).toMatchObject({
      shape: "json-legacy-metadata",
      confidence: 0.8,
      parserEligible: true,
      reasonCodes: ["json", "explicit-legacy-cestus-marker"]
    });
  });

  it("keeps generic JSON detection conservative", () => {
    const registry = new LegacyDetectorRegistry([conservativeJsonMetadataPlugin]);
    const detections = registry.detect({
      sourcePath: "notes/random.json",
      sizeBytes: 12,
      contentHash,
      mediaType: "application/json",
      previewText: "{\"agency\":true}",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001"
    });

    expect(detections).toEqual([]);
  });
});
