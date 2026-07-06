import { z } from "zod";

export const firstLegacyArtifactAsk = [
  "Read-only folder tree listing of the old Cestus root",
  "Two to five sanitized metadata or ontology files",
  "Any old manifest, index, registry, or graph export file if present"
] as const;

declare const legacyConfidenceBrand: unique symbol;
declare const legacySecretSafeDiagnosticTextBrand: unique symbol;

export type LegacyConfidence = number & { readonly [legacyConfidenceBrand]: true };
export type LegacySecretSafeDiagnosticText = string & {
  readonly [legacySecretSafeDiagnosticTextBrand]: true;
};

export const legacyConfidenceSchema = z.number()
  .refine((value) => Number.isFinite(value), { message: "confidence must be finite" })
  .min(0)
  .max(1)
  .transform((value) => value as LegacyConfidence);

const legacySecretTextPatterns = [
  /(?:^|[^a-z0-9])(?:aws[\s._-]*secret[\s._-]*access[\s._-]*key|access[\s._-]*token|api[\s._-]*key|authorization|bearer|token|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth(?:[\s._-]*(?:token|secret|client))?|credential[\s._-]*(?:id|key|secret|token)?)(?:\s*[:=]\s*|\s+(?=[a-z0-9._~+/=-]{3,})(?=[a-z0-9._~+/=-]*[0-9])[a-z0-9][a-z0-9._~+/=-]*)/i,
  /(?:^|[^a-z0-9])bearer\s+[a-z0-9._~+/=-]{6,}/i,
  /(?:^|[^a-z0-9])sk-(?:proj|live|test)-[a-z0-9_-]{3,}/i
] as const;

export const legacySecretSafeDiagnosticTextSchema = z.string()
  .min(1)
  .max(240)
  .refine((value) => !/[\r\n]/.test(value), {
    message: "diagnostic text must be a single line"
  })
  .refine((value) => !legacySecretTextPatterns.some((pattern) => pattern.test(value)), {
    message: "diagnostic text must be secret-safe"
  })
  .transform((value) => value as LegacySecretSafeDiagnosticText);

export function parseLegacyConfidence(value: number): LegacyConfidence | undefined {
  const result = legacyConfidenceSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function assertLegacyConfidence(value: number): LegacyConfidence {
  const result = legacyConfidenceSchema.safeParse(value);

  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Legacy confidence must be in [0, 1]: ${issue?.message ?? result.error.message}`);
  }

  return result.data;
}

export function assertLegacySecretSafeDiagnosticText(value: string): LegacySecretSafeDiagnosticText {
  const result = legacySecretSafeDiagnosticTextSchema.safeParse(value);

  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Legacy diagnostic text must be secret-safe: ${issue?.message ?? result.error.message}`);
  }

  return result.data;
}

export function filterLegacySecretSafeDiagnosticTexts(
  values: readonly string[] | undefined
): LegacySecretSafeDiagnosticText[] {
  if (values === undefined) {
    return [];
  }

  return values.flatMap((value) => {
    const result = legacySecretSafeDiagnosticTextSchema.safeParse(value);
    return result.success ? [result.data] : [];
  });
}

export type LegacyObservationKind =
  | "possible-claim"
  | "possible-entity"
  | "possible-relationship"
  | "possible-property"
  | "candidate-entity-resolution"
  | "candidate-relationship"
  | "stale-reference"
  | "malformed-record"
  | "unknown-field";

export interface LegacyPluginRef {
  name: string;
  version: string;
}

export interface LegacyFileRef {
  sourcePath: string;
  sizeBytes: number;
  contentHash: `sha256:${string}`;
  mediaType: string;
  sourceCollectionId: string;
  scanBatchId: string;
}

export interface LegacyDetectorInput extends LegacyFileRef {
  previewText?: string;
  previewBytes?: Uint8Array;
}

export interface LegacyDetectorOutput {
  plugin: LegacyPluginRef;
  shape: string;
  confidence: number;
  parserEligible: boolean;
  reasonCodes: string[];
  warnings?: string[];
}

export interface LegacyDetection {
  plugin: LegacyPluginRef;
  shape: string;
  confidence: LegacyConfidence;
  parserEligible: boolean;
  reasonCodes: string[];
  warnings?: LegacySecretSafeDiagnosticText[];
}

export interface LegacyObservation {
  observationId: string;
  kind: LegacyObservationKind;
  sourcePath: string;
  contentHash: `sha256:${string}`;
  plugin: LegacyPluginRef;
  confidence: LegacyConfidence;
  label: string;
  subjectRef?: string;
  predicate?: string;
  object?: string | number | boolean | null;
  legacyIds: string[];
  notes: LegacySecretSafeDiagnosticText[];
}

export interface LegacyQuarantineEntry {
  quarantineId: string;
  sourcePath: string;
  contentHash: `sha256:${string}`;
  plugin: LegacyPluginRef;
  issueCategory: "malformed" | "ambiguous" | "unsupported" | "stale-reference" | "unsafe" | "conflict";
  message: LegacySecretSafeDiagnosticText;
  legacyIds: string[];
  repairActions: LegacySecretSafeDiagnosticText[];
}

export interface LegacyProposedAssertionCandidate {
  candidateId: string;
  observationId: string;
  evidenceContentHash: `sha256:${string}`;
  sourcePath: string;
  predicate: string;
  object: string | number | boolean | null;
  subjectRef?: string;
  confidence: LegacyConfidence;
}
