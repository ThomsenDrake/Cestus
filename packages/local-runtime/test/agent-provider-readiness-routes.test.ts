import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createLocalRuntimeHttpHandler, type LocalRuntimeHttpHandler } from "../src/http-handler.js";

const handlers: LocalRuntimeHttpHandler[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const handler of handlers.splice(0)) {
    await handler.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent provider readiness route", () => {
  it("returns browser-safe provider readiness without credentials", async () => {
    const { handler, config } = testHandler();
    const response = await handler({ method: "GET", url: "/api/agent/providers/readiness" });
    const body = JSON.parse(response.body) as { schemaVersion: string };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("agent-provider-readiness.v1");
    expect(response.body).not.toMatch(/authorization:\s*bearer|password=|private key|secret=|raw-provider-material/i);
    await closeHandler(handler);
    expect(await eventTypes(config)).toEqual([]);
  });

  it("returns configured Nous readiness from the local runtime without ledger writes", async () => {
    const { handler, config } = testHandler({
      dotEnvLines: ["CESTUS_AGENT_NOUS_API_KEY=runtime-provider-material"]
    });

    const response = await handler({ method: "GET", url: "/api/agent/providers/readiness" });
    const body = JSON.parse(response.body) as {
      readonly cards: ReadonlyArray<{
        readonly providerId: string;
        readonly state: string;
        readonly credentialHealth: string;
        readonly requiredApprovalClass: string;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: "provider_nous_portal",
        state: "requires-byte-transfer-approval",
        credentialHealth: "local-binding-healthy",
        requiredApprovalClass: "provider-byte-transfer"
      })
    ]));
    expect(response.body).not.toMatch(/runtime-provider-material|authorization:\s*bearer|provider error|response body/i);
    await closeHandler(handler);
    expect(await eventTypes(config)).toEqual([]);
  });
});

function testHandler(input: { readonly dotEnvLines?: readonly string[] } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-provider-readiness-"));
  tempDirs.push(cwd);
  if (input.dotEnvLines !== undefined) {
    writeFileSync(join(cwd, ".env"), input.dotEnvLines.join("\n"));
  }
  const config = resolveLocalRuntimeConfig({ cwd, env: {} });
  const handler = createLocalRuntimeHttpHandler({
    config,
    actor: { id: "actor_provider_route", kind: "human", label: "Provider Route Test" },
    now: () => "2026-07-07T22:30:00.000Z"
  });
  handlers.push(handler);
  return { handler, config };
}

async function closeHandler(handler: LocalRuntimeHttpHandler): Promise<void> {
  await handler.close();
  const index = handlers.indexOf(handler);
  if (index >= 0) {
    handlers.splice(index, 1);
  }
}

async function eventTypes(config: ReturnType<typeof resolveLocalRuntimeConfig>): Promise<readonly string[]> {
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    return (await ledger.readAll()).map((event) => event.type);
  } finally {
    ledger.close();
  }
}
