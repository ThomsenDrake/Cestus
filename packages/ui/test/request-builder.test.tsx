/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { RequestBuilder } from "../src/requests/RequestBuilder.js";
import { prrWorkspaceFixture } from "../src/requests/request-fixtures.js";

describe("RequestBuilder", () => {
  it("renders each guided checklist step as an open button", () => {
    render(<RequestBuilder builder={prrWorkspaceFixture.builder} onClose={() => undefined} />);

    for (const stepLabel of [
      "Jurisdiction pack",
      "Agency/contact",
      "Request scope",
      "Delivery channel",
      "Deadline estimate",
      "Review/send gate"
    ]) {
      expect(screen.getByRole("button", { name: `Open ${stepLabel}` })).toBeInTheDocument();
    }
  });

  it("shows editable suggested fills with visible provenance", () => {
    render(<RequestBuilder builder={prrWorkspaceFixture.builder} onClose={() => undefined} />);

    expect(screen.getByDisplayValue("Florida Public Records")).toBeInTheDocument();
    expect(screen.getByText("Based on your current saved view.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Pack suggestion"), { target: { value: "US Federal FOIA" } });

    expect(screen.getByDisplayValue("US Federal FOIA")).toBeInTheDocument();
  });

  it("keeps edited suggested fills when switching away from a step", () => {
    render(<RequestBuilder builder={prrWorkspaceFixture.builder} onClose={() => undefined} />);

    fireEvent.change(screen.getByLabelText("Pack suggestion"), { target: { value: "US Federal FOIA" } });
    fireEvent.click(screen.getByRole("button", { name: "Open Agency/contact" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Jurisdiction pack" }));

    expect(screen.getByDisplayValue("US Federal FOIA")).toBeInTheDocument();
  });

  it("moves focus into the dialog and restores it after Escape closes the builder", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    await screen.findByRole("heading", { name: "Requests" });
    const newRequestButton = screen.getByRole("button", { name: "New request" });
    newRequestButton.focus();
    fireEvent.click(newRequestButton);

    expect(await screen.findByRole("button", { name: "Close" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Guided request builder" }), { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Guided request builder" })).not.toBeInTheDocument();
    expect(newRequestButton).toHaveFocus();
  });

  it("keeps Tab focus cycling inside the dialog", () => {
    render(<RequestBuilder builder={prrWorkspaceFixture.builder} onClose={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: "Guided request builder" });
    const closeButton = screen.getByRole("button", { name: "Close" });
    const packSuggestion = screen.getByLabelText("Pack suggestion");

    packSuggestion.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(packSuggestion).toHaveFocus();
  });

  it("opens the guided request builder from the Requests shell action", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    await screen.findByRole("heading", { name: "Requests" });
    fireEvent.click(screen.getByRole("button", { name: "New request" }));

    expect(await screen.findByRole("dialog", { name: "Guided request builder" })).toBeInTheDocument();
    expect(screen.getByText("Review/send gate")).toBeInTheDocument();
  });

  it("does not open the guided request builder from the Command shell action", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "New request" }));

    expect(screen.queryByRole("dialog", { name: "Guided request builder" })).not.toBeInTheDocument();
  });
});
