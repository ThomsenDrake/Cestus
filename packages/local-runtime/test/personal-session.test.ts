import { agentStatusFromJson } from "../../ui/src/agent/agent-adapter.js";
import { runLocalRuntimeCli } from "../src/cli.js";
import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { startLocalRuntimeServer, type LocalRuntimeServerHandle } from "../src/server.js";

const dirs: string[] = [];
const servers: LocalRuntimeServerHandle[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function setup() {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-personal-session-"));
  dirs.push(cwd);
  const rootDir = join(cwd, "workspace");
  createPortableWorkspace({ rootDir, workspaceId: "ws_personal", label: "Synthetic investigations", createdBy: "test", createdAt: "2026-09-04T00:00:00.000Z" });
  new SQLiteEventLedger(join(rootDir, "ledger/ontology.sqlite")).close();
  const base = resolveLocalRuntimeConfig({ cwd, env: {
    CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: rootDir,
    CESTUS_LOCAL_AUTH_TOKEN: "disposable-test-token"
  } });
  const config = { ...base, operator: { id: "operator_test", kind: "human" as const, label: "Test investigator" }, http: { ...base.http, port: 0 } };
  return { cwd, rootDir, config };
}
async function start(config: ReturnType<typeof setup>["config"]) {
  const server = await startLocalRuntimeServer({ config });
  servers.push(server);
  const address = server.server.address();
  if (!address || typeof address === "string") throw new Error("No test address");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}
async function authenticate(server: LocalRuntimeServerHandle) {
  const response = await fetch(server.sessionBootstrapUrl ?? "", { redirect: "manual" });
  expect(response.status).toBe(303);
  return (response.headers.get("set-cookie") ?? "").split(";")[0]!;
}
const draft = {
  jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
  agency: { name: "Synthetic clerk" }, requester: { name: "Synthetic investigator" },
  requestText: "Synthetic Phase 1 recovery record", receivedAt: "2026-09-04T00:00:00.000Z",
  actor: { id: "impersonated", kind: "human" }, createdBy: "impersonated"
};
describe("personal production server boundary", () => {
  it("reports log initialization failures without claiming the mounted storage is missing", async () => {
    const { config, cwd, rootDir } = setup();
    const logFile = join(cwd, "not-a-log-directory");
    writeFileSync(logFile, "synthetic");
    await expect(startLocalRuntimeServer({ config: { ...config, logs: { ...config.logs, dir: logFile } } })).rejects.toThrow("Local runtime log directory is unavailable");
    expect(existsSync(rootDir)).toBe(true);
  });
  it("delivers Agent status accepted by the real browser adapter", async () => {
    const { config } = setup();
    const { origin } = await start(config);
    const response = await fetch(origin + "/api/agent/status", { headers: { authorization: `Bearer ${config.http.authToken}` } });
    expect(response.status).toBe(200);
    expect(agentStatusFromJson(await response.json()).identityLifecycle.state).toBe("ready");
  });
  it("checks the running process, and reports unreachable after shutdown", async () => {
    const { config, cwd } = setup();
    const { server, origin } = await start(config);
    const output: string[] = [];
    const dependencies = { cwd, env: { CESTUS_LOCAL_PORT: new URL(origin).port }, stdout: (line: string) => { output.push(line); } };
    expect(await runLocalRuntimeCli(["health"], dependencies)).toBe(0);
    expect(JSON.parse(output.pop()!)).toMatchObject({ backend: "running", workspaceState: "ready" });
    await server.close();
    expect(await runLocalRuntimeCli(["health"], dependencies)).toBe(1);
    expect(JSON.parse(output.pop()!)).toMatchObject({ ok: false, backend: "unreachable" });
    expect(existsSync(join(cwd, ".cestus/local/prr-ledger.sqlite"))).toBe(false);
  });
  it("requires loopback authentication for protected reads and writes", async () => {
    const { config } = setup();
    const { origin } = await start(config);
    for (const path of ["/api/requests/workspace", "/api/evidence/workspace", "/api/ontology/workspace", "/api/agent/approvals"]) {
      expect((await fetch(origin + path)).status).toBe(401);
    }
    expect((await fetch(origin + "/api/requests/drafts", { method: "POST", body: JSON.stringify(draft) })).status).toBe(401);
  });
  it("recovers authenticated drafts with server-derived identity and rejects cross-origin access", async () => {
    const { config } = setup();
    const { server, origin } = await start(config);
    const cookie = await authenticate(server);
    expect((await fetch(server.sessionBootstrapUrl!, { redirect: "manual" })).status).toBe(401);
    for (const path of ["/api/requests/workspace", "/api/evidence/workspace"]) {
      expect((await fetch(origin + path, { headers: { cookie, origin: "https://unauthorized.example" } })).status).toBe(403);
    }
    for (const path of ["/api/requests/drafts", "/api/evidence/governance-reviews", "/api/agent/approvals/toolreq_test/approve"]) {
      expect((await fetch(origin + path, { method: "POST", headers: { cookie, origin: "https://unauthorized.example", "content-type": "application/json" }, body: JSON.stringify(draft) })).status).toBe(403);
    }
    expect((await fetch(origin + "/api/requests/drafts", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(draft) })).status).toBe(403);
    const response = await fetch(origin + "/api/requests/drafts", { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify(draft) });
    expect(response.status).toBe(200);
    await server.close();
    const restarted = await start(config);
    expect((await fetch(restarted.origin + "/api/requests/workspace", { headers: { cookie } })).status).toBe(401);
    const newCookie = await authenticate(restarted.server);
    const recovered = await fetch(restarted.origin + "/api/requests/workspace", { headers: { cookie: newCookie } });
    expect(await recovered.text()).toContain(draft.requestText);
    await restarted.server.close();
    const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
    try {
      const events = await ledger.readAll();
      expect(events.some(event => event.context.actor.id === "operator_test")).toBe(true);
      expect(events.some(event => event.context.actor.id === "impersonated")).toBe(false);
    } finally { ledger.close(); }
  });
  it("serves unavailable status for missing storage and never recreates it", async () => {
    const { config, rootDir, cwd } = setup();
    renameSync(rootDir, rootDir + "-offline");
    const { server, origin } = await start(config);
    const health = await fetch(origin + "/api/health");
    expect(health.status).toBe(503);
    expect(await health.json()).toMatchObject({ backend: "running", workspaceState: "unavailable", ok: false });
    const cookie = await authenticate(server);
    const response = await fetch(origin + "/api/requests/drafts", { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify(draft) });
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("restart");
    expect(existsSync(rootDir)).toBe(false);
    expect(existsSync(join(cwd, ".cestus/local/prr-ledger.sqlite"))).toBe(false);
  });
  it("fails closed when storage disappears while running", async () => {
    const { config, rootDir } = setup();
    const { server, origin } = await start(config);
    const cookie = await authenticate(server);
    renameSync(rootDir, rootDir + "-offline");
    expect((await fetch(origin + "/api/health")).status).toBe(503);
    expect((await fetch(origin + "/api/requests/workspace", { headers: { cookie } })).status).toBe(503);
    expect(existsSync(rootDir)).toBe(false);
    renameSync(rootDir + "-offline", rootDir);
    expect((await fetch(origin + "/api/health")).status).toBe(503);
    expect((await fetch(origin + "/api/requests/drafts", { method: "POST", headers: { cookie, origin }, body: JSON.stringify(draft) })).status).toBe(503);
    await server.close();
    const restarted = await start(config);
    expect((await fetch(restarted.origin + "/api/health")).status).toBe(200);
  });
});
