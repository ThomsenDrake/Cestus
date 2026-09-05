import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { GovernanceService } from "../../ontology/src/governance-service.js";
import { syntheticPdf } from "../../ingestion/test/fixtures/synthetic-pdf.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { startLocalRuntimeServer, type LocalRuntimeServerHandle } from "../src/server.js";

const dirs: string[] = [];
const servers: LocalRuntimeServerHandle[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it("imports through the production human mount and reopens the exact scan after restart", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-evidence-journey-")); dirs.push(cwd);
  const rootDir = join(cwd, "workspace");
  createPortableWorkspace({ rootDir, workspaceId: "ws_journey", label: "Synthetic", createdBy: "test", createdAt: "2026-09-05T00:00:00.000Z" });
  new SQLiteEventLedger(join(rootDir, "ledger/ontology.sqlite")).close();
  const sourceRoot = join(cwd, "selected"); mkdirSync(sourceRoot);
  writeFileSync(join(sourceRoot, "record.txt"), "The cobalt lantern connects the two records.\n");
  writeFileSync(join(sourceRoot, "duplicate.txt"), "The cobalt lantern connects the two records.\n");
  const base = resolveLocalRuntimeConfig({ cwd, env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: rootDir, CESTUS_LOCAL_AUTH_TOKEN: "synthetic-test-credential" } });
  const config = { ...base, operator: { id: "operator_test", kind: "human" as const, label: "Synthetic operator" }, http: { ...base.http, port: 0 } };
  async function start() {
    const server = await startLocalRuntimeServer({ config }); servers.push(server);
    const address = server.server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
    const origin = `http://127.0.0.1:${address.port}`;
    async function request(path: string, body?: unknown, status = 200) {
      const response = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${config.http.authToken}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      expect(response.status).toBe(status);
      return response.json();
    }
    return { server, origin, request };
  }
  const active = await start();
  expect(await active.request("/api/ingestion/workspace")).toMatchObject({ mounted: true, capabilities: { canWriteBlobs: true } });
  expect(await active.request("/api/ingestion/sources", { sourceCollectionId: "src_journey", label: "Selected synthetic records", rootUri: pathToFileURL(sourceRoot).href, sourceRoot })).toMatchObject({ ok: true });
  expect(await active.request("/api/ingestion/scans/dry-run", { sourceCollectionId: "src_journey", scanBatchId: "scan_journey" })).toMatchObject({ ok: true });
  const batch = { sourceCollectionId: "src_journey", scanBatchId: "scan_journey", importBatchId: "imp_journey" };
  expect(await active.request("/api/ingestion/imports/approve", batch)).toMatchObject({ ok: true });
  expect(await active.request("/api/ingestion/imports/run", batch)).toMatchObject({ ok: true, totals: { occurrencesLinked: 2 } });
  await active.server.close();
  const restarted = await start();
  expect(await restarted.request("/api/ingestion/review?sourceCollectionId=src_journey")).toMatchObject({ ok: true });
  const evidence = await restarted.request("/api/evidence/workspace");
  expect(evidence.items).toHaveLength(1);
  expect(evidence.items[0].occurrences).toHaveLength(2);
  expect((await fetch(restarted.origin + `/api/evidence/${evidence.items[0].evidenceId}/content`)).status).toBe(401);
  expect(await restarted.request("/api/ingestion/parse/run", { sourceCollectionId: "src_journey" })).toMatchObject({ ok: true });
  const content = await restarted.request(`/api/evidence/${evidence.items[0].evidenceId}/content`);
  expect(content.extraction.text).toContain("cobalt lantern");
  const found = await restarted.request("/api/evidence/search?q=cobalt%20lantern&limit=1");
  expect(found.total).toBe(1);
  expect(found.results[0]).toMatchObject({ evidenceId: evidence.items[0].evidenceId, passageIndex: 0 });
  const original = await restarted.request(`/api/evidence/${evidence.items[0].evidenceId}/original`);
  expect(Buffer.from(original.base64, "base64").toString()).toContain("cobalt lantern");
  expect(await restarted.request("/api/evidence/initial-classification", { evidenceRef: evidence.items[0].evidenceId, tag: "public_safe", rationale: "Human-reviewed synthetic records suitable for protocol evaluation" }, 201)).toMatchObject({ ok: true });
  expect((await restarted.request("/api/evidence/workspace")).items[0].governanceTags).toEqual(expect.arrayContaining([expect.objectContaining({ tag: "public_safe", source: "human" })]));
  writeFileSync(join(sourceRoot, "record.txt"), "The changed record describes a silver observatory.");
  const changedBatch = { sourceCollectionId: "src_journey", scanBatchId: "scan_changed", importBatchId: "imp_changed" };
  expect(await restarted.request("/api/ingestion/scans/dry-run", { sourceCollectionId: "src_journey", scanBatchId: "scan_changed" })).toMatchObject({ ok: true });
  expect(await restarted.request("/api/ingestion/imports/approve", changedBatch)).toMatchObject({ ok: true });
  expect(await restarted.request("/api/ingestion/imports/run", changedBatch)).toMatchObject({ ok: true });
  await restarted.request("/api/ingestion/parse/run", {});
  const oldCitationPath = `/api/evidence/${evidence.items[0].evidenceId}/content?extractionId=${content.extraction.extractionId}`;
  expect((await restarted.request(oldCitationPath)).extraction.text).toContain("cobalt lantern");
  expect((await restarted.request("/api/evidence/search?q=silver%20observatory")).total).toBe(1);
  expect((await restarted.request("/api/evidence/search?q=cobalt%20lantern&format=csv")).total).toBe(0);
  expect((await fetch(restarted.origin + `/api/evidence/${evidence.items[0].contentHash}/original`, { headers: { authorization: `Bearer ${config.http.authToken}` } })).status).toBe(404);
  await restarted.server.close();
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  await new GovernanceService({ ledger, actor: config.operator }).quarantineEvidence({ evidenceId: evidence.items[0].evidenceId, quarantineId: "quarantine_test", quarantinedBy: config.operator.id, reason: "Synthetic governance denial", lockLevel: "all" });
  ledger.close();
  const restricted = await start();
  for (const path of [oldCitationPath, `/api/evidence/${evidence.items[0].evidenceId}/original`]) {
    expect((await fetch(restricted.origin + path, { headers: { authorization: `Bearer ${config.http.authToken}` } })).status).toBe(403);
  }
  expect((await restricted.request("/api/evidence/search?q=cobalt%20lantern")).results).toEqual([]);
  expect((await fetch(restricted.origin + "/api/document-processing/preview", { method: "POST", headers: { authorization: `Bearer ${config.http.authToken}`, "content-type": "application/json" }, body: JSON.stringify({ selection: { evidenceId: evidence.items[0].evidenceId, extractionId: content.extraction.extractionId, passageIndexes: [0] }, budgetUsd: 0.01 }) })).status).toBe(409);
});


it("withholds an original PDF when its verified extraction detects credentials while preserving unextracted recovery", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-original-governance-")); dirs.push(cwd);
  const rootDir = join(cwd, "workspace");
  createPortableWorkspace({ rootDir, workspaceId: "ws_original", label: "Synthetic", createdBy: "test", createdAt: "2026-09-05T00:00:00.000Z" });
  new SQLiteEventLedger(join(rootDir, "ledger/ontology.sqlite")).close();
  const sourceRoot = join(cwd, "selected"); mkdirSync(sourceRoot);
  writeFileSync(join(sourceRoot, "record.pdf"), syntheticPdf(["Authorization: Bearer syntheticSecretValue1234567890"]));
  const base = resolveLocalRuntimeConfig({ cwd, env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: rootDir, CESTUS_LOCAL_AUTH_TOKEN: "synthetic-test-credential" } });
  const config = { ...base, operator: { id: "operator_test", kind: "human" as const, label: "Synthetic operator" }, http: { ...base.http, port: 0 } };
  const server = await startLocalRuntimeServer({ config }); servers.push(server);
  const address = server.server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
  async function request(path: string, body?: unknown, status = 200) {
    const response = await fetch(`http://127.0.0.1:${(address as { port: number }).port}${path}`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${config.http.authToken}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    expect(response.status).toBe(status); return response.json();
  }
  await request("/api/ingestion/sources", { sourceCollectionId: "src_original", label: "Synthetic PDF", rootUri: pathToFileURL(sourceRoot).href, sourceRoot });
  await request("/api/ingestion/scans/dry-run", { sourceCollectionId: "src_original", scanBatchId: "scan_original" });
  const batch = { sourceCollectionId: "src_original", scanBatchId: "scan_original", importBatchId: "imp_original" };
  await request("/api/ingestion/imports/approve", batch); await request("/api/ingestion/imports/run", batch);
  const evidence = (await request("/api/evidence/workspace")).items[0];
  expect((await request(`/api/evidence/${evidence.evidenceId}/original`)).base64).toBeTruthy();
  await request("/api/ingestion/parse/run", {});
  await request(`/api/evidence/${evidence.evidenceId}/content`, undefined, 403);
  await request(`/api/evidence/${evidence.evidenceId}/original`, undefined, 403);
});
