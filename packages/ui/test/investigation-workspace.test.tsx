/** @vitest-environment jsdom */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvestigationWorkspace } from "../src/ontology/InvestigationWorkspace.js";

const citation = {
  workspaceId: "ws_test",
  evidenceId: "ev_one",
  extractionId: "extract_1",
  passageIndex: 0,
  quote: "Agency appointed Firm in 2024.",
  sourceContentHash: `sha256:${"a".repeat(64)}`,
  extractionContentHash: `sha256:${"b".repeat(64)}`,
  locator: { kind: "text", block: 1, start: 0, end: 30 },
};
const context = {
  version: "case-comparison.v1",
  fingerprint: "sha256:scope",
  scope: {
    selection: "all",
    comparedCaseIds: ["case_a", "case_b"],
    unexaminedEligibleCaseIds: [],
    uniquePassageCount: 1,
    limits: {
      cases: 12,
      assertions: 100,
      uniquePassages: 24,
      passageTextBytes: 32768,
      candidates: 100,
    },
    coverageLimits: ["Only accepted accessible knowledge examined."],
  },
  cases: [
    { caseId: "case_a", title: "Alpha case" },
    { caseId: "case_b", title: "Beta case" },
  ],
  assertions: [
    {
      assertionId: "assert_one",
      kind: "occurrence",
      predicate: "appointment",
      value: { type: "string", value: "Appointment" },
      caseIds: ["case_a", "case_b"],
      participants: [{ role: "appointee", entityId: "entity_firm" }],
      occurredTime: { start: "2024", uncertain: true },
      citationIndices: [0],
    },
  ],
  entities: [
    {
      entityId: "entity_firm",
      canonicalLabel: "Firm",
      entityType: "organization",
    },
  ],
  passages: [{ index: 0, citation, lineage: null, duplicateGroup: "group-1" }],
  candidates: [
    {
      kind: "event_structure",
      signature: "appointment",
      caseIds: ["case_a", "case_b"],
      assertionIds: ["assert_one"],
      entityIds: ["entity_firm"],
      citationIndices: [0],
      independentSourceCount: 0,
      sourceIndependence: "uncertain",
      limitations: ["No independent corroboration established."],
    },
  ],
};
const output = {
  schemaVersion: "case-comparison.v1",
  comparison: context,
  question: "Find recurring patterns.",
  stale: false,
  output: {
    answer: "A tentative appointment pattern.",
    citations: [{ passageIndex: 0, quote: citation.quote }],
    unresolvedQuestions: ["Was the appointment completed?"],
    findings: [
      {
        title: "Recurring appointments",
        kind: "event_structure",
        explanation: "Two cases record appointments.",
        caseIds: ["case_a", "case_b"],
        assertionIds: ["assert_one"],
        citations: [{ passageIndex: 0, quote: citation.quote }],
        differences: ["Different firms."],
        counterexamples: ["No counterexample tested."],
        ordinaryExplanations: ["Routine procurement."],
        limitations: ["Time uncertain."],
      },
    ],
  },
};
function backend(
  initialState?: string,
  stale = false,
  initialRecords: unknown[] = [],
) {
  let state = initialState;
  let records: unknown[] = initialRecords;
  let question = "";
  const manifest = () => ({
    schemaVersion: "document-processing-manifest.v2",
    invocationId: "inv_test",
    provider: "codex-chatgpt.v1",
    destination: {
      transport: "codex-chatgpt.v1",
      model: "gpt-6-astra",
      authentication: "chatgpt",
      mandatoryTools: [{ name: "tool_search" }],
      usageBasis: "ChatGPT subscription",
      maxInvocations: 1,
    },
    comparison: { context, question },
    systemPrompt: "Interpret only supplied evidence.",
    inputText: "EXACT OUTGOING CONTEXT",
    inputBytes: 22,
    maxResponseBytes: 65536,
    timeoutMs: 30000,
  });
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    let value: unknown;
    if (path.startsWith("/api/investigation?"))
      value = {
        revision: 10,
        eligibleCases: context.cases,
        context,
        records,
        jobs: state
          ? [
              {
                invocationId: "inv_test",
                manifestHash: "sha256:manifest",
                state,
                createdAt: "2026-09-06",
              },
            ]
          : [],
      };
    else if (path === "/api/investigation/preview") {
      state = "awaiting_approval";
      question = body.question;
      value = {
        invocationId: "inv_test",
        manifestHash: "sha256:manifest",
        manifest: manifest(),
      };
    } else if (path === "/api/document-processing/approve") {
      state = "queued";
      value = {};
    } else if (path.endsWith("/run")) {
      state = "completed";
      value = {};
    } else if (path.endsWith("/output")) value = { ...output, stale };
    else if (path.endsWith("/preview"))
      value = {
        invocationId: "inv_test",
        manifestHash: "sha256:manifest",
        manifest: manifest(),
      };
    else if (path === "/api/investigation/records") {
      records = [
        {
          ...body.record,
          history: [],
          staleAssertionIds: [],
          savedAt: "2026-09-06",
        },
      ];
      value = {};
    } else throw new Error(`Unexpected path ${path}`);
    return { ok: true, json: async () => value } as Response;
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());
describe("Investigation workspace", () => {
  it("opens a saved answer above setup and moves keyboard focus to the result", async () => {
    const api = backend("completed");
    render(<InvestigationWorkspace />);
    const entry = await screen.findByRole("region", {
      name: "Comparison results",
    });
    expect(
      screen.getByRole("button", {
        name: "Find patterns across cases",
        hidden: true,
      }),
    ).not.toBeVisible();
    fireEvent.click(
      within(entry).getByRole("button", { name: "Read comparison" }),
    );
    const result = await screen.findByRole("region", {
      name: "Cross-case analysis",
    });
    expect(result).toHaveTextContent("A tentative appointment pattern.");
    expect(result).toHaveFocus();
    const setup = screen
      .getByText("Start a new comparison")
      .closest("details")!;
    expect(
      result.compareDocumentPosition(setup) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(api.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false,
    );
  });

  it("uses an unnamed discovery question and requires exact preview, approval, and explicit run", async () => {
    const api = backend();
    render(<InvestigationWorkspace />);
    fireEvent.click(await screen.findByText("Start a new comparison"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Find patterns across cases" }),
    );
    const preview = await screen.findByRole("region", {
      name: "Exact comparison transfer",
    });
    expect(preview).toHaveTextContent("gpt-6-astra");
    expect(preview).toHaveTextContent("tool_search");
    expect(preview).toHaveTextContent("EXACT OUTGOING CONTEXT");
    const request = api.mock.calls.find(
      ([path]) => path === "/api/investigation/preview",
    )!;
    expect(JSON.parse(String(request[1]?.body)).question).not.toContain("Firm");
    expect(
      screen.queryByRole("button", { name: "Run approved comparison" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Approve this comparison" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Run approved comparison" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Read comparison/ }),
    );
    const result = await screen.findByRole("region", {
      name: "Cross-case analysis",
    });
    expect(result).toHaveTextContent("Routine procurement.");
    expect(result).toHaveTextContent("Different firms.");
    fireEvent.click(within(result).getByText("Read sources for this summary"));
    expect(
      within(result).getAllByRole("link", { name: /Source passage/ })[0],
    ).toHaveAttribute("href", "#evidence/ev_one/extract_1/0");
    fireEvent.click(
      within(result).getByRole("button", { name: "Save pattern hypothesis" }),
    );
    await screen.findByText("Local record saved.");
    const saved = JSON.parse(
      String(
        api.mock.calls.find(
          ([path]) => path === "/api/investigation/records",
        )![1]?.body,
      ),
    ).record;
    expect(saved).toMatchObject({
      kind: "pattern",
      caseIds: ["case_a", "case_b"],
      supporting: ["assert_one"],
      citations: [citation],
      scopeFingerprint: context.fingerprint,
      invocationId: "inv_test",
    });
  });
  it("invalidates visible approval when the question changes and displays uncertain sourced time", async () => {
    backend();
    render(<InvestigationWorkspace />);
    expect(
      await screen.findByRole("region", { name: "Sourced timeline" }),
    ).toHaveTextContent("2024 (uncertain)");
    fireEvent.click(screen.getByText("Start a new comparison"));
    fireEvent.click(
      screen.getByRole("button", { name: "Find patterns across cases" }),
    );
    await screen.findByRole("button", { name: "Approve this comparison" });
    fireEvent.change(screen.getByLabelText("Cross-case question"), {
      target: { value: "Another question" },
    });
    expect(
      screen.queryByRole("button", { name: "Approve this comparison" }),
    ).not.toBeInTheDocument();
  });
  it("records manual responses and linked support locally without a sending action", async () => {
    const api = backend();
    render(<InvestigationWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", { name: "New local record" }),
    );
    fireEvent.change(screen.getByLabelText("Record kind"), {
      target: { value: "response" },
    });
    fireEvent.change(screen.getByLabelText("Record title"), {
      target: { value: "Agency response" },
    });
    fireEvent.change(screen.getByLabelText("Record text"), {
      target: { value: "Response received; source attached." },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Support: appointment/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save local record" }));
    await waitFor(() =>
      expect(
        api.mock.calls.some(([path]) => path === "/api/investigation/records"),
      ).toBe(true),
    );
    expect(
      screen.queryByRole("button", { name: /send/i }),
    ).not.toBeInTheDocument();
    const saved = JSON.parse(
      String(
        api.mock.calls.find(
          ([path]) => path === "/api/investigation/records",
        )![1]?.body,
      ),
    ).record;
    expect(saved.citations).toEqual([citation]);
    fireEvent.click(
      await screen.findByRole("button", { name: "Dismiss Agency response" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Reopen Agency response" }),
    );
    await screen.findByRole("button", { name: "Dismiss Agency response" });
    const writes = api.mock.calls
      .filter(([path]) => path === "/api/investigation/records")
      .map(([, init]) => JSON.parse(String(init?.body)).record);
    expect(writes.map((record) => record.status)).toEqual([
      "open",
      "dismissed",
      "open",
    ]);
    expect(new Set(writes.map((record) => record.recordId)).size).toBe(1);
  });
  it("reopens queued comparisons without submitting and explicitly selects scope", async () => {
    const api = backend("queued");
    render(<InvestigationWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Review saved comparison/ }),
    );
    await screen.findByRole("button", { name: "Run approved comparison" });
    expect(api.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /All available cases/ }),
    );
    const beta = await screen.findByRole("checkbox", { name: "Beta case" });
    fireEvent.click(beta);
    await waitFor(() =>
      expect(
        api.mock.calls.some(
          ([path]) => path === "/api/investigation?caseIds=case_a",
        ),
      ).toBe(true),
    );
    expect(
      screen.queryByRole("button", { name: "Run approved comparison" }),
    ).not.toBeInTheDocument();
  });
  it("marks corrected analysis stale and prevents saving it as current", async () => {
    backend("completed", true);
    render(<InvestigationWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Read comparison/ }),
    );
    const result = await screen.findByRole("region", {
      name: "Cross-case analysis",
    });
    expect(within(result).getByRole("alert")).toHaveTextContent(
      "Evidence changed—review before relying on this comparison",
    );
    expect(
      within(result).getByRole("button", { name: "Save pattern hypothesis" }),
    ).toBeDisabled();
    expect(
      within(result).getByRole("button", { name: "Edit cited local brief" }),
    ).toBeDisabled();
  });
  it("can dismiss stale records while removing corrected active links and preserving source dependencies", async () => {
    const api = backend(undefined, false, [
      {
        recordId: "record_stale",
        kind: "note",
        title: "Corrected note",
        body: "Preserved annotation",
        status: "open",
        caseIds: ["case_a"],
        supporting: ["assert_one"],
        contradicting: [],
        citations: [citation],
        staleAssertionIds: ["assert_one"],
        stale: true,
        history: [],
      },
    ]);
    render(<InvestigationWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Dismiss Corrected note" }),
    );
    await screen.findByRole("button", { name: "Reopen Corrected note" });
    const saved = JSON.parse(
      String(
        api.mock.calls.find(
          ([path]) => path === "/api/investigation/records",
        )![1]?.body,
      ),
    ).record;
    expect(saved).toMatchObject({
      supporting: [],
      citations: [citation],
      status: "dismissed",
      body: "Preserved annotation",
    });
  });
});
