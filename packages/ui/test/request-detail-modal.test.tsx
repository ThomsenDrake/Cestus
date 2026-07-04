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

  it("renders selected request details in a floating investigation dialog", () => {
    render(<RequestDetailModal selectedRequest={selectedRequest()} onClose={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: /Request investigation detail/i });
    const surface = dialog.firstElementChild;
    const detailBody = surface?.querySelector('[data-request-detail-modal-body="true"]');

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveClass("fixed", "inset-0", "overflow-hidden", "bg-[var(--command-black)]/58");
    expect(surface).toHaveClass(
      "mx-auto",
      "flex",
      "max-h-[calc(100dvh-1.5rem)]",
      "max-w-7xl",
      "flex-col",
      "overflow-hidden",
      "border",
      "border-[var(--console-line)]",
      "bg-[var(--console-void)]/96",
      "shadow-[0_24px_80px_rgba(0,0,0,0.72)]",
      "sm:max-h-[calc(100dvh-2.5rem)]",
      "lg:max-h-[calc(100dvh-4rem)]"
    );
    expect(surface).not.toHaveClass("min-h-[calc(100dvh-2rem)]");
    expect(detailBody).not.toBeNull();
    expect(detailBody).toHaveClass("min-h-0", "overflow-y-auto");
    expect(within(dialog).getByText("Building Services Department")).toBeInTheDocument();
    expect(within(dialog).getByText("Review fee or scope")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Review to send" })).toBeDisabled();
    expect(within(dialog).getByText("Legal escalation locked")).toBeInTheDocument();
  });

  it("renders a safe empty detail state", () => {
    render(<RequestDetailModal selectedRequest={undefined} onClose={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: /Request investigation detail/i });
    expect(within(dialog).getByText("Request detail unavailable")).toBeInTheDocument();
    expect(within(dialog).getByText(/selected request detail is unavailable/i)).toBeInTheDocument();
  });

  it("closes from the close button and Escape key", () => {
    const onClose = vi.fn();
    render(<RequestDetailModal selectedRequest={selectedRequest()} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close request detail" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("dialog", { name: /Request investigation detail/i }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("traps Tab focus inside the modal when only the close button is enabled", () => {
    render(<RequestDetailModal selectedRequest={selectedRequest()} onClose={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: /Request investigation detail/i });
    const closeButton = screen.getByRole("button", { name: "Close request detail" });

    closeButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(closeButton).toHaveFocus();
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
