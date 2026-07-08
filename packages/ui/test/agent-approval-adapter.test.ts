import { describe, expect, it, vi } from "vitest";
import {
  agentApprovalCockpitFromJson,
  createHttpAgentAdapter,
  createStaticAgentAdapter
} from "../src/agent/agent-adapter.js";
import type { AgentApprovalCockpitDto, AgentStatusDto } from "../src/agent/agent-types.js";

const previewHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("agent approval cockpit adapter", () => {
  it("loads approval cockpit from the local runtime API", async () => {
    const payload = approvalCockpit();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    const adapter = createHttpAgentAdapter({
      baseUrl: "http://127.0.0.1:8787",
      authToken: "local-runtime-token",
      credentials: "include",
      fetcher
    });

    await expect(adapter.loadApprovalCockpit()).resolves.toEqual(payload);
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8787/api/agent/approvals", {
      credentials: "include",
      headers: { authorization: "Bearer local-runtime-token" },
      method: "GET"
    });
  });

  it("calls approve and deny decision routes without execution routes", async () => {
    const calls: Array<readonly [RequestInfo | URL, RequestInit | undefined]> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init]);
      return new Response(JSON.stringify({
        ok: true,
        schemaVersion: "agent-approval-decision-result.v1",
        eventIds: ["evt_agent_tool_decision"],
        approvalCockpit: approvalCockpit({ pendingCount: 0 })
      }), { status: 200 });
    });
    const adapter = createHttpAgentAdapter({ fetcher });

    await adapter.approveToolRequest({
      toolRequestId: "toolreq_provider_transfer",
      approvedPreviewHash: previewHash,
      rationale: "Approved the exact preview."
    });
    await adapter.denyToolRequest({
      toolRequestId: "toolreq_provider_transfer",
      rationale: "Need a narrower preview."
    });

    expect(calls.map(([url]) => String(url))).toEqual([
      "/api/agent/approvals/toolreq_provider_transfer/approve",
      "/api/agent/approvals/toolreq_provider_transfer/deny"
    ]);
    expect(calls.map(([, init]) => init?.method)).toEqual(["POST", "POST"]);
    expect(
      calls
        .map(([url]) => String(url).replace(/toolreq_[^/]+/g, "toolreq_id"))
        .join("\n")
    ).not.toMatch(/send|transfer|export|repair|legal|accept/i);
  });

  it("redacts unsafe runtime text before parsing cockpit DTOs", () => {
    const cockpit = agentApprovalCockpitFromJson(approvalCockpit({
      unsafeSummary: "Provider returned bearer raw-value from /tmp/secret-agent"
    }));

    expect(JSON.stringify(cockpit)).not.toMatch(/raw-value|\/tmp\/secret-agent|bearer/i);
  });

  it("supports static adapters for component and app tests", async () => {
    const adapter = createStaticAgentAdapter(agentStatus(), approvalCockpit());

    await expect(adapter.loadApprovalCockpit()).resolves.toMatchObject({
      schemaVersion: "agent-approval-cockpit.v1"
    });
  });
});

function agentStatus(): AgentStatusDto {
  return {
    schemaVersion: "agent-status.v1",
    generatedAt: "2026-07-08T15:00:00.000Z",
    tasks: [],
    runs: [],
    toolRequests: [],
    activeMemory: [],
    permissions: [],
    locks: [],
    providers: [],
    pendingApprovalCount: 0,
    activeLockCount: 0,
    diagnostics: []
  };
}

function approvalCockpit(
  input: { readonly pendingCount?: number; readonly unsafeSummary?: string } = {}
): AgentApprovalCockpitDto {
  const pending: AgentApprovalCockpitDto["queue"]["pending"] = input.pendingCount === 0 ? [] : [{
    toolRequestId: "toolreq_provider_transfer",
    runId: "run_provider_transfer",
    taskId: "task_provider_transfer",
    toolId: "provider.bytes.transfer",
    toolVersion: "1",
    sideEffectClass: "external-byte-transfer",
    approvalClass: "provider-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    previewHash,
    previewSummary: input.unsafeSummary ?? "Provider byte-transfer preview.",
    requestedAt: "2026-07-08T14:59:00.000Z",
    stale: false,
    executableByApproval: false,
    providerByteTransferNote: "Approval records a decision only; it does not transfer provider bytes.",
    staleness: {
      state: "current",
      approvable: true
    },
    approvalContract: {
      requiredApprovalClass: "provider-byte-transfer",
      approvalRouteAppendsOnly: true,
      denialRouteAppendsOnly: true,
      rationaleRequired: true,
      rationaleSecretSafe: true,
      afterApproval: "A separate scheduler revalidates the exact preview hash before any execution."
    },
    review: {
      what: "Selected evidence excerpts for provider processing.",
      why: "The resident agent requested model assistance for the selected evidence.",
      dataLeavesOrChanges: input.unsafeSummary ?? "Provider byte-transfer preview.",
      evidenceRefs: [],
      artifactRefs: [],
      riskAndLockStatus: "No active locks. Preview is current.",
      whatHappensAfterApproval: "A separate scheduler may resume after consume-time validation.",
      staleOrUnsafePrevention: ["Exact preview hash binding", "Human-only approval", "Active lock checks"]
    },
    affectedRefs: [],
    contextPackRefs: [],
    activeLocks: [],
    blockingReasons: [],
    risk: {
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      previewSummary: input.unsafeSummary ?? "Provider byte-transfer preview.",
      affectedRefs: [],
      contextPackRefs: [],
      activeLocks: [],
      blockingReasons: []
    }
  }];
  return {
    schemaVersion: "agent-approval-cockpit.v1",
    generatedAt: "2026-07-08T15:00:00.000Z",
    summary: {
      pendingCount: pending.length,
      resumableCount: 0,
      blockedCount: 0,
      staleCount: 0,
      terminalCount: 0
    },
    decisionContract: {
      approvalAppendsDecisionOnly: true,
      denialAppendsDecisionOnly: true,
      requiresHumanActor: true,
      afterApproval: "Approval records a human decision only. A separate scheduler revalidates the exact preview hash before work.",
      forbiddenDirectEffects: [
        "provider-byte-transfer",
        "prr-send-followup",
        "legal-escalation",
        "export-publication",
        "destructive-repair",
        "accepted-graph-review"
      ]
    },
    approvalClasses: [{
      approvalClass: "provider-byte-transfer",
      label: "Provider byte transfer",
      requiredFor: "Sending selected evidence/artifact bytes to the configured provider.",
      providerByteTransferNote: "Approval itself transfers no bytes.",
      rationale: { required: true, secretSafe: true }
    }],
    queue: {
      generatedAt: "2026-07-08T15:00:00.000Z",
      pending,
      resumable: [],
      blocked: [],
      stale: [],
      denied: [],
      completed: [],
      failed: []
    },
    forbiddenDirectEffects: [
      "provider-byte-transfer",
      "prr-send-followup",
      "legal-escalation",
      "export-publication",
      "destructive-repair",
      "accepted-graph-review"
    ]
  } as AgentApprovalCockpitDto;
}
