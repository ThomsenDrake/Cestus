/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
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
    expect(dialog).toHaveClass(
      "fixed",
      "inset-0",
      "overflow-hidden",
      "bg-[var(--command-black)]/58",
      "p-3",
      "sm:p-5",
      "lg:p-8"
    );
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

  it("shows the exact routine follow-up preview while send remains locked for review", () => {
    const followUpDeadline: KnowledgeEvent = {
      id: "evt_prr_ack_florida_records_deadline_estimated",
      type: "prr.deadline.estimated",
      version: 1,
      streamId: "prr_ack_florida_records",
      sequence: 4,
      context: {
        actor: { id: "actor_prr_test", kind: "human", label: "PRR Test Requester" },
        occurredAt: "2026-07-03T12:00:00.000Z",
        correlationId: "corr_prr_ack_florida_records",
        causationId: "evt_prr_ack_florida_records_received",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", "florida-public-records": "0.1.0" }
      },
      payload: {
        prrRequestId: "prr_ack_florida_records",
        deadlineDate: "2026-07-10",
        confidence: "workflow",
        explanation: "Florida workflow estimate for a routine status check.",
        citedRules: [
          {
            jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
            label: "Florida prompt access",
            citation: "Fla. Stat. sec. 119.07(1)(a)"
          }
        ]
      }
    };
    const workspace = buildPrrWorkspaceDto(
      buildPrrProjection([...prrWorkspaceSeedEvents, followUpDeadline]),
      { now: "2026-07-20T12:00:00.000Z" }
    );
    const followUp = getSelectedPrrRequest(workspace, "prr_ack_florida_records");
    expect(followUp).toBeDefined();

    render(<RequestDetailModal selectedRequest={followUp} onClose={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: /Request investigation detail/i });
    expect(within(dialog).getByRole("heading", { name: "Follow-up draft preview" })).toBeInTheDocument();
    expect(within(dialog).getByText("Estimated deadline basis: 2026-07-10")).toBeInTheDocument();
    expect(within(dialog).getByText("records@county.example.gov")).toBeInTheDocument();
    expect(within(dialog).getByText("Re: Public records request for commission calendar records")).toBeInTheDocument();
    expect(within(dialog).getByText("Fla. Stat. sec. 119.07(1)(a)")).toBeInTheDocument();
    expect(within(dialog).getByText("No attachments selected")).toBeInTheDocument();
    expect(within(dialog).getByText("No evidence selected")).toBeInTheDocument();
    expect(within(dialog).getByText("ev_ack_florida_records")).toBeInTheDocument();
    expect(within(dialog).getByText(/Gmail history is replayed; live provider readiness is not asserted/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Review to send" })).toBeDisabled();
  });

  it("renders fee and scope pressure plus production evidence IDs from request detail DTOs", () => {
    const workspace = buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });
    const feeDetail = getSelectedPrrRequest(workspace, "prr_fee_building_permits");
    expect(feeDetail).toBeDefined();
    const view = render(<RequestDetailModal selectedRequest={feeDetail} onClose={() => undefined} />);

    const feePressure = screen.getByRole("region", { name: "Fee and scope pressure" });
    expect(within(feePressure).getByText("$1,850.00 challenged")).toBeInTheDocument();
    expect(within(feePressure).getByText("ev_fee_building_permits")).toBeInTheDocument();

    const productionDetail = getSelectedPrrRequest(workspace, "prr_req_001");
    expect(productionDetail).toBeDefined();
    view.rerender(<RequestDetailModal selectedRequest={productionDetail} onClose={() => undefined} />);

    const productions = screen.getByRole("region", { name: "Productions" });
    expect(within(productions).getByText("prod_prr_req_001")).toBeInTheDocument();
    expect(within(productions).getByText("ev_prr_production_001, ev_prr_production_002")).toBeInTheDocument();
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
