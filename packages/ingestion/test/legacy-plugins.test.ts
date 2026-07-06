import { describe, expect, it } from "vitest";
import {
  conservativeJsonMetadataPlugin,
  LegacyDetectorRegistry,
  type LegacyDetectorPlugin
} from "../src/legacy-plugins.js";
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

  it("invokes detector plugins in deterministic name order", () => {
    const invocationOrder: string[] = [];
    const recordingJsonDetector: LegacyDetectorPlugin = {
      ...conservativeJsonMetadataPlugin,
      detect(input) {
        invocationOrder.push(conservativeJsonMetadataPlugin.name);
        return conservativeJsonMetadataPlugin.detect(input);
      }
    };
    const registry = new LegacyDetectorRegistry([
      {
        name: "zzz-fixture-detector",
        version: "0.1.0",
        detect(input) {
          invocationOrder.push("zzz-fixture-detector");
          return {
            plugin: { name: "zzz-fixture-detector", version: "0.1.0" },
            shape: "fixture",
            confidence: input.sourcePath.endsWith(".json") ? 0.51 : 0,
            parserEligible: false,
            reasonCodes: ["fixture"]
          };
        }
      },
      recordingJsonDetector,
      {
        name: "aaa-fixture-detector",
        version: "0.1.0",
        detect() {
          invocationOrder.push("aaa-fixture-detector");
          return undefined;
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

    expect(invocationOrder).toEqual([
      "aaa-fixture-detector",
      "legacy-json-metadata",
      "zzz-fixture-detector"
    ]);
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

  it("orders detection results by confidence and plugin name", () => {
    const registry = new LegacyDetectorRegistry([
      fixtureDetector("zzz-low-detector", "zzz-low-result", 0.3),
      fixtureDetector("aaa-tie-detector", "zzz-tie-result", 0.8),
      fixtureDetector("mmm-high-detector", "mmm-high-result", 0.95),
      fixtureDetector("bbb-tie-detector", "aaa-tie-result", 0.8)
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

    expect(detections.map((detection) => `${detection.plugin.name}:${detection.confidence}`)).toEqual([
      "mmm-high-result:0.95",
      "aaa-tie-result:0.8",
      "zzz-tie-result:0.8",
      "zzz-low-result:0.3"
    ]);
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

function fixtureDetector(detectorName: string, resultPluginName: string, confidence: number): LegacyDetectorPlugin {
  return {
    name: detectorName,
    version: "0.1.0",
    detect() {
      return {
        plugin: { name: resultPluginName, version: "0.1.0" },
        shape: "fixture",
        confidence,
        parserEligible: false,
        reasonCodes: ["fixture"]
      };
    }
  };
}
