/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("right context rail", () => {
  it("defaults to the agent brief", () => {
    render(<App />);

    const rail = screen.getByRole("complementary", { name: "Decision rail" });
    expect(within(rail).getByRole("heading", { name: "Agent brief" })).toBeInTheDocument();
    expect(within(rail).getByText("Legal risk")).toBeInTheDocument();
    expect(within(rail).getByText("Factual confidence")).toBeInTheDocument();
    expect(within(rail).getByText("Cost pressure")).toBeInTheDocument();
  });

  it("switches to selected item detail and can return to the brief", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Select Miami-Dade Aviation Department stalling signal" }));

    const rail = screen.getByRole("complementary", { name: "Decision rail" });
    expect(
      within(rail).getByRole("heading", { name: "Miami-Dade Aviation Department stalling signal" })
    ).toBeInTheDocument();
    expect(within(rail).getByText("Human decision required")).toBeInTheDocument();
    expect(within(rail).getAllByText("Prepare escalation").length).toBeGreaterThan(0);

    fireEvent.click(within(rail).getByRole("button", { name: "Back to agent brief" }));
    expect(within(rail).getByRole("heading", { name: "Agent brief" })).toBeInTheDocument();
  });
});
