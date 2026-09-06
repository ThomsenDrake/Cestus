import { validateCrossCaseOutput } from "../src/cross-case-output.js";
import { describe, expect, it } from "vitest";
import { prepareCaseComparison } from "../src/case-comparison.js";
import {
  investigationVocabulary,
  type KnowledgeCitation,
} from "../src/knowledge-contracts.js";
import type {
  KnowledgeWorkspaceDto,
  ReviewedKnowledgeProposal,
} from "../src/knowledge-projection.js";

function fixture() {
  const dto: KnowledgeWorkspaceDto = {
    workspaceId: "ws",
    revision: 1,
    selectedCaseId: null,
    schema: investigationVocabulary,
    cases: [],
    memberships: [],
    hypotheses: [],
    proposals: [],
    bindings: [],
    bindingHistory: [],
    lineage: [],
    entities: [],
    relationships: [],
    occurrences: [],
  };
  for (const caseId of ["a", "b", "negative"])
    dto.cases.push({
      caseId,
      title: caseId,
      notes: "private note",
      question: "private question",
      scope: "private scope",
    });
  const citation = (evidenceId: string): KnowledgeCitation => ({
    workspaceId: "ws",
    evidenceId,
    sourceContentHash: `sha256:${evidenceId.charCodeAt(0).toString(16).padStart(64, "0")}`,
    extractionId: evidenceId,
    extractionContentHash: `sha256:${"a".repeat(64)}`,
    locator: { kind: "text", block: 1, start: 0, end: 80 },
    provenanceEventIds: [evidenceId],
    passageIndex: 0,
    quote: "A reviewed source passage with names, role, and event date.",
  });
  const add = (
    caseId: string,
    id: string,
    props: Partial<ReviewedKnowledgeProposal>,
  ) => {
    const p: ReviewedKnowledgeProposal = {
      assertionId: id,
      proposalEventId: `event_${id}`,
      workspaceId: "ws",
      kind: "entity",
      predicate: "name",
      value: { type: "string", value: id },
      schemaId: investigationVocabulary.schemaId,
      schemaSnapshot: investigationVocabulary,
      provenance: { kind: "manual" },
      evidence: [citation(caseId)],
      reviewState: "accepted",
      history: [],
      ...props,
    };
    dto.proposals.push(p);
    dto.memberships.push({
      caseId,
      targetKind: "knowledge",
      targetId: id,
      included: true,
    });
    return p;
  };
  const entity = (
    caseId: string,
    id: string,
    label: string,
    entityType = "organization",
    entityId = `ent_${id}`,
  ) => {
    add(caseId, `as_${id}`, {
      mentionId: id,
      entityType,
      value: { type: "string", value: label },
    });
    dto.bindings.push({
      mentionId: id,
      entityId,
      entityType,
      label,
      assertionId: `as_${id}`,
      previousEntityId: null,
      rationale: "reviewed",
      decisionId: id,
    });
    if (!dto.entities.some((e) => e.entityId === entityId))
      dto.entities.push({
        entityId,
        canonicalLabel: label,
        entityType,
        assertionIds: [`as_${id}`],
        caseIds: [caseId],
        evidenceIds: [caseId],
        independentSourceCount: 1,
        sourceIndependence: "known",
      });
  };
  entity("a", "shared_a", "Verified Participant");
  entity(
    "b",
    "shared_b",
    "Verified Participant",
    "organization",
    "ent_shared_a",
  );
  entity("a", "buyer_a", "Alpha Agency", "agency");
  entity("b", "buyer_b", "Beta Agency", "agency");
  entity("a", "vendor_a", "Alex Doe");
  entity("b", "vendor_b", "Alex Doe");
  entity("negative", "unrelated", "Library");
  for (const c of ["a", "b"]) {
    add(c, `as_rel_${c}`, {
      kind: "relationship",
      predicate: "awarded",
      subjectMentionId: `buyer_${c}`,
      value: { type: "entity", mentionId: `vendor_${c}` },
    });
    add(c, `as_event_${c}`, {
      kind: "occurrence",
      predicate: "award",
      value: { type: "string", value: "Award" },
      occurrenceId: `occ_${c}`,
      participants: [
        { role: "buyer", mentionId: `buyer_${c}` },
        { role: "supplier", mentionId: `vendor_${c}` },
      ],
      occurredTime: { start: "2023", uncertain: true },
    });
    dto.lineage.push({
      evidenceId: c,
      originId: `origin_${c}`,
      independence: "independent",
      rationale: "reviewed",
    });
  }
  return { dto, add, entity };
}

describe("bounded case comparison preparation", () => {
  it("prepares unprompted shared identity and different-actor structures while retaining a negative case", () => {
    const { dto } = fixture();
    const context = prepareCaseComparison(dto);
    expect(context.scope.comparedCaseIds).toEqual(["a", "b", "negative"]);
    expect(
      context.candidates.find((c) => c.kind === "shared_identity")?.entityIds,
    ).toEqual(["ent_shared_a"]);
    expect(
      context.candidates.filter((c) => c.kind === "relationship_structure"),
    ).toHaveLength(1);
    expect(
      context.candidates.filter((c) => c.kind === "event_structure"),
    ).toHaveLength(1);
    expect(
      context.candidates.filter((c) => c.kind === "event_sequence"),
    ).toHaveLength(0);
    expect(
      context.candidates.every((c) => !c.caseIds.includes("negative")),
    ).toBe(true);
    expect(
      context.candidates
        .filter((c) => c.kind === "shared_identity")
        .flatMap((c) => c.entityIds),
    ).not.toContain("ent_vendor_a");
    expect(JSON.stringify(context)).not.toMatch(
      /private note|private question|private scope/,
    );
    for (const assertion of context.assertions)
      for (const index of assertion.citationIndices)
        expect(context.passages[index]?.citation.quote).toBeTruthy();
  });
  it("never treats copied bytes or shared origins as independent corroboration", () => {
    const { dto } = fixture();
    for (const p of dto.proposals.filter(
      (p) => p.evidence[0]!.evidenceId === "b",
    ))
      p.evidence[0]!.sourceContentHash =
        dto.proposals[0]!.evidence[0]!.sourceContentHash;
    const shared = prepareCaseComparison(dto).candidates.find(
      (c) => c.kind === "shared_identity",
    )!;
    expect(shared.independentSourceCount).toBe(1);
    dto.lineage[1]!.independence = "unknown";
    expect(
      prepareCaseComparison(dto).candidates.find(
        (c) => c.kind === "shared_identity",
      )?.sourceIndependence,
    ).toBe("uncertain");
  });
  it("binds to examined facts and identities, ignoring selection events and out-of-scope changes", () => {
    const { dto } = fixture();
    const fingerprint = prepareCaseComparison(dto, ["a", "b"]).fingerprint;
    dto.revision++;
    dto.selectedCaseId = "negative";
    dto.cases[2]!.title = "New title";
    dto.proposals.find((p) => p.assertionId === "as_unrelated")!.value = {
      type: "string",
      value: "Changed unrelated name",
    };
    expect(prepareCaseComparison(dto, ["b", "a"]).fingerprint).toBe(
      fingerprint,
    );
    dto.bindings.find((b) => b.mentionId === "shared_b")!.entityId =
      "ent_vendor_b";
    expect(prepareCaseComparison(dto, ["a", "b"]).fingerprint).not.toBe(
      fingerprint,
    );
  });
  it("fails closed for missing accepted endpoint support and refuses excessive scope", () => {
    const { dto } = fixture();
    dto.bindings = dto.bindings.filter((b) => b.mentionId !== "vendor_b");
    expect(() => prepareCaseComparison(dto)).toThrow(/endpoint|binding/i);
    expect(() =>
      prepareCaseComparison(
        fixture().dto,
        Array.from({ length: 13 }, (_, i) => String(i)),
      ),
    ).toThrow(/12/);
  });
  it("finds only certainly ordered repeated sequences and preserves uncertain dates", () => {
    const { dto, add } = fixture();
    for (const c of ["a", "b"]) {
      dto.proposals.find(
        (p) => p.assertionId === `as_event_${c}`,
      )!.occurredTime = { start: "2023-01", uncertain: false };
      add(c, `as_payment_${c}`, {
        kind: "occurrence",
        predicate: "payment",
        occurrenceId: `payment_${c}`,
        participants: [
          { role: "payer", mentionId: `buyer_${c}` },
          { role: "recipient", mentionId: `vendor_${c}` },
        ],
        occurredTime: { start: "2023-02", uncertain: false },
      });
    }
    expect(
      prepareCaseComparison(dto).candidates.filter(
        (c) => c.kind === "event_sequence",
      ),
    ).toHaveLength(1);
    dto.proposals.find(
      (p) => p.assertionId === "as_payment_b",
    )!.occurredTime!.uncertain = true;
    expect(
      prepareCaseComparison(dto).candidates.filter(
        (c) => c.kind === "event_sequence",
      ),
    ).toHaveLength(0);
  });
  it("retains exact duplicate citation aliases while counting unique passage text only once", () => {
    const { dto, add } = fixture();
    const original = dto.proposals[0]!.evidence[0]!;
    for (let i = 0; i < 30; i++)
      add("a", `as_copy_${i}`, {
        kind: "fact",
        predicate: "description",
        subjectMentionId: "shared_a",
        evidence: [
          {
            ...original,
            evidenceId: `copy_${i}`,
            extractionId: `copy_extract_${i}`,
          },
        ],
      });
    const context = prepareCaseComparison(dto);
    expect(context.passages.length).toBeGreaterThan(24);
    expect(context.scope.uniquePassageCount).toBe(3);
  });
  it("refuses oversized accepted neighborhoods and passage text without truncating endpoints", () => {
    const { dto, add } = fixture();
    for (let i = 0; i < 101; i++)
      add("a", `as_fact_${i}`, {
        kind: "fact",
        predicate: "description",
        subjectMentionId: "shared_a",
      });
    expect(() => prepareCaseComparison(dto)).toThrow(/100 accepted/);
    const large = fixture().dto;
    for (const p of large.proposals) p.evidence[0]!.quote = "X".repeat(12000);
    expect(() => prepareCaseComparison(large)).toThrow(/32 KiB/);
  });
  it("discloses unexamined eligible cases and never reports cases absent from the supplied authority view", () => {
    const { dto, entity } = fixture();
    for (let i = 0; i < 12; i++) {
      const caseId = `case_${i}`;
      dto.cases.push({
        caseId,
        title: caseId,
        notes: "",
        question: "q",
        scope: "s",
      });
      entity(caseId, `extra_${i}`, `Extra ${i}`);
    }
    const context = prepareCaseComparison(dto);
    expect(context.scope.comparedCaseIds).toHaveLength(12);
    expect(context.scope.unexaminedEligibleCaseIds).toHaveLength(3);
    const supplied = fixture().dto;
    supplied.cases = supplied.cases.filter((c) => c.caseId !== "negative");
    expect(JSON.stringify(prepareCaseComparison(supplied))).not.toContain(
      "negative",
    );
  });
});

it("remaps written-date normalization citations into the compared passage array", () => {
  const { dto } = fixture();
  const p = dto.proposals.find((item) => item.kind === "occurrence")!;
  p.evidence = [{ ...p.evidence[0]!, quote: "Meeting September 2024" }];
  p.occurredTime = {
    start: "2024-09",
    uncertain: true,
    startNormalization: {
      method: "written-date.v1",
      sourceExpression: "September 2024",
      citationIndex: 0,
    },
  };
  const context = prepareCaseComparison(dto);
  const a = context.assertions.find(
    (item) => item.assertionId === p.assertionId,
  )!;
  expect(
    context.passages[a.occurredTime!.startNormalization!.citationIndex]!
      .citation.quote,
  ).toContain("September 2024");
});

it("does not let a model promote cited same-name records to a reviewed shared identity", () => {
  const { dto } = fixture();
  const context = prepareCaseComparison(dto);
  context.candidates = context.candidates.filter(
    (c) => c.kind !== "shared_identity",
  );
  const assertions = context.assertions.filter(
    (a) => a.caseIds.includes("a") || a.caseIds.includes("b"),
  );
  const citations = context.passages.map((p) => ({
    passageIndex: p.index,
    quote: p.citation.quote,
  }));
  const finding = {
    title: "Matching names",
    explanation: "Tentative match",
    kind: "shared_identity",
    caseIds: ["a", "b"],
    assertionIds: assertions.map((a) => a.assertionId),
    citations,
    differences: ["Distinct identities"],
    counterexamples: ["None"],
    ordinaryExplanations: ["Common name"],
    limitations: ["Unverified"],
  };
  expect(() =>
    validateCrossCaseOutput(
      {
        answer: "Possible match",
        citations,
        unresolvedQuestions: [],
        findings: [finding],
      },
      context,
    ),
  ).toThrow(/reviewed common identity/);
  expect(
    validateCrossCaseOutput(
      {
        answer: "Possible match",
        citations,
        unresolvedQuestions: [],
        findings: [{ ...finding, kind: "tentative_identity" }],
      },
      context,
    ).findings[0]!.kind,
  ).toBe("tentative_identity");
});
