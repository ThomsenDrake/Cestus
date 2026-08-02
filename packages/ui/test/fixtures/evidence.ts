import type { EvidenceWorkspaceDto } from "../../src/evidence/evidence-types.js";

export function workspaceDto(): EvidenceWorkspaceDto {
  return {
    schemaVersion: "evidence-workspace.v1",
    status: "ready",
    sourceHighWaterMark: 12,
    items: [
      {
        evidenceId: "ev_ing_001",
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        mediaType: "text/plain",
        sizeBytes: 4,
        source: { kind: "file", label: "a.txt" },
        sourceCollections: [{ sourceCollectionId: "src_drive_001", label: "External investigation archive" }],
        importBatchIds: ["imp_001"],
        occurrences: [
          {
            occurrenceId: "occ_001",
            sourceCollectionId: "src_drive_001",
            scanBatchId: "scan_001",
            sourcePath: "contracts/a.txt",
            contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
            sizeBytes: 4,
            status: "new",
            adapter: { name: "local-filesystem", version: "0.1.0" }
          },
          {
            occurrenceId: "occ_002",
            sourceCollectionId: "src_drive_001",
            scanBatchId: "scan_001",
            sourcePath: "duplicates/a-copy.txt",
            contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
            sizeBytes: 4,
            status: "duplicate",
            adapter: { name: "local-filesystem", version: "0.1.0" }
          }
        ],
        parseJobs: [{
          parseJobId: "parse_001",
          sourceCollectionId: "src_drive_001",
          importBatchId: "imp_001",
          lane: "local",
          parser: { name: "local-text", version: "0.1.0" },
          state: "succeeded",
          derivative: {
            contentHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
            mediaType: "text/plain"
          }
        }],
        governanceTags: [{
          tag: "public_record",
          confidence: 0.99,
          rationale: "Imported public record.",
          source: "ai",
          status: "active",
          eventId: "evt_governance_public_record"
        }],
        quarantined: false,
        tombstoned: false,
        linkedReferences: [{
          kind: "prr",
          id: "prr_evidence_review_001",
          eventIds: ["evt_prr_evidence_review_001"]
        }],
        provenanceComplete: true,
        selectableForAssertionCandidate: true,
        blockingReasons: []
      },
      {
        evidenceId: "ev_ing_blocked",
        contentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        mediaType: "application/pdf",
        sizeBytes: 120,
        source: { kind: "file", label: "restricted.pdf" },
        sourceCollections: [{ sourceCollectionId: "src_drive_001", label: "External investigation archive" }],
        importBatchIds: ["imp_002"],
        occurrences: [],
        parseJobs: [{
          parseJobId: "parse_blocked",
          sourceCollectionId: "src_drive_001",
          importBatchId: "imp_002",
          lane: "local",
          parser: { name: "local-pdf", version: "0.1.0" },
          state: "failed"
        }],
        governanceTags: [{
          tag: "contains_pii",
          confidence: 1,
          rationale: "Human-confirmed restricted record.",
          source: "human",
          status: "active",
          eventId: "evt_governance_blocked"
        }],
        quarantined: true,
        tombstoned: false,
        linkedReferences: [],
        provenanceComplete: true,
        selectableForAssertionCandidate: false,
        blockingReasons: ["Quarantined evidence is excluded from ordinary assertion preparation."]
      }
    ],
    assertionCandidates: [],
    diagnostics: []
  };
}
