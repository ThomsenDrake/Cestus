/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildCommandBoardViewModel } from "../src/workspace/command-model.js";
import { commandWorkspaceFixture } from "../src/workspace/command-fixtures.js";
import { CommandDashboard } from "../src/workspace/CommandDashboard.js";

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
});
