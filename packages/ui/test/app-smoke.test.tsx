/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PrrWorkspaceDto } from "../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../prr/src/workspace-seed.js";
import { App } from "../src/App.js";
import type { AgentStatusDto } from "../src/agent/agent-types.js";
import { createStaticOperatorStatusAdapter } from "../src/operator-status/operator-status-adapter.js";
import type { OperatorStatusDto } from "../src/operator-status/operator-status-types.js";
import {
  createHttpRequestsAdapter,
  createLocalReplayRequestsAdapter,
  createStaticRequestsAdapter,
  type RequestsWorkspaceAdapter
} from "../src/requests/request-adapter.js";
import { buildTestRequestsWorkspace, createTestRequestsAdapter } from "./request-test-utils.js";

describe("Cestus UI bootstrap", () => {
  const operatorStatusAdapter = createStaticOperatorStatusAdapter(appSmokeOperatorStatus);

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
    render(<App requestsAdapter={createTestRequestsAdapter()} operatorStatusAdapter={operatorStatusAdapter} />);

    expect(screen.getByRole("heading", { name: "Command" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New request" })).toBeInTheDocument();
    const cockpit = await screen.findByRole("region", { name: "Operator cockpit" });
    expect(within(cockpit).getByRole("tab", { name: /Workspace/ })).toBeInTheDocument();
    expect(within(cockpit).getByRole("tab", { name: /Ingestion/ })).toBeInTheDocument();
    expect(within(cockpit).getByRole("tab", { name: /Legacy Import/ })).toBeInTheDocument();
    expect(within(cockpit).getByRole("tab", { name: /PRR\/Investigations/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Signal operations board" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Requests workspace intelligence" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Request detail rail" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Saved PRR view"), { target: { value: "florida-fees" } });
    expect(screen.getByText("1 visible request in Florida fees.")).toBeInTheDocument();
    const feeCard = screen.getByRole("button", {
      name: /Select Please provide building permit inspection records for the riverfront project/i
    });
    expect(feeCard).toBeInTheDocument();
    fireEvent.click(feeCard);
    const detailModal = await screen.findByRole("dialog", { name: /Request investigation detail/i });
    expect(within(detailModal).getByText(/Building Services Department/)).toBeInTheDocument();
    fireEvent.click(within(detailModal).getByRole("button", { name: "Close request detail" }));

    fireEvent.click(screen.getByRole("button", { name: "Signal map" }));
    expect(screen.getByRole("region", { name: "PRR signal map" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    expect(screen.getByRole("dialog", { name: "Guided request builder" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /Request investigation detail/i })).not.toBeInTheDocument();
  });

  it("renders Requests from backend-derived PRR DTOs", async () => {
    render(<App requestsAdapter={createTestRequestsAdapter()} operatorStatusAdapter={operatorStatusAdapter} />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));

    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(screen.getByText("Building Services Department")).toBeInTheDocument();
    expect(screen.getByText("$1,850.00 challenged")).toBeInTheDocument();
  });

  it("uses the HTTP Requests adapter as the product default", async () => {
    const workspace = buildTestRequestsWorkspace();
    const fetchCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      fetchCalls.push(String(url));
      return new Response(JSON.stringify(workspace), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;

    try {
      render(<App operatorStatusAdapter={operatorStatusAdapter} />);
      fireEvent.click(screen.getByRole("link", { name: "Requests" }));
      expect(await screen.findByText("Building Services Department")).toBeInTheDocument();
      expect(fetchCalls).toEqual(["/api/requests/workspace"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses the HTTP Agent adapter as the product default", async () => {
    const fetchCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      fetchCalls.push(String(url));
      return new Response(JSON.stringify(appSmokeAgentStatus()), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;

    try {
      render(<App requestsAdapter={createTestRequestsAdapter()} operatorStatusAdapter={operatorStatusAdapter} />);
      fireEvent.click(screen.getByRole("link", { name: "Agent" }));
      const workspace = await screen.findByRole("region", { name: "Resident agent workspace" });
      expect(screen.getByText("Fake Local Model Provider")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "New request" })).not.toBeInTheDocument();
      expect(within(workspace).getAllByRole("button").map((button) => button.textContent)).toStrictEqual([
        "Refresh agent status"
      ]);
      expect(fetchCalls).toEqual(["/api/agent/status"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("shows a safe Requests runtime error when the default HTTP adapter cannot load", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "Bearer raw-token" }), {
        status: 503,
        headers: { "content-type": "application/json" }
      })) as typeof fetch;

    try {
      render(<App operatorStatusAdapter={operatorStatusAdapter} />);
      fireEvent.click(screen.getByRole("link", { name: "Requests" }));
      const errorRegion = await screen.findByRole("region", { name: "Requests load error" });
      expect(errorRegion).toHaveTextContent("Requests runtime returned HTTP 503.");
      expect(errorRegion).not.toHaveTextContent("Bearer raw-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
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
    const { rerender } = render(<App requestsAdapter={firstAdapter} operatorStatusAdapter={operatorStatusAdapter} />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));

    expect(await screen.findByText("Building Services Department")).toBeInTheDocument();

    rerender(<App requestsAdapter={secondAdapter} operatorStatusAdapter={operatorStatusAdapter} />);

    expect(await screen.findByText("Records Replacement Office")).toBeInTheDocument();
    expect(screen.queryByText("Building Services Department")).not.toBeInTheDocument();
  });

  it("removes the request detail modal and shows the load error when Requests reload fails", async () => {
    const workspace = buildTestRequestsWorkspace();
    const firstAdapter = createStaticRequestsAdapter(workspace);
    const failingAdapter: RequestsWorkspaceAdapter = {
      async loadRequestsWorkspace() {
        throw new Error("Requests reload failed for test.");
      },
      async createDraftRequest() {
        return {
          ok: false,
          failedStep: "append-request",
          committedEventIds: [],
          diagnostic: {
            message: "Failing test adapter does not create drafts.",
            allowedRepairActions: ["reload Requests"]
          },
          workspace
        };
      }
    };
    const { rerender } = render(<App requestsAdapter={firstAdapter} operatorStatusAdapter={operatorStatusAdapter} />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    const card = await screen.findByRole("button", {
      name: "Select Please provide building permit inspection records for the riverfront project."
    });
    fireEvent.click(card);
    expect(await screen.findByRole("dialog", { name: /Request investigation detail/i })).toBeInTheDocument();

    rerender(<App requestsAdapter={failingAdapter} operatorStatusAdapter={operatorStatusAdapter} />);

    const errorRegion = await screen.findByRole("region", { name: "Requests load error" });
    expect(within(errorRegion).getByText("Requests reload failed for test.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /Request investigation detail/i })).not.toBeInTheDocument();
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

    render(<App requestsAdapter={delayedAdapter} operatorStatusAdapter={operatorStatusAdapter} />);

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
    const adapter = createLocalReplayRequestsAdapter(prrWorkspaceSeedEvents, {
      idFactory: () => "evt_app_smoke_draft",
      now: () => "2026-07-03T18:00:00.000Z",
      requestIdFactory: () => "prr_app_smoke_city_clerk"
    });
    render(<App requestsAdapter={adapter} operatorStatusAdapter={operatorStatusAdapter} />);

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

  it("keeps the loaded Requests board visible when HTTP draft creation fails", async () => {
    const workspace = buildTestRequestsWorkspace();
    let requestCount = 0;
    const adapter = createHttpRequestsAdapter({
      fetcher: async (url: RequestInfo | URL) => {
        requestCount += 1;
        if (String(url).endsWith("/api/requests/workspace")) {
          return new Response(JSON.stringify(workspace), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ message: "Bearer raw-token" }), {
          status: 503,
          headers: { "content-type": "application/json" }
        });
      }
    });
    render(<App requestsAdapter={adapter} operatorStatusAdapter={operatorStatusAdapter} />);

    fireEvent.click(screen.getByRole("link", { name: "Requests" }));
    expect(await screen.findByText("Building Services Department")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    fireEvent.change(screen.getByLabelText("Agency name"), { target: { value: "City Clerk" } });
    fireEvent.change(screen.getByLabelText("Requester name"), { target: { value: "Avery Investigator" } });
    fireEvent.change(screen.getByLabelText("Request text"), {
      target: { value: "All budget amendment memos from January 2026." }
    });
    fireEvent.change(screen.getByLabelText("Received timestamp"), {
      target: { value: "2026-07-05T12:00:00.000Z" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Requests runtime returned HTTP 503.");
    expect(screen.getByText("Building Services Department")).toBeInTheDocument();
    expect(screen.queryByText("No requests yet.")).not.toBeInTheDocument();
    expect(requestCount).toBe(2);
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

function appSmokeAgentStatus(): AgentStatusDto {
  return {
    schemaVersion: "agent-status.v1",
    generatedAt: "2026-07-07T21:00:00.000Z",
    residentAgentId: "agent_default",
    identity: {
      residentAgentId: "agent_default",
      workspaceId: "ws_case_001",
      label: "Cestus Agent",
      policyId: "agent_policy_default",
      initializedBy: "actor_case_owner",
      allowedRunTypes: ["evidence-triage"],
      memoryProjectionVersion: "0.1.0",
      eventIds: ["evt_agent_identity"],
      causationIds: []
    },
    tasks: [],
    runs: [],
    toolRequests: [],
    activeMemory: [],
    permissions: [],
    locks: [],
    providers: [
      {
        providerId: "provider_fake_local",
        label: "Fake Local Model Provider",
        adapterVersion: "fake-provider.v1",
        endpointKind: "local-engine",
        modelFamilies: ["fake-local"],
        credentialKinds: ["local-no-secret"],
        supportsStructuredOutput: false,
        supportsToolCalling: false,
        safeDataNotes: "Deterministic local fake provider for app smoke tests."
      }
    ],
    pendingApprovalCount: 0,
    activeLockCount: 0,
    diagnostics: []
  };
}

const appSmokeOperatorStatus: OperatorStatusDto = {
  schemaVersion: "operator-status.v1",
  generatedAt: "2026-07-06T23:40:00.000Z",
  runtime: {
    available: true,
    storageStrategy: "portable-workspace",
    bindMode: "loopback",
    workspaceMounted: true,
    safeMessage: "Local runtime is serving a mounted portable workspace."
  },
  summary: {
    overallState: "ready",
    blockedCount: 0,
    actionRequiredCount: 0,
    degradedCount: 0,
    nextSafeActionId: "action_refresh_operator_status"
  },
  sections: [
    {
      sectionId: "workspace",
      label: "Workspace",
      state: "ready",
      headline: "Mounted portable workspace",
      safeSummary: "Workspace manifest, ledger, and blob roots are readable.",
      metrics: [{ metricId: "ledger_events", label: "Ledger events", value: "42", tone: "healthy" }],
      diagnostics: [],
      sourceEvidence: [],
      nextSafeActionIds: ["action_refresh_operator_status"]
    },
    {
      sectionId: "ingestion",
      label: "Ingestion",
      state: "ready",
      headline: "Ingestion ready",
      safeSummary: "Approval gates remain available in the Ingestion module.",
      metrics: [{ metricId: "pending_jobs", label: "Pending jobs", value: "0", tone: "healthy" }],
      diagnostics: [],
      sourceEvidence: [],
      nextSafeActionIds: []
    },
    {
      sectionId: "legacy-import",
      label: "Legacy Import",
      state: "ready",
      headline: "Legacy import evidence view ready",
      safeSummary: "Legacy import remains evidence-first with no accepted graph truth.",
      metrics: [{ metricId: "accepted_truth", label: "Accepted legacy truth", value: "0", tone: "healthy" }],
      diagnostics: [],
      sourceEvidence: [],
      nextSafeActionIds: []
    },
    {
      sectionId: "prr",
      label: "PRR/Investigations",
      state: "ready",
      headline: "Requests workspace replayed",
      safeSummary: "Drafts are visible, and no send or escalation action is available here.",
      metrics: [{ metricId: "active_requests", label: "Active requests", value: "7", tone: "neutral" }],
      diagnostics: [],
      sourceEvidence: [],
      nextSafeActionIds: ["action_open_requests"]
    }
  ],
  safeActions: [
    {
      actionId: "action_refresh_operator_status",
      label: "Refresh operator status",
      kind: "refresh-status",
      sourceContract: "operator-status.v1",
      requiresHumanApproval: false,
      mutatesCanonicalState: false,
      externalEffect: false,
      enabled: true
    },
    {
      actionId: "action_open_requests",
      label: "Open requests",
      kind: "navigate",
      target: "requests",
      sourceContract: "operator-status.v1",
      requiresHumanApproval: false,
      mutatesCanonicalState: false,
      externalEffect: false,
      enabled: true
    }
  ]
};
