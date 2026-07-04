/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildPrrProjection } from "../../prr/src/projection.js";
import { buildPrrWorkspaceDto, type PrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { App } from "../src/App.js";
import {
  createLocalReplayRequestsAdapter,
  createStaticRequestsAdapter,
  type RequestsWorkspaceAdapter
} from "../src/requests/request-adapter.js";

describe("Cestus UI bootstrap", () => {
  function buildTestRequestsWorkspace() {
    return buildPrrWorkspaceDto(buildPrrProjection(prrWorkspaceSeedEvents), {
      now: "2026-07-20T12:00:00.000Z"
    });
  }

  function replaceCardAgency(
    workspace: PrrWorkspaceDto,
    prrRequestId: string,
    agencyName: string
  ): PrrWorkspaceDto {
    return {
      ...workspace,
      cards: workspace.cards.map((card) =>
        card.prrRequestId === prrRequestId ? { ...card, agencyName } : card
      ),
      requestDetails: workspace.requestDetails.map((detail) =>
        detail.prrRequestId === prrRequestId ? { ...detail, agencyName } : detail
      )
    };
  }

  it("renders the Command workspace entry point", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Command" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New request" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Signal operations board" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Saved PRR view"), { target: { value: "florida-fees" } });
    const feeCard = screen.getByRole("button", {
      name: /Select Please provide building permit inspection records for the riverfront project/i
    });
    expect(feeCard).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Requests workspace intelligence" })).toBeInTheDocument();
    fireEvent.click(feeCard);
    const detailModal = await screen.findByRole("dialog", { name: /Request investigation detail/i });
    expect(within(detailModal).getByText(/Building Services Department/)).toBeInTheDocument();
    fireEvent.click(within(detailModal).getByRole("button", { name: "Close request detail" }));

    fireEvent.click(screen.getByRole("button", { name: "Signal map" }));
    expect(screen.getByRole("region", { name: "PRR signal map" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    expect(screen.getByRole("dialog", { name: "Guided request builder" })).toBeInTheDocument();
  });

  it("renders Requests from backend-derived PRR DTOs", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));

    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(screen.getByText("Building Services Department")).toBeInTheDocument();
    expect(screen.getByText("$1,850.00 challenged")).toBeInTheDocument();
  });

  it("reloads Requests when the adapter prop changes", async () => {
    const firstWorkspace = buildTestRequestsWorkspace();
    const secondWorkspace = replaceCardAgency(
      firstWorkspace,
      "prr_fee_building_permits",
      "Records Replacement Office"
    );
    const firstAdapter = createStaticRequestsAdapter(firstWorkspace);
    const secondAdapter = createStaticRequestsAdapter(secondWorkspace);
    const { rerender } = render(<App requestsAdapter={firstAdapter} />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));

    expect(await screen.findByText("Building Services Department")).toBeInTheDocument();

    rerender(<App requestsAdapter={secondAdapter} />);

    expect(await screen.findByText("Records Replacement Office")).toBeInTheDocument();
    expect(screen.queryByText("Building Services Department")).not.toBeInTheDocument();
  });

  it("does not open a queued builder after Requests finishes loading", async () => {
    const workspace = buildTestRequestsWorkspace();
    let resolveWorkspace: (workspace: PrrWorkspaceDto) => void = () => undefined;
    const delayedAdapter: RequestsWorkspaceAdapter = {
      loadRequestsWorkspace: () =>
        new Promise((resolve) => {
          resolveWorkspace = resolve;
        }),
      async createDraftRequest() {
        return {
          ok: false,
          failedStep: "append-request",
          committedEventIds: [],
          diagnostic: {
            message: "Delayed test adapter does not create drafts.",
            allowedRepairActions: ["use a replay adapter"]
          },
          workspace
        };
      }
    };

    render(<App requestsAdapter={delayedAdapter} />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    fireEvent.click(screen.getByRole("button", { name: "New request" }));

    expect(screen.queryByRole("dialog", { name: "Guided request builder" })).not.toBeInTheDocument();

    await act(async () => {
      resolveWorkspace(workspace);
    });

    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Guided request builder" })).not.toBeInTheDocument();
  });

  it("submits a builder draft through the Requests adapter and reloads the board", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    fireEvent.click(await screen.findByRole("button", { name: "New request" }));

    fireEvent.change(screen.getByLabelText("Agency name"), { target: { value: "City Clerk" } });
    fireEvent.change(screen.getByLabelText("Agency email"), { target: { value: "clerk@example.gov" } });
    fireEvent.change(screen.getByLabelText("Requester name"), { target: { value: "Avery Investigator" } });
    fireEvent.change(screen.getByLabelText("Requester email"), { target: { value: "avery@example.org" } });
    fireEvent.change(screen.getByLabelText("Request text"), {
      target: { value: "All budget amendment memos from January 2026." }
    });

    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

    expect(await screen.findByText("City Clerk")).toBeInTheDocument();
    expect(screen.getAllByText(/budget amendment memos/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("complementary", { name: "Requests workspace intelligence" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Request detail rail" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Guided request builder" })).not.toBeInTheDocument();
  });

  it("stores two local replay events for a successful builder draft submit", async () => {
    const adapter = createLocalReplayRequestsAdapter([], {
      idFactory: () => "evt_draft_test_created",
      now: () => "2026-07-03T18:00:00.000Z",
      requestIdFactory: () => "prr_draft_test_city_clerk"
    });

    const result = await adapter.createDraftRequest({
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "City Clerk", email: "clerk@example.gov" },
      requester: { name: "Avery Investigator", email: "avery@example.org" },
      requestText: "All budget amendment memos from January 2026."
    });

    expect(result.ok).toBe(true);
    expect(result.committedEventIds).toEqual(["evt_draft_test_created", "evt_draft_test_created_2"]);
    expect(adapter.readEventsForTest().map((event) => event.type)).toEqual([
      "prr.request.created",
      "prr.deadline.estimated"
    ]);
    expect(adapter.readEventsForTest().map((event) => event.sequence)).toEqual([1, 2]);
    expect(adapter.readEventsForTest()[1]?.context.causationId).toBe("evt_draft_test_created");
    expect(result.workspace.cards.map((card) => card.prrRequestId)).toContain("prr_draft_test_city_clerk");
    expect(result.workspace.cards.find((card) => card.prrRequestId === "prr_draft_test_city_clerk")).toMatchObject({
      agencyName: "City Clerk",
      laneId: "drafting"
    });
  });

  it("rejects a duplicate generated request stream without appending local replay events", async () => {
    const adapter = createLocalReplayRequestsAdapter(prrWorkspaceSeedEvents, {
      idFactory: () => "evt_duplicate_draft",
      now: () => "2026-07-03T18:00:00.000Z",
      requestIdFactory: () => "prr_draft_city_budget"
    });
    const beforeEvents = adapter.readEventsForTest();

    const result = await adapter.createDraftRequest({
      jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
      agency: { name: "City Clerk", email: "clerk@example.gov" },
      requester: { name: "Avery Investigator", email: "avery@example.org" },
      requestText: "All budget amendment memos from January 2026."
    });

    expect(result.ok).toBe(false);
    expect(result.committedEventIds).toEqual([]);
    if (!result.ok) {
      expect(result.failedStep).toBe("append-request");
      expect(result.diagnostic.message).toBe(
        "Draft creation could not start because the request stream already exists. Reload Requests and try again."
      );
    }
    expect(adapter.readEventsForTest()).toEqual(beforeEvents);
  });

  it("returns a fixed safe diagnostic for unsupported local replay draft failures", async () => {
    const adapter = createLocalReplayRequestsAdapter([], {
      idFactory: () => "evt_invalid_draft",
      now: () => "2026-07-03T18:00:00.000Z",
      requestIdFactory: () => "prr_draft_invalid_jurisdiction"
    });

    const result = await adapter.createDraftRequest({
      jurisdictionPack: { name: "secret-token-pack", version: "0.1.0" },
      agency: { name: "City Clerk", email: "clerk@example.gov" },
      requester: { name: "Avery Investigator", email: "avery@example.org" },
      requestText: "All budget amendment memos from January 2026. Bearer abc123"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedStep).toBe("estimate-deadline");
      expect(result.diagnostic.message).toBe(
        "Draft creation could not estimate a deadline for the selected jurisdiction pack."
      );
      expect(result.diagnostic.message).not.toMatch(/secret-token-pack|Bearer|Zod|schema/i);
    }
    expect(adapter.readEventsForTest()).toEqual([]);
  });
});
