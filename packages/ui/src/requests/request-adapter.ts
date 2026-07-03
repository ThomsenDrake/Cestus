import type { KnowledgeEvent } from "../../../ontology/src/contracts.js";
import { buildPrrProjection } from "../../../prr/src/projection.js";
import { buildPrrWorkspaceDto, type PrrWorkspaceDto } from "../../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../../prr/src/workspace-seed.js";

export interface RequestsWorkspaceAdapter {
  loadRequestsWorkspace(): Promise<PrrWorkspaceDto>;
}

export function createLocalReplayRequestsAdapter(seedEvents: readonly KnowledgeEvent[]): RequestsWorkspaceAdapter {
  const events = seedEvents.map((event) => structuredClone(event));

  return Object.freeze({
    async loadRequestsWorkspace() {
      return buildPrrWorkspaceDto(buildPrrProjection(events));
    }
  });
}

export function createStaticRequestsAdapter(workspace: PrrWorkspaceDto): RequestsWorkspaceAdapter {
  return Object.freeze({
    async loadRequestsWorkspace() {
      return workspace;
    }
  });
}

export const localReplayRequestsAdapter = createLocalReplayRequestsAdapter(prrWorkspaceSeedEvents);

export function loadRequestsWorkspace(): Promise<PrrWorkspaceDto> {
  return localReplayRequestsAdapter.loadRequestsWorkspace();
}
