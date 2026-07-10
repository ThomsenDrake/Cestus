import { describe, expect, it } from "vitest";
import { buildContextPackRef } from "../src/context-packs.js";
import {
  buildSpecialistHandoffManifest,
  canonicalSpecialistHandoffJson,
  computeSpecialistHandoffId,
  hashCanonicalSpecialistHandoffJson,
  hashSpecialistHandoffManifest,
  verifySpecialistHandoffManifest
} from "../src/specialist-handoff-manifest.js";
import { hashSpecialistWorkflowHandoff } from "../src/specialist-handoffs.js";

const hash111 = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;
const hash222 = "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const;
const contextPack = buildContextPackRef({
  contextPackId: "evidence-summary.v1",
  version: 1,
  generatedAt: "2026-07-10T15:00:00.000Z",
  payload: { evidenceIds: ["ev_handoff_001"] },
  safeSummary: "One handoff evidence summary.",
  provenanceRefs: ["ev_handoff_001"],
  sizeBudgetBytes: 16_384
});

const manifestInput = {
  handoffId: "handoff_run_handoff_001_0123456789abcdef",
  handoffRevision: 1,
  runId: "run_handoff_001",
  taskId: "task_handoff_001",
  runType: "evidence-triage",
  residentAgentId: "agent_default",
  generatedAt: "2026-07-10T15:01:00.000Z",
  status: "ready-for-review",
  safeSummary: "Evidence triage handoff is ready for review.",
  stateKind: "completed",
  finalOutputStepId: "step_run_handoff_001_final_output",
  finalOutputEventId: "evt_final_output",
  contextPackRefs: [contextPack],
  promptArtifactHash: hash111,
  outputArtifacts: [{
    artifactId: "artifact_handoff_001",
    artifactKind: "evidence-triage-dossier",
    schemaId: "evidence-triage-handoff.v1",
    artifactHash: hash222,
    safeSummary: "One evidence triage dossier."
  }],
  toolRequestIds: ["toolreq_handoff_review"],
  approvalRequirements: [{
    approvalClass: "human-review",
    reason: "A reviewer must inspect the dossier.",
    toolRequestId: "toolreq_handoff_review"
  }],
  nextSafeActions: [{
    actionId: "action_review_handoff",
    label: "Review handoff dossier",
    kind: "review",
    effect: "none"
  }],
  sourceEventIds: ["evt_source_001"],
  relatedEventIds: ["evt_final_output"]
} as const;

const seed = {
  runId: "run_handoff_001",
  taskId: "task_handoff_001",
  runType: "evidence-triage",
  status: "ready-for-review",
  finalOutputEventId: "evt_final_output",
  outputArtifactHashes: [hash222],
  handoffRevision: 1
} as const;

describe("specialist handoff manifest", () => {
  it("computes handoffId from the pre-manifest seed without manifest or DTO hashes", () => {
    const handoffId = computeSpecialistHandoffId(seed);

    expect(handoffId).toMatch(/^handoff_run_handoff_001_[a-f0-9]{16}$/);
    expect(JSON.stringify(seed)).not.toContain("handoffManifestHash");
    expect(JSON.stringify(seed)).not.toContain("handoffDtoHash");
  });

  it("changes manifest and DTO hashes without changing handoffId when only safe presentation changes", () => {
    const handoffId = computeSpecialistHandoffId(seed);
    const manifest = buildSpecialistHandoffManifest({ ...manifestInput, handoffId });
    const changedSummary = buildSpecialistHandoffManifest({
      ...manifestInput,
      handoffId,
      safeSummary: "Updated safe presentation summary."
    });

    expect(manifest.handoffId).toBe(handoffId);
    expect(changedSummary.handoffId).toBe(handoffId);
    expect(hashSpecialistHandoffManifest(manifest)).not.toBe(hashSpecialistHandoffManifest(changedSummary));
    expect(hashSpecialistWorkflowHandoff(manifest.handoff)).not.toBe(hashSpecialistWorkflowHandoff(changedSummary.handoff));
    expect(JSON.stringify(seed)).not.toContain("handoffManifestHash");
    expect(JSON.stringify(seed)).not.toContain("handoffDtoHash");
  });

  it("changes handoffId when final output event, output hash set, status, revision, or supersession changes", () => {
    const original = computeSpecialistHandoffId(seed);
    const changedSeeds = [
      { ...seed, finalOutputEventId: "evt_final_output_002" },
      { ...seed, outputArtifactHashes: [hash111] },
      { ...seed, status: "blocked" as const },
      { ...seed, handoffRevision: 2 },
      { ...seed, supersedesHandoffId: original }
    ];

    for (const changedSeed of changedSeeds) {
      expect(computeSpecialistHandoffId(changedSeed)).not.toBe(original);
    }
  });

  it("documents that same-seed presentation hash separation is not an appendable same-revision correction", () => {
    const handoffId = computeSpecialistHandoffId(seed);
    const sameRevisionPresentationChange = buildSpecialistHandoffManifest({
      ...manifestInput,
      handoffId,
      safeSummary: "Updated safe presentation summary."
    });

    expect(sameRevisionPresentationChange.handoffId).toBe(handoffId);
    expect(sameRevisionPresentationChange.handoffRevision).toBe(1);
  });

  it("computes a new handoffId for a real presentation correction with incremented revision and supersession", () => {
    const handoffId = computeSpecialistHandoffId(seed);
    const correctionSeed = {
      ...seed,
      handoffRevision: 2,
      supersedesHandoffId: handoffId
    } as const;
    const correctionHandoffId = computeSpecialistHandoffId(correctionSeed);
    const correction = buildSpecialistHandoffManifest({
      ...manifestInput,
      handoffId: correctionHandoffId,
      handoffRevision: 2,
      supersedesHandoffId: handoffId,
      supersedesEventId: "evt_handoff_recorded"
    });

    expect(correctionHandoffId).not.toBe(handoffId);
    expect(correction.handoffRevision).toBe(2);
    expect(correction.supersedesHandoffId).toBe(handoffId);
  });

  it("builds the canonical handoff DTO internally from ledger-bound refs", () => {
    const manifest = buildSpecialistHandoffManifest({
      ...manifestInput,
      handoffId: computeSpecialistHandoffId(seed)
    });

    expect(manifest.handoff).toMatchObject({
      handoffId: manifest.handoffId,
      handoffRevision: manifest.handoffRevision,
      runId: manifest.runId,
      taskId: manifest.taskId,
      safeSummary: manifest.safeSummary,
      contextPackRefs: manifest.contextPackRefs
    });
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.handoff)).toBe(true);
  });

  it("rejects caller-supplied DTO mismatch instead of accepting synthetic provenance", () => {
    expect(() => buildSpecialistHandoffManifest({
      ...manifestInput,
      handoffId: computeSpecialistHandoffId(seed),
      handoff: { runId: "run_synthetic_001" }
    } as never)).toThrow(/unsupported|unrecognized|handoff/i);

    const manifest = buildSpecialistHandoffManifest({
      ...manifestInput,
      handoffId: computeSpecialistHandoffId(seed)
    });
    const synthetic = JSON.parse(JSON.stringify(manifest)) as any;
    synthetic.handoffId = "handoff_run_handoff_001_ffffffffffffffff";
    synthetic.handoff.handoffId = synthetic.handoffId;
    synthetic.handoffDtoHash = hashSpecialistWorkflowHandoff(synthetic.handoff);

    expect(() => verifySpecialistHandoffManifest({
      manifest: synthetic,
      handoffManifestHash: hashSpecialistHandoffManifest(synthetic)
    })).toThrow(/identity seed|handoffId/i);
  });

  it("requires exact safeSummary and compact-ref agreement across manifest and DTO", () => {
    const manifest = buildSpecialistHandoffManifest({
      ...manifestInput,
      handoffId: computeSpecialistHandoffId(seed)
    });
    const inconsistent = JSON.parse(JSON.stringify(manifest)) as any;
    inconsistent.handoff.safeSummary = "A different safe summary.";
    inconsistent.handoffDtoHash = hashSpecialistWorkflowHandoff(inconsistent.handoff);

    expect(() => verifySpecialistHandoffManifest({
      manifest: inconsistent,
      handoffManifestHash: hashSpecialistHandoffManifest(inconsistent)
    })).toThrow(/safeSummary|agreement/i);
  });

  it("keeps verifiedAt outside manifest and DTO hashes", () => {
    const manifest = buildSpecialistHandoffManifest({
      ...manifestInput,
      handoffId: computeSpecialistHandoffId(seed)
    });
    const manifestHash = hashSpecialistHandoffManifest(manifest);
    const dtoHash = hashSpecialistWorkflowHandoff(manifest.handoff);

    expect(verifySpecialistHandoffManifest({
      manifest,
      handoffManifestHash: manifestHash,
      verifiedAt: "2026-07-10T15:02:00.000Z"
    })).toEqual(manifest.handoff);
    expect(hashSpecialistHandoffManifest(manifest)).toBe(manifestHash);
    expect(hashSpecialistWorkflowHandoff(manifest.handoff)).toBe(dtoHash);
  });

  it("rejects accessors, prototypes, symbols, sparse arrays, boxed values, functions, and non-finite numbers", () => {
    const accessor = Object.create(null) as { readonly value?: string };
    Object.defineProperty(accessor, "value", { enumerable: true, get: () => "value" });
    const symbol = { value: "value", [Symbol("handoff")]: "value" };
    const sparse = ["value"] as unknown[];
    sparse.length = 2;
    const hostileValues = [
      accessor,
      new (class Hostile {})(),
      symbol,
      sparse,
      new String("value"),
      () => "value",
      Number.NaN,
      Number.POSITIVE_INFINITY
    ];

    for (const value of hostileValues) {
      expect(() => canonicalSpecialistHandoffJson(value)).toThrow(/JSON DTO-safe/i);
      expect(() => hashCanonicalSpecialistHandoffJson(value)).toThrow(/JSON DTO-safe/i);
    }
  });
});
