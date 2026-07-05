import { describe, expect, it } from "vitest";
import { type AppendableKnowledgeEvent, type KnowledgeEvent } from "../src/contracts.js";
import { type AppendOptions, type EventLedger, InMemoryEventLedger } from "../src/event-ledger.js";
import { buildGovernanceProjection } from "../src/governance-projection.js";
import { GovernanceService } from "../src/governance-service.js";
import { goldenGovernanceLedgerEvents } from "./fixtures/golden-governance-ledger.js";

const humanActor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };
const systemActor = { id: "actor_system", kind: "system" as const, label: "System export worker" };
const policy = { policyId: "gov_policy_default", version: "0.1.0" };
const publicContentHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;
const privateContentHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const;
const unrelatedContentHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const governanceEventsWithoutPrivateQuarantine = goldenGovernanceLedgerEvents.filter(
  (event) => event.id !== "evt_quarantine_governance_private"
);

class RecordingLedger implements EventLedger {
  private readonly ledger = new InMemoryEventLedger();
  readonly appendOptions: AppendOptions[] = [];

  constructor(private readonly seededEvents: readonly KnowledgeEvent[] = []) {}

  async append(event: AppendableKnowledgeEvent, options: AppendOptions = {}): Promise<KnowledgeEvent> {
    this.appendOptions.push(options);
    return this.ledger.append(event, options);
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return [
      ...this.seededEvents.filter((event) => event.streamId === streamId),
      ...(await this.ledger.readStream(streamId))
    ];
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return [...this.seededEvents, ...(await this.ledger.readAll())];
  }
}

describe("governed exports and reports", () => {
  it("includes only public-safe evidence by default", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    expect(projection.buildDefaultExportEvidenceIds()).toEqual(["ev_source_public"]);
  });

  it("requires opt-in tags before restricted evidence can be included", () => {
    const projection = buildGovernanceProjection(governanceEventsWithoutPrivateQuarantine);
    const result = projection.planExport({
      requestedEvidenceIds: ["ev_source_public", "ev_source_private"],
      sensitiveOptInTags: []
    });

    expect(result.includedEvidenceIds).toEqual(["ev_source_public"]);
    expect(result.blockedEvidence).toEqual([
      {
        evidenceId: "ev_source_private",
        requiredOptInTags: ["contains_pii", "private_correspondence"]
      }
    ]);
  });

  it("includes restricted evidence when every active restricted tag is opted in", () => {
    const projection = buildGovernanceProjection(governanceEventsWithoutPrivateQuarantine);
    const result = projection.planExport({
      requestedEvidenceIds: ["ev_source_private"],
      sensitiveOptInTags: ["contains_pii", "private_correspondence"]
    });

    expect(result.includedEvidenceIds).toEqual(["ev_source_private"]);
    expect(result.blockedEvidence).toEqual([]);
  });

  it("blocks quarantined evidence even when every active restricted tag is opted in", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    const result = projection.planExport({
      requestedEvidenceIds: ["ev_source_private"],
      sensitiveOptInTags: ["contains_pii", "private_correspondence"]
    });

    expect(result.includedEvidenceIds).toEqual([]);
    expect(result.blockedEvidence).toEqual([
      {
        evidenceId: "ev_source_private",
        requiredOptInTags: []
      }
    ]);
  });

  it("records generated exports with human opt-ins and explicit governance causation", async () => {
    const ledger = new RecordingLedger(goldenGovernanceLedgerEvents);
    const service = new GovernanceService({ ledger, actor: humanActor });

    const event = await service.recordExportGenerated({
      exportId: "exp_report_001",
      policy,
      includedEvidenceIds: ["ev_source_public"],
      includedContentHashes: [publicContentHash],
      sensitiveOptIns: [],
      defaultPublicSafeOnly: true,
      causationId: "evt_review_governance_private"
    });

    expect(event.type).toBe("export.generated");
    expect(event.streamId).toBe("export_exp_report_001");
    expect(event.sequence).toBe(1);
    expect(ledger.appendOptions).toEqual([{ expectedNextSequence: 1 }]);
    expect(event.context).toMatchObject({
      actor: humanActor,
      causationId: "evt_review_governance_private",
      correlationId: "corr_exp_report_001",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    });
    expect(event.payload).toMatchObject({
      exportId: "exp_report_001",
      generatedBy: "actor_investigator",
      policy,
      includedEvidenceIds: ["ev_source_public"],
      includedContentHashes: [publicContentHash],
      sensitiveOptIns: [],
      defaultPublicSafeOnly: true
    });
  });

  it("records generated reports with matching human opt-in approvals", async () => {
    const ledger = new RecordingLedger(governanceEventsWithoutPrivateQuarantine);
    const service = new GovernanceService({ ledger, actor: humanActor });

    const event = await service.recordReportGenerated({
      reportId: "report_private_review_001",
      policy,
      includedEvidenceIds: ["ev_source_private"],
      includedContentHashes: [privateContentHash],
      sensitiveOptIns: [
        {
          tag: "contains_pii",
          approvedBy: "actor_investigator",
          rationale: "Included for private attorney review."
        },
        {
          tag: "private_correspondence",
          approvedBy: "actor_investigator",
          rationale: "Included for non-public source review."
        }
      ],
      defaultPublicSafeOnly: false,
      causationId: "evt_review_governance_private"
    });

    expect(event.type).toBe("report.generated");
    expect(event.streamId).toBe("report_report_private_review_001");
    expect(event.sequence).toBe(1);
    expect(event.context).toMatchObject({
      actor: humanActor,
      causationId: "evt_review_governance_private",
      correlationId: "corr_report_private_review_001"
    });
    expect(event.payload).toMatchObject({
      reportId: "report_private_review_001",
      generatedBy: "actor_investigator",
      policy,
      includedEvidenceIds: ["ev_source_private"],
      includedContentHashes: [privateContentHash],
      sensitiveOptIns: [
        {
          tag: "contains_pii",
          approvedBy: "actor_investigator",
          rationale: "Included for private attorney review."
        },
        {
          tag: "private_correspondence",
          approvedBy: "actor_investigator",
          rationale: "Included for non-public source review."
        }
      ],
      defaultPublicSafeOnly: false
    });
  });

  it("rejects restricted evidence without all required opt-ins when blocked IDs are omitted", async () => {
    const ledger = new RecordingLedger(governanceEventsWithoutPrivateQuarantine);
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordExportGenerated({
        exportId: "exp_missing_restricted_opt_in_001",
        policy,
        includedEvidenceIds: ["ev_source_private"],
        includedContentHashes: [privateContentHash],
        sensitiveOptIns: [
          {
            tag: "contains_pii",
            approvedBy: "actor_investigator",
            rationale: "Included for private attorney review."
          }
        ],
        defaultPublicSafeOnly: false
      })
    ).rejects.toThrow("Cannot generate export or report outside the governed export plan");

    expect(await ledger.readStream("export_exp_missing_restricted_opt_in_001")).toHaveLength(0);
  });

  it("rejects exports whose content hashes do not match included evidence", async () => {
    const ledger = new RecordingLedger(goldenGovernanceLedgerEvents);
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordExportGenerated({
        exportId: "exp_wrong_hash_001",
        policy,
        includedEvidenceIds: ["ev_source_public"],
        includedContentHashes: [unrelatedContentHash],
        sensitiveOptIns: [],
        defaultPublicSafeOnly: true
      })
    ).rejects.toThrow("Generated artifact content hashes must match included evidence");

    expect(await ledger.readStream("export_exp_wrong_hash_001")).toHaveLength(0);
  });

  it("rejects reports whose content hash count differs from included evidence", async () => {
    const ledger = new RecordingLedger(goldenGovernanceLedgerEvents);
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordReportGenerated({
        reportId: "report_missing_hash_001",
        policy,
        includedEvidenceIds: ["ev_source_public"],
        includedContentHashes: [],
        sensitiveOptIns: [],
        defaultPublicSafeOnly: true
      })
    ).rejects.toThrow("Generated artifact content hashes must match included evidence");

    expect(await ledger.readStream("report_report_missing_hash_001")).toHaveLength(0);
  });

  it("rejects quarantined evidence even with all restricted opt-ins when blocked IDs are omitted", async () => {
    const ledger = new RecordingLedger(goldenGovernanceLedgerEvents);
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordExportGenerated({
        exportId: "exp_quarantined_001",
        policy,
        includedEvidenceIds: ["ev_source_private"],
        includedContentHashes: [privateContentHash],
        sensitiveOptIns: [
          {
            tag: "contains_pii",
            approvedBy: "actor_investigator",
            rationale: "Included for private attorney review."
          },
          {
            tag: "private_correspondence",
            approvedBy: "actor_investigator",
            rationale: "Included for non-public source review."
          }
        ],
        defaultPublicSafeOnly: false
      })
    ).rejects.toThrow("Cannot generate export or report outside the governed export plan");

    expect(await ledger.readStream("export_exp_quarantined_001")).toHaveLength(0);
  });

  it("rejects tombstoned evidence before append", async () => {
    const ledger = new RecordingLedger(goldenGovernanceLedgerEvents);
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordExportGenerated({
        exportId: "exp_tombstoned_001",
        policy,
        includedEvidenceIds: ["ev_source_removed"],
        includedContentHashes: ["sha256:3333333333333333333333333333333333333333333333333333333333333333"],
        sensitiveOptIns: [],
        defaultPublicSafeOnly: false
      })
    ).rejects.toThrow("Cannot generate export or report outside the governed export plan");

    expect(await ledger.readStream("export_exp_tombstoned_001")).toHaveLength(0);
  });

  it("rejects missing evidence for reports before append", async () => {
    const ledger = new RecordingLedger(goldenGovernanceLedgerEvents);
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordReportGenerated({
        reportId: "report_missing_evidence_001",
        policy,
        includedEvidenceIds: ["ev_missing"],
        includedContentHashes: [unrelatedContentHash],
        sensitiveOptIns: [],
        defaultPublicSafeOnly: false
      })
    ).rejects.toThrow("Cannot generate export or report outside the governed export plan");

    expect(await ledger.readStream("report_report_missing_evidence_001")).toHaveLength(0);
  });

  it("rejects sensitive opt-ins when the service actor is not human before append", async () => {
    const ledger = new RecordingLedger();
    const service = new GovernanceService({ ledger, actor: systemActor });

    await expect(
      service.recordExportGenerated({
        exportId: "exp_sensitive_system_001",
        policy,
        includedEvidenceIds: ["ev_source_private"],
        includedContentHashes: [privateContentHash],
        sensitiveOptIns: [
          {
            tag: "contains_pii",
            approvedBy: "actor_system",
            rationale: "System attempted sensitive export."
          }
        ],
        defaultPublicSafeOnly: false
      })
    ).rejects.toThrow("Sensitive export and report opt-ins require a human service actor");

    expect(await ledger.readStream("export_exp_sensitive_system_001")).toHaveLength(0);
  });

  it("rejects sensitive opt-ins approved by someone other than the service actor before append", async () => {
    const ledger = new RecordingLedger();
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordReportGenerated({
        reportId: "report_wrong_approver_001",
        policy,
        includedEvidenceIds: ["ev_source_private"],
        includedContentHashes: [privateContentHash],
        sensitiveOptIns: [
          {
            tag: "private_correspondence",
            approvedBy: "actor_editor",
            rationale: "Editor approved this inclusion."
          }
        ],
        defaultPublicSafeOnly: false
      })
    ).rejects.toThrow("Sensitive opt-in approvedBy must match the service actor");

    expect(await ledger.readStream("report_report_wrong_approver_001")).toHaveLength(0);
  });

  it("rejects secret-bearing opt-in rationale before append", async () => {
    const ledger = new RecordingLedger();
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordExportGenerated({
        exportId: "exp_secret_opt_in_001",
        policy,
        includedEvidenceIds: ["ev_source_private"],
        includedContentHashes: [privateContentHash],
        sensitiveOptIns: [
          {
            tag: "contains_pii",
            approvedBy: "actor_investigator",
            rationale: "Included after finding access_token=abc123."
          }
        ],
        defaultPublicSafeOnly: false
      })
    ).rejects.toThrow("Governance text must not contain secrets");

    expect(await ledger.readStream("export_exp_secret_opt_in_001")).toHaveLength(0);
  });
});
