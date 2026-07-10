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
  let closed = false;

  return Object.freeze({
    runtime,
    ledger,
    config: dependencies.config,
    residentIdentity,
    ...(resolvedStorage.mountedWorkspace === undefined
      ? {}
      : { mountedWorkspace: resolvedStorage.mountedWorkspace }),
    close() {
      if (closed) {
        return;
      }
      closed = true;
      ledger.close();
    }
  });
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
