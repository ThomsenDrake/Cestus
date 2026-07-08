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

function cockpit(input: { readonly blocked?: boolean } = {}): AgentApprovalCockpitDto {
  const item = {
    toolRequestId: "toolreq_provider_transfer",
    runId: "run_provider_transfer",
    taskId: "task_provider_transfer",
    toolId: "provider.bytes.transfer",
    toolVersion: "1",
    sideEffectClass: "external-byte-transfer",
    approvalClass: "provider-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    previewHash,
    previewSummary: "Provider byte-transfer preview.",
    requestedAt: "2026-07-08T15:29:00.000Z",
    stale: false,
    executableByApproval: false as const,
    providerByteTransferNote: "Approval records a decision only; it does not transfer provider bytes.",
    staleness: {
      state: "current" as const,
      approvable: !input.blocked
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
      riskAndLockStatus: input.blocked ? "Provider transfer lock active." : "No active locks. Preview is current.",
      whatHappensAfterApproval: "A separate scheduler may resume after consume-time validation.",
      staleOrUnsafePrevention: input.blocked
        ? ["Active lock checks", "Exact preview hash binding"]
        : ["Exact preview hash binding", "Human-only approval"]
    },
    affectedRefs: [{ kind: "event", id: "evt_provider_preview" }],
    contextPackRefs: [],
    activeLocks: input.blocked
      ? [{ lockId: "lock_provider", category: "provider-byte-transfer", message: "Provider transfer lock active." }]
      : [],
    blockingReasons: input.blocked ? ["lock-active"] : [],
    risk: {
      sideEffectClass: "external-byte-transfer",
      approvalClass: "provider-byte-transfer",
      previewSummary: "Provider byte-transfer preview.",
      affectedRefs: [{ kind: "event", id: "evt_provider_preview" }],
      contextPackRefs: [],
      activeLocks: input.blocked
        ? [{ lockId: "lock_provider", category: "provider-byte-transfer", message: "Provider transfer lock active." }]
        : [],
      blockingReasons: input.blocked ? ["lock-active"] : []
    }
  };

  return {
    schemaVersion: "agent-approval-cockpit.v1",
    generatedAt: "2026-07-08T15:30:00.000Z",
    summary: {
      pendingCount: input.blocked ? 0 : 1,
      resumableCount: 0,
      blockedCount: input.blocked ? 1 : 0,
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
      pending: input.blocked ? [] : [item],
      resumable: [],
      blocked: input.blocked ? [item] : [],
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
