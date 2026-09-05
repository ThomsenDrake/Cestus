import { describe, it, expect } from "vitest";
import { acceptedKnowledgeSource } from "../src/accepted-knowledge-source.js";
import { buildGraphProjection } from "../src/graph-projection.js";
import { KnowledgeService } from "../src/knowledge-service.js";
import { InMemoryEventLedger } from "../src/event-ledger.js";
import { investigationVocabulary, type KnowledgeProposal } from "../src/knowledge-contracts.js";
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
  it("rejects stale, incompatible, duplicate and unauthenticated schema additions and retries one atomic extension", async () => {
    const { service, ledger } = setup();
    const extension = { action: "extendSchema", baseSchemaId: "investigation.v1", addition: { kind: "entityType", name: "cooperative" }, rationale: "Reviewed necessary distinction", decisionId: "schema_one", expectedRevision: 0 };
    await expect(service.execute(extension, { ...actor, kind: "agent" })).rejects.toThrow(/human/);
    const committed = await service.execute(extension, actor);
    expect(committed.map(e => e.type)).toEqual(["knowledge.schema.recorded", "knowledge.schema.extended", "knowledge.schema.recorded"]);
    expect(await service.execute(extension, actor)).toEqual(committed);
    expect(await ledger.readAll()).toHaveLength(3);
    await expect(service.execute({ ...extension, decisionId: "schema_stale" }, actor)).rejects.toThrow(/stale/);
    await expect(command(service, { ...extension, decisionId: "base_stale", expectedRevision: 3 })).rejects.toThrow(/stale/);
    const base = { action: "extendSchema", baseSchemaId: "investigation.v2", rationale: "Review addition" };
    const predicate = { name: "member_of", kind: "relationship", valueType: "entity", fromTypes: ["person"], toTypes: ["cooperative"] };
    for (const addition of [
      { kind: "entityType", name: "cooperative" },
      { kind: "entityType", name: "Unknown type" },
      ...[{ ...predicate, name: "paid" }, { ...predicate, toTypes: ["unreviewed"] }, { ...predicate, fromTypes: ["person", "person"] }, { ...predicate, valueType: "number" }, { ...predicate, fromTypes: [] }, { ...predicate, kind: "fact" }, { ...predicate, kind: "occurrence", valueType: "date", toTypes: [] }].map(definition => ({ kind: "predicate", definition }))
    ]) await expect(command(service, { ...base, addition })).rejects.toThrow();
    expect(await ledger.readAll()).toHaveLength(3);
    await command(service, { ...base, addition: { kind: "predicate", definition: predicate } });
    const replay = new KnowledgeService({ ledger, workspaceId: "ws_test", resolveCitation: async () => {} });
    expect((await replay.read()).schema?.predicates.at(-1)).toEqual(predicate);
    expect((await replay.read()).schemaHistory?.map(item => item.actorId)).toEqual([actor.id, actor.id]);
  });
  it("binds written date interpretations to exact citations and preserves correction and replay history", async () => {
    const { service, ledger } = setup();
    const evidence = [{ ...citation, quote: "Acme was registered September 5, 2026. Published September 2026." }];
    await command(service, { action: "propose", proposals: [{ ...entity("as_actor", "m_actor"), evidence }] });
    const actorProposal = (await service.read()).proposals[0]!;
    await command(service, { action: "review", reviews: [{ assertionId: actorProposal.assertionId, proposalEventId: actorProposal.proposalEventId, action: "accept", rationale: "Read name" }] });
    const proposal: KnowledgeProposal = { ...entity("as_written", "unused"), mentionId: undefined, entityType: undefined, kind: "fact", predicate: "date", subjectMentionId: "m_actor", evidence,
      value: { type: "date", value: "2026-09-05", normalization: { method: "written-date.v1", sourceExpression: "September 5, 2026", citationIndex: 0 } } };
    await command(service, { action: "propose", proposals: [proposal] });
    for (const value of ["2026-09-06", "2026-02-30"]) await expect(command(service, { action: "propose", proposals: [{ ...proposal, assertionId: "as_bad", value: { ...proposal.value, value } }] })).rejects.toThrow();
    await expect(command(service, { action: "propose", proposals: [{ ...proposal, assertionId: "as_index", value: { type: "date", value: "2026-09-05", normalization: { method: "written-date.v1", sourceExpression: "September 5, 2026", citationIndex: 1 } } }] })).rejects.toThrow(/ground/);
    const date = (await service.read()).proposals.find(p => p.assertionId === proposal.assertionId)!;
    await command(service, { action: "review", reviews: [{ assertionId: date.assertionId, proposalEventId: date.proposalEventId, action: "accept", rationale: "Written day reviewed" }] });
    await command(service, { action: "propose", proposals: [{ ...proposal, assertionId: "as_month", derivedFrom: date.assertionId, value: { type: "date", value: "2026-09", normalization: { method: "written-date.v1", sourceExpression: "September 2026", citationIndex: 0 } } }] });
    const month = (await service.read()).proposals.find(p => p.assertionId === "as_month")!;
    await command(service, { action: "review", reviews: [{ assertionId: month.assertionId, proposalEventId: month.proposalEventId, action: "accept", rationale: "Publication month has month precision" }, { assertionId: date.assertionId, proposalEventId: date.proposalEventId, action: "supersede", replacementId: month.assertionId, rationale: "Correct time meaning" }] });
    const replay = new KnowledgeService({ ledger, workspaceId: "ws_test", resolveCitation: async () => {} });
    const recovered = await replay.read();
    expect(recovered.proposals.find(p => p.assertionId === date.assertionId)?.reviewState).toBe("superseded");
    expect(recovered.proposals.find(p => p.assertionId === month.assertionId)?.value).toEqual(month.value);
    expect(recovered.proposals.find(p => p.assertionId === month.assertionId)?.evidence).toEqual(evidence);
  });
  it("requires a reviewed additive snapshot and an explicit new proposal before unknown vocabulary can be accepted", async () => {
    const { service, ledger } = setup();
    await command(service, { action: "propose", proposals: [{ ...entity("as_unknown", "m_unknown"), entityType: "cooperative" }] });
    const original = (await service.read()).proposals[0]!;
    const review = { assertionId: original.assertionId, proposalEventId: original.proposalEventId, action: "accept", rationale: "Reviewed source" };
    await expect(command(service, { action: "review", reviews: [review] })).rejects.toThrow(/vocabulary/);
    const before = await ledger.readAll();
    await command(service, { action: "extendSchema", baseSchemaId: "investigation.v1", addition: { kind: "entityType", name: "cooperative" }, rationale: "Distinguish member-owned organizations" });
    const extended = await service.read();
    expect(extended.schema?.schemaId).toBe("investigation.v2");
    expect(extended.schema?.entityTypes).toContain("cooperative");
    expect(extended.proposals[0]?.schemaSnapshot?.entityTypes).not.toContain("cooperative");
    await expect(command(service, { action: "review", reviews: [review] })).rejects.toThrow(/schema|vocabulary/i);
    await command(service, { action: "propose", proposals: [{ ...entity("as_revised", "m_unknown"), entityType: "cooperative", schemaId: extended.schema!.schemaId, derivedFrom: original.assertionId }] });
    const revised = (await service.read()).proposals.find(p => p.assertionId === "as_revised")!;
    await command(service, { action: "review", reviews: [{ ...review, assertionId: revised.assertionId, proposalEventId: revised.proposalEventId }] });
    expect((await service.read()).entities[0]?.entityType).toBe("cooperative");
    expect((await ledger.readAll()).slice(0, before.length)).toEqual(before);
  });
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


// These immutable v2 records were legal before written-date normalization shipped:
// the old literal check accepted a year occurring within a complete ISO date.
async function historicalPartialDates() {
  const { ledger } = setup();
  const evidence = [{ ...citation, quote: "Acme occurred 2026-09-05." }];
  const context = { actor, occurredAt: "2026-09-05T12:00:00.000Z", correlationId: "historical", coreVersion: "2", packVersions: { knowledge: "investigation.v1" } };
  await ledger.append({ type: "knowledge.schema.recorded", version: 2, streamId: "historical", context, payload: investigationVocabulary });
  const oldEntity = { ...entity("as_actor", "m_actor"), evidence, occurredTime: { start: "2026", uncertain: true } };
  const oldDate: KnowledgeProposal = { ...fact("as_old_date"), evidence, predicate: "date", value: { type: "date", value: "2026" } };
  for (const p of [oldEntity, oldDate]) {
    const proposed = await ledger.append({ type: "knowledge.proposed", version: 2, streamId: "historical", context, payload: p });
    if (p.kind === "entity") await ledger.append({ type: "knowledge.mention.bound", version: 2, streamId: "historical", context, payload: { mentionId: "m_actor", entityId: "ent_actor", entityType: "organization", label: "Acme", assertionId: p.assertionId, previousEntityId: null, rationale: "Historical review", decisionId: "historical_entity" } });
    await ledger.append({ type: "knowledge.reviewed", version: 2, streamId: "historical", context, payload: { assertionId: p.assertionId, proposalEventId: proposed.id, action: "accept", rationale: "Historical review", decisionId: `historical_${p.assertionId}` } });
  }
  const pending = { ...oldDate, assertionId: "as_pending_date" };
  await ledger.append({ type: "knowledge.proposed", version: 2, streamId: "historical", context, payload: pending });
  const resolved: string[] = [];
  const service = new KnowledgeService({ ledger, workspaceId: "ws_test", resolveCitation: async (ref, reviewer) => { expect(ref).toEqual(evidence[0]); expect(reviewer).toEqual(actor); resolved.push(ref.evidenceId); } });
  return { ledger, service, oldDate, resolved };
}

describe("historical accepted date lifecycle", () => {
  it.each(["withdraw", "dispute", "supersede"])("permits %s after revalidating canonical evidence without retroactively changing grounding", async action => {
    const { ledger, service, oldDate, resolved } = await historicalPartialDates();
    const before = await ledger.readAll();
    const old = (await service.read()).proposals.find(p => p.assertionId === oldDate.assertionId)!;
    const review = { assertionId: old.assertionId, proposalEventId: old.proposalEventId, action, rationale: "Review historical interpretation", ...(action === "supersede" ? { replacementId: "as_replacement" } : {}) };
    const denied = new KnowledgeService({ ledger, workspaceId: "ws_test", resolveCitation: async () => { throw new Error("Canonical evidence authorization revoked"); } });
    await expect(command(denied, { action: "review", reviews: [review] })).rejects.toThrow(/authorization/);
    expect(await ledger.readAll()).toEqual(before);
    if (action === "supersede") {
      await command(service, { action: "propose", proposals: [{ ...oldDate, assertionId: "as_replacement", derivedFrom: old.assertionId, value: { type: "date", value: "2026-09-05" } }] });
      const replacement = (await service.read()).proposals.find(p => p.assertionId === "as_replacement")!;
      await command(service, { action: "review", reviews: [{ assertionId: replacement.assertionId, proposalEventId: replacement.proposalEventId, action: "accept", rationale: "Full precision in source" }, review] });
    } else await command(service, { action: "review", reviews: [review] });
    expect(resolved.length).toBeGreaterThan(0);
    const replay = new KnowledgeService({ ledger, workspaceId: "ws_test", resolveCitation: async () => {} });
    expect((await replay.read()).proposals.find(p => p.assertionId === old.assertionId)?.history.at(-1)?.action).toBe(action);
    expect((await ledger.readAll()).slice(0, before.length)).toEqual(before);
  });

  it("keeps accepted records referenceable while strict new proposals and acceptances remain grounded", async () => {
    const { ledger, service, oldDate } = await historicalPartialDates();
    await command(service, { action: "createCase", caseId: "case_history", title: "History", question: "When?", scope: "Synthetic", notes: "" });
    for (const [targetKind, targetId] of [["entity", "ent_actor"], ["knowledge", oldDate.assertionId]]) await command(service, { action: "membership", caseId: "case_history", targetKind, targetId, included: true });
    await command(service, { action: "hypothesis", caseId: "case_history", hypothesisId: "h_history", statement: "The source year remains relevant", supporting: [oldDate.assertionId], contradicting: [] });
    await command(service, { action: "bind", mentionId: "m_actor", entityId: "ent_repaired", previousEntityId: "ent_actor", assertionId: "as_actor", rationale: "Repair source identity" });
    await expect(command(service, { action: "propose", proposals: [{ ...oldDate, assertionId: "as_new_partial" }] })).rejects.toThrow(/ground/);
    const pending = (await service.read()).proposals.find(p => p.assertionId === "as_pending_date")!;
    const review = { assertionId: pending.assertionId, proposalEventId: pending.proposalEventId, rationale: "Reassess old unreviewed proposal" };
    await expect(command(service, { action: "review", reviews: [{ ...review, action: "accept" }] })).rejects.toThrow(/ground/);
    await command(service, { action: "review", reviews: [{ ...review, action: "reject" }] });
    const before = await ledger.readAll();
    const denied = new KnowledgeService({ ledger, workspaceId: "ws_test", resolveCitation: async () => { throw new Error("Canonical evidence authorization revoked"); } });
    await expect(command(denied, { action: "membership", caseId: "case_history", targetKind: "knowledge", targetId: oldDate.assertionId, included: false })).rejects.toThrow(/authorization/);
    expect(await ledger.readAll()).toEqual(before);
  });
});
