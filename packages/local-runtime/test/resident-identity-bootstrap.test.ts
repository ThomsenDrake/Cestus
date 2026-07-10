import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultResidentIdentityStreamId,
  ensureDefaultResidentIdentity
} from "../../agent/src/index.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { runLocalRuntimeCli } from "../src/cli.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import {
  createLocalRuntimeHttpHandler,
  type CreateLocalRuntimeHttpHandlerInput,
  type LocalRuntimeHttpHandler
} from "../src/http-handler.js";

const actor = { id: "actor_local_runtime_test", kind: "human" as const, label: "Local Runtime Test" };
const now = () => "2026-07-10T13:00:00.000Z";
const tempDirs: string[] = [];
const handlers: LocalRuntimeHttpHandler[] = [];

afterEach(() => {
  for (const handler of handlers.splice(0)) handler.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("local runtime resident identity bootstrap", () => {
  it("shows initializing after mount-open starts bootstrap, then agent mutation awaits the same ready promise", async () => {
    const cwd = tempDir();
    const workspaceRoot = join(cwd, "external-case");
    const gate = deferred<void>();
    createPortableWorkspace({
      rootDir: workspaceRoot,
      workspaceId: "ws_runtime_bootstrap",
      label: "Runtime Bootstrap Workspace",
      createdAt: "2026-07-10T12:00:00.000Z",
      createdBy: "runtime-test"
    });
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: workspaceRoot
      }
    });

    const handler = testHandler(config, {
      residentIdentityBootstrapForTest: async (input) => {
        await gate.promise;
        return ensureDefaultResidentIdentity(input);
      }
    });
    const initializing = await handler({ method: "GET", url: "/api/agent/status" });
    await handler({ method: "GET", url: "/api/agent/status" });

    expect(JSON.parse(initializing.body).identityLifecycle).toMatchObject({
      state: "initializing",
      workspaceId: "ws_runtime_bootstrap"
    });
    expect(await identityEventTypes(config.storage.sqlitePath)).toEqual([]);

    gate.resolve();
    const taskPromise = handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_bootstrap_ready",
        title: "Review mounted workspace",
        priority: "normal"
      })
    });
    const task = await taskPromise;
    const ready = await waitForAgentIdentityState(handler, "ready");

    expect(task.status).toBe(200);
    expect(ready.identityLifecycle).toMatchObject({
      state: "ready",
      workspaceId: "ws_runtime_bootstrap"
    });
    expect(await identityEventTypes(config.storage.sqlitePath)).toEqual(["agent.identity.initialized"]);
  });

  it("keeps status reads mutation-free after mount bootstrap completes", async () => {
    const { config, handler } = portableHandler("ws_status_readonly");
    await waitForAgentIdentityState(handler, "ready");
    const before = await identityEventTypes(config.storage.sqlitePath);
    await handler({ method: "GET", url: "/api/agent/status" });
    await handler({ method: "GET", url: "/api/agent/cockpit" });

    expect(before).toEqual(["agent.identity.initialized"]);
    expect(await identityEventTypes(config.storage.sqlitePath)).toEqual(before);
  });

  it("returns blocked agent status for a malformed resident identity row without mutating the ledger", async () => {
    const cwd = tempDir();
    const workspaceRoot = join(cwd, "malformed-identity");
    createPortableWorkspace({
      rootDir: workspaceRoot,
      workspaceId: "ws_malformed_identity",
      label: "Malformed Identity Workspace",
      createdAt: "2026-07-10T12:00:00.000Z",
      createdBy: "runtime-test"
    });
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: workspaceRoot
      }
    });
    insertMalformedIdentityRow(config.storage.sqlitePath);
    const before = storedEventCount(config.storage.sqlitePath);
    const handler = testHandler(config);

    const response = await handler({ method: "GET", url: "/api/agent/status" });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      schemaVersion: "agent-status.v1",
      identityLifecycle: {
        state: "blocked",
        workspaceId: "ws_malformed_identity",
        safeMessage: "Resident identity stream could not be read safely."
      }
    });
    expect(storedEventCount(config.storage.sqlitePath)).toBe(before);
  });

  it("blocks agent task mutation when no workspace is mounted", async () => {
    const cwd = tempDir();
    const config = resolveLocalRuntimeConfig({ cwd, env: {} });
    const handler = testHandler(config);

    const status = await handler({ method: "GET", url: "/api/agent/status" });
    const task = await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_without_workspace",
        title: "Should not create hidden local identity",
        priority: "normal"
      })
    });

    expect(JSON.parse(status.body).identityLifecycle.state).toBe("not-mounted");
    expect(task.status).toBe(409);
    expect(JSON.parse(task.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Resident identity is not ready for this workspace.",
        allowedRepairActions: ["mount or create a portable workspace", "refresh agent status"]
      }
    });
    expect(await eventTypes(config.storage.sqlitePath)).toEqual([]);
  });

  it("blocks approval and scheduler mutations when no workspace is mounted without appending events", async () => {
    const cwd = tempDir();
    const config = resolveLocalRuntimeConfig({ cwd, env: {} });
    const handler = testHandler(config);
    const expected = {
      ok: false,
      diagnostic: {
        message: "Resident identity is not ready for this workspace.",
        allowedRepairActions: ["mount or create a portable workspace", "refresh agent status"]
      }
    };

    const approve = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_not_mounted/approve",
      body: JSON.stringify({
        approvedPreviewHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        rationale: "Approved only after a mounted resident identity is ready."
      })
    });
    const deny = await handler({
      method: "POST",
      url: "/api/agent/approvals/toolreq_not_mounted/deny",
      body: JSON.stringify({ rationale: "Denied until a mounted resident identity is ready." })
    });
    const wake = await handler({ method: "POST", url: "/api/agent/scheduler/wake", body: JSON.stringify({}) });

    expect(approve.status).toBe(409);
    expect(deny.status).toBe(409);
    expect(wake.status).toBe(409);
    expect(JSON.parse(approve.body)).toEqual(expected);
    expect(JSON.parse(deny.body)).toEqual(expected);
    expect(JSON.parse(wake.body)).toEqual(expected);
    expect(await eventTypes(config.storage.sqlitePath)).toEqual([]);
  });

  it("blocks copied ledger workspace identity mismatch without appending a second identity", async () => {
    const cwd = tempDir();
    const firstRoot = join(cwd, "case-a");
    const copiedRoot = join(cwd, "case-b");
    createPortableWorkspace({
      rootDir: firstRoot,
      workspaceId: "ws_original_case",
      label: "Original Case",
      createdAt: "2026-07-10T12:00:00.000Z",
      createdBy: "runtime-test"
    });
    await withLedger(join(firstRoot, "ledger", "ontology.sqlite"), async (ledger) => {
      await ensureDefaultResidentIdentity({
        ledger,
        actor: { id: "actor_copy_seed", kind: "system", label: "Copy Seed" },
        now,
        workspaceId: "ws_original_case"
      });
    });
    createPortableWorkspace({
      rootDir: copiedRoot,
      workspaceId: "ws_copied_case",
      label: "Copied Case",
      createdAt: "2026-07-10T12:00:00.000Z",
      createdBy: "runtime-test"
    });
    await copyIdentityRows(join(firstRoot, "ledger", "ontology.sqlite"), join(copiedRoot, "ledger", "ontology.sqlite"));

    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: copiedRoot
      }
    });
    const handler = testHandler(config);
    const status = await waitForAgentIdentityState(handler, "blocked");
    const task = await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({ taskId: "task_copied_case", title: "Copied case", priority: "normal" })
    });

    expect(status.identityLifecycle).toMatchObject({
      state: "blocked",
      workspaceId: "ws_copied_case"
    });
    expect(task.status).toBe(409);
    expect(await identityEventTypes(config.storage.sqlitePath)).toEqual(["agent.identity.initialized"]);
  });

  it("recomputes readiness when switching workspaces", async () => {
    const cwd = tempDir();
    const first = portableHandler("ws_switch_first", cwd);
    const second = portableHandler("ws_switch_second", cwd);

    await waitForAgentIdentityState(first.handler, "ready");
    await waitForAgentIdentityState(second.handler, "ready");

    expect(JSON.parse((await first.handler({ method: "GET", url: "/api/agent/status" })).body).identityLifecycle.workspaceId)
      .toBe("ws_switch_first");
    expect(JSON.parse((await second.handler({ method: "GET", url: "/api/agent/status" })).body).identityLifecycle.workspaceId)
      .toBe("ws_switch_second");
  });

  it("create-workspace reports bootstrap failure while retaining a recoverable workspace", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const cwd = tempDir();
    const workspaceRoot = join(cwd, "recoverable-case");

    const failed = await runLocalRuntimeCli(
      ["create-workspace", "--workspace", workspaceRoot, "--workspace-id", "ws_recoverable_case", "--label", "Recoverable Case"],
      {
        cwd,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
        residentIdentityBootstrapForTest: async () => ({
          schemaVersion: "resident-identity-lifecycle.v1",
          state: "blocked",
          residentAgentId: "agent_default",
          workspaceId: "ws_recoverable_case",
          initialized: false,
          eventIds: [],
          safeMessage: "Injected bootstrap failure.",
          allowedRepairActions: ["retry workspace open"]
        })
      }
    );
    const retry = await runLocalRuntimeCli(
      ["agent-create-task", "--task-id", "task_retry_after_create_failure", "--title", "Retry after create failure"],
      {
        cwd,
        env: {
          CESTUS_LOCAL_STORAGE: "portable-workspace",
          CESTUS_WORKSPACE_ROOT: workspaceRoot
        },
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line)
      }
    );

    expect(failed).toBe(1);
    expect(existsSync(join(workspaceRoot, "cestus-workspace.json"))).toBe(true);
    expect(stderr.join("\n")).toContain("Resident identity bootstrap failed.");
    expect(retry).toBe(0);
    expect(await identityEventTypes(join(workspaceRoot, "ledger", "ontology.sqlite"))).toEqual(["agent.identity.initialized"]);
  });

  it("requires a new runtime open to retry after an unexpected bootstrap failure", async () => {
    const cwd = tempDir();
    const workspaceRoot = join(cwd, "retry-case");
    createPortableWorkspace({
      rootDir: workspaceRoot,
      workspaceId: "ws_retry_case",
      label: "Retry Case",
      createdAt: "2026-07-10T12:00:00.000Z",
      createdBy: "runtime-test"
    });
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: workspaceRoot
      }
    });
    const failureGate = deferred<void>();
    const failing = testHandler(config, {
      residentIdentityBootstrapForTest: async () => {
        await failureGate.promise;
        throw new Error("injected unexpected failure");
      }
    });

    expect(JSON.parse((await failing({ method: "GET", url: "/api/agent/status" })).body).identityLifecycle.state)
      .toBe("initializing");
    failureGate.resolve();
    await expect(waitForAgentIdentityState(failing, "blocked")).resolves.toMatchObject({
      identityLifecycle: {
        state: "blocked",
        workspaceId: "ws_retry_case"
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(JSON.parse((await failing({ method: "GET", url: "/api/agent/status" })).body).identityLifecycle.state)
      .toBe("blocked");
    expect(await identityEventTypes(config.storage.sqlitePath)).toEqual([]);

    failing.close();
    const retrying = testHandler(config);
    const ready = await waitForAgentIdentityState(retrying, "ready");

    expect(ready.identityLifecycle.workspaceId).toBe("ws_retry_case");
    expect(await identityEventTypes(config.storage.sqlitePath)).toEqual(["agent.identity.initialized"]);
  });
});

function testHandler(
  config: ReturnType<typeof resolveLocalRuntimeConfig>,
  dependencies: Pick<CreateLocalRuntimeHttpHandlerInput, "residentIdentityBootstrapForTest"> = {}
) {
  const handler = createLocalRuntimeHttpHandler({ config, actor, now, ...dependencies });
  handlers.push(handler);
  return handler;
}

function portableHandler(workspaceId: string, cwd = tempDir()) {
  const workspaceRoot = join(cwd, workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: `Workspace ${workspaceId}`,
    createdAt: "2026-07-10T12:00:00.000Z",
    createdBy: "runtime-test"
  });
  const config = resolveLocalRuntimeConfig({
    cwd,
    env: {
      CESTUS_LOCAL_STORAGE: "portable-workspace",
      CESTUS_WORKSPACE_ROOT: workspaceRoot
    }
  });
  return { config, handler: testHandler(config) };
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-resident-runtime-"));
  tempDirs.push(dir);
  return dir;
}

async function withLedger<T>(path: string, callback: (ledger: SQLiteEventLedger) => Promise<T>): Promise<T> {
  const ledger = new SQLiteEventLedger(path);
  try {
    return await callback(ledger);
  } finally {
    ledger.close();
  }
}

async function identityEventTypes(path: string): Promise<readonly string[]> {
  return withLedger(path, async (ledger) =>
    (await ledger.readStream(defaultResidentIdentityStreamId)).map((event) => event.type)
  );
}

async function eventTypes(path: string): Promise<readonly string[]> {
  return withLedger(path, async (ledger) => (await ledger.readAll()).map((event) => event.type));
}

function insertMalformedIdentityRow(path: string): void {
  const ledger = new SQLiteEventLedger(path);
  ledger.close();
  const database = new DatabaseSync(path);
  try {
    database.prepare(`
      INSERT INTO ontology_events (
        id, type, version, stream_id, stream_sequence, context_json, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "evt_malformed_identity",
      "agent.identity.initialized",
      1,
      defaultResidentIdentityStreamId,
      1,
      JSON.stringify({
        actor,
        occurredAt: now(),
        correlationId: "corr_malformed_identity",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      }),
      JSON.stringify({ residentAgentId: "agent_default" })
    );
  } finally {
    database.close();
  }
}

function storedEventCount(path: string): number {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const row = database.prepare("SELECT COUNT(*) AS event_count FROM ontology_events").get() as {
      event_count: number | bigint;
    };
    return Number(row.event_count);
  } finally {
    database.close();
  }
}

async function copyIdentityRows(from: string, to: string): Promise<void> {
  const source = new SQLiteEventLedger(from);
  const target = new SQLiteEventLedger(to);
  try {
    for (const event of await source.readStream(defaultResidentIdentityStreamId)) {
      if (event.type === "agent.identity.initialized") {
        await target.append({
          type: "agent.identity.initialized",
          version: event.version,
          streamId: event.streamId,
          context: event.context,
          payload: event.payload
        });
      }
    }
  } finally {
    source.close();
    target.close();
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function waitForAgentIdentityState(
  handler: LocalRuntimeHttpHandler,
  state: "ready" | "blocked"
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await handler({ method: "GET", url: "/api/agent/status" });
    const body = JSON.parse(response.body);
    if (body.identityLifecycle.state === state) {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`agent identity lifecycle did not reach ${state}`);
}
