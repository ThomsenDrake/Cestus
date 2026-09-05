/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { displayValue, type ReviewProposal } from "../src/ontology/shared-ontology-adapter.js";
import { SharedOntologyWorkspace } from "../src/ontology/SharedOntologyWorkspace.js";

const workspace = { workspaceId: "ws_test", revision: 0, selectedCaseId: null, cases: [], entities: [], proposals: [], schemas: [], memberships: [], hypotheses: [], bindings: [], lineage: [], bindingHistory: [], relationships: [], occurrences: [] };
afterEach(() => vi.unstubAllGlobals());
describe("shared ontology browser curation", () => {
  it("loads without a provider and creates an investigation with the displayed revision", async () => {
    const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/evidence/workspace") return { ok: true, json: async () => ({ items: [] }) } as Response;
      return { ok: true, json: async () => workspace } as Response;
    });
    vi.stubGlobal("fetch", fetcher);
    render(<SharedOntologyWorkspace />);
    await screen.findByRole("button", { name: "Show all knowledge" });
    fireEvent.click(screen.getByText("Create an investigation"));
    const form = await screen.findByRole("form", { name: "Create investigation" });
    fireEvent.change(within(form).getByLabelText("Investigation title"), { target: { value: "Synthetic procurement" } });
    fireEvent.change(within(form).getByLabelText("Investigation question"), { target: { value: "Who received the award?" } });
    fireEvent.change(within(form).getByLabelText("Investigation scope"), { target: { value: "Fictional 2026 procurement" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create investigation" }));
    await waitFor(() => expect(fetcher.mock.calls.some(([path, init]) => path === "/api/ontology/commands" && init?.method === "POST")).toBe(true));
    const call = fetcher.mock.calls.find(([path, init]) => path === "/api/ontology/commands" && init?.method === "POST")!;
    const command = JSON.parse(call[1]!.body as string);
    expect(command.expectedRevision).toBe(0);
    expect(command.decisionId).toBeTruthy();
    expect(JSON.stringify(command)).not.toContain("actorId");
    expect(fetcher.mock.calls.some(([path]) => path.includes("document-processing"))).toBe(false);
  });
});

const hash = `sha256:${"a".repeat(64)}`;
const citation = { workspaceId: "ws_test", evidenceId: "ev_source", sourceContentHash: hash, extractionId: "extract_test", extractionContentHash: hash, locator: { kind: "text" as const, block: 1, start: 0, end: 24 }, provenanceEventIds: ["evt_source"], quote: "Alex Reed was paid 1200.", passageIndex: 0 };
const proposal = { assertionId: "as_alex", workspaceId: "ws_test", schemaId: "investigation.v1", kind: "entity", predicate: "name", value: { type: "string", value: "Alex Reed" }, mentionId: "mention_alex", entityType: "person", evidence: [citation], provenance: { kind: "manual" }, proposalEventId: "evt_proposal", reviewState: "proposed", history: [] };

describe("source grounded review controls", () => {
  it("preserves canonical citations and the actual manually entered value without accepting itself", async () => {
    const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
      const value = path === "/api/evidence/workspace" ? { items: [{ evidenceId: "ev_source", occurrences: [{ sourcePath: "synthetic.txt" }] }] } : path.endsWith("/content") ? { item: { evidenceId: "ev_source" }, citations: [citation], extraction: { format: "text", passages: [{ locator: citation.locator, text: citation.quote }] } } : workspace;
      return { ok: true, json: async () => value } as Response;
    });
    vi.stubGlobal("fetch", fetcher); render(<SharedOntologyWorkspace />);
    fireEvent.change(await screen.findByLabelText("Supporting source"), { target: { value: "ev_source" } });
    fireEvent.click(await screen.findByRole("button", { name: "Add supporting passage" }));
    fireEvent.change(screen.getByLabelText("Proposed value"), { target: { value: "Alex Reed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save unreviewed proposal" }));
    await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const command = JSON.parse(fetcher.mock.calls.find(([, init]) => init?.method === "POST")![1]!.body as string);
    expect(command.action).toBe("propose");
    expect(command.proposals[0].value).toEqual({ type: "string", value: "Alex Reed" });
    expect(command.proposals[0].evidence).toEqual([citation]);
    expect(command.proposals[0].provenance).toEqual({ kind: "manual" });
    expect(command.proposals[0].reviewState).toBeUndefined();
  });

  it("keeps rejected stale review visible and retries with the same decision identity and revision", async () => {
    const fetcher = vi.fn(async (_path: string, init?: RequestInit) => ({ ok: init?.method !== "POST", json: async () => init?.method === "POST" ? { ok: false, message: "Review is stale. Refresh before reviewing again." } : _path === "/api/evidence/workspace" ? { items: [] } : { ...workspace, revision: 12, proposals: [proposal] } }) as Response);
    vi.stubGlobal("fetch", fetcher); render(<SharedOntologyWorkspace />);
    const article = await screen.findByRole("article", { name: "Proposal as_alex" });
    expect(within(article).getByText("entity · name: Alex Reed")).toBeInTheDocument();
    expect(within(article).getByText(citation.quote)).toBeInTheDocument();
    expect(within(article).getByRole("button", { name: "Accept" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Decision rationale"), { target: { value: "Confirmed against the source" } });
    fireEvent.click(within(article).getByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Review is stale");
    fireEvent.click(screen.getByRole("button", { name: "Retry exact decision" }));
    await waitFor(() => expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2));
    const commands = fetcher.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(init!.body as string));
    expect(commands[0]).toEqual(commands[1]); expect(commands[0].expectedRevision).toBe(12);
    expect(commands[0].reviews[0].proposalEventId).toBe("evt_proposal");
  });

  it("offers same-name candidates for explicit repair without silently changing the binding", async () => {
    const accepted = { ...proposal, reviewState: "accepted" };
    const entity = (id: string) => ({ entityId: id, canonicalLabel: "Alex Reed", entityType: "person", assertionIds: id === "ent_a" ? ["as_alex"] : [], caseIds: [], evidenceIds: ["ev_source"], independentSourceCount: 0, sourceIndependence: "uncertain" });
    const fetcher = vi.fn(async (path: string, _init?: RequestInit) => ({ ok: true, json: async () => path === "/api/evidence/workspace" ? { items: [] } : { ...workspace, proposals: [accepted], entities: [entity("ent_a"), entity("ent_b")], bindings: [{ mentionId: "mention_alex", entityId: "ent_a", assertionId: "as_alex" }] } }) as Response);
    vi.stubGlobal("fetch", fetcher); render(<SharedOntologyWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: "Sources and history as_alex" }));
    expect(await screen.findByRole("region", { name: "Possible identity matches" })).toHaveTextContent("Similar name only; identity is unverified");
    expect(screen.getByLabelText("Verified entity identity")).toHaveValue("");
    expect(fetcher.mock.calls.every(call => call.length === 1 || !(call[1] as RequestInit)?.method)).toBe(true);
  });
  it("creates a manual occurrence with several participants, typed attributes, and honest partial dates", async () => {
    const fetcher = vi.fn(async (path: string, _init?: RequestInit) => ({ ok: true, json: async () => path === "/api/evidence/workspace" ? { items: [{ evidenceId: "ev_source", occurrences: [{ sourcePath: "synthetic.txt" }] }] } : path.endsWith("/content") ? { item: { evidenceId: "ev_source" }, citations: [citation], extraction: { format: "text", passages: [{ locator: citation.locator, text: citation.quote }] } } : { ...workspace, proposals: [proposal] } }) as Response);
    vi.stubGlobal("fetch", fetcher); render(<SharedOntologyWorkspace />);
    fireEvent.change(await screen.findByLabelText("Supporting source"), { target: { value: "ev_source" } });
    fireEvent.click(await screen.findByRole("button", { name: "Add supporting passage" }));
    fireEvent.change(screen.getByLabelText("Knowledge kind"), { target: { value: "occurrence" } });
    fireEvent.change(screen.getByLabelText("Proposed value"), { target: { value: "paid" } });
    fireEvent.change(screen.getByLabelText("Occurrence participant 1"), { target: { value: "mention_alex" } });
    fireEvent.change(screen.getByLabelText("Participant role 1"), { target: { value: "recipient" } });
    fireEvent.click(screen.getByRole("button", { name: "Add occurrence participant" }));
    fireEvent.change(screen.getByLabelText("Occurrence participant 2"), { target: { value: "mention_alex" } });
    fireEvent.change(screen.getByLabelText("Participant role 2"), { target: { value: "witness" } });
    fireEvent.click(screen.getByRole("button", { name: "Add occurrence attribute" }));
    fireEvent.change(screen.getByLabelText("Occurrence attribute 1"), { target: { value: "amount" } });
    fireEvent.change(screen.getByLabelText("Occurrence attribute value 1"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("Occurrence date or interval start"), { target: { value: "2026-09" } });
    fireEvent.click(screen.getByLabelText("Occurrence time is uncertain"));
    fireEvent.click(screen.getByRole("button", { name: "Save unreviewed proposal" }));
    await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const command = JSON.parse(fetcher.mock.calls.find(([, init]) => init?.method === "POST")![1]!.body as string);
    expect(command.proposals[0].participants).toEqual([{ role: "recipient", mentionId: "mention_alex" }, { role: "witness", mentionId: "mention_alex" }]);
    expect(command.proposals[0].attributes).toEqual([{ predicate: "amount", value: { type: "number", value: 1200 } }]);
    expect(command.proposals[0].occurredTime).toEqual({ start: "2026-09", uncertain: true });
    expect(command.proposals[0].publicationTime).toBeUndefined();
  });

});

it("shows entity-only case memberships with current names and all participant knowledge", async () => {
  const old = { ...proposal, reviewState: "superseded" };
  const corrected = { ...proposal, assertionId: "as_corrected", value: { type: "string", value: "Alex Vale" }, reviewState: "accepted" };
  const incoming = { ...proposal, assertionId: "as_incoming", kind: "relationship", predicate: "paid", mentionId: undefined, value: { type: "entity", mentionId: "mention_alex" }, objectEntityId: "ent_alex", reviewState: "accepted" };
  const occurrence = { ...proposal, assertionId: "as_occurrence", kind: "occurrence", predicate: "payment", mentionId: undefined, occurrenceId: "occ_payment", value: { type: "string", value: "paid" }, participants: [{ role: "recipient", mentionId: "mention_alex" }], reviewState: "accepted" };
  const current = { ...workspace, bindings: [{ mentionId: "mention_alex", entityId: "ent_alex" }], selectedCaseId: "case_entity", cases: [{ caseId: "case_entity", title: "Entity-only case", question: "Who?", scope: "Synthetic" }], memberships: [{ caseId: "case_entity", targetKind: "entity", targetId: "ent_alex", included: true }], proposals: [old, corrected, incoming, occurrence], entities: [{ entityId: "ent_alex", canonicalLabel: "Alex Vale", entityType: "person", assertionIds: ["as_corrected", "as_incoming", "as_occurrence"], caseIds: ["case_entity"], evidenceIds: ["ev_source"], independentSourceCount: 0, sourceIndependence: "uncertain" }], relationships: [{ assertionIds: ["as_incoming"] }], occurrences: [{ occurrenceId: "occ_payment", assertionIds: ["as_occurrence"], participants: [{ entityId: "ent_alex" }] }] };
  vi.stubGlobal("fetch", vi.fn(async (path: string) => ({ ok: true, json: async () => path === "/api/evidence/workspace" ? { items: [] } : current })));
  render(<SharedOntologyWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: "Alex Vale · person" }));
  expect(screen.getByRole("article", { name: "Proposal as_corrected" })).toHaveTextContent("name: Alex Vale");
  expect(screen.getByRole("article", { name: "Proposal as_incoming" })).toHaveTextContent("paid: Alex Vale");
  expect(screen.getByRole("article", { name: "Proposal as_occurrence" })).toHaveTextContent("recipient: Alex Vale");
});

it("resolves a mention from current entity support when proposals are reviewed out of creation order", () => {
  const earlier = { ...proposal, assertionId: "as_first", reviewState: "accepted", value: { type: "string", value: "Acme Incorporated" } } as ReviewProposal;
  const later = { ...earlier, assertionId: "as_later", value: { type: "string", value: "Acme LLC" } } as ReviewProposal;
  expect(displayValue({ type: "entity", mentionId: "mention_alex" }, [earlier, later], [{ entityId: "ent_first", canonicalLabel: "Acme Incorporated", entityType: "organization", assertionIds: ["as_first"], caseIds: [], evidenceIds: [], independentSourceCount: 0, sourceIndependence: "uncertain" }], [{ mentionId: "mention_alex", entityId: "ent_first" }])).toBe("Acme Incorporated");
});

it("uses explicit identity bindings when dossier support overlaps", () => {
  const beta = { ...proposal, assertionId: "as_beta", mentionId: "m_beta", reviewState: "accepted", value: { type: "string", value: "Beta" } } as ReviewProposal;
  const entity = (id: string, name: string) => ({ entityId: id, canonicalLabel: name, entityType: "organization", assertionIds: ["as_beta"], caseIds: [], evidenceIds: [], independentSourceCount: 0, sourceIndependence: "uncertain" as const });
  expect(displayValue({ type: "entity", mentionId: "m_beta" }, [beta], [entity("ent_acme", "Acme"), entity("ent_beta", "Beta")], [{ mentionId: "m_beta", entityId: "ent_beta" }])).toBe("Beta");
});
