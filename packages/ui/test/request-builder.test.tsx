/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { App } from "../src/App.js";
import { RequestBuilder } from "../src/requests/RequestBuilder.js";
import { buildPrrBuilderModel } from "../src/requests/request-model.js";
import { createStaticRequestsAdapter } from "../src/requests/request-adapter.js";
import { prrWorkspaceFixture } from "../src/requests/request-fixtures.js";

describe("RequestBuilder", () => {
  const noopSubmit = async () => undefined;

  function buildTestRequestsWorkspace() {
    return buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });
  }

  it("renders each guided checklist step as an open button", () => {
    render(<RequestBuilder builder={prrWorkspaceFixture.builder} onClose={() => undefined} onSubmit={noopSubmit} />);

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
    render(<RequestBuilder builder={prrWorkspaceFixture.builder} onClose={() => undefined} onSubmit={noopSubmit} />);

    expect(screen.getByDisplayValue("Florida Public Records")).toBeInTheDocument();
    expect(screen.getByText("Based on your current saved view.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Pack suggestion"), { target: { value: "US Federal FOIA" } });

    expect(screen.getByDisplayValue("US Federal FOIA")).toBeInTheDocument();
  });

  it("keeps edited suggested fills when switching away from a step", () => {
    render(<RequestBuilder builder={prrWorkspaceFixture.builder} onClose={() => undefined} onSubmit={noopSubmit} />);

    fireEvent.change(screen.getByLabelText("Pack suggestion"), { target: { value: "US Federal FOIA" } });
    fireEvent.click(screen.getByRole("button", { name: "Open Agency/contact" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Jurisdiction pack" }));

    expect(screen.getByDisplayValue("US Federal FOIA")).toBeInTheDocument();
  });

  it("renders accessible draft fields with safe jurisdiction defaults", () => {
    const workspace = buildTestRequestsWorkspace();

    render(<RequestBuilder builder={buildPrrBuilderModel(workspace)} onClose={() => undefined} onSubmit={noopSubmit} />);

    for (const fieldLabel of [
      "Jurisdiction pack",
      "Agency name",
      "Agency email",
      "Agency phone",
      "Requester name",
      "Requester email",
      "Requester phone",
      "Request text",
      "Received timestamp"
    ]) {
      expect(screen.getByLabelText(fieldLabel)).toBeInTheDocument();
    }

    expect(screen.getByLabelText("Jurisdiction pack")).toHaveValue("florida-public-records@0.1.0");
    expect(screen.getByLabelText("Received timestamp")).toHaveValue("");
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
    render(<RequestBuilder builder={prrWorkspaceFixture.builder} onClose={() => undefined} onSubmit={noopSubmit} />);

    const dialog = screen.getByRole("dialog", { name: "Guided request builder" });
    const closeButton = screen.getByRole("button", { name: "Close" });
    const createDraftButton = screen.getByRole("button", { name: "Create draft" });

    createDraftButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(createDraftButton).toHaveFocus();
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

  it("keeps the builder open and displays a safe diagnostic when draft creation fails", async () => {
    const testWorkspace = buildTestRequestsWorkspace();
    const adapter = createStaticRequestsAdapter(testWorkspace, {
      createDraftResult: {
        ok: false,
        failedStep: "estimate-deadline",
        committedEventIds: ["evt_created"],
        diagnostic: {
          message: "Could not estimate the deadline for the selected jurisdiction pack.",
          allowedRepairActions: ["select a supported jurisdiction pack"]
        },
        workspace: testWorkspace
      }
    });

    render(<App requestsAdapter={adapter} />);
    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    fireEvent.click(await screen.findByRole("button", { name: "New request" }));
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

    expect(screen.getByRole("dialog", { name: "Guided request builder" })).toBeInTheDocument();
    expect(await screen.findByText("Could not estimate the deadline for the selected jurisdiction pack.")).toBeInTheDocument();
  });
});
