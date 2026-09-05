/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { createStaticAgentAdapter } from "../src/agent/agent-adapter.js";
import type { AgentStatusDto } from "../src/agent/agent-types.js";
import { createStaticIngestionWorkspaceAdapter } from "../src/ingestion/ingestion-adapter.js";
import {
  createStaticOperatorStatusAdapter,
  runtimeUnavailableStatus,
  type OperatorStatusAdapter
} from "../src/operator-status/operator-status-adapter.js";
import type { OperatorStatusDto } from "../src/operator-status/operator-status-types.js";
import { createTestRequestsAdapter } from "./request-test-utils.js";

describe("operator cockpit app integration", () => {
  it("renders the operator cockpit as the default Command first viewport", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({ mounted: false, diagnostics: [] })}
        operatorStatusAdapter={createStaticOperatorStatusAdapter(operatorStatusFixture)}
      />
    );

    const cockpit = await screen.findByRole("region", { name: "Operator cockpit" });
    expect(within(cockpit).getByRole("tab", { name: /Workspace/ })).toBeInTheDocument();
    expect(within(cockpit).getByRole("tab", { name: /Ingestion/ })).toBeInTheDocument();
    expect(within(cockpit).getByRole("tab", { name: /Legacy Import/ })).toBeInTheDocument();
    expect(within(cockpit).getByRole("tab", { name: /PRR\/Investigations/ })).toBeInTheDocument();
    expect(within(cockpit).getByRole("tab", { name: /Agent/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Command" })).toBeInTheDocument();
  });

  it("opens the Ingestion module from the cockpit navigation action", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({ mounted: false, diagnostics: [] })}
        operatorStatusAdapter={createStaticOperatorStatusAdapter(operatorStatusFixture)}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Open ingestion" }));

    expect(await screen.findByRole("heading", { name: "Ingestion" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Ingestion workspace not connected" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Guided request builder" })).not.toBeInTheDocument();
  });

  it("opens the Agent module from the cockpit navigation action", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({ mounted: false, diagnostics: [] })}
        operatorStatusAdapter={createStaticOperatorStatusAdapter(operatorStatusFixture)}
        agentAdapter={createStaticAgentAdapter(agentStatusFixture)}
      />
    );

    fireEvent.click(await screen.findByRole("tab", { name: /Agent/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Open Agent" }));

    expect(await screen.findByRole("heading", { name: "Agent" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Resident agent workspace" })).toBeInTheDocument();
  });

  it("reloads operator status when the cockpit refresh action is clicked", async () => {
    const adapter: OperatorStatusAdapter = {
      loadStatus: vi.fn().mockResolvedValue(operatorStatusFixture)
    };

    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({ mounted: false, diagnostics: [] })}
        operatorStatusAdapter={adapter}
      />
    );

    await screen.findByRole("region", { name: "Operator cockpit" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh operator status" }));

    await waitFor(() => expect(adapter.loadStatus).toHaveBeenCalledTimes(2));
  });

  it("keeps an unavailable runtime state on Command without opening modal workflows", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({ mounted: false, diagnostics: [] })}
        operatorStatusAdapter={createStaticOperatorStatusAdapter(
          runtimeUnavailableStatus({
            generatedAt: "2026-07-06T23:30:00.000Z",
            message: "Operator runtime unavailable for test."
          })
        )}
      />
    );

    const cockpit = await screen.findByRole("region", { name: "Operator cockpit" });
    expect(within(cockpit).getAllByText(/unavailable/i).length).toBeGreaterThan(0);
    const runtimeSources = screen.getByRole("region", { name: "Command runtime source status" });
    const operatorSource = within(runtimeSources).getByRole("heading", { name: "Operator status" }).closest("li");
    expect(operatorSource).not.toBeNull();
    expect(within(operatorSource as HTMLElement).getByText("Unavailable")).toBeInTheDocument();
    expect(within(operatorSource as HTMLElement).getByText("Operator runtime unavailable for test.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Command" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Command workspace" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Command" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Ingestion" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("dialog", { name: "Guided request builder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /Request investigation detail/i })).not.toBeInTheDocument();
  });
});

const operatorStatusFixture: OperatorStatusDto = {
  schemaVersion: "operator-status.v1",
  generatedAt: "2026-07-06T23:30:00.000Z",
  runtime: {
    available: true,
    storageStrategy: "portable-workspace",
    bindMode: "loopback",
    workspaceMounted: true,
    safeMessage: "Local runtime is serving a mounted portable workspace."
  },
  summary: {
    overallState: "action-required",
    blockedCount: 0,
    actionRequiredCount: 1,
    degradedCount: 0,
    nextSafeActionId: "action_open_ingestion"
  },
  sections: [
    {
      sectionId: "workspace",
      label: "Workspace",
      state: "ready",
      headline: "Mounted portable workspace",
      safeSummary: "Workspace manifest, ledger, and blob roots are readable.",
      metrics: [{ metricId: "ledger_events", label: "Ledger events", value: "42", tone: "healthy" }],
      diagnostics: [],
      sourceEvidence: [
        {
          evidenceId: "src_workspace_verify",
          sourceContract: "workspace-ops.v1",
          sourceKind: "workspace-ops",
          label: "verify workspace",
          refs: [{ label: "workspaceId", value: "ws_case_001" }]
        }
      ],
      nextSafeActionIds: ["action_refresh_operator_status"]
    },
    {
      sectionId: "ingestion",
      label: "Ingestion",
      state: "action-required",
      headline: "Raw import approval waiting",
      safeSummary: "Open Ingestion to review approval-only import gates.",
      metrics: [{ metricId: "pending_jobs", label: "Pending jobs", value: "3", tone: "attention" }],
      diagnostics: [
        {
          diagnosticId: "diag_ingestion_review_waiting",
          severity: "warning",
          category: "ingestion",
          message: "Provider parser output needs operator review before import.",
          refs: [{ label: "jobId", value: "ingest_job_001" }]
        }
      ],
      sourceEvidence: [
        {
          evidenceId: "src_ingestion_runtime",
          sourceContract: "ingestion-runtime.v1",
          sourceKind: "ingestion",
          label: "ingestion readiness projection",
          refs: [{ label: "queue", value: "provider-review" }]
        }
      ],
      nextSafeActionIds: ["action_open_ingestion", "action_refresh_operator_status"]
    },
    {
      sectionId: "legacy-import",
      label: "Legacy Import",
      state: "degraded",
      headline: "Legacy samples are ready for review",
      safeSummary: "Legacy import remains evidence-first and does not accept graph truth.",
      metrics: [{ metricId: "accepted_truth", label: "Accepted legacy truth", value: "0", tone: "healthy" }],
      diagnostics: [],
      sourceEvidence: [
        {
          evidenceId: "src_legacy_readiness",
          sourceContract: "legacy.cestus.readiness.v1",
          sourceKind: "legacy-import",
          label: "legacy-readiness snapshot",
          refs: [{ label: "records", value: 18 }]
        }
      ],
      nextSafeActionIds: ["action_refresh_operator_status"]
    },
    {
      sectionId: "prr",
      label: "PRR/Investigations",
      state: "ready",
      headline: "Requests workspace replayed",
      safeSummary: "Drafts are visible, and no send or escalation action is available here.",
      metrics: [{ metricId: "active_requests", label: "Active requests", value: "7", tone: "neutral" }],
      diagnostics: [],
      sourceEvidence: [
        {
          evidenceId: "src_prr_projection",
          sourceContract: "prr-read-api.v1",
          sourceKind: "prr",
          label: "PRR workspace projection",
          refs: [{ label: "view", value: "command" }]
        }
      ],
      nextSafeActionIds: ["action_open_requests"]
    },
    {
      sectionId: "agent",
      label: "Agent",
      state: "ready",
      headline: "Resident agent ready",
      safeSummary: "Agent status is available without exposing execution controls.",
      metrics: [{ metricId: "pending_approvals", label: "Pending approvals", value: "0", tone: "healthy" }],
      diagnostics: [],
      sourceEvidence: [
        {
          evidenceId: "src_agent_status",
          sourceContract: "agent-status.v1",
          sourceKind: "agent",
          label: "resident agent status",
          refs: [{ label: "residentAgentId", value: "agent_default" }]
        }
      ],
      nextSafeActionIds: ["action_open_agents"]
    }
  ],
  safeActions: [
    {
      actionId: "action_open_ingestion",
      label: "Open ingestion",
      kind: "navigate",
      target: "ingestion",
      sourceContract: "operator-status.v1",
      requiresHumanApproval: false,
      mutatesCanonicalState: false,
      externalEffect: false,
      enabled: true
    },
    {
      actionId: "action_open_requests",
      label: "Open requests",
      kind: "navigate",
      target: "requests",
      sourceContract: "operator-status.v1",
      requiresHumanApproval: false,
      mutatesCanonicalState: false,
      externalEffect: false,
      enabled: true
    },
    {
      actionId: "action_refresh_operator_status",
      label: "Refresh operator status",
      kind: "refresh-status",
      sourceContract: "operator-status.v1",
      requiresHumanApproval: false,
      mutatesCanonicalState: false,
      externalEffect: false,
      enabled: true
    },
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

const agentStatusFixture: AgentStatusDto = {
  schemaVersion: "agent-status.v1",
  generatedAt: "2026-07-07T21:00:00.000Z",
  identityLifecycle: {
    schemaVersion: "resident-identity-lifecycle.v1",
    state: "ready",
    residentAgentId: "agent_default",
    workspaceId: "ws_case_001",
    initialized: true,
    eventIds: ["evt_agent_identity"],
    safeMessage: "Resident identity is ready.",
    allowedRepairActions: []
  },
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
  toolRequests: [],
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
      safeDataNotes: "Deterministic local fake provider for operator app tests."
    }
  ],
  pendingApprovalCount: 0,
  activeLockCount: 0,
  diagnostics: []
};
