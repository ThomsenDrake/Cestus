import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { requestResidentSourceBoundaryApproval } from "../src/resident-source-boundary.js";
import { createAgentToolGateway } from "../src/tool-gateway.js";

describe("resident source boundary approval", () => {
  it("creates one human-review request with a structured path-free binding", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({
      ledger,
      actor: { id: "agent_default", kind: "agent", label: "Resident" },
      now: () => "2026-08-05T12:00:00.000Z"
    });
    const hash = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}` as `sha256:${string}`;
    const requested = await requestResidentSourceBoundaryApproval({
      gateway,
      toolRequestId: "toolreq_boundary_001",
      taskId: "task_boundary_001",
      runId: "run_boundary_001",
      workflowId: "workflow_001",
      workspaceId: "ws_001",
      sourceCollectionId: "src_001",
      sourceIdentity: "source_001",
      sourceRootHash: hash("1"),
      discoveryArtifactHash: hash("2"),
      discoveryHash: hash("3"),
      manifestArtifactHash: hash("4"),
      manifestHash: hash("5"),
      regularFileCount: 3,
      includedFileCount: 2,
      excludedFileCount: 1,
      totalBytes: 21
    });
    const event = (await ledger.readAll())[0];

    expect(requested.payload.requiredApprovalClass).toBe("human-review");
    expect(event?.type).toBe("agent.tool.requested");
    expect(JSON.stringify(event)).not.toContain("/selected");
    expect(event?.payload).toMatchObject({
      toolId: "ingestion.source-boundary.approve",
      residentSourceBoundary: { workflowId: "workflow_001", manifestHash: hash("5") }
    });
  });

  it("requires a human terminal denial and rejects an opposite terminal decision", async () => {
    const ledger = new InMemoryEventLedger();
    const gateway = createAgentToolGateway({
      ledger,
      actor: { id: "agent_default", kind: "agent", label: "Resident" },
      now: () => "2026-08-05T12:00:00.000Z"
    });
    const hash = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}` as `sha256:${string}`;
    const request = await requestResidentSourceBoundaryApproval({
      gateway, toolRequestId: "toolreq_boundary_002", taskId: "task_boundary_002", runId: "run_boundary_002",
      workflowId: "workflow_002", workspaceId: "ws_002", sourceCollectionId: "src_002", sourceIdentity: "source_002",
      sourceRootHash: hash("1"), discoveryArtifactHash: hash("2"), discoveryHash: hash("3"),
      manifestArtifactHash: hash("4"), manifestHash: hash("5"), regularFileCount: 1, includedFileCount: 1, excludedFileCount: 0, totalBytes: 8
    });
    await expect(gateway.denyTool({
      toolRequestId: "toolreq_boundary_002", actor: { id: "agent_other", kind: "agent", label: "Other" }, rationale: "No."
    })).rejects.toThrow(/human/i);
    await gateway.denyTool({
      toolRequestId: "toolreq_boundary_002", actor: { id: "actor_human", kind: "human", label: "Reviewer" }, rationale: "Human denied this exact boundary."
    });
    await expect(gateway.approveTool({
      toolRequestId: "toolreq_boundary_002", approvedPreviewHash: request.payload.previewHash,
      actor: { id: "actor_human", kind: "human", label: "Reviewer" }, rationale: "Cannot reverse terminal denial."
    })).rejects.toThrow(/denied|closed/i);
    expect((await ledger.readAll()).filter((event) => event.type === "agent.tool.denied")).toHaveLength(1);
  });
});
