/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EvidenceWorkspace } from "../src/evidence/EvidenceWorkspace.js";
import { evidenceWorkspaceDtoFromJson } from "../src/evidence/evidence-adapter.js";
import type {
  EvidenceAssertionCandidateDto
} from "../src/evidence/evidence-types.js";
import { workspaceDto } from "./fixtures/evidence.js";

describe("EvidenceWorkspace", () => {
  it("renders one canonical item with every duplicate occurrence and full review provenance", () => {
    renderWorkspace();

    const corpus = screen.getByRole("region", { name: "Evidence corpus" });
    expect(within(corpus).getAllByRole("button", { name: /Inspect evidence/ })).toHaveLength(2);
    expect(within(corpus).getByText(/2 occurrences/)).toBeInTheDocument();

    const detail = screen.getByRole("region", { name: "Evidence detail" });
    expect(detail).toHaveTextContent("sha256:1111111111111111111111111111111111111111111111111111111111111111");
    expect(detail).toHaveTextContent("External investigation archive");
    expect(detail).toHaveTextContent("imp_001");
    expect(detail).toHaveTextContent("contracts/a.txt");
    expect(detail).toHaveTextContent("duplicates/a-copy.txt");
    expect(detail).toHaveTextContent("local-text@0.1.0");
    expect(detail).toHaveTextContent("public_record");
    expect(detail).toHaveTextContent("prr_evidence_review_001");
  });

  it("filters by text, governance tag, and parse state", () => {
    renderWorkspace();

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter evidence" }), {
      target: { value: "restricted" }
    });
    expect(screen.getByRole("button", { name: "Inspect evidence ev_ing_blocked" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inspect evidence ev_ing_001" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter evidence" }), {
      target: { value: "" }
    });
    fireEvent.change(screen.getByLabelText("Governance tag"), { target: { value: "public_record" } });
    fireEvent.change(screen.getByLabelText("Parse state"), { target: { value: "succeeded" } });
    expect(screen.getByRole("button", { name: "Inspect evidence ev_ing_001" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inspect evidence ev_ing_blocked" })).not.toBeInTheDocument();
  });

  it("explains proposal blocks and prepares only review-required assertion candidates", async () => {
    const onPrepare = vi.fn(async (): Promise<EvidenceAssertionCandidateDto> => ({
      assertionId: "as_evidence_ui_001",
      evidenceReferences: [{
        evidenceId: "ev_ing_001",
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        eventIds: ["evt_ing_evidence_ingested", "evt_ing_evidence_linked"]
      }],
      predicate: "agency.name",
      confidence: 0.84,
      reviewState: "proposed",
      reviewRequired: true,
      eventId: "evt_assertion_proposed_ui_001"
    }));
    renderWorkspace(onPrepare);

    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence ev_ing_blocked" }));
    expect(screen.getByText("Quarantined evidence is excluded from ordinary assertion preparation.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Evidence detail" })).toHaveTextContent("workflow lock");
    expect(screen.getByRole("button", { name: "Prepare assertion candidate" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence ev_ing_001" }));
    fireEvent.change(screen.getByLabelText("Assertion ID"), { target: { value: "as_evidence_ui_001" } });
    fireEvent.change(screen.getByLabelText("Predicate"), { target: { value: "agency.name" } });
    fireEvent.change(screen.getByLabelText("Object"), { target: { value: "Example Agency" } });
    fireEvent.change(screen.getByLabelText("Confidence"), { target: { value: "0.84" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare assertion candidate" }));

    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith({
      assertionId: "as_evidence_ui_001",
      evidenceId: "ev_ing_001",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.84
    }));
    const result = await screen.findByRole("status", { name: "Assertion candidate prepared" });
    expect(result).toHaveTextContent("review required");
    expect(result).toHaveTextContent("ev_ing_001");
  });

  it("strictly parses immutable browser-safe DTOs", () => {
    const parsed = evidenceWorkspaceDtoFromJson(workspaceDto());

    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.items)).toBe(true);
    expect(() => evidenceWorkspaceDtoFromJson({ ...parsed, rawContent: "not browser safe" })).toThrow();
    expect(() => evidenceWorkspaceDtoFromJson({
      ...parsed,
      status: "degraded",
      diagnostics: [{
        code: "projection-error",
        severity: "error",
        message: "Authorization Bearer secret-value",
        repairActions: ["retry"]
      }]
    })).toThrow(/credential-shaped/i);
    expect(() => evidenceWorkspaceDtoFromJson({
      ...workspaceDto(),
      items: [{
        ...workspaceDto().items[0]!,
        source: { kind: "file", label: "ghp_abcdefghijklmnopqrstuvwxyz1234567890" }
      }]
    })).toThrow(/credential-shaped/i);
  });
});

function renderWorkspace(onPrepare = vi.fn()) {
  return render(
    <EvidenceWorkspace
      workspace={workspaceDto()}
      loadState="loaded"
      loadError={undefined}
      onRetry={() => undefined}
      onPrepareAssertionCandidate={onPrepare}
    />
  );
}
