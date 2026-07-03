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

  it("opens the guided request builder from the Requests shell action", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    fireEvent.click(screen.getByRole("button", { name: "New request" }));

    expect(screen.getByRole("dialog", { name: "Guided request builder" })).toBeInTheDocument();
    expect(screen.getByText("Review/send gate")).toBeInTheDocument();
  });
});
