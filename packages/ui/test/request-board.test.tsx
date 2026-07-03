/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { prrWorkspaceFixture } from "../src/requests/request-fixtures.js";
import { RequestWorkspace } from "../src/requests/RequestWorkspace.js";

describe("RequestWorkspace", () => {
  it("renders the signal operations board lanes and cards", () => {
    render(<RequestWorkspace fixture={prrWorkspaceFixture} onOpenBuilder={() => undefined} />);

    expect(screen.getByRole("heading", { name: "Requests" })).toBeInTheDocument();
    for (const laneLabel of [
      "Drafting",
      "Ready to send",
      "Awaiting agency",
      "Needs follow-up",
      "Review fee/scope",
      "Production arrived",
      "Appeal/escalation"
    ]) {
      expect(screen.getByRole("region", { name: laneLabel })).toBeInTheDocument();
    }
    expect(screen.getByText("Federal Aviation Administration")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select FAA vendor contracts" })).toBeInTheDocument();
  });

  it("applies a saved PRR view while keeping board mode pressed", () => {
    render(<RequestWorkspace fixture={prrWorkspaceFixture} onOpenBuilder={() => undefined} />);

    fireEvent.change(screen.getByLabelText("Saved PRR view"), { target: { value: "florida-fees" } });

    expect(screen.getByRole("button", { name: "Board view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Broward Sheriff's Office")).toBeInTheDocument();
    expect(screen.queryByText("Federal Aviation Administration")).not.toBeInTheDocument();
  });

  it("updates the hidden request detail rail when a request is selected", () => {
    render(<RequestWorkspace fixture={prrWorkspaceFixture} onOpenBuilder={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Select Transit authority denial appeal" }));

    expect(within(screen.getByRole("complementary", { name: "Request detail rail" })).getByText(
      "Transit authority denial appeal"
    )).toBeInTheDocument();
  });
});
