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
        syncLabel="Local ledger synced"
        onNewRequest={vi.fn()}
        main={<h1>Command</h1>}
        contextRail={<aside aria-label="Context rail">Agent brief</aside>}
      />
    );

    expect(screen.getByRole("navigation", { name: "Cestus modules" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New request" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search command workspace" })).toBeInTheDocument();
    expect(screen.getByText("Local ledger synced")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Command" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Agents Preview" })).toHaveAttribute("aria-disabled", "true");
  });
});
