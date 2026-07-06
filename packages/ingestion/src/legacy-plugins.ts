import type {
  LegacyDetection,
  LegacyDetectorInput,
  LegacyPluginRef
} from "./legacy-types.js";

export interface LegacyDetectorPlugin extends LegacyPluginRef {
  detect(input: LegacyDetectorInput): LegacyDetection | undefined;
}

export class LegacyDetectorRegistry {
  private readonly plugins: LegacyDetectorPlugin[];

  constructor(plugins: readonly LegacyDetectorPlugin[]) {
    this.plugins = [...plugins].sort((left, right) => compareCodeUnits(left.name, right.name));
  }

  detect(input: LegacyDetectorInput): LegacyDetection[] {
    return this.plugins
      .map((plugin) => plugin.detect(input))
      .filter((detection): detection is LegacyDetection => detection !== undefined && detection.confidence > 0)
      .sort((left, right) => {
        const confidence = right.confidence - left.confidence;
        return confidence === 0 ? compareCodeUnits(left.plugin.name, right.plugin.name) : confidence;
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

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
