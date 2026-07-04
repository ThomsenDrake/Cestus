/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { RequestWorkspaceIntelligenceRail } from "../src/requests/RequestWorkspaceIntelligenceRail.js";

describe("RequestWorkspaceIntelligenceRail", () => {
  function buildTestRequestsWorkspace() {
    return buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });
  }

  it("renders workspace-level signals instead of selected request details", () => {
    render(<RequestWorkspaceIntelligenceRail workspace={buildTestRequestsWorkspace()} />);

    const rail = screen.getByRole("complementary", { name: "Requests workspace intelligence" });

    expect(within(rail).getByRole("heading", { name: "Workspace intelligence" })).toBeInTheDocument();
    expect(within(rail).getByText("Review fee/scope")).toBeInTheDocument();
    expect(within(rail).getByText("Appeal/escalation")).toBeInTheDocument();
    expect(within(rail).getByText("Suggested next work")).toBeInTheDocument();
    expect(within(rail).queryByText("Next action packet")).not.toBeInTheDocument();
  });

  it("renders a sparse loading state without request fixtures", () => {
    render(<RequestWorkspaceIntelligenceRail workspace={undefined} />);

    const rail = screen.getByRole("complementary", { name: "Requests workspace intelligence" });

    expect(within(rail).getByText("Requests workspace loading")).toBeInTheDocument();
  });
});
