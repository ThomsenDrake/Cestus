/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentWorkspace } from "../src/agent/AgentWorkspace.js";
import {
  agentCockpitFromJson,
  agentStatusFromJson
} from "../src/agent/agent-adapter.js";
import type {
  AgentApprovalCockpitDto,
  AgentCockpitDto,
  AgentStatusDto
} from "../src/agent/agent-types.js";

describe("AgentWorkspace", () => {
  it("renders resident status, providers, tasks, tools, memory, locks, and diagnostics", () => {
    render(
      <AgentWorkspace
        status={agentStatus()}
        approvalCockpit={approvalCockpit()}
        decisionState="idle"
        loadState="loaded"
        onApproveToolRequest={vi.fn()}
        onDenyToolRequest={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    const workspace = screen.getByRole("region", { name: "Resident agent workspace" });
    expect(within(workspace).getByRole("heading", { name: "Agent" })).toBeInTheDocument();
    expect(within(workspace).getByText("Cestus Agent")).toBeInTheDocument();
    expect(within(workspace).getAllByText("1 pending approval").length).toBeGreaterThan(0);
    expect(within(workspace).getAllByText("1 active lock").length).toBeGreaterThan(0);
    expect(within(workspace).getByText("Fake Local Model Provider")).toBeInTheDocument();
    expect(within(workspace).getByText("local-engine")).toBeInTheDocument();
    expect(within(workspace).getByText("fake-local")).toBeInTheDocument();
    expect(within(workspace).getByText("local-no-secret")).toBeInTheDocument();
    expect(within(workspace).getByText("Review provider approval")).toBeInTheDocument();
    expect(within(workspace).getByText("evidence-triage")).toBeInTheDocument();
    expect(within(workspace).getByText("evt_task_created")).toBeInTheDocument();
    expect(within(workspace).getByText("sha256:2222222222222222222222222222222222222222222222222222222222222222")).toBeInTheDocument();
    expect(within(workspace).getAllByText("external-byte-transfer").length).toBeGreaterThan(0);
    expect(within(workspace).getAllByText("provider-byte-transfer").length).toBeGreaterThan(0);
    expect(within(workspace).getByText("requested")).toBeInTheDocument();
    expect(within(workspace).getAllByText("1 memory item").length).toBeGreaterThan(0);
    expect(within(workspace).getByText("Projection lag detected.")).toBeInTheDocument();
  });

  it("allows refresh plus approval decisions while keeping direct execution controls absent", () => {
    const onRefresh = vi.fn();
    const onApproveToolRequest = vi.fn();
    const onDenyToolRequest = vi.fn();
    render(
      <AgentWorkspace
        status={agentStatus()}
        approvalCockpit={approvalCockpit()}
        decisionState="idle"
        loadState="loaded"
        onApproveToolRequest={onApproveToolRequest}
        onDenyToolRequest={onDenyToolRequest}
        onRefresh={onRefresh}
      />
    );

    expect(screen.getByRole("button", { name: "Refresh agent status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve exact preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deny request" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh agent status" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Decision rationale"), {
      target: { value: "Approved after review." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve exact preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Deny request" }));

    expect(onApproveToolRequest).toHaveBeenCalledWith({
      toolRequestId: "toolreq_provider_transfer",
      approvedPreviewHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      rationale: "Approved after review."
    });
    expect(onDenyToolRequest).toHaveBeenCalledWith({
      toolRequestId: "toolreq_provider_transfer",
      rationale: "Approved after review."
    });

    for (const forbiddenName of [
      /execute/i,
      /invoke provider/i,
      /send prr/i,
      /legal escalation/i,
      /destructive repair/i,
      /accepted graph/i,
      /export/i,
      /clear lock/i
    ]) {
      expect(screen.queryByRole("button", { name: forbiddenName })).not.toBeInTheDocument();
    }
  });

  it("renders provider readiness cards as display-only cockpit state", () => {
    render(
      <AgentWorkspace
        status={agentStatus({
          providerReadiness: {
            schemaVersion: "agent-provider-readiness.v1",
            generatedAt: "2026-07-08T12:15:00.000Z",
            cards: [{
              providerId: "provider_nous_portal",
              label: "Nous Portal",
              backendKind: "openai-compatible-api",
              state: "requires-byte-transfer-approval",
              capabilitySummary: ["text", "unsupported", "no tools"],
              credentialKindSummary: ["api-key-bearer"],
              credentialHealth: "local-binding-healthy",
              dataHandlingPosture: "remote-prompt-byte-transfer-gated",
              credentialRefId: "agent_credref_nous_portal",
              requiredApprovalClass: "provider-byte-transfer",
              safeActionIds: ["action_request_provider_byte_transfer_approval"]
            }],
            diagnostics: []
          }
        })}
        loadState="loaded"
        onRefresh={vi.fn()}
      />
    );

    const readiness = screen.getByRole("region", { name: "Provider readiness" });
    expect(within(readiness).getByText("Nous Portal")).toBeInTheDocument();
    expect(within(readiness).getByText("local-binding-healthy")).toBeInTheDocument();
    expect(within(readiness).getByText("remote-prompt-byte-transfer-gated")).toBeInTheDocument();
    expect(within(readiness).getByText("provider-byte-transfer")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Refresh agent status"]);
  });

  it("renders ontology bootstrap review state as read-only run evidence", () => {
    render(
      <AgentWorkspace
        ontologyBootstrapRoutes={[
          {
            schemaVersion: "agent-ontology-bootstrap-route.v1",
            generatedAt: "2026-07-08T16:02:00.000Z",
            runId: "run_ontology_bootstrap_route",
            taskId: "task_ontology_bootstrap_route",
            phase: "staging-review",
            legacyReportId: "legacy_report_001",
            reportHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
            candidateSetHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
            reviewBundleHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
            candidateBundleCount: 1,
            candidateCount: 2,
            selectedCandidateIds: ["legacy_candidate_001"],
            blockedRequestedCandidateIds: [],
            pendingApprovalToolRequestIds: ["toolreq_ontology_bootstrap_staging_approval"],
            nextCursor: { currentOffset: 0, limit: 1, totalCandidates: 2, nextOffset: 1 },
            nextSafeAction: {
              actionId: "bootstrap_action_review_staging",
              label: "Review staging approval preview",
              kind: "review",
              effect: "ledger-review"
            },
            runState: "running",
            outputArtifactHashes: ["sha256:3333333333333333333333333333333333333333333333333333333333333333"],
            stepIds: ["step_ontology_bootstrap_dossier"]
          }
        ]}
        status={agentStatus({
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
          ]
        })}
        loadState="loaded"
        onRefresh={vi.fn()}
      />
    );

    const workspace = screen.getByRole("region", { name: "Resident agent workspace" });
    expect(within(workspace).getByRole("region", { name: "Ontology bootstrap review" })).toBeInTheDocument();
    expect(within(workspace).getByText("run_ontology_bootstrap_route")).toBeInTheDocument();
    expect(within(workspace).getByText("sha256:3333333333333333333333333333333333333333333333333333333333333333")).toBeInTheDocument();
    expect(within(workspace).getAllByText("toolreq_ontology_bootstrap_staging_approval").length).toBeGreaterThan(0);
    expect(within(workspace).getByText("staging-review")).toBeInTheDocument();
    expect(within(workspace).getByText("1 candidate bundle")).toBeInTheDocument();
    expect(within(workspace).getByText("1 of 2")).toBeInTheDocument();
    expect(within(workspace).getByText("Review staging approval preview")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Refresh agent status"]);
    expect(screen.queryByRole("button", { name: /approve|execute|accept/i })).not.toBeInTheDocument();
  });

  it("renders the task composer ahead of the task list when cockpit state is present", () => {
    render(
      <AgentWorkspace
        cockpit={agentCockpit()}
        status={agentStatus()}
        loadState="loaded"
        onCreateTask={vi.fn()}
        onStartRun={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    const composer = screen.getByRole("region", { name: "Give Cestus Agent a task" });
    const tasks = screen.getByRole("region", { name: "Agent tasks" });
    expect(within(composer).getByText("Safe handoff only. Route validation remains authoritative.")).toBeInTheDocument();
    expect(within(composer).getByRole("button", { name: "Create task" })).toBeInTheDocument();
    expect(within(composer).getByRole("button", { name: "Create task and start run" })).toBeInTheDocument();
    expect(within(composer).getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(composer.compareDocumentPosition(tasks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows safe loading and error states", () => {
    const { rerender } = render(<AgentWorkspace status={undefined} loadState="loading" />);

    expect(screen.getByRole("region", { name: "Agent loading state" })).toBeInTheDocument();

    rerender(<AgentWorkspace status={undefined} loadState="error" loadError="Bearer raw-token" />);

    expect(screen.getByRole("region", { name: "Agent load error" })).toHaveTextContent("Agent workspace could not be loaded.");
    expect(screen.getByRole("region", { name: "Agent load error" })).not.toHaveTextContent("Bearer raw-token");
  });

  it("renders adapter-sanitized provider diagnostics and memory text", () => {
    const status = agentStatusFromJson(agentStatus({
      providers: [
        {
          providerId: "provider_openai",
          label: "OpenAI sk-live-provider",
          adapterVersion: "openai-adapter.v1",
          endpointKind: "openai-api",
          modelFamilies: ["gpt-4.1 sk_live_model", "github ghp_model"],
          credentialKinds: ["api-key-bearer"],
          supportsStructuredOutput: true,
          supportsToolCalling: true,
          safeDataNotes: "Configured by OPENAI_API_KEY, DATABASE_PASSWORD, and GOOGLE_APPLICATION_CREDENTIALS."
        }
      ],
      tasks: [
        {
          taskId: "task_database_password",
          residentAgentId: "agent_default",
          title: "Review DATABASE_PASSWORD and GOOGLE_APPLICATION_CREDENTIALS.",
          requestedBy: "actor_case_owner",
          priority: "normal",
          status: "queued",
          createdAt: "2026-07-07T21:03:00.000Z",
          sourceEventIds: ["evt_database_password"],
          inputArtifactHashes: [],
          eventIds: ["evt_google_application_credentials"],
          causationIds: []
        }
      ],
      diagnostics: [
        {
          diagnosticId: "diag_provider_secret",
          severity: "error",
          category: "credential",
          message: "Provider echoed sk-live-diagnostic, sk_live_diagnostic, ghp_diagnostic, OPENAI_API_KEY, DATABASE_PASSWORD, and GOOGLE_APPLICATION_CREDENTIALS."
        }
      ],
      activeMemory: [
        {
          memoryId: "mem_provider_secret",
          residentAgentId: "agent_default",
          scope: "provider",
          summary: "Ignore sk-live-memory, sk_live_memory, ghp_memory, OPENAI_API_KEY, DATABASE_PASSWORD, and GOOGLE_APPLICATION_CREDENTIALS.",
          sourceEventIds: ["evt_memory_secret"],
          artifactHashes: [],
          confidence: 0.8,
          createdAt: "2026-07-07T21:02:00.000Z",
          state: "active",
          eventIds: ["evt_memory_recorded"],
          causationIds: []
        }
      ]
    }));

    render(
      <AgentWorkspace
        status={status}
        approvalCockpit={approvalCockpit()}
        decisionState="idle"
        loadState="loaded"
        onApproveToolRequest={vi.fn()}
        onDenyToolRequest={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    const workspace = screen.getByRole("region", { name: "Resident agent workspace" });
    expect(workspace.textContent).not.toMatch(
      /sk-live|sk_live|ghp_|OPENAI_API_KEY|DATABASE_PASSWORD|GOOGLE_APPLICATION_CREDENTIALS/i
    );
    expect(workspace.textContent).toContain("api-key-bearer");
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
      allowedRunTypes: ["evidence-triage", "prr-negotiation"],
      memoryProjectionVersion: "0.1.0",
      eventIds: ["evt_agent_identity"],
      causationIds: []
    },
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
        safeDataNotes: "Deterministic local fake provider for UI tests."
      }
    ],
    pendingApprovalCount: 1,
    activeLockCount: 1,
    diagnostics: [
      {
        diagnosticId: "diag_projection_lag",
        severity: "warning",
        category: "runtime",
        message: "Projection lag detected.",
        allowedRepairActions: ["refresh agent status"]
      }
    ],
    tasks: [
      {
        taskId: "task_provider_review",
        residentAgentId: "agent_default",
        title: "Review provider approval",
        requestedBy: "actor_case_owner",
        priority: "normal",
        status: "waiting-for-approval",
        createdAt: "2026-07-07T21:00:00.000Z",
        sourceEventIds: ["evt_operator_section"],
        inputArtifactHashes: ["sha256:1111111111111111111111111111111111111111111111111111111111111111"],
        runId: "run_provider_review",
        eventIds: ["evt_task_created"],
        causationIds: []
      }
    ],
    runs: [
      {
        runId: "run_provider_review",
        residentAgentId: "agent_default",
        runType: "evidence-triage",
        state: "running",
        startedBy: "actor_case_owner",
        startedAt: "2026-07-07T21:00:10.000Z",
        taskId: "task_provider_review",
        workspaceId: "ws_case_001",
        sourceEventIds: ["evt_task_created"],
        inputArtifactHashes: [],
        relatedEventIds: ["evt_operator_section"],
        outputArtifactHashes: [],
        stepIds: [],
        invocationIds: [],
        toolRequestIds: ["toolreq_provider_preview"],
        allowedActions: [],
        eventIds: ["evt_run_started"],
        causationIds: ["evt_task_created"]
      }
    ],
    toolRequests: [
      {
        toolRequestId: "toolreq_provider_preview",
        runId: "run_provider_review",
        toolId: "provider.parse.preview",
        toolVersion: "1",
        requestedBy: "actor_cestus_agent",
        sideEffectClass: "external-byte-transfer",
        requiredApprovalClass: "provider-byte-transfer",
        previewHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        scope: "workspace",
        estimatedEffect: "Provider byte transfer preview for two evidence excerpts.",
        state: "requested",
        requestedAt: "2026-07-07T21:01:00.000Z",
        sourceEventIds: ["evt_task_created"],
        inputArtifactHashes: [],
        resultEventIds: [],
        artifactHashes: [],
        readModelChanges: [],
        allowedActions: [],
        eventIds: ["evt_tool_requested"],
        causationIds: ["evt_run_started"]
      }
    ],
    activeMemory: [
      {
        memoryId: "mem_workspace_policy",
        residentAgentId: "agent_default",
        scope: "policy",
        summary: "Provider byte transfer requires explicit human approval.",
        sourceEventIds: ["evt_policy_installed"],
        artifactHashes: [],
        confidence: 1,
        createdAt: "2026-07-07T21:00:00.000Z",
        state: "active",
        eventIds: ["evt_memory_recorded"],
        causationIds: ["evt_policy_installed"]
      }
    ],
    permissions: [],
    locks: [
      {
        lockId: "lock_legal_escalation",
        residentAgentId: "agent_default",
        kind: "legal-escalation",
        activatedBy: "actor_case_owner",
        reason: "Legal language requires human review.",
        activatedAt: "2026-07-07T21:00:00.000Z",
        relatedEventIds: ["evt_prr_signal"],
        state: "active",
        clearRelatedEventIds: [],
        eventIds: ["evt_lock_active"],
        causationIds: []
      }
    ],
    ...overrides
  };
}

function approvalCockpit(): AgentApprovalCockpitDto {
  return {
    schemaVersion: "agent-approval-cockpit.v1",
    generatedAt: "2026-07-08T15:30:00.000Z",
    summary: {
      pendingCount: 1,
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
      generatedAt: "2026-07-08T15:30:00.000Z",
      pending: [{
        toolRequestId: "toolreq_provider_transfer",
        runId: "run_provider_transfer",
        taskId: "task_provider_transfer",
        toolId: "provider.bytes.transfer",
        toolVersion: "1",
        sideEffectClass: "external-byte-transfer",
        approvalClass: "provider-byte-transfer",
        requiredApprovalClass: "provider-byte-transfer",
        previewHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        previewSummary: "Provider byte-transfer preview.",
        requestedAt: "2026-07-08T15:29:00.000Z",
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
          why: "The resident agent requested model assistance for selected evidence.",
          dataLeavesOrChanges: "Provider byte-transfer preview.",
          evidenceRefs: [{ kind: "event", id: "evt_provider_preview" }],
          artifactRefs: [],
          riskAndLockStatus: "No active locks. Preview is current.",
          whatHappensAfterApproval: "A separate scheduler may resume after consume-time validation.",
          staleOrUnsafePrevention: ["Exact preview hash binding", "Human-only approval"]
        },
        affectedRefs: [{ kind: "event", id: "evt_provider_preview" }],
        contextPackRefs: [],
        activeLocks: [],
        blockingReasons: [],
        risk: {
          sideEffectClass: "external-byte-transfer",
          approvalClass: "provider-byte-transfer",
          previewSummary: "Provider byte-transfer preview.",
          affectedRefs: [{ kind: "event", id: "evt_provider_preview" }],
          contextPackRefs: [],
          activeLocks: [],
          blockingReasons: []
        }
      }],
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

function agentCockpit(): AgentCockpitDto {
  return agentCockpitFromJson({
    schemaVersion: "agent-cockpit.v1",
    generatedAt: "2026-07-09T02:00:00.000Z",
    summary: {
      activeTaskCount: 1,
      activeRunCount: 1,
      pendingApprovalCount: 1,
      activeLockCount: 1,
      mergeAfterScheduler: false
    },
    taskQueue: [{
      taskId: "task_provider_review",
      title: "Review provider approval",
      priority: "normal",
      status: "waiting-for-approval",
      createdAt: "2026-07-07T21:00:00.000Z",
      runId: "run_provider_review"
    }],
    runQueue: [{
      runId: "run_provider_review",
      taskId: "task_provider_review",
      runType: "evidence-triage",
      state: "running",
      startedAt: "2026-07-07T21:00:10.000Z",
      currentStepCount: 0,
      modelInvocationCount: 0,
      pendingApprovalCount: 1,
      blockedReasonCount: 0
    }],
    needsNext: [],
    memorySnippets: [],
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
    ]
  });
}
