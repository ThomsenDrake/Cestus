/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getSelectedPrrRequest } from "../src/requests/request-model.js";
import { prrWorkspaceFixture } from "../src/requests/request-fixtures.js";
import { RequestDetailRail } from "../src/requests/RequestDetailRail.js";

describe("RequestDetailRail", () => {
  it("renders the selected request action packet", () => {
    render(<RequestDetailRail selectedRequest={getSelectedPrrRequest(prrWorkspaceFixture, "prr_req_001")} />);

    const rail = screen.getByRole("complementary", { name: "Request detail rail" });

    expect(within(rail).getByRole("heading", { name: "FAA vendor contracts" })).toBeInTheDocument();
    expect(within(rail).getByText("Review to send")).toBeInTheDocument();
    expect(within(rail).getByText("Suggested from the Federal FOIA starter pack.")).toBeInTheDocument();
  });

  it("keeps send unavailable when risk flags need review", () => {
    render(<RequestDetailRail selectedRequest={getSelectedPrrRequest(prrWorkspaceFixture, "prr_req_001")} />);

    const rail = screen.getByRole("complementary", { name: "Request detail rail" });

    expect(within(rail).getByRole("button", { name: "Review to send" })).toBeDisabled();
    expect(within(rail).getByText("Risk flags")).toBeInTheDocument();
    expect(within(rail).getByText("Human review required.")).toBeInTheDocument();
  });

  it("shows locked legal escalation prerequisites", () => {
    render(<RequestDetailRail selectedRequest={getSelectedPrrRequest(prrWorkspaceFixture, "prr_req_transit_031")} />);

    const rail = screen.getByRole("complementary", { name: "Request detail rail" });

    expect(within(rail).getByText("Legal escalation locked")).toBeInTheDocument();
    expect(within(rail).getByText("User confirmation")).toBeInTheDocument();
    expect(within(rail).getByText("Not confirmed.")).toBeInTheDocument();
  });
});
