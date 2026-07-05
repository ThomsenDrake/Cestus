import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { createStaticRequestsAdapter } from "../src/requests/request-adapter.js";

export function buildTestRequestsWorkspace() {
  return buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
    now: "2026-07-20T12:00:00.000Z"
  });
}

export function createTestRequestsAdapter() {
  return createStaticRequestsAdapter(buildTestRequestsWorkspace());
}
