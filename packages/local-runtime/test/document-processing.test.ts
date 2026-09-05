import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createDocumentProcessingService } from "../src/document-processing.js";
import type { ResolvedDocumentSelection } from "../../ontology/src/document-processing-contracts.js";

const actor = { id: "actor_document_reviewer", kind: "human", label: "Document reviewer" } as const;
const selection = { evidenceId: "ev_synthetic_document", extractionId: "extract_synthetic_v1", passageIndexes: [0] };
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });

// The loopback endpoint is a protocol fixture, never live-provider acceptance.
async function fixture(options: { delay?: number; timeout?: number; content?: string; usage?: { prompt_tokens: number; completion_tokens: number }; respond?: (response: ServerResponse) => void } = {}) {
  let requests = 0;
  let lastBody = "";
  const server: Server = createServer((request, response) => {
    requests++;
    request.on("data", (chunk: Buffer) => { lastBody += chunk.toString(); });
    request.on("end", () => {
      const send = () => {
        if (options.respond) { options.respond(response); return; }
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ choices: [{ message: { content: options.content ?? JSON.stringify({ summary: "The violet bridge was closed.", citations: [{ passageIndex: 0, quote: "violet bridge" }] }) } }], usage: options.usage ?? { prompt_tokens: 100, completion_tokens: 40 } }));
      };
      if (options.delay) { const timer = setTimeout(send, options.delay); timer.unref(); } else send();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Loopback fixture did not bind");
  const root = await mkdtemp(join(tmpdir(), "cestus-processing-test-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const ledgerPath = join(root, "events.sqlite");
  let ledger = new SQLiteEventLedger(ledgerPath);
  cleanup.push(async () => ledger.close());
  const derivativeStore = new FileBlobStore(root);
  let resolved: ResolvedDocumentSelection = {
    evidenceId: selection.evidenceId, extractionId: selection.extractionId,
    sourceHash: `sha256:${"a".repeat(64)}`, extractionHash: `sha256:${"b".repeat(64)}`,
    policyRevision: "policy_revision_1", classification: "public_safe",
    classificationEventId: "evt_classification", reviewEventId: "evt_review",
    passages: [{ index: 0, text: "The violet bridge was closed in March.", locator: { page: 1, block: 0 } }]
  };
  let allowed = true;
  const env = {
    CESTUS_DOCUMENT_PROVIDER_ENDPOINT: `http://127.0.0.1:${address.port}/v1/chat/completions`,
    CESTUS_DOCUMENT_PROVIDER_MODEL: "synthetic-protocol-model",
    CESTUS_DOCUMENT_PROVIDER_API_KEY: "synthetic-only-value",
    CESTUS_DOCUMENT_PROVIDER_INPUT_USD_PER_MILLION: "1",
    CESTUS_DOCUMENT_PROVIDER_OUTPUT_USD_PER_MILLION: "2"
  };
  const dependencies = { ledger, derivativeStore, env, timeoutMs: options.timeout ?? 2000,
    resolveSelection: async () => { if (!allowed) throw new Error("Denied"); return structuredClone(resolved); } };
  const service = createDocumentProcessingService(dependencies);
  return { service, ledger, ledgerPath, env, dependencies,
    reopenLedger: () => { ledger.close(); ledger = new SQLiteEventLedger(ledgerPath); dependencies.ledger = ledger; },
    requestCount: () => requests, requestBody: () => lastBody,
    revoke: () => { allowed = false; },
    change: () => { resolved = { ...resolved, policyRevision: "policy_revision_2" }; },
    approve: async () => { const preview = await service.preview({ selection, budgetUsd: 0.05 }, actor); await service.approve({ manifestHash: preview.manifestHash }, actor); return preview; }
  };
}

describe("bounded external document processing (synthetic loopback protocol tests)", () => {
  it("fails closed without explicit configuration and exposes no credential in readiness", async () => {
    const f = await fixture();
    expect(JSON.stringify(f.service.readiness())).not.toContain(f.env.CESTUS_DOCUMENT_PROVIDER_API_KEY);
    f.env.CESTUS_DOCUMENT_PROVIDER_ENDPOINT = "https://example.test/v1?key=hidden";
    expect(f.service.readiness().ready).toBe(false);
    await expect(f.service.preview({ selection, budgetUsd: 0.05 }, actor)).rejects.toThrow();
    expect(f.requestCount()).toBe(0);
  });
  it("rejects unapproved and tampered approvals with zero requests and keeps selected text out of ledger", async () => {
    const f = await fixture();
    const preview = await f.service.preview({ selection, budgetUsd: 0.05 }, actor);
    expect(JSON.stringify(await f.ledger.readAll())).not.toContain("violet bridge");
    await expect(f.service.run(preview.invocationId, actor)).rejects.toThrow(/queued/);
    await expect(f.service.approve({ manifestHash: `sha256:${"c".repeat(64)}` }, actor)).rejects.toThrow();
    await expect(f.service.approve({ manifestHash: preview.manifestHash }, { ...actor, id: "actor_other" })).rejects.toThrow();
    expect(f.requestCount()).toBe(0);
  });
  it("revalidates changed policy and selection immediately before transfer with zero requests", async () => {
    const f = await fixture();
    const preview = await f.approve();
    f.change();
    await expect(f.service.run(preview.invocationId, actor)).rejects.toThrow(/changed/);
    expect(f.requestCount()).toBe(0);
  });
  it("rejects a policy change at the final transport gate after claiming running", async () => {
    const f = await fixture();
    const preview = await f.approve();
    const resolve = f.dependencies.resolveSelection;
    let resolutions = 0;
    f.dependencies.resolveSelection = async () => {
      if (++resolutions === 3) f.change();
      return resolve();
    };
    expect(await f.service.run(preview.invocationId, actor)).toMatchObject({ state: "failed", reason: "selection-or-authority-changed" });
    expect(f.requestCount()).toBe(0);
  });
  it("produces one validated cited derivative and never runs the same approval twice", async () => {
    const f = await fixture();
    const preview = await f.approve();
    expect(await f.service.run(preview.invocationId, actor)).toMatchObject({ state: "completed" });
    expect(await f.service.output(preview.invocationId, actor)).toMatchObject({ proposalState: "unreviewed", output: { citations: [{ passageIndex: 0, quote: "violet bridge" }] } });
    expect(JSON.parse(f.requestBody())).toMatchObject({ model: "synthetic-protocol-model", max_tokens: 512 });
    await expect(f.service.run(preview.invocationId, actor)).rejects.toThrow();
    expect(f.requestCount()).toBe(1);
    expect((await f.ledger.readAll()).filter((event) => event.type === "document.processing.state.changed" && event.payload.state === "completed")).toHaveLength(1);
    f.revoke();
    await expect(f.service.output(preview.invocationId, actor)).rejects.toThrow();
    expect(await f.service.list(actor)).toEqual([]);
  });
  it.each(["previewDetails", "output"] as const)("denies %s when authority is revoked during the derivative read", async (method) => {
    const f = await fixture();
    const preview = await f.approve();
    expect(await f.service.run(preview.invocationId, actor)).toMatchObject({ state: "completed" });
    expect(JSON.stringify(await f.service[method](preview.invocationId, actor))).toContain("violet bridge");
    const read = f.dependencies.derivativeStore.get.bind(f.dependencies.derivativeStore);
    let reads = 0;
    f.dependencies.derivativeStore.get = async (contentHash) => {
      const bytes = await read(contentHash);
      reads++;
      f.revoke();
      return bytes;
    };
    await expect(f.service[method](preview.invocationId, actor)).rejects.toThrow("Denied");
    expect(reads).toBe(1);
    expect(f.requestCount()).toBe(1);
  });
  it("preserves uncertain timeout and does not resubmit after service restart", async () => {
    const f = await fixture({ delay: 300, timeout: 50 });
    const preview = await f.approve();
    expect(await f.service.run(preview.invocationId, actor)).toMatchObject({ state: "uncertain" });
    f.reopenLedger();
    const restarted = createDocumentProcessingService(f.dependencies);
    await restarted.recoverInterrupted();
    await expect(restarted.run(preview.invocationId, actor)).rejects.toThrow();
    const retry = await restarted.preview({ selection, budgetUsd: 0.05, retryOf: preview.invocationId }, actor);
    expect(retry.warning).toContain("potentially billable");
    expect(retry.invocationId).not.toBe(preview.invocationId);
    expect(f.requestCount()).toBe(1);
    expect(await restarted.output(preview.invocationId, actor).catch(() => null)).toBeNull();
  });
  it("recovers a persisted running claim as uncertain, without a request", async () => {
    const f = await fixture();
    const preview = await f.approve();
    await f.ledger.append({ type: "document.processing.state.changed", version: 1, streamId: `document_processing_${preview.invocationId}`,
      payload: { invocationId: preview.invocationId, state: "running", reason: "submission-started" },
      context: { actor, occurredAt: new Date().toISOString(), correlationId: preview.invocationId, coreVersion: "0.1.0", packVersions: {} } });
    f.reopenLedger();
    const restarted = createDocumentProcessingService(f.dependencies);
    await restarted.recoverInterrupted();
    expect(await restarted.get(preview.invocationId, actor)).toMatchObject({ state: "uncertain", reason: "interrupted" });
    await restarted.recoverInterrupted();
    expect((await f.dependencies.ledger.readAll()).filter((event) => event.type === "document.processing.state.changed")).toHaveLength(2);
    expect(f.requestCount()).toBe(0);
  });
  it("cancels queued work without transfer and in-flight work without claiming provider cancellation", async () => {
    const f = await fixture({ delay: 300 });
    const queued = await f.approve();
    expect(await f.service.cancel(queued.invocationId, actor)).toMatchObject({ state: "canceled" });
    expect(f.requestCount()).toBe(0);
    const active = await f.approve();
    const running = f.service.run(active.invocationId, actor);
    await expect.poll(f.requestCount).toBe(1);
    expect(await f.service.cancel(active.invocationId, actor)).toMatchObject({ state: "uncertain" });
    expect(await running).toMatchObject({ state: "uncertain" });
  });
  it("enforces one concurrent running claim across service instances", async () => {
    const f = await fixture({ delay: 300 });
    const first = await f.approve();
    const second = await f.approve();
    const running = f.service.run(first.invocationId, actor);
    await expect.poll(f.requestCount).toBe(1);
    await expect(createDocumentProcessingService(f.dependencies).run(second.invocationId, actor)).rejects.toThrow(/Concurrency/);
    await f.service.cancel(first.invocationId, actor);
    await running;
    expect(f.requestCount()).toBe(1);
  });
  it.each([
    { name: "authorization rejection", status: 401, body: "private provider diagnostic", state: "failed" },
    { name: "rate rejection", status: 429, body: "private provider diagnostic", state: "failed" },
    { name: "malformed complete JSON", status: 200, body: "{broken", state: "failed" },
    { name: "invalid completed envelope", status: 200, body: "{}", state: "failed" },
    { name: "missing usage", status: 200, body: JSON.stringify({ choices: [{ message: { content: "output" } }] }), state: "failed" },
    { name: "server error", status: 500, body: "private provider diagnostic", state: "uncertain" },
    { name: "request timeout status", status: 408, body: "private provider diagnostic", state: "uncertain" },
    { name: "accepted async status", status: 202, body: "{}", state: "uncertain" },
    { name: "partial content status", status: 206, body: "{}", state: "uncertain" }
  ])("records $name honestly through the production service and HTTP transport", async ({ status, body, state }) => {
    const f = await fixture({ respond: (response) => { response.statusCode = status; response.end(body); } });
    const preview = await f.approve();
    expect(await f.service.run(preview.invocationId, actor)).toMatchObject({ state, reason: state === "uncertain" ? "submission-uncertain" : status === 200 ? "invalid-output" : "provider-rejected" });
    expect(JSON.stringify(await f.ledger.readAll())).not.toContain("private provider diagnostic");
    await expect(f.service.output(preview.invocationId, actor)).rejects.toThrow();
    f.reopenLedger();
    const restarted = createDocumentProcessingService(f.dependencies);
    await restarted.recoverInterrupted();
    expect(await restarted.get(preview.invocationId, actor)).toMatchObject({ state });
    await expect(restarted.run(preview.invocationId, actor)).rejects.toThrow();
    const retry = await restarted.preview({ selection, budgetUsd: 0.05, retryOf: preview.invocationId }, actor);
    expect(retry.warning).toContain("potentially billable");
    await expect(restarted.run(retry.invocationId, actor)).rejects.toThrow();
    expect(f.requestCount()).toBe(1);
  });
  it.each(["disconnect", "truncated-body", "oversized-body"] as const)("preserves unknown completion after %s", async (mode) => {
    const f = await fixture({ respond: (response) => {
      if (mode === "disconnect") { response.destroy(); return; }
      if (mode === "truncated-body") {
        response.setHeader("content-length", "2000");
        response.write("{broken");
        setTimeout(() => response.destroy(), 10).unref();
        return;
      }
      response.end("x".repeat(300_000));
    } });
    const preview = await f.approve();
    expect(await f.service.run(preview.invocationId, actor)).toMatchObject({ state: "uncertain", reason: "submission-uncertain" });
    await expect(f.service.run(preview.invocationId, actor)).rejects.toThrow();
    expect(f.requestCount()).toBe(1);
  });
  it("rejects fabricated citations and excessive reported usage without publishing output", async () => {
    for (const options of [
      { content: JSON.stringify({ summary: "Invented", citations: [{ passageIndex: 9, quote: "invented" }] }) },
      { usage: { prompt_tokens: 100, completion_tokens: 50000 } }
    ]) {
      const f = await fixture(options);
      const preview = await f.approve();
      expect(await f.service.run(preview.invocationId, actor)).toMatchObject({ state: "failed" });
      await expect(f.service.output(preview.invocationId, actor)).rejects.toThrow();
      expect(f.requestCount()).toBe(1);
    }
  });
  it("rejects insufficient budget, duplicate selection and non-human approval before transfer", async () => {
    const f = await fixture();
    await expect(f.service.preview({ selection, budgetUsd: 0.000001 }, actor)).rejects.toThrow(/cap/);
    await expect(f.service.preview({ selection: { ...selection, passageIndexes: [0, 0] }, budgetUsd: 0.05 }, actor)).rejects.toThrow();
    await expect(f.service.preview({ selection, budgetUsd: 0.05 }, { ...actor, kind: "agent" })).rejects.toThrow(/human/);
    expect(f.requestCount()).toBe(0);
  });
});
