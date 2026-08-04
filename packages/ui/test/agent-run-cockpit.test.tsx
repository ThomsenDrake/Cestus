/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildAgentCockpit } from "../../agent/src/cockpit.js";
import { AgentRunCockpit } from "../src/agent/AgentRunCockpit.js";
import {
  agentCockpitFromJson,
  runtimeUnavailableAgentStatus
} from "../src/agent/agent-adapter.js";
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
    expect(within(region).getByRole("region", { name: "Specialist workflow readiness" })).toBeInTheDocument();
    expect(within(region).getAllByText(/contradiction-claim-review/).length).toBeGreaterThan(0);
    expect(within(region).getByText("PRR Negotiation")).toBeInTheDocument();
    expect(within(region).getAllByText(/agent_default/).length).toBeGreaterThan(0);
    expect(within(region).getByText("Draft follow-ups, deadline reviews, fee challenges, and escalation posture notes without sending anything.")).toBeInTheDocument();
    expect(within(region).getByText("timeline-draft-summary.v1")).toBeInTheDocument();
    expect(within(region).getByText("accepted-graph-projection.v1")).toBeInTheDocument();
    expect(within(region).getByText("workspace-runtime-status.v1")).toBeInTheDocument();
    expect(within(region).getAllByText("executionReady: false").length).toBeGreaterThan(0);

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

  it("shows an explicit missing-data diagnostic without substituting the active queue run", () => {
    render(<AgentRunCockpit cockpit={cockpitFixture({ includeSelectedRun: false })} />);

    const region = screen.getByRole("region", { name: "Agent run cockpit" });

    fireEvent.click(within(region).getByRole("tab", { name: "Audit" }));
    expect(within(region).queryByRole("region", { name: "Active queued run" })).not.toBeInTheDocument();
    expect(within(region).queryByText("run_report_done")).not.toBeInTheDocument();
    expect(within(region).queryByText("report-builder")).not.toBeInTheDocument();
    expect(within(region).getByText(/selected-run data is unavailable; queue summary was not substituted/i)).toBeInTheDocument();
    expect(within(region).getByText(/no selected-run audit details are available yet/i)).toBeInTheDocument();

    fireEvent.click(within(region).getByRole("tab", { name: "Handoff" }));
    expect(within(region).queryByRole("region", { name: "Active queued run" })).not.toBeInTheDocument();
    expect(within(region).getByText(/selected-run data is unavailable; queue summary was not substituted/i)).toBeInTheDocument();
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
    expect(within(region).getAllByText("toolreq_provider_review").length).toBeGreaterThan(0);
    expect(within(region).getByText("lock_provider_review")).toBeInTheDocument();
    expect(within(region).getAllByText(/plan_report_done \| revision 0/).length).toBe(2);
    expect(within(region).getByText("evt_resident_plan_report")).toBeInTheDocument();
    expect(within(region).getByText(/1\. local\.report-outline/)).toBeInTheDocument();
    expect(within(region).getByText(/observation_report_done \| tool-result/)).toBeInTheDocument();
    expect(within(region).getByText("Draft outline artifact recorded for human review.")).toBeInTheDocument();
    expect(within(region).getByText("evt_resident_observation_report")).toBeInTheDocument();

    fireEvent.click(within(region).getByRole("tab", { name: "Audit" }));
    expect(within(region).getAllByText("provider_fake_local").length).toBeGreaterThan(0);
    expect(within(region).getAllByText("fake-local").length).toBeGreaterThan(0);
    expect(within(region).getByText("completed")).toBeInTheDocument();
    expect(within(region).getByText("sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBeInTheDocument();
    expect(within(region).getByText("12 input, 8 output, 20 total")).toBeInTheDocument();
    expect(within(region).getByText("task-run-history.v1")).toBeInTheDocument();
    expect(within(region).getByText("sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc")).toBeInTheDocument();
    expect(within(region).getByText("2 omissions")).toBeInTheDocument();
    expect(within(region).getByText("3 staleness inputs")).toBeInTheDocument();
    expect(within(region).getByText("mem_case_goal")).toBeInTheDocument();
    expect(within(region).getByText("0.82")).toBeInTheDocument();

    fireEvent.click(within(region).getByRole("tab", { name: "Handoff" }));
    expect(within(region).getByText("ready-for-review")).toBeInTheDocument();
    expect(within(region).getByText("Draft report outline ready for human review.")).toBeInTheDocument();
    expect(within(region).getByText("artifact_report_outline")).toBeInTheDocument();
    expect(within(region).getByText("report-outline | report-builder-handoff.v1")).toBeInTheDocument();
    expect(within(region).getByText("sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd")).toBeInTheDocument();
    expect(within(region).getByText("task-run-history.v1")).toBeInTheDocument();
    expect(within(region).getByText("toolreq_provider_review")).toBeInTheDocument();
    expect(within(region).getByText("human-review")).toBeInTheDocument();
    expect(within(region).getByText("Review draft report outline")).toBeInTheDocument();
  });

  it("selects run cards without substituting either run's detail, audit, or handoff", () => {
    render(<AgentRunCockpit cockpit={cockpitFixture()} />);

    const region = screen.getByRole("region", { name: "Agent run cockpit" });

    fireEvent.click(within(region).getByRole("button", { name: "Select run run_provider_review" }));
    fireEvent.click(within(region).getByRole("tab", { name: "Audit" }));

    expect(within(region).queryByRole("region", { name: "Active queued run" })).not.toBeInTheDocument();
    expect(within(region).queryByText("run_provider_review")).not.toBeInTheDocument();
    expect(within(region).queryByText("evidence-triage")).not.toBeInTheDocument();
    expect(within(region).getByText(/selected-run data is unavailable; queue summary was not substituted/i)).toBeInTheDocument();
    expect(within(region).queryByText("inv_report_done")).not.toBeInTheDocument();
    expect(within(region).queryByText("sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).not.toBeInTheDocument();

    fireEvent.click(within(region).getByRole("tab", { name: "Handoff" }));
    expect(within(region).queryByRole("region", { name: "Active queued run" })).not.toBeInTheDocument();
    expect(within(region).queryByText("run_provider_review")).not.toBeInTheDocument();
    expect(within(region).queryByText("Draft report outline ready for human review.")).not.toBeInTheDocument();
    expect(within(region).queryByText("artifact_report_outline")).not.toBeInTheDocument();
  });

  it("renders browser-safe sourced timeline and contradiction handoffs for the exact selected run", () => {
    for (const runType of ["timeline-builder", "contradiction-finder"] as const) {
      const { unmount } = render(<AgentRunCockpit cockpit={sourcedSelectedRunCockpit(runType)} />);
      const region = screen.getByRole("region", { name: "Agent run cockpit" });
      fireEvent.click(within(region).getByRole("tab", { name: "Handoff" }));

      const timeline = runType === "timeline-builder";
      expect(within(region).getByText(timeline
        ? "Sourced timeline with exact citations is ready for review."
        : "Contradiction candidates with exact paired sources are ready for review."
      )).toBeInTheDocument();
      expect(within(region).getByText(timeline
        ? "timeline-artifact | timeline-builder-handoff.v1"
        : "contradiction-candidate-dossier | contradiction-finder-handoff.v1"
      )).toBeInTheDocument();
      expect(within(region).getByText("Human review required")).toBeInTheDocument();
      expect(within(region).getAllByText("evidence-summary.v1").length).toBeGreaterThan(0);
      expect(within(region).getByText(timeline
        ? "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        : "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      )).toBeInTheDocument();
      expect(within(region).queryByText(/raw source|provider body|authorization:/i)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("renders only the safe report preview IDs, exclusion categories, and approval requirements", () => {
    const base = cockpitFixture();
    if (base.selectedRun === undefined) throw new Error("report cockpit fixture requires a selected run");
    const cockpit = agentCockpitFromJson({
      ...base,
      selectedRun: {
        ...base.selectedRun,
        modelInvocations: [],
        reportPreview: {
          schemaVersion: "agent-report-public-safe-preview.v1",
          mode: "preview-only",
          includedEvidenceRefs: ["ev_source_public"],
          excludedEvidence: [{
            evidenceRef: "ev_source_private",
            categories: ["private"],
            approvalIds: ["human-approve-private-evidence-inclusion"]
          }],
          sensitiveOptInRequirements: [{
            evidenceRef: "ev_source_private",
            category: "private",
            approvalId: "human-approve-private-evidence-inclusion"
          }]
        }
      }
    });

    render(<AgentRunCockpit cockpit={cockpit} />);
    const region = screen.getByRole("region", { name: "Agent run cockpit" });
    fireEvent.click(within(region).getByRole("tab", { name: "Handoff" }));

    expect(within(region).getByRole("region", { name: "Public-safe report preview" })).toBeInTheDocument();
    expect(within(region).getByText("ev_source_public")).toBeInTheDocument();
    expect(within(region).getAllByText("ev_source_private").length).toBeGreaterThan(0);
    expect(within(region).getAllByText("private").length).toBeGreaterThan(0);
    expect(within(region).getAllByText("human-approve-private-evidence-inclusion").length).toBeGreaterThan(0);
    expect(JSON.stringify(cockpit.selectedRun)).not.toMatch(/private mailbox body|authorization: bearer|sk_live_/i);
    expect(within(region).queryByText(/private mailbox body|authorization: bearer|sk_live_/i)).not.toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: /include private|export|publish/i })).not.toBeInTheDocument();
  });
});

function sourcedSelectedRunCockpit(runType: "timeline-builder" | "contradiction-finder"): AgentCockpitDto {
  const base = cockpitFixture();
  const timeline = runType === "timeline-builder";
  const runId = timeline ? "run_timeline_browser_001" : "run_contradiction_browser_001";
  const taskId = timeline ? "task_timeline_browser_001" : "task_contradiction_browser_001";
  const artifactId = timeline ? "artifact_timeline_browser_001" : "artifact_contradiction_browser_001";
  const artifactHash = timeline
    ? "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    : "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
  const selectedRun = {
    runId,
    taskId,
    runType,
    state: "completed",
    startedAt: "2026-08-03T12:00:00.000Z",
    summary: timeline ? "Sourced timeline prepared." : "Contradiction candidates prepared.",
    currentStepCount: 1,
    modelInvocationCount: 1,
    pendingApprovalCount: 0,
    blockedReasonCount: 0,
    stepIds: [`step_${runId}_final_output`],
    pendingApprovalIds: [],
    blockedReasons: [],
    modelInvocations: [],
    contextPacks: [],
    planHistory: [],
    observationHistory: [],
    handoff: {
      schemaVersion: "agent-specialist-handoff.v1",
      handoffId: `handoff_${runId}_0123456789abcdef`,
      handoffRevision: 1,
      runType,
      runId,
      taskId,
      residentAgentId: "agent_default",
      generatedAt: "2026-08-03T12:01:00.000Z",
      status: "ready-for-review",
      safeSummary: timeline
        ? "Sourced timeline with exact citations is ready for review."
        : "Contradiction candidates with exact paired sources are ready for review.",
      contextPackRefs: [{
        contextPackId: "evidence-summary.v1",
        version: 1,
        contentHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        sizeBytes: 128,
        generatedAt: "2026-08-03T12:00:00.000Z",
        safeSummary: "Exact evidence identities and content hashes.",
        provenanceRefs: ["evt_browser_source_001"],
        sourceEventIds: ["evt_browser_source_001"]
      }],
      promptArtifactHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      outputArtifacts: [{
        artifactId,
        artifactKind: timeline ? "timeline-artifact" : "contradiction-candidate-dossier",
        schemaId: timeline ? "timeline-builder-handoff.v1" : "contradiction-finder-handoff.v1",
        artifactHash,
        safeSummary: timeline
          ? "Local sourced timeline; advisory only."
          : "Local contradiction candidates; advisory only."
      }],
      toolRequestIds: [],
      approvalRequirements: [],
      nextSafeActions: [{
        actionId: `action_${runId}_review`,
        label: "Human review required",
        kind: "review",
        effect: "none",
        artifactId
      }]
    }
  };
  return agentCockpitFromJson({
    ...base,
    runQueue: [{
      runId,
      taskId,
      runType,
      state: "completed",
      startedAt: "2026-08-03T12:00:00.000Z",
      summary: selectedRun.summary,
      currentStepCount: 1,
      modelInvocationCount: 1,
      pendingApprovalCount: 0,
      blockedReasonCount: 0
    }],
    selectedRun
  });
}

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
        omissionCount: 2,
        usageSummary: "12 input, 8 output, 20 total"
      },
      {
        invocationId: "inv_report_retry",
        providerId: "provider_fake_local",
        modelFamily: "fake-local",
        status: "failed",
        inputArtifactHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        omissionCount: 0,
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
        stalenessInputCount: 3,
        sourceEventIds: ["evt_task_history_001"],
        artifactHashes: ["sha256:9999999999999999999999999999999999999999999999999999999999999999"]
      }
    ],
    planHistory: [
      {
        eventId: "evt_resident_plan_report",
        runId: selectedRunId,
        taskId: "task_unstarted",
        attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        planId: "plan_report_done",
        planRevision: 0,
        recordedAt: "2026-07-09T12:01:31.000Z",
        steps: [
          {
            ordinal: 1,
            purpose: "Prepare a local draft outline.",
            toolId: "local.report-outline",
            expectedSafeOutputClass: "derivative"
          }
        ]
      }
    ],
    observationHistory: [
      {
        eventId: "evt_resident_observation_report",
        runId: selectedRunId,
        taskId: "task_unstarted",
        attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        observationId: "observation_report_done",
        planId: "plan_report_done",
        planRevision: 0,
        stepOrdinal: 1,
        kind: "tool-result",
        safeSummary: "Draft outline artifact recorded for human review.",
        artifactHashes: ["sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"],
        toolRequestId: "toolreq_provider_review",
        recordedAt: "2026-07-09T12:01:40.000Z"
      }
    ],
    handoff: {
      schemaVersion: "agent-specialist-handoff.v1",
      handoffId: "handoff_run_report_done_0123456789abcdef",
      handoffRevision: 1,
      runType: "report-builder",
      runId: selectedRunId,
      taskId: "task_unstarted",
      residentAgentId: "agent_default",
      generatedAt: "2026-07-09T12:02:00.000Z",
      status: "ready-for-review",
      safeSummary: "Draft report outline ready for human review.",
      contextPackRefs: [
        {
          contextPackId: "task-run-history.v1",
          version: 1,
          contentHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          sizeBytes: 120,
          generatedAt: "2026-07-09T12:01:00.000Z",
          safeSummary: "Prior agent task history.",
          provenanceRefs: ["evt_task_history_001"],
          sourceEventIds: ["evt_task_history_001"],
          artifactHashes: ["sha256:9999999999999999999999999999999999999999999999999999999999999999"]
        }
      ],
      outputArtifacts: [
        {
          artifactId: "artifact_report_outline",
          artifactKind: "report-outline",
          schemaId: "report-builder-handoff.v1",
          artifactHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          safeSummary: "Local draft outline artifact."
        }
      ],
      toolRequestIds: ["toolreq_provider_review"],
      approvalRequirements: [
        {
          approvalClass: "human-review",
          reason: "Human review before use.",
          toolRequestId: "toolreq_provider_review"
        }
      ],
      nextSafeActions: [
        {
          actionId: "action_review_report_outline",
          label: "Review draft report outline",
          kind: "review",
          effect: "none",
          artifactId: "artifact_report_outline"
        }
      ]
    }
  };

  const specialists = buildAgentCockpit({
    status: runtimeUnavailableAgentStatus({ generatedAt: "2026-07-09T12:10:00.000Z" }),
    generatedAt: "2026-07-09T12:10:00.000Z"
  }).specialists;
  const specialistsWithVisibleBlockers = {
    ...specialists,
    readiness: specialists.readiness.map((readiness) =>
      readiness.runType === "contradiction-finder"
        ? {
            ...readiness,
            staleContextPackIds: ["timeline-draft-summary.v1"],
            missingProjectionHighWaterMarkIds: ["accepted-graph-projection.v1"],
            missingProvenanceContextPackIds: ["workspace-runtime-status.v1"],
            nextSafeActions: [
              ...readiness.nextSafeActions,
              "refresh projection freshness for timeline-draft-summary.v1",
              "refresh projection freshness for accepted-graph-projection.v1"
            ]
          }
        : readiness
    )
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
    ],
    specialists: specialistsWithVisibleBlockers
  });
}
