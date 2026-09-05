import { describe, expect, it } from "vitest";
import { evidenceCandidateSchema, extractionArtifactSchema } from "../../ontology/src/extraction-contracts.js";
const hash = `sha256:${"a".repeat(64)}`;
const candidate = {
  candidateId: "candidate_one", workspaceId: "workspace_one", predicate: "paid_amount",
  value: { type: "number", value: 120, unit: "USD" },
  evidence: [{ workspaceId: "workspace_one", evidenceId: "ev_one", sourceContentHash: hash, extractionId: "parse_one", extractionContentHash: hash, locator: { kind: "csv", row: 2, column: 3 }, provenanceEventIds: ["evt_import"] }],
  provenance: { actorId: "actor_one", operation: "extract-candidate" }, reviewState: "proposed"
};
describe("bounded workspace evidence and candidate contracts", () => {
  it("requires precise locators, extraction hashes, same-workspace provenance and an explicit review event for accepted candidates", () => {
    expect(evidenceCandidateSchema.safeParse(candidate).success).toBe(true);
    expect(evidenceCandidateSchema.safeParse({ ...candidate, reviewState: "accepted" }).success).toBe(false);
    expect(evidenceCandidateSchema.safeParse({ ...candidate, workspaceId: "other_workspace" }).success).toBe(false);
    expect(evidenceCandidateSchema.safeParse({ ...candidate, evidence: [{ ...candidate.evidence[0], locator: { kind: "csv", row: 0, column: 3 } }] }).success).toBe(false);
    expect(evidenceCandidateSchema.safeParse({ ...candidate, value: { type: "number", value: Infinity } }).success).toBe(false);
  });
  it("rejects unknown extraction fields and unbounded passage coordinates", () => {
    const artifact = { schemaVersion: "evidence-extraction.v1", extractionId: "parse_one", evidenceId: "ev_one", sourceContentHash: hash, extractor: { name: "extractor", version: "1" }, format: "text", text: "test", passages: [{ locator: { kind: "text", block: 1, start: 0, end: 4 }, text: "test" }] };
    expect(extractionArtifactSchema.safeParse(artifact).success).toBe(true);
    expect(extractionArtifactSchema.safeParse({ ...artifact, passages: [{ locator: { kind: "text", block: 1, start: 4, end: 0 }, text: "test" }] }).success).toBe(false);
    expect(extractionArtifactSchema.safeParse({ ...artifact, originalPath: "/private/file" }).success).toBe(false);
    expect(extractionArtifactSchema.safeParse({ ...artifact, passages: [{ locator: { kind: "pdf", page: -1, block: 1, start: 0, end: 4 }, text: "test" }] }).success).toBe(false);
  });
});
