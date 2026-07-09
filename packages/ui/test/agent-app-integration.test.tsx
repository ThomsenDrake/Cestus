/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { createStaticAgentAdapter, type AgentAdapter } from "../src/agent/agent-adapter.js";
import type {
  AgentApprovalCockpitDto,
  AgentCockpitDto,
  AgentStatusDto,
  OntologyBootstrapRouteDto
} from "../src/agent/agent-types.js";
import { createStaticIngestionWorkspaceAdapter } from "../src/ingestion/ingestion-adapter.js";
import { createStaticOperatorStatusAdapter } from "../src/operator-status/operator-status-adapter.js";
import type { OperatorStatusDto } from "../src/operator-status/operator-status-types.js";
import { createTestRequestsAdapter } from "./request-test-utils.js";

describe("agent app integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the Agent module from first-class navigation and loads cockpit routes without blocking the page", async () => {
    const loads = {
      status: 0,
      cockpit: 0,
      approvals: 0,
      ontologyRoute: 0
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("App must not use ambient fetch for ontology bootstrap routes.");
    }) as typeof fetch;
    const adapter: AgentAdapter = {
      ...createStaticAgentAdapter(agentStatusWithOntologyBootstrap(), approvalCockpit(), { cockpit: agentCockpit() }),
      async loadStatus() {
        loads.status += 1;
        return agentStatusWithOntologyBootstrap();
      },
      async loadCockpit() {
        loads.cockpit += 1;
        return agentCockpit();
      },
      async loadApprovalCockpit() {
        loads.approvals += 1;
        return approvalCockpit();
      },
      async loadOntologyBootstrapRoute(runId: string) {
        loads.ontologyRoute += 1;
        expect(runId).toBe("run_ontology_bootstrap_route");
        return ontologyBootstrapRoute();
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

    try {
      fireEvent.click(screen.getByRole("link", { name: "Agent" }));

      await screen.findByRole("region", { name: "Give Cestus Agent a task" });
      const workspace = screen.getByRole("region", { name: "Resident agent workspace" });
      expect(within(workspace).getByText("Cestus Agent")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Agent" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Agents Preview" })).not.toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Give Cestus Agent a task" })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Agent run cockpit" })).toBeInTheDocument();

      await waitFor(() => expect(loads).toEqual({ status: 1, cockpit: 1, approvals: 1, ontologyRoute: 1 }));
      const review = screen.getByRole("region", { name: "Ontology bootstrap review" });
      expect(within(review).getByText("Ontology bootstrap")).toBeInTheDocument();
      expect(within(review).getByText("Review staging approval preview")).toBeInTheDocument();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps the Agent workspace decision-only even while exposing safe task and run controls", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({ mounted: false, diagnostics: [] })}
        operatorStatusAdapter={createStaticOperatorStatusAdapter(operatorStatus())}
        agentAdapter={createStaticAgentAdapter(agentStatus(), approvalCockpit(), { cockpit: agentCockpit() })}
      />
    );

    fireEvent.click(screen.getByRole("link", { name: "Agent" }));
    await screen.findByRole("region", { name: "Give Cestus Agent a task" });

    expect(screen.queryByRole("button", { name: "New request" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute|send|export|repair|clear lock/i })).not.toBeInTheDocument();
    const workspace = screen.getByRole("region", { name: "Resident agent workspace" });
    expect(within(workspace).getByRole("button", { name: "Refresh agent status" })).toBeInTheDocument();
    expect(within(workspace).getByRole("button", { name: "Create task" })).toBeInTheDocument();
    expect(within(workspace).getByRole("button", { name: "Create task and start run" })).toBeInTheDocument();
  });

  it("does not carry selected Command decision rail controls into the Agent module", async () => {
    render(
      <App
        requestsAdapter={createTestRequestsAdapter()}
        ingestionAdapter={createStaticIngestionWorkspaceAdapter({ mounted: false, diagnostics: [] })}
        operatorStatusAdapter={createStaticOperatorStatusAdapter(operatorStatus())}
        agentAdapter={createStaticAgentAdapter(agentStatus(), approvalCockpit(), { cockpit: agentCockpit() })}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Select Miami-Dade Aviation Department stalling signal" }));
    expect(screen.getByRole("button", { name: "Back to agent brief" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Agent" }));

    await screen.findByRole("region", { name: "Give Cestus Agent a task" });
    const workspace = screen.getByRole("region", { name: "Resident agent workspace" });
    expect(screen.queryByRole("button", { name: "Back to agent brief" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Decision rail" })).not.toBeInTheDocument();
    expect(within(workspace).getByRole("button", { name: "Create task" })).toBeInTheDocument();
    expect(within(workspace).getByRole("button", { name: "Create task and start run" })).toBeInTheDocument();
  });

  it("creates a task through the Agent adapter only, preserves description, and reloads status plus cockpit", async () => {
    const loads = {
      status: 0,
      cockpit: 0,
      approvals: 0
    };
    const creates: unknown[] = [];
    const adapter: AgentAdapter = {
      ...createStaticAgentAdapter(agentStatus(), approvalCockpit(), { cockpit: agentCockpit() }),
      async loadStatus() {
        loads.status += 1;
        return agentStatus({
          generatedAt: loads.status === 1 ? "2026-07-07T21:00:00.000Z" : "2026-07-07T21:05:00.000Z"
        });
      },
      async loadCockpit() {
        loads.cockpit += 1;
        return agentCockpit({
          summary: {
            ...agentCockpit().summary,
            activeTaskCount: loads.cockpit === 1 ? 1 : 2
          }
        });
      },
      async loadApprovalCockpit() {
        loads.approvals += 1;
        return approvalCockpit();
      },
      async createTask(input: unknown) {
        creates.push(input);
        return {
          ok: true as const,
          taskId: "task_created_from_app",
          eventIds: ["evt_task_created_from_app"]
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
    await screen.findByRole("region", { name: "Give Cestus Agent a task" });
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Review imported archive" }
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Preserve the description field from the app composer." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(creates).toHaveLength(1));
    expect(creates).toEqual([expect.objectContaining({
      title: "Review imported archive",
      priority: "normal",
      description: "Preserve the description field from the app composer."
    })]);
    expect(String((creates[0] as { readonly taskId: string }).taskId)).toMatch(/^task_review-imported-archive_/);
    expect(loads).toEqual({ status: 2, cockpit: 2, approvals: 1 });
  });

  it("creates a task and starts a run through the Agent adapter only, then reloads status plus cockpit", async () => {
    const loads = {
      status: 0,
      cockpit: 0,
      approvals: 0
    };
    const creates: unknown[] = [];
    const starts: unknown[] = [];
    const adapter: AgentAdapter = {
      ...createStaticAgentAdapter(agentStatus(), approvalCockpit(), { cockpit: agentCockpit() }),
      async loadStatus() {
        loads.status += 1;
        return agentStatus();
      },
      async loadCockpit() {
        loads.cockpit += 1;
        return agentCockpit();
      },
      async loadApprovalCockpit() {
        loads.approvals += 1;
        return approvalCockpit();
      },
      async createTask(input: unknown) {
        creates.push(input);
        return {
          ok: true as const,
          taskId: "task_created_for_run",
          eventIds: ["evt_task_created_for_run"]
        };
      },
      async startRun(input: unknown) {
        starts.push(input);
        return {
          ok: true as const,
          schemaVersion: "agent-run-start-result.v1" as const,
          runId: "run_created_from_app",
          eventIds: ["evt_run_started_from_app"]
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
    await screen.findByRole("region", { name: "Give Cestus Agent a task" });
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Triaging evidence cluster" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create task and start run" }));

    await waitFor(() => expect(starts).toHaveLength(1));
    expect(creates).toHaveLength(1);
    expect(starts).toEqual([expect.objectContaining({
      taskId: "task_created_for_run",
      runType: "evidence-triage",
      scope: {
        kind: "workspace",
        refs: ["ws_case_001"]
      }
    })]);
    expect(String((starts[0] as { readonly runId: string }).runId)).toMatch(/^run_triaging-evidence-cluster_/);
    expect(loads).toEqual({ status: 3, cockpit: 3, approvals: 1 });
  });

  it("approves provider byte-transfer previews through the Agent adapter only and reloads status plus cockpit", async () => {
    const approvals: unknown[] = [];
    const loads = {
      status: 0,
      cockpit: 0,
      approvals: 0
    };
    const adapter: AgentAdapter = {
      ...createStaticAgentAdapter(agentStatus(), approvalCockpit(), { cockpit: agentCockpit() }),
      async loadStatus() {
        loads.status += 1;
        return agentStatus({
          generatedAt: loads.status === 1 ? "2026-07-07T21:00:00.000Z" : "2026-07-07T21:05:00.000Z"
        });
      },
      async loadCockpit() {
        loads.cockpit += 1;
        return agentCockpit();
      },
      async loadApprovalCockpit() {
        loads.approvals += 1;
        return approvalCockpit();
      },
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
    const refreshedCockpit = await screen.findByRole("region", { name: "Agent approval cockpit" });
    expect(within(refreshedCockpit).getByText("0 visible requests")).toBeInTheDocument();
    expect(loads).toEqual({ status: 2, cockpit: 2, approvals: 1 });
  });

  it("refreshes the Agent status, approval cockpit, and cockpit DTO together", async () => {
    const loads = {
      status: 0,
      cockpit: 0,
      approvals: 0
    };
    const adapter: AgentAdapter = {
      ...createStaticAgentAdapter(agentStatus(), approvalCockpit(), { cockpit: agentCockpit() }),
      async loadStatus() {
        loads.status += 1;
        return agentStatus();
      },
      async loadCockpit() {
        loads.cockpit += 1;
        return agentCockpit({
          summary: {
            ...agentCockpit().summary,
            activeTaskCount: loads.cockpit === 1 ? 1 : 3
          }
        });
      },
      async loadApprovalCockpit() {
        loads.approvals += 1;
        return approvalCockpit({
          pendingCount: loads.approvals === 1 ? 1 : 0
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
    expect(loads).toEqual({ status: 2, cockpit: 2, approvals: 2 });
  });

  it("shows a safe message when the run start route is unavailable and does not call approval routes", async () => {
    const approvals: unknown[] = [];
    const denials: unknown[] = [];
    const starts: unknown[] = [];
    const adapter: AgentAdapter = {
      ...createStaticAgentAdapter(agentStatus(), approvalCockpit(), { cockpit: agentCockpit() }),
      async createTask() {
        return {
          ok: true as const,
          taskId: "task_created_for_unavailable_run",
          eventIds: ["evt_task_created_for_unavailable_run"]
        };
      },
      async startRun(input: unknown) {
        starts.push(input);
        throw new Error("Agent run start route returned HTTP 503.");
      },
      async approveToolRequest(input: unknown) {
        approvals.push(input);
        return {
          ok: true as const,
          schemaVersion: "agent-approval-decision-result.v1" as const,
          eventIds: ["evt_unexpected_approval"],
          approvalCockpit: approvalCockpit()
        };
      },
      async denyToolRequest(input: unknown) {
        denials.push(input);
        return {
          ok: true as const,
          schemaVersion: "agent-approval-decision-result.v1" as const,
          eventIds: ["evt_unexpected_denial"],
          approvalCockpit: approvalCockpit()
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
    await screen.findByRole("region", { name: "Give Cestus Agent a task" });
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Restart blocked bootstrap" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create task and start run" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Task handoff could not be completed safely.");
    expect(starts).toHaveLength(1);
    expect(approvals).toEqual([]);
    expect(denials).toEqual([]);
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
    providerReadiness: {
      schemaVersion: "agent-provider-readiness.v1",
      generatedAt: "2026-07-09T11:19:00.000Z",
      cards: [
        {
          providerId: "provider_fake_local",
          label: "Fake Local Model Provider",
          backendKind: "local-engine",
          capabilitySummary: ["Local deterministic model"],
          credentialKindSummary: ["local-no-secret"],
          state: "works-locally",
          requiredApprovalClass: "none",
          credentialHealth: "not-required",
          dataHandlingPosture: "local-only",
          safeActionIds: ["action_check_provider_health"]
        }
      ],
      diagnostics: []
    },
    pendingApprovalCount: 1,
    activeLockCount: 0,
    diagnostics: [],
    ...overrides
  };
}

function agentStatusWithOntologyBootstrap(overrides: Partial<AgentStatusDto> = {}): AgentStatusDto {
  return agentStatus({
    tasks: [
      {
        taskId: "task_ontology_bootstrap_route",
        residentAgentId: "agent_default",
        title: "Bootstrap old Cestus archive",
        requestedBy: "actor_case_owner",
        priority: "normal",
        status: "waiting-for-approval",
        createdAt: "2026-07-08T16:00:00.000Z",
        sourceEventIds: [],
        inputArtifactHashes: [],
        runId: "run_ontology_bootstrap_route",
        eventIds: ["evt_bootstrap_task"],
        causationIds: []
      }
    ],
    runs: [
      {
        runId: "run_ontology_bootstrap_route",
        residentAgentId: "agent_default",
        runType: "ontology-bootstrap",
        state: "running",
        startedBy: "actor_case_owner",
        startedAt: "2026-07-08T16:00:10.000Z",
        taskId: "task_ontology_bootstrap_route",
        workspaceId: "ws_case_001",
        sourceEventIds: [],
        inputArtifactHashes: [],
        relatedEventIds: [],
        outputArtifactHashes: ["sha256:3333333333333333333333333333333333333333333333333333333333333333"],
        stepIds: ["step_ontology_bootstrap_dossier"],
        invocationIds: [],
        toolRequestIds: ["toolreq_ontology_bootstrap_staging_approval"],
        allowedActions: [],
        eventIds: ["evt_bootstrap_run"],
        causationIds: ["evt_bootstrap_task"]
      }
    ],
    toolRequests: [
      {
        toolRequestId: "toolreq_ontology_bootstrap_staging_approval",
        runId: "run_ontology_bootstrap_route",
        toolId: "legacy.staging.approval.request",
        toolVersion: "0.1.0",
        requestedBy: "agent_default",
        sideEffectClass: "ledger-review",
        requiredApprovalClass: "ledger-review",
        previewHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
        scope: "Ontology bootstrap legacy_report_001",
        estimatedEffect: "Human ledger review is required before any follow-up event can be recorded.",
        state: "requested",
        requestedAt: "2026-07-08T16:01:00.000Z",
        sourceEventIds: [],
        inputArtifactHashes: [],
        resultEventIds: [],
        artifactHashes: [],
        readModelChanges: [],
        allowedActions: [],
        eventIds: ["evt_bootstrap_tool"],
        causationIds: ["evt_bootstrap_run"]
      }
    ],
    ...overrides
  });
}

function agentCockpit(overrides: Partial<AgentCockpitDto> = {}): AgentCockpitDto {
  return {
    schemaVersion: "agent-cockpit.v1",
    generatedAt: "2026-07-09T13:00:00.000Z",
    summary: {
      activeTaskCount: 1,
      activeRunCount: 1,
      pendingApprovalCount: 1,
      activeLockCount: 0,
      mergeAfterScheduler: false
    },
    taskQueue: [
      {
        taskId: "task_provider_review",
        title: "Review provider approval",
        priority: "normal",
        status: "waiting-for-approval",
        createdAt: "2026-07-07T21:00:00.000Z",
        runId: "run_provider_review",
        statusReason: "Awaiting safe review."
      }
    ],
    runQueue: [
      {
        runId: "run_provider_review",
        taskId: "task_provider_review",
        runType: "evidence-triage",
        state: "running",
        startedAt: "2026-07-07T21:00:10.000Z",
        summary: "Reviewing provider preview evidence.",
        currentStepCount: 1,
        modelInvocationCount: 0,
        pendingApprovalCount: 1,
        blockedReasonCount: 0
      }
    ],
    selectedRun: {
      runId: "run_provider_review",
      taskId: "task_provider_review",
      runType: "evidence-triage",
      state: "running",
      startedAt: "2026-07-07T21:00:10.000Z",
      summary: "Reviewing provider preview evidence.",
      currentStepCount: 1,
      modelInvocationCount: 0,
      pendingApprovalCount: 1,
      blockedReasonCount: 0,
      stepIds: ["step_review_provider_preview"],
      pendingApprovalIds: ["toolreq_provider_transfer"],
      blockedReasons: [],
      modelInvocations: [
        {
          invocationId: "inv_provider_review",
          providerId: "provider_fake_local",
          modelFamily: "fake-local",
          status: "completed",
          inputArtifactHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          outputArtifactHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          usageSummary: "1 prompt, 1 completion",
          retryable: false
        }
      ],
      contextPacks: [
        {
          contextPackId: "ctx_provider_review",
          contentHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          safeSummary: "Workspace evidence context pack.",
          generatedAt: "2026-07-09T12:58:00.000Z",
          provenanceRefs: ["evt_task_created"],
          sourceEventIds: ["evt_task_created"],
          artifactHashes: ["sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"]
        }
      ]
    },
    needsNext: [
      {
        kind: "approval",
        severity: "action-required",
        label: "Review provider transfer preview",
        relatedTaskId: "task_provider_review",
        relatedRunId: "run_provider_review",
        relatedToolRequestId: "toolreq_provider_transfer",
        safeAction: "review"
      }
    ],
    memorySnippets: [
      {
        memoryId: "mem_provider_review",
        scope: "workspace",
        summary: "Prior operator approved the same provider preview class.",
        createdAt: "2026-07-09T12:57:00.000Z",
        sourceEventIds: ["evt_memory_recorded"],
        artifactHashes: ["sha256:1111111111111111111111111111111111111111111111111111111111111111"],
        confidence: 0.6
      }
    ],
    forbiddenDirectEffects: [
      "provider-byte-transfer",
      "prr-send-followup",
      "export-publication",
      "destructive-repair",
      "legal-escalation",
      "lock-clearing",
      "accepted-graph-review",
      "legacy-raw-import",
      "legacy-staging-execution"
    ],
    ...overrides
  };
}

function ontologyBootstrapRoute(): OntologyBootstrapRouteDto {
  return {
    schemaVersion: "agent-ontology-bootstrap-route.v1",
    generatedAt: "2026-07-08T16:02:00.000Z",
    runId: "run_ontology_bootstrap_route",
    taskId: "task_ontology_bootstrap_route",
    phase: "staging-review",
    legacyReportId: "legacy_report_001",
    reportHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    candidateSetHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    reviewBundleHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    candidateBundleCount: 2,
    candidateCount: 4,
    selectedCandidateIds: ["legacy_candidate_001"],
    blockedRequestedCandidateIds: ["legacy_candidate_missing"],
    pendingApprovalToolRequestIds: ["toolreq_ontology_bootstrap_staging_approval"],
    nextCursor: {
      currentOffset: 0,
      limit: 2,
      totalCandidates: 4,
      nextOffset: 2
    },
    nextSafeAction: {
      actionId: "bootstrap_action_approve_staging",
      label: "Review staging approval preview",
      kind: "request-tool",
      effect: "ledger-review"
    },
    runState: "running",
    outputArtifactHashes: ["sha256:3333333333333333333333333333333333333333333333333333333333333333"],
    stepIds: ["step_ontology_bootstrap_dossier"]
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
