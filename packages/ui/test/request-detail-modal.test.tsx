/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { RequestDetailModal } from "../src/requests/RequestDetailModal.js";
import { getSelectedPrrRequest } from "../src/requests/request-model.js";

describe("RequestDetailModal", () => {
  function selectedRequest(prrRequestId = "prr_fee_building_permits") {
    const workspace = buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });
    const detail = getSelectedPrrRequest(workspace, prrRequestId);
    expect(detail).toBeDefined();
    return detail!;
  }

  it("renders selected request details in a full-screen investigation dialog", () => {
    render(<RequestDetailModal selectedRequest={selectedRequest()} onClose={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: /Request investigation detail/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("Building Services Department")).toBeInTheDocument();
    expect(within(dialog).getByText("Review fee or scope")).toBeInTheDocument();
    expect(within(dialog).getByText("Legal escalation locked")).toBeInTheDocument();
  });

  it("closes from the close button and Escape key", () => {
    const onClose = vi.fn();
    render(<RequestDetailModal selectedRequest={selectedRequest()} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close request detail" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("dialog", { name: /Request investigation detail/i }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("traps Tab focus inside the modal", () => {
    render(<RequestDetailModal selectedRequest={selectedRequest()} onClose={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: /Request investigation detail/i });
    const closeButton = screen.getByRole("button", { name: "Close request detail" });
    const reviewButton = screen.getByRole("button", { name: "Review to send" });

    reviewButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(reviewButton).toHaveFocus();
  });

  it("restores focus to the opener when closed", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open detail</button>
          {open ? <RequestDetailModal selectedRequest={selectedRequest()} onClose={() => setOpen(false)} /> : null}
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open detail" });
    opener.focus();
    fireEvent.click(opener);

    fireEvent.click(await screen.findByRole("button", { name: "Close request detail" }));

    expect(opener).toHaveFocus();
  });
});
