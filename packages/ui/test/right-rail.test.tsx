/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { createTestRequestsAdapter } from "./request-test-utils.js";

describe("right context rail", () => {
  it("defaults to the agent brief", () => {
    render(<App />);

    const rail = screen.getByRole("complementary", { name: "Decision rail" });
    expect(within(rail).getByRole("heading", { name: "Agent brief" })).toBeInTheDocument();
    expect(within(rail).getByText("Legal risk")).toBeInTheDocument();
    expect(within(rail).getByText("Factual confidence")).toBeInTheDocument();
    expect(within(rail).getByText("Cost pressure")).toBeInTheDocument();
  });

  it("switches to selected runtime item detail and can return to the brief", async () => {
    render(<App requestsAdapter={createTestRequestsAdapter()} />);

    fireEvent.click(await screen.findByRole("button", {
      name: "Select Economic Development Office stalling signal"
    }));

    const rail = screen.getByRole("complementary", { name: "Decision rail" });
    expect(
      within(rail).getByRole("heading", { name: "Economic Development Office stalling signal" })
    ).toBeInTheDocument();
    expect(within(rail).getByText("Human decision required")).toBeInTheDocument();
    expect(within(rail).getAllByText("Prepare escalation").length).toBeGreaterThan(0);

    fireEvent.click(within(rail).getByRole("button", { name: "Back to agent brief" }));
    expect(within(rail).getByRole("heading", { name: "Agent brief" })).toBeInTheDocument();
  });
});
