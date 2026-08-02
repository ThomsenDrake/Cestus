/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import type { EvidenceWorkspaceAdapter } from "../src/evidence/evidence-adapter.js";
import { createStaticEvidenceWorkspaceAdapter } from "../src/evidence/evidence-adapter.js";
import { workspaceDto } from "./fixtures/evidence.js";

describe("evidence app integration", () => {
  it("loads the Evidence module from the runtime adapter instead of a fixture placeholder", async () => {
    const loadWorkspace = vi.fn(async () => workspaceDto());
    const adapter: EvidenceWorkspaceAdapter = {
      loadWorkspace,
      async prepareAssertionCandidate() {
        throw new Error("not exercised");
      }
    };
    render(<App evidenceAdapter={adapter} />);

    fireEvent.click(screen.getByRole("link", { name: "Evidence" }));

    expect(await screen.findByRole("heading", { name: "Evidence" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Evidence corpus" })).toBeInTheDocument();
    expect(loadWorkspace).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/placeholder evidence/i)).not.toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Evidence workspace" })).toBeInTheDocument();
  });

  it("renders a stable diagnostic and no fallback corpus when runtime loading fails", async () => {
    const adapter: EvidenceWorkspaceAdapter = {
      async loadWorkspace() {
        throw new Error("Authorization Bearer secret-value");
      },
      async prepareAssertionCandidate() {
        throw new Error("not exercised");
      }
    };
    render(<App evidenceAdapter={adapter} />);

    fireEvent.click(screen.getByRole("link", { name: "Evidence" }));

    expect(await screen.findByRole("region", { name: "Evidence load error" })).toHaveTextContent(
      "Evidence workspace could not be loaded safely."
    );
    expect(document.body).not.toHaveTextContent("secret-value");
    expect(screen.queryByRole("region", { name: "Evidence corpus" })).not.toBeInTheDocument();
  });

  it("reloads the runtime-backed workspace after preparing a proposal", async () => {
    const base = workspaceDto();
    const candidate = {
      assertionId: "as_evidence_app_001",
      evidenceReferences: [{
        evidenceId: "ev_ing_001",
        contentHash: base.items[0]!.contentHash!,
        eventIds: ["evt_ing_evidence_ingested"]
      }],
      predicate: "agency.name",
      confidence: 0.81,
      reviewState: "proposed" as const,
      reviewRequired: true as const,
      eventId: "evt_assertion_proposed_app_001"
    };
    const prepareAssertionCandidate = vi.fn(async () => ({
      candidate,
      workspace: { ...base, assertionCandidates: [candidate] }
    }));
    const adapter: EvidenceWorkspaceAdapter = {
      async loadWorkspace() {
        return base;
      },
      prepareAssertionCandidate
    };
    render(<App evidenceAdapter={adapter} />);
    fireEvent.click(screen.getByRole("link", { name: "Evidence" }));
    await screen.findByRole("region", { name: "Evidence corpus" });

    fireEvent.change(screen.getByLabelText("Assertion ID"), { target: { value: "as_evidence_app_001" } });
    fireEvent.change(screen.getByLabelText("Predicate"), { target: { value: "agency.name" } });
    fireEvent.change(screen.getByLabelText("Object"), { target: { value: "Example Agency" } });
    fireEvent.change(screen.getByLabelText("Confidence"), { target: { value: "0.81" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare assertion candidate" }));

    await waitFor(() => expect(prepareAssertionCandidate).toHaveBeenCalled());
    expect(await screen.findByText("as_evidence_app_001")).toBeInTheDocument();
    expect(screen.getAllByText(/review required/i).length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent("accepted assertion");
  });

  it("supports an immutable static adapter for focused rendering", async () => {
    render(<App evidenceAdapter={createStaticEvidenceWorkspaceAdapter(workspaceDto())} />);
    fireEvent.click(screen.getByRole("link", { name: "Evidence" }));
    expect(await screen.findByRole("heading", { name: "Evidence" })).toBeInTheDocument();
  });
});
