/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OperatorCockpit } from "../src/operator-status/OperatorCockpit.js";
import type { OperatorStatusDto } from "../src/operator-status/operator-status-types.js";

describe("OperatorCockpit", () => {
  it("renders four selectable status bands without button roles", () => {
    render(<OperatorCockpit status={operatorStatusFixture} />);

    const cockpit = screen.getByRole("region", { name: "Operator cockpit" });
    const bands = within(cockpit).getByRole("tablist", { name: "Operator status bands" });

    expect(within(bands).getByRole("tab", { name: /Workspace/ })).toBeInTheDocument();
    expect(within(bands).getByRole("tab", { name: /Ingestion/ })).toBeInTheDocument();
    expect(within(bands).getByRole("tab", { name: /Legacy Import/ })).toBeInTheDocument();
    expect(within(bands).getByRole("tab", { name: /PRR\/Investigations/ })).toBeInTheDocument();
    expect(within(cockpit).queryByRole("button", { name: /Workspace/ })).not.toBeInTheDocument();
    expect(within(cockpit).queryByRole("button", { name: /Ingestion/ })).not.toBeInTheDocument();
    expect(within(cockpit).queryByRole("button", { name: /Legacy Import/ })).not.toBeInTheDocument();
    expect(within(cockpit).queryByRole("button", { name: /PRR\/Investigations/ })).not.toBeInTheDocument();
  });

  it("selects a band and shows diagnostics and source evidence in the detail panel", () => {
    render(<OperatorCockpit status={operatorStatusFixture} />);

    fireEvent.click(screen.getByRole("tab", { name: /Legacy Import/ }));

    const detail = screen.getByRole("tabpanel", { name: /Legacy Import/ });
    expect(within(detail).getByText("Legacy importer needs a reviewed export manifest.")).toBeInTheDocument();
    expect(within(detail).getByText("source evidence")).toBeInTheDocument();
    expect(within(detail).getByText("legacy-readiness snapshot")).toBeInTheDocument();
    expect(within(detail).getByText("legacy.cestus.readiness.v1")).toBeInTheDocument();
  });

  it("renders command actions as display text and not executable submit controls", () => {
    render(<OperatorCockpit status={operatorStatusFixture} />);

    fireEvent.click(screen.getByRole("tab", { name: /Workspace/ }));

    const detail = screen.getByRole("tabpanel", { name: /Workspace/ });
    const command = within(detail).getByText("cestus-workspace verify workspace --root <root>");
    expect(command.tagName).toBe("CODE");
    expect(within(detail).queryByRole("button", { name: "Show workspace verify" })).not.toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: /cestus-workspace verify workspace/ })).not.toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: /submit/i })).not.toBeInTheDocument();
  });

  it("renders navigation actions as buttons that call onNavigate", () => {
    const onNavigate = vi.fn();
    render(<OperatorCockpit status={operatorStatusFixture} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: "Open ingestion" }));
    expect(onNavigate).toHaveBeenCalledWith("ingestion");

    fireEvent.click(screen.getByRole("tab", { name: /PRR\/Investigations/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open requests" }));
    expect(onNavigate).toHaveBeenCalledWith("requests");
  });

  it("selects status bands with keyboard tab interactions", () => {
    render(<OperatorCockpit status={operatorStatusFixture} />);

    const workspaceBand = screen.getByRole("tab", { name: /Workspace/ });
    workspaceBand.focus();
    fireEvent.keyDown(workspaceBand, { key: "Enter" });
    expect(screen.getByRole("tabpanel", { name: /Workspace/ })).toBeInTheDocument();

    fireEvent.keyDown(workspaceBand, { key: "ArrowRight" });
    const ingestionBand = screen.getByRole("tab", { name: /Ingestion/ });
    expect(ingestionBand).toHaveAttribute("aria-selected", "true");
    expect(ingestionBand).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: /Ingestion/ })).toBeInTheDocument();

    fireEvent.keyDown(ingestionBand, { key: "ArrowRight" });
    const legacyBand = screen.getByRole("tab", { name: /Legacy Import/ });
    expect(legacyBand).toHaveAttribute("aria-selected", "true");
    expect(legacyBand).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: /Legacy Import/ })).toBeInTheDocument();
  });

  it("links selected tabs to the visible detail panel", () => {
    render(<OperatorCockpit status={operatorStatusFixture} />);

    fireEvent.click(screen.getByRole("tab", { name: /Legacy Import/ }));

    const selectedTab = screen.getByRole("tab", { name: /Legacy Import/ });
    const detail = screen.getByRole("tabpanel", { name: /Legacy Import/ });
    expect(selectedTab).toHaveAttribute("aria-controls", detail.id);
    expect(detail).toHaveAttribute("aria-labelledby", selectedTab.id);
  });

  it("renders refresh as a button that calls onRefresh", () => {
    const onRefresh = vi.fn();
    render(<OperatorCockpit status={operatorStatusFixture} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole("button", { name: "Refresh operator status" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not render irreversible operator controls", () => {
    render(<OperatorCockpit status={operatorStatusFixture} />);

    for (const unsafeName of ["Send", "Escalate", "Repair ledger", "Accept assertion", "Stage ontology"]) {
      expect(screen.queryByRole("button", { name: unsafeName })).not.toBeInTheDocument();
    }
  });

  it("uses actual buttons only for safe actions", () => {
    render(<OperatorCockpit status={operatorStatusFixture} />);

    const cockpit = screen.getByRole("region", { name: "Operator cockpit" });
    const buttonNames = within(cockpit).getAllByRole("button").map((button) => button.textContent);

    expect(buttonNames).toEqual(["Open ingestion", "Refresh operator status"]);
    expect(within(cockpit).queryByRole("button", { name: /Workspace/ })).not.toBeInTheDocument();
    expect(within(cockpit).queryByRole("button", { name: /Legacy Import/ })).not.toBeInTheDocument();
  });

  it("renders disabled safe actions without invoking callbacks", () => {
    const onNavigate = vi.fn();
    const status = withDisabledAction(operatorStatusFixture, "action_open_ingestion");

    render(<OperatorCockpit status={status} onNavigate={onNavigate} />);

    const disabledAction = screen.getByRole("button", { name: "Open ingestion" });
    expect(disabledAction).toBeDisabled();

    fireEvent.click(disabledAction);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("renders smoke failure diagnostics and safe command descriptors without executing them", () => {
    const status = smokeFailureStatusFixture();
    render(<OperatorCockpit status={status} />);

    fireEvent.click(screen.getByRole("tab", { name: /Workspace/ }));
    const workspaceDetail = screen.getByRole("tabpanel", { name: /Workspace/ });
    expect(
      within(workspaceDetail).getByText("External drive is missing; run drive detection before starting local work.")
    ).toBeInTheDocument();
    expect(within(workspaceDetail).getByText("cestus-workspace detect drive --root <root>").tagName).toBe(
      "CODE"
    );
    expect(within(workspaceDetail).queryByRole("button", { name: /detect drive/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /PRR\/Investigations/ }));
    const prrDetail = screen.getByRole("tabpanel", { name: /PRR\/Investigations/ });
    expect(within(prrDetail).getByText("PRR workspace is readable with zero open requests.")).toBeInTheDocument();
    expect(within(prrDetail).getByText("cardCount")).toBeInTheDocument();
    expect(within(prrDetail).getByText("0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open requests" })).toBeInTheDocument();
  });
});

function withDisabledAction(status: OperatorStatusDto, actionId: string): OperatorStatusDto {
  return {
    ...status,
    safeActions: status.safeActions.map((action) =>
      action.actionId === actionId
        ? { ...action, enabled: false, disabledReason: "Disabled by test fixture." }
        : action
    )
  };
}

function smokeFailureStatusFixture(): OperatorStatusDto {
  return {
    ...operatorStatusFixture,
    summary: {
      overallState: "blocked",
      blockedCount: 1,
      actionRequiredCount: 0,
      degradedCount: 0,
      nextSafeActionId: "action_show_workspace_detect_drive"
    },
    sections: operatorStatusFixture.sections.map((section) => {
      if (section.sectionId === "workspace") {
        return {
          ...section,
          state: "blocked",
          headline: "Workspace mount requires attention",
          safeSummary: "Expected external Cestus drive is not mounted.",
          metrics: [{ metricId: "workspace_errors", label: "Visible errors", value: "1", tone: "danger" }],
          diagnostics: [
            {
              diagnosticId: "diag_workspace_missing_drive",
              severity: "error",
              category: "workspace",
              message: "External drive is missing; run drive detection before starting local work.",
              refs: []
            }
          ],
          nextSafeActionIds: ["action_show_workspace_detect_drive", "action_refresh_operator_status"]
        };
      }

      if (section.sectionId === "prr") {
        return {
          ...section,
          state: "ready",
          headline: "PRR workspace ready with no open requests",
          metrics: [{ metricId: "request_cards", label: "Request cards", value: "0", tone: "machine" }],
          diagnostics: [
            {
              diagnosticId: "diag_prr_zero_open_requests",
              severity: "info",
              category: "prr",
              message: "PRR workspace is readable with zero open requests.",
              refs: [{ label: "cardCount", value: 0 }]
            }
          ],
          nextSafeActionIds: ["action_open_requests", "action_refresh_operator_status"]
        };
      }

      return { ...section, state: "ready", diagnostics: [] };
    }),
    safeActions: [
      ...operatorStatusFixture.safeActions,
      {
        actionId: "action_show_workspace_detect_drive",
        label: "Show drive detection command",
        kind: "show-command",
        command: "cestus-workspace detect drive --root <root>",
        sourceContract: "workspace-ops.v1",
        requiresHumanApproval: false,
        mutatesCanonicalState: false,
        externalEffect: false,
        enabled: true
      }
    ]
  };
}

const operatorStatusFixture: OperatorStatusDto = {
  schemaVersion: "operator-status.v1",
  generatedAt: "2026-07-06T23:10:00.000Z",
  runtime: {
    available: true,
    storageStrategy: "portable-workspace",
    bindMode: "loopback",
    workspaceMounted: true,
    safeMessage: "Local runtime is serving a mounted portable workspace."
  },
  summary: {
    overallState: "blocked",
    blockedCount: 1,
    actionRequiredCount: 1,
    degradedCount: 1,
    nextSafeActionId: "action_open_ingestion"
  },
  sections: [
    {
      sectionId: "workspace",
      label: "Workspace",
      state: "ready",
      headline: "Mounted portable workspace",
      safeSummary: "Workspace manifest, ledger, and blob roots are readable.",
      metrics: [
        { metricId: "ledger_events", label: "Ledger events", value: "42", tone: "healthy" },
        { metricId: "workspace_age", label: "Workspace age", value: "fresh", tone: "neutral" }
      ],
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
      nextSafeActionIds: ["action_show_workspace_verify"]
    },
    {
      sectionId: "ingestion",
      label: "Ingestion",
      state: "action-required",
      headline: "Provider review queue waiting",
      safeSummary: "A source connector has records ready for supervised ingestion review.",
      metrics: [
        { metricId: "pending_jobs", label: "Pending jobs", value: "3", tone: "attention" },
        { metricId: "stale_sources", label: "Stale sources", value: "1", tone: "machine" }
      ],
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
      state: "blocked",
      headline: "Legacy export manifest missing review",
      safeSummary: "Legacy import remains display-only until a reviewed export manifest is present.",
      metrics: [
        { metricId: "mapped_records", label: "Mapped records", value: "18", tone: "attention" },
        { metricId: "accepted_truth", label: "Accepted legacy truth", value: "0", tone: "healthy" }
      ],
      diagnostics: [
        {
          diagnosticId: "diag_legacy_manifest_review",
          severity: "error",
          category: "legacy-import",
          message: "Legacy importer needs a reviewed export manifest.",
          refs: [{ label: "importId", value: "legacy_case_001" }]
        }
      ],
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
      state: "degraded",
      headline: "Requests workspace needs review attention",
      safeSummary: "Drafts are visible, and no send or escalation action is available here.",
      metrics: [
        { metricId: "active_requests", label: "Active requests", value: "7", tone: "neutral" },
        { metricId: "blocked_requests", label: "Blocked requests", value: "2", tone: "danger" }
      ],
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
      actionId: "action_show_workspace_verify",
      label: "Show workspace verify",
      kind: "show-command",
      command: "cestus-workspace verify workspace --root <root>",
      sourceContract: "workspace-ops.v1",
      requiresHumanApproval: false,
      mutatesCanonicalState: false,
      externalEffect: false,
      enabled: true
    }
  ]
};
