export const firstLegacyArtifactAsk = [
  "Read-only folder tree listing of the old Cestus root",
  "Two to five sanitized metadata or ontology files",
  "Any old manifest, index, registry, or graph export file if present"
] as const;

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
}

export interface LegacyDetection {
  plugin: LegacyPluginRef;
  shape: string;
  confidence: number;
  parserEligible: boolean;
  reasonCodes: string[];
  warnings?: string[];
}

export interface LegacyObservation {
  observationId: string;
  kind: LegacyObservationKind;
  sourcePath: string;
  contentHash: `sha256:${string}`;
  plugin: LegacyPluginRef;
  confidence: number;
  label: string;
  subjectRef?: string;
  predicate?: string;
  object?: string | number | boolean | null;
  legacyIds: string[];
  notes: string[];
}

export interface LegacyQuarantineEntry {
  quarantineId: string;
  sourcePath: string;
  contentHash: `sha256:${string}`;
  plugin: LegacyPluginRef;
  issueCategory: "malformed" | "ambiguous" | "unsupported" | "stale-reference" | "unsafe" | "conflict";
  message: string;
  legacyIds: string[];
  repairActions: string[];
}

export interface LegacyProposedAssertionCandidate {
  candidateId: string;
  observationId: string;
  evidenceContentHash: `sha256:${string}`;
  sourcePath: string;
  predicate: string;
  object: string | number | boolean | null;
  subjectRef?: string;
  confidence: number;
}
