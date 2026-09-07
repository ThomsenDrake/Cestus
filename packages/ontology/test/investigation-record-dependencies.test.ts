import { expect, it } from "vitest";
import { InMemoryEventLedger } from "../src/event-ledger.js";
import { KnowledgeService } from "../src/knowledge-service.js";
import { InvestigationRecordsService } from "../src/investigation-records.js";

it("retains endpoint identity sources and marks a linked note stale after identity repair", async () => {
  const actor = {
    id: "human_local",
    kind: "human",
    label: "Reviewer",
  } as const;
  const ledger = new InMemoryEventLedger();
  let revoked = false;
  const resolveCitation = async (c: any) => {
    if (revoked && c.evidenceId === "ev_identity")
      throw Error("excluded identity source");
  };
  const service = new KnowledgeService({
    ledger,
    workspaceId: "ws_test",
    resolveCitation,
  });
  const records = new InvestigationRecordsService({
    ledger,
    workspaceId: "ws_test",
    resolveCitation,
  });
  let n = 0;
  const cmd = async (x: any) =>
    service.execute(
      {
        ...x,
        decisionId: "decision_" + ++n,
        expectedRevision: (await ledger.readAll()).length,
      },
      actor,
    );
  const cite = (evidenceId: string, quote: string) => ({
    workspaceId: "ws_test",
    evidenceId,
    sourceContentHash: "sha256:" + "a".repeat(64),
    extractionId: "ext_" + evidenceId,
    extractionContentHash: "sha256:" + "b".repeat(64),
    locator: { kind: "text", block: 1, start: 0, end: quote.length },
    provenanceEventIds: ["evt_evidence"],
    quote,
    passageIndex: 0,
  });
  const identity = cite(
    "ev_identity",
    "Alice is the payer. Acme is the recipient.",
  );
  const payment = cite("ev_payment", "Alice paid Acme.");
  const base = {
    workspaceId: "ws_test",
    schemaId: "investigation.v1",
    provenance: { kind: "manual" },
  };
  await cmd({
    action: "createCase",
    caseId: "case_one",
    title: "One",
    question: "Who paid?",
    scope: "Public",
    notes: "",
  });
  await cmd({
    action: "propose",
    proposals: [
      {
        ...base,
        assertionId: "as_alice",
        kind: "entity",
        predicate: "name",
        value: { type: "string", value: "Alice" },
        mentionId: "m_alice",
        entityType: "person",
        evidence: [identity],
      },
      {
        ...base,
        assertionId: "as_acme",
        kind: "entity",
        predicate: "name",
        value: { type: "string", value: "Acme" },
        mentionId: "m_acme",
        entityType: "organization",
        evidence: [identity],
      },
      {
        ...base,
        assertionId: "as_paid",
        kind: "relationship",
        predicate: "paid",
        subjectMentionId: "m_alice",
        value: { type: "entity", mentionId: "m_acme" },
        evidence: [payment],
      },
    ],
  });
  const dto = await service.read();
  await cmd({
    action: "review",
    reviews: dto.proposals.map((p) => ({
      assertionId: p.assertionId,
      proposalEventId: p.proposalEventId,
      action: "accept",
      rationale: "Checked sources",
    })),
  });
  await records.execute(
    {
      decisionId: "save",
      expectedRevision: (await ledger.readAll()).length,
      record: {
        recordId: "note",
        kind: "note",
        status: "saved",
        title: "Connection",
        body: "Alice paid Acme.",
        caseIds: ["case_one"],
        supporting: ["as_paid"],
        contradicting: [],
        citations: [],
      },
    },
    actor,
  );
  const binding = (await service.read()).bindings.find(
    (b) => b.mentionId === "m_alice",
  )!;
  await cmd({
    action: "bind",
    mentionId: "m_alice",
    assertionId: "as_alice",
    entityId: "ent_corrected",
    previousEntityId: binding.entityId,
    rationale: "Distinct reviewed identity",
  });
  expect((await records.read(actor)).records[0]!.staleAssertionIds).toContain(
    "as_alice",
  );
  revoked = true;
  expect((await records.read(actor)).records).toEqual([]);
});
