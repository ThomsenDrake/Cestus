import { describe, expect, it } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildRequestQueueRows, type RequestQueueRow } from "../../prr/src/read-api.js";
import { goldenPrrLedgerEvents } from "../../prr/test/fixtures/golden-prr-ledger.js";
import type { AgentStatusDto } from "../src/agent/agent-types.js";
import { buildCommandBoardViewModel, filterQueueItems, getSelectedCommandItem } from "../src/workspace/command-model.js";
import { commandWorkspaceFixture } from "../src/workspace/command-fixtures.js";

describe("CommandBoardViewModel", () => {
  it("turns PRR projection rows into operator-friendly queue items", () => {
    const projection = buildPrrProjection(goldenPrrLedgerEvents);
    const rows = buildRequestQueueRows(projection);

    const model = buildCommandBoardViewModel({
      requestRows: rows,
      diagnostics: projection.diagnostics,
      evidenceAlerts: [],
      todayIso: "2026-07-20",
      reviewedItemIds: []
    });

    expect(model.statusMetrics).toContainEqual({
      id: "open-requests",
      label: "Open requests",
      value: "9",
      tone: "cyan"
    });
    expect(model.statusMetrics).toContainEqual({
      id: "due-soon",
      label: "Due soon",
      value: "3",
      tone: "amber"
    });
    expect(model.queueItems).toContainEqual(expect.objectContaining({
      id: "deadline:prr_req_001",
      kind: "deadline",
      severity: "medium",
      title: "Example Agency response window",
      sourceLabel: "estimated deadline",
      actionLabel: "Review deadline"
    }));
  });

  it("prioritizes confirmed stalling before routine deadline items", () => {
    const rows: RequestQueueRow[] = [
      {
        prrRequestId: "prr_req_stalled",
        agencyName: "Stalled Agency",
        status: "awaitingProduction",
        deadlineDate: "2026-07-18",
        deadlineSource: "confirmed",
        possibleStalling: true,
        confirmedStalling: true,
        productionCount: 0
      },
      {
        prrRequestId: "prr_req_due",
        agencyName: "Due Agency",
        status: "sent",
        deadlineDate: "2026-07-21",
        deadlineSource: "estimated",
        possibleStalling: false,
        confirmedStalling: false,
        productionCount: 0
      }
    ];

    const model = buildCommandBoardViewModel({
      requestRows: rows,
      diagnostics: [],
      evidenceAlerts: [],
      todayIso: "2026-07-20",
      reviewedItemIds: []
    });

    expect(model.queueItems.map((item) => item.id)).toStrictEqual([
      "signal:prr_req_stalled",
      "deadline:prr_req_stalled",
      "deadline:prr_req_due"
    ]);
    expect(model.statusMetrics).toContainEqual({
      id: "stalled-signals",
      label: "Stalled signals",
      value: "1",
      tone: "red"
    });
  });

  it("filters queue items and returns selected detail without mutating the model", () => {
    const model = buildCommandBoardViewModel(commandWorkspaceFixture);

    expect(filterQueueItems(model.queueItems, "evidence").every((item) => item.kind === "evidence")).toBe(true);
    expect(filterQueueItems(model.queueItems, "all")).toHaveLength(model.queueItems.length);
    expect(getSelectedCommandItem(model, "evidence:ev_prr_production_003")?.detail.provenanceRefs).toStrictEqual([
      "ev_prr_production_003"
    ]);
    expect(getSelectedCommandItem(model, "missing")).toBeUndefined();
  });

  it("adds decision votes to the default rail and selected queue details", () => {
    const model = buildCommandBoardViewModel(commandWorkspaceFixture);
    const stalled = getSelectedCommandItem(model, "signal:prr_req_airport_022");

    expect(model.decisionRail.defaultVotes.map((vote) => [vote.id, vote.state])).toStrictEqual([
      ["legal-risk", "review"],
      ["factual-confidence", "watch"],
      ["cost-pressure", "review"]
    ]);

    expect(stalled?.detail.decisionVotes.map((vote) => [vote.id, vote.state])).toStrictEqual([
      ["legal-risk", "human-decision-required"],
      ["factual-confidence", "review"],
      ["cost-pressure", "watch"]
    ]);
    expect(stalled?.detail.provenanceRefs).toContain("prr_req_airport_022");
  });

  it("derives the AgentBrief from resident agent status when supplied", () => {
    const model = buildCommandBoardViewModel({
      ...commandWorkspaceFixture,
      agentStatus: agentStatus()
    });

    expect(model.agentBrief.watching).toContain("1 pending agent approval");
    expect(model.agentBrief.watching).toContain("1 active agent lock");
    expect(model.agentBrief.watching).toContain("1 provider backend: Fake Local Model Provider");
    expect(model.agentBrief.changedSinceReview).toContain("Review provider approval | evt_task_created");
    expect(model.agentBrief.uncertain).toContain("Lock lock_legal_escalation active from evt_lock_active");
    expect(model.agentBrief.recommendedActions).toContain(
      "Review toolreq_provider_preview approval for external-byte-transfer | evt_tool_requested"
    );
  });

  it("redacts credential-shaped strings from serialized AgentBrief fields", () => {
    const model = buildCommandBoardViewModel({
      ...commandWorkspaceFixture,
      agentStatus: agentStatus({
        providers: [
          {
            providerId: "provider_openai",
            label: "OpenAI sk-live-provider OPENAI_API_KEY",
            adapterVersion: "openai-adapter.v1",
            endpointKind: "openai-api",
            modelFamilies: ["gpt-4.1"],
            credentialKinds: ["api-key-bearer"],
            supportsStructuredOutput: true,
            supportsToolCalling: true,
            safeDataNotes: "Safe notes."
          }
        ],
        tasks: [
          {
            taskId: "task_sk_live_task",
            residentAgentId: "agent_default",
            title: "Review ghp_task and OPENAI_API_KEY",
            requestedBy: "actor_case_owner",
            priority: "normal",
            status: "waiting-for-approval",
            createdAt: "2026-07-07T21:00:00.000Z",
            sourceEventIds: ["evt_OPENAI_API_KEY"],
            inputArtifactHashes: [],
            eventIds: ["evt_sk-live_task"],
            causationIds: []
          }
        ],
        toolRequests: [
          {
            toolRequestId: "toolreq_ghp_request",
            runId: "run_provider_review",
            toolId: "provider.parse.preview",
            toolVersion: "1",
            requestedBy: "actor_cestus_agent",
            sideEffectClass: "external-byte-transfer",
            requiredApprovalClass: "provider-byte-transfer",
            previewHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
            scope: "workspace",
            estimatedEffect: "Provider byte transfer preview.",
            state: "requested",
            requestedAt: "2026-07-07T21:01:00.000Z",
            sourceEventIds: ["evt_tool_sk_live_source"],
            inputArtifactHashes: [],
            resultEventIds: [],
            artifactHashes: [],
            readModelChanges: [],
            allowedActions: [],
            eventIds: ["evt_tool_ghp_event"],
            causationIds: []
          }
        ],
        locks: [
          {
            lockId: "lock_OPENAI_API_KEY",
            residentAgentId: "agent_default",
            kind: "secret",
            activatedBy: "actor_case_owner",
            reason: "Secret-shaped runtime note.",
            activatedAt: "2026-07-07T21:00:00.000Z",
            relatedEventIds: ["evt_lock_ghp_related"],
            state: "active",
            clearRelatedEventIds: [],
            eventIds: ["evt_lock_sk_live_event"],
            causationIds: []
          }
        ],
        pendingApprovalCount: 1,
        activeLockCount: 1
      })
    });

    expect(JSON.stringify(model.agentBrief)).not.toMatch(/sk-live|sk_live|ghp_|OPENAI_API_KEY/i);
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
        safeDataNotes: "Deterministic local fake provider for command tests."
      }
    ],
    pendingApprovalCount: 1,
    activeLockCount: 1,
    diagnostics: [],
    tasks: [
      {
        taskId: "task_provider_review",
        residentAgentId: "agent_default",
        title: "Review provider approval",
        requestedBy: "actor_case_owner",
        priority: "normal",
        status: "waiting-for-approval",
        createdAt: "2026-07-07T21:00:00.000Z",
        sourceEventIds: ["evt_operator_status"],
        inputArtifactHashes: [],
        runId: "run_provider_review",
        eventIds: ["evt_task_created"],
        causationIds: []
      }
    ],
    runs: [],
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
        estimatedEffect: "Provider byte transfer preview.",
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
    activeMemory: [],
    permissions: [],
    locks: [
      {
        lockId: "lock_legal_escalation",
        residentAgentId: "agent_default",
        kind: "legal-escalation",
        activatedBy: "actor_case_owner",
        reason: "Human legal review is required.",
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
