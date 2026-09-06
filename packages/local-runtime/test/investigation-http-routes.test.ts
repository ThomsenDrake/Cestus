import { expect, it, vi } from "vitest";
import { handleInvestigationHttpRoute } from "../src/investigation-http-routes.js";
vi.mock("../../ontology/src/knowledge-service.js", () => ({
  KnowledgeService: class {
    async read() {
      return { cases: [], proposals: [], memberships: [], entities: [] };
    }
  },
}));
vi.mock("../../ontology/src/case-comparison.js", () => ({
  prepareCaseComparison: () => ({
    secret: "revoked case context",
    scope: { comparedCaseIds: ["case_a"] },
  }),
}));
vi.mock("../../ontology/src/investigation-records.js", () => ({
  InvestigationRecordsService: class {
    async read() {
      return { records: [] };
    }
  },
  InvestigationRecordError: class extends Error {},
}));
it("fails closed when authority changes after the aggregate context was captured", async () => {
  let revision = 1;
  const workspace = {
    capabilities: { canReadLedger: true, canAppendLedger: true },
    ledger: { readAll: async () => Array(revision).fill({}) },
  };
  const processing = {
    list: async () => {
      revision++;
      return [];
    },
  };
  const response = await handleInvestigationHttpRoute({
    request: { method: "GET", url: "/api/investigation" },
    workspace,
    processing,
    actor: { id: "human", kind: "human", label: "Reviewer" },
  } as never);
  expect(response.status).toBe(409);
  expect(JSON.stringify(response)).not.toContain("revoked case context");
});
