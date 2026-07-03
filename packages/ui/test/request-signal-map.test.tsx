/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { prrWorkspaceFixture } from "../src/requests/request-fixtures.js";
import { RequestWorkspace } from "../src/requests/RequestWorkspace.js";

describe("RequestSignalMap", () => {
  it("renders the signal map for the selected PRR view mode", () => {
    render(
      <RequestWorkspace
        fixture={prrWorkspaceFixture}
        onOpenBuilder={() => undefined}
        selectedRequestId="prr_req_001"
        onSelectRequest={() => undefined}
        onSelectedRequestChange={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Signal map" }));

    expect(screen.getByRole("region", { name: "PRR signal map" })).toBeInTheDocument();
    expect(screen.getByText("Broward Sheriff's Office")).toBeInTheDocument();
    expect(screen.getByText("Cost and delay pressure")).toBeInTheDocument();
  });

  it("shows details for the selected signal node", () => {
    render(
      <RequestWorkspace
        fixture={prrWorkspaceFixture}
        onOpenBuilder={() => undefined}
        selectedRequestId="prr_req_001"
        onSelectRequest={() => undefined}
        onSelectedRequestChange={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Signal map" }));
    fireEvent.click(screen.getByRole("button", { name: "Select signal node Regional Transit Authority" }));

    const selectedSignal = screen.getByRole("region", { name: "Selected agency signal" });
    expect(within(selectedSignal).getByText("Regional Transit Authority")).toBeInTheDocument();
    expect(within(selectedSignal).getByText("Escalation gate locked")).toBeInTheDocument();
  });

  it("lists signal relationships with connected agency names for nonvisual access", () => {
    render(
      <RequestWorkspace
        fixture={prrWorkspaceFixture}
        onOpenBuilder={() => undefined}
        selectedRequestId="prr_req_001"
        onSelectRequest={() => undefined}
        onSelectedRequestChange={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Signal map" }));

    const relationships = screen.getByRole("region", { name: "Accessible signal relationships" });
    expect(
      within(relationships).getByText("Cost and delay pressure: Broward Sheriff's Office to Miami-Dade Aviation Department")
    ).toBeInTheDocument();
  });

  it("uses a horizontal scroll frame so edge-positioned nodes are not clipped on narrow screens", () => {
    render(
      <RequestWorkspace
        fixture={prrWorkspaceFixture}
        onOpenBuilder={() => undefined}
        selectedRequestId="prr_req_001"
        onSelectRequest={() => undefined}
        onSelectedRequestChange={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Signal map" }));

    expect(screen.getByRole("group", { name: "Scrollable signal map canvas" })).toHaveClass(
      "overflow-x-auto",
      "overflow-y-hidden"
    );
  });
});
