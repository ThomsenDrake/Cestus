import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import {
  createPrrRuntime,
  type PrrRuntime,
  type PrrRuntimeDependencies
} from "../../prr/src/runtime.js";
import type { ResolvedLocalRuntimeConfig } from "./config.js";

export interface LocalRuntimeFactoryDependencies extends Omit<PrrRuntimeDependencies, "ledger"> {
  readonly config: ResolvedLocalRuntimeConfig;
}

export interface LocalRuntimeHandle {
  readonly runtime: PrrRuntime;
  close(): void;
}

export function createSqlitePrrRuntime(
  dependencies: LocalRuntimeFactoryDependencies
): LocalRuntimeHandle {
  const ledger = new SQLiteEventLedger(dependencies.config.storage.sqlitePath);
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
    close() {
      ledger.close();
    }
  });
}
