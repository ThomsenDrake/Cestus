export interface OntologyPackVersionDto {
  readonly name: string;
  readonly version: string;
}

export interface OntologyAssertionDto {
  readonly assertionId: string;
  readonly reviewState: "proposed" | "accepted";
  readonly subjectRef?: string;
  readonly predicate: string;
  readonly confidence: number;
  readonly object?: string | number | boolean | null;
  readonly citationScope?: "whole-document" | "passage";
  readonly evidenceId: string;
  readonly eventIds: readonly string[];
  readonly packVersions: readonly OntologyPackVersionDto[];
}

export interface OntologyEntityDto {
  readonly entityId: string;
  readonly canonicalLabel: string;
  readonly entityType: string;
  readonly reviewState: "accepted";
  readonly supportingAssertionIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly eventIds: readonly string[];
  readonly packVersions: readonly OntologyPackVersionDto[];
}

export interface OntologyRelationshipDto {
  readonly relationshipId: string;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly relationshipType: string;
  readonly reviewState: "accepted";
  readonly supportingAssertionIds: readonly string[];
  readonly contradictingAssertionIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly eventIds: readonly string[];
  readonly packVersions: readonly OntologyPackVersionDto[];
}

export interface OntologyDiagnosticDto {
  readonly code: "projection-lag" | "unknown-event" | "missing-provenance" | "ledger-unavailable";
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly repairActions: readonly string[];
}

export interface OntologyPassageDto {
  readonly evidenceId: string;
  readonly contentHash: `sha256:${string}`;
  readonly locator: string;
  readonly text: string;
  readonly spanHash: `sha256:${string}`;
  readonly passageIndex: number;
  readonly extractionId: string;
  readonly authorityEventId: string;
}

export interface OntologyDocumentDto {
  readonly evidenceId: string;
  readonly contentHash: `sha256:${string}`;
  readonly mediaType: string;
  readonly extractionStatus: "extracted" | "partial" | "unextracted" | "parse-failed";
  readonly unextracted: boolean;
  readonly passageCount: number;
  readonly passages: readonly OntologyPassageDto[];
  readonly authorityEventId: string;
  readonly sourceCollectionId?: string;
  readonly importBatchId?: string;
  readonly parseFailureMessage?: string;
}

export interface OntologyWorkspaceDto {
  readonly schemaVersion: "ontology-workspace.v1";
  readonly status: "ready" | "degraded";
  readonly sourceHighWaterMark: number;
  readonly entities: readonly OntologyEntityDto[];
  readonly relationships: readonly OntologyRelationshipDto[];
  readonly assertions: readonly OntologyAssertionDto[];
  readonly documents?: readonly OntologyDocumentDto[];
  readonly diagnostics: readonly OntologyDiagnosticDto[];
}
