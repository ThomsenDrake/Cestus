import { describe, expect, it, vi } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
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

  it("keeps ordinary route responses path-free while authenticated human review reads the exact protected artifacts", async () => {
    const workspace = createFakeMountedWorkspace();
    const root = join(workspace.rootDir, "selected");
    mkdirSync(root);
    const resolve = vi.fn(async () => ({ ok: true as const, workspace }));
    const human = { id: "actor_human", kind: "human" as const, label: "Reviewer" };
    const discover = await handleIngestionHttpRoute({
      request: { method: "POST", url: "/api/ingestion/resident-source-boundaries/discover", body: JSON.stringify({ workflowId: "workflow_route_001", sourceCollectionId: "src_route_001", sourceRoot: root }) },
      actor: human, ingestionMountResolver: { resolve }
    });
    expect(discover?.status).toBe(200);
    expect(discover?.body).not.toContain(root);
    const discovery = JSON.parse(discover?.body ?? "{}") as { discoveryArtifactHash: string };
    const protectedDiscovery = await handleIngestionHttpRoute({
      request: { method: "GET", url: `/api/ingestion/resident-source-boundaries/discoveries/${discovery.discoveryArtifactHash}` }, actor: human, ingestionMountResolver: { resolve }
    });
    expect(protectedDiscovery?.status).toBe(200);
    expect(protectedDiscovery?.body).toContain(root);
    const proposal = await handleIngestionHttpRoute({
      request: { method: "POST", url: "/api/ingestion/resident-source-boundaries/propose", body: JSON.stringify({ workflowId: "workflow_route_001", discoveryArtifactHash: discovery.discoveryArtifactHash, includedRelativePaths: [], excludedRelativePaths: [], toolRequestId: "toolreq_route_001", taskId: "task_route_001", runId: "run_route_001" }) },
      actor: human, ingestionMountResolver: { resolve }
    });
    expect(proposal?.status).toBe(200);
    expect(proposal?.body).not.toContain(root);
    const boundary = JSON.parse(proposal?.body ?? "{}") as { manifestArtifactHash: string };
    const protectedBoundary = await handleIngestionHttpRoute({
      request: { method: "GET", url: `/api/ingestion/resident-source-boundaries/manifests/${boundary.manifestArtifactHash}` }, actor: human, ingestionMountResolver: { resolve }
    });
    expect(protectedBoundary?.status).toBe(200);
    expect(JSON.parse(protectedBoundary?.body ?? "{}")?.archivePolicy).toBe("reject");
    expect((await workspace.ledger.readAll()).map((event) => event.type)).toEqual(["agent.tool.requested"]);
  });
});
