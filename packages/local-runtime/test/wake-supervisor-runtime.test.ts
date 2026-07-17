import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import {
  inspectMountedArtifactAuthorityOperation,
  issueMountedArtifactAuthorityOperationForFactory
} from "../src/mounted-artifact-authority-operation.js";
import { createWakeSupervisorRuntime } from "../src/wake-supervisor-runtime.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";

const directories: string[] = [];
const handles: LocalRuntimeHandle[] = [];

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cestus-wake-runtime-"));
  directories.push(root);
  const workspaceId = "ws_wake_runtime";
  const workspaceRoot = join(root, workspaceId);
  createPortableWorkspace({ rootDir: workspaceRoot, workspaceId, label: "Wake runtime", createdAt: "2026-07-16T00:00:00.000Z", createdBy: "wake-runtime-test" });
  const handle = createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({ cwd: root, env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot } }),
    actor: { id: "actor_wake_runtime", kind: "human", label: "Wake runtime" }
  });
  handles.push(handle);
  await handle.residentIdentity.ready();
  const runtime = createWakeSupervisorRuntime({
    runtimeHandle: handle,
    actor: { id: "agent_wake_runtime", kind: "agent", label: "Wake runtime" },
    supervisorEpoch: "epoch_wake_runtime",
    policy: { policyVersion: "policy.v1", policyDigest: "sha256:policy", lockStateDigest: "sha256:lock" },
    now: () => "2026-07-16T00:00:00.000Z",
    createSafeId: (kind) => `${kind}_wake_runtime`
  });
  return { handle, runtime };
}

describe("wake supervisor runtime", () => {
  it("wake runtime registers one non public authority issuer after complete admission", async () => {
    const { handle, runtime } = await fixture();
    await expect(runtime.supervision.start()).resolves.toMatchObject({ outcome: "accepted" });
    expect(inspectMountedArtifactAuthorityOperation(issueMountedArtifactAuthorityOperationForFactory(runtime))).toMatchObject({ workspaceId: "ws_wake_runtime" });
    const identity = (await handle.ledger.readAll()).find((event) => event.type === "agent.identity.initialized");
    if (identity === undefined) throw new Error("fixture identity is required");
    const command = {
      schemaVersion: "resident-wake-command.v1" as const,
      commandId: "pause_wake_runtime",
      sourceEventIds: [identity.id],
      requestedAt: "2026-07-16T00:00:00.000Z",
      causation: { causationId: identity.id, correlationId: "corr_pause_wake_runtime" }
    };
    await expect(runtime.supervision.pause(command)).resolves.toMatchObject({ outcome: "completed" });
    const events = await handle.ledger.readAll();
    const requested = events.find((event) => event.type === "agent.wake.supervisor.pause.requested.v1");
    const paused = events.find((event) => event.type === "agent.wake.supervisor.paused.v1");
    expect(requested?.payload).toMatchObject({
      commandId: command.commandId,
      sourceEventIds: command.sourceEventIds,
      causation: command.causation
    });
    expect(requested?.context.causationId).toBe(command.causation.causationId);
    expect(paused?.payload).toMatchObject({
      pauseRequestEventId: requested?.id,
      causation: command.causation
    });
  });

  it("stopped runtime cannot issue or inspect an authority operation", async () => {
    const { runtime } = await fixture();
    await runtime.supervision.start();
    const operation = issueMountedArtifactAuthorityOperationForFactory(runtime);
    await runtime.stop();
    expect(() => inspectMountedArtifactAuthorityOperation(operation)).toThrow(/burned|current/i);
    expect(() => issueMountedArtifactAuthorityOperationForFactory(runtime)).toThrow(/complete|current|registered/i);
  });

  it("fresh process runtime requires new admission and emits a distinct operation", async () => {
    const first = await fixture();
    await first.runtime.supervision.start();
    const firstOperation = issueMountedArtifactAuthorityOperationForFactory(first.runtime);
    await first.runtime.stop();
    const second = await fixture();
    expect(() => issueMountedArtifactAuthorityOperationForFactory(second.runtime)).toThrow(/registered|complete|current/i);
    await second.runtime.supervision.start();
    const secondOperation = issueMountedArtifactAuthorityOperationForFactory(second.runtime);
    expect(secondOperation).not.toBe(firstOperation);
  });

  it("exposes only supervision control and stop rather than authority internals", async () => {
    const { runtime } = await fixture();
    expect(Reflect.ownKeys(runtime).map(String).sort()).toEqual(["stop", "supervision"]);
    expect(Reflect.ownKeys(runtime.supervision).map(String)).not.toEqual(expect.arrayContaining(["authority", "issuer", "operation", "ports", "facts", "paths", "stores", "writer"]));
  });

  it("rejects a second authority operation for one completed admission", async () => {
    const { runtime } = await fixture();
    await runtime.supervision.start();
    issueMountedArtifactAuthorityOperationForFactory(runtime);
    expect(() => issueMountedArtifactAuthorityOperationForFactory(runtime)).toThrow(/already issued/i);
  });

  it("invalidates authority before stop returns", async () => {
    const { runtime } = await fixture();
    await runtime.supervision.start();
    const operation = issueMountedArtifactAuthorityOperationForFactory(runtime);
    await runtime.stop();
    expect(() => inspectMountedArtifactAuthorityOperation(operation)).toThrow();
  });

  it("rejects structural caller handles before installing a runtime", async () => {
    const { handle } = await fixture();
    const originalAppend = handle.ledger.append.bind(handle.ledger);
    const originalReadAll = handle.ledger.readAll.bind(handle.ledger);
    let writes = 0;
    let reads = 0;
    Object.defineProperty(handle.ledger, "append", {
      configurable: true,
      value: async (...args: Parameters<typeof handle.ledger.append>) => {
        writes += 1;
        return originalAppend(...args);
      }
    });
    Object.defineProperty(handle.ledger, "readAll", {
      configurable: true,
      value: async () => {
        reads += 1;
        return originalReadAll();
      }
    });
    let forgedRuntime: ReturnType<typeof createWakeSupervisorRuntime> | undefined;
    expect(() => {
      forgedRuntime = createWakeSupervisorRuntime({
        runtimeHandle: { ...handle } as LocalRuntimeHandle,
        actor: { id: "agent_wake_runtime", kind: "agent", label: "Wake runtime" },
        supervisorEpoch: "epoch_wake_runtime",
        policy: { policyVersion: "policy.v1", policyDigest: "sha256:policy", lockStateDigest: "sha256:lock" },
        now: () => "2026-07-16T00:00:00.000Z",
        createSafeId: (kind) => `${kind}_wake_runtime`
      });
    }).toThrow(/factory-issued|runtime handle/i);
    expect(forgedRuntime).toBeUndefined();
    expect({ reads, writes }).toEqual({ reads: 0, writes: 0 });
  });

  it("authenticates a raw handle before the wake runtime reads any handle-owned state", () => {
    let rawHandleReads = 0;
    const forged = Object.defineProperty({}, "mountedWorkspace", {
      enumerable: true,
      get() {
        rawHandleReads += 1;
        return undefined;
      }
    }) as LocalRuntimeHandle;

    expect(() => createWakeSupervisorRuntime({
      runtimeHandle: forged,
      actor: { id: "agent_wake_runtime", kind: "agent", label: "Wake runtime" },
      supervisorEpoch: "epoch_wake_runtime",
      policy: { policyVersion: "policy.v1", policyDigest: "sha256:policy", lockStateDigest: "sha256:lock" },
      now: () => "2026-07-16T00:00:00.000Z",
      createSafeId: (kind) => `${kind}_wake_runtime`
    })).toThrow(/factory-issued|runtime handle/i);
    expect(rawHandleReads).toBe(0);
  });

  it("does not admit an operation after authority loss during a later lifecycle command", async () => {
    const { runtime } = await fixture();
    await runtime.supervision.start();
    await runtime.stop();
    await expect(runtime.supervision.resume({ schemaVersion: "resident-wake-command.v1", commandId: "resume_after_stop", sourceEventIds: [], requestedAt: "2026-07-16T00:00:00.000Z", causation: { causationId: "evt_resume_after_stop", correlationId: "corr_resume_after_stop" } }))
      .resolves.toMatchObject({ outcome: "blocked" });
  });

  it("has no fallback storage or public authority constructor input", async () => {
    const { runtime } = await fixture();
    expect(JSON.stringify(runtime)).not.toMatch(/ledger|path|fallback|authority|operation/i);
  });
});
