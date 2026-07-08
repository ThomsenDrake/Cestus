/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { createStaticAgentAdapter, type AgentAdapter } from "../src/agent/agent-adapter.js";
import type { AgentApprovalCockpitDto } from "../src/agent/agent-types.js";
import type { AgentStatusDto } from "../src/agent/agent-types.js";
import { createStaticIngestionWorkspaceAdapter } from "../src/ingestion/ingestion-adapter.js";
import { createStaticOperatorStatusAdapter } from "../src/operator-status/operator-status-adapter.js";
import type { OperatorStatusDto } from "../src/operator-status/operator-status-types.js";
import { createTestRequestsAdapter } from "./request-test-utils.js";

describe("agent app integration", () => {
  it("opens the Agent module from first-class navigation", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({ mounted: false, diagnostics: [] })}
        operatorStatusAdapter={createStaticOperatorStatusAdapter(operatorStatus())}
        agentAdapter={createStaticAgentAdapter(agentStatus())}
      />
    );

    fireEvent.click(screen.getByRole("link", { name: "Agent" }));

    const workspace = await screen.findByRole("region", { name: "Resident agent workspace" });
    expect(within(workspace).getByText("Cestus Agent")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agent" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Agents Preview" })).not.toBeInTheDocument();
  });

  it("keeps the Agent workspace read-only even for risky tool requests", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({ mounted: false, diagnostics: [] })}
        operatorStatusAdapter={createStaticOperatorStatusAdapter(operatorStatus())}
        agentAdapter={createStaticAgentAdapter(agentStatus())}
      />
    );

    fireEvent.click(screen.getByRole("link", { name: "Agent" }));
    await screen.findByRole("region", { name: "Resident agent workspace" });

    expect(screen.queryByRole("button", { name: "New request" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve|deny|execute|send|export|repair|clear lock/i })).not.toBeInTheDocument();
    const workspace = screen.getByRole("region", { name: "Resident agent workspace" });
    expect(within(workspace).getAllByRole("button").map((button) => button.textContent)).toStrictEqual([
      "Refresh agent status"
    ]);
  });

  it("does not carry selected Command decision rail controls into the Agent module", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({ mounted: false, diagnostics: [] })}
        operatorStatusAdapter={createStaticOperatorStatusAdapter(operatorStatus())}
        agentAdapter={createStaticAgentAdapter(agentStatus())}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Select Miami-Dade Aviation Department stalling signal" }));
    expect(screen.getByRole("button", { name: "Back to agent brief" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Agent" }));

    const workspace = await screen.findByRole("region", { name: "Resident agent workspace" });
    expect(screen.queryByRole("button", { name: "Back to agent brief" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Decision rail" })).not.toBeInTheDocument();
    expect(within(workspace).getAllByRole("button").map((button) => button.textContent)).toStrictEqual([
      "Refresh agent status"
    ]);
  });

  it("approves provider byte-transfer previews through the Agent adapter only", async () => {
    const approvals: unknown[] = [];
    const adapter: AgentAdapter = {
      ...createStaticAgentAdapter(agentStatus(), approvalCockpit()),
      async approveToolRequest(input: unknown) {
        approvals.push(input);
        return {
          ok: true as const,
          schemaVersion: "agent-approval-decision-result.v1" as const,
          eventIds: ["evt_agent_tool_approved_provider_transfer"],
          approvalCockpit: approvalCockpit({ pendingCount: 0 })
        };
      }
    };

    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({ mounted: false, diagnostics: [] })}
        operatorStatusAdapter={createStaticOperatorStatusAdapter(operatorStatus())}
        agentAdapter={adapter}
      />
    );

    fireEvent.click(screen.getByRole("link", { name: "Agent" }));
    await screen.findByRole("region", { name: "Agent approval cockpit" });
    fireEvent.change(screen.getByLabelText("Decision rationale"), {
      target: { value: "Approved exact provider preview." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve exact preview" }));

    expect(approvals).toEqual([{
      toolRequestId: "toolreq_provider_transfer",
      approvedPreviewHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      rationale: "Approved exact provider preview."
    }]);
    expect(
      screen.queryByRole("button", { name: /transfer provider bytes|send prr|export|repair|clear lock|accept graph/i })
    ).not.toBeInTheDocument();
  });

  it("refreshes the Agent approval cockpit with agent status", async () => {
    let statusLoads = 0;
    let cockpitLoads = 0;
    const adapter: AgentAdapter = {
      ...createStaticAgentAdapter(agentStatus(), approvalCockpit()),
      async loadStatus() {
        statusLoads += 1;
        return agentStatus({
          generatedAt: statusLoads === 1 ? "2026-07-07T21:00:00.000Z" : "2026-07-07T21:05:00.000Z"
        });
      },
      async loadApprovalCockpit() {
        cockpitLoads += 1;
        return approvalCockpit({
          pendingCount: cockpitLoads === 1 ? 1 : 0
        });
      }
    };

    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({ mounted: false, diagnostics: [] })}
        operatorStatusAdapter={createStaticOperatorStatusAdapter(operatorStatus())}
        agentAdapter={adapter}
      />
    );

    fireEvent.click(screen.getByRole("link", { name: "Agent" }));
    const cockpit = await screen.findByRole("region", { name: "Agent approval cockpit" });
    expect(within(cockpit).getByText("1 request")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh agent status" }));

    const refreshedCockpit = await screen.findByRole("region", { name: "Agent approval cockpit" });
    expect(within(refreshedCockpit).getByText("0 visible requests")).toBeInTheDocument();
    expect(statusLoads).toBe(2);
    expect(cockpitLoads).toBe(2);
  });
});

function agentStatus(overrides: Partial<AgentStatusDto> = {}): AgentStatusDto {
  return {
    schemaVersion: "agent-status.v1",
    generatedAt: "2026-07-07T21:00:00.000Z",
    residentAgentId: "agent_default",
    identity: {
      residentAgentId: "agent_default",
      workspaceId: "ws_case_001",
      label: "Cestus Agent",
      policyId: "agent_policy_default",
      initializedBy: "actor_case_owner",
      allowedRunTypes: ["evidence-triage"],
      memoryProjectionVersion: "0.1.0",
      eventIds: ["evt_agent_identity"],
      causationIds: []
    },
    tasks: [],
    runs: [],
    toolRequests: [
      {
        toolRequestId: "toolreq_provider_transfer",
        runId: "run_provider_transfer",
        toolId: "provider.transfer.preview",
        toolVersion: "1",
        requestedBy: "actor_cestus_agent",
        sideEffectClass: "external-byte-transfer",
        requiredApprovalClass: "provider-byte-transfer",
        previewHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        scope: "workspace",
        estimatedEffect: "Provider byte-transfer preview.",
        state: "requested",
        requestedAt: "2026-07-07T21:01:00.000Z",
        sourceEventIds: ["evt_provider_preview"],
        inputArtifactHashes: [],
        resultEventIds: [],
        artifactHashes: [],
        readModelChanges: [],
        allowedActions: [],
        eventIds: ["evt_tool_requested_provider_transfer"],
        causationIds: []
      },
      {
        toolRequestId: "toolreq_external_message",
        runId: "run_prr_review",
        toolId: "prr.send.followup",
        toolVersion: "1",
        requestedBy: "actor_cestus_agent",
        sideEffectClass: "external-message-send",
        requiredApprovalClass: "external-message-send",
        previewHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
        scope: "prr",
        estimatedEffect: "External PRR follow-up send preview.",
        state: "requested",
        requestedAt: "2026-07-07T21:01:00.000Z",
        sourceEventIds: ["evt_prr_draft"],
        inputArtifactHashes: [],
        resultEventIds: [],
        artifactHashes: [],
        readModelChanges: [],
        allowedActions: [],
        eventIds: ["evt_tool_requested"],
        causationIds: []
      }
    ],
    activeMemory: [],
    permissions: [],
    locks: [],
    providers: [
      {
        providerId: "provider_fake_local",
        label: "Fake Local Model Provider",
        adapterVersion: "fake-provider.v1",
        endpointKind: "local-engine",
        modelFamilies: ["fake-local"],
        credentialKinds: ["local-no-secret"],
        supportsStructuredOutput: false,
        supportsToolCalling: false,
        safeDataNotes: "Deterministic local fake provider for app integration tests."
      }
    ],
    pendingApprovalCount: 1,
    activeLockCount: 0,
    diagnostics: [],
    ...overrides
  };
}

function approvalCockpit(input: { readonly pendingCount?: number } = {}): AgentApprovalCockpitDto {
  const pendingCount = input.pendingCount ?? 1;

  return {
    schemaVersion: "agent-approval-cockpit.v1",
    generatedAt: "2026-07-07T21:00:00.000Z",
    summary: {
      pendingCount,
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
    approvalClasses: [
      {
        approvalClass: "provider-byte-transfer",
        label: "Provider byte transfer",
        requiredFor: "Previewed provider byte transfer.",
        providerByteTransferNote: "Approval records the exact preview only.",
        rationale: {
          required: true,
          secretSafe: true
        }
      }
    ],
    queue: {
      generatedAt: "2026-07-07T21:00:00.000Z",
      pending: pendingCount === 0 ? [] : [
        {
          toolRequestId: "toolreq_provider_transfer",
          runId: "run_provider_transfer",
          taskId: "task_provider_transfer",
          toolId: "provider.transfer.preview",
          toolVersion: "1",
          sideEffectClass: "external-byte-transfer",
          approvalClass: "provider-byte-transfer",
          requiredApprovalClass: "provider-byte-transfer",
          previewHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          previewSummary: "Provider byte-transfer preview.",
          requestedAt: "2026-07-07T21:01:00.000Z",
          stale: false,
          executableByApproval: false,
          providerByteTransferNote: "Approval records the decision only; work resumes later after revalidation.",
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
            afterApproval: "Approval appends a decision only."
          },
          review: {
            what: "Transfer provider bytes for the reviewed preview.",
            why: "The resident agent needs a reviewed provider preview before any provider byte transfer can resume.",
            dataLeavesOrChanges: "A reviewed provider preview may later permit a provider byte transfer after runtime revalidation.",
            evidenceRefs: [{ kind: "event", id: "evt_provider_preview", label: "Provider preview event" }],
            artifactRefs: [{ kind: "artifact", id: "artifact_provider_preview", label: "Provider preview artifact" }],
            riskAndLockStatus: "No active locks. Approval appends a decision only.",
            whatHappensAfterApproval: "A separate scheduler may resume after exact preview hash revalidation.",
            staleOrUnsafePrevention: [
              "Exact preview hash binding",
              "Human-only approval",
              "Scheduler revalidates current state before work resumes"
            ]
          },
          affectedRefs: [{ kind: "tool-request", id: "toolreq_provider_transfer", label: "Provider transfer request" }],
          contextPackRefs: [],
          activeLocks: [],
          blockingReasons: [],
          risk: {
            sideEffectClass: "external-byte-transfer",
            approvalClass: "provider-byte-transfer",
            previewSummary: "Provider byte-transfer preview.",
            affectedRefs: [{ kind: "tool-request", id: "toolreq_provider_transfer", label: "Provider transfer request" }],
            contextPackRefs: [],
            activeLocks: [],
            blockingReasons: []
          }
        }
      ],
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
  };
}

function operatorStatus(): OperatorStatusDto {
  return {
    schemaVersion: "operator-status.v1",
    generatedAt: "2026-07-07T21:00:00.000Z",
    runtime: {
      available: true,
      safeMessage: "Local runtime is serving a mounted portable workspace."
    },
    summary: {
      overallState: "ready",
      blockedCount: 0,
      actionRequiredCount: 0,
      degradedCount: 0
    },
    sections: [
      {
        sectionId: "agent",
        label: "Agent",
        state: "ready",
        headline: "Resident agent ready",
        safeSummary: "Agent status is available.",
        metrics: [],
        diagnostics: [],
        sourceEvidence: [],
        nextSafeActionIds: ["action_open_agents"]
      }
    ],
    safeActions: [
      {
        actionId: "action_open_agents",
        label: "Open Agent",
        kind: "navigate",
        target: "agents",
        sourceContract: "agent-status.v1",
        requiresHumanApproval: false,
        mutatesCanonicalState: false,
        externalEffect: false,
        enabled: true
      }
    ]
  };
}
