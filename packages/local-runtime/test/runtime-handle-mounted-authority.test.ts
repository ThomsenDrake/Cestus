import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import {
  captureFactoryIssuedMountedRuntime,
  createSqlitePrrRuntime,
  inspectFactoryIssuedMountedRuntimeCapture,
  type FactoryIssuedMountedRuntimeCapture,
  type LocalRuntimeHandle
} from "../src/runtime-factory.js";
import { resolveLocalRuntimeConfig, type ResolvedLocalRuntimeConfig } from "../src/config.js";

const tempDirs: string[] = [];
const handles: LocalRuntimeHandle[] = [];

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("factory-issued mounted runtime capture", () => {
  it("factory issued mounted runtime capture rejects structural spread and deserialized handles before io", () => {
    const { handle } = portableRuntime("ws_structural");
    let readAllCalls = 0;
    const structural = {
      ...handle,
      ledger: {
        ...handle.ledger,
        async readAll() {
          readAllCalls += 1;
          throw new Error("structural ledger must not be read");
        }
      }
    } as LocalRuntimeHandle;
    const spread = { ...handle } as LocalRuntimeHandle;
    const deserialized = JSON.parse(JSON.stringify(handle)) as LocalRuntimeHandle;

    expect(() => captureFactoryIssuedMountedRuntime(structural)).toThrow(/factory-issued mounted runtime handle/i);
    expect(() => captureFactoryIssuedMountedRuntime(spread)).toThrow(/factory-issued mounted runtime handle/i);
    expect(() => captureFactoryIssuedMountedRuntime(deserialized)).toThrow(/factory-issued mounted runtime handle/i);
    expect(readAllCalls).toBe(0);
  });

  it("factory issued mounted runtime capture deep snapshots nested portable config", () => {
    const { config, handle, workspaceRoot } = portableRuntime("ws_nested_config");
    const capture = captureFactoryIssuedMountedRuntime(handle);
    const before = inspectFactoryIssuedMountedRuntimeCapture(capture);
    const storage = config.storage as Extract<ResolvedLocalRuntimeConfig["storage"], { strategy: "portable-workspace" }>;

    storage.workspaceRoot = join(workspaceRoot, "swapped-root");
    storage.sqlitePath = join(workspaceRoot, "swapped-ledger.sqlite");

    const after = inspectFactoryIssuedMountedRuntimeCapture(capture);
    expect(after.portableStorage).toEqual(before.portableStorage);
    expect(after.mountedWorkspace).toBe(handle.mountedWorkspace);
    expect(Object.isFrozen(after.portableStorage)).toBe(true);
  });

  it("factory issued mounted runtime capture rejects nonportable handles before io", () => {
    const cwd = tempDir();
    const handle = track(createSqlitePrrRuntime({
      config: resolveLocalRuntimeConfig({ cwd, env: {} }),
      actor: actor()
    }));

    expect(() => captureFactoryIssuedMountedRuntime(handle)).toThrow(/portable mounted runtime/i);
  });

  it("factory issued mounted runtime capture rejects changed ledger and workspace identity before io", () => {
    const first = portableRuntime("ws_identity_first");
    const second = portableRuntime("ws_identity_second");
    const changedLedger = { ...first.handle, ledger: second.handle.ledger } as LocalRuntimeHandle;
    const changedWorkspace = { ...first.handle, mountedWorkspace: second.handle.mountedWorkspace } as LocalRuntimeHandle;

    expect(() => captureFactoryIssuedMountedRuntime(changedLedger)).toThrow(/factory-issued mounted runtime handle/i);
    expect(() => captureFactoryIssuedMountedRuntime(changedWorkspace)).toThrow(/factory-issued mounted runtime handle/i);
  });

  it("factory issued mounted runtime capture rejects copied capture identity", () => {
    const { handle } = portableRuntime("ws_capture_copy");
    const capture = captureFactoryIssuedMountedRuntime(handle);
    const copied = { ...capture } as FactoryIssuedMountedRuntimeCapture;

    expect(() => inspectFactoryIssuedMountedRuntimeCapture(copied)).toThrow(/factory-issued mounted runtime capture/i);
  });

  it("factory issued mounted runtime capture rejects close before capture", () => {
    const { handle } = portableRuntime("ws_closed_before_capture");
    handle.close();

    expect(() => captureFactoryIssuedMountedRuntime(handle)).toThrow(/closed/i);
  });

  it("factory issued mounted runtime capture burns captures on close after capture", () => {
    const { handle } = portableRuntime("ws_closed_after_capture");
    const capture = captureFactoryIssuedMountedRuntime(handle);
    handle.close();

    expect(() => inspectFactoryIssuedMountedRuntimeCapture(capture)).toThrow(/closed/i);
    expect(() => captureFactoryIssuedMountedRuntime(handle)).toThrow(/closed/i);
  });

  it("factory issued mounted runtime capture does not leak through reflection or serialization", () => {
    const { handle } = portableRuntime("ws_capture_leakage");
    const capture = captureFactoryIssuedMountedRuntime(handle);
    const deserialized = JSON.parse(JSON.stringify(capture)) as FactoryIssuedMountedRuntimeCapture;

    expect(Reflect.ownKeys(capture)).toEqual([]);
    expect(JSON.stringify(capture)).toBe("{}");
    expect(() => inspectFactoryIssuedMountedRuntimeCapture(deserialized)).toThrow(/factory-issued mounted runtime capture/i);
  });
});

function portableRuntime(workspaceId: string): {
  readonly config: ResolvedLocalRuntimeConfig;
  readonly handle: LocalRuntimeHandle;
  readonly workspaceRoot: string;
} {
  const cwd = tempDir();
  const workspaceRoot = join(cwd, workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: `Workspace ${workspaceId}`,
    createdAt: "2026-07-15T15:00:00.000Z",
    createdBy: "runtime-handle-mounted-authority-test"
  });
  const resolved = resolveLocalRuntimeConfig({
    cwd,
    env: {
      CESTUS_LOCAL_STORAGE: "portable-workspace",
      CESTUS_WORKSPACE_ROOT: workspaceRoot
    }
  });
  const config = {
    ...resolved,
    storage: { ...resolved.storage }
  } as ResolvedLocalRuntimeConfig;
  const handle = track(createSqlitePrrRuntime({ config, actor: actor() }));
  return { config, handle, workspaceRoot };
}

function actor() {
  return { id: "actor_runtime_handle_capture", kind: "human" as const, label: "Runtime Handle Capture Test" };
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-runtime-handle-capture-"));
  tempDirs.push(dir);
  return dir;
}

function track(handle: LocalRuntimeHandle): LocalRuntimeHandle {
  handles.push(handle);
  return handle;
}
