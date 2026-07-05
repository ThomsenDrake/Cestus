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
  id: "actor_auth_seed_test",
  kind: "human",
  label: "Auth Seed Test"
} as const;
const fixedNow = "2026-07-05T13:00:00.000Z";
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

    const accepted = await handler({
      method: "GET",
      url: "/api/requests/workspace",
      headers: { authorization: "Bearer secret-local-token" }
    });
    expect(accepted.status).toBe(200);
  });

  it("keeps the seed endpoint disabled until explicitly configured", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} }),
      actor,
      now: fixedNow
    });

    const response = await handler({ method: "POST", url: "/api/dev/seed-prr" });

    expect(response.status).toBe(404);
    expect(JSON.parse(response.body).diagnostic.message).toBe("PRR seed endpoint is disabled.");
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

  it("does not expose destructive ledger routes", async () => {
    const handler = testHandler({
      config: resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} }),
      actor,
      now: fixedNow
    });

    for (const url of ["/api/dev/reset", "/api/requests/delete", "/api/ledger/truncate"]) {
      const response = await handler({ method: "POST", url });
      expect(response.status).toBe(404);
    }

    const workspace = await handler({ method: "GET", url: "/api/requests/workspace" });
    expect(JSON.parse(workspace.body).cards).toEqual([]);
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
