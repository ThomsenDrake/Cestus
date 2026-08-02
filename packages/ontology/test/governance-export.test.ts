import { describe, expect, it } from "vitest";
import { type AppendableKnowledgeEvent, type KnowledgeEvent } from "../src/contracts.js";
import { type AppendOptions, type EventLedger, InMemoryEventLedger } from "../src/event-ledger.js";
import { buildGovernanceProjection } from "../src/governance-projection.js";
import type { GovernanceTag } from "../src/governance-policy.js";
import { GovernanceService } from "../src/governance-service.js";
import { buildGovernanceExportPreview } from "../src/governance-export-preview.js";
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

  it("previews public-safe defaults and names exact approvals for every exclusion category", () => {
    const classified = [
      ...classifiedEvidence("ev_source_identity", ["source_identity"]),
      ...classifiedEvidence("ev_credential_risk", ["credential_risk"]),
      ...classifiedEvidence("ev_export_restricted", ["export_restricted"]),
      ...classifiedEvidence("ev_other_unsafe", ["public_record"])
    ];
    const preview = buildGovernanceExportPreview(
      [...governanceEventsWithoutPrivateQuarantine, ...classified],
      [
        "ev_source_public",
        "ev_source_private",
        "ev_source_identity",
        "ev_credential_risk",
        "ev_export_restricted",
        "ev_other_unsafe"
      ]
    );

    expect(preview.mode).toBe("preview-only");
    expect(preview.includedEvidence).toEqual([{
      evidenceRef: "ev_source_public",
      governanceEventRefs: ["evt_classify_governance_public", "evt_review_governance_public"]
    }]);
    expect(preview.excludedEvidence.map((item) => ({
      evidenceRef: item.evidenceRef,
      approvals: item.requiredApprovals.map((approval) => [approval.category, approval.approvalId])
    }))).toEqual([
      {
        evidenceRef: "ev_credential_risk",
        approvals: [["credential-risk", "human-approve-credential-risk-inclusion"]]
      },
      {
        evidenceRef: "ev_export_restricted",
        approvals: [["export-restricted", "human-approve-export-restricted-inclusion"]]
      },
      {
        evidenceRef: "ev_other_unsafe",
        approvals: [["other-unsafe", "human-affirm-public-safe-eligibility"]]
      },
      {
        evidenceRef: "ev_source_identity",
        approvals: [["source-identity", "human-approve-source-identity-inclusion"]]
      },
      {
        evidenceRef: "ev_source_private",
        approvals: [["private", "human-approve-private-evidence-inclusion"]]
      }
    ]);
    expect(preview.diagnostics).toEqual([]);
    expect(JSON.stringify(preview)).not.toMatch(/Requester mailbox response|source\.pdf|provider error/i);
  });

  it("keeps every exclusion cause and missing state fail-closed with safe-reference diagnostics", () => {
    const preview = buildGovernanceExportPreview(
      [...goldenGovernanceLedgerEvents, ingestedEvidence("ev_unclassified")],
      ["ev_source_private", "ev_source_removed", "ev_unclassified", "ev_missing"]
    );

    expect(preview.excludedEvidence).toEqual([
      {
        evidenceRef: "ev_missing",
        governanceEventRefs: [],
        requiredApprovals: [{
          category: "other-unsafe",
          approvalId: "human-affirm-public-safe-eligibility",
          optInAvailableInPreview: false
        }]
      },
      {
        evidenceRef: "ev_source_private",
        governanceEventRefs: ["evt_classify_governance_private", "evt_quarantine_governance_private"],
        requiredApprovals: [
          {
            category: "private",
            approvalId: "human-approve-private-evidence-inclusion",
            optInAvailableInPreview: true
          },
          {
            category: "quarantine",
            approvalId: "quarantine-release-unavailable-in-preview",
            optInAvailableInPreview: false
          }
        ]
      },
      {
        evidenceRef: "ev_source_removed",
        governanceEventRefs: ["evt_classify_governance_removed", "evt_tombstone_governance_removed"],
        requiredApprovals: [
          {
            category: "other-unsafe",
            approvalId: "human-affirm-public-safe-eligibility",
            optInAvailableInPreview: false
          },
          {
            category: "tombstoned",
            approvalId: "tombstone-reversal-unavailable-in-preview",
            optInAvailableInPreview: false
          }
        ]
      },
      {
        evidenceRef: "ev_unclassified",
        governanceEventRefs: [],
        requiredApprovals: [
          {
            category: "other-unsafe",
            approvalId: "governance-classification-required-before-preview",
            optInAvailableInPreview: false
          },
          {
            category: "other-unsafe",
            approvalId: "human-affirm-public-safe-eligibility",
            optInAvailableInPreview: false
          }
        ]
      }
    ]);
    expect(preview.excludedEvidence.find((item) => item.evidenceRef === "ev_source_private")?.requiredApprovals).toHaveLength(2);
    expect(preview.diagnostics).toEqual([
      {
        code: "evidence-state-missing",
        evidenceRef: "ev_missing",
        repairHint: "verify-evidence-reference"
      },
      {
        code: "classification-missing",
        evidenceRef: "ev_unclassified",
        repairHint: "record-governance-classification"
      }
    ]);
    expect(Object.keys(preview.diagnostics[0] ?? {}).sort()).toEqual([
      "code",
      "evidenceRef",
      "repairHint"
    ]);
  });

  it("rejects credential-shaped requested references without echoing them", () => {
    const attempt = () => buildGovernanceExportPreview(goldenGovernanceLedgerEvents, ["ev_sk_live_example123"]);

    expect(attempt).toThrow("Governance export preview requires safe evidence and event references");
    try {
      attempt();
    } catch (error) {
      expect(String(error)).not.toContain("sk_live_example123");
    }
  });

  it("rejects concatenated AWS, Google API key, and JWT-shaped references without echoing them", () => {
    const credentialShapes = [
      "AKIA1234567890ABCDEF",
      "AIzaSyA1234567890abcdefghijklmnopqrstuv",
      "eyJhbGciOiJIUzI1NiJ9"
    ];
    const classified = classifiedEvidence("ev_secret_event_ref", ["public_safe"]);
    const ingestion = classified[0]!;
    const classification = classified[1]!;

    for (const credentialShape of credentialShapes) {
      const attempts = [
        () => buildGovernanceExportPreview(goldenGovernanceLedgerEvents, [`ev_${credentialShape}`]),
        () => buildGovernanceExportPreview(
          [ingestion, { ...classification, id: `evt_${credentialShape}` }],
          ["ev_secret_event_ref"]
        )
      ];
      for (const attempt of attempts) {
        expect(attempt).toThrow("Governance export preview requires safe evidence and event references");
        try {
          attempt();
        } catch (error) {
          expect(String(error)).not.toContain(credentialShape);
        }
      }
    }
  });

  it("excludes human-reviewed public-safe state when its classification event is missing", () => {
    const evidence = ingestedEvidence("ev_reviewed_without_classification");
    const review = reviewedEvidenceWithoutClassification(evidence);
    const preview = buildGovernanceExportPreview(
      [evidence, review],
      ["ev_reviewed_without_classification"]
    );

    expect(preview.includedEvidence).toEqual([]);
    expect(preview.excludedEvidence).toEqual([{
      evidenceRef: "ev_reviewed_without_classification",
      governanceEventRefs: [],
      requiredApprovals: [
        {
          category: "other-unsafe",
          approvalId: "governance-classification-required-before-preview",
          optInAvailableInPreview: false
        },
        {
          category: "other-unsafe",
          approvalId: "human-affirm-public-safe-eligibility",
          optInAvailableInPreview: false
        }
      ]
    }]);
    expect(preview.diagnostics).toEqual([{
      code: "classification-missing",
      evidenceRef: "ev_reviewed_without_classification",
      repairHint: "record-governance-classification"
    }]);
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
      causationId: "evt_review_governance_public"
    });

    expect(event.type).toBe("export.generated");
    expect(event.streamId).toBe("export_exp_report_001");
    expect(event.sequence).toBe(1);
    expect(ledger.appendOptions).toEqual([{ expectedNextSequence: 1 }]);
    expect(event.context).toMatchObject({
      actor: humanActor,
      causationId: "evt_review_governance_public",
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
      causationId: "evt_classify_governance_private"
    });

    expect(event.type).toBe("report.generated");
    expect(event.streamId).toBe("report_report_private_review_001");
    expect(event.sequence).toBe(1);
    expect(event.context).toMatchObject({
      actor: humanActor,
      causationId: "evt_classify_governance_private",
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

  it("rejects generated exports without explicit causation before append", async () => {
    const ledger = new RecordingLedger(goldenGovernanceLedgerEvents);
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordExportGenerated({
        exportId: "exp_missing_causation_001",
        policy,
        includedEvidenceIds: ["ev_source_public"],
        includedContentHashes: [publicContentHash],
        sensitiveOptIns: [],
        defaultPublicSafeOnly: true
      })
    ).rejects.toThrow("Generated exports and reports require explicit causation");

    expect(await ledger.readStream("export_exp_missing_causation_001")).toHaveLength(0);
  });

  it("rejects generated reports without explicit causation before append", async () => {
    const ledger = new RecordingLedger(goldenGovernanceLedgerEvents);
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordReportGenerated({
        reportId: "report_missing_causation_001",
        policy,
        includedEvidenceIds: ["ev_source_public"],
        includedContentHashes: [publicContentHash],
        sensitiveOptIns: [],
        defaultPublicSafeOnly: true
      })
    ).rejects.toThrow("Generated exports and reports require explicit causation");

    expect(await ledger.readStream("report_report_missing_causation_001")).toHaveLength(0);
  });

  it("rejects generated exports whose causation event is absent", async () => {
    const ledger = new RecordingLedger(goldenGovernanceLedgerEvents);
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordExportGenerated({
        exportId: "exp_unknown_causation_001",
        policy,
        includedEvidenceIds: ["ev_source_public"],
        includedContentHashes: [publicContentHash],
        sensitiveOptIns: [],
        defaultPublicSafeOnly: true,
        causationId: "evt_unknown_export_review"
      })
    ).rejects.toThrow("Generated exports and reports require causation to reference an existing event");

    expect(await ledger.readStream("export_exp_unknown_causation_001")).toHaveLength(0);
  });

  it("rejects generated reports whose causation does not reference included evidence", async () => {
    const ledger = new RecordingLedger(goldenGovernanceLedgerEvents);
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordReportGenerated({
        reportId: "report_unrelated_causation_001",
        policy,
        includedEvidenceIds: ["ev_source_public"],
        includedContentHashes: [publicContentHash],
        sensitiveOptIns: [],
        defaultPublicSafeOnly: true,
        causationId: "evt_classify_governance_private"
      })
    ).rejects.toThrow("Generated exports and reports require causation to reference included evidence");

    expect(await ledger.readStream("report_report_unrelated_causation_001")).toHaveLength(0);
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
        defaultPublicSafeOnly: false,
        causationId: "evt_classify_governance_private"
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
        defaultPublicSafeOnly: true,
        causationId: "evt_review_governance_public"
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
        defaultPublicSafeOnly: true,
        causationId: "evt_review_governance_public"
      })
    ).rejects.toThrow("Generated artifact content hashes must match included evidence");

    expect(await ledger.readStream("report_report_missing_hash_001")).toHaveLength(0);
  });

  it("rejects sensitive opt-ins recorded as public-safe-only defaults", async () => {
    const ledger = new RecordingLedger(governanceEventsWithoutPrivateQuarantine);
    const service = new GovernanceService({ ledger, actor: humanActor });

    await expect(
      service.recordReportGenerated({
        reportId: "report_misleading_default_001",
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
        defaultPublicSafeOnly: true,
        causationId: "evt_classify_governance_private"
      })
    ).rejects.toThrow("Generated artifact defaultPublicSafeOnly must match sensitive opt-in state");

    expect(await ledger.readStream("report_report_misleading_default_001")).toHaveLength(0);
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
        defaultPublicSafeOnly: false,
        causationId: "evt_quarantine_governance_private"
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
        defaultPublicSafeOnly: false,
        causationId: "evt_tombstone_governance_removed"
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
        defaultPublicSafeOnly: false,
        causationId: "evt_review_governance_public"
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
        defaultPublicSafeOnly: false,
        causationId: "evt_classify_governance_private"
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
        defaultPublicSafeOnly: false,
        causationId: "evt_classify_governance_private"
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
        defaultPublicSafeOnly: false,
        causationId: "evt_classify_governance_private"
      })
    ).rejects.toThrow("Governance text must not contain secrets");

    expect(await ledger.readStream("export_exp_secret_opt_in_001")).toHaveLength(0);
  });
});

function classifiedEvidence(evidenceId: string, tags: readonly GovernanceTag[]): KnowledgeEvent[] {
  const ingest = ingestedEvidence(evidenceId);
  const ingestEventId = ingest.id;
  const classifyEventId = `evt_classify_${evidenceId}`;
  const context = {
    actor: systemActor,
    occurredAt: "2026-08-02T12:00:00.000Z",
    correlationId: `corr_${evidenceId}`,
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0" }
  } as const;

  return [
    ingest,
    {
      id: classifyEventId,
      type: "evidence.governance.classified",
      version: 1,
      streamId: `evidence_${evidenceId}`,
      sequence: 2,
      context: { ...context, causationId: ingestEventId },
      payload: {
        evidenceId,
        evidenceEventId: ingestEventId,
        contentHash: unrelatedContentHash,
        policy,
        classifier: {
          actorId: "actor_system",
          kind: "ruleset",
          label: "Governance ruleset"
        },
        tags: tags.map((tag) => ({
          tag,
          confidence: 0.99,
          rationale: "Rule-based governance proposal requires review."
        }))
      }
    }
  ] as KnowledgeEvent[];
}

function ingestedEvidence(evidenceId: string): KnowledgeEvent {
  return {
    id: `evt_ingest_${evidenceId}`,
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${evidenceId}`,
    sequence: 1,
    context: {
      actor: systemActor,
      occurredAt: "2026-08-02T12:00:00.000Z",
      correlationId: `corr_${evidenceId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      evidenceId,
      source: { kind: "file", label: "Governance-safe reference" },
      contentHash: unrelatedContentHash,
      mediaType: "application/octet-stream",
      sizeBytes: 1
    }
  } as KnowledgeEvent;
}

function reviewedEvidenceWithoutClassification(evidence: KnowledgeEvent): KnowledgeEvent {
  const evidenceId = "ev_reviewed_without_classification";
  return {
    id: "evt_review_ev_reviewed_without_classification",
    type: "evidence.governance.reviewed",
    version: 1,
    streamId: `evidence_${evidenceId}`,
    sequence: 2,
    context: {
      actor: humanActor,
      occurredAt: "2026-08-02T12:01:00.000Z",
      causationId: evidence.id,
      correlationId: `corr_${evidenceId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      evidenceId,
      reviewedBy: "actor_investigator",
      policy,
      decisions: [{
        tag: "public_safe",
        action: "add",
        rationale: "Human review proposed public-safe handling."
      }]
    }
  } as KnowledgeEvent;
}
