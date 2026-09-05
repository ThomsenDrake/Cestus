import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { startLocalRuntimeServer, type LocalRuntimeServerHandle } from "../src/server.js";

let runtime: LocalRuntimeServerHandle | undefined;
let directory: string;
afterEach(async () => { await runtime?.close(); if (directory) rmSync(directory, { recursive: true, force: true }); });
it("exposes canonical passage citations through the production evidence route", async () => {
  directory = mkdtempSync(join(tmpdir(), "cestus-knowledge-http-"));
  const rootDir = join(directory, "workspace");
  createPortableWorkspace({ rootDir, workspaceId: "ws_knowledge_test", label: "Synthetic knowledge", createdBy: "test", createdAt: "2026-09-05T00:00:00.000Z" });
  new SQLiteEventLedger(join(rootDir, "ledger/ontology.sqlite")).close();
  const sourceRoot = join(directory, "selected"); mkdirSync(sourceRoot);
  writeFileSync(join(sourceRoot, "record.txt"), "Alex Vale received 1200 in 2025-03.\n");
  const base = resolveLocalRuntimeConfig({ cwd: directory, env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: rootDir, CESTUS_LOCAL_AUTH_TOKEN: "synthetic-session-value" } });
  runtime = await startLocalRuntimeServer({ config: { ...base, operator: { id: "operator_knowledge", kind: "human", label: "Synthetic investigator" }, http: { ...base.http, port: 0 } } });
  const address = runtime.server.address(); if (!address || typeof address === "string") throw new Error("No address");
  const origin = `http://127.0.0.1:${address.port}`;
  async function request(path: string, body?: unknown, status = 200) {
    const response = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { authorization: "Bearer synthetic-session-value", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); expect(response.status, JSON.stringify(result)).toBe(status); return result;
  }
  await request("/api/ingestion/sources", { sourceCollectionId: "src_knowledge", label: "Synthetic selected records", rootUri: pathToFileURL(sourceRoot).href, sourceRoot });
  await request("/api/ingestion/scans/dry-run", { sourceCollectionId: "src_knowledge", scanBatchId: "scan_knowledge" });
  const batch = { sourceCollectionId: "src_knowledge", scanBatchId: "scan_knowledge", importBatchId: "imp_knowledge" };
  await request("/api/ingestion/imports/approve", batch); await request("/api/ingestion/imports/run", batch);
  await request("/api/ingestion/parse/run", { sourceCollectionId: "src_knowledge" });
  const evidence = await request("/api/evidence/workspace");
  const content = await request(`/api/evidence/${evidence.items[0].evidenceId}/content`);
  expect(content.citations).toHaveLength(1);
  expect(content.citations[0]).toMatchObject({ workspaceId: "ws_knowledge_test", quote: "Alex Vale received 1200 in 2025-03.", passageIndex: 0 });
  expect(content.citations[0].provenanceEventIds).toHaveLength(2);
  expect((await fetch(origin + "/api/ontology/knowledge")).status).toBe(401);
  let sequence = 0;
  async function command(body: Record<string, unknown>, status = 200) {
    const current = await request("/api/ontology/knowledge");
    return request("/api/ontology/commands", { decisionId: `http_${++sequence}`, expectedRevision: current.revision, ...body }, status);
  }
  await command({ action: "createCase", caseId: "case_award", title: "Synthetic award", question: "Who was paid?", scope: "Fictional records", notes: "" });
  await command({ action: "createCase", caseId: "case_overlap", title: "Synthetic overlap", question: "Same actor?", scope: "Fictional records", notes: "" });
  for (const caseId of ["case_award", "case_overlap"]) await command({ action: "membership", caseId, targetKind: "evidence", targetId: evidence.items[0].evidenceId, included: true });
  const entity = { assertionId: "as_actor", workspaceId: "ws_knowledge_test", kind: "entity", predicate: "name", value: { type: "string", value: "Alex Vale" }, mentionId: "mention_alex", entityType: "person", evidence: content.citations, schemaId: "investigation.v1", provenance: { kind: "manual" } };
  await command({ action: "propose", proposals: [{ ...entity, evidence: [{ ...content.citations[0], quote: "Fabricated Alex Vale" }] }] }, 409);
  await command({ action: "propose", proposals: [entity], actor: { id: "spoofed", kind: "human", label: "Spoofed" } }, 409);
  for (const tampered of [
    { ...content.citations[0], sourceContentHash: `sha256:${"0".repeat(64)}` },
    { ...content.citations[0], extractionId: "extract_fabricated" },
    { ...content.citations[0], locator: { ...content.citations[0].locator, block: 99 } },
    { ...content.citations[0], workspaceId: "ws_other" }
  ]) await command({ action: "propose", proposals: [{ ...entity, evidence: [tampered] }] }, 409);
  await command({ action: "propose", proposals: [{ ...entity, value: { type: "unsupported", value: "Alex Vale" } }] }, 409);
  await command({ action: "propose", proposals: [entity] });
  const beforeReview = await request("/api/ontology/knowledge");
  const review = { decisionId: "stable_http_review", expectedRevision: beforeReview.revision, action: "review", reviews: [{ assertionId: "as_actor", proposalEventId: beforeReview.proposals[0].proposalEventId, action: "accept", rationale: "Read the fictional source", entityId: "ent_alex" }] };
  const committed = await request("/api/ontology/commands", review);
  expect(await request("/api/ontology/commands", review)).toEqual(committed);
  const accepted = await request("/api/ontology/knowledge");
  expect(accepted.entities).toHaveLength(1);
  expect(accepted.entities[0].caseIds).toEqual(["case_award", "case_overlap"]);
  await request("/api/ontology/commands", { ...review, decisionId: "stale_http_review" }, 409);
  const fact = { assertionId: "as_amount", workspaceId: "ws_knowledge_test", kind: "fact", predicate: "amount", value: { type: "number", value: 1200 }, subjectMentionId: "mention_alex", evidence: content.citations, schemaId: "investigation.v1", provenance: { kind: "manual" } };
  await command({ action: "propose", proposals: [fact] });
  let dto = await request("/api/ontology/knowledge");
  const amount = dto.proposals.find((p: { assertionId: string }) => p.assertionId === "as_amount");
  await command({ action: "review", reviews: [{ assertionId: "as_amount", proposalEventId: amount.proposalEventId, action: "accept", rationale: "Read 1200 in passage" }] });
  await command({ action: "bind", mentionId: "mention_alex", assertionId: "as_actor", previousEntityId: "ent_alex", entityId: "ent_corrected", rationale: "Repair a mistaken shared binding" });
  dto = await request("/api/ontology/knowledge");
  expect(dto.proposals.find((p: { assertionId: string }) => p.assertionId === "as_amount").subjectEntityId).toBe("ent_corrected");
  await command({ action: "review", reviews: [{ assertionId: "as_amount", proposalEventId: amount.proposalEventId, action: "dispute", rationale: "Amount may reflect an estimate" }] });
  await command({ action: "review", reviews: [{ assertionId: "as_amount", proposalEventId: amount.proposalEventId, action: "withdraw", rationale: "Withdraw pending corroboration" }] });
  dto = await request("/api/ontology/knowledge");
  expect(dto.proposals.find((p: { assertionId: string }) => p.assertionId === "as_amount").history.map((h: { action: string }) => h.action)).toEqual(["accept", "dispute", "withdraw"]);
  expect(dto.proposals.find((p: { assertionId: string }) => p.assertionId === "as_amount").reviewState).toBe("withdrawn");
  await command({ action: "propose", proposals: Array.from({ length: 25 }, (_, index) => ({ ...entity, assertionId: `as_group_${index}`, mentionId: `mention_group_${index}` })) });
  expect((await request("/api/ontology/workspace")).entities.some((e: { canonicalLabel: string }) => e.canonicalLabel === "Alex Vale")).toBe(true);
  await request("/api/evidence/initial-classification", { evidenceRef: evidence.items[0].evidenceId, tag: "credential_risk", rationale: "Synthetic revocation regression" }, 201);
  expect((await request("/api/ontology/knowledge")).proposals).toHaveLength(0);
  const legacyAfterRevocation = await request("/api/ontology/workspace");
  expect(JSON.stringify(legacyAfterRevocation)).not.toContain("Alex Vale");
  expect(legacyAfterRevocation.entities).toHaveLength(0);
});
