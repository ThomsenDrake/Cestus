import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { EvidenceService } from "../../ontology/src/evidence-service.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { LegacyOntologyStagingService } from "../src/legacy-staging.js";

let dir: string;

const reportHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const candidateSetHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const humanActor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };
const systemActor = { id: "actor_system", kind: "system" as const, label: "Legacy stager" };
const stagingIdentity = {
  sourceCollectionId: "src_old_cestus",
  scanBatchId: "scan_old_cestus_001",
  stagingBatchId: "legacy_stage_001",
  legacyReportId: "legacy_report_001",
  reportHash,
  candidateSetHash
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "legacy-staging-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("LegacyOntologyStagingService", () => {
  it("requires staging approval before assertion proposals", async () => {
    const ledger = new InMemoryEventLedger();
    await ingestEvidence(ledger, "ev_legacy_metadata");
    const service = new LegacyOntologyStagingService({ ledger, actor: systemActor });

    await expect(
      service.stageApprovedAssertions({
        ...stagingIdentity,
        candidates: [candidate("legacy_candidate_001", "ev_legacy_metadata")]
      })
    ).rejects.toThrow(/approval/i);

    expect((await ledger.readAll()).map((event) => event.type)).toEqual(["evidence.ingested"]);
  });

  it("rejects staging approval from a system actor through the human-gated event contract", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new LegacyOntologyStagingService({ ledger, actor: systemActor });

    await expect(
      service.approveStaging({
        ...stagingIdentity,
        approvedBy: "actor_system",
        approvedAssertionCandidateIds: ["legacy_candidate_001"]
      })
    ).rejects.toThrow(/human/i);

    expect(await ledger.readAll()).toHaveLength(0);
  });

  it("creates only evidence-tied assertion.proposed events after human approval", async () => {
    const ledger = new InMemoryEventLedger();
    await ingestEvidence(ledger, "ev_legacy_metadata");
    const service = new LegacyOntologyStagingService({ ledger, actor: humanActor });

    await service.approveStaging({
      ...stagingIdentity,
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: ["legacy_candidate_001"]
    });
    const proposed = await service.stageApprovedAssertions({
      ...stagingIdentity,
      candidates: [candidate("legacy_candidate_001", "ev_legacy_metadata")]
    });

    const expectedAssertionId = legacyAssertionId("legacy_stage_001", "legacy_candidate_001");
    const events = await ledger.readAll();
    const eventTypes = events.map((event): string => event.type);
    expect(eventTypes).toEqual([
      "evidence.ingested",
      "legacy.ontology.staging.approved",
      "assertion.proposed"
    ]);
    expect(proposed).toHaveLength(1);
    expect(proposed[0]?.payload).toMatchObject({
      assertionId: expectedAssertionId,
      evidenceId: "ev_legacy_metadata",
      subjectRef: "legacy:agency:example",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.8,
      reviewState: "proposed"
    });
    expect(eventTypes).not.toContain("legacy.import.report.generated");
    expect(eventTypes).not.toContain("assertion.accepted");
    expect(eventTypes).not.toContain("entity.resolved");
    expect(eventTypes).not.toContain("relationship.accepted");
    expect(eventTypes).not.toContain("candidate.entity.resolved");
    expect(eventTypes).not.toContain("candidate.relationship.accepted");
  });

  it("rejects missing evidence after approval without appending assertion.proposed", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new LegacyOntologyStagingService({ ledger, actor: humanActor });

    await service.approveStaging({
      ...stagingIdentity,
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: ["legacy_candidate_missing"]
    });

    await expect(
      service.stageApprovedAssertions({
        ...stagingIdentity,
        candidates: [candidate("legacy_candidate_missing", "ev_missing")]
      })
    ).rejects.toThrow(/without evidence ev_missing/);

    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "legacy.ontology.staging.approved"
    ]);
  });

  it("preflights all approved candidates before appending any assertion proposals", async () => {
    const ledger = new InMemoryEventLedger();
    await ingestEvidence(ledger, "ev_legacy_metadata");
    const service = new LegacyOntologyStagingService({ ledger, actor: humanActor });

    await service.approveStaging({
      ...stagingIdentity,
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: ["legacy_candidate_present", "legacy_candidate_missing"]
    });

    await expect(
      service.stageApprovedAssertions({
        ...stagingIdentity,
        candidates: [
          candidate("legacy_candidate_present", "ev_legacy_metadata"),
          candidate("legacy_candidate_missing", "ev_missing")
        ]
      })
    ).rejects.toThrow(/without evidence ev_missing/);

    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "evidence.ingested",
      "legacy.ontology.staging.approved"
    ]);
  });

  it("proposes only approved candidate IDs and skips unapproved candidates", async () => {
    const ledger = new InMemoryEventLedger();
    await ingestEvidence(ledger, "ev_legacy_metadata");
    const service = new LegacyOntologyStagingService({ ledger, actor: humanActor });

    await service.approveStaging({
      ...stagingIdentity,
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: ["legacy_candidate_approved"]
    });
    const proposed = await service.stageApprovedAssertions({
      ...stagingIdentity,
      candidates: [
        candidate("legacy_candidate_approved", "ev_legacy_metadata"),
        {
          ...candidate("legacy_candidate_skipped", "ev_missing_unapproved"),
          predicate: "agency.alias",
          object: "Skipped Agency"
        }
      ]
    });

    const assertionEvents = (await ledger.readAll()).filter((event) => event.type === "assertion.proposed");
    expect(proposed).toHaveLength(1);
    expect(assertionEvents).toHaveLength(1);
    expect(assertionEvents[0]?.payload.assertionId).toBe(
      legacyAssertionId("legacy_stage_001", "legacy_candidate_approved")
    );
  });
});

function candidate(candidateId: string, evidenceId: string) {
  return {
    candidateId,
    evidenceId,
    subjectRef: "legacy:agency:example",
    predicate: "agency.name",
    object: "Example Agency",
    confidence: 0.8
  };
}

async function ingestEvidence(ledger: InMemoryEventLedger, evidenceId: string) {
  await new EvidenceService({ ledger, blobStore: new FileBlobStore(dir) }).ingest({
    evidenceId,
    content: Buffer.from(`legacy metadata fixture for ${evidenceId}`),
    mediaType: "application/json",
    source: { kind: "file", label: "ontology/claims.json" },
    actor: systemActor
  });
}

function legacyAssertionId(stagingBatchId: string, candidateId: string) {
  return `as_legacy_${createHash("sha256").update(`${stagingBatchId}:${candidateId}`).digest("hex")}`;
}
