/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildCommandBoardViewModel, filterQueueItems, getSelectedCommandItem } from "../src/workspace/command-model.js";
import { buildCommandBoardInputFromRuntime } from "../src/workspace/command-runtime.js";
import { commandWorkspaceFixture } from "../src/workspace/command-fixtures.js";
import { CommandDashboard } from "../src/workspace/CommandDashboard.js";
import { DecisionRail } from "../src/workspace/DecisionRail.js";

describe("CommandDashboard", () => {
  it("renders metrics, queue rows, and tactical panels", () => {
    const model = buildCommandBoardViewModel(commandWorkspaceFixture);

    render(
      <CommandDashboard
        model={model}
        activeFilter="all"
        selectedItemId={undefined}
        onFilterChange={vi.fn()}
        onSelectItem={vi.fn()}
        onMarkReviewed={vi.fn()}
      />
    );

    expect(screen.getByRole("region", { name: "Central tactical field" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Command signal strip" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Priority queue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Signals" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diagnostics" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Select Miami-Dade Aviation Department stalling signal" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Select Projection lag detected for accepted request event" })
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Active investigations" })).toBeInTheDocument();
  });

  it("emits filter, selection, and review events", () => {
    const model = buildCommandBoardViewModel(commandWorkspaceFixture);
    const onFilterChange = vi.fn();
    const onSelectItem = vi.fn();
    const onMarkReviewed = vi.fn();

    render(
      <CommandDashboard
        model={model}
        activeFilter="all"
        selectedItemId={undefined}
        onFilterChange={onFilterChange}
        onSelectItem={onSelectItem}
        onMarkReviewed={onMarkReviewed}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Evidence" }));
    fireEvent.click(screen.getByRole("button", { name: "Select Vendor email production landed" }));
    fireEvent.click(screen.getByRole("button", { name: /Mark Vendor email production landed reviewed/ }));

    expect(onFilterChange).toHaveBeenCalledWith("evidence");
    expect(onSelectItem).toHaveBeenCalledWith("evidence:ev_prr_production_003");
    expect(onMarkReviewed).toHaveBeenCalledWith("evidence:ev_prr_production_003");
  });

  it("renders an explicit loading queue state instead of claiming no urgent work", () => {
    const model = buildCommandBoardViewModel(buildCommandBoardInputFromRuntime({
      generatedAt: "2026-07-20T12:00:00.000Z",
      requests: { state: "loading" },
      evidence: { state: "loading" },
      ingestion: { state: "loading" },
      ontology: { state: "loading" },
      operator: { state: "loading" },
      agent: { state: "loading" }
    }, []));

    render(
      <CommandDashboard
        model={model}
        activeFilter="all"
        selectedItemId={undefined}
        onFilterChange={vi.fn()}
        onSelectItem={vi.fn()}
        onMarkReviewed={vi.fn()}
      />
    );

    expect(screen.getByText("Priority state is loading from runtime sources.")).toBeInTheDocument();
    expect(screen.queryByText("No urgent work is waiting in this filter.")).not.toBeInTheDocument();
  });

  it("keeps filtered empty states truthful when relevant sources are loading or unavailable", () => {
    const model = buildCommandBoardViewModel(buildCommandBoardInputFromRuntime({
      generatedAt: "2026-07-20T12:00:00.000Z",
      requests: { state: "loading" },
      evidence: {
        state: "unavailable",
        diagnosticId: "diag_evidence_filtered_unavailable",
        message: "Evidence runtime is unavailable. No fixture data was substituted."
      },
      ingestion: { state: "loading" },
      ontology: { state: "loading" },
      operator: { state: "loading" },
      agent: { state: "loading" }
    }, []));

    expect(filterQueueItems(model.queueItems, "deadline")).toHaveLength(0);
    expect(model.queueItems).toContainEqual(expect.objectContaining({
      id: "runtime:evidence:diag_evidence_filtered_unavailable",
      kind: "diagnostic"
    }));

    const { rerender } = render(
      <CommandDashboard
        model={model}
        activeFilter="deadline"
        selectedItemId={undefined}
        onFilterChange={vi.fn()}
        onSelectItem={vi.fn()}
        onMarkReviewed={vi.fn()}
      />
    );

    expect(screen.getByText("Priority state is loading from runtime sources.")).toBeInTheDocument();
    expect(screen.queryByText("No urgent work is waiting in this filter.")).not.toBeInTheDocument();

    rerender(
      <CommandDashboard
        model={model}
        activeFilter="evidence"
        selectedItemId={undefined}
        onFilterChange={vi.fn()}
        onSelectItem={vi.fn()}
        onMarkReviewed={vi.fn()}
      />
    );
    expect(screen.getByText(
      "Priority state is incomplete because relevant runtime sources are loading or unavailable."
    )).toBeInTheDocument();

    rerender(
      <CommandDashboard
        model={model}
        activeFilter="diagnostic"
        selectedItemId={undefined}
        onFilterChange={vi.fn()}
        onSelectItem={vi.fn()}
        onMarkReviewed={vi.fn()}
      />
    );
    expect(screen.getByRole("button", {
      name: "Select Evidence runtime is unavailable. No fixture data was substituted."
    })).toBeInTheDocument();
  });

  it("renders advisory priorities outside Diagnostics and without diagnostic repair guidance", () => {
    const model = advisoryPriorityModel();
    const { rerender } = render(
      <CommandDashboard
        model={model}
        activeFilter="diagnostic"
        selectedItemId={undefined}
        onFilterChange={vi.fn()}
        onSelectItem={vi.fn()}
        onMarkReviewed={vi.fn()}
      />
    );
    const diagnostics = screen.getByRole("list", { name: "Priority queue" });

    expect(within(diagnostics).getByRole("button", { name: "Select Ontology projection is lagging." })).toBeInTheDocument();
    expect(within(diagnostics).queryByRole("button", { name: "Select Ontology assertion awaits human review." })).not.toBeInTheDocument();
    expect(within(diagnostics).queryByRole("button", { name: "Select Agent tool approval awaits human review." })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advisories" })).toBeInTheDocument();

    rerender(
      <CommandDashboard
        model={model}
        activeFilter="advisory"
        selectedItemId={undefined}
        onFilterChange={vi.fn()}
        onSelectItem={vi.fn()}
        onMarkReviewed={vi.fn()}
      />
    );
    const advisories = screen.getByRole("list", { name: "Priority queue" });
    expect(within(advisories).getByRole("button", { name: "Select Ontology assertion awaits human review." })).toBeInTheDocument();
    expect(within(advisories).getByRole("button", { name: "Select Agent tool approval awaits human review." })).toBeInTheDocument();
    expect(within(advisories).queryByRole("button", { name: "Select Ontology projection is lagging." })).not.toBeInTheDocument();
  });

  it("renders selected advisory detail with human guidance and no diagnostic repair copy", () => {
    const model = advisoryPriorityModel();
    const advisory = getSelectedCommandItem(model, "runtime:ontology:proposal_as_dom_advisory");

    render(
      <DecisionRail
        agentBrief={model.agentBrief}
        defaultVotes={model.decisionRail.defaultVotes}
        selectedItem={advisory}
        onClearSelection={vi.fn()}
      />
    );
    const rail = screen.getByRole("complementary", { name: "Decision rail" });

    expect(within(rail).getByText("advisory")).toBeInTheDocument();
    expect(rail.textContent).toMatch(/human review/i);
    expect(rail.textContent).not.toMatch(/diagnostic|repair|projection state needs repair|resolved/i);
    expect(within(rail).getByText("as_dom_advisory")).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: "Open Ontology" })).toBeInTheDocument();
  });
});

function advisoryPriorityModel() {
  return buildCommandBoardViewModel({
    requestRows: [],
    diagnostics: [],
    evidenceAlerts: [],
    todayIso: "2026-07-20",
    reviewedItemIds: [],
    runtimeDiagnostics: [
      {
        diagnosticId: "diag_ontology_dom",
        sourceId: "ontology",
        severity: "error",
        message: "Ontology projection is lagging.",
        basis: "ontology-workspace.v1 / projection-lag",
        recommendedAction: "Open Ontology",
        provenanceRefs: ["evt_ontology_diag"],
        actionTarget: "ontology",
        priorityKind: "diagnostic"
      },
      {
        diagnosticId: "proposal_as_dom_advisory",
        sourceId: "ontology",
        severity: "warning",
        message: "Ontology assertion awaits human review.",
        basis: "mentions_agency at 62% proposal confidence",
        recommendedAction: "Open Ontology",
        provenanceRefs: ["as_dom_advisory", "ev_dom_advisory", "evt_dom_advisory"],
        actionTarget: "ontology",
        priorityKind: "advisory"
      },
      {
        diagnosticId: "approval_tool_dom_advisory",
        sourceId: "agent",
        severity: "warning",
        message: "Agent tool approval awaits human review.",
        basis: "provider-byte-transfer approval for external-byte-transfer",
        recommendedAction: "Open Resident agent",
        provenanceRefs: ["tool_dom_advisory", "evt_tool_dom_advisory"],
        actionTarget: "agents",
        priorityKind: "advisory"
      }
    ]
  });
}
