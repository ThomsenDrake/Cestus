/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import type { EvidenceWorkspaceAdapter } from "../src/evidence/evidence-adapter.js";
import {
  createHttpEvidenceWorkspaceAdapter,
  createStaticEvidenceWorkspaceAdapter
} from "../src/evidence/evidence-adapter.js";
import { workspaceDto } from "./fixtures/evidence.js";

describe("evidence app integration", () => {
  it("loads the Evidence module from the runtime adapter instead of a fixture placeholder", async () => {
    const loadWorkspace = vi.fn(async () => workspaceDto());
    const adapter: EvidenceWorkspaceAdapter = {
      loadWorkspace,
      async prepareAssertionCandidate() {
        throw new Error("not exercised");
      },
      async appendGovernanceReview() {
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
      },
      async appendGovernanceReview() {
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
      prepareAssertionCandidate,
      async appendGovernanceReview() {
        throw new Error("not exercised");
      }
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
  });

  it("supports an immutable static adapter for focused rendering", async () => {
    render(<App evidenceAdapter={createStaticEvidenceWorkspaceAdapter(workspaceDto())} />);
    fireEvent.click(screen.getByRole("link", { name: "Evidence" }));
    expect(await screen.findByRole("heading", { name: "Evidence" })).toBeInTheDocument();
  });

  it("composes governance review and preview and refreshes after append", async () => {
    const base = workspaceDto();
    const refreshed = structuredClone(base) as unknown as {
      governance: {
        reviews: Array<Record<string, unknown>>;
        exportPreview: {
          includedEvidence: Array<Record<string, unknown>>;
          excludedEvidence: Array<Record<string, unknown>>;
        };
      };
    };
    refreshed.governance.reviews[0]!.humanDecisions = [{
      tag: "public_safe",
      action: "add",
      rationale: "Human review confirmed preview eligibility.",
      eventRef: "evt_review_governance_public_safe"
    }];
    const publicExclusion = refreshed.governance.exportPreview.excludedEvidence.shift()!;
    refreshed.governance.exportPreview.includedEvidence = [{
      evidenceRef: "ev_ing_001",
      governanceEventRefs: [
        ...(publicExclusion.governanceEventRefs as string[]),
        "evt_review_governance_public_safe"
      ]
    }];
    const appendGovernanceReview = vi.fn(async () => ({ workspace: refreshed }));
    const adapter = {
      async loadWorkspace() {
        return base;
      },
      async prepareAssertionCandidate() {
        throw new Error("not exercised");
      },
      appendGovernanceReview
    } as unknown as EvidenceWorkspaceAdapter;
    render(<App evidenceAdapter={adapter} />);
    fireEvent.click(screen.getByRole("link", { name: "Evidence" }));

    expect(await screen.findByRole("region", { name: "Governance review" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Governance export preview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /export|publish|opt.?in|quarantine|release/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Review tag"), { target: { value: "public_safe" } });
    fireEvent.change(screen.getByLabelText("Review action"), { target: { value: "add" } });
    fireEvent.change(screen.getByLabelText("Review rationale"), {
      target: { value: "Human review confirmed preview eligibility." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Append governance review" }));

    await waitFor(() => expect(appendGovernanceReview).toHaveBeenCalledWith({
      evidenceRef: "ev_ing_001",
      tag: "public_safe",
      action: "add",
      rationale: "Human review confirmed preview eligibility."
    }));
    expect(await screen.findByRole("region", { name: "Included by default" })).toHaveTextContent("ev_ing_001");
  });

  it("posts governance review through the strict HTTP evidence adapter", async () => {
    const workspace = workspaceDto();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, workspace }), { status: 201 }));
    const adapter = createHttpEvidenceWorkspaceAdapter({ fetcher });
    const appendGovernanceReview = (adapter as unknown as {
      appendGovernanceReview(input: Record<string, unknown>): Promise<{ workspace: unknown }>;
    }).appendGovernanceReview;

    expect(appendGovernanceReview).toBeTypeOf("function");
    const result = await appendGovernanceReview.call(adapter, {
      evidenceRef: "ev_ing_001",
      tag: "public_safe",
      action: "add",
      rationale: "Human review confirmed preview eligibility."
    });
    expect(fetcher).toHaveBeenCalledWith("/api/evidence/governance-reviews", expect.objectContaining({
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" }
    }));
    expect(result.workspace).toMatchObject({ governance: { schemaVersion: "evidence-governance-workspace.v1" } });
    expect(Object.isFrozen(result.workspace)).toBe(true);
  });

  it("rejects credential-shaped governance review input before invoking fetch", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 500 }));
    const adapter = createHttpEvidenceWorkspaceAdapter({ fetcher });
    const unsafeInputs = [
      {
        evidenceRef: "ev_ing_001",
        tag: "public_safe" as const,
        action: "add" as const,
        rationale: "Authorization: Bearer runtime-secret-value"
      },
      {
        evidenceRef: "ev_ghp_abcdefghijklmnopqrstuvwxyz1234567890",
        tag: "public_safe" as const,
        action: "add" as const,
        rationale: "Human review confirmed preview eligibility."
      },
      {
        evidenceRef: "ev_ing_001",
        tag: "public_safe" as const,
        action: "supersede" as const,
        rationale: "Human review supersedes prior handling.",
        supersedesEventRef: "evt_AKIA1234567890ABCDEF"
      }
    ];

    for (const input of unsafeInputs) {
      await expect(adapter.appendGovernanceReview(input)).rejects.toThrow(
        "Governance review input could not be prepared safely."
      );
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
