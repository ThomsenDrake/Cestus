import { describe, expect, it, vi } from "vitest";
import { handleIngestionHttpRoute } from "../src/ingestion-http-routes.js";
import { createFakeMountedWorkspace } from "../../ingestion/test/runtime-test-helpers.js";

describe("resident source boundary routes", () => {
  it("rejects a non-human source-boundary request before it can discover or write a derivative", async () => {
    const workspace = createFakeMountedWorkspace();
    const resolve = vi.fn(async () => ({ ok: true as const, workspace }));
    const response = await handleIngestionHttpRoute({
      request: {
        method: "POST",
        url: "/api/ingestion/resident-source-boundaries/discover",
        body: JSON.stringify({ workflowId: "workflow_001", sourceCollectionId: "src_001", sourceIdentity: "source_001", sourceRoot: "/selected" })
      },
      actor: { id: "agent_default", kind: "agent", label: "Resident" },
      ingestionMountResolver: { resolve }
    });
    expect(response?.status).toBe(403);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(await workspace.ledger.readAll()).toEqual([]);
  });
});
