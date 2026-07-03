/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
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
        onNewRequest={vi.fn()}
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
    expect(screen.getByRole("link", { name: "Command" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Agents Preview" })).toHaveAttribute("aria-disabled", "true");
  });
});
