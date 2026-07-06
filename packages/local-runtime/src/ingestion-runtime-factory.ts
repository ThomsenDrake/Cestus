import {
  createIngestionRuntime,
  type CreateIngestionRuntimeInput
} from "../../ingestion/src/runtime.js";
import type { MountedWorkspace } from "../../ingestion/src/mount-contract.js";

export type LocalIngestionRuntimeFactory = (input: {
  readonly mountedWorkspace: MountedWorkspace;
  readonly actor: CreateIngestionRuntimeInput["actor"];
}) => Partial<ReturnType<typeof createIngestionRuntime>>;

export const defaultLocalIngestionRuntimeFactory: LocalIngestionRuntimeFactory = ({
  mountedWorkspace,
  actor
}) => createIngestionRuntime({ mountedWorkspace, actor });
