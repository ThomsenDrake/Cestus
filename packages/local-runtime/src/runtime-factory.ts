import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import {
  createPrrRuntime,
  type PrrRuntime,
  type PrrRuntimeDependencies
} from "../../prr/src/runtime.js";
import { mountPortableWorkspace, type MountedPortableWorkspace } from "../../workspace/src/index.js";
import type { ResolvedLocalRuntimeConfig } from "./config.js";

export interface LocalRuntimeFactoryDependencies extends Omit<PrrRuntimeDependencies, "ledger"> {
  readonly config: ResolvedLocalRuntimeConfig;
}

export interface LocalRuntimeHandle {
  readonly runtime: PrrRuntime;
  readonly ledger: EventLedger;
  readonly mountedWorkspace?: MountedPortableWorkspace;
  close(): void;
}

function sqlitePathFor(config: ResolvedLocalRuntimeConfig): {
  readonly sqlitePath: string;
  readonly mountedWorkspace?: MountedPortableWorkspace;
} {
  if (config.storage.strategy !== "portable-workspace") {
    return { sqlitePath: config.storage.sqlitePath };
  }

  const mounted = mountPortableWorkspace({ rootDir: config.storage.workspaceRoot });
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

  return Object.freeze({
    runtime,
    ledger,
    ...(resolvedStorage.mountedWorkspace === undefined
      ? {}
      : { mountedWorkspace: resolvedStorage.mountedWorkspace }),
    close() {
      ledger.close();
    }
  });
}
