/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import {
  createStaticOntologyWorkspaceAdapter,
  ontologyWorkspaceDtoFromJson
} from "../src/ontology/ontology-adapter.js";
import type { OntologyWorkspaceDto } from "../src/ontology/ontology-types.js";

describe("ontology workspace", () => {
  it("opens Ontology as a runtime-derived first-class workspace with keyboard-selectable provenance", async () => {
    const adapter = createStaticOntologyWorkspaceAdapter(ontologyWorkspace());
    render(<App ontologyAdapter={adapter} />);

    fireEvent.click(screen.getByRole("link", { name: "Ontology" }));

    expect(screen.getByRole("main", { name: "Ontology workspace" })).toBeInTheDocument();
    const workspace = await screen.findByRole("region", { name: "Ontology provenance workspace" });
    const acceptedGraph = within(workspace).getByRole("region", { name: "Accepted ontology graph" });
    const reviewMaterial = within(workspace).getByRole("region", { name: "Ontology review material" });
    const relationshipButton = within(acceptedGraph).getByRole("button", {
      name: "Inspect relationship rel_agency_signed_contract"
    });

    relationshipButton.focus();
    expect(relationshipButton).toHaveFocus();
    fireEvent.click(relationshipButton);
    expect(relationshipButton).toHaveAttribute("aria-pressed", "true");
    expect(within(acceptedGraph).queryByText("as_contract_dispute")).not.toBeInTheDocument();
    expect(within(reviewMaterial).getByText("as_contract_dispute")).toBeInTheDocument();
    expect(within(reviewMaterial).getByText("proposed")).toBeInTheDocument();

    const detail = within(workspace).getByRole("region", { name: "Relationship provenance" });
    expect(within(detail).getByText("rel_agency_signed_contract")).toBeInTheDocument();
    expect(within(detail).getByText("as_contract_party · accepted")).toBeInTheDocument();
    expect(within(detail).getByText("as_contract_dispute · proposed")).toBeInTheDocument();
    expect(within(detail).getByText("ev_contract_pdf")).toBeInTheDocument();
    expect(within(detail).getByText(/evt_accept_agency_contract_relationship/)).toBeInTheDocument();
    expect(within(detail).getByText(/public-records@1\.2\.0/)).toBeInTheDocument();
  });

  it("renders fail-closed diagnostics with a retry repair action", async () => {
    let loadCount = 0;
    const adapter = {
      async loadWorkspace() {
        loadCount += 1;
        return ontologyWorkspace({
          status: "degraded",
          entities: [],
          relationships: [],
          assertions: [],
          diagnostics: [{
            code: "projection-lag",
            severity: "error",
            message: "The ontology projection is not caught up to its source ledger.",
            repairActions: ["rebuild the ontology projection from the ledger"]
          }]
        });
      }
    };
    render(<App ontologyAdapter={adapter} />);

    fireEvent.click(screen.getByRole("link", { name: "Ontology" }));
    const diagnostics = await screen.findByRole("region", { name: "Ontology diagnostics" });
    const commandBand = screen.getByRole("banner", { name: "Cestus command band" });

    expect(within(diagnostics).getByText("projection-lag")).toBeInTheDocument();
    expect(within(diagnostics).getByText(/rebuild the ontology projection/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /inspect relationship/i })).not.toBeInTheDocument();
    expect(within(commandBand).queryByText("Ledger synced")).not.toBeInTheDocument();
    expect(within(commandBand).queryByText("Local sync live")).not.toBeInTheDocument();
    expect(within(commandBand).getByText("Projection degraded")).toBeInTheDocument();
    expect(within(commandBand).getByText("Repair required")).toBeInTheDocument();
    fireEvent.click(within(diagnostics).getByRole("button", { name: "Retry ontology replay" }));
    await waitFor(() => expect(loadCount).toBe(2));
  });

  it("never claims synced or live while the ontology replay is loading or unavailable", async () => {
    const neverResolves = new Promise<OntologyWorkspaceDto>(() => undefined);
    const loading = render(<App ontologyAdapter={{ loadWorkspace: () => neverResolves }} />);

    fireEvent.click(screen.getByRole("link", { name: "Ontology" }));
    await screen.findByRole("region", { name: "Ontology loading state" });
    let commandBand = screen.getByRole("banner", { name: "Cestus command band" });
    expect(within(commandBand).queryByText("Ledger synced")).not.toBeInTheDocument();
    expect(within(commandBand).queryByText("Local sync live")).not.toBeInTheDocument();
    expect(within(commandBand).getByText("Replay pending")).toBeInTheDocument();
    expect(within(commandBand).getByText("Replay loading")).toBeInTheDocument();

    loading.unmount();
    render(<App ontologyAdapter={{ async loadWorkspace() { throw new Error("offline"); } }} />);
    fireEvent.click(screen.getByRole("link", { name: "Ontology" }));
    await screen.findByRole("region", { name: "Ontology load error" });
    commandBand = screen.getByRole("banner", { name: "Cestus command band" });
    expect(within(commandBand).queryByText("Ledger synced")).not.toBeInTheDocument();
    expect(within(commandBand).queryByText("Local sync live")).not.toBeInTheDocument();
    expect(within(commandBand).getByText("Ledger unavailable")).toBeInTheDocument();
    expect(within(commandBand).getByText("Retry required")).toBeInTheDocument();
  });

  it("renders keyboard-selectable accepted entities when no relationship exists", async () => {
    const base = ontologyWorkspace();
    const entity = base.entities[0];
    if (entity === undefined) {
      throw new Error("ontology fixture requires an accepted entity");
    }
    const adapter = createStaticOntologyWorkspaceAdapter(ontologyWorkspace({
      entities: [entity],
      relationships: [],
      assertions: [
        {
          assertionId: "as_agency_name",
          reviewState: "accepted",
          predicate: "agency.name",
          confidence: 0.94,
          evidenceId: "ev_agency_pdf",
          eventIds: ["evt_ingest_agency_pdf", "evt_propose_agency_name", "evt_accept_agency_name"],
          packVersions: [{ name: "core", version: "0.1.0" }]
        },
        {
          assertionId: "as_agency_alias",
          reviewState: "proposed",
          subjectRef: "ent_example_agency",
          predicate: "agency.alias",
          confidence: 0.7,
          evidenceId: "ev_agency_pdf",
          eventIds: ["evt_ingest_agency_pdf", "evt_propose_agency_alias"],
          packVersions: [{ name: "core", version: "0.1.0" }]
        }
      ]
    }));
    render(<App ontologyAdapter={adapter} />);

    fireEvent.click(screen.getByRole("link", { name: "Ontology" }));
    const workspace = await screen.findByRole("region", { name: "Ontology provenance workspace" });
    const acceptedGraph = within(workspace).getByRole("region", { name: "Accepted ontology graph" });
    const entityButton = within(acceptedGraph).getByRole("button", {
      name: "Inspect entity ent_example_agency"
    });

    entityButton.focus();
    expect(entityButton).toHaveFocus();
    fireEvent.click(entityButton);
    expect(entityButton).toHaveAttribute("aria-pressed", "true");
    expect(within(acceptedGraph).queryByText("as_agency_alias")).not.toBeInTheDocument();
    const detail = within(workspace).getByRole("region", { name: "Entity provenance" });
    expect(within(detail).getByText("ent_example_agency")).toBeInTheDocument();
    expect(within(detail).getByText("Example Agency")).toBeInTheDocument();
    expect(within(detail).getByText("GovernmentAgency")).toBeInTheDocument();
    expect(within(detail).getByText(/as_agency_name/)).toBeInTheDocument();
    expect(within(detail).getByText("ev_agency_pdf")).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Ontology review material" }))
      .toHaveTextContent("as_agency_alias");
  });

  it("strictly parses immutable browser-safe DTOs", () => {
    const parsed = ontologyWorkspaceDtoFromJson(ontologyWorkspace());

    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.relationships)).toBe(true);
    expect(() => ontologyWorkspaceDtoFromJson({ ...parsed, rawLedgerRow: "not browser safe" })).toThrow();
    expect(() => ontologyWorkspaceDtoFromJson({
      ...parsed,
      status: "degraded",
      diagnostics: [{
        code: "ledger-unavailable",
        severity: "error",
        message: "Authorization Bearer secret-value",
        repairActions: ["retry"]
      }]
    })).toThrow(/credential-shaped/i);
  });
});

function ontologyWorkspace(overrides: Partial<OntologyWorkspaceDto> = {}): OntologyWorkspaceDto {
  return {
    schemaVersion: "ontology-workspace.v1",
    status: "ready",
    sourceHighWaterMark: 10,
    entities: [
      {
        entityId: "ent_example_agency",
        canonicalLabel: "Example Agency",
        entityType: "GovernmentAgency",
        reviewState: "accepted",
        supportingAssertionIds: ["as_agency_name"],
        evidenceIds: ["ev_agency_pdf"],
        eventIds: ["evt_ingest_agency_pdf", "evt_propose_agency_name", "evt_accept_agency_name", "evt_resolve_example_agency"],
        packVersions: [{ name: "core", version: "0.1.0" }]
      },
      {
        entityId: "ent_example_contract",
        canonicalLabel: "Example Contract",
        entityType: "Contract",
        reviewState: "accepted",
        supportingAssertionIds: ["as_contract_party"],
        evidenceIds: ["ev_contract_pdf"],
        eventIds: ["evt_ingest_contract_pdf", "evt_propose_contract_party", "evt_accept_contract_party", "evt_resolve_example_contract"],
        packVersions: [{ name: "core", version: "0.1.0" }, { name: "public-records", version: "1.2.0" }]
      }
    ],
    relationships: [{
      relationshipId: "rel_agency_signed_contract",
      fromEntityId: "ent_example_agency",
      toEntityId: "ent_example_contract",
      relationshipType: "signed",
      reviewState: "accepted",
      supportingAssertionIds: ["as_contract_party"],
      contradictingAssertionIds: ["as_contract_dispute"],
      evidenceIds: ["ev_contract_pdf"],
      eventIds: [
        "evt_accept_agency_contract_relationship",
        "evt_accept_contract_party",
        "evt_ingest_contract_pdf",
        "evt_propose_contract_dispute",
        "evt_propose_contract_party"
      ],
      packVersions: [{ name: "core", version: "0.1.0" }, { name: "public-records", version: "1.2.0" }]
    }],
    assertions: [
      {
        assertionId: "as_contract_party",
        reviewState: "accepted",
        subjectRef: "rel_agency_signed_contract",
        predicate: "supports",
        confidence: 0.92,
        evidenceId: "ev_contract_pdf",
        eventIds: ["evt_ingest_contract_pdf", "evt_propose_contract_party", "evt_accept_contract_party"],
        packVersions: [{ name: "core", version: "0.1.0" }, { name: "public-records", version: "1.2.0" }]
      },
      {
        assertionId: "as_contract_dispute",
        reviewState: "proposed",
        subjectRef: "rel_agency_signed_contract",
        predicate: "contradicts",
        confidence: 0.61,
        evidenceId: "ev_contract_pdf",
        eventIds: ["evt_ingest_contract_pdf", "evt_propose_contract_dispute"],
        packVersions: [{ name: "core", version: "0.1.0" }, { name: "public-records", version: "1.2.0" }]
      }
    ],
    diagnostics: [],
    ...overrides
  };
}
