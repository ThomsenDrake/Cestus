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

export interface OntologyWorkspaceDto {
  readonly schemaVersion: "ontology-workspace.v1";
  readonly status: "ready" | "degraded";
  readonly sourceHighWaterMark: number;
  readonly entities: readonly OntologyEntityDto[];
  readonly relationships: readonly OntologyRelationshipDto[];
  readonly assertions: readonly OntologyAssertionDto[];
  readonly diagnostics: readonly OntologyDiagnosticDto[];
}
