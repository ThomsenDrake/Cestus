import { describe, expect, it } from "vitest";
import {
  conservativeJsonMetadataPlugin,
  LegacyDetectorRegistry,
  type LegacyDetectorPlugin
} from "../src/legacy-plugins.js";
import {
  assertLegacySecretSafeDiagnosticText,
  firstLegacyArtifactAsk,
  legacyConfidenceSchema,
  type LegacyDetectorInput
} from "../src/legacy-types.js";

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
        invocationOrder.push(`${conservativeJsonMetadataPlugin.name}@${conservativeJsonMetadataPlugin.version}`);
        return conservativeJsonMetadataPlugin.detect(input);
      }
    };
    const registry = new LegacyDetectorRegistry([
      {
        name: "zzz-fixture-detector",
        version: "0.1.0",
        detect(input) {
          invocationOrder.push("zzz-fixture-detector@0.1.0");
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
        name: "same-fixture-detector",
        version: "0.2.0",
        detect() {
          invocationOrder.push("same-fixture-detector@0.2.0");
          return undefined;
        }
      },
      {
        name: "same-fixture-detector",
        version: "0.1.0",
        detect() {
          invocationOrder.push("same-fixture-detector@0.1.0");
          return undefined;
        }
      },
      {
        name: "aaa-fixture-detector",
        version: "0.1.0",
        detect() {
          invocationOrder.push("aaa-fixture-detector@0.1.0");
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
      "aaa-fixture-detector@0.1.0",
      "legacy-json-metadata@0.1.0",
      "same-fixture-detector@0.1.0",
      "same-fixture-detector@0.2.0",
      "zzz-fixture-detector@0.1.0"
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

  it("exposes a shared bounded confidence schema", () => {
    expect(legacyConfidenceSchema.safeParse(0).success).toBe(true);
    expect(legacyConfidenceSchema.safeParse(0.5).success).toBe(true);
    expect(legacyConfidenceSchema.safeParse(1).success).toBe(true);
    expect(legacyConfidenceSchema.safeParse(1.1).success).toBe(false);
    expect(legacyConfidenceSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
    expect(legacyConfidenceSchema.safeParse(Number.NEGATIVE_INFINITY).success).toBe(false);
    expect(legacyConfidenceSchema.safeParse(Number.NaN).success).toBe(false);
  });

  it("rejects detector results with out-of-range or non-finite confidence", () => {
    const registry = new LegacyDetectorRegistry([
      fixtureDetector("valid-low-detector", "valid-low-result", 0.2),
      fixtureDetector("too-high-detector", "too-high-result", 1.1),
      fixtureDetector("infinite-detector", "infinite-result", Number.POSITIVE_INFINITY),
      fixtureDetector("negative-infinite-detector", "negative-infinite-result", Number.NEGATIVE_INFINITY),
      fixtureDetector("nan-detector", "nan-result", Number.NaN),
      fixtureDetector("zero-detector", "zero-result", 0),
      fixtureDetector("valid-high-detector", "valid-high-result", 1)
    ]);

    const detections = registry.detect(detectorInput());

    expect(detections.map((detection) => `${detection.plugin.name}:${detection.confidence}`)).toEqual([
      "valid-high-result:1",
      "valid-low-result:0.2"
    ]);
  });

  it("validates plugin warnings as secret-safe single-line diagnostic text", () => {
    const registry = new LegacyDetectorRegistry([
      {
        name: "warning-fixture-detector",
        version: "0.1.0",
        detect() {
          return {
            plugin: { name: "warning-fixture-detector", version: "0.1.0" },
            shape: "fixture",
            confidence: 0.6,
            parserEligible: false,
            reasonCodes: ["fixture"],
            warnings: [
              "Manifest references an unsupported legacy field.",
              "token=secret-123",
              "raw snippet line one\nraw snippet line two"
            ]
          };
        }
      }
    ]);

    const detections = registry.detect(detectorInput());

    expect(detections).toHaveLength(1);
    expect(detections[0]?.warnings).toEqual(["Manifest references an unsupported legacy field."]);
    expect(JSON.stringify(detections)).not.toMatch(/secret-123|token|raw snippet line two/i);
  });

  it("rejects unsafe legacy diagnostic helper text", () => {
    expect(assertLegacySecretSafeDiagnosticText("Inspect unsupported legacy registry shape.")).toBe(
      "Inspect unsupported legacy registry shape."
    );
    expect(() => assertLegacySecretSafeDiagnosticText("password=hunter2")).toThrow(/secret-safe/i);
    expect(() => assertLegacySecretSafeDiagnosticText("raw line one\nraw line two")).toThrow(/single line/i);
  });

  it("allows detector plugins to receive preview bytes", () => {
    const input = {
      ...detectorInput(),
      previewBytes: new Uint8Array([123, 34, 108])
    } satisfies LegacyDetectorInput;
    const registry = new LegacyDetectorRegistry([
      {
        name: "binary-preview-detector",
        version: "0.1.0",
        detect(detectorInput) {
          return {
            plugin: { name: "binary-preview-detector", version: "0.1.0" },
            shape: "binary-preview",
            confidence: detectorInput.previewBytes?.[0] === 123 ? 0.7 : 0,
            parserEligible: false,
            reasonCodes: ["binary-preview"]
          };
        }
      }
    ]);

    expect(registry.detect(input).map((detection) => detection.shape)).toEqual(["binary-preview"]);
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

function detectorInput(): LegacyDetectorInput {
  return {
    sourcePath: "ontology/person.json",
    sizeBytes: 28,
    contentHash,
    mediaType: "application/json",
    previewText: "{\"legacyCestusType\":\"claims\"}",
    sourceCollectionId: "src_old_cestus",
    scanBatchId: "scan_old_cestus_001"
  };
}

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
