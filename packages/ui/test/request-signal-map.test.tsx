/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { RequestWorkspace } from "../src/requests/RequestWorkspace.js";

describe("RequestSignalMap", () => {
  function buildTestRequestsWorkspace() {
    return buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });
  }

  it("renders the signal map for the selected PRR view mode", () => {
    render(
      <RequestWorkspace
        workspace={buildTestRequestsWorkspace()}
        onOpenBuilder={() => undefined}
        onOpenRequestDetail={() => undefined}
        selectedRequestId="prr_req_001"
        onSelectRequest={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Signal map" }));

    expect(screen.getByRole("region", { name: "PRR signal map" })).toBeInTheDocument();
    expect(screen.getAllByText(/Building Services Department/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/highest posture high/i).length).toBeGreaterThan(0);
  });

  it("shows details for the selected signal node", () => {
    render(
      <RequestWorkspace
        workspace={buildTestRequestsWorkspace()}
        onOpenBuilder={() => undefined}
        onOpenRequestDetail={() => undefined}
        selectedRequestId="prr_req_001"
        onSelectRequest={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Signal map" }));
    fireEvent.click(screen.getByRole("button", { name: "Select signal node Building Services Department" }));

    const selectedSignal = screen.getByRole("region", { name: "Selected agency signal" });
    expect(within(selectedSignal).getByText("Building Services Department")).toBeInTheDocument();
    expect(within(selectedSignal).getByText(/highest posture high/i)).toBeInTheDocument();
  });

  it("shows sparse signal relationships when replay has no event-backed edges", () => {
    render(
      <RequestWorkspace
        workspace={buildTestRequestsWorkspace()}
        onOpenBuilder={() => undefined}
        onOpenRequestDetail={() => undefined}
        selectedRequestId="prr_req_001"
        onSelectRequest={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Signal map" }));

    const relationships = screen.getByRole("region", { name: "Accessible signal relationships" });
    expect(within(relationships).getByText("No signal relationships in this view.")).toBeInTheDocument();
  });

  it("uses a horizontal scroll frame so edge-positioned nodes are not clipped on narrow screens", () => {
    render(
      <RequestWorkspace
        workspace={buildTestRequestsWorkspace()}
        onOpenBuilder={() => undefined}
        onOpenRequestDetail={() => undefined}
        selectedRequestId="prr_req_001"
        onSelectRequest={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Signal map" }));

    expect(screen.getByRole("group", { name: "Scrollable signal map canvas" })).toHaveClass(
      "overflow-x-auto",
      "overflow-y-hidden"
    );
  });
});
