/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { App } from "../src/App.js";
import { RequestWorkspace } from "../src/requests/RequestWorkspace.js";

describe("RequestWorkspace", () => {
  function buildTestRequestsWorkspace() {
    return buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });
  }

  it("renders the signal operations board lanes and cards", () => {
    render(
      <RequestWorkspace
        workspace={buildTestRequestsWorkspace()}
        selectedRequestId="prr_req_001"
        onOpenBuilder={() => undefined}
        onSelectRequest={() => undefined}
        onSelectedRequestChange={() => undefined}
      />
    );

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
    expect(screen.getByText("Building Services Department")).toBeInTheDocument();
    expect(screen.getByText("$1,850.00 challenged")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Select Please provide building permit inspection records for the riverfront project."
      })
    ).toBeInTheDocument();
  });

  it("applies a saved PRR view while keeping board mode pressed", () => {
    render(
      <RequestWorkspace
        workspace={buildTestRequestsWorkspace()}
        selectedRequestId="prr_req_001"
        onOpenBuilder={() => undefined}
        onSelectRequest={() => undefined}
        onSelectedRequestChange={() => undefined}
      />
    );

    fireEvent.change(screen.getByLabelText("Saved PRR view"), { target: { value: "florida-fees" } });

    expect(screen.getByRole("button", { name: "Board view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Building Services Department")).toBeInTheDocument();
    expect(screen.queryByText("Example Agency")).not.toBeInTheDocument();
  });

  it("exposes selected request card state when a request is selected", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Select Please provide building permit inspection records for the riverfront project."
      })
    );

    expect(
      screen.getByRole("button", {
        name: "Select Please provide building permit inspection records for the riverfront project."
      })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(screen.getByRole("complementary", { name: "Request detail rail" })).getByText("Review fee or scope")
    ).toBeInTheDocument();
  });

  it("keeps App Requests mode to one request detail rail landmark", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));

    await screen.findByRole("heading", { name: "Requests" });
    expect(screen.getAllByRole("complementary", { name: "Request detail rail" })).toHaveLength(1);
  });
});
