import { describe, expect, it } from "vitest";
import { buildAgentProjection } from "../src/projection.js";
import { goldenAgentLedgerEvents } from "./fixtures/golden-agent-ledger.js";

describe("buildAgentProjection", () => {
  it("rebuilds resident identity, tasks, runs, tools, memory, permissions, and locks", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);

    expect(projection.identity?.residentAgentId).toBe("agent_default");
    expect(projection.tasks.get("task_provider_readiness")?.status).toBe("waiting-for-approval");
    expect(projection.runs.get("run_provider_readiness")?.runType).toBe("evidence-triage");
    expect(projection.toolRequests.get("toolreq_provider_preview")?.state).toBe("requested");
    expect(projection.activeMemory.map((memory) => memory.memoryId)).toEqual(["mem_workspace_policy"]);
    expect(projection.permissions.get("perm_read_workspace")?.state).toBe("granted");
    expect(projection.locks.get("lock_legal_escalation")?.state).toBe("active");
  });

  it("is deterministic across replay and preserves memory history after retraction", () => {
    const first = buildAgentProjection(goldenAgentLedgerEvents);
    const second = buildAgentProjection([...goldenAgentLedgerEvents]);

    expect(JSON.stringify(first.toDto())).toEqual(JSON.stringify(second.toDto()));
    expect(first.memoryHistory.get("mem_retracted_context")?.state).toBe("retracted");
    expect(first.activeMemory.some((memory) => memory.memoryId === "mem_retracted_context")).toBe(false);
  });

  it("does not let public map mutations change replayed projection state", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);

    tryRuntimeMapClear(projection.tasks);
    tryRuntimeMapClear(projection.runs);
    tryRuntimeMapClear(projection.toolRequests);
    tryRuntimeMapClear(projection.memoryHistory);
    tryRuntimeMapClear(projection.permissions);
    tryRuntimeMapClear(projection.locks);

    expect(projection.tasks.get("task_provider_readiness")?.status).toBe("waiting-for-approval");
    expect(projection.runs.get("run_provider_readiness")?.runType).toBe("evidence-triage");
    expect(projection.toolRequests.get("toolreq_provider_preview")?.state).toBe("requested");
    expect(projection.memoryHistory.get("mem_workspace_policy")?.state).toBe("active");
    expect(projection.permissions.get("perm_read_workspace")?.state).toBe("granted");
    expect(projection.locks.get("lock_legal_escalation")?.state).toBe("active");

    expect(projection.toDto().tasks.map((task) => task.taskId)).toContain("task_provider_readiness");
    expect(projection.toDto().runs.map((run) => run.runId)).toContain("run_provider_readiness");
    expect(projection.toDto().toolRequests.map((toolRequest) => toolRequest.toolRequestId)).toContain("toolreq_provider_preview");
    expect(projection.toDto().permissions.map((permission) => permission.permissionId)).toContain("perm_read_workspace");
    expect(projection.toDto().locks.map((lock) => lock.lockId)).toContain("lock_legal_escalation");
  });

  it("tracks tool request transitions with full provenance", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);

    const completedTool = projection.toolRequests.get("toolreq_provider_transfer");
    expect(completedTool?.state).toBe("completed");
    expect(completedTool?.approvedBy).toBe("actor_case_owner");
    expect(completedTool?.resultEventIds).toEqual(["evt_agent_fixture_evidence"]);
    expect(completedTool?.eventIds).toEqual([
      "evt_agent_tool_requested_provider_transfer",
      "evt_agent_tool_approved_provider_transfer",
      "evt_agent_tool_completed_provider_transfer"
    ]);
    expect(completedTool?.causationIds).toEqual([
      "evt_agent_run_started_provider_readiness",
      "evt_agent_tool_requested_provider_transfer",
      "evt_agent_tool_approved_provider_transfer"
    ]);

    const deniedTool = projection.toolRequests.get("toolreq_export_denied");
    expect(deniedTool?.state).toBe("denied");
    expect(deniedTool?.deniedBy).toBe("actor_case_owner");
    expect(deniedTool?.eventIds).toEqual([
      "evt_agent_tool_requested_export_denied",
      "evt_agent_tool_denied_export_denied"
    ]);

    const failedTool = projection.toolRequests.get("toolreq_local_failed");
    expect(failedTool?.state).toBe("failed");
    expect(failedTool?.failureCategory).toBe("projection-lag");
    expect(failedTool?.allowedActions).toEqual(["rebuild the stale projection before retrying"]);
    expect(failedTool?.eventIds).toEqual([
      "evt_agent_tool_requested_local_failed",
      "evt_agent_tool_failed_local_failed"
    ]);
  });

  it("tracks memory supersession, permission revocation, and lock clearing", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);

    const supersededMemory = projection.memoryHistory.get("mem_superseded_context");
    expect(supersededMemory?.state).toBe("superseded");
    expect(supersededMemory?.supersededByMemoryId).toBe("mem_workspace_policy");
    expect(supersededMemory?.eventIds).toEqual([
      "evt_agent_memory_recorded_superseded_context",
      "evt_agent_memory_superseded_context"
    ]);
    expect(projection.activeMemory.some((memory) => memory.memoryId === "mem_superseded_context")).toBe(false);

    const revokedPermission = projection.permissions.get("perm_export_review");
    expect(revokedPermission?.state).toBe("revoked");
    expect(revokedPermission?.revokedBy).toBe("actor_case_owner");
    expect(revokedPermission?.eventIds).toEqual([
      "evt_agent_permission_granted_export_review",
      "evt_agent_permission_revoked_export_review"
    ]);

    const clearedLock = projection.locks.get("lock_export_review");
    expect(clearedLock?.state).toBe("cleared");
    expect(clearedLock?.clearedBy).toBe("actor_case_owner");
    expect(clearedLock?.clearRelatedEventIds).toEqual(["evt_agent_tool_denied_export_denied"]);
    expect(clearedLock?.eventIds).toEqual([
      "evt_agent_lock_activated_export_review",
      "evt_agent_lock_cleared_export_review"
    ]);
  });

  it("tracks run completion and failure paths with provenance and related event IDs", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);

    const completedRun = projection.runs.get("run_completed_triage");
    expect(completedRun?.state).toBe("completed");
    expect(completedRun?.outputArtifactHashes).toEqual([
      "sha256:5555555555555555555555555555555555555555555555555555555555555555"
    ]);
    expect(completedRun?.relatedEventIds).toEqual(["evt_agent_tool_completed_provider_transfer"]);
    expect(completedRun?.eventIds).toEqual([
      "evt_agent_run_started_completed_triage",
      "evt_agent_run_completed_completed_triage"
    ]);
    expect(completedRun?.causationIds).toEqual([
      "evt_agent_task_created_provider_readiness",
      "evt_agent_tool_completed_provider_transfer"
    ]);

    const failedRun = projection.runs.get("run_failed_triage");
    expect(failedRun?.state).toBe("failed");
    expect(failedRun?.failureCategory).toBe("projection-lag");
    expect(failedRun?.retryable).toBe(true);
    expect(failedRun?.eventIds).toEqual([
      "evt_agent_run_started_failed_triage",
      "evt_agent_run_failed_failed_triage"
    ]);
    expect(failedRun?.causationIds).toEqual([
      "evt_agent_task_created_provider_readiness",
      "evt_agent_run_started_failed_triage"
    ]);
  });
});

function tryRuntimeMapClear(map: ReadonlyMap<string, unknown>): void {
  try {
    (map as unknown as { clear?: () => void }).clear?.call(map);
  } catch {
    // Immutable map snapshots may reject runtime mutation attempts.
  }
}
