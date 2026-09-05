import { describe, it, expect } from "vitest";
import { acceptedKnowledgeSource } from "../src/accepted-knowledge-source.js";
import { buildGraphProjection } from "../src/graph-projection.js";
import { KnowledgeService } from "../src/knowledge-service.js";
import { InMemoryEventLedger } from "../src/event-ledger.js";
import type { KnowledgeProposal } from "../src/knowledge-contracts.js";
const actor = {
  id: "human_local",
  kind: "human" as const,
  label: "Local reviewer",
};
const citation = {
  workspaceId: "ws_test",
  evidenceId: "ev_source",
  sourceContentHash: `sha256:${"a".repeat(64)}`,
  extractionId: "ext_one",
  extractionContentHash: `sha256:${"b".repeat(64)}`,
  locator: { kind: "text" as const, block: 1, start: 0, end: 30 },
  provenanceEventIds: ["evt_evidence"],
  quote: "Acme paid 120 in 2024.",
  passageIndex: 0,
};
const entity = (assertionId: string, mentionId: string): KnowledgeProposal => ({
  assertionId,
  workspaceId: "ws_test",
  kind: "entity",
  predicate: "name",
  value: { type: "string", value: "Acme" },
  mentionId,
  entityType: "organization",
  evidence: [citation],
  schemaId: "investigation.v1",
  provenance: { kind: "manual" },
});
function setup() {
  const ledger = new InMemoryEventLedger();
  const service = new KnowledgeService({
    ledger,
    workspaceId: "ws_test",
    resolveCitation: async () => {},
  });
  return { ledger, service };
}
async function command(
  service: KnowledgeService,
  input: Record<string, unknown>,
) {
  return service.execute(
    {
      decisionId: `d_${Math.random().toString(36).slice(2)}`,
      expectedRevision: (await service.read()).revision,
      ...input,
    },
    actor,
  );
}
describe("shared knowledge decisions", () => {
  it("persists proposals, atomically accepts entities, and repairs cross-case bindings without rewriting history", async () => {
    const { service, ledger } = setup();
    await command(service, {
      action: "propose",
      proposals: [
        entity("as_one", "mention_one"),
        entity("as_two", "mention_two"),
      ],
    });
    let dto = await service.read();
    await command(service, {
      action: "review",
      reviews: dto.proposals.map((p) => ({
        assertionId: p.assertionId,
        proposalEventId: p.proposalEventId,
        action: "accept",
        rationale: "Reviewed source",
        entityId: "ent_shared",
      })),
    });
    dto = await service.read();
    expect(dto.entities).toHaveLength(1);
    expect(dto.entities[0]?.assertionIds).toHaveLength(2);
    const before = await ledger.readAll();
    await command(service, {
      action: "bind",
      mentionId: "mention_two",
      entityId: "ent_distinct",
      previousEntityId: "ent_shared",
      assertionId: "as_two",
      rationale: "Different organization",
    });
    dto = await service.read();
    expect(dto.entities).toHaveLength(2);
    expect((await ledger.readAll()).slice(0, before.length)).toEqual(before);
  });
  it("rejects unsupported value grounding, unknown vocabulary acceptance, stale review and non-human decisions", async () => {
    const { service } = setup();
    await expect(
      command(service, {
        action: "propose",
        proposals: [
          {
            ...entity("as_bad", "m_bad"),
            value: { type: "string", value: "Invented" },
          },
        ],
      }),
    ).rejects.toThrow(/ground/i);
    await command(service, {
      action: "propose",
      proposals: [{ ...entity("as_one", "m_one"), predicate: "unknown" }],
    });
    const dto = await service.read();
    await expect(
      command(service, {
        action: "review",
        reviews: [
          {
            assertionId: "as_one",
            proposalEventId: dto.proposals[0]!.proposalEventId,
            action: "accept",
            rationale: "Review",
          },
        ],
      }),
    ).rejects.toThrow(/vocabulary/i);
    await expect(
      service.execute(
        {
          decisionId: "stale",
          expectedRevision: 0,
          action: "selectCase",
          caseId: null,
        },
        actor,
      ),
    ).rejects.toThrow(/stale/i);
    await expect(
      service.execute(
        {
          decisionId: "agent",
          expectedRevision: dto.revision,
          action: "selectCase",
          caseId: null,
        },
        { ...actor, kind: "agent" },
      ),
    ).rejects.toThrow(/human/i);
  });
  it("returns identical retry after later changes, rejects changed decision content, and rechecks evidence", async () => {
    const { service, ledger } = setup();
    const input = {
      decisionId: "retry",
      expectedRevision: 0,
      action: "propose",
      proposals: [entity("as_one", "m_one")],
    };
    const first = await service.execute(input, actor);
    await command(service, { action: "selectCase", caseId: null });
    expect(await service.execute(input, actor)).toEqual(first);
    await expect(
      service.execute(
        { ...input, proposals: [entity("as_two", "m_two")] },
        actor,
      ),
    ).rejects.toThrow(/decision/i);
    const denied = new KnowledgeService({
      ledger,
      workspaceId: "ws_test",
      resolveCitation: async () => {
        throw new Error("Evidence denied");
      },
    });
    await expect(denied.execute(input, actor)).rejects.toThrow(/authorization/);
  });
});

async function acceptAll(service: KnowledgeService) {
  const dto = await service.read();
  return command(service, {
    action: "review",
    reviews: dto.proposals
      .filter((p) => p.reviewState === "proposed")
      .map((p) => ({
        assertionId: p.assertionId,
        proposalEventId: p.proposalEventId,
        action: "accept",
        rationale: "Checked selected source",
      })),
  });
}
const fact = (assertionId: string, value = 120): KnowledgeProposal => ({
  assertionId,
  workspaceId: "ws_test",
  kind: "fact",
  predicate: "amount",
  subjectMentionId: "m_actor",
  value: { type: "number", value },
  evidence: [citation],
  schemaId: "investigation.v1",
  provenance: { kind: "manual" },
});
describe("knowledge current projections and authorization", () => {
  it("updates dependent facts, relationships, occurrences and hypothesis support while preserving review history", async () => {
    const { service, ledger } = setup();
    const actorProposal = entity("as_actor", "m_actor");
    const other = {
      ...entity("as_other", "m_other"),
      value: { type: "string" as const, value: "Acme" },
    };
    const relationship: KnowledgeProposal = {
      ...fact("as_paid"),
      kind: "relationship",
      predicate: "paid",
      value: { type: "entity", mentionId: "m_other" },
    };
    const occurrence: KnowledgeProposal = {
      ...fact("as_occurrence"),
      kind: "occurrence",
      predicate: "payment",
      value: { type: "string", value: "paid" },
      occurrenceId: "occ_payment",
      participants: [{ role: "payer", mentionId: "m_actor" }, { role: "recipient", mentionId: "m_other" }],
      occurredTime: { start: "2024", uncertain: true },
    };
    await command(service, {
      action: "propose",
      proposals: [
        actorProposal,
        other,
        fact("as_amount"),
        relationship,
        occurrence,
      ],
    });
    await acceptAll(service);
    await command(service, {
      action: "createCase",
      caseId: "case_one",
      title: "Synthetic case",
      question: "Who paid?",
      scope: "Fictional records",
      notes: "",
    });
    await command(service, {
      action: "hypothesis",
      caseId: "case_one",
      hypothesisId: "h_one",
      statement: "Synthetic hypothesis",
      supporting: ["as_amount"],
      contradicting: [],
    });
    let dto = await service.read();
    expect(dto.hypotheses[0]?.currentSupporting).toEqual(["as_amount"]);
    expect(dto.occurrences).toHaveLength(1);
    expect(dto.entities.find(entity => entity.entityId === "ent_other")?.assertionIds).toContain("as_occurrence");
    await command(service, {
      action: "bind",
      assertionId: "as_actor",
      mentionId: "m_actor",
      entityId: "ent_repaired",
      previousEntityId: "ent_actor",
      rationale: "Wrong identity corrected",
    });
    dto = await service.read();
    expect(dto.relationships[0]?.fromEntityId).toBe("ent_repaired");
    expect(
      dto.proposals.find((p) => p.assertionId === "as_amount")?.subjectEntityId,
    ).toBe("ent_repaired");
    expect(dto.occurrences[0]?.participants[0]?.entityId).toBe("ent_repaired");
    const replay = await ledger.readAll();
    const graph = buildGraphProjection(replay);
    const reportSource = acceptedKnowledgeSource(graph, replay, "as_amount")!;
    expect(reportSource.safeStatement).toBe("amount: 120");
    expect(reportSource.evidence).toEqual([citation]);
    expect(reportSource.sourceEventIds).toContain(dto.bindingHistory.findLast(b => b.mentionId === "m_actor")!.eventId);
    expect(acceptedKnowledgeSource(graph, replay, "as_occurrence")?.safeStatement).toBe("payment: paid (occurred 2024, uncertain)");
    const amount = dto.proposals.find((p) => p.assertionId === "as_amount")!;
    await command(service, {
      action: "review",
      reviews: [
        {
          assertionId: amount.assertionId,
          proposalEventId: amount.proposalEventId,
          action: "dispute",
          rationale: "Contrary source remains relevant",
        },
      ],
    });
    await command(service, {
      action: "review",
      reviews: [
        {
          assertionId: amount.assertionId,
          proposalEventId: amount.proposalEventId,
          action: "withdraw",
          rationale: "Insufficient evidence",
        },
      ],
    });
    dto = await service.read();
    expect(dto.hypotheses[0]?.supporting).toEqual(["as_amount"]);
    expect(dto.hypotheses[0]?.currentSupporting).toEqual([]);
    const withdrawnReplay = await ledger.readAll();
    expect(acceptedKnowledgeSource(buildGraphProjection(withdrawnReplay), withdrawnReplay, "as_amount")).toBeUndefined();
    expect(
      dto.proposals
        .find((p) => p.assertionId === "as_amount")
        ?.history.map((h) => h.action),
    ).toEqual(["accept", "dispute", "withdraw"]);
    const actorP = dto.proposals.find((p) => p.assertionId === "as_actor")!;
    await command(service, {
      action: "review",
      reviews: [
        {
          assertionId: actorP.assertionId,
          proposalEventId: actorP.proposalEventId,
          action: "withdraw",
          rationale: "Identity unsupported",
        },
      ],
    });
    dto = await service.read();
    expect(dto.relationships).toHaveLength(0);
    expect(dto.occurrences).toHaveLength(0);
  });
  it("commits correction and replacement together, rejecting an invalid selected group without any writes", async () => {
    const { service, ledger } = setup();
    await command(service, {
      action: "propose",
      proposals: [entity("as_actor", "m_actor"), fact("as_old")],
    });
    await acceptAll(service);
    await command(service, {
      action: "propose",
      proposals: [{ ...fact("as_new"), derivedFrom: "as_old" }],
    });
    const dto = await service.read(),
      old = dto.proposals.find((p) => p.assertionId === "as_old")!,
      replacement = dto.proposals.find((p) => p.assertionId === "as_new")!;
    const before = await ledger.readAll();
    await expect(
      command(service, {
        action: "review",
        reviews: [
          {
            assertionId: replacement.assertionId,
            proposalEventId: replacement.proposalEventId,
            action: "accept",
            rationale: "Corrected",
          },
          {
            assertionId: old.assertionId,
            proposalEventId: "evt_wrong",
            action: "supersede",
            replacementId: "as_new",
            rationale: "Replaced",
          },
        ],
      }),
    ).rejects.toThrow(/stale/);
    expect(await ledger.readAll()).toEqual(before);
    await command(service, {
      action: "review",
      reviews: [
        {
          assertionId: replacement.assertionId,
          proposalEventId: replacement.proposalEventId,
          action: "accept",
          rationale: "Corrected",
        },
        {
          assertionId: old.assertionId,
          proposalEventId: old.proposalEventId,
          action: "supersede",
          replacementId: "as_new",
          rationale: "Replaced",
        },
      ],
    });
    expect(
      (await service.read()).proposals.find((p) => p.assertionId === "as_old")
        ?.reviewState,
    ).toBe("superseded");
  });
  it("does not inflate source independence for copied bytes, derived reports or repeated case memberships", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new KnowledgeService({
      ledger,
      workspaceId: "ws_test",
      resolveCitation: async () => {},
      authorizeEvidence: async () => {},
    });
    const references = [
      citation,
      { ...citation, evidenceId: "ev_copy" },
      {
        ...citation,
        evidenceId: "ev_derived",
        sourceContentHash: `sha256:${"c".repeat(64)}`,
      },
      {
        ...citation,
        evidenceId: "ev_independent",
        sourceContentHash: `sha256:${"d".repeat(64)}`,
      },
    ];
    await command(service, {
      action: "propose",
      proposals: [{ ...entity("as_actor", "m_actor"), evidence: references }],
    });
    await acceptAll(service);
    for (const [index, ref] of references.entries())
      await command(service, {
        action: "lineage",
        evidenceId: ref.evidenceId,
        originId: `origin_${index === 2 ? 0 : index}`,
        independence: index === 2 ? "derived" : "independent",
        rationale: "Reviewed lineage",
      });
    expect((await service.read()).entities[0]?.independentSourceCount).toBe(2);
  });
  it("fails closed if authority changes during a read or decision and filters denied knowledge", async () => {
    const { service, ledger } = setup();
    await command(service, {
      action: "propose",
      proposals: [entity("as_actor", "m_actor")],
    });
    await acceptAll(service);
    const denied = new KnowledgeService({
      ledger,
      workspaceId: "ws_test",
      resolveCitation: async () => {
        throw new Error("denied");
      },
    });
    const dto = await denied.read(actor);
    expect(dto.proposals).toEqual([]);
    expect(dto.entities).toEqual([]);
    expect(dto.bindingHistory).toEqual([]);
    let changed = false;
    const racing = new KnowledgeService({
      ledger,
      workspaceId: "ws_test",
      resolveCitation: async () => {
        if (!changed) {
          changed = true;
          await command(service, { action: "selectCase", caseId: null });
        }
      },
    });
    await expect(racing.read(actor)).rejects.toThrow(/changed/);
  });
  it("rejects unrelated endpoint references despite individually valid citations", async () => {
    const { service } = setup();
    await command(service, {
      action: "propose",
      proposals: [entity("as_actor", "m_actor")],
    });
    await acceptAll(service);
    await command(service, {
      action: "propose",
      proposals: [
        {
          ...fact("as_unrelated"),
          evidence: [{ ...citation, quote: "Different company paid 120." }],
        },
      ],
    });
    await expect(acceptAll(service)).rejects.toThrow(
      /Endpoint identity is not grounded/,
    );
  });
});

it("requires a quoted unit for manual numeric values and occurrence attributes", async () => {
  const { service } = setup();
  const quoted = { ...citation, quote: "Acme paid 120 USD in 2024." };
  await expect(command(service, { action: "propose", proposals: [{ ...fact("as_wrong_unit"), evidence: [quoted], value: { type: "number", value: 120, unit: "EUR" } }] })).rejects.toThrow(/ground/i);
  await command(service, { action: "propose", proposals: [{ ...fact("as_right_unit"), evidence: [quoted], value: { type: "number", value: 120, unit: "USD" } }] });
});
