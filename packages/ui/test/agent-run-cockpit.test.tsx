/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentRunCockpit } from "../src/agent/AgentRunCockpit.js";
import { agentCockpitFromJson } from "../src/agent/agent-adapter.js";
import type { AgentCockpitDto } from "../src/agent/agent-types.js";

describe("AgentRunCockpit", () => {
  it("renders a dense read-only cockpit with safe summary labels and queue detail", () => {
    render(<AgentRunCockpit cockpit={cockpitFixture()} />);

    const region = screen.getByRole("region", { name: "Agent run cockpit" });

    for (const label of ["Watching", "Doing", "Needs", "Blocked", "Changed", "Evidence"]) {
      expect(within(region).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(within(region).getByRole("tab", { name: "Queue" })).toHaveAttribute("aria-selected", "true");
    expect(within(region).getAllByText(/task_provider_review/).length).toBeGreaterThan(0);
    expect(within(region).getAllByText(/task_unstarted/).length).toBeGreaterThan(0);
    expect(within(region).getAllByText(/run_report_done/).length).toBeGreaterThan(0);
    expect(within(region).getAllByText(/run_provider_review/).length).toBeGreaterThan(0);

    for (const forbiddenName of [
      /approve/i,
      /deny/i,
      /execute/i,
      /send prr/i,
      /transfer provider bytes/i,
      /clear lock/i,
      /accept graph/i,
      /export/i,
      /repair/i
    ]) {
      expect(within(region).queryByRole("button", { name: forbiddenName })).not.toBeInTheDocument();
    }
  });

  it("renders active queue run details when selected run data is absent", () => {
    render(<AgentRunCockpit cockpit={cockpitFixture({ includeSelectedRun: false })} />);

    const region = screen.getByRole("region", { name: "Agent run cockpit" });

    fireEvent.click(within(region).getByRole("tab", { name: "Audit" }));
    expect(within(region).getByRole("region", { name: "Active queued run" })).toBeInTheDocument();
    expect(within(region).getByText("run_report_done")).toBeInTheDocument();
    expect(within(region).getByText("report-builder")).toBeInTheDocument();
    expect(within(region).getByText("completed")).toBeInTheDocument();
    expect(within(region).getByText(/detailed selected-run audit is unavailable yet/i)).toBeInTheDocument();
    expect(within(region).getByText(/no selected-run audit details are available yet/i)).toBeInTheDocument();

    fireEvent.click(within(region).getByRole("tab", { name: "Handoff" }));
    expect(within(region).getByRole("region", { name: "Active queued run" })).toBeInTheDocument();
    expect(within(region).getByText(/detailed selected-run handoff is unavailable yet/i)).toBeInTheDocument();
    expect(within(region).getByText(/no selected-run handoff artifacts are available yet/i)).toBeInTheDocument();
  });

  it("wraps section header meta values instead of truncating them", () => {
    const longRunId = `run_${"a".repeat(80)}`;
    render(<AgentRunCockpit cockpit={cockpitFixture({ selectedRunId: longRunId })} />);

    const region = screen.getByRole("region", { name: "Agent run cockpit" });
    fireEvent.click(within(region).getByRole("tab", { name: "Run" }));

    const meta = within(region).getByText(longRunId);
    expect(meta).toHaveClass("break-all");
    expect(meta).not.toHaveClass("truncate");
  });

  it("renders run steps, pending approval refs, audit summaries, and handoff artifacts across tabs", () => {
    render(<AgentRunCockpit cockpit={cockpitFixture()} />);

    const region = screen.getByRole("region", { name: "Agent run cockpit" });

    fireEvent.click(within(region).getByRole("tab", { name: "Run" }));
    expect(within(region).getByText("step_report_draft")).toBeInTheDocument();
    expect(within(region).getByText("toolreq_provider_review")).toBeInTheDocument();
    expect(within(region).getByText("lock_provider_review")).toBeInTheDocument();

    fireEvent.click(within(region).getByRole("tab", { name: "Audit" }));
    expect(within(region).getAllByText("provider_fake_local").length).toBeGreaterThan(0);
    expect(within(region).getAllByText("fake-local").length).toBeGreaterThan(0);
    expect(within(region).getByText("completed")).toBeInTheDocument();
    expect(within(region).getByText("sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBeInTheDocument();
    expect(within(region).getByText("12 input, 8 output, 20 total")).toBeInTheDocument();
    expect(within(region).getByText("task-run-history.v1")).toBeInTheDocument();
    expect(within(region).getByText("sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc")).toBeInTheDocument();
    expect(within(region).getByText("1 omission")).toBeInTheDocument();
    expect(within(region).getByText("2 staleness inputs")).toBeInTheDocument();
    expect(within(region).getByText("mem_case_goal")).toBeInTheDocument();
    expect(within(region).getByText("0.82")).toBeInTheDocument();

    fireEvent.click(within(region).getByRole("tab", { name: "Handoff" }));
    expect(within(region).getByText("ready-for-human-review")).toBeInTheDocument();
    expect(within(region).getByText("Draft report outline produced.")).toBeInTheDocument();
    expect(within(region).getByText("sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd")).toBeInTheDocument();
    expect(within(region).getByText("evt_report_done")).toBeInTheDocument();
  });
});

function cockpitFixture(input: {
  readonly includeSelectedRun?: boolean;
  readonly selectedRunId?: string;
} = {}): AgentCockpitDto {
  return cockpitFixtureWithOptions(input);
}

function cockpitFixtureWithOptions(input: {
  readonly includeSelectedRun?: boolean;
  readonly selectedRunId?: string;
} = {}): AgentCockpitDto {
  const selectedRunId = input.selectedRunId ?? "run_report_done";
  const selectedRun = input.includeSelectedRun === false ? undefined : {
    runId: selectedRunId,
    taskId: "task_unstarted",
    runType: "report-builder",
    state: "completed",
    startedAt: "2026-07-09T12:01:30.000Z",
    summary: "Draft report outline produced.",
    currentStepCount: 1,
    modelInvocationCount: 2,
    pendingApprovalCount: 0,
    blockedReasonCount: 0,
    stepIds: ["step_report_draft"],
    pendingApprovalIds: ["toolreq_provider_review"],
    blockedReasons: ["lock_provider_review"],
    modelInvocations: [
      {
        invocationId: "inv_report_done",
        providerId: "provider_fake_local",
        modelFamily: "fake-local",
        status: "completed",
        inputArtifactHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        outputArtifactHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        usageSummary: "12 input, 8 output, 20 total"
      },
      {
        invocationId: "inv_report_retry",
        providerId: "provider_fake_local",
        modelFamily: "fake-local",
        status: "failed",
        inputArtifactHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        failureCategory: "model-output-invalid",
        retryable: true
      }
    ],
    contextPacks: [
      {
        contextPackId: "task-run-history.v1",
        contentHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        safeSummary: "Prior agent task history.",
        generatedAt: "2026-07-09T12:01:00.000Z",
        provenanceRefs: ["evt_task_history_001", "evt_task_history_002", "evt_task_history_003"],
        sourceEventIds: ["evt_task_history_001"],
        artifactHashes: ["sha256:9999999999999999999999999999999999999999999999999999999999999999"]
      }
    ],
    handoff: {
      state: "ready-for-human-review",
      summary: "Draft report outline produced.",
      artifactHashes: ["sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"],
      relatedEventIds: ["evt_report_done"]
    }
  };

  return agentCockpitFromJson({
    schemaVersion: "agent-cockpit.v1",
    generatedAt: "2026-07-09T12:10:00.000Z",
    summary: {
      activeTaskCount: 2,
      activeRunCount: 2,
      pendingApprovalCount: 1,
      activeLockCount: 1,
      mergeAfterScheduler: true
    },
    taskQueue: [
      {
        taskId: "task_provider_review",
        title: "Review provider approval",
        priority: "normal",
        status: "waiting-for-approval",
        createdAt: "2026-07-09T12:00:00.000Z",
        runId: "run_provider_review"
      },
      {
        taskId: "task_unstarted",
        title: "Draft report outline",
        priority: "high",
        status: "queued",
        createdAt: "2026-07-09T12:01:00.000Z"
      }
    ],
    runQueue: [
      {
        runId: "run_report_done",
        taskId: "task_unstarted",
        runType: "report-builder",
        state: "completed",
        startedAt: "2026-07-09T12:01:30.000Z",
        summary: "Draft report outline produced.",
        currentStepCount: 1,
        modelInvocationCount: 2,
        pendingApprovalCount: 0,
        blockedReasonCount: 0
      },
      {
        runId: "run_provider_review",
        taskId: "task_provider_review",
        runType: "evidence-triage",
        state: "running",
        startedAt: "2026-07-09T12:00:30.000Z",
        currentStepCount: 1,
        modelInvocationCount: 1,
        pendingApprovalCount: 1,
        blockedReasonCount: 1
      }
    ],
    ...(selectedRun === undefined ? {} : { selectedRun }),
    needsNext: [
      {
        kind: "approval",
        severity: "action-required",
        label: "Review provider byte-transfer approval",
        relatedTaskId: "task_provider_review",
        relatedRunId: "run_provider_review",
        relatedToolRequestId: "toolreq_provider_review",
        safeAction: "review-approval"
      },
      {
        kind: "handoff",
        severity: "info",
        label: "Review report-builder handoff",
        relatedTaskId: "task_unstarted",
        relatedRunId: "run_report_done",
        safeAction: "review-handoff"
      }
    ],
    memorySnippets: [
      {
        memoryId: "mem_case_goal",
        scope: "investigation",
        summary: "Keep PRR drafts human-reviewed.",
        createdAt: "2026-07-09T12:00:10.000Z",
        sourceEventIds: ["evt_memory_source_001"],
        artifactHashes: ["sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"],
        confidence: 0.82
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
    ]
  });
}
