import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import {
  createLocalRuntimeHttpHandler,
  type CreateLocalRuntimeHttpHandlerInput,
  type LocalRuntimeHttpHandler
} from "../src/http-handler.js";

const actor = {
  id: "actor_local_runtime_test",
  kind: "human",
  label: "Local Runtime Test"
} as const;
const fixedNow = () => "2026-07-05T12:00:00.000Z";
const tempDirs: string[] = [];
const handlers: LocalRuntimeHttpHandler[] = [];

afterEach(() => {
  for (const handler of handlers.splice(0)) {
    handler.close();
  }

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("createLocalRuntimeHttpHandler", () => {
  it("loads an empty workspace from an empty SQLite ledger", async () => {
    const cwd = tempDir();
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({ cwd, env: {} }),
      actor,
      now: fixedNow
    });

    const response = await handler({ method: "GET", url: "/api/requests/workspace" });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      generatedAt: "2026-07-05T12:00:00.000Z",
      cards: [],
      requestDetails: []
    });
  });

  it("creates a draft through HTTP and replays it after SQLite reopen", async () => {
    const cwd = tempDir();
    const config = resolveLocalRuntimeConfig({ cwd, env: {} });
    const first = testHandler({
      config,
      actor,
      now: fixedNow,
      requestIdFactory: () => "prr_http_city_budget"
    });

    const created = await first({
      method: "POST",
      url: "/api/requests/drafts",
      body: JSON.stringify({
        jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
        agency: { name: "City Clerk", email: "clerk@example.gov" },
        requester: { name: "Avery Investigator", email: "avery@example.org" },
        requestText: "All budget amendment memos from January 2026.",
        receivedAt: "2026-07-05T12:00:00.000Z"
      })
    });

    expect(created.status).toBe(200);
    const createdBody = JSON.parse(created.body);
    expect(createdBody).toMatchObject({
      ok: true,
      prrRequestId: "prr_http_city_budget"
    });
    expect(
      createdBody.workspace.cards.some(
        (card: { prrRequestId: string }) => card.prrRequestId === "prr_http_city_budget"
      )
    ).toBe(true);
    first.close();
    handlers.splice(handlers.indexOf(first), 1);

    const second = testHandler({ config, actor, now: fixedNow });
    const reloaded = await second({ method: "GET", url: "/api/requests/workspace" });
    expect(JSON.parse(reloaded.body).cards.map((card: { prrRequestId: string }) => card.prrRequestId)).toContain(
      "prr_http_city_budget"
    );
  });

  it("returns safe JSON for invalid request bodies", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} }),
      actor,
      now: fixedNow
    });

    const response = await handler({
      method: "POST",
      url: "/api/requests/drafts",
      body: "{not json"
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Request body must be valid JSON.",
        allowedRepairActions: ["send a valid JSON request body"]
      }
    });
  });

  it("returns a draft body diagnostic for valid JSON with an invalid shape", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} }),
      actor,
      now: fixedNow
    });

    const response = await handler({
      method: "POST",
      url: "/api/requests/drafts",
      body: JSON.stringify({
        jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
        agency: null,
        requester: { name: "Avery Investigator", email: "avery@example.org" },
        requestText: "All budget amendment memos from January 2026.",
        receivedAt: "2026-07-05T12:00:00.000Z"
      })
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Draft request body is invalid.",
        allowedRepairActions: [
          "send agency, requester, jurisdiction, request text, and received timestamp"
        ]
      }
    });
  });

  it("rejects invalid receivedAt values without persisting a draft", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} }),
      actor,
      now: fixedNow,
      requestIdFactory: () => "prr_bad_received_at"
    });

    const response = await handler({
      method: "POST",
      url: "/api/requests/drafts",
      body: JSON.stringify({
        jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
        agency: { name: "City Clerk", email: "clerk@example.gov" },
        requester: { name: "Avery Investigator", email: "avery@example.org" },
        requestText: "All budget amendment memos from January 2026.",
        receivedAt: "not-a-date"
      })
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual(invalidDraftRequestBodyDiagnostic());

    const workspace = await handler({ method: "GET", url: "/api/requests/workspace" });
    expect(
      JSON.parse(workspace.body).cards.some(
        (card: { prrRequestId: string }) => card.prrRequestId === "prr_bad_received_at"
      )
    ).toBe(false);
  });

  it("rejects invalid deadline estimate kinds without persisting a draft", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} }),
      actor,
      now: fixedNow,
      requestIdFactory: () => "prr_bad_deadline_kind"
    });

    const response = await handler({
      method: "POST",
      url: "/api/requests/drafts",
      body: JSON.stringify({
        jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
        agency: { name: "City Clerk", email: "clerk@example.gov" },
        requester: { name: "Avery Investigator", email: "avery@example.org" },
        requestText: "All budget amendment memos from January 2026.",
        receivedAt: "2026-07-05T12:00:00.000Z",
        deadlineEstimateKind: "bogus"
      })
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual(invalidDraftRequestBodyDiagnostic());

    const workspace = await handler({ method: "GET", url: "/api/requests/workspace" });
    expect(
      JSON.parse(workspace.body).cards.some(
        (card: { prrRequestId: string }) => card.prrRequestId === "prr_bad_deadline_kind"
      )
    ).toBe(false);
  });

  it("rejects unsupported jurisdiction packs without persisting a draft", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} }),
      actor,
      now: fixedNow,
      requestIdFactory: () => "prr_bad_pack"
    });

    const response = await handler({
      method: "POST",
      url: "/api/requests/drafts",
      body: JSON.stringify({
        jurisdictionPack: { name: "unsupported-public-records", version: "9.9.9" },
        agency: { name: "City Clerk", email: "clerk@example.gov" },
        requester: { name: "Avery Investigator", email: "avery@example.org" },
        requestText: "All budget amendment memos from January 2026.",
        receivedAt: "2026-07-05T12:00:00.000Z"
      })
    });

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      ok: false,
      failedStep: "validate-input",
      committedEventIds: [],
      diagnostic: {
        message: "Unsupported jurisdiction pack",
        allowedRepairActions: ["choose a supported jurisdiction pack"]
      },
      workspace: { cards: [] }
    });

    const workspace = await handler({ method: "GET", url: "/api/requests/workspace" });
    expect(
      JSON.parse(workspace.body).cards.some(
        (card: { prrRequestId: string }) => card.prrRequestId === "prr_bad_pack"
      )
    ).toBe(false);
  });

  it("rejects short agency phone values without persisting a draft", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} }),
      actor,
      now: fixedNow,
      requestIdFactory: () => "prr_bad_phone"
    });

    const response = await handler({
      method: "POST",
      url: "/api/requests/drafts",
      body: JSON.stringify({
        jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
        agency: { name: "City Clerk", email: "clerk@example.gov", phone: "x" },
        requester: { name: "Avery Investigator", email: "avery@example.org" },
        requestText: "All budget amendment memos from January 2026.",
        receivedAt: "2026-07-05T12:00:00.000Z"
      })
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual(invalidDraftRequestBodyDiagnostic());

    const workspace = await handler({ method: "GET", url: "/api/requests/workspace" });
    expect(
      JSON.parse(workspace.body).cards.some(
        (card: { prrRequestId: string }) => card.prrRequestId === "prr_bad_phone"
      )
    ).toBe(false);
  });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-local-runtime-"));
  tempDirs.push(dir);
  return dir;
}

function testHandler(input: CreateLocalRuntimeHttpHandlerInput): LocalRuntimeHttpHandler {
  const handler = createLocalRuntimeHttpHandler(input);
  handlers.push(handler);
  return handler;
}

function invalidDraftRequestBodyDiagnostic() {
  return {
    ok: false,
    diagnostic: {
      message: "Draft request body is invalid.",
      allowedRepairActions: ["send agency, requester, jurisdiction, request text, and received timestamp"]
    }
  };
}
