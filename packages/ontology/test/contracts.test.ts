import { describe, expect, it } from "vitest";
import {
  eventContracts,
  validateKnowledgeEvent,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent
} from "../src/contracts.js";
import { defaultGovernancePolicy } from "../src/governance-policy.js";

const context = {
  actor: { id: "actor_system", kind: "system", label: "test runner" },
  occurredAt: "2026-06-30T17:00:00.000Z",
  correlationId: "corr_contracts",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0" }
} as const;

describe("event contracts", () => {
  it("contains agent guidance for every event contract", () => {
    for (const contract of Object.values(eventContracts)) {
      expect(contract.description.length).toBeGreaterThan(20);
      expect(contract.agentGuidance.length).toBeGreaterThan(20);
      expect(contract.invariants.length).toBeGreaterThan(0);
    }
  });

  it("validates a self-describing evidence.ingested event", () => {
    const event: KnowledgeEvent = {
      id: "evt_000000000000000000000001",
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_001",
      sequence: 1,
      context,
      payload: {
        evidenceId: "ev_001",
        source: { kind: "file", label: "invoice.pdf" },
        contentHash: "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544",
        mediaType: "application/pdf",
        sizeBytes: 128
      }
    };

    expect(validateKnowledgeEvent(event).success).toBe(true);
  });

  it("rejects uncontracted payload fields", () => {
    const result = validateKnowledgeEvent({
      id: "evt_000000000000000000000003",
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_002",
      sequence: 1,
      context,
      payload: {
        evidenceId: "ev_002",
        source: { kind: "file", label: "invoice.pdf" },
        contentHash: "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544",
        mediaType: "application/pdf",
        sizeBytes: 128,
        uncontracted: true
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((candidate) => candidate.path.join(".") === "payload");
      expect(issue).toMatchObject({
        code: "custom",
        params: { originalCode: "unrecognized_keys" }
      });
    }
  });

  it("rejects uncontracted event envelope and context fields", () => {
    const result = validateKnowledgeEvent({
      id: "evt_000000000000000000000006",
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_006",
      sequence: 1,
      context: {
        ...context,
        actor: {
          ...context.actor,
          uncontractedActorField: true
        },
        uncontractedContextField: true
      },
      payload: {
        evidenceId: "ev_006",
        source: { kind: "file", label: "invoice.pdf" },
        contentHash: "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544",
        mediaType: "application/pdf",
        sizeBytes: 128
      },
      uncontractedEventField: true
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join(".")).sort()).toEqual([
        "",
        "context",
        "context.actor"
      ]);
    }
  });

  it("rejects an assertion without provenance", () => {
    const result = validateKnowledgeEvent({
      id: "evt_000000000000000000000002",
      type: "assertion.proposed",
      version: 1,
      streamId: "assertion_as_001",
      sequence: 1,
      context,
      payload: {
        assertionId: "as_001",
        predicate: "agency.name",
        object: "Example Agency",
        confidence: 0.91,
        reviewState: "proposed"
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.evidenceId");
    }
  });

  it("returns validation failure for inherited event type names", () => {
    let result: ReturnType<typeof validateKnowledgeEvent> | undefined;

    expect(() => {
      result = validateKnowledgeEvent({
        id: "evt_000000000000000000000005",
        type: "toString",
        version: 1,
        streamId: "event_to_string",
        sequence: 1,
        context,
        payload: {}
      });
    }).not.toThrow();
    expect(result?.success).toBe(false);
  });

  it("preserves payload validation details for diagnostics", () => {
    const result = validateKnowledgeEvent({
      id: "evt_000000000000000000000004",
      type: "assertion.proposed",
      version: 1,
      streamId: "assertion_as_002",
      sequence: 1,
      context,
      payload: {
        assertionId: "as_002",
        evidenceId: "ev_001",
        predicate: "agency.name",
        object: "Example Agency",
        confidence: 1.1,
        reviewState: "proposed"
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((candidate) => candidate.path.join(".") === "payload.confidence");
      expect(issue).toMatchObject({
        code: "custom",
        params: {
          originalCode: "too_big",
          originalIssue: {
            code: "too_big",
            maximum: 1,
            path: ["confidence"]
          }
        }
      });
    }
  });

  it.each([
    {
      field: "message",
      payload: {
        diagnosticId: "diag_secret_message",
        severity: "error",
        category: "security",
        message: "Failed because access_token=abc123 was present.",
        repairHint: {
          contract: "governance payload",
          violatedPath: "payload.rationale",
          allowedActions: ["Redact the secret-bearing value."]
        }
      }
    },
    {
      field: "repairHint.contract",
      payload: {
        diagnosticId: "diag_secret_contract",
        severity: "error",
        category: "governance",
        message: "Governance payload rejected.",
        repairHint: {
          contract: "access_token=abc123",
          violatedPath: "payload.rationale",
          allowedActions: ["Redact the secret-bearing value."]
        }
      }
    },
    {
      field: "repairHint.violatedPath",
      payload: {
        diagnosticId: "diag_secret_path",
        severity: "warning",
        category: "export",
        message: "Export blocked.",
        repairHint: {
          contract: "governance payload",
          violatedPath: "payload.access_token=abc123",
          allowedActions: ["Redact the secret-bearing value."]
        }
      }
    },
    {
      field: "repairHint.allowedActions.0",
      payload: {
        diagnosticId: "diag_secret_action",
        severity: "warning",
        category: "incident",
        message: "Incident repair needs review.",
        repairHint: {
          contract: "governance payload",
          violatedPath: "payload.action",
          allowedActions: ["Remove access_token=abc123 from the payload."]
        }
      }
    }
  ])("rejects secret-looking diagnostic text in $field", ({ payload }) => {
    const result = validateKnowledgeEvent({
      id: "evt_diagnostic_secret_text",
      type: "diagnostic.recorded",
      version: 1,
      streamId: "diagnostic_diag_secret_text",
      sequence: 1,
      context,
      payload
    });

    expect(result.success).toBe(false);
  });

  it("exposes appendable event typing without losing payload correlation", () => {
    const appendableEvidenceEvent = {
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_typed",
      context,
      payload: {
        evidenceId: "ev_typed",
        source: { kind: "file", label: "typed.pdf" },
        contentHash: "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544",
        mediaType: "application/pdf",
        sizeBytes: 128
      }
    } satisfies AppendableKnowledgeEvent<"evidence.ingested">;

    expect(appendableEvidenceEvent.payload.evidenceId).toBe("ev_typed");
  });
});

describe("governance event contracts", () => {
  const baseContext = {
    actor: { id: "actor_investigator", kind: "human" as const, label: "Investigator" },
    occurredAt: "2026-07-05T12:00:00.000Z",
    causationId: "evt_evidence_source",
    correlationId: "corr_governance_001",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0" }
  };

  const contentHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const policy = { policyId: "gov_policy_default", version: "0.1.0" };
  const nonHumanContext = {
    ...baseContext,
    actor: { id: "actor_ai_classifier", kind: "extractor" as const, label: "Governance classifier" }
  };

  it("validates an AI governance classification with independent tags", () => {
    const result = validateKnowledgeEvent({
      id: "evt_governance_classified_001",
      type: "evidence.governance.classified",
      version: 1,
      streamId: "evidence_ev_source_001",
      sequence: 2,
      context: {
        ...baseContext,
        actor: { id: "actor_ai_classifier", kind: "extractor", label: "Governance classifier" }
      },
      payload: {
        evidenceId: "ev_source_001",
        evidenceEventId: "evt_evidence_source",
        contentHash,
        policy,
        classifier: {
          actorId: "actor_ai_classifier",
          kind: "ai",
          label: "Cestus governance classifier",
          model: "local-fixture-model"
        },
        tags: [
          {
            tag: "public_record",
            confidence: 0.97,
            rationale: "The document was produced by a public agency."
          },
          {
            tag: "contains_pii",
            confidence: 0.88,
            rationale: "The document includes person names and email addresses."
          },
          {
            tag: "public_safe",
            confidence: 0.91,
            rationale: "The public record excerpt is safe for default reports."
          }
        ]
      }
    });

    expect(result.success).toBe(true);
  });

  it("requires human identity on governance review", () => {
    const validReview = validateKnowledgeEvent({
      id: "evt_governance_review_001",
      type: "evidence.governance.reviewed",
      version: 1,
      streamId: "evidence_ev_source_001",
      sequence: 3,
      context: baseContext,
      payload: {
        evidenceId: "ev_source_001",
        reviewedBy: "actor_editor",
        policy,
        decisions: [
          {
            tag: "public_safe",
            action: "add",
            rationale: "Editor verified the selected evidence can appear in default public reports.",
            supersedesEventId: "evt_governance_classified_001"
          }
        ]
      }
    });

    const missingReviewer = validateKnowledgeEvent({
      id: "evt_governance_review_002",
      type: "evidence.governance.reviewed",
      version: 1,
      streamId: "evidence_ev_source_001",
      sequence: 4,
      context: baseContext,
      payload: {
        evidenceId: "ev_source_001",
        policy,
        decisions: [
          {
            tag: "public_safe",
            action: "affirm",
            rationale: "Human review affirmed the public-safe classification."
          }
        ]
      }
    });

    const nonHumanReview = validateKnowledgeEvent({
      id: "evt_governance_review_003",
      type: "evidence.governance.reviewed",
      version: 1,
      streamId: "evidence_ev_source_001",
      sequence: 5,
      context: {
        ...baseContext,
        actor: { id: "actor_ai_classifier", kind: "extractor", label: "Governance classifier" }
      },
      payload: {
        evidenceId: "ev_source_001",
        reviewedBy: "actor_ai_classifier",
        policy,
        decisions: [
          {
            tag: "public_safe",
            action: "affirm",
            rationale: "AI classification attempted to stand in for human review."
          }
        ]
      }
    });

    expect(validReview.success).toBe(true);
    expect(missingReviewer.success).toBe(false);
    expect(nonHumanReview.success).toBe(false);
  });

  it("rejects secret-looking governance payload text", () => {
    const result = validateKnowledgeEvent({
      id: "evt_governance_secret_001",
      type: "evidence.governance.classified",
      version: 1,
      streamId: "evidence_ev_source_001",
      sequence: 2,
      context: {
        ...baseContext,
        actor: { id: "actor_ai_classifier", kind: "extractor", label: "Governance classifier" }
      },
      payload: {
        evidenceId: "ev_source_001",
        evidenceEventId: "evt_evidence_source",
        contentHash,
        policy,
        classifier: {
          actorId: "actor_ai_classifier",
          kind: "ai",
          label: "Cestus governance classifier"
        },
        tags: [
          {
            tag: "credential_risk",
            confidence: 0.99,
            rationale: "The note includes access_token=abc123."
          }
        ]
      }
    });

    expect(result.success).toBe(false);
  });

  it("allows safe governance tag names in payload text", () => {
    const result = validateKnowledgeEvent({
      id: "evt_governance_credential_risk_text_001",
      type: "evidence.governance.classified",
      version: 1,
      streamId: "evidence_ev_source_001",
      sequence: 2,
      context: {
        ...baseContext,
        actor: { id: "actor_ai_classifier", kind: "extractor", label: "Governance classifier" }
      },
      payload: {
        evidenceId: "ev_source_001",
        evidenceEventId: "evt_evidence_source",
        contentHash,
        policy,
        classifier: {
          actorId: "actor_ai_classifier",
          kind: "ai",
          label: "Cestus governance classifier"
        },
        tags: [
          {
            tag: "credential_risk",
            confidence: 0.76,
            rationale: "The tag credential_risk applies."
          }
        ]
      }
    });

    expect(result.success).toBe(true);
  });

  it("validates network exposure and device approval audit events", () => {
    const exposure = validateKnowledgeEvent({
      id: "evt_network_exposure_001",
      type: "network.exposure.enabled",
      version: 1,
      streamId: "network_exposure_local",
      sequence: 1,
      context: { ...baseContext, causationId: undefined },
      payload: {
        exposureId: "netexp_local_001",
        mode: "tailnet",
        bindScope: "tailnet",
        enabledBy: "actor_investigator",
        enabledAt: "2026-07-05T12:00:00.000Z",
        visibleWarning: true,
        policy
      }
    });

    const approval = validateKnowledgeEvent({
      id: "evt_device_approval_001",
      type: "device.session.approved",
      version: 1,
      streamId: "device_session_dev_local_phone",
      sequence: 1,
      context: { ...baseContext, causationId: "evt_network_exposure_001" },
      payload: {
        sessionId: "devsess_local_phone",
        deviceLabel: "Reporter's laptop",
        approvedBy: "actor_investigator",
        approvedAt: "2026-07-05T12:05:00.000Z",
        exposureId: "netexp_local_001",
        capabilities: ["read", "write"],
        policy
      }
    });

    expect(exposure.success).toBe(true);
    expect(approval.success).toBe(true);
  });

  it("validates export opt-in audit events", () => {
    const result = validateKnowledgeEvent({
      id: "evt_export_generated_001",
      type: "export.generated",
      version: 1,
      streamId: "export_exp_report_001",
      sequence: 1,
      context: baseContext,
      payload: {
        exportId: "exp_report_001",
        generatedBy: "actor_investigator",
        generatedAt: "2026-07-05T12:30:00.000Z",
        policy,
        includedEvidenceIds: ["ev_source_001"],
        includedContentHashes: [contentHash],
        sensitiveOptIns: [
          {
            tag: "contains_pii",
            approvedBy: "actor_investigator",
            rationale: "The report is for private attorney review."
          },
          {
            tag: "private_correspondence",
            approvedBy: "actor_investigator",
            rationale: "The private message is included for non-public source review."
          }
        ],
        defaultPublicSafeOnly: false
      }
    });

    expect(result.success).toBe(true);
  });

  it("validates incident repair audit events with incident fields", () => {
    const result = validateKnowledgeEvent({
      id: "evt_incident_repair_001",
      type: "incident.repair.recorded",
      version: 1,
      streamId: "incident_incident_export_001",
      sequence: 2,
      context: baseContext,
      payload: {
        incidentId: "incident_export_001",
        repairId: "repair_export_001",
        severity: "warning",
        category: "export",
        repairedBy: "actor_investigator",
        repairedAt: "2026-07-05T13:00:00.000Z",
        action: "Removed restricted evidence from the generated export.",
        relatedEvidenceIds: ["ev_source_001"],
        relatedEventIds: ["evt_export_generated_001"],
        closesIncident: true
      }
    });

    expect(result.success).toBe(true);
  });

  it.each([
    {
      type: "governance.policy.installed",
      payload: {
        policyId: "gov_policy_default",
        version: "0.1.0",
        installedBy: "actor_investigator",
        confidenceThreshold: 0.9,
        tags: defaultGovernancePolicy.tags
      }
    },
    {
      type: "evidence.redaction.applied",
      payload: {
        evidenceId: "ev_source_001",
        redactionId: "redaction_source_001",
        appliedBy: "actor_investigator",
        rationale: "Removed private phone numbers from the shared view.",
        redactedContentHash: contentHash
      }
    },
    {
      type: "evidence.quarantined",
      payload: {
        evidenceId: "ev_source_001",
        quarantineId: "quarantine_source_001",
        quarantinedBy: "actor_investigator",
        reason: "Needs source-protection review before workflow use.",
        lockLevel: "workflow"
      }
    },
    {
      type: "evidence.tombstoned",
      payload: {
        evidenceId: "ev_source_001",
        tombstoneId: "tombstone_source_001",
        tombstonedBy: "actor_investigator",
        reason: "Duplicate evidence superseded by a cleaner ingested copy."
      }
    },
    {
      type: "network.exposure.disabled",
      payload: {
        exposureId: "netexp_local_001",
        disabledBy: "actor_investigator",
        disabledAt: "2026-07-05T12:45:00.000Z",
        reason: "Tailnet review session ended."
      }
    },
    {
      type: "device.session.revoked",
      payload: {
        sessionId: "devsess_local_phone",
        revokedBy: "actor_investigator",
        revokedAt: "2026-07-05T12:50:00.000Z",
        reason: "Temporary review device no longer needs access."
      }
    },
    {
      type: "report.generated",
      payload: {
        reportId: "report_private_review_001",
        generatedBy: "actor_investigator",
        generatedAt: "2026-07-05T13:20:00.000Z",
        policy,
        includedEvidenceIds: ["ev_source_001"],
        includedContentHashes: [contentHash],
        sensitiveOptIns: [
          {
            tag: "legal_risk",
            approvedBy: "actor_investigator",
            rationale: "Included for private counsel review."
          }
        ],
        defaultPublicSafeOnly: false
      }
    },
    {
      type: "incident.recorded",
      payload: {
        incidentId: "incident_network_001",
        severity: "warning",
        category: "network",
        recordedBy: "actor_investigator",
        summary: "Unexpected tailnet exposure state required review.",
        relatedEvidenceIds: ["ev_source_001"],
        relatedEventIds: ["evt_network_exposure_001"]
      }
    }
  ])("validates a governance $type example", ({ type, payload }) => {
    const result = validateKnowledgeEvent({
      id: `evt_${type.replaceAll(".", "_")}_coverage_001`,
      type,
      version: 1,
      streamId: `coverage_${type.replaceAll(".", "_")}`,
      sequence: 1,
      context: baseContext,
      payload
    });

    expect(result.success).toBe(true);
  });

  it("rejects incomplete, unsafe, or default-inverted governance policy events", () => {
    const incompletePolicy = validateKnowledgeEvent({
      id: "evt_governance_policy_incomplete",
      type: "governance.policy.installed",
      version: 1,
      streamId: "governance_policy_gov_policy_default",
      sequence: 1,
      context: baseContext,
      payload: {
        policyId: "gov_policy_default",
        version: "0.1.0",
        installedBy: "actor_investigator",
        confidenceThreshold: 0.9,
        tags: defaultGovernancePolicy.tags.slice(0, 2)
      }
    });
    const lowThresholdPolicy = validateKnowledgeEvent({
      id: "evt_governance_policy_low_threshold",
      type: "governance.policy.installed",
      version: 1,
      streamId: "governance_policy_gov_policy_default",
      sequence: 1,
      context: baseContext,
      payload: {
        ...defaultGovernancePolicy,
        installedBy: "actor_investigator",
        confidenceThreshold: 0.1
      }
    });
    const defaultInvertedPolicy = validateKnowledgeEvent({
      id: "evt_governance_policy_default_inverted",
      type: "governance.policy.installed",
      version: 1,
      streamId: "governance_policy_gov_policy_default",
      sequence: 1,
      context: baseContext,
      payload: {
        ...defaultGovernancePolicy,
        installedBy: "actor_investigator",
        tags: defaultGovernancePolicy.tags.map((entry) =>
          entry.tag === "contains_pii" ? { ...entry, defaultExportBehavior: "include-by-default" as const } : entry
        )
      }
    });

    expect(incompletePolicy.success).toBe(false);
    expect(lowThresholdPolicy.success).toBe(false);
    expect(defaultInvertedPolicy.success).toBe(false);
  });

  it.each([
    {
      type: "network.exposure.enabled",
      payload: {
        exposureId: "netexp_local_002",
        mode: "tailnet",
        bindScope: "tailnet",
        enabledBy: "actor_ai_classifier",
        enabledAt: "2026-07-05T12:00:00.000Z",
        visibleWarning: true,
        policy
      }
    },
    {
      type: "device.session.approved",
      payload: {
        sessionId: "devsess_local_tablet",
        deviceLabel: "Review tablet",
        approvedBy: "actor_ai_classifier",
        approvedAt: "2026-07-05T12:05:00.000Z",
        exposureId: "netexp_local_001",
        capabilities: ["read"],
        policy
      }
    },
    {
      type: "evidence.redaction.applied",
      payload: {
        evidenceId: "ev_source_001",
        redactionId: "redaction_source_002",
        appliedBy: "actor_ai_classifier",
        rationale: "AI attempted to decide redaction.",
        redactedContentHash: contentHash
      }
    },
    {
      type: "evidence.quarantined",
      payload: {
        evidenceId: "ev_source_001",
        quarantineId: "quarantine_source_002",
        quarantinedBy: "actor_ai_classifier",
        reason: "AI attempted to lock workflow use.",
        lockLevel: "all"
      }
    },
    {
      type: "evidence.tombstoned",
      payload: {
        evidenceId: "ev_source_001",
        tombstoneId: "tombstone_source_002",
        tombstonedBy: "actor_ai_classifier",
        reason: "AI attempted a tombstone decision."
      }
    },
    {
      type: "export.generated",
      payload: {
        exportId: "exp_sensitive_ai_001",
        generatedBy: "actor_ai_classifier",
        generatedAt: "2026-07-05T12:30:00.000Z",
        policy,
        includedEvidenceIds: ["ev_source_001"],
        includedContentHashes: [contentHash],
        sensitiveOptIns: [
          {
            tag: "contains_pii",
            approvedBy: "actor_ai_classifier",
            rationale: "AI attempted to approve sensitive export."
          }
        ],
        defaultPublicSafeOnly: false
      }
    },
    {
      type: "report.generated",
      payload: {
        reportId: "report_sensitive_ai_001",
        generatedBy: "actor_ai_classifier",
        generatedAt: "2026-07-05T12:35:00.000Z",
        policy,
        includedEvidenceIds: ["ev_source_001"],
        includedContentHashes: [contentHash],
        sensitiveOptIns: [
          {
            tag: "source_identity",
            approvedBy: "actor_ai_classifier",
            rationale: "AI attempted to approve source-protected report content."
          }
        ],
        defaultPublicSafeOnly: false
      }
    },
    {
      type: "incident.repair.recorded",
      payload: {
        incidentId: "incident_export_002",
        repairId: "repair_export_002",
        severity: "warning",
        category: "export",
        repairedBy: "actor_ai_classifier",
        repairedAt: "2026-07-05T13:00:00.000Z",
        action: "AI attempted to close the incident.",
        relatedEvidenceIds: ["ev_source_001"],
        relatedEventIds: ["evt_export_generated_001"],
        closesIncident: true
      }
    }
  ])("rejects non-human context actor for human-gated $type", ({ type, payload }) => {
    const result = validateKnowledgeEvent({
      id: `evt_${type.replaceAll(".", "_")}_non_human_001`,
      type,
      version: 1,
      streamId: `non_human_${type.replaceAll(".", "_")}`,
      sequence: 1,
      context: nonHumanContext,
      payload
    });

    expect(result.success).toBe(false);
  });
});

const prrRequestId = "prr_req_001";
const validHash = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const prrCitedRule = {
  jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
  label: "FOIA determination deadline",
  citation: "5 U.S.C. 552(a)(6)(A)(i)",
  url: "https://www.justice.gov/oip/freedom-information-act-5-usc-552"
};

const validPrrPayloadExamples = [
  {
    type: "prr.request.created",
    payload: {
      prrRequestId,
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Example Agency", email: "foia@example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Please provide contracts with Example Vendor from 2024.",
      status: "draft"
    }
  },
  {
    type: "prr.request.sent",
    payload: {
      prrRequestId,
      correspondenceId: "corr_prr_request_001",
      provider: "gmail",
      providerMessageId: "msg_request_001",
      providerThreadId: "thread_request_001",
      idempotencyKey: "send_prr_req_001_corr_prr_request_001",
      subject: "Records request",
      bodyHash: validHash,
      attachmentEvidenceIds: ["ev_prr_attachment_001"],
      sentAt: "2026-07-01T16:00:00.000Z",
      approvedBy: "actor_investigator",
      rawMetadata: {
        accountEmail: "investigator@example.org",
        provider: "gmail"
      }
    }
  },
  {
    type: "prr.correspondence.received",
    payload: {
      prrRequestId,
      correspondenceId: "corr_prr_received_001",
      provider: "imap-smtp",
      providerMessageId: "msg_received_001",
      providerThreadId: "thread_received_001",
      subject: "Re: Records request",
      from: { name: "FOIA Officer", email: "foia@example.gov" },
      receivedAt: "2026-07-02T16:00:00.000Z",
      bodyHash: validHash,
      evidenceIds: ["ev_prr_correspondence_001"]
    }
  },
  {
    type: "prr.followup.drafted",
    payload: {
      prrRequestId,
      correspondenceId: "corr_prr_followup_draft_001",
      subject: "Follow-up",
      bodyHash: validHash,
      citedRules: [prrCitedRule]
    }
  },
  {
    type: "prr.followup.sent",
    payload: {
      prrRequestId,
      correspondenceId: "corr_prr_followup_sent_001",
      provider: "gmail",
      providerMessageId: "msg_followup_001",
      subject: "Follow-up",
      bodyHash: validHash,
      sentAt: "2026-07-10T16:00:00.000Z",
      approvedBy: "actor_investigator"
    }
  },
  {
    type: "prr.deadline.estimated",
    payload: {
      prrRequestId,
      deadlineDate: "2026-07-29",
      confidence: "statutory",
      explanation: "Federal FOIA 20 working day estimate.",
      citedRules: [prrCitedRule]
    }
  },
  {
    type: "prr.deadline.confirmed",
    payload: {
      prrRequestId,
      deadlineDate: "2026-07-29",
      confirmedBy: "actor_investigator",
      rationale: "Receipt date confirmed from agency acknowledgement.",
      citedRules: [prrCitedRule]
    }
  },
  {
    type: "prr.fee.estimated",
    payload: {
      prrRequestId,
      amountCents: 2500,
      currency: "USD",
      sourceEvidenceId: "ev_fee_letter_001"
    }
  },
  {
    type: "prr.fee.challenged",
    payload: {
      prrRequestId,
      feeChallengeId: "fee_challenge_001",
      amountCents: 2500,
      rationale: "Fee waiver requested for public interest reporting.",
      approvedBy: "actor_investigator",
      citedRules: [prrCitedRule]
    }
  },
  {
    type: "prr.scope.narrowing.proposed",
    payload: {
      prrRequestId,
      narrowingId: "narrow_001",
      proposedScope: "Contracts from calendar year 2024 only.",
      proposedBy: "actor_agency",
      sourceEvidenceId: "ev_scope_email_001"
    }
  },
  {
    type: "prr.scope.narrowing.accepted",
    payload: {
      prrRequestId,
      narrowingId: "narrow_001",
      acceptedScope: "Contracts from calendar year 2024 only.",
      acceptedBy: "actor_investigator",
      rationale: "The narrower scope still covers the investigation need."
    }
  },
  {
    type: "prr.production.received",
    payload: {
      prrRequestId,
      productionId: "prod_001",
      label: "Initial production",
      receivedAt: "2026-07-15T16:00:00.000Z",
      evidenceIds: ["ev_production_file_001"]
    }
  },
  {
    type: "prr.exemption.claimed",
    payload: {
      prrRequestId,
      exemptionId: "exemption_001",
      claimedBy: "Example Agency",
      citedRules: [prrCitedRule],
      sourceEvidenceId: "ev_exemption_letter_001"
    }
  },
  {
    type: "prr.denial.recorded",
    payload: {
      prrRequestId,
      denialId: "denial_001",
      receivedAt: "2026-07-20T16:00:00.000Z",
      reason: "Agency denied the request citing exemption language.",
      sourceEvidenceId: "ev_denial_letter_001"
    }
  },
  {
    type: "prr.appeal.created",
    payload: {
      prrRequestId,
      appealId: "appeal_001",
      correspondenceId: "corr_prr_appeal_001",
      filedAt: "2026-07-21T16:00:00.000Z",
      approvedBy: "actor_investigator",
      citedRules: [prrCitedRule]
    }
  },
  {
    type: "prr.stalling.detected",
    payload: {
      prrRequestId,
      detectedAt: "2026-08-01T16:00:00.000Z",
      signals: [
        {
          kind: "deadline-breached",
          explanation: "Confirmed deadline passed without an adequate response."
        }
      ]
    }
  },
  {
    type: "prr.stalling.confirmed",
    payload: {
      prrRequestId,
      confirmedBy: "actor_investigator",
      rationale: "The agency has not responded after deadline and follow-up.",
      signalKinds: ["deadline-breached"]
    }
  },
  {
    type: "prr.legal-escalation.confirmed",
    payload: {
      prrRequestId,
      confirmedBy: "actor_investigator",
      rationale: "Escalation language approved after reviewing deadline, citations, and correspondence.",
      citedRules: [prrCitedRule],
      evidenceIds: ["ev_correspondence_history_001"]
    }
  },
  {
    type: "prr.request.closed",
    payload: {
      prrRequestId,
      closedAt: "2026-08-15T16:00:00.000Z",
      closedBy: "actor_investigator",
      reason: "fulfilled"
    }
  }
] as const;

function prrEvent(type: string, payload: Record<string, unknown>) {
  return {
    id: `evt_${type.replaceAll(".", "_")}_valid`,
    type,
    version: 1,
    streamId: prrRequestId,
    sequence: 1,
    context,
    payload
  };
}

describe("public records request event contracts", () => {
  it.each(validPrrPayloadExamples)("validates a valid $type payload", ({ type, payload }) => {
    expect(validateKnowledgeEvent(prrEvent(type, payload)).success).toBe(true);
  });

  it("validates a prr.request.created event", () => {
    const event = {
      id: "evt_prr_created_001",
      type: "prr.request.created",
      version: 1,
      streamId: "prr_req_001",
      sequence: 1,
      context,
      payload: {
        prrRequestId: "prr_req_001",
        jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        agency: { name: "Example Agency", email: "foia@example.gov" },
        requester: { name: "Investigator", email: "investigator@example.org" },
        requestText: "Please provide contracts with Example Vendor from 2024.",
        status: "draft"
      }
    };

    expect(validateKnowledgeEvent(event).success).toBe(true);
  });

  it("rejects unknown keys in PRR payloads", () => {
    const result = validateKnowledgeEvent({
      id: "evt_prr_created_002",
      type: "prr.request.created",
      version: 1,
      streamId: "prr_req_002",
      sequence: 1,
      context,
      payload: {
        prrRequestId: "prr_req_002",
        jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        agency: { name: "Example Agency" },
        requester: { name: "Investigator" },
        requestText: "Please provide records.",
        status: "draft",
        secretToken: "never-store-this"
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload");
    }
  });

  it("requires explicit evidenceIds on prr.correspondence.received payloads", () => {
    const result = validateKnowledgeEvent(
      prrEvent("prr.correspondence.received", {
        prrRequestId,
        correspondenceId: "corr_prr_received_002",
        provider: "gmail",
        providerMessageId: "msg_received_002",
        subject: "Re: Records request",
        from: { name: "FOIA Officer", email: "foia@example.gov" },
        receivedAt: "2026-07-02T16:00:00.000Z",
        bodyHash: validHash
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.evidenceIds");
    }
  });

  it("rejects secret-looking raw metadata keys on prr.request.sent payloads", () => {
    const sentPayload = validPrrPayloadExamples.find((example) => example.type === "prr.request.sent")!
      .payload;
    const result = validateKnowledgeEvent(
      prrEvent("prr.request.sent", {
        ...sentPayload,
        rawMetadata: {
          oauthToken: "never-store-this"
        }
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(
        "payload.rawMetadata.oauthToken"
      );
    }
  });

  it("requires human approval before a prr.followup.sent event", () => {
    const result = validateKnowledgeEvent({
      id: "evt_prr_followup_001",
      type: "prr.followup.sent",
      version: 1,
      streamId: "prr_req_001",
      sequence: 2,
      context,
      payload: {
        prrRequestId: "prr_req_001",
        correspondenceId: "corr_prr_001",
        provider: "gmail",
        providerMessageId: "msg_123",
        subject: "Follow-up",
        bodyHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        sentAt: "2026-07-01T16:00:00.000Z"
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.approvedBy");
    }
  });

  it("rejects invalid PRR evidence links", () => {
    const result = validateKnowledgeEvent(
      prrEvent("prr.production.received", {
        prrRequestId,
        productionId: "prod_002",
        label: "Invalid production",
        receivedAt: "2026-07-15T16:00:00.000Z",
        evidenceIds: ["not_evidence"]
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.evidenceIds.0");
    }
  });

  it("requires citations for PRR deadline estimates", () => {
    const result = validateKnowledgeEvent(
      prrEvent("prr.deadline.estimated", {
        prrRequestId,
        deadlineDate: "2026-07-29",
        confidence: "statutory",
        explanation: "Federal FOIA 20 working day estimate.",
        citedRules: []
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.citedRules");
    }
  });

  it("rejects lowercase PRR fee currencies", () => {
    const result = validateKnowledgeEvent(
      prrEvent("prr.fee.estimated", {
        prrRequestId,
        amountCents: 2500,
        currency: "usd"
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("payload.currency");
    }
  });

  it("requires legal escalation confirmation evidence and citations", () => {
    const result = validateKnowledgeEvent(
      prrEvent("prr.legal-escalation.confirmed", {
        prrRequestId,
        confirmedBy: "actor_investigator",
        rationale: "Escalation approved without complete support.",
        citedRules: [],
        evidenceIds: []
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["payload.citedRules", "payload.evidenceIds"])
      );
    }
  });
});
