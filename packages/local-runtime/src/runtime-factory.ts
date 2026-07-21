import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import {
  blockedResidentIdentityLifecycle,
  ensureDefaultResidentIdentity,
  initializingResidentIdentityLifecycle,
  notMountedResidentIdentityLifecycle,
  type ResidentIdentityLifecycleDto
} from "../../agent/src/identity-bootstrap.js";
import {
  createPrrRuntime,
  type PrrRuntime,
  type PrrRuntimeDependencies,
  type PrrRuntimeNow
} from "../../prr/src/runtime.js";
import { mountPortableWorkspace, type MountedPortableWorkspace } from "../../workspace/src/index.js";
import type { ResolvedLocalRuntimeConfig } from "./config.js";

export interface LocalRuntimeFactoryDependencies extends Omit<PrrRuntimeDependencies, "ledger"> {
  readonly config: ResolvedLocalRuntimeConfig;
  readonly residentIdentityBootstrapForTest?: ResidentIdentityBootstrapExecutor;
}

export type ResidentIdentityBootstrapExecutor = (input: {
  readonly ledger: EventLedger;
  readonly workspaceId: string;
  readonly actor: ActorRef;
  readonly now: () => string;
}) => Promise<ResidentIdentityLifecycleDto>;

export interface LocalResidentIdentityBootstrap {
  lifecycle(): ResidentIdentityLifecycleDto;
  ready(): Promise<ResidentIdentityLifecycleDto>;
}

export interface LocalRuntimeHandle {
  readonly runtime: PrrRuntime;
  readonly ledger: EventLedger;
  readonly config: ResolvedLocalRuntimeConfig;
  readonly mountedWorkspace?: MountedPortableWorkspace;
  readonly residentIdentity: LocalResidentIdentityBootstrap;
  close(): void;
}

declare const factoryIssuedMountedRuntimeCaptureBrand: unique symbol;

/** Opaque identity minted only for an exact handle returned by this module. */
export interface FactoryIssuedMountedRuntimeCapture {
  readonly [factoryIssuedMountedRuntimeCaptureBrand]: "FactoryIssuedMountedRuntimeCapture.v1";
}

export interface FactoryIssuedMountedRuntimeCaptureInspection {
  readonly schemaVersion: "FactoryIssuedMountedRuntimeCapture.v1";
  readonly runtimeHandle: LocalRuntimeHandle;
  readonly ledger: EventLedger;
  readonly mountedWorkspace: MountedPortableWorkspace;
  readonly portableStorage: FactoryIssuedPortableStorageSnapshot;
  readonly workspace: FactoryIssuedMountedWorkspaceSnapshot;
  readonly sourceHighWater: FactoryIssuedMountedRuntimeSourceHighWater;
}

export interface FactoryIssuedPortableStorageSnapshot {
  readonly strategy: "portable-workspace";
  readonly workspaceRoot: string;
  readonly expectedWorkspaceId?: string;
  readonly sqlitePath: string;
}

export interface FactoryIssuedMountedWorkspaceSnapshot {
  readonly workspaceId: string;
  readonly rootDir: string;
  readonly manifestPath: string;
  readonly ledgerPath: string;
  readonly blobRoot: string;
  readonly derivativeRoot: string;
  readonly jobRoot: string;
  readonly projectionRoot: string;
  readonly cacheRoot: string;
  readonly configRoot: string;
}

/**
 * Task135D freezes the exact source from which later authority code derives a
 * high-water readback; it performs no ledger I/O itself.
 */
export interface FactoryIssuedMountedRuntimeSourceHighWater {
  readonly schemaVersion: "factory-issued-mounted-runtime-source-high-water.v1";
  readonly ledger: EventLedger;
  readonly workspaceId: string;
  readonly rootDir: string;
}

interface FactoryIssuedMountedRuntimeHandleState {
  readonly handle: LocalRuntimeHandle;
  readonly ledger: EventLedger;
  readonly mountedWorkspace?: MountedPortableWorkspace;
  readonly portableStorage?: FactoryIssuedPortableStorageSnapshot;
  readonly workspace?: FactoryIssuedMountedWorkspaceSnapshot;
  readonly sourceHighWater?: FactoryIssuedMountedRuntimeSourceHighWater;
  readonly captures: Set<FactoryIssuedMountedRuntimeCapture>;
  closed: boolean;
}

interface FactoryIssuedMountedRuntimeCaptureState {
  readonly handleState: FactoryIssuedMountedRuntimeHandleState;
  consumed: boolean;
  closed: boolean;
}

const factoryIssuedMountedRuntimeHandles = new WeakMap<LocalRuntimeHandle, FactoryIssuedMountedRuntimeHandleState>();
const factoryIssuedMountedRuntimeCaptures = new WeakMap<FactoryIssuedMountedRuntimeCapture, FactoryIssuedMountedRuntimeCaptureState>();

function sqlitePathFor(config: ResolvedLocalRuntimeConfig): {
  readonly sqlitePath: string;
  readonly mountedWorkspace?: MountedPortableWorkspace;
} {
  if (config.storage.strategy !== "portable-workspace") {
    return { sqlitePath: config.storage.sqlitePath };
  }

  const mounted = mountPortableWorkspace({
    rootDir: config.storage.workspaceRoot,
    ...(config.storage.expectedWorkspaceId === undefined
      ? {}
      : { expectedWorkspaceId: config.storage.expectedWorkspaceId })
  });
  if (!mounted.ok) {
    throw new Error(mounted.diagnostic.message);
  }

  return {
    sqlitePath: mounted.workspace.paths.ledgerPath,
    mountedWorkspace: mounted.workspace
  };
}

export function createSqlitePrrRuntime(
  dependencies: LocalRuntimeFactoryDependencies
): LocalRuntimeHandle {
  const resolvedStorage = sqlitePathFor(dependencies.config);
  const ledger = new SQLiteEventLedger(resolvedStorage.sqlitePath);
  const residentIdentity = createResidentIdentityBootstrap({
    ledger,
    workspaceId: resolvedStorage.mountedWorkspace?.workspaceId,
    actor: dependencies.actor,
    now: currentRuntimeNow(dependencies.now),
    ...(dependencies.residentIdentityBootstrapForTest === undefined
      ? {}
      : { bootstrap: dependencies.residentIdentityBootstrapForTest })
  });
  const runtime = createPrrRuntime({
    ledger,
    actor: dependencies.actor,
    ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
    ...(dependencies.requestIdFactory === undefined
      ? {}
      : { requestIdFactory: dependencies.requestIdFactory }),
    ...(dependencies.deadlineCalculator === undefined
      ? {}
      : { deadlineCalculator: dependencies.deadlineCalculator })
  });
  const handle: LocalRuntimeHandle = Object.freeze({
    runtime,
    ledger,
    config: dependencies.config,
    residentIdentity,
    ...(resolvedStorage.mountedWorkspace === undefined
      ? {}
      : { mountedWorkspace: resolvedStorage.mountedWorkspace }),
    close() {
      const state = factoryIssuedMountedRuntimeHandles.get(handle);
      if (state === undefined || state.closed) {
        return;
      }
      state.closed = true;
      for (const capture of state.captures) {
        const captureState = factoryIssuedMountedRuntimeCaptures.get(capture);
        if (captureState !== undefined) captureState.closed = true;
      }
      state.captures.clear();
      ledger.close();
    }
  });

  factoryIssuedMountedRuntimeHandles.set(handle, factoryIssuedMountedRuntimeHandleState(handle, ledger));
  return handle;
}

export function captureFactoryIssuedMountedRuntime(handle: LocalRuntimeHandle): FactoryIssuedMountedRuntimeCapture {
  const handleState = factoryIssuedMountedRuntimeHandles.get(handle);
  if (handleState === undefined) {
    throw new Error("factory-issued mounted runtime handle is required");
  }
  if (handleState.closed) {
    throw new Error("factory-issued mounted runtime handle is closed");
  }
  if (
    handleState.mountedWorkspace === undefined
    || handleState.portableStorage === undefined
    || handleState.workspace === undefined
    || handleState.sourceHighWater === undefined
  ) {
    throw new Error("factory-issued portable mounted runtime handle is required");
  }

  const capture = Object.freeze({}) as FactoryIssuedMountedRuntimeCapture;
  handleState.captures.add(capture);
  factoryIssuedMountedRuntimeCaptures.set(capture, {
    handleState,
    consumed: false,
    closed: false
  });
  return capture;
}

export function inspectFactoryIssuedMountedRuntimeCapture(
  capture: FactoryIssuedMountedRuntimeCapture
): FactoryIssuedMountedRuntimeCaptureInspection {
  const captureState = factoryIssuedMountedRuntimeCaptures.get(capture);
  if (captureState === undefined) {
    throw new Error("factory-issued mounted runtime capture is required");
  }
  const handleState = captureState.handleState;
  if (captureState.closed || handleState.closed) {
    throw new Error("factory-issued mounted runtime capture is closed");
  }
  if (captureState.consumed) {
    throw new Error("factory-issued mounted runtime capture is consumed");
  }
  captureState.consumed = true;
  handleState.captures.delete(capture);
  if (
    factoryIssuedMountedRuntimeHandles.get(handleState.handle) !== handleState
    || handleState.handle.ledger !== handleState.ledger
    || handleState.handle.mountedWorkspace !== handleState.mountedWorkspace
    || handleState.mountedWorkspace === undefined
    || handleState.portableStorage === undefined
    || handleState.workspace === undefined
    || handleState.sourceHighWater === undefined
  ) {
    throw new Error("factory-issued mounted runtime capture is no longer current");
  }

  return Object.freeze({
    schemaVersion: "FactoryIssuedMountedRuntimeCapture.v1",
    runtimeHandle: handleState.handle,
    ledger: handleState.ledger,
    mountedWorkspace: handleState.mountedWorkspace,
    portableStorage: handleState.portableStorage,
    workspace: handleState.workspace,
    sourceHighWater: handleState.sourceHighWater
  });
}

function factoryIssuedMountedRuntimeHandleState(
  handle: LocalRuntimeHandle,
  ledger: EventLedger
): FactoryIssuedMountedRuntimeHandleState {
  const mountedWorkspace = handle.mountedWorkspace;
  if (mountedWorkspace === undefined) {
    return { handle, ledger, captures: new Set(), closed: false };
  }
  if (handle.config.storage.strategy !== "portable-workspace") {
    throw new Error("portable mounted runtime configuration is required");
  }
  const storage = handle.config.storage;
  if (storage.workspaceRoot !== mountedWorkspace.rootDir || storage.sqlitePath !== mountedWorkspace.paths.ledgerPath) {
    throw new Error("portable mounted runtime configuration does not match mounted workspace");
  }
  const portableStorage = Object.freeze({
    strategy: "portable-workspace" as const,
    workspaceRoot: mountedWorkspace.rootDir,
    ...(storage.expectedWorkspaceId === undefined ? {} : { expectedWorkspaceId: storage.expectedWorkspaceId }),
    sqlitePath: mountedWorkspace.paths.ledgerPath
  });
  const workspace = Object.freeze({
    workspaceId: mountedWorkspace.workspaceId,
    rootDir: mountedWorkspace.rootDir,
    manifestPath: mountedWorkspace.manifestPath,
    ledgerPath: mountedWorkspace.paths.ledgerPath,
    blobRoot: mountedWorkspace.paths.blobRoot,
    derivativeRoot: mountedWorkspace.paths.derivativeRoot,
    jobRoot: mountedWorkspace.paths.jobRoot,
    projectionRoot: mountedWorkspace.paths.projectionRoot,
    cacheRoot: mountedWorkspace.paths.cacheRoot,
    configRoot: mountedWorkspace.paths.configRoot
  });
  const sourceHighWater = Object.freeze({
    schemaVersion: "factory-issued-mounted-runtime-source-high-water.v1" as const,
    ledger,
    workspaceId: mountedWorkspace.workspaceId,
    rootDir: mountedWorkspace.rootDir
  });

  return {
    handle,
    ledger,
    mountedWorkspace,
    portableStorage,
    workspace,
    sourceHighWater,
    captures: new Set(),
    closed: false
  };
}

function createResidentIdentityBootstrap(input: {
  readonly ledger: EventLedger;
  readonly workspaceId?: string | undefined;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly bootstrap?: ResidentIdentityBootstrapExecutor | undefined;
}): LocalResidentIdentityBootstrap {
  if (input.workspaceId === undefined) {
    const lifecycle = notMountedResidentIdentityLifecycle();
    return { lifecycle: () => lifecycle, ready: async () => lifecycle };
  }

  const workspaceId = input.workspaceId;
  let lifecycle = initializingResidentIdentityLifecycle(workspaceId);
  const runBootstrap = input.bootstrap ?? ensureDefaultResidentIdentity;
  let bootstrap: Promise<ResidentIdentityLifecycleDto>;
  try {
    bootstrap = runBootstrap({
      ledger: input.ledger,
      actor: input.actor,
      now: input.now,
      workspaceId
    });
  } catch {
    bootstrap = Promise.resolve(blockedLifecycle(workspaceId));
  }
  const ready = bootstrap.then((result) => {
    lifecycle = result;
    return result;
  }).catch(() => {
    lifecycle = blockedLifecycle(workspaceId);
    return lifecycle;
  });

  return { lifecycle: () => lifecycle, ready: () => ready };
}

function blockedLifecycle(workspaceId: string): ResidentIdentityLifecycleDto {
  return blockedResidentIdentityLifecycle({
    workspaceId,
    safeMessage: "Resident identity bootstrap failed during workspace open.",
    allowedRepairActions: ["close and reopen the workspace runtime", "inspect resident identity events before retrying"]
  });
}

function currentRuntimeNow(now?: PrrRuntimeNow): () => string {
  if (typeof now === "function") {
    return now;
  }
  if (now !== undefined) {
    return () => now;
  }
  return () => new Date().toISOString();
}
