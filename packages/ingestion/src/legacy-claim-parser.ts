import { createHash } from "node:crypto";
import {
  assertLegacyConfidence,
  assertLegacySecretSafeDiagnosticText,
  type LegacyProposedAssertionCandidate,
  type LegacyQuarantineEntry
} from "./legacy-types.js";

export interface ParseLegacyClaimMetadataInput {
  readonly sourcePath: string;
  readonly contentHash: `sha256:${string}`;
  readonly text: string;
}

export interface ParseLegacyClaimMetadataResult {
  readonly candidates: LegacyProposedAssertionCandidate[];
  readonly quarantineEntries: LegacyQuarantineEntry[];
}

type JsonPrimitive = string | number | boolean | null;

const legacyClaimParserPlugin = {
  name: "legacy-json-claim-parser",
  version: "0.1.0"
} as const;

const defaultLegacyClaimConfidence = assertLegacyConfidence(0.5);

export function parseLegacyClaimMetadata(
  input: ParseLegacyClaimMetadataInput
): ParseLegacyClaimMetadataResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input.text) as unknown;
  } catch {
    return {
      candidates: [],
      quarantineEntries: [
        quarantineEntry(input, {
          issueCategory: "malformed",
          reason: "malformed-json",
          message: "Legacy JSON metadata could not be parsed.",
          repairAction: "Review the metadata file manually.",
          legacyIds: []
        })
      ]
    };
  }

  if (!isRecord(parsed) || parsed.legacyCestusType !== "claims") {
    return { candidates: [], quarantineEntries: [] };
  }

  if (!Array.isArray(parsed.claims)) {
    return {
      candidates: [],
      quarantineEntries: [
        quarantineEntry(input, {
          issueCategory: "unsupported",
          reason: "claims-array-missing",
          message: "Explicit legacy claims metadata must contain a claims array.",
          repairAction: "Review the legacy claims metadata shape.",
          legacyIds: []
        })
      ]
    };
  }

  const candidates: LegacyProposedAssertionCandidate[] = [];
  const quarantineEntries: LegacyQuarantineEntry[] = [];

  parsed.claims.forEach((record, index) => {
    const candidate = parseClaimRecord(input, record);

    if (candidate === undefined) {
      quarantineEntries.push(
        quarantineEntry(input, {
          issueCategory: "unsupported",
          reason: `claim-record-${index}`,
          message: "Explicit legacy claim record is incomplete or unsupported.",
          repairAction: "Add id, predicate, and primitive object fields before staging.",
          legacyIds: diagnosticLegacyIds(record)
        })
      );
      return;
    }

    candidates.push(candidate);
  });

  return { candidates, quarantineEntries };
}

function parseClaimRecord(
  input: ParseLegacyClaimMetadataInput,
  record: unknown
): LegacyProposedAssertionCandidate | undefined {
  if (!isRecord(record)) {
    return undefined;
  }

  if (
    typeof record.id !== "string" ||
    typeof record.predicate !== "string" ||
    !isJsonPrimitive(record.object) ||
    (record.subjectRef !== undefined && typeof record.subjectRef !== "string")
  ) {
    return undefined;
  }

  const confidence =
    record.confidence === undefined
      ? defaultLegacyClaimConfidence
      : typeof record.confidence === "number"
        ? safeLegacyConfidence(record.confidence)
        : undefined;

  if (confidence === undefined) {
    return undefined;
  }

  const idMaterial = legacyClaimIdMaterial(input, record.id);

  return {
    candidateId: `legacy_candidate_${hashHex(idMaterial)}`,
    observationId: `legacy_observation_${hashHex(`observation:${idMaterial}`)}`,
    evidenceContentHash: input.contentHash,
    sourcePath: input.sourcePath,
    ...(record.subjectRef === undefined ? {} : { subjectRef: record.subjectRef }),
    predicate: record.predicate,
    object: record.object,
    confidence
  };
}

function quarantineEntry(
  input: ParseLegacyClaimMetadataInput,
  issue: {
    readonly issueCategory: LegacyQuarantineEntry["issueCategory"];
    readonly reason: string;
    readonly message: string;
    readonly repairAction: string;
    readonly legacyIds: readonly string[];
  }
): LegacyQuarantineEntry {
  return {
    quarantineId: `legacy_quarantine_${hashHex(`${input.sourcePath}:${input.contentHash}:${issue.reason}`)}`,
    sourcePath: input.sourcePath,
    contentHash: input.contentHash,
    plugin: legacyClaimParserPlugin,
    issueCategory: issue.issueCategory,
    message: assertLegacySecretSafeDiagnosticText(issue.message),
    legacyIds: [...issue.legacyIds],
    repairActions: [assertLegacySecretSafeDiagnosticText(issue.repairAction)]
  };
}

function diagnosticLegacyIds(record: unknown): string[] {
  if (!isRecord(record) || typeof record.id !== "string") {
    return [];
  }

  try {
    return [assertLegacySecretSafeDiagnosticText(record.id)];
  } catch {
    return [];
  }
}

function safeLegacyConfidence(value: number) {
  try {
    return assertLegacyConfidence(value);
  } catch {
    return undefined;
  }
}

function legacyClaimIdMaterial(input: ParseLegacyClaimMetadataInput, legacyClaimId: string): string {
  return `${input.sourcePath}:${input.contentHash}:${legacyClaimId}`;
}

function hashHex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
