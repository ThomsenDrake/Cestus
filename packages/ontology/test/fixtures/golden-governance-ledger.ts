import type { KnowledgeEvent } from "../../src/contracts.js";
import type { GovernanceTag } from "../../src/governance-policy.js";

const systemContext = {
  actor: { id: "actor_system", kind: "system", label: "Cestus governance fixture" },
  occurredAt: "2026-07-05T15:00:00.000Z",
  correlationId: "corr_golden_governance",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0" }
} as const;

const classifierContext = {
  ...systemContext,
  actor: { id: "actor_ai_classifier", kind: "extractor", label: "Governance classifier" }
} as const;

const reviewerContext = {
  ...systemContext,
  actor: { id: "actor_investigator", kind: "human", label: "Investigator" }
} as const;

const policy = { policyId: "gov_policy_default", version: "0.1.0" } as const;
const loweredThresholdPolicy = { policyId: "gov_policy_default", version: "0.2.0" } as const;

const policyTagDefaults = [
  {
    tag: "public_record",
    description: "Evidence obtained from a public agency or public proceeding.",
    defaultExportBehavior: "exclude-unless-opted-in",
    unlocksNormalWorkflowsAtHighConfidence: true
  },
  {
    tag: "public_safe",
    description: "Evidence reviewed as safe for default public reports.",
    defaultExportBehavior: "include-by-default",
    unlocksNormalWorkflowsAtHighConfidence: true
  },
  {
    tag: "contains_pii",
    description: "Evidence containing personally identifying information.",
    defaultExportBehavior: "exclude-unless-opted-in",
    unlocksNormalWorkflowsAtHighConfidence: true
  },
  {
    tag: "source_identity",
    description: "Evidence that may identify a confidential source or vulnerable person.",
    defaultExportBehavior: "exclude-unless-opted-in",
    unlocksNormalWorkflowsAtHighConfidence: true
  },
  {
    tag: "private_correspondence",
    description: "Evidence containing private messages or non-public correspondence.",
    defaultExportBehavior: "exclude-unless-opted-in",
    unlocksNormalWorkflowsAtHighConfidence: true
  },
  {
    tag: "legal_risk",
    description: "Evidence that may affect legal posture or legal strategy.",
    defaultExportBehavior: "exclude-unless-opted-in",
    unlocksNormalWorkflowsAtHighConfidence: true
  },
  {
    tag: "credential_risk",
    description: "Evidence that appears to expose reusable authentication material.",
    defaultExportBehavior: "exclude-unless-opted-in",
    unlocksNormalWorkflowsAtHighConfidence: true
  },
  {
    tag: "export_restricted",
    description: "Evidence excluded from public-safe exports without explicit opt-in.",
    defaultExportBehavior: "exclude-unless-opted-in",
    unlocksNormalWorkflowsAtHighConfidence: true
  },
  {
    tag: "law_enforcement_sensitive",
    description: "Evidence with sensitive law-enforcement or investigatory content.",
    defaultExportBehavior: "exclude-unless-opted-in",
    unlocksNormalWorkflowsAtHighConfidence: true
  }
] satisfies Array<{
  tag: GovernanceTag;
  description: string;
  defaultExportBehavior: "include-by-default" | "exclude-unless-opted-in";
  unlocksNormalWorkflowsAtHighConfidence: true;
}>;

export const goldenGovernanceLedgerEvents: KnowledgeEvent[] = [
  {
    id: "evt_ingest_governance_public",
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_source_public",
    sequence: 1,
    context: systemContext,
    payload: {
      evidenceId: "ev_source_public",
      source: { kind: "url", label: "Published council agenda", uri: "https://example.gov/agenda" },
      contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      mediaType: "text/html",
      sizeBytes: 2048
    }
  },
  {
    id: "evt_classify_governance_public",
    type: "evidence.governance.classified",
    version: 1,
    streamId: "evidence_ev_source_public",
    sequence: 2,
    context: { ...classifierContext, causationId: "evt_ingest_governance_public" },
    payload: {
      evidenceId: "ev_source_public",
      evidenceEventId: "evt_ingest_governance_public",
      contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      policy,
      classifier: {
        actorId: "actor_ai_classifier",
        kind: "ai",
        label: "Cestus governance classifier",
        model: "local-fixture-model"
      },
      tags: [
        { tag: "public_record", confidence: 0.98, rationale: "Published by a public agency." },
        { tag: "contains_pii", confidence: 0.42, rationale: "Names may appear in ordinary meeting attendance." }
      ]
    }
  },
  {
    id: "evt_review_governance_public",
    type: "evidence.governance.reviewed",
    version: 1,
    streamId: "evidence_ev_source_public",
    sequence: 3,
    context: { ...reviewerContext, causationId: "evt_classify_governance_public" },
    payload: {
      evidenceId: "ev_source_public",
      reviewedBy: "actor_investigator",
      policy,
      decisions: [
        {
          tag: "public_safe",
          action: "add",
          rationale: "Reviewed agenda is safe for default public report inclusion.",
          supersedesEventId: "evt_classify_governance_public"
        }
      ]
    }
  },
  {
    id: "evt_ingest_governance_private",
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_source_private",
    sequence: 1,
    context: systemContext,
    payload: {
      evidenceId: "ev_source_private",
      source: { kind: "message", label: "Requester mailbox response" },
      contentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      mediaType: "message/rfc822",
      sizeBytes: 4096
    }
  },
  {
    id: "evt_classify_governance_private",
    type: "evidence.governance.classified",
    version: 1,
    streamId: "evidence_ev_source_private",
    sequence: 2,
    context: { ...classifierContext, causationId: "evt_ingest_governance_private" },
    payload: {
      evidenceId: "ev_source_private",
      evidenceEventId: "evt_ingest_governance_private",
      contentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      policy,
      classifier: {
        actorId: "actor_ai_classifier",
        kind: "ai",
        label: "Cestus governance classifier",
        model: "local-fixture-model"
      },
      tags: [
        { tag: "contains_pii", confidence: 0.96, rationale: "Names and home mailing addresses are visible." },
        { tag: "private_correspondence", confidence: 0.95, rationale: "Message was intended for the request team." }
      ]
    }
  },
  {
    id: "evt_quarantine_governance_private",
    type: "evidence.quarantined",
    version: 1,
    streamId: "evidence_ev_source_private",
    sequence: 3,
    context: { ...reviewerContext, causationId: "evt_classify_governance_private" },
    payload: {
      evidenceId: "ev_source_private",
      quarantineId: "quarantine_private_correspondence",
      quarantinedBy: "actor_investigator",
      reason: "Restrict private correspondence pending review.",
      lockLevel: "export"
    }
  },
  {
    id: "evt_ingest_governance_removed",
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_source_removed",
    sequence: 1,
    context: systemContext,
    payload: {
      evidenceId: "ev_source_removed",
      source: { kind: "file", label: "superseded-copy.pdf" },
      contentHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      mediaType: "application/pdf",
      sizeBytes: 1024
    }
  },
  {
    id: "evt_classify_governance_removed",
    type: "evidence.governance.classified",
    version: 1,
    streamId: "evidence_ev_source_removed",
    sequence: 2,
    context: { ...classifierContext, causationId: "evt_ingest_governance_removed" },
    payload: {
      evidenceId: "ev_source_removed",
      evidenceEventId: "evt_ingest_governance_removed",
      contentHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      policy,
      classifier: {
        actorId: "actor_ai_classifier",
        kind: "ai",
        label: "Cestus governance classifier",
        model: "local-fixture-model"
      },
      tags: [{ tag: "public_record", confidence: 0.94, rationale: "Appears to be a public filing copy." }]
    }
  },
  {
    id: "evt_tombstone_governance_removed",
    type: "evidence.tombstoned",
    version: 1,
    streamId: "evidence_ev_source_removed",
    sequence: 3,
    context: { ...reviewerContext, causationId: "evt_classify_governance_removed" },
    payload: {
      evidenceId: "ev_source_removed",
      tombstoneId: "tombstone_superseded_copy",
      tombstonedBy: "actor_investigator",
      reason: "Superseded duplicate kept only for audit replay."
    }
  },
  {
    id: "evt_ingest_governance_review_locked",
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_source_review_locked",
    sequence: 1,
    context: systemContext,
    payload: {
      evidenceId: "ev_source_review_locked",
      source: { kind: "file", label: "review-locked-public-safe.pdf" },
      contentHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      mediaType: "application/pdf",
      sizeBytes: 1536
    }
  },
  {
    id: "evt_classify_governance_review_locked_initial",
    type: "evidence.governance.classified",
    version: 1,
    streamId: "evidence_ev_source_review_locked",
    sequence: 2,
    context: { ...classifierContext, causationId: "evt_ingest_governance_review_locked" },
    payload: {
      evidenceId: "ev_source_review_locked",
      evidenceEventId: "evt_ingest_governance_review_locked",
      contentHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      policy,
      classifier: {
        actorId: "actor_ai_classifier",
        kind: "ai",
        label: "Cestus governance classifier",
        model: "local-fixture-model"
      },
      tags: [{ tag: "public_safe", confidence: 0.97, rationale: "Appears safe for public report use." }]
    }
  },
  {
    id: "evt_review_governance_review_locked_remove",
    type: "evidence.governance.reviewed",
    version: 1,
    streamId: "evidence_ev_source_review_locked",
    sequence: 3,
    context: { ...reviewerContext, causationId: "evt_classify_governance_review_locked_initial" },
    payload: {
      evidenceId: "ev_source_review_locked",
      reviewedBy: "actor_investigator",
      policy,
      decisions: [
        {
          tag: "public_safe",
          action: "remove",
          rationale: "Human review found the evidence needs explicit handling.",
          supersedesEventId: "evt_classify_governance_review_locked_initial"
        }
      ]
    }
  },
  {
    id: "evt_classify_governance_review_locked_later",
    type: "evidence.governance.classified",
    version: 1,
    streamId: "evidence_ev_source_review_locked",
    sequence: 4,
    context: { ...classifierContext, causationId: "evt_review_governance_review_locked_remove" },
    payload: {
      evidenceId: "ev_source_review_locked",
      evidenceEventId: "evt_ingest_governance_review_locked",
      contentHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      policy,
      classifier: {
        actorId: "actor_ai_classifier",
        kind: "ai",
        label: "Cestus governance classifier",
        model: "local-fixture-model"
      },
      tags: [{ tag: "public_safe", confidence: 0.99, rationale: "Later automated pass proposes public use." }]
    }
  },
  {
    id: "evt_ingest_governance_public_restricted",
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_source_public_restricted",
    sequence: 1,
    context: systemContext,
    payload: {
      evidenceId: "ev_source_public_restricted",
      source: { kind: "file", label: "public-record-with-addresses.pdf" },
      contentHash: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
      mediaType: "application/pdf",
      sizeBytes: 3584
    }
  },
  {
    id: "evt_classify_governance_public_restricted",
    type: "evidence.governance.classified",
    version: 1,
    streamId: "evidence_ev_source_public_restricted",
    sequence: 2,
    context: { ...classifierContext, causationId: "evt_ingest_governance_public_restricted" },
    payload: {
      evidenceId: "ev_source_public_restricted",
      evidenceEventId: "evt_ingest_governance_public_restricted",
      contentHash: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
      policy,
      classifier: {
        actorId: "actor_ai_classifier",
        kind: "ai",
        label: "Cestus governance classifier",
        model: "local-fixture-model"
      },
      tags: [
        { tag: "public_safe", confidence: 0.97, rationale: "Public filing is suitable after review." },
        { tag: "contains_pii", confidence: 0.96, rationale: "Home addresses are visible in the filing." }
      ]
    }
  },
  {
    id: "evt_install_governance_policy_low_threshold",
    type: "governance.policy.installed",
    version: 1,
    streamId: "governance_policy_gov_policy_default",
    sequence: 1,
    context: { ...reviewerContext, causationId: "evt_classify_governance_public_restricted" },
    payload: {
      policyId: "gov_policy_default",
      version: "0.2.0",
      installedBy: "actor_investigator",
      confidenceThreshold: 0.8,
      tags: policyTagDefaults
    }
  },
  {
    id: "evt_ingest_governance_policy_threshold",
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_source_policy_threshold",
    sequence: 1,
    context: systemContext,
    payload: {
      evidenceId: "ev_source_policy_threshold",
      source: { kind: "url", label: "Borderline public record", uri: "https://example.gov/borderline" },
      contentHash: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
      mediaType: "text/html",
      sizeBytes: 768
    }
  },
  {
    id: "evt_classify_governance_policy_threshold",
    type: "evidence.governance.classified",
    version: 1,
    streamId: "evidence_ev_source_policy_threshold",
    sequence: 2,
    context: { ...classifierContext, causationId: "evt_ingest_governance_policy_threshold" },
    payload: {
      evidenceId: "ev_source_policy_threshold",
      evidenceEventId: "evt_ingest_governance_policy_threshold",
      contentHash: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
      policy: loweredThresholdPolicy,
      classifier: {
        actorId: "actor_ai_classifier",
        kind: "ai",
        label: "Cestus governance classifier",
        model: "local-fixture-model"
      },
      tags: [{ tag: "public_record", confidence: 0.85, rationale: "Borderline confidence under installed policy." }]
    }
  },
  {
    id: "evt_ingest_governance_human_supersede",
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_source_human_supersede",
    sequence: 1,
    context: systemContext,
    payload: {
      evidenceId: "ev_source_human_supersede",
      source: { kind: "file", label: "legal-risk-note.pdf" },
      contentHash: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
      mediaType: "application/pdf",
      sizeBytes: 640
    }
  },
  {
    id: "evt_classify_governance_human_supersede",
    type: "evidence.governance.classified",
    version: 1,
    streamId: "evidence_ev_source_human_supersede",
    sequence: 2,
    context: { ...classifierContext, causationId: "evt_ingest_governance_human_supersede" },
    payload: {
      evidenceId: "ev_source_human_supersede",
      evidenceEventId: "evt_ingest_governance_human_supersede",
      contentHash: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
      policy: loweredThresholdPolicy,
      classifier: {
        actorId: "actor_ai_classifier",
        kind: "ai",
        label: "Cestus governance classifier",
        model: "local-fixture-model"
      },
      tags: [{ tag: "legal_risk", confidence: 0.91, rationale: "Document discusses pending legal posture." }]
    }
  },
  {
    id: "evt_review_governance_human_supersede",
    type: "evidence.governance.reviewed",
    version: 1,
    streamId: "evidence_ev_source_human_supersede",
    sequence: 3,
    context: { ...reviewerContext, causationId: "evt_classify_governance_human_supersede" },
    payload: {
      evidenceId: "ev_source_human_supersede",
      reviewedBy: "actor_investigator",
      policy: loweredThresholdPolicy,
      decisions: [
        {
          tag: "legal_risk",
          action: "supersede",
          rationale: "Human review confirms legal-risk handling is required.",
          supersedesEventId: "evt_classify_governance_human_supersede"
        }
      ]
    }
  },
  {
    id: "evt_review_governance_human_affirm",
    type: "evidence.governance.reviewed",
    version: 1,
    streamId: "evidence_ev_source_human_supersede",
    sequence: 4,
    context: { ...reviewerContext, causationId: "evt_review_governance_human_supersede" },
    payload: {
      evidenceId: "ev_source_human_supersede",
      reviewedBy: "actor_investigator",
      policy: loweredThresholdPolicy,
      decisions: [
        {
          tag: "legal_risk",
          action: "affirm",
          rationale: "Second human review affirms legal-risk handling.",
          supersedesEventId: "evt_review_governance_human_supersede"
        }
      ]
    }
  }
];
