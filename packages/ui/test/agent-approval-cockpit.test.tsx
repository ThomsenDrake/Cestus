/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentApprovalCockpit } from "../src/agent/AgentApprovalCockpit.js";
import type { AgentApprovalCockpitDto } from "../src/agent/agent-types.js";

const previewHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("AgentApprovalCockpit", () => {
  it("renders provider byte-transfer queue detail and appends approval decisions only", () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();

    render(
      <AgentApprovalCockpit
        cockpit={cockpit()}
        decisionState="idle"
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );

    const region = screen.getByRole("region", { name: "Agent approval cockpit" });
    expect(within(region).getByText("provider-byte-transfer")).toBeInTheDocument();
    expect(within(region).getByText(previewHash)).toBeInTheDocument();
    expect(within(region).getByText("evt_provider_preview")).toBeInTheDocument();
    expect(within(region).getByText(/approval records a decision only/i)).toBeInTheDocument();
    expect(within(region).getByText(/what happens after approval/i)).toBeInTheDocument();
    expect(within(region).getByText(/separate scheduler may resume/i)).toBeInTheDocument();
    expect(within(region).getByText(/exact preview hash binding/i)).toBeInTheDocument();

    fireEvent.change(within(region).getByLabelText("Decision rationale"), {
      target: { value: "Approved the exact provider preview." }
    });
    fireEvent.click(within(region).getByRole("button", { name: "Approve exact preview" }));

    expect(onApprove).toHaveBeenCalledWith({
      toolRequestId: "toolreq_provider_transfer",
      approvedPreviewHash: previewHash,
      rationale: "Approved the exact provider preview."
    });
    expect(onDeny).not.toHaveBeenCalled();
  });

  it("denies requests through a decision-only callback", () => {
    const onDeny = vi.fn();

    render(
      <AgentApprovalCockpit
        cockpit={cockpit()}
        decisionState="idle"
        onApprove={vi.fn()}
        onDeny={onDeny}
      />
    );

    fireEvent.change(screen.getByLabelText("Decision rationale"), {
      target: { value: "Need a smaller provider transfer preview." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Deny request" }));

    expect(onDeny).toHaveBeenCalledWith({
      toolRequestId: "toolreq_provider_transfer",
      rationale: "Need a smaller provider transfer preview."
    });
  });

  it("blocks approval for stale or locked requests while allowing denial", () => {
    render(
      <AgentApprovalCockpit
        cockpit={cockpit({ blocked: true })}
        decisionState="idle"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Decision rationale"), {
      target: { value: "Deny locked request." }
    });

    expect(screen.getByRole("button", { name: "Approve exact preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny request" })).toBeEnabled();
  });

  it("fails closed for malformed blocked and locked requests even when the dto claims approval is allowed", () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();

    render(
      <AgentApprovalCockpit
        cockpit={cockpit({ malformedBlockedLockBypass: true })}
        decisionState="idle"
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );

    fireEvent.change(screen.getByLabelText("Decision rationale"), {
      target: { value: "Denied because the lock is still active." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve exact preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Deny request" }));

    expect(screen.getByRole("button", { name: "Approve exact preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny request" })).toBeEnabled();
    expect(onApprove).not.toHaveBeenCalled();
    expect(onDeny).toHaveBeenCalledWith({
      toolRequestId: "toolreq_provider_transfer",
      rationale: "Denied because the lock is still active."
    });
  });

  it("blocks approval for true stale requests while still allowing denial with rationale", () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();

    render(
      <AgentApprovalCockpit
        cockpit={cockpit({ stale: true })}
        decisionState="idle"
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );

    fireEvent.change(screen.getByLabelText("Decision rationale"), {
      target: { value: "Deny stale preview and request a refresh." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve exact preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Deny request" }));

    expect(screen.getByRole("button", { name: "Approve exact preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny request" })).toBeEnabled();
    expect(onApprove).not.toHaveBeenCalled();
    expect(onDeny).toHaveBeenCalledWith({
      toolRequestId: "toolreq_provider_transfer",
      rationale: "Deny stale preview and request a refresh."
    });
  });

  it("clears the rationale when switching the selected request", () => {
    const onDeny = vi.fn();

    render(
      <AgentApprovalCockpit
        cockpit={cockpit({ secondPending: true })}
        decisionState="idle"
        onApprove={vi.fn()}
        onDeny={onDeny}
      />
    );

    fireEvent.change(screen.getByLabelText("Decision rationale"), {
      target: { value: "Denied for the first request only." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Select approval request toolreq_provider_transfer_secondary" }));
    fireEvent.click(screen.getByRole("button", { name: "Deny request" }));

    expect(screen.getByLabelText("Decision rationale")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Deny request" })).toBeDisabled();
    expect(onDeny).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Decision rationale"), {
      target: { value: "Denied for the second request." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Deny request" }));

    expect(onDeny).toHaveBeenCalledWith({
      toolRequestId: "toolreq_provider_transfer_secondary",
      rationale: "Denied for the second request."
    });
  });

  it("does not render forbidden execution controls", () => {
    render(
      <AgentApprovalCockpit
        cockpit={cockpit()}
        decisionState="idle"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />
    );

    for (const forbiddenName of [
      /transfer provider bytes/i,
      /send prr/i,
      /export/i,
      /repair/i,
      /clear lock/i,
      /accept graph/i,
      /execute/i,
      /scheduler wake/i
    ]) {
      expect(screen.queryByRole("button", { name: forbiddenName })).not.toBeInTheDocument();
    }
  });
});

function cockpit(
  input: {
    readonly blocked?: boolean;
    readonly malformedBlockedLockBypass?: boolean;
    readonly stale?: boolean;
    readonly secondPending?: boolean;
  } = {}
): AgentApprovalCockpitDto {
  const blocked = input.blocked ?? input.malformedBlockedLockBypass ?? false;
  const stale = input.stale ?? false;
  const item = queueItem({
    toolRequestId: "toolreq_provider_transfer",
    runId: "run_provider_transfer",
    taskId: "task_provider_transfer",
    previewSummary: "Provider byte-transfer preview.",
    riskAndLockStatus: blocked ? "Provider transfer lock active." : stale ? "Preview is stale and must be rebuilt." : "No active locks. Preview is current.",
    staleOrUnsafePrevention: blocked
      ? ["Active lock checks", "Exact preview hash binding"]
      : stale
        ? ["Stale preview detection", "Exact preview hash binding"]
        : ["Exact preview hash binding", "Human-only approval"],
    stale,
    staleness: stale
      ? {
          state: "stale",
          approvable: false,
          guidance: "Request a fresh preview before approval."
        }
      : {
          state: "current",
          approvable: !blocked || input.malformedBlockedLockBypass === true
        },
    activeLocks: blocked
      ? [{ lockId: "lock_provider", category: "provider-byte-transfer", message: "Provider transfer lock active." }]
      : [],
    blockingReasons: input.malformedBlockedLockBypass ? [] : blocked ? ["lock-active"] : []
  });
  const secondItem = input.secondPending
    ? queueItem({
        toolRequestId: "toolreq_provider_transfer_secondary",
        runId: "run_provider_transfer_secondary",
        taskId: "task_provider_transfer_secondary",
        previewSummary: "Secondary provider byte-transfer preview."
      })
    : undefined;

  return {
    schemaVersion: "agent-approval-cockpit.v1",
    generatedAt: "2026-07-08T15:30:00.000Z",
    summary: {
      pendingCount: blocked || stale ? 0 : input.secondPending ? 2 : 1,
      resumableCount: 0,
      blockedCount: blocked ? 1 : 0,
      staleCount: stale ? 1 : 0,
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
      pending: blocked || stale ? [] : secondItem === undefined ? [item] : [item, secondItem],
      resumable: [],
      blocked: blocked ? [item] : [],
      stale: stale ? [item] : [],
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

function queueItem(input: {
  readonly toolRequestId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly previewSummary: string;
  readonly riskAndLockStatus?: string;
  readonly staleOrUnsafePrevention?: readonly string[];
  readonly stale?: boolean;
  readonly staleness?: {
    readonly state: "current" | "stale";
    readonly approvable: boolean;
    readonly guidance?: string;
  };
  readonly activeLocks?: readonly {
    readonly lockId: string;
    readonly category: string;
    readonly message: string;
  }[];
  readonly blockingReasons?: readonly string[];
}) {
  const activeLocks = input.activeLocks ?? [];
  const blockingReasons = input.blockingReasons ?? [];
  return {
    toolRequestId: input.toolRequestId,
    runId: input.runId,
    taskId: input.taskId,
    toolId: "provider.bytes.transfer",
    toolVersion: "1",
    sideEffectClass: "external-byte-transfer",
    approvalClass: "provider-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    previewHash,
    previewSummary: input.previewSummary,
    requestedAt: "2026-07-08T15:29:00.000Z",
    stale: input.stale ?? false,
    executableByApproval: false as const,
    providerByteTransferNote: "Approval records a decision only; it does not transfer provider bytes.",
    staleness: input.staleness ?? {
      state: "current" as const,
      approvable: true
    },
    approvalContract: {
      requiredApprovalClass: "provider-byte-transfer",
      approvalRouteAppendsOnly: true as const,
      denialRouteAppendsOnly: true as const,
      rationaleRequired: true as const,
      rationaleSecretSafe: true as const,
      afterApproval: "A separate scheduler revalidates the exact preview hash before any execution."
    },
    review: {
      what: "Selected evidence excerpts for provider processing.",
      why: "The resident agent requested model assistance for selected evidence.",
      dataLeavesOrChanges: "Provider byte-transfer preview.",
      evidenceRefs: [{ kind: "event", id: "evt_provider_preview" }],
      artifactRefs: [],
      riskAndLockStatus: input.riskAndLockStatus ?? "No active locks. Preview is current.",
      whatHappensAfterApproval: "A separate scheduler may resume after consume-time validation.",
      staleOrUnsafePrevention: input.staleOrUnsafePrevention ?? ["Exact preview hash binding", "Human-only approval"]
    },
    affectedRefs: [{ kind: "event", id: "evt_provider_preview" }],
    contextPackRefs: [],
    activeLocks,
    blockingReasons,
    risk: {
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      previewSummary: "Provider byte-transfer preview.",
      affectedRefs: [{ kind: "event", id: "evt_provider_preview" }],
      contextPackRefs: [],
      activeLocks,
      blockingReasons
    }
  };
}
