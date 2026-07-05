import type { KnowledgeEvent } from "../../src/contracts.js";

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
  }
];
