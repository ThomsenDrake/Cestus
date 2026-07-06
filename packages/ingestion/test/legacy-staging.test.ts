import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { EvidenceService } from "../../ontology/src/evidence-service.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { sha256, stableJson } from "../src/legacy-report.js";
import { LegacyOntologyStagingService } from "../src/legacy-staging.js";

let dir: string;

const reportHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const humanActor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };
const systemActor = { id: "actor_system", kind: "system" as const, label: "Legacy stager" };
const evidenceContentHash = sha256(evidenceContentFor("ev_legacy_metadata"));

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
    const candidates = [candidate("legacy_candidate_001", "ev_legacy_metadata")];

    await expect(
      service.stageApprovedAssertions({
        ...stagingIdentityFor(candidates),
        candidates
      })
    ).rejects.toThrow(/approval/i);

    expect((await ledger.readAll()).map((event) => event.type)).toEqual(["evidence.ingested"]);
  });

  it("rejects staging approval from a system actor through the human-gated event contract", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new LegacyOntologyStagingService({ ledger, actor: systemActor });
    const candidates = [candidate("legacy_candidate_001", "ev_legacy_metadata")];

    await expect(
      service.approveStaging({
        ...stagingIdentityFor(candidates),
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
    const candidates = [candidate("legacy_candidate_001", "ev_legacy_metadata")];
    const stagingIdentity = stagingIdentityFor(candidates);

    await service.approveStaging({
      ...stagingIdentity,
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: ["legacy_candidate_001"]
    });
    const proposed = await service.stageApprovedAssertions({
      ...stagingIdentity,
      candidates
    });

    const expectedAssertionId = legacyAssertionId(stagingIdentity, "legacy_candidate_001");
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
    const candidates = [candidate("legacy_candidate_missing", "ev_missing")];
    const stagingIdentity = stagingIdentityFor(candidates);

    await service.approveStaging({
      ...stagingIdentity,
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: ["legacy_candidate_missing"]
    });

    await expect(
      service.stageApprovedAssertions({
        ...stagingIdentity,
        candidates
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
    const candidates = [
      candidate("legacy_candidate_present", "ev_legacy_metadata"),
      candidate("legacy_candidate_missing", "ev_missing")
    ];
    const stagingIdentity = stagingIdentityFor(candidates);

    await service.approveStaging({
      ...stagingIdentity,
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: ["legacy_candidate_present", "legacy_candidate_missing"]
    });

    await expect(
      service.stageApprovedAssertions({
        ...stagingIdentity,
        candidates
      })
    ).rejects.toThrow(/without evidence ev_missing/);

    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "evidence.ingested",
      "legacy.ontology.staging.approved"
    ]);
  });

  it("rejects modified candidate payloads that do not match the approved candidate set hash", async () => {
    const ledger = new InMemoryEventLedger();
    await ingestEvidence(ledger, "ev_legacy_metadata");
    const service = new LegacyOntologyStagingService({ ledger, actor: humanActor });
    const reviewedCandidates = [candidate("legacy_candidate_001", "ev_legacy_metadata")];
    const stagingIdentity = stagingIdentityFor(reviewedCandidates);
    const modifiedCandidates = [{
      ...candidate("legacy_candidate_001", "ev_legacy_metadata"),
      predicate: "agency.alias",
      object: "Forged Agency"
    }];

    await service.approveStaging({
      ...stagingIdentity,
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: ["legacy_candidate_001"]
    });

    await expect(
      service.stageApprovedAssertions({
        ...stagingIdentity,
        candidates: modifiedCandidates
      })
    ).rejects.toThrow(/candidate set hash/i);

    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "evidence.ingested",
      "legacy.ontology.staging.approved"
    ]);
  });

  it("rejects staged evidence whose content hash does not match the reviewed candidate", async () => {
    const ledger = new InMemoryEventLedger();
    await ingestEvidence(ledger, "ev_legacy_metadata");
    await ingestEvidence(ledger, "ev_unrelated_metadata");
    const service = new LegacyOntologyStagingService({ ledger, actor: humanActor });
    const reviewedCandidates = [candidate("legacy_candidate_001", "ev_legacy_metadata")];
    const stagingIdentity = stagingIdentityFor(reviewedCandidates);
    const swappedEvidenceCandidates = [{
      ...candidate("legacy_candidate_001", "ev_unrelated_metadata")
    }];

    await service.approveStaging({
      ...stagingIdentity,
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: ["legacy_candidate_001"]
    });

    await expect(
      service.stageApprovedAssertions({
        ...stagingIdentity,
        candidates: swappedEvidenceCandidates
      })
    ).rejects.toThrow(/content hash mismatch/i);

    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "evidence.ingested",
      "evidence.ingested",
      "legacy.ontology.staging.approved"
    ]);
  });

  it("proposes only approved candidate IDs and skips unapproved candidates", async () => {
    const ledger = new InMemoryEventLedger();
    await ingestEvidence(ledger, "ev_legacy_metadata");
    const service = new LegacyOntologyStagingService({ ledger, actor: humanActor });
    const candidates = [
      candidate("legacy_candidate_approved", "ev_legacy_metadata"),
      {
        ...candidate("legacy_candidate_skipped", "ev_missing_unapproved"),
        predicate: "agency.alias",
        object: "Skipped Agency"
      }
    ];
    const stagingIdentity = stagingIdentityFor(candidates);

    await service.approveStaging({
      ...stagingIdentity,
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: ["legacy_candidate_approved"]
    });
    const proposed = await service.stageApprovedAssertions({
      ...stagingIdentity,
      candidates
    });

    const assertionEvents = (await ledger.readAll()).filter((event) => event.type === "assertion.proposed");
    expect(proposed).toHaveLength(1);
    expect(assertionEvents).toHaveLength(1);
    expect(assertionEvents[0]?.payload.assertionId).toBe(
      legacyAssertionId(stagingIdentity, "legacy_candidate_approved")
    );
  });

  it("includes full staging identity in deterministic assertion IDs", async () => {
    const ledger = new InMemoryEventLedger();
    await ingestEvidence(ledger, "ev_legacy_metadata");
    const service = new LegacyOntologyStagingService({ ledger, actor: humanActor });
    const candidates = [candidate("legacy_candidate_shared", "ev_legacy_metadata")];
    const firstIdentity = stagingIdentityFor(candidates, {
      sourceCollectionId: "src_old_cestus_a",
      scanBatchId: "scan_old_cestus_001",
      stagingBatchId: "legacy_stage_shared"
    });
    const secondIdentity = stagingIdentityFor(candidates, {
      sourceCollectionId: "src_old_cestus_b",
      scanBatchId: "scan_old_cestus_002",
      stagingBatchId: "legacy_stage_shared"
    });

    await service.approveStaging({
      ...firstIdentity,
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: ["legacy_candidate_shared"]
    });
    await service.approveStaging({
      ...secondIdentity,
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: ["legacy_candidate_shared"]
    });

    const firstProposed = await service.stageApprovedAssertions({
      ...firstIdentity,
      candidates
    });
    const secondProposed = await service.stageApprovedAssertions({
      ...secondIdentity,
      candidates
    });

    expect(firstProposed[0]?.payload.assertionId).toMatch(/^as_legacy_/);
    expect(secondProposed[0]?.payload.assertionId).toMatch(/^as_legacy_/);
    expect(firstProposed[0]?.payload.assertionId).not.toBe(secondProposed[0]?.payload.assertionId);
  });
});

function candidate(candidateId: string, evidenceId: string) {
  return {
    candidateId,
    observationId: `legacy_obs_${candidateId}`,
    evidenceId,
    evidenceContentHash,
    sourcePath: "ontology/claims.json",
    subjectRef: "legacy:agency:example",
    predicate: "agency.name",
    object: "Example Agency",
    confidence: 0.8
  };
}

async function ingestEvidence(ledger: InMemoryEventLedger, evidenceId: string) {
  await new EvidenceService({ ledger, blobStore: new FileBlobStore(dir) }).ingest({
    evidenceId,
    content: Buffer.from(evidenceContentFor(evidenceId)),
    mediaType: "application/json",
    source: { kind: "file", label: "ontology/claims.json" },
    actor: systemActor
  });
}

function evidenceContentFor(evidenceId: string): string {
  return `legacy metadata fixture for ${evidenceId}`;
}

function legacyAssertionId(input: ReturnType<typeof stagingIdentityFor>, candidateId: string) {
  return `as_legacy_${createHash("sha256").update([
    input.sourceCollectionId,
    input.scanBatchId,
    input.stagingBatchId,
    input.candidateSetHash,
    candidateId
  ].join(":")).digest("hex")}`;
}

function stagingIdentityFor(
  candidates: readonly ReturnType<typeof candidate>[],
  overrides: Partial<{
    sourceCollectionId: string;
    scanBatchId: string;
    stagingBatchId: string;
    legacyReportId: string;
  }> = {}
) {
  return {
    sourceCollectionId: overrides.sourceCollectionId ?? "src_old_cestus",
    scanBatchId: overrides.scanBatchId ?? "scan_old_cestus_001",
    stagingBatchId: overrides.stagingBatchId ?? "legacy_stage_001",
    legacyReportId: overrides.legacyReportId ?? "legacy_report_001",
    reportHash,
    candidateSetHash: candidateSetHashFor(candidates)
  };
}

function candidateSetHashFor(candidates: readonly ReturnType<typeof candidate>[]): `sha256:${string}` {
  return sha256(stableJson([...candidates].map(reportCandidate).sort(compareCandidateForHash)));
}

function reportCandidate(input: ReturnType<typeof candidate>) {
  const { evidenceId: _evidenceId, ...candidateForHash } = input;
  return candidateForHash;
}

function compareCandidateForHash(left: ReturnType<typeof reportCandidate>, right: ReturnType<typeof reportCandidate>) {
  return compareTuple([
    left.candidateId,
    left.observationId,
    left.sourcePath,
    left.evidenceContentHash,
    left.predicate
  ], [
    right.candidateId,
    right.observationId,
    right.sourcePath,
    right.evidenceContentHash,
    right.predicate
  ]);
}

function compareTuple(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const result = compareCodeUnits(left[index] ?? "", right[index] ?? "");

    if (result !== 0) {
      return result;
    }
  }

  return 0;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
