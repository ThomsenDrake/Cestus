/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentTaskComposer } from "../src/agent/AgentTaskComposer.js";
import {
  agentCockpitFromJson,
  agentStatusFromJson
} from "../src/agent/agent-adapter.js";
import type {
  AgentCockpitDto,
  AgentStatusDto,
  CreateAgentTaskInput,
  StartAgentRunInput
} from "../src/agent/agent-types.js";

describe("AgentTaskComposer", () => {
  it("renders the labeled handoff region with safe ID previews and posture", () => {
    render(
      <AgentTaskComposer
        cockpit={agentCockpit({ mergeAfterScheduler: true })}
        status={agentStatus()}
        onCreateTask={vi.fn()}
        onStartRun={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    const composer = screen.getByRole("region", { name: "Give Cestus Agent a task" });
    expect(within(composer).getByLabelText("Task title")).toBeInTheDocument();
    expect(within(composer).getByLabelText("Run type")).toHaveDisplayValue("evidence-triage");
    expect(within(composer).getByRole("option", { name: "evidence-triage" })).toBeInTheDocument();
    expect(within(composer).getByRole("option", { name: "prr-negotiation" })).toBeInTheDocument();
    expect(within(composer).getByLabelText("Scope kind")).toHaveDisplayValue("workspace");
    expect(within(composer).getByRole("option", { name: "workspace" })).toBeInTheDocument();
    expect(within(composer).getByRole("option", { name: "investigation" })).toBeInTheDocument();
    expect(within(composer).getByText("Provider readiness available")).toBeInTheDocument();
    expect(within(composer).getByText("1 pending approval")).toBeInTheDocument();
    expect(within(composer).getByText("Merge after scheduler is enabled.")).toBeInTheDocument();

    fireEvent.change(within(composer).getByLabelText("Task title"), {
      target: { value: "Review provider approval" }
    });

    expect(within(composer).getByText(/task_review-provider-approval_[a-z0-9]+/i)).toBeInTheDocument();
    expect(within(composer).getByText(/run_review-provider-approval_[a-z0-9]+/i)).toBeInTheDocument();
  });

  it("creates a task from the proposed safe handoff values", async () => {
    const onCreateTask = vi.fn(async (input: CreateAgentTaskInput) => ({
      ok: true as const,
      taskId: input.taskId,
      eventIds: ["evt_task_created"]
    }));

    render(
      <AgentTaskComposer
        cockpit={agentCockpit()}
        status={agentStatus()}
        onCreateTask={onCreateTask}
      />
    );

    const composer = screen.getByRole("region", { name: "Give Cestus Agent a task" });
    fireEvent.change(within(composer).getByLabelText("Task title"), {
      target: { value: "Review provider approval" }
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(onCreateTask).toHaveBeenCalledTimes(1));
    expect(onCreateTask).toHaveBeenCalledWith({
      taskId: expect.stringMatching(/^task_review-provider-approval_[a-z0-9]+$/i),
      title: "Review provider approval",
      priority: "normal"
    });
  });

  it("creates a task and then starts an allowed run when start is safe", async () => {
    const onCreateTask = vi.fn(async () => ({
      ok: true as const,
      taskId: "task_route_authoritative",
      eventIds: ["evt_task_created"]
    }));
    const onStartRun = vi.fn(async (input: StartAgentRunInput) => ({
      ok: true as const,
      schemaVersion: "agent-run-start-result.v1" as const,
      runId: input.runId,
      eventIds: ["evt_run_started"]
    }));

    render(
      <AgentTaskComposer
        cockpit={agentCockpit()}
        status={agentStatus()}
        onCreateTask={onCreateTask}
        onStartRun={onStartRun}
      />
    );

    const composer = screen.getByRole("region", { name: "Give Cestus Agent a task" });
    fireEvent.change(within(composer).getByLabelText("Task title"), {
      target: { value: "Review provider approval" }
    });
    fireEvent.change(within(composer).getByLabelText("Scope refs"), {
      target: { value: "ws_case_001" }
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Create task and start run" }));

    await waitFor(() => expect(onCreateTask).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onStartRun).toHaveBeenCalledTimes(1));
    expect(onStartRun).toHaveBeenCalledWith({
      runId: expect.stringMatching(/^run_review-provider-approval_[a-z0-9]+$/i),
      taskId: "task_route_authoritative",
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: ["ws_case_001"] }
    });
  });

  it("disables run start with a clear safe reason when start would be unsafe", () => {
    const baseStatus = agentStatus();
    if (baseStatus.identity === undefined) {
      throw new Error("Expected agent identity fixture.");
    }

    const { rerender } = render(
      <AgentTaskComposer
        cockpit={agentCockpit()}
        status={baseStatus}
        onCreateTask={vi.fn()}
      />
    );

    let composer = screen.getByRole("region", { name: "Give Cestus Agent a task" });
    let start = within(composer).getByRole("button", { name: "Create task and start run" });
    expect(start).toBeDisabled();
    expect(within(composer).getByText("Run start route is unavailable.")).toBeInTheDocument();

    rerender(
      <AgentTaskComposer
        cockpit={agentCockpit()}
        status={agentStatus({
          locks: [{
            lockId: "lock_data_loss",
            residentAgentId: "agent_default",
            kind: "data-loss",
            activatedBy: "actor_case_owner",
            reason: "Unsafe destructive path is still gated.",
            activatedAt: "2026-07-09T02:00:00.000Z",
            relatedEventIds: ["evt_data_loss_lock"],
            state: "active",
            clearRelatedEventIds: [],
            eventIds: ["evt_lock_active"],
            causationIds: []
          }],
          activeLockCount: 1
        })}
        onCreateTask={vi.fn()}
        onStartRun={vi.fn()}
      />
    );

    composer = screen.getByRole("region", { name: "Give Cestus Agent a task" });
    start = within(composer).getByRole("button", { name: "Create task and start run" });
    expect(start).toBeDisabled();
    expect(within(composer).getByText("Active locks block run start.")).toBeInTheDocument();

    rerender(
      <AgentTaskComposer
        cockpit={agentCockpit()}
        status={agentStatus({ providerReadiness: undefined })}
        onCreateTask={vi.fn()}
        onStartRun={vi.fn()}
      />
    );

    composer = screen.getByRole("region", { name: "Give Cestus Agent a task" });
    start = within(composer).getByRole("button", { name: "Create task and start run" });
    expect(start).toBeDisabled();
    expect(within(composer).getAllByText("Provider readiness is unavailable.").length).toBeGreaterThan(0);

    rerender(
      <AgentTaskComposer
        cockpit={agentCockpit()}
        status={agentStatus({
          identity: {
            ...baseStatus.identity,
            allowedRunTypes: []
          }
        })}
        onCreateTask={vi.fn()}
        onStartRun={vi.fn()}
      />
    );

    composer = screen.getByRole("region", { name: "Give Cestus Agent a task" });
    start = within(composer).getByRole("button", { name: "Create task and start run" });
    expect(start).toBeDisabled();
    expect(within(composer).getByText("No allowed run type is selected.")).toBeInTheDocument();
  });

  it("shows safe callback failures and keeps command labels constrained", async () => {
    const onCreateTask = vi.fn(async () => {
      throw new Error("scheduler wake failed with bearer raw-value at /tmp/run-secrets");
    });

    render(
      <AgentTaskComposer
        cockpit={agentCockpit()}
        status={agentStatus()}
        onCreateTask={onCreateTask}
        onStartRun={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    const composer = screen.getByRole("region", { name: "Give Cestus Agent a task" });
    fireEvent.change(within(composer).getByLabelText("Task title"), {
      target: { value: "Review provider approval" }
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(within(composer).getByText("Task handoff could not be completed safely.")).toBeInTheDocument();
    });
    expect(composer.textContent).not.toMatch(/scheduler wake|bearer|raw-value|\/tmp\/run-secrets/i);

    const commandLabels = within(composer).getAllByRole("button").map((button) => button.textContent);
    expect(commandLabels).toEqual(["Create task", "Create task and start run", "Refresh"]);
    expect(commandLabels.join(" ")).not.toMatch(
      /provider transfer|prr send|export|repair|clear lock|accepted graph|scheduler wake|import|staging/i
    );
  });
});

function agentStatus(overrides: Partial<AgentStatusDto> = {}): AgentStatusDto {
  return agentStatusFromJson({
    schemaVersion: "agent-status.v1",
    generatedAt: "2026-07-09T02:00:00.000Z",
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
    providers: [{
      providerId: "provider_fake_local",
      label: "Fake Local Model Provider",
      adapterVersion: "fake-provider.v1",
      endpointKind: "local-engine",
      modelFamilies: ["fake-local"],
      credentialKinds: ["local-no-secret"],
      supportsStructuredOutput: false,
      supportsToolCalling: false,
      safeDataNotes: "Deterministic local fake provider for UI tests."
    }],
    pendingApprovalCount: 1,
    activeLockCount: 0,
    diagnostics: [],
    tasks: [],
    runs: [],
    toolRequests: [],
    activeMemory: [],
    permissions: [],
    locks: [],
    providerReadiness: {
      schemaVersion: "agent-provider-readiness.v1",
      generatedAt: "2026-07-09T02:00:00.000Z",
      cards: [{
        providerId: "provider_fake_local",
        label: "Fake Local Model Provider",
        backendKind: "local-engine",
        state: "ready",
        capabilitySummary: ["text"],
        credentialKindSummary: ["local-no-secret"],
        credentialHealth: "not-required",
        dataHandlingPosture: "local-only",
        requiredApprovalClass: "provider-byte-transfer",
        safeActionIds: []
      }],
      diagnostics: []
    },
    ...overrides
  });
}

function agentCockpit(
  overrides: Partial<AgentCockpitDto["summary"]> = {}
): AgentCockpitDto {
  return agentCockpitFromJson({
    schemaVersion: "agent-cockpit.v1",
    generatedAt: "2026-07-09T02:00:00.000Z",
    summary: {
      activeTaskCount: 0,
      activeRunCount: 0,
      pendingApprovalCount: 1,
      activeLockCount: 0,
      mergeAfterScheduler: false,
      ...overrides
    },
    taskQueue: [],
    runQueue: [],
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
