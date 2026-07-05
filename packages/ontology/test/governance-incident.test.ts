import { describe, expect, it } from "vitest";
import { buildGovernanceProjection } from "../src/governance-projection.js";
import { type AppendableKnowledgeEvent, type KnowledgeEvent } from "../src/contracts.js";
import { type AppendOptions, type EventLedger, InMemoryEventLedger } from "../src/event-ledger.js";
import { GovernanceService } from "../src/governance-service.js";
import { goldenGovernanceLedgerEvents } from "./fixtures/golden-governance-ledger.js";

const humanActor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };
const extractorActor = { id: "actor_classifier", kind: "extractor" as const, label: "Governance classifier" };

class RecordingLedger implements EventLedger {
  private readonly ledger = new InMemoryEventLedger();
  readonly appendOptions: AppendOptions[] = [];

  async append(event: AppendableKnowledgeEvent, options: AppendOptions = {}): Promise<KnowledgeEvent> {
    this.appendOptions.push(options);
    return this.ledger.append(event, options);
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return this.ledger.readStream(streamId);
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return this.ledger.readAll();
  }
}

async function recordSafeIncident(ledger: EventLedger) {
  const service = new GovernanceService({ ledger, actor: humanActor });
  return service.recordIncident({
    incidentId: "incident_export_blocked",
    severity: "warning",
    category: "export",
    recordedBy: "actor_investigator",
    summary: "Public export blocked until restricted evidence is reviewed.",
    relatedEvidenceIds: ["ev_source_private"],
    relatedEventIds: ["evt_quarantine_governance_private"]
  });
}

describe("governance incidents and repairs", () => {
  it("projects open incidents", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    expect(projection.openIncidentIds()).toEqual(["incident_export_blocked"]);
  });

  it("closes incidents through append-only repair events", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    const repaired = projection.incidents.get("incident_repaired_secret");

    expect(repaired?.status).toBe("closed");
    expect(repaired?.repairEventIds).toEqual(["evt_incident_secret_repair"]);
  });

  it("ignores duplicate incident records without clearing repairs or reopening", () => {
    const projection = buildGovernanceProjection([
      ...goldenGovernanceLedgerEvents,
      {
        id: "evt_incident_secret_duplicate_record",
        type: "incident.recorded",
        version: 1,
        streamId: "incident_incident_repaired_secret",
        sequence: 3,
        context: {
          actor: humanActor,
          occurredAt: "2026-07-05T15:30:00.000Z",
          causationId: "evt_incident_secret_repair",
          correlationId: "corr_golden_governance",
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0" }
        },
        payload: {
          incidentId: "incident_repaired_secret",
          severity: "critical",
          category: "secret-leak",
          recordedBy: "actor_investigator",
          summary: "Duplicate imported incident record should not replace the original.",
          relatedEvidenceIds: ["ev_source_private"],
          relatedEventIds: ["evt_incident_secret_repair"]
        }
      } satisfies KnowledgeEvent
    ]);
    const repaired = projection.incidents.get("incident_repaired_secret");

    expect(repaired).toMatchObject({
      status: "closed",
      incidentEventId: "evt_incident_secret_recorded",
      summary: "Sensitive diagnostic was isolated with safe references only."
    });
    expect(repaired?.repairEventIds).toEqual(["evt_incident_secret_repair"]);
    expect(projection.openIncidentIds()).toEqual(["incident_export_blocked"]);
  });

  it("keeps incident summaries secret-safe", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    expect([...projection.incidents.values()].every((incident) => !/token|password|secret/i.test(incident.summary))).toBe(true);
  });

  it("records incidents with safe summary and related references", async () => {
    const ledger = new RecordingLedger();
    const event = await recordSafeIncident(ledger);

    expect(event.type).toBe("incident.recorded");
    expect(event.streamId).toBe("incident_incident_export_blocked");
    expect(event.sequence).toBe(1);
    expect(event.context.actor).toEqual(humanActor);
    expect(event.payload).toMatchObject({
      incidentId: "incident_export_blocked",
      severity: "warning",
      category: "export",
      recordedBy: "actor_investigator",
      summary: "Public export blocked until restricted evidence is reviewed.",
      relatedEvidenceIds: ["ev_source_private"],
      relatedEventIds: ["evt_quarantine_governance_private"]
    });
    expect(ledger.appendOptions[0]).toEqual({ expectedNextSequence: 1 });
  });

  it("rejects duplicate incident recording before append", async () => {
    const ledger = new InMemoryEventLedger();
    await recordSafeIncident(ledger);
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordIncident({
        incidentId: "incident_export_blocked",
        severity: "warning",
        category: "export",
        recordedBy: "actor_investigator",
        summary: "Duplicate incident record should be rejected.",
        relatedEvidenceIds: ["ev_source_private"],
        relatedEventIds: ["evt_quarantine_governance_private"]
      })
    ).rejects.toThrow("Incident incident_export_blocked is already recorded");

    expect(await ledger.readStream("incident_incident_export_blocked")).toHaveLength(1);
  });

  it("records incident repairs with causation, safe action, and expected sequence", async () => {
    const ledger = new RecordingLedger();
    const incident = await recordSafeIncident(ledger);
    const service = new GovernanceService({ ledger, actor: humanActor });

    const repair = await service.recordIncidentRepair({
      incidentId: "incident_export_blocked",
      repairId: "repair_export_review",
      severity: "warning",
      category: "export",
      repairedBy: "actor_investigator",
      action: "Restricted evidence excluded from the public export plan.",
      relatedEvidenceIds: ["ev_source_private"],
      relatedEventIds: ["evt_quarantine_governance_private"],
      closesIncident: true
    });

    expect(repair.type).toBe("incident.repair.recorded");
    expect(repair.streamId).toBe("incident_incident_export_blocked");
    expect(repair.sequence).toBe(2);
    expect(repair.context.causationId).toBe(incident.id);
    expect(repair.payload).toMatchObject({
      incidentId: "incident_export_blocked",
      repairId: "repair_export_review",
      repairedBy: "actor_investigator",
      action: "Restricted evidence excluded from the public export plan.",
      closesIncident: true
    });
    expect(repair.id).toMatch(/^evt_/);
    expect(ledger.appendOptions[1]).toEqual({ expectedNextSequence: 2 });
  });

  it("links later incident repairs to the latest repair event", async () => {
    const ledger = new InMemoryEventLedger();
    await recordSafeIncident(ledger);
    const service = new GovernanceService({ ledger, actor: humanActor });
    const firstRepair = await service.recordIncidentRepair({
      incidentId: "incident_export_blocked",
      repairId: "repair_export_triage",
      severity: "warning",
      category: "export",
      repairedBy: "actor_investigator",
      action: "Export incident triaged and assigned for policy review.",
      relatedEvidenceIds: ["ev_source_private"],
      relatedEventIds: ["evt_quarantine_governance_private"],
      closesIncident: false
    });

    const secondRepair = await service.recordIncidentRepair({
      incidentId: "incident_export_blocked",
      repairId: "repair_export_review",
      severity: "warning",
      category: "export",
      repairedBy: "actor_investigator",
      action: "Policy review complete and export plan updated.",
      relatedEvidenceIds: ["ev_source_private"],
      relatedEventIds: [firstRepair.id],
      closesIncident: true
    });

    expect(secondRepair.context.causationId).toBe(firstRepair.id);
    expect(secondRepair.sequence).toBe(3);
  });

  it("rejects repair for a missing incident before append", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordIncidentRepair({
        incidentId: "incident_missing",
        repairId: "repair_missing",
        severity: "error",
        category: "projection",
        repairedBy: "actor_investigator",
        action: "Reviewed missing projection state.",
        relatedEvidenceIds: [],
        relatedEventIds: [],
        closesIncident: false
      })
    ).rejects.toThrow("Cannot record repair for missing incident incident_missing");

    expect(await ledger.readAll()).toHaveLength(0);
  });

  it("rejects secret-bearing incident summary and repair action before append", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordIncident({
        incidentId: "incident_secret_summary",
        severity: "critical",
        category: "secret-leak",
        recordedBy: "actor_investigator",
        summary: "Found access_token=abc123 in diagnostic output.",
        relatedEvidenceIds: [],
        relatedEventIds: []
      })
    ).rejects.toThrow("Governance text must not contain secrets");
    expect(await ledger.readAll()).toHaveLength(0);

    await recordSafeIncident(ledger);
    await expect(
      service.recordIncidentRepair({
        incidentId: "incident_export_blocked",
        repairId: "repair_secret_action",
        severity: "critical",
        category: "secret-leak",
        repairedBy: "actor_investigator",
        action: "Removed password abc123 from persisted diagnostics.",
        relatedEvidenceIds: [],
        relatedEventIds: [],
        closesIncident: false
      })
    ).rejects.toThrow("Governance text must not contain secrets");
    expect(await ledger.readStream("incident_incident_export_blocked")).toHaveLength(1);
  });

  it("requires incident and repair actor attribution to match the service actor", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordIncident({
        incidentId: "incident_wrong_actor",
        severity: "warning",
        category: "export",
        recordedBy: "actor_other",
        summary: "Export incident needs review.",
        relatedEvidenceIds: [],
        relatedEventIds: []
      })
    ).rejects.toThrow("Incident recordedBy must match the service actor");

    await recordSafeIncident(ledger);
    await expect(
      service.recordIncidentRepair({
        incidentId: "incident_export_blocked",
        repairId: "repair_wrong_actor",
        severity: "warning",
        category: "export",
        repairedBy: "actor_other",
        action: "Reviewed export incident.",
        relatedEvidenceIds: [],
        relatedEventIds: [],
        closesIncident: false
      })
    ).rejects.toThrow("Incident repair repairedBy must match the service actor");
  });

  it("requires a human actor when a repair closes an incident", async () => {
    const ledger = new InMemoryEventLedger();
    await recordSafeIncident(ledger);
    const service = new GovernanceService({ ledger, actor: extractorActor });

    await expect(
      service.recordIncidentRepair({
        incidentId: "incident_export_blocked",
        repairId: "repair_ai_closure",
        severity: "warning",
        category: "export",
        repairedBy: "actor_classifier",
        action: "Automated repair proposed closure.",
        relatedEvidenceIds: [],
        relatedEventIds: [],
        closesIncident: true
      })
    ).rejects.toThrow("Incident repair closure requires a human service actor");

    expect(await ledger.readStream("incident_incident_export_blocked")).toHaveLength(1);
  });
});
