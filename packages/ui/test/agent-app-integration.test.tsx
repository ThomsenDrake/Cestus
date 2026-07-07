/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { createStaticAgentAdapter } from "../src/agent/agent-adapter.js";
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
});

function agentStatus(): AgentStatusDto {
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
    diagnostics: []
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
