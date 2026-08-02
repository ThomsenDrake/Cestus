/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OpsShell } from "../src/workspace/OpsShell.js";
import { workspaceModules } from "../src/workspace/workspace-nav.js";

describe("operator shell", () => {
  it("renders the three-zone workspace shell with extensible navigation", () => {
    render(
      <OpsShell
        modules={workspaceModules}
        activeModuleId="command"
        workspaceName="Cestus Local"
        modeLabel="Command"
        ledgerLabel="Ledger synced"
        syncLabel="Local sync live"
        deploymentLabel="Solo laptop"
        searchLabel="Command search"
        searchPlaceholder="Search requests, evidence, agencies, and assertions"
        mainId="command"
        mainLabel="Command workspace"
        onNewRequest={vi.fn()}
        onModuleSelect={vi.fn()}
        main={<h1>Command</h1>}
        decisionRail={<aside aria-label="Decision rail">Agent brief</aside>}
      />
    );

    expect(screen.getByRole("navigation", { name: "Cestus tactical modules" })).toBeInTheDocument();
    expect(screen.getByRole("banner", { name: "Cestus command band" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New request" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Command search" })).toBeInTheDocument();
    expect(screen.getByText("Ledger synced")).toBeInTheDocument();
    expect(screen.getByText("Solo laptop")).toBeInTheDocument();
    expect(screen.getByText("Command")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Cestus home" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Command" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Agent" })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-disabled", "true");
  });

  it("routes every implemented module and leaves unavailable Settings inert", () => {
    const onModuleSelect = vi.fn();
    render(
      <OpsShell
        modules={workspaceModules}
        activeModuleId="command"
        workspaceName="Cestus Local"
        modeLabel="Command"
        ledgerLabel="Ledger synced"
        syncLabel="Local sync live"
        deploymentLabel="Solo laptop"
        mainId="command"
        mainLabel="Command workspace"
        onModuleSelect={onModuleSelect}
        main={<h1>Command</h1>}
        decisionRail={<aside aria-label="Decision rail">Agent brief</aside>}
      />
    );

    for (const label of ["Command", "Requests", "Evidence", "Ontology", "Agent", "Ingestion"]) {
      fireEvent.click(screen.getByRole("link", { name: label }));
    }
    fireEvent.click(screen.getByRole("link", { name: "Settings" }));

    expect(onModuleSelect.mock.calls.map(([moduleId]) => moduleId)).toStrictEqual([
      "command",
      "requests",
      "evidence",
      "ontology",
      "agents",
      "ingestion"
    ]);
    expect(onModuleSelect).not.toHaveBeenCalledWith("settings");
  });

  it("opens the mobile module menu as a focus-managed dialog", () => {
    render(
      <OpsShell
        modules={workspaceModules}
        activeModuleId="command"
        workspaceName="Cestus Local"
        modeLabel="Command"
        ledgerLabel="Ledger synced"
        syncLabel="Local sync live"
        deploymentLabel="Solo laptop"
        mainId="command"
        mainLabel="Command workspace"
        onNewRequest={vi.fn()}
        main={<h1>Command</h1>}
        decisionRail={<aside aria-label="Decision rail">Agent brief</aside>}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open module menu" }));

    const menu = screen.getByRole("dialog", { name: "Cestus tactical modules" });
    const closeButton = within(menu).getByRole("button", { name: "Close module menu" });
    const homeLink = within(menu).getByRole("link", { name: "Cestus home" });
    expect(closeButton).toHaveFocus();
    expect(homeLink).toBeInTheDocument();

    homeLink.focus();
    fireEvent.keyDown(homeLink, { key: "Tab", shiftKey: true });
    expect(within(menu).getByRole("link", { name: "Settings" })).toHaveFocus();

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Cestus tactical modules" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open module menu" })).toHaveFocus();
  });
});
