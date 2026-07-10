/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildAgentCockpit } from "../../agent/src/cockpit.js";
import { AgentTaskComposer } from "../src/agent/AgentTaskComposer.js";
import { agentStatusFromJson } from "../src/agent/agent-adapter.js";
import type {
  AgentCockpitDto,
  AgentStatusDto,
  CreateAgentTaskInput
} from "../src/agent/agent-types.js";

describe("AgentTaskComposer", () => {
  it("renders the labeled handoff region with safe ID previews and posture", () => {
    render(
      <AgentTaskComposer
        cockpit={agentCockpit({ mergeAfterScheduler: true })}
        status={agentStatus()}
        onCreateTask={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    const composer = screen.getByRole("region", { name: "Give Cestus Agent a task" });
    expect(within(composer).getByLabelText("Task title")).toBeInTheDocument();
    expect(within(composer).queryByLabelText("Desired specialist")).not.toBeInTheDocument();
    expect(within(composer).queryByLabelText("Scope kind")).not.toBeInTheDocument();
    expect(within(composer).queryByLabelText("Scope refs")).not.toBeInTheDocument();
    expect(within(composer).queryByText("Desired specialist")).not.toBeInTheDocument();
    expect(within(composer).queryByText("Scope")).not.toBeInTheDocument();
    expect(within(composer).getByText("Provider readiness available")).toBeInTheDocument();
    expect(within(composer).getByText("1 pending approval")).toBeInTheDocument();
    expect(within(composer).getByText("Merge after scheduler is enabled.")).toBeInTheDocument();

    fireEvent.change(within(composer).getByLabelText("Task title"), {
      target: { value: "Review provider approval" }
    });

    expect(within(composer).getByText(/task_review-provider-approval_[a-z0-9]+/i)).toBeInTheDocument();
    expect(within(composer).queryByText(/run_review-provider-approval_[a-z0-9]+/i)).not.toBeInTheDocument();
  });

  it("creates a task from exactly the persisted form values", async () => {
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
    fireEvent.change(within(composer).getByLabelText("Description"), {
      target: { value: "Check the provider preview against case policy." }
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Queue task" }));

    await waitFor(() => expect(onCreateTask).toHaveBeenCalledTimes(1));
    const queuedInput = onCreateTask.mock.calls[0]?.[0];
    expect(queuedInput).toEqual({
      taskId: expect.stringMatching(/^task_review-provider-approval_[a-z0-9]+$/i),
      title: "Review provider approval",
      priority: "normal",
      description: "Check the provider preview against case policy."
    });
    expect(Object.keys(queuedInput ?? {}).sort()).toEqual(["description", "priority", "taskId", "title"]);
    expect(JSON.stringify(queuedInput)).not.toMatch(/evidence-triage|prr-negotiation|workspace|investigation|ws_case_001/i);
  });

  it("emits urgent priority when selected in the task composer", async () => {
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
      target: { value: "Review urgent provider approval" }
    });
    fireEvent.change(within(composer).getByLabelText("Priority"), {
      target: { value: "urgent" }
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Queue task" }));

    await waitFor(() => expect(onCreateTask).toHaveBeenCalledTimes(1));
    expect(onCreateTask).toHaveBeenCalledWith({
      taskId: expect.stringMatching(/^task_review-urgent-provider-approval_[a-z0-9]+$/i),
      title: "Review urgent provider approval",
      priority: "urgent"
    });
  });

  it("rotates the proposed task ID after a successful queue operation", async () => {
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

    fireEvent.click(within(composer).getByRole("button", { name: "Queue task" }));
    await waitFor(() => expect(onCreateTask).toHaveBeenCalledTimes(1));
    const firstTaskId = onCreateTask.mock.calls[0]?.[0].taskId;

    await waitFor(() => {
      expect(within(composer).getByText(/^task_review-provider-approval_[a-z0-9]+$/i).textContent).not.toBe(firstTaskId);
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Queue task" }));
    await waitFor(() => expect(onCreateTask).toHaveBeenCalledTimes(2));

    expect(onCreateTask.mock.calls[1]?.[0]).toEqual({
      taskId: expect.stringMatching(/^task_review-provider-approval_[a-z0-9]+$/i),
      title: "Review provider approval",
      priority: "normal"
    });
    expect(onCreateTask.mock.calls[1]?.[0].taskId).not.toBe(firstTaskId);
  });

  it("queues a task without exposing specialist, scope, run-start callback, or route shape", async () => {
    const onCreateTask = vi.fn(async () => ({
      ok: true as const,
      taskId: "task_route_authoritative",
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
    fireEvent.click(within(composer).getByRole("button", { name: "Queue task" }));

    await waitFor(() => expect(onCreateTask).toHaveBeenCalledTimes(1));
    expect(onCreateTask).toHaveBeenCalledWith({
      taskId: expect.stringMatching(/^task_review-provider-approval_[a-z0-9]+$/i),
      title: "Review provider approval",
      priority: "normal"
    });
    expect(within(composer).queryByLabelText("Desired specialist")).not.toBeInTheDocument();
    expect(within(composer).queryByLabelText("Scope kind")).not.toBeInTheDocument();
    expect(within(composer).queryByLabelText("Scope refs")).not.toBeInTheDocument();
    expect(within(composer).queryByRole("button", { name: /start run/i })).not.toBeInTheDocument();
  });

  it("keeps queueing separate from blocked specialist readiness", () => {
    const baseStatus = agentStatus();
    if (baseStatus.identity === undefined) {
      throw new Error("Expected agent identity fixture.");
    }

    const { rerender } = render(
      <AgentTaskComposer
        cockpit={agentCockpit()}
        status={baseStatus}
      />
    );

    let composer = screen.getByRole("region", { name: "Give Cestus Agent a task" });
    expect(within(composer).getByRole("button", { name: "Queue task" })).toBeDisabled();
    expect(within(composer).queryByRole("button", { name: /start run/i })).not.toBeInTheDocument();

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
      />
    );

    composer = screen.getByRole("region", { name: "Give Cestus Agent a task" });
    expect(within(composer).queryByRole("button", { name: /start run/i })).not.toBeInTheDocument();
    expect(within(composer).getByText("Active data-loss or secret locks require inspection.")).toBeInTheDocument();

    rerender(
      <AgentTaskComposer
        cockpit={agentCockpit()}
        status={agentStatus({ providerReadiness: undefined })}
        onCreateTask={vi.fn()}
      />
    );

    composer = screen.getByRole("region", { name: "Give Cestus Agent a task" });
    expect(within(composer).getAllByText("Provider readiness is unavailable.").length).toBeGreaterThan(0);

    expect(within(composer).queryByText("no allowed run types")).not.toBeInTheDocument();
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
        onRefresh={vi.fn()}
      />
    );

    const composer = screen.getByRole("region", { name: "Give Cestus Agent a task" });
    fireEvent.change(within(composer).getByLabelText("Task title"), {
      target: { value: "Review provider approval" }
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Queue task" }));

    await waitFor(() => {
      expect(within(composer).getByText("Task handoff could not be completed safely.")).toBeInTheDocument();
    });
    expect(composer.textContent).not.toMatch(/scheduler wake|bearer|raw-value|\/tmp\/run-secrets/i);

    const commandLabels = within(composer).getAllByRole("button").map((button) => button.textContent);
    expect(commandLabels).toEqual(["Queue task", "Refresh"]);
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
  const cockpit = buildAgentCockpit({
    status: agentStatus(),
    generatedAt: "2026-07-09T02:00:00.000Z"
  });

  return {
    ...cockpit,
    summary: {
      ...cockpit.summary,
      ...overrides
    }
  };
}
