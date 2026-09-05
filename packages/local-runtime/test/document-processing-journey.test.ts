import { once } from "node:events";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { startLocalRuntimeServer, type LocalRuntimeServerHandle } from "../src/server.js";

const directories: string[] = [];
const runtimes: LocalRuntimeServerHandle[] = [];
const upstreams: Server[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const upstream of upstreams.splice(0)) {
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

it("gates real production document transfer, preserves exact approval, and reopens its result after restart (synthetic loopback protocol)", async () => {
  const bodies: string[] = [];
  const upstream = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      bodies.push(Buffer.concat(chunks).toString("utf8"));
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          summary: "The synthetic record links the two incidents.",
          citations: [{ passageIndex: 0, quote: "cobalt lantern" }]
        }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 45 }
      }));
    });
  });
  upstreams.push(upstream);
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const upstreamAddress = upstream.address();
  if (!upstreamAddress || typeof upstreamAddress === "string") throw new Error("Synthetic upstream failed to bind");
  const endpoint = `http://127.0.0.1:${upstreamAddress.port}/v1/chat/completions`;
  vi.stubEnv("CESTUS_DOCUMENT_PROVIDER_ENDPOINT", endpoint);
  vi.stubEnv("CESTUS_DOCUMENT_PROVIDER_MODEL", "synthetic-http-protocol-model");
  vi.stubEnv("CESTUS_DOCUMENT_PROVIDER_API_KEY", "synthetic-http-protocol-value");
  vi.stubEnv("CESTUS_DOCUMENT_PROVIDER_INPUT_USD_PER_MILLION", "1");
  vi.stubEnv("CESTUS_DOCUMENT_PROVIDER_OUTPUT_USD_PER_MILLION", "2");

  const cwd = mkdtempSync(join(tmpdir(), "cestus-processing-journey-"));
  directories.push(cwd);
  const rootDir = join(cwd, "workspace");
  createPortableWorkspace({ rootDir, workspaceId: "ws_processing_journey", label: "Synthetic document protocol", createdBy: "test", createdAt: "2026-09-05T00:00:00.000Z" });
  new SQLiteEventLedger(join(rootDir, "ledger/ontology.sqlite")).close();
  const sourceRoot = join(cwd, "selected");
  mkdirSync(sourceRoot);
  writeFileSync(join(sourceRoot, "record.txt"), "The cobalt lantern connects the two incidents.\n");
  const base = resolveLocalRuntimeConfig({ cwd, env: {
    CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: rootDir,
    CESTUS_LOCAL_AUTH_TOKEN: "synthetic-http-session-value"
  } });
  const config = { ...base, operator: { id: "operator_processing_test", kind: "human" as const, label: "Synthetic reviewer" }, http: { ...base.http, port: 0 } };
  async function start() {
    const runtime = await startLocalRuntimeServer({ config });
    runtimes.push(runtime);
    const address = runtime.server.address();
    if (!address || typeof address === "string") throw new Error("Production runtime failed to bind");
    const origin = `http://127.0.0.1:${address.port}`;
    async function request(path: string, body?: unknown, status = 200) {
      const response = await fetch(origin + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { authorization: `Bearer ${config.http.authToken}`, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const result = await response.json();
      expect(response.status, JSON.stringify(result)).toBe(status);
      return result;
    }
    return { runtime, origin, request };
  }
  const active = await start();
  expect(await active.request("/api/document-processing/readiness")).toMatchObject({ ready: true, destination: { endpoint, model: "synthetic-http-protocol-model" } });
  await active.request("/api/ingestion/sources", { sourceCollectionId: "src_processing", label: "Selected synthetic records", rootUri: pathToFileURL(sourceRoot).href, sourceRoot });
  await active.request("/api/ingestion/scans/dry-run", { sourceCollectionId: "src_processing", scanBatchId: "scan_processing" });
  const batch = { sourceCollectionId: "src_processing", scanBatchId: "scan_processing", importBatchId: "imp_processing" };
  await active.request("/api/ingestion/imports/approve", batch);
  await active.request("/api/ingestion/imports/run", batch);
  await active.request("/api/ingestion/parse/run", { sourceCollectionId: "src_processing" });
  const evidence = await active.request("/api/evidence/workspace");
  expect(evidence.items).toHaveLength(1);
  const evidenceId: string = evidence.items[0].evidenceId;
  const content = await active.request(`/api/evidence/${evidenceId}/content`);
  const selection = { evidenceId, extractionId: content.extraction.extractionId as string, passageIndexes: [0] };
  const previewInput = { selection, budgetUsd: 0.01 };
  await active.request("/api/document-processing/preview", previewInput, 409);
  expect(bodies).toHaveLength(0);
  await active.request("/api/evidence/initial-classification", { evidenceRef: evidenceId, tag: "public_safe", rationale: "Human-reviewed synthetic evidence for explicit protocol evaluation" }, 201);
  const first = await active.request("/api/document-processing/preview", previewInput);
  expect(first.manifest.resolved.passages[0].text).toContain("cobalt lantern");
  await active.request(`/api/document-processing/jobs/${first.invocationId}/run`, {}, 409);
  expect(bodies).toHaveLength(0);
  await active.request("/api/document-processing/approve", { manifestHash: first.manifestHash });
  await active.request("/api/evidence/governance-reviews", { evidenceRef: evidenceId, tag: "export_restricted", action: "add", rationale: "Synthetic review exercises transfer revocation" }, 201);
  await active.request(`/api/document-processing/jobs/${first.invocationId}/run`, {}, 409);
  expect(bodies).toHaveLength(0);
  await active.request("/api/evidence/governance-reviews", { evidenceRef: evidenceId, tag: "export_restricted", action: "remove", rationale: "Synthetic restriction resolved after human review" }, 201);
  // Removing a restriction does not make the earlier approval current again.
  await active.request(`/api/document-processing/jobs/${first.invocationId}/run`, {}, 409);
  expect(bodies).toHaveLength(0);
  const fresh = await active.request("/api/document-processing/preview", previewInput);
  expect(fresh.manifestHash).not.toBe(first.manifestHash);
  await active.request("/api/document-processing/approve", { manifestHash: fresh.manifestHash });
  expect(await active.request(`/api/document-processing/jobs/${fresh.invocationId}/run`, {})).toMatchObject({ state: "completed" });
  const outputPath = `/api/document-processing/jobs/${fresh.invocationId}/output`;
  const output = await active.request(outputPath);
  expect(output).toMatchObject({ invocationId: fresh.invocationId, evidenceId, proposalState: "unreviewed", output: { citations: [{ passageIndex: 0, quote: "cobalt lantern" }] } });
  expect(bodies).toHaveLength(1);
  expect(JSON.parse(bodies[0]!)).toMatchObject({ model: "synthetic-http-protocol-model", max_tokens: 512 });
  expect(bodies[0]).toContain("cobalt lantern");
  await active.request(`/api/document-processing/jobs/${fresh.invocationId}/run`, {}, 409);
  expect(bodies).toHaveLength(1);
  await active.runtime.close();
  const restarted = await start();
  expect(await restarted.request(outputPath)).toEqual(output);
  expect(await restarted.request(`/api/document-processing/jobs/${fresh.invocationId}/preview`)).toMatchObject({ invocationId: fresh.invocationId, manifestHash: fresh.manifestHash });
  expect((await restarted.request("/api/document-processing/jobs")).jobs).toEqual(expect.arrayContaining([expect.objectContaining({ invocationId: fresh.invocationId, state: "completed" })]));
  await restarted.request(`/api/document-processing/jobs/${fresh.invocationId}/run`, {}, 409);
  expect(bodies).toHaveLength(1);
  expect((await fetch(restarted.origin + outputPath)).status).toBe(401);
});
