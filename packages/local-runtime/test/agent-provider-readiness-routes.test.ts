import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createLocalRuntimeHttpHandler, type LocalRuntimeHttpHandler } from "../src/http-handler.js";

const handlers: LocalRuntimeHttpHandler[] = [];
const tempDirs: string[] = [];

afterEach(() => {
  for (const handler of handlers.splice(0)) {
    handler.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent provider readiness route", () => {
  it("returns browser-safe provider readiness without credentials", async () => {
    const handler = testHandler();
    const response = await handler({ method: "GET", url: "/api/agent/providers/readiness" });
    const body = JSON.parse(response.body) as { schemaVersion: string };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("agent-provider-readiness.v1");
    expect(response.body).not.toMatch(/authorization:\s*bearer|password=|private key|secret=|raw-provider-material/i);
  });
});

function testHandler() {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-provider-readiness-"));
  tempDirs.push(cwd);
  const handler = createLocalRuntimeHttpHandler({
    config: resolveLocalRuntimeConfig({ cwd, env: {} }),
    actor: { id: "actor_provider_route", kind: "human", label: "Provider Route Test" },
    now: () => "2026-07-07T22:30:00.000Z"
  });
  handlers.push(handler);
  return handler;
}
