/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { getSelectedPrrRequest } from "../src/requests/request-model.js";
import { RequestDetailRail } from "../src/requests/RequestDetailRail.js";

describe("RequestDetailRail", () => {
  function buildTestRequestsWorkspace() {
    return buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });
  }

  it("renders the selected request action packet", () => {
    render(<RequestDetailRail selectedRequest={getSelectedPrrRequest(buildTestRequestsWorkspace(), "prr_fee_building_permits")} />);

    const rail = screen.getByRole("complementary", { name: "Request detail rail" });

    expect(
      within(rail).getByRole("heading", {
        name: "Please provide building permit inspection records for the riverfront project."
      })
    ).toBeInTheDocument();
    expect(within(rail).getByText("Review fee or scope")).toBeInTheDocument();
    expect(
      within(rail).getAllByText("Fee estimates, challenges, and narrowing proposals remain human-reviewed.").length
    ).toBeGreaterThan(0);
  });

  it("keeps send unavailable when risk flags need review", () => {
    render(<RequestDetailRail selectedRequest={getSelectedPrrRequest(buildTestRequestsWorkspace(), "prr_fee_building_permits")} />);

    const rail = screen.getByRole("complementary", { name: "Request detail rail" });

    expect(within(rail).getByRole("button", { name: "Review to send" })).toBeDisabled();
    expect(within(rail).getByText("Risk flags")).toBeInTheDocument();
    expect(within(rail).getByText("Risk review cannot be inferred from request estimates.")).toBeInTheDocument();
  });

  it("exposes text status for complete and incomplete gate checks", () => {
    render(<RequestDetailRail selectedRequest={getSelectedPrrRequest(buildTestRequestsWorkspace(), "prr_req_001")} />);

    const rail = screen.getByRole("complementary", { name: "Request detail rail" });
    const providerRow = gateRow(rail, "Provider ready");
    const riskRow = gateRow(rail, "Risk flags");

    expect(within(providerRow).getByText("Complete")).toBeInTheDocument();
    expect(within(riskRow).getByText("Needs review")).toBeInTheDocument();
  });

  it("shows locked legal escalation prerequisites", () => {
    render(<RequestDetailRail selectedRequest={getSelectedPrrRequest(buildTestRequestsWorkspace(), "prr_fee_building_permits")} />);

    const rail = screen.getByRole("complementary", { name: "Request detail rail" });

    expect(within(rail).getByText("Legal escalation locked")).toBeInTheDocument();
    expect(within(rail).getByText("Missing: User confirmed escalation")).toBeInTheDocument();
    expect(within(rail).getByText("Legal escalation requires an explicit user confirmation event.")).toBeInTheDocument();
  });

  it("renders a safe provider label when no correspondence provider exists", () => {
    render(<RequestDetailRail selectedRequest={getSelectedPrrRequest(buildTestRequestsWorkspace(), "prr_draft_city_budget")} />);

    const rail = screen.getByRole("complementary", { name: "Request detail rail" });

    expect(within(rail).getByText("No provider event")).toBeInTheDocument();
    expect(within(rail).queryByText("Gmail")).not.toBeInTheDocument();
  });
});

function gateRow(rail: HTMLElement, label: string): HTMLElement {
  const row = within(rail).getByText(label).closest("li");
  expect(row).not.toBeNull();
  return row as HTMLElement;
}
