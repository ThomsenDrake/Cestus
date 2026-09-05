import type { EvidenceGovernanceWorkspaceDto } from "../../../ontology/src/governance-read-model.js";
import type { GovernanceTag } from "../../../ontology/src/governance-policy.js";

export interface EvidenceWorkspaceDto {
  readonly schemaVersion: "evidence-workspace.v1";
  readonly status: "ready" | "degraded";
  readonly sourceHighWaterMark: number;
  readonly items: readonly EvidenceItemDto[];
  readonly assertionCandidates: readonly EvidenceAssertionCandidateDto[];
  readonly diagnostics: readonly EvidenceWorkspaceDiagnosticDto[];
  readonly governance: EvidenceGovernanceWorkspaceDto;
}

export interface EvidenceItemDto {
  readonly evidenceId: string;
  readonly contentHash?: string;
  readonly mediaType?: string;
  readonly sizeBytes?: number;
  readonly source?: { readonly kind: string; readonly label: string };
  readonly sourceCollections: ReadonlyArray<{
    readonly sourceCollectionId: string;
    readonly label: string;
  }>;
  readonly importBatchIds: readonly string[];
  readonly occurrences: readonly EvidenceOccurrenceDto[];
  readonly parseJobs: readonly EvidenceParseJobDto[];
  readonly governanceTags: readonly EvidenceGovernanceTagDto[];
  readonly quarantined: boolean;
  readonly quarantineLockLevels: readonly ("workflow" | "export" | "all")[];
  readonly tombstoned: boolean;
  readonly linkedReferences: readonly EvidenceLinkedReferenceDto[];
  readonly provenanceComplete: boolean;
  readonly selectableForAssertionCandidate: boolean;
  readonly blockingReasons: readonly string[];
}

export interface EvidenceOccurrenceDto {
  readonly occurrenceId: string;
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly sourcePath: string;
  readonly contentHash: string;
  readonly sizeBytes: number;
  readonly status: "new" | "duplicate" | "changed" | "missing" | "skipped";
  readonly adapter?: { readonly name: string; readonly version: string };
  readonly archive?: {
    readonly containerPath: string;
    readonly containerHash: string;
    readonly internalPath: string;
    readonly adapter: { readonly name: string; readonly version: string };
  };
}

export interface EvidenceParseJobDto {
  readonly parseJobId: string;
  readonly sourceCollectionId: string;
  readonly importBatchId: string;
  readonly lane: "local" | "provider";
  readonly parser: { readonly name: string; readonly version: string };
  readonly state: "queued" | "running" | "succeeded" | "failed";
  readonly coverageStatus?: "complete" | "partial";
  readonly derivative?: { readonly contentHash: string; readonly mediaType: string };
}

export interface EvidenceGovernanceTagDto {
  readonly tag: GovernanceTag;
  readonly confidence: number;
  readonly rationale: string;
  readonly source: "ai" | "human";
  readonly status: "active" | "removed";
  readonly eventId: string;
}

export interface EvidenceLinkedReferenceDto {
  readonly kind: "prr" | "investigation";
  readonly id: string;
  readonly eventIds: readonly string[];
}

export interface EvidenceAssertionCandidateDto {
  readonly assertionId: string;
  readonly evidenceReferences: ReadonlyArray<{
    readonly evidenceId: string;
    readonly contentHash: string;
    readonly eventIds: readonly string[];
  }>;
  readonly predicate: string;
  readonly confidence: number;
  readonly reviewState: "proposed";
  readonly reviewRequired: true;
  readonly eventId: string;
}

export interface EvidenceWorkspaceDiagnosticDto {
  readonly code: "projection-error" | "missing-provenance" | "secret-safety";
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly repairActions: readonly string[];
}

export interface PrepareEvidenceAssertionCandidateInput {
  readonly assertionId: string;
  readonly evidenceId: string;
  readonly subjectRef?: string;
  readonly predicate: string;
  readonly object: string | number | boolean | null;
  readonly confidence: number;
}

export interface PrepareEvidenceAssertionCandidateResult {
  readonly candidate: EvidenceAssertionCandidateDto;
  readonly workspace: EvidenceWorkspaceDto;
}

export interface AppendEvidenceGovernanceReviewResult {
  readonly workspace: EvidenceWorkspaceDto;
}
