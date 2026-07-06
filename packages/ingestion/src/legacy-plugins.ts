import type {
  LegacyDetection,
  LegacyDetectorInput,
  LegacyDetectorOutput,
  LegacyPluginRef
} from "./legacy-types.js";
import {
  filterLegacySecretSafeDiagnosticTexts,
  parseLegacyConfidence
} from "./legacy-types.js";

export interface LegacyDetectorPlugin extends LegacyPluginRef {
  detect(input: LegacyDetectorInput): LegacyDetectorOutput | undefined;
}

export class LegacyDetectorRegistry {
  private readonly plugins: LegacyDetectorPlugin[];

  constructor(plugins: readonly LegacyDetectorPlugin[]) {
    this.plugins = [...plugins].sort(comparePluginRefs);
  }

  detect(input: LegacyDetectorInput): LegacyDetection[] {
    return this.plugins
      .map((plugin) => {
        const detection = plugin.detect(input);
        return detection === undefined ? undefined : normalizeDetection(plugin, detection);
      })
      .filter((detection): detection is LegacyDetection => detection !== undefined)
      .sort((left, right) => {
        const confidence = right.confidence - left.confidence;
        return confidence === 0 ? comparePluginRefs(left.plugin, right.plugin) : confidence;
      });
  }
}

export const conservativeJsonMetadataPlugin: LegacyDetectorPlugin = {
  name: "legacy-json-metadata",
  version: "0.1.0",
  detect(input) {
    if (input.mediaType !== "application/json" && !input.sourcePath.toLowerCase().endsWith(".json")) {
      return undefined;
    }
    if (!input.previewText?.includes("legacyCestusType")) {
      return undefined;
    }
    return {
      plugin: { name: "legacy-json-metadata", version: "0.1.0" },
      shape: "json-legacy-metadata",
      confidence: 0.8,
      parserEligible: true,
      reasonCodes: ["json", "explicit-legacy-cestus-marker"]
    };
  }
};

function normalizeDetection(
  invokedPlugin: LegacyDetectorPlugin,
  detection: LegacyDetectorOutput
): LegacyDetection | undefined {
  const confidence = parseLegacyConfidence(detection.confidence);

  if (confidence === undefined || confidence === 0) {
    return undefined;
  }

  const warnings = filterLegacySecretSafeDiagnosticTexts(detection.warnings);

  return {
    plugin: { name: invokedPlugin.name, version: invokedPlugin.version },
    shape: detection.shape,
    confidence,
    parserEligible: detection.parserEligible,
    reasonCodes: [...detection.reasonCodes],
    ...(warnings.length === 0 ? {} : { warnings })
  };
}

function comparePluginRefs(left: LegacyPluginRef, right: LegacyPluginRef): number {
  const name = compareCodeUnits(left.name, right.name);
  return name === 0 ? compareCodeUnits(left.version, right.version) : name;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
