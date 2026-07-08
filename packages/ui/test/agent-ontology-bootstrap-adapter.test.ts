import { describe, expect, it } from "vitest";
import { ontologyBootstrapRouteDtoFromJson } from "../src/agent/agent-adapter.js";

describe("ontology bootstrap route DTO parser", () => {
  it("parses browser-safe bootstrap route DTOs and rejects raw provider fields", () => {
    const dto = ontologyBootstrapRouteDtoFromJson({
      schemaVersion: "agent-ontology-bootstrap-route.v1",
      generatedAt: "2026-07-08T16:00:00.000Z",
      runId: "run_ontology_bootstrap_route",
      taskId: "task_ontology_bootstrap_route",
      phase: "staging-review",
      legacyReportId: "legacy_report_001",
      reportHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      candidateSetHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      reviewBundleHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      candidateBundleCount: 2,
      candidateCount: 4,
      selectedCandidateIds: ["legacy_candidate_001"],
      blockedRequestedCandidateIds: ["legacy_candidate_missing"],
      pendingApprovalToolRequestIds: ["toolreq_ontology_bootstrap_staging_approval"],
      nextCursor: { currentOffset: 0, limit: 2, totalCandidates: 4, nextOffset: 2 },
      nextSafeAction: {
        actionId: "bootstrap_action_approve_staging",
        label: "Review staging approval preview",
        kind: "request-tool",
        effect: "ledger-review"
      }
    });

    expect(dto.runId).toBe("run_ontology_bootstrap_route");
    expect(dto.nextCursor?.nextOffset).toBe(2);
    expect(dto.pendingApprovalToolRequestIds).toEqual(["toolreq_ontology_bootstrap_staging_approval"]);
    expect(Object.isFrozen(dto)).toBe(true);
    expect(() =>
      ontologyBootstrapRouteDtoFromJson({
        ...dto,
        rawProviderError: "provider failure details are not allowed"
      })
    ).toThrow();
  });
});
