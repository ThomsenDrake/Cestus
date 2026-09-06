import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../src/event-ledger.js";
import { KnowledgeService } from "../src/knowledge-service.js";
import { investigationRecordSchema } from "../src/knowledge-contracts.js";
import { InvestigationRecordsService } from "../src/investigation-records.js";

const actor = { id: "human_local", kind: "human" as const, label: "Reviewer" };
const citation = {
  workspaceId: "ws_test",
  evidenceId: "ev_source",
  sourceContentHash: `sha256:${"a".repeat(64)}`,
  extractionId: "ext_one",
  extractionContentHash: `sha256:${"b".repeat(64)}`,
  locator: { kind: "text" as const, block: 1, start: 0, end: 22 },
  provenanceEventIds: ["evt_evidence"],
  quote: "Acme met during 2024.",
  passageIndex: 0,
};
const record = {
  recordId: "record_one",
  kind: "note" as const,
  status: "saved" as const,
  title: "Meeting note",
  body: "Acme met during 2024.",
  caseIds: ["case_one"],
  supporting: [] as string[],
  contradicting: [] as string[],
  citations: [citation],
  occurredOn: "2024",
};
async function setup() {
  const ledger = new InMemoryEventLedger();
  let revoked = false;
  const resolveCitation = async () => {
    if (revoked) throw new Error("Excluded source");
  };
  const knowledge = new KnowledgeService({
    ledger,
    workspaceId: "ws_test",
    resolveCitation,
  });
  await knowledge.execute(
    {
      action: "createCase",
      caseId: "case_one",
      title: "Case one",
      question: "Who met?",
      scope: "Public",
      notes: "",
      decisionId: "case_create",
      expectedRevision: 0,
    },
    actor,
  );
  const options = { ledger, workspaceId: "ws_test", resolveCitation };
  return {
    ledger,
    knowledge,
    options,
    service: new InvestigationRecordsService(options),
    revoke: () => {
      revoked = true;
    },
  };
}

describe("local investigation work products", () => {
  it("appends editable notes and replays current versions with bounded history", async () => {
    const { ledger, service, options } = await setup();
    const first = await service.execute(
      { decisionId: "save_one", expectedRevision: 1, record },
      actor,
    );
    await service.execute(
      {
        decisionId: "edit_one",
        expectedRevision: 2,
        record: { ...record, body: "Revised local note", status: "open" },
      },
      actor,
    );
    expect((await ledger.readAll()).slice(1, 2)).toEqual(first);
    const reopened = await new InvestigationRecordsService(options).read(actor);
    expect(reopened.revision).toBe(3);
    expect(reopened.records).toHaveLength(1);
    expect(reopened.records[0]).toMatchObject({
      ...record,
      body: "Revised local note",
      status: "open",
    });
    expect(reopened.records[0]!.history).toHaveLength(2);
  });

  it("requires current human authority and enforces stale revisions and exact decision retries", async () => {
    const { ledger, service, revoke } = await setup();
    const command = { decisionId: "save_one", expectedRevision: 1, record };
    await expect(
      service.execute(command, { ...actor, kind: "agent" }),
    ).rejects.toThrow(/human/);
    await expect(service.read({ ...actor, kind: "system" })).rejects.toThrow(
      /human/,
    );
    const first = await service.execute(command, actor);
    expect(await service.execute(command, actor)).toEqual(first);
    await expect(
      service.execute(
        { ...command, record: { ...record, body: "Other" } },
        actor,
      ),
    ).rejects.toThrow(/different content/);
    await expect(
      service.execute({ ...command, decisionId: "stale" }, actor),
    ).rejects.toThrow(/stale/);
    revoke();
    await expect(service.execute(command, actor)).rejects.toThrow(
      /available|authority/i,
    );
    expect(await ledger.readAll()).toHaveLength(2);
  });

  it("hides the whole record on revocation and cannot launder inherited citations through edits", async () => {
    const { ledger, service, revoke } = await setup();
    await service.execute(
      { decisionId: "save_one", expectedRevision: 1, record },
      actor,
    );
    await service.execute(
      {
        decisionId: "strip_one",
        expectedRevision: 2,
        record: { ...record, citations: [] },
      },
      actor,
    );
    revoke();
    expect((await service.read(actor)).records).toEqual([]);
    await expect(
      service.execute(
        {
          decisionId: "launder",
          expectedRevision: 3,
          record: { ...record, citations: [] },
        },
        actor,
      ),
    ).rejects.toThrow(/available|authority/i);
    expect(await ledger.readAll()).toHaveLength(3);
  });

  it("inherits request dependencies in responses and revalidates links after parent edits", async () => {
    const { service, revoke } = await setup();
    await service.execute(
      {
        decisionId: "request",
        expectedRevision: 1,
        record: { ...record, kind: "request" },
      },
      actor,
    );
    const response = {
      ...record,
      recordId: "response_one",
      kind: "response",
      citations: [],
      relatedRecordId: record.recordId,
    };
    await service.execute(
      { decisionId: "response", expectedRevision: 2, record: response },
      actor,
    );
    expect((await service.read(actor)).records).toHaveLength(2);
    revoke();
    expect((await service.read(actor)).records).toEqual([]);
    await expect(
      service.execute(
        {
          decisionId: "strip_response",
          expectedRevision: 3,
          record: { ...response, relatedRecordId: undefined },
        },
        actor,
      ),
    ).rejects.toThrow(/available|authority/i);
  });

  it("rejects unknown cases, assertion links, mismatched workspaces and unsafe bounds", async () => {
    const { service } = await setup();
    for (const invalid of [
      { ...record, caseIds: ["missing"] },
      { ...record, supporting: ["as_missing"] },
      { ...record, citations: [{ ...citation, workspaceId: "ws_other" }] },
      { ...record, citations: Array(257).fill(citation) },
      { ...record, caseIds: Array(13).fill("case_one") },
      { ...record, occurredOn: "2025-02-30" },
      { ...record, relatedRecordId: "missing" },
    ])
      await expect(
        service.execute(
          { decisionId: "invalid", expectedRevision: 1, record: invalid },
          actor,
        ),
      ).rejects.toThrow();
    await expect(service.read(actor, { limit: 101 })).rejects.toThrow();
  });

  it("retains case scope dependencies across edits and related records", async () => {
    const { service, knowledge } = await setup();
    await knowledge.execute(
      {
        action: "createCase",
        caseId: "case_two",
        title: "Case two",
        question: "Who met?",
        scope: "Public",
        notes: "",
        decisionId: "second_case",
        expectedRevision: 1,
      },
      actor,
    );
    await service.execute(
      {
        decisionId: "cross_case",
        expectedRevision: 2,
        record: { ...record, caseIds: ["case_one", "case_two"] },
      },
      actor,
    );
    await service.execute(
      { decisionId: "remove_case", expectedRevision: 3, record },
      actor,
    );
    await service.execute(
      {
        decisionId: "linked",
        expectedRevision: 4,
        record: {
          ...record,
          recordId: "response",
          kind: "response",
          relatedRecordId: record.recordId,
        },
      },
      actor,
    );
    expect(
      (await service.read(actor, { caseIds: ["case_one"] })).records,
    ).toEqual([]);
    expect(
      (await service.read(actor, { caseIds: ["case_one", "case_two"] }))
        .records,
    ).toHaveLength(2);
  });

  it("marks withdrawn supporting assertions stale while retaining citation authority", async () => {
    const { service, knowledge, ledger, revoke } = await setup();
    await knowledge.execute(
      {
        action: "propose",
        decisionId: "propose",
        expectedRevision: 1,
        proposals: [
          {
            assertionId: "as_meeting",
            workspaceId: "ws_test",
            kind: "entity",
            predicate: "name",
            value: { type: "string", value: "Acme" },
            mentionId: "m_acme",
            entityType: "organization",
            evidence: [citation],
            schemaId: "investigation.v1",
            provenance: { kind: "manual" },
          },
        ],
      },
      actor,
    );
    const dto = await knowledge.read();
    const proposal = dto.proposals[0]!;
    const review = {
      assertionId: proposal.assertionId,
      proposalEventId: proposal.proposalEventId,
      action: "accept",
      rationale: "Reviewed source",
    };
    await knowledge.execute(
      {
        action: "review",
        decisionId: "accept",
        expectedRevision: dto.revision,
        reviews: [review],
      },
      actor,
    );
    await service.execute(
      {
        decisionId: "linked_note",
        expectedRevision: (await ledger.readAll()).length,
        record: {
          ...record,
          citations: [],
          supporting: [proposal.assertionId],
        },
      },
      actor,
    );
    expect((await service.read(actor)).records[0]!.staleAssertionIds).toEqual(
      [],
    );
    await knowledge.execute(
      {
        action: "review",
        decisionId: "withdraw",
        expectedRevision: (await ledger.readAll()).length,
        reviews: [{ ...review, action: "withdraw" }],
      },
      actor,
    );
    expect((await service.read(actor)).records[0]!.staleAssertionIds).toEqual([
      proposal.assertionId,
    ]);
    revoke();
    expect((await service.read(actor)).records).toEqual([]);
  });

  it("rechecks newly attached request sources when reopening an older response", async () => {
    const { service, revoke } = await setup();
    await service.execute(
      {
        decisionId: "request",
        expectedRevision: 1,
        record: { ...record, kind: "request", citations: [] },
      },
      actor,
    );
    await service.execute(
      {
        decisionId: "response",
        expectedRevision: 2,
        record: {
          ...record,
          recordId: "response",
          kind: "response",
          citations: [],
          relatedRecordId: record.recordId,
        },
      },
      actor,
    );
    await service.execute(
      {
        decisionId: "attach_request_source",
        expectedRevision: 3,
        record: { ...record, kind: "request" },
      },
      actor,
    );
    revoke();
    expect((await service.read(actor)).records).toEqual([]);
  });
});

it("can preserve a full bounded comparison instead of discarding dependencies above 24", () => {
  expect(
    investigationRecordSchema.safeParse({
      ...record,
      supporting: Array.from({ length: 100 }, (_, i) => `assert_${i}`),
      citations: Array.from({ length: 100 }, (_, i) => ({
        ...citation,
        quote: `source alias ${i}`,
      })),
    }).success,
  ).toBe(true);
});
