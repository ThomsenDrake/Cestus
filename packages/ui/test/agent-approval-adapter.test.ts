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
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
      approvedPreviewHash: previewHash,
      rationale: "Approved the exact preview."
    });
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({
      rationale: "Need a narrower preview."
    });
    expect(
      calls
        .map(([url]) => String(url).replace(/toolreq_[^/]+/g, "toolreq_id"))
        .join("\n")
    ).not.toMatch(/send|transfer|export|repair|legal|accept/i);
  });

  it("redacts non-url absolute paths before parsing cockpit DTOs while keeping safe text", () => {
    const cockpit = agentApprovalCockpitFromJson(approvalCockpit({
      unsafeSummary: [
        "Review note kept for operators.",
        "See https://example.com/case-7/report.pdf for the public source.",
        "Local copies at /workspace/case-7/report.pdf, /repo/foo, and /data/export must stay hidden.",
        "Provider returned bearer raw-value."
      ].join(" ")
    }));
    const serialized = JSON.stringify(cockpit);

    expect(serialized).not.toMatch(/raw-value|bearer|\/workspace\/case-7\/report\.pdf|\/repo\/foo|\/data\/export/i);
    expect(serialized).toContain("Review note kept for operators.");
    expect(serialized).toContain("https://example.com/case-7/report.pdf");
    expect(serialized).toContain("[path redacted]");
  });

  it("redacts non-url absolute paths from approval cockpit diagnostics", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({
        error: {
          message: "Approval cockpit log at /data/export came from /repo/foo after reviewing https://example.com/case-7/report.pdf"
        }
      }), { status: 500 })
    );
    const adapter = createHttpAgentAdapter({ fetcher });

    await expect(adapter.loadApprovalCockpit()).rejects.toThrow(
      "Approval cockpit log at [path redacted] came from [path redacted] after reviewing https://example.com/case-7/report.pdf"
    );
  });

  it("accepts future approval class identifiers at extensible DTO boundaries", () => {
    const cockpit = agentApprovalCockpitFromJson(futureApprovalCockpitJson());

    expect(cockpit.decisionContract.forbiddenDirectEffects).toContain("future-export-repair");
    expect(cockpit.forbiddenDirectEffects).toContain("future-export-repair");
    expect(cockpit.approvalClasses[0]?.approvalClass).toBe("future-export-repair");
    expect(cockpit.queue.pending[0]?.approvalClass).toBe("future-export-repair");
    expect(cockpit.queue.pending[0]?.requiredApprovalClass).toBe("future-export-repair");
    expect(cockpit.queue.pending[0]?.approvalContract.requiredApprovalClass).toBe("future-export-repair");
    expect(cockpit.queue.pending[0]?.risk.approvalClass).toBe("future-export-repair");
    expect(cockpit.queue.pending[0]?.activeLocks[0]?.appliesToApprovalClasses).toEqual(["future-export-repair"]);
  });

  it.each(["none", "human-review"])(
    "rejects sentinel approval identifiers at extensible DTO boundaries: %s",
    (approvalClass) => {
      expect(() => agentApprovalCockpitFromJson(sentinelApprovalCockpitJson(approvalClass))).toThrow();
    }
  );

  it("rejects accessor-backed cockpit fields without surfacing getter secrets", () => {
    const payload = approvalCockpit() as unknown as Record<string, unknown>;
    Object.defineProperty(payload, "queue", {
      enumerable: true,
      get() {
        throw new Error("sk_live_getter_secret from /tmp/cockpit-getter");
      }
    });

    const message = thrownMessage(() => agentApprovalCockpitFromJson(payload));

    expect(message).toMatch(/accessor|descriptor|dto/i);
    expect(message).not.toMatch(/sk_live|getter_secret|\/tmp\/cockpit-getter/i);
  });

  it("rejects accessor-backed cockpit arrays and prototypes without invoking them", async () => {
    const arrayPayload = approvalCockpit() as unknown as Record<string, unknown>;
    const queue = (arrayPayload.queue as Record<string, unknown>);
    const pending = [] as unknown[];
    Object.defineProperty(pending, "0", {
      enumerable: true,
      get() {
        throw new Error("DATABASE_PASSWORD array accessor");
      }
    });
    queue.pending = pending;

    const baseCockpit = approvalCockpit() as unknown as Record<string, unknown>;
    const protoPayload = Object.create({
      get approvalClasses() {
        throw new Error("GOOGLE_APPLICATION_CREDENTIALS prototype accessor");
      }
    }) as Record<string, unknown>;
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(baseCockpit))) {
      if (key === "approvalClasses") {
        continue;
      }
      Object.defineProperty(protoPayload, key, descriptor);
    }

    expect(thrownMessage(() => agentApprovalCockpitFromJson(arrayPayload))).toMatch(/accessor|descriptor|dto/i);
    expect(thrownMessage(() => agentApprovalCockpitFromJson(protoPayload))).toMatch(/accessor|prototype|descriptor|dto/i);

    expect(
      thrownMessage(() => createStaticAgentAdapter(agentStatus(), protoPayload as unknown as AgentApprovalCockpitDto))
    ).toMatch(/accessor|prototype|descriptor|dto/i);
  });

  it("rejects non-enumerable accessor-backed cockpit fields without surfacing getter secrets", () => {
    const payload = approvalCockpit() as unknown as Record<string, unknown>;
    Object.defineProperty(payload, "queue", {
      enumerable: false,
      get() {
        throw new Error("OPENAI_API_KEY from /tmp/non-enumerable-getter");
      }
    });

    const message = thrownMessage(() => agentApprovalCockpitFromJson(payload));

    expect(message).toMatch(/accessor|descriptor|dto/i);
    expect(message).not.toMatch(/OPENAI_API_KEY|non-enumerable-getter|\/tmp\/non-enumerable-getter/i);
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
    identityLifecycle: {
      schemaVersion: "resident-identity-lifecycle.v1",
      state: "not-mounted",
      residentAgentId: "agent_default",
      initialized: false,
      eventIds: [],
      safeMessage: "Resident identity is not mounted.",
      allowedRepairActions: ["mount a workspace before initializing the resident identity"]
    },
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

function futureApprovalCockpitJson(): unknown {
  const cockpit = JSON.parse(JSON.stringify(approvalCockpit())) as Record<string, unknown>;
  const approvalClass = "future-export-repair";
  return approvalClassCockpitJson(cockpit, approvalClass);
}

function sentinelApprovalCockpitJson(approvalClass: string): unknown {
  const cockpit = JSON.parse(JSON.stringify(approvalCockpit())) as Record<string, unknown>;
  return approvalClassCockpitJson(cockpit, approvalClass);
}

function approvalClassCockpitJson(
  cockpit: Record<string, unknown>,
  approvalClass: string
): Record<string, unknown> {
  const queue = cockpit.queue as Record<string, unknown>;
  const pending = queue.pending as Array<Record<string, unknown>>;
  const item = pending[0] as Record<string, unknown>;
  const approvalContract = item.approvalContract as Record<string, unknown>;
  const risk = item.risk as Record<string, unknown>;
  const activeLocks = item.activeLocks as Array<Record<string, unknown>>;
  const approvalClasses = cockpit.approvalClasses as Array<Record<string, unknown>>;

  cockpit.decisionContract = {
    ...(cockpit.decisionContract as Record<string, unknown>),
    forbiddenDirectEffects: [approvalClass]
  };
  cockpit.forbiddenDirectEffects = [approvalClass];
  approvalClasses[0] = {
    ...approvalClasses[0],
    approvalClass,
    label: "Future export repair",
    requiredFor: "Future extensible approval class coverage."
  };
  item.approvalClass = approvalClass;
  item.requiredApprovalClass = approvalClass;
  item.approvalContract = {
    ...approvalContract,
    requiredApprovalClass: approvalClass
  };
  item.risk = {
    ...risk,
    approvalClass
  };
  activeLocks[0] = {
    ...(activeLocks[0] ?? {
      lockId: "lock_future_export_repair",
      category: "governance",
      message: "Future approval class remains blocked until reviewed."
    }),
    appliesToApprovalClasses: [approvalClass]
  };

  return cockpit;
}

function thrownMessage(action: () => unknown): string {
  try {
    action();
    return "did not throw";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
