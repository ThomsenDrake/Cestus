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
        onOpenRequestDetail={() => undefined}
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
        onOpenRequestDetail={() => undefined}
        onSelectRequest={() => undefined}
        onSelectedRequestChange={() => undefined}
      />
    );

    fireEvent.change(screen.getByLabelText("Saved PRR view"), { target: { value: "florida-fees" } });

    expect(screen.getByRole("button", { name: "Board view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Building Services Department")).toBeInTheDocument();
    expect(screen.queryByText("Example Agency")).not.toBeInTheDocument();
  });

  it("opens the request detail modal immediately when a request card is selected", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Requests workspace intelligence" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Request detail rail" })).not.toBeInTheDocument();

    const card = screen.getByRole("button", {
      name: "Select Please provide building permit inspection records for the riverfront project."
    });
    card.focus();
    fireEvent.click(card);

    const dialog = await screen.findByRole("dialog", { name: /Request investigation detail/i });
    expect(within(dialog).getByText("Building Services Department")).toBeInTheDocument();
    expect(within(dialog).getByText("Review fee or scope")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close request detail" }));

    expect(screen.queryByRole("dialog", { name: /Request investigation detail/i })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Requests workspace intelligence" })).toBeInTheDocument();
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(card).toHaveFocus();
  });

  it("keeps App Requests mode to one workspace intelligence rail landmark", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));

    await screen.findByRole("heading", { name: "Requests" });
    expect(screen.getAllByRole("complementary", { name: "Requests workspace intelligence" })).toHaveLength(1);
    expect(screen.queryByRole("complementary", { name: "Request detail rail" })).not.toBeInTheDocument();
  });
});
