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
  const duplicateLegacyIds = duplicateClaimIds(parsed.claims);
  const quarantinedDuplicateIds = new Set<string>();

  parsed.claims.forEach((record, index) => {
    if (isRecord(record) && typeof record.id === "string" && duplicateLegacyIds.has(record.id)) {
      if (!quarantinedDuplicateIds.has(record.id)) {
        quarantinedDuplicateIds.add(record.id);
        quarantineEntries.push(
          quarantineEntry(input, {
            issueCategory: "conflict",
            reason: structuredHashHex({
              kind: "duplicate-legacy-claim-id",
              legacyClaimId: record.id
            }),
            message: "Duplicate legacy claim IDs cannot be staged automatically.",
            repairAction: "Review duplicate legacy claim IDs before staging.",
            legacyIds: diagnosticLegacyId(record.id)
          })
        );
      }
      return;
    }

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
    candidateId: `legacy_candidate_${structuredHashHex({
      kind: "legacy-claim-candidate",
      claim: idMaterial
    })}`,
    observationId: `legacy_observation_${structuredHashHex({
      kind: "legacy-claim-observation",
      claim: idMaterial
    })}`,
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
    quarantineId: `legacy_quarantine_${structuredHashHex({
      kind: "legacy-claim-quarantine",
      sourcePath: input.sourcePath,
      contentHash: input.contentHash,
      reason: issue.reason,
      legacyIds: issue.legacyIds
    })}`,
    sourcePath: input.sourcePath,
    contentHash: input.contentHash,
    plugin: legacyClaimParserPlugin,
    issueCategory: issue.issueCategory,
    message: assertLegacySecretSafeDiagnosticText(issue.message),
    legacyIds: [...issue.legacyIds],
    repairActions: [assertLegacySecretSafeDiagnosticText(issue.repairAction)]
  };
}

function duplicateClaimIds(records: readonly unknown[]): Set<string> {
  const counts = new Map<string, number>();

  for (const record of records) {
    if (isRecord(record) && typeof record.id === "string") {
      counts.set(record.id, (counts.get(record.id) ?? 0) + 1);
    }
  }

  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => id)
  );
}

function diagnosticLegacyIds(record: unknown): string[] {
  if (!isRecord(record) || typeof record.id !== "string") {
    return [];
  }

  return diagnosticLegacyId(record.id);
}

function diagnosticLegacyId(value: string): string[] {
  try {
    return [assertLegacySecretSafeDiagnosticText(value)];
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

function legacyClaimIdMaterial(input: ParseLegacyClaimMetadataInput, legacyClaimId: string) {
  return {
    sourcePath: input.sourcePath,
    contentHash: input.contentHash,
    legacyClaimId
  };
}

function structuredHashHex(value: unknown): string {
  return hashHex(stableJson(value));
}

function hashHex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortStableJsonValue(value));
}

function sortStableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortStableJsonValue);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, item]) => [key, sortStableJsonValue(item)])
    );
  }

  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
