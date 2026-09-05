import { createAuthenticatedTestHandler as createLocalRuntimeHttpHandler } from "./support/authenticated-handler.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalRuntimeConfig, type ResolvedLocalRuntimeConfig } from "../src/config.js";
import {
  type CreateLocalRuntimeHttpHandlerInput,
  type LocalRuntimeHttpHandler
} from "../src/http-handler.js";
import { createSqlitePrrRuntime } from "../src/runtime-factory.js";

const actor = {
  id: "actor_auth_seed_test",
  kind: "human",
  label: "Auth Seed Test"
} as const;
const fixedNow = "2026-07-05T13:00:00.000Z";
const tempDirs: string[] = [];
const handlers: LocalRuntimeHttpHandler[] = [];

afterEach(async () => {
  try {
    for (const handler of handlers.splice(0)) {
      await handler.close();
    }
  } finally {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("local runtime auth and explicit seed", () => {
  it("keeps health public and secret-free in an auth-required tailnet config", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({
        cwd: tempDir(),
        env: {
          CESTUS_LOCAL_BIND: "tailnet",
          CESTUS_LOCAL_HOST: "100.126.143.105",
          CESTUS_LOCAL_AUTH_TOKEN: "secret-local-token"
        }
      }),
      actor,
      now: fixedNow
    });

    const response = await handler({ method: "GET", url: "/api/health" });

    expect(response.status).toBe(200);
    expect(response.body).not.toContain("secret-local-token");
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      bindMode: "tailnet",
      authRequired: true
    });
  });

  it("requires bearer auth for non-loopback Requests routes", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({
        cwd: tempDir(),
        env: {
          CESTUS_LOCAL_BIND: "tailnet",
          CESTUS_LOCAL_HOST: "100.126.143.105",
          CESTUS_LOCAL_AUTH_TOKEN: "secret-local-token"
        }
      }),
      actor,
      now: fixedNow
    });

    const rejected = await handler({ method: "GET", url: "/api/requests/workspace" });
    expect(rejected.status).toBe(401);

    const rejectedIngestion = await handler({ method: "GET", url: "/api/ingestion/jobs" });
    expect(rejectedIngestion.status).toBe(401);

    const wrongToken = await handler({
      method: "GET",
      url: "/api/requests/workspace",
      headers: { authorization: "Bearer wrong-token" }
    });
    expect(wrongToken.status).toBe(401);

    const accepted = await handler({
      method: "GET",
      url: "/api/requests/workspace",
      headers: { authorization: "Bearer secret-local-token" }
    });
    expect(accepted.status).toBe(200);
  });

  it("requires bearer auth for non-loopback draft creation routes", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({
        cwd: tempDir(),
        env: {
          CESTUS_LOCAL_BIND: "tailnet",
          CESTUS_LOCAL_HOST: "100.126.143.105",
          CESTUS_LOCAL_AUTH_TOKEN: "secret-local-token"
        }
      }),
      actor,
      now: fixedNow,
      requestIdFactory: () => "prr_auth_write"
    });
    const draftBody = JSON.stringify({
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "City Clerk", email: "clerk@example.gov" },
      requester: { name: "Avery Investigator", email: "avery@example.org" },
      requestText: "All budget amendment memos from January 2026.",
      receivedAt: "2026-07-05T13:00:00.000Z"
    });

    const rejected = await handler({
      method: "POST",
      url: "/api/requests/drafts",
      body: draftBody
    });
    expect(rejected.status).toBe(401);

    const wrongToken = await handler({
      method: "POST",
      url: "/api/requests/drafts",
      headers: { authorization: "Bearer wrong-token" },
      body: draftBody
    });
    expect(wrongToken.status).toBe(401);

    const accepted = await handler({
      method: "POST",
      url: "/api/requests/drafts",
      headers: { authorization: "Bearer secret-local-token" },
      body: draftBody
    });
    expect(accepted.status).toBe(200);
    expect(JSON.parse(accepted.body)).toMatchObject({
      ok: true,
      prrRequestId: "prr_auth_write"
    });
  });

  it("keeps governance review append behind the existing local runtime auth boundary", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({
        cwd: tempDir(),
        env: {
          CESTUS_LOCAL_BIND: "tailnet",
          CESTUS_LOCAL_HOST: "100.126.143.105",
          CESTUS_LOCAL_AUTH_TOKEN: "secret-local-token"
        }
      }),
      actor,
      now: fixedNow
    });
    const body = JSON.stringify({
      evidenceRef: "ev_auth_governance_review",
      tag: "public_safe",
      action: "add",
      rationale: "Human review confirmed preview eligibility."
    });

    const rejected = await handler({
      method: "POST",
      url: "/api/evidence/governance-reviews",
      body
    });
    expect(rejected.status).toBe(401);

    const wrongToken = await handler({
      method: "POST",
      url: "/api/evidence/governance-reviews",
      headers: { authorization: "Bearer wrong-token" },
      body
    });
    expect(wrongToken.status).toBe(401);

    const acceptedAtBoundary = await handler({
      method: "POST",
      url: "/api/evidence/governance-reviews",
      headers: { authorization: "Bearer secret-local-token" },
      body
    });
    expect(acceptedAtBoundary.status).toBe(409);
    expect(JSON.parse(acceptedAtBoundary.body)).toMatchObject({
      ok: false,
      diagnostic: { code: "EVIDENCE_GOVERNANCE_REVIEW_BLOCKED" }
    });
    expect(acceptedAtBoundary.body).not.toContain("secret-local-token");
  });

  it("keeps the seed endpoint disabled until explicitly configured", async () => {
    const config = resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} });
    const handler = testHandler({
      config,
      actor,
      now: fixedNow
    });

    const response = await handler({ method: "POST", url: "/api/dev/seed-prr" });

    expect(response.status).toBe(404);
    expect(JSON.parse(response.body).diagnostic.message).toBe("PRR seed endpoint is disabled.");

    const workspace = await handler({ method: "GET", url: "/api/requests/workspace" });
    expect(JSON.parse(workspace.body).cards).toEqual([]);
    await closeTestHandler(handler);
    await expect(rawEventCount(config)).resolves.toBe(0);
  });

  it("requires bearer auth for non-loopback dev routes", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({
        cwd: tempDir(),
        env: {
          CESTUS_LOCAL_BIND: "tailnet",
          CESTUS_LOCAL_HOST: "100.126.143.105",
          CESTUS_LOCAL_AUTH_TOKEN: "secret-local-token"
        }
      }),
      actor,
      now: fixedNow
    });

    const rejected = await handler({ method: "POST", url: "/api/dev/seed-prr" });
    expect(rejected.status).toBe(401);

    const wrongToken = await handler({
      method: "POST",
      url: "/api/dev/seed-prr",
      headers: { authorization: "Bearer wrong-token" }
    });
    expect(wrongToken.status).toBe(401);

    const accepted = await handler({
      method: "POST",
      url: "/api/dev/seed-prr",
      headers: { authorization: "Bearer secret-local-token" }
    });
    expect(accepted.status).toBe(404);
    expect(JSON.parse(accepted.body).diagnostic.message).toBe("PRR seed endpoint is disabled.");
  });

  it("seeds golden PRR events only when explicitly enabled and the ledger is empty", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({
        cwd: tempDir(),
        env: { CESTUS_DEV_SEED_PRR: "true" }
      }),
      actor,
      now: fixedNow
    });

    const first = await handler({ method: "POST", url: "/api/dev/seed-prr" });
    const second = await handler({ method: "POST", url: "/api/dev/seed-prr" });

    expect(first.status).toBe(200);
    expect(JSON.parse(first.body).seed.appendedCount).toBeGreaterThan(1);
    expect(JSON.parse(first.body).workspace.cards.length).toBeGreaterThan(1);
    expect(second.status).toBe(200);
    expect(JSON.parse(second.body).seed).toEqual({ appendedCount: 0, skipped: true });
  });

  it("does not seed over a non-empty ledger", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({
        cwd: tempDir(),
        env: { CESTUS_DEV_SEED_PRR: "true" }
      }),
      actor,
      now: fixedNow,
      requestIdFactory: () => "prr_existing_draft"
    });

    const created = await handler({
      method: "POST",
      url: "/api/requests/drafts",
      body: JSON.stringify({
        jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
        agency: { name: "City Clerk", email: "clerk@example.gov" },
        requester: { name: "Avery Investigator", email: "avery@example.org" },
        requestText: "All budget amendment memos from January 2026.",
        receivedAt: "2026-07-05T13:00:00.000Z"
      })
    });
    expect(created.status).toBe(200);

    const seed = await handler({ method: "POST", url: "/api/dev/seed-prr" });

    expect(seed.status).toBe(200);
    expect(JSON.parse(seed.body).seed).toEqual({ appendedCount: 0, skipped: true });
    expect(JSON.parse(seed.body).workspace.cards.map((card: { prrRequestId: string }) => card.prrRequestId)).toEqual([
      "prr_existing_draft"
    ]);
  });

  it("does not expose destructive ledger routes", async () => {
    const config = resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} });
    const handler = testHandler({
      config,
      actor,
      now: fixedNow
    });
    const beforeCount = await rawEventCount(config);

    for (const url of [
      "/api/dev/reset",
      "/api/dev/truncate",
      "/api/requests/delete",
      "/api/requests/send",
      "/api/requests/legal-escalation",
      "/api/ledger/truncate",
      "/api/ledger/compact"
    ]) {
      const response = await handler({ method: "POST", url });
      expect(response.status).toBe(404);
    }

    const workspace = await handler({ method: "GET", url: "/api/requests/workspace" });
    expect(JSON.parse(workspace.body).cards).toEqual([]);
    await closeTestHandler(handler);
    await expect(rawEventCount(config)).resolves.toBe(beforeCount);
  });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-local-auth-seed-"));
  tempDirs.push(dir);
  return dir;
}

function testHandler(input: CreateLocalRuntimeHttpHandlerInput): LocalRuntimeHttpHandler {
  const handler = createLocalRuntimeHttpHandler(input);
  handlers.push(handler);
  return handler;
}

async function closeTestHandler(handler: LocalRuntimeHttpHandler): Promise<void> {
  const index = handlers.indexOf(handler);
  if (index >= 0) {
    handlers.splice(index, 1);
  }
  await handler.close();
}

async function rawEventCount(config: ResolvedLocalRuntimeConfig): Promise<number> {
  const handle = createSqlitePrrRuntime({ config, actor, now: fixedNow });
  try {
    return (await handle.runtime.readEvents()).length;
  } finally {
    handle.close();
  }
}
