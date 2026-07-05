# Security, Threat Model, And Data Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build replayable governance contracts, classification/review services, projections, export defaults, LAN/tailnet approval state, and incident/repair diagnostics for the approved Cestus security and data-governance design.

**Architecture:** Governance extends the existing ontology event ledger. Strict Zod contracts define policy, evidence classification, human review, quarantine/redaction/tombstone, network exposure, device approval, export/report, and incident/repair events. Focused services append valid events, and projections rebuild current governance, export eligibility, network approval, and incident state from the ledger.

**Tech Stack:** TypeScript, Zod, Vitest, existing `EventLedger`, existing ontology contract and projection patterns, local factory verification through `npm run verify`.

---

## Required Reading

Before any task, read:

- `AGENTS.md`
- `.factory/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/software-factory.md`
- `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
- `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
- `docs/superpowers/specs/2026-07-05-security-threat-model-data-governance-design.md`
- this plan

Workers must also read every source and test file listed in their task before editing.

## Software Factory Rules

- Use a task-scoped branch or isolated worktree.
- Claim exactly one task in `docs/agentic/claims/task-<number>-<short-slug>.md` and commit the claim before editing task files.
- Change the claim status to `in-progress` before touching task files.
- Write the failing test or contract first.
- Run the exact targeted failing command recorded by the task.
- Make the smallest production change that satisfies the test.
- Run the exact targeted passing command.
- Run `npm run verify`.
- Commit only the files owned by the task plus its claim/readiness evidence.
- Hand off to spec review, then code-quality review, before starting dependent work.

Stop on data-loss risk, schema conflict, credential need, external-service dependency, unavailable dependency, live network/security dependency, or the same verifier failing after two focused repair attempts.

## Scope Boundary

This plan is backend/domain work inside `packages/ontology`, test fixtures, factory readiness docs/scripts, and task claims. It does not touch:

- `packages/local-runtime`
- `packages/ui/src/requests/request-adapter.ts`
- `packages/ui/src/App.tsx`
- local runtime scripts
- runtime-preview readiness
- public data ingestion connectors
- PRR runtime wiring
- live credentials or external services

## File Structure

- `packages/ontology/src/contracts.ts`: extend strict event contracts with governance, export/report, network/device, and incident event families.
- `packages/ontology/src/governance-policy.ts`: define core governance tags, default policy, policy validation, confidence threshold helpers, and secret-safe text helpers.
- `packages/ontology/src/governance-service.ts`: append policy, classification, review, quarantine/redaction/tombstone, export/report, network/device, and incident/repair events through the existing ledger.
- `packages/ontology/src/governance-projection.ts`: rebuild current evidence governance state, export eligibility, network exposure/session state, and incident state from events.
- `packages/ontology/src/index.ts`: export new governance modules.
- `packages/ontology/test/contracts.test.ts`: cover strict governance event contracts, secret-safe payload constraints, and human-approval fields.
- `packages/ontology/test/governance-policy.test.ts`: cover policy/tag validation and confidence behavior.
- `packages/ontology/test/governance-service.test.ts`: cover append helpers, evidence existence, causation, secret rejection, and human-gate event creation.
- `packages/ontology/test/governance-projection.test.ts`: cover replay from golden governance events.
- `packages/ontology/test/fixtures/golden-governance-ledger.ts`: provide a validated replay fixture for governance projection tests.
- `scripts/check-agent-readiness.mjs`: require the security/governance spec and plan in factory readiness.
- `docs/agentic/software-factory.md`: record security/governance plan readiness evidence after final verification.

## Event Naming Defaults

Use these event type names unless a task discovers a concrete schema conflict:

- `governance.policy.installed`
- `evidence.governance.classified`
- `evidence.governance.reviewed`
- `evidence.redaction.applied`
- `evidence.quarantined`
- `evidence.tombstoned`
- `network.exposure.enabled`
- `network.exposure.disabled`
- `device.session.approved`
- `device.session.revoked`
- `export.generated`
- `report.generated`
- `incident.recorded`
- `incident.repair.recorded`

## Task 1: Add Governance Event Contracts

**Files:**

- Modify: `packages/ontology/src/contracts.ts`
- Modify: `packages/ontology/test/contracts.test.ts`
- Create: `docs/agentic/claims/task-1-governance-event-contracts.md`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-governance-event-contracts.md`:

```markdown
# Task 1 Claim: Governance Event Contracts

Plan: `docs/superpowers/plans/2026-07-05-security-threat-model-data-governance-implementation.md`
Task: Task 1: Add Governance Event Contracts
Worker: implementing agent identity
Branch: task branch name
Worktree: absolute worktree path
Claimed-at: current UTC timestamp
Status: claimed

Owned files:
- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/contracts.test.ts`
- `docs/agentic/claims/task-1-governance-event-contracts.md`

Required commands:
- `npm test -- packages/ontology/test/contracts.test.ts`
- `npm run verify`
```

Run:

```bash
git add docs/agentic/claims/task-1-governance-event-contracts.md
git commit -m "chore: claim task 1 governance event contracts"
```

- [ ] **Step 2: Mark the claim in progress**

Edit the claim status to `in-progress` and commit:

```bash
git add docs/agentic/claims/task-1-governance-event-contracts.md
git commit -m "chore: start task 1 governance event contracts"
```

- [ ] **Step 3: Write failing contract tests**

Read `packages/ontology/src/contracts.ts` and `packages/ontology/test/contracts.test.ts`.

Append tests like these to `packages/ontology/test/contracts.test.ts`:

```ts
describe("governance event contracts", () => {
  const baseContext = {
    actor: { id: "actor_investigator", kind: "human" as const, label: "Investigator" },
    occurredAt: "2026-07-05T12:00:00.000Z",
    causationId: "evt_evidence_source",
    correlationId: "corr_governance_001",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0" }
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
        contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        policy: { policyId: "gov_policy_default", version: "0.1.0" },
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
          }
        ]
      }
    });

    expect(result.success).toBe(true);
  });

  it("requires human identity on governance review", () => {
    const result = validateKnowledgeEvent({
      id: "evt_governance_review_001",
      type: "evidence.governance.reviewed",
      version: 1,
      streamId: "evidence_ev_source_001",
      sequence: 3,
      context: baseContext,
      payload: {
        evidenceId: "ev_source_001",
        reviewedBy: "actor_editor",
        policy: { policyId: "gov_policy_default", version: "0.1.0" },
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

    expect(result.success).toBe(true);
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
        contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        policy: { policyId: "gov_policy_default", version: "0.1.0" },
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
        policy: { policyId: "gov_policy_default", version: "0.1.0" }
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
        policy: { policyId: "gov_policy_default", version: "0.1.0" }
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
        policy: { policyId: "gov_policy_default", version: "0.1.0" },
        includedEvidenceIds: ["ev_source_001"],
        includedContentHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
        sensitiveOptIns: [
          {
            tag: "contains_pii",
            approvedBy: "actor_investigator",
            rationale: "The report is for private attorney review."
          }
        ],
        defaultPublicSafeOnly: false
      }
    });

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 4: Run the failing test**

Run:

```bash
npm test -- packages/ontology/test/contracts.test.ts
```

Expected: FAIL because governance event types are not yet known.

- [ ] **Step 5: Add strict schemas and event contract metadata**

In `packages/ontology/src/contracts.ts`, add schemas near the existing payload schemas:

```ts
const secretSafeTextSchema = z.string().min(1).refine((value) => !secretTextPattern.test(value), {
  message: "text must not contain secrets or credentials"
});

const secretTextPattern =
  /(?:^|[^a-z0-9])(?:access[\s._-]*token|api[\s._-]*key|authorization|bearer|token|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth|credential)(?:$|[^a-z0-9])/i;

const governanceTagSchema = z.enum([
  "public_record",
  "public_safe",
  "contains_pii",
  "source_identity",
  "private_correspondence",
  "legal_risk",
  "credential_risk",
  "export_restricted",
  "law_enforcement_sensitive"
]);

const governancePolicyRefSchema = z.object({
  policyId: z.string().regex(/^gov_policy_[a-zA-Z0-9_-]+$/),
  version: z.string().min(1)
}).strict();

const governanceTagDecisionSchema = z.object({
  tag: governanceTagSchema,
  confidence: z.number().min(0).max(1),
  rationale: secretSafeTextSchema
}).strict();

const governanceClassifierSchema = z.object({
  actorId: z.string().min(3),
  kind: z.enum(["ai", "human", "system", "ruleset"]),
  label: secretSafeTextSchema,
  model: secretSafeTextSchema.optional(),
  tool: secretSafeTextSchema.optional()
}).strict();

const governancePolicyInstalledPayloadSchema = z.object({
  policyId: z.string().regex(/^gov_policy_[a-zA-Z0-9_-]+$/),
  version: z.string().min(1),
  installedBy: z.string().min(3),
  confidenceThreshold: z.number().min(0).max(1),
  tags: z.array(z.object({
    tag: governanceTagSchema,
    description: secretSafeTextSchema,
    defaultExportBehavior: z.enum(["include-by-default", "exclude-unless-opted-in"]),
    unlocksNormalWorkflowsAtHighConfidence: z.boolean()
  }).strict()).min(1)
}).strict();

const evidenceGovernanceClassifiedPayloadSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  evidenceEventId: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  policy: governancePolicyRefSchema,
  classifier: governanceClassifierSchema,
  tags: z.array(governanceTagDecisionSchema).min(1)
}).strict();

const evidenceGovernanceReviewedPayloadSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  reviewedBy: z.string().min(3),
  policy: governancePolicyRefSchema,
  decisions: z.array(z.object({
    tag: governanceTagSchema,
    action: z.enum(["affirm", "add", "remove", "supersede"]),
    rationale: secretSafeTextSchema,
    supersedesEventId: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/).optional()
  }).strict()).min(1)
}).strict();
```

Add the redaction/quarantine/tombstone, network/device, export/report, and incident schemas with the same secret-safe text and strict object style:

```ts
const evidenceRedactionAppliedPayloadSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  redactionId: z.string().regex(/^redaction_[a-zA-Z0-9_-]+$/),
  appliedBy: z.string().min(3),
  rationale: secretSafeTextSchema,
  redactedContentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()
}).strict();

const evidenceQuarantinedPayloadSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  quarantineId: z.string().regex(/^quarantine_[a-zA-Z0-9_-]+$/),
  quarantinedBy: z.string().min(3),
  reason: secretSafeTextSchema,
  lockLevel: z.enum(["workflow", "export", "all"])
}).strict();

const evidenceTombstonedPayloadSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  tombstoneId: z.string().regex(/^tombstone_[a-zA-Z0-9_-]+$/),
  tombstonedBy: z.string().min(3),
  reason: secretSafeTextSchema
}).strict();

const networkExposureEnabledPayloadSchema = z.object({
  exposureId: z.string().regex(/^netexp_[a-zA-Z0-9_-]+$/),
  mode: z.enum(["lan", "tailnet"]),
  bindScope: z.enum(["lan", "tailnet"]),
  enabledBy: z.string().min(3),
  enabledAt: z.string().datetime(),
  visibleWarning: z.literal(true),
  policy: governancePolicyRefSchema
}).strict();

const networkExposureDisabledPayloadSchema = z.object({
  exposureId: z.string().regex(/^netexp_[a-zA-Z0-9_-]+$/),
  disabledBy: z.string().min(3),
  disabledAt: z.string().datetime(),
  reason: secretSafeTextSchema
}).strict();

const deviceSessionApprovedPayloadSchema = z.object({
  sessionId: z.string().regex(/^devsess_[a-zA-Z0-9_-]+$/),
  deviceLabel: secretSafeTextSchema,
  approvedBy: z.string().min(3),
  approvedAt: z.string().datetime(),
  exposureId: z.string().regex(/^netexp_[a-zA-Z0-9_-]+$/),
  capabilities: z.array(z.enum(["read", "write"])).min(1),
  policy: governancePolicyRefSchema
}).strict();

const deviceSessionRevokedPayloadSchema = z.object({
  sessionId: z.string().regex(/^devsess_[a-zA-Z0-9_-]+$/),
  revokedBy: z.string().min(3),
  revokedAt: z.string().datetime(),
  reason: secretSafeTextSchema
}).strict();
```

Add export/report and incident schemas:

```ts
const sensitiveOptInSchema = z.object({
  tag: governanceTagSchema,
  approvedBy: z.string().min(3),
  rationale: secretSafeTextSchema
}).strict();

const exportGeneratedPayloadSchema = z.object({
  exportId: z.string().regex(/^exp_[a-zA-Z0-9_-]+$/),
  generatedBy: z.string().min(3),
  generatedAt: z.string().datetime(),
  policy: governancePolicyRefSchema,
  includedEvidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)),
  includedContentHashes: z.array(z.string().regex(/^sha256:[a-f0-9]{64}$/)),
  sensitiveOptIns: z.array(sensitiveOptInSchema),
  defaultPublicSafeOnly: z.boolean()
}).strict();

const reportGeneratedPayloadSchema = exportGeneratedPayloadSchema.extend({
  reportId: z.string().regex(/^report_[a-zA-Z0-9_-]+$/)
}).strict();

const incidentRecordedPayloadSchema = z.object({
  incidentId: z.string().regex(/^incident_[a-zA-Z0-9_-]+$/),
  severity: z.enum(["info", "warning", "error", "critical"]),
  category: z.enum(["classification", "secret-leak", "export", "network", "device", "quarantine", "projection"]),
  recordedBy: z.string().min(3),
  summary: secretSafeTextSchema,
  relatedEvidenceIds: z.array(z.string().regex(/^ev_[a-zA-Z0-9_-]+$/)),
  relatedEventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/))
}).strict();

const incidentRepairRecordedPayloadSchema = z.object({
  incidentId: z.string().regex(/^incident_[a-zA-Z0-9_-]+$/),
  repairId: z.string().regex(/^repair_[a-zA-Z0-9_-]+$/),
  repairedBy: z.string().min(3),
  repairedAt: z.string().datetime(),
  action: secretSafeTextSchema,
  closesIncident: z.boolean()
}).strict();
```

Wire every schema into `payloadSchemas` and add matching `eventContracts` entries with descriptions, guidance, and invariants. Extend `diagnosticRecordedPayloadSchema.category` to include `"governance"`, `"security"`, `"export"`, `"network"`, and `"incident"`.

- [ ] **Step 6: Run the targeted test**

Run:

```bash
npm test -- packages/ontology/test/contracts.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS with typecheck, tests, UI build, and factory readiness passing.

- [ ] **Step 8: Commit**

Update the claim with red/green command evidence and status `ready-for-review`, then commit:

```bash
git add packages/ontology/src/contracts.ts packages/ontology/test/contracts.test.ts docs/agentic/claims/task-1-governance-event-contracts.md
git commit -m "feat: add governance event contracts"
```

## Task 2: Add Governance Policy Helpers

**Files:**

- Create: `packages/ontology/src/governance-policy.ts`
- Modify: `packages/ontology/src/index.ts`
- Create: `packages/ontology/test/governance-policy.test.ts`
- Create: `docs/agentic/claims/task-2-governance-policy.md`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-governance-policy.md` with status `claimed`, owned files above, and required commands:

```bash
npm test -- packages/ontology/test/governance-policy.test.ts
npm run verify
```

Commit:

```bash
git add docs/agentic/claims/task-2-governance-policy.md
git commit -m "chore: claim task 2 governance policy"
```

- [ ] **Step 2: Mark the claim in progress**

Set status to `in-progress` and commit:

```bash
git add docs/agentic/claims/task-2-governance-policy.md
git commit -m "chore: start task 2 governance policy"
```

- [ ] **Step 3: Write failing policy tests**

Create `packages/ontology/test/governance-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  assertSecretSafeText,
  defaultGovernancePolicy,
  governanceTags,
  isHighConfidence,
  publicSafeDefaultTags,
  restrictedExportTags,
  validateGovernancePolicy
} from "../src/governance-policy.js";

describe("governance policy helpers", () => {
  it("defines independent governance tags and export defaults", () => {
    expect(governanceTags).toContain("public_record");
    expect(governanceTags).toContain("contains_pii");
    expect(governanceTags).toContain("source_identity");
    expect(publicSafeDefaultTags).toEqual(["public_safe"]);
    expect(restrictedExportTags).toContain("contains_pii");
    expect(restrictedExportTags).toContain("private_correspondence");
  });

  it("validates the default policy", () => {
    expect(validateGovernancePolicy(defaultGovernancePolicy)).toEqual(defaultGovernancePolicy);
  });

  it("uses a visible high-confidence threshold", () => {
    expect(isHighConfidence(0.94, defaultGovernancePolicy)).toBe(true);
    expect(isHighConfidence(0.79, defaultGovernancePolicy)).toBe(false);
  });

  it("rejects secret-bearing policy text", () => {
    expect(() => assertSecretSafeText("rotate access_token abc123")).toThrow(
      "Governance text must not contain secrets"
    );
  });
});
```

- [ ] **Step 4: Run the failing test**

Run:

```bash
npm test -- packages/ontology/test/governance-policy.test.ts
```

Expected: FAIL because `governance-policy.ts` does not exist.

- [ ] **Step 5: Add policy helpers**

Create `packages/ontology/src/governance-policy.ts`:

```ts
import { z } from "zod";

export const governanceTags = [
  "public_record",
  "public_safe",
  "contains_pii",
  "source_identity",
  "private_correspondence",
  "legal_risk",
  "credential_risk",
  "export_restricted",
  "law_enforcement_sensitive"
] as const;

export type GovernanceTag = (typeof governanceTags)[number];

export const publicSafeDefaultTags = ["public_safe"] as const satisfies readonly GovernanceTag[];

export const restrictedExportTags = [
  "contains_pii",
  "source_identity",
  "private_correspondence",
  "legal_risk",
  "credential_risk",
  "export_restricted",
  "law_enforcement_sensitive"
] as const satisfies readonly GovernanceTag[];

const secretTextPattern =
  /(?:^|[^a-z0-9])(?:access[\s._-]*token|api[\s._-]*key|authorization|bearer|token|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth|credential)(?:$|[^a-z0-9])/i;

const governanceTagSchema = z.enum(governanceTags);

const governancePolicySchema = z.object({
  policyId: z.string().regex(/^gov_policy_[a-zA-Z0-9_-]+$/),
  version: z.string().min(1),
  confidenceThreshold: z.number().min(0).max(1),
  tags: z.array(z.object({
    tag: governanceTagSchema,
    description: z.string().min(1),
    defaultExportBehavior: z.enum(["include-by-default", "exclude-unless-opted-in"]),
    unlocksNormalWorkflowsAtHighConfidence: z.boolean()
  }).strict()).min(1)
}).strict();

export type GovernancePolicy = z.infer<typeof governancePolicySchema>;

export const defaultGovernancePolicy: GovernancePolicy = {
  policyId: "gov_policy_default",
  version: "0.1.0",
  confidenceThreshold: 0.9,
  tags: [
    {
      tag: "public_record",
      description: "Evidence obtained from public records, public datasets, public websites, or public proceedings.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    },
    {
      tag: "public_safe",
      description: "Evidence safe for default export or report inclusion under the active governance policy.",
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
      description: "Evidence that may identify a confidential source, requester, witness, or vulnerable person.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    },
    {
      tag: "private_correspondence",
      description: "Evidence containing private messages, mailbox content, or non-public correspondence.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    },
    {
      tag: "legal_risk",
      description: "Evidence that may affect legal posture, escalation, privilege, defamation risk, or legal strategy.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    },
    {
      tag: "credential_risk",
      description: "Evidence that appears to contain secrets, tokens, passwords, keys, sessions, or credential configuration.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    },
    {
      tag: "export_restricted",
      description: "Evidence excluded from public-safe exports unless a user explicitly opts in.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    },
    {
      tag: "law_enforcement_sensitive",
      description: "Evidence with sensitive law-enforcement, victim, witness, investigatory, or tactical content.",
      defaultExportBehavior: "exclude-unless-opted-in",
      unlocksNormalWorkflowsAtHighConfidence: true
    }
  ]
};

export function validateGovernancePolicy(policy: unknown): GovernancePolicy {
  const result = governancePolicySchema.safeParse(policy);
  if (!result.success) {
    throw new Error(`Invalid governance policy: ${result.error.message}`);
  }
  for (const entry of result.data.tags) {
    assertSecretSafeText(entry.description);
  }
  return result.data;
}

export function isHighConfidence(confidence: number, policy: GovernancePolicy = defaultGovernancePolicy): boolean {
  return confidence >= policy.confidenceThreshold;
}

export function assertSecretSafeText(value: string): string {
  if (secretTextPattern.test(value)) {
    throw new Error("Governance text must not contain secrets");
  }
  return value;
}
```

Export it from `packages/ontology/src/index.ts`:

```ts
export * from "./governance-policy.js";
```

- [ ] **Step 6: Run the targeted test**

Run:

```bash
npm test -- packages/ontology/test/governance-policy.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 8: Commit**

Update the claim with evidence and status `ready-for-review`, then commit:

```bash
git add packages/ontology/src/governance-policy.ts packages/ontology/src/index.ts packages/ontology/test/governance-policy.test.ts docs/agentic/claims/task-2-governance-policy.md
git commit -m "feat: add governance policy helpers"
```

## Task 3: Add Governance Service Append Helpers

**Files:**

- Create: `packages/ontology/src/governance-service.ts`
- Modify: `packages/ontology/src/index.ts`
- Create: `packages/ontology/test/governance-service.test.ts`
- Create: `docs/agentic/claims/task-3-governance-service.md`

- [ ] **Step 1: Claim and start the task**

Create the claim with owned files and required commands:

```bash
npm test -- packages/ontology/test/governance-service.test.ts
npm run verify
```

Commit claim status `claimed`, then update to `in-progress` and commit before editing source/test files.

- [ ] **Step 2: Write failing service tests**

Create `packages/ontology/test/governance-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../src/event-ledger.js";
import { GovernanceService } from "../src/governance-service.js";

const actor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };
const classifier = { id: "actor_classifier", kind: "extractor" as const, label: "Governance classifier" };
const contentHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function appendEvidence(ledger: InMemoryEventLedger) {
  return ledger.append({
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_source_001",
    context: {
      actor,
      occurredAt: "2026-07-05T12:00:00.000Z",
      correlationId: "corr_ev_source_001",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      evidenceId: "ev_source_001",
      source: { kind: "file", label: "source.pdf" },
      contentHash,
      mediaType: "application/pdf",
      sizeBytes: 42
    }
  });
}

describe("GovernanceService", () => {
  it("classifies evidence with causation to the evidence event", async () => {
    const ledger = new InMemoryEventLedger();
    const evidence = await appendEvidence(ledger);
    const service = new GovernanceService({ ledger, actor: classifier });

    const event = await service.classifyEvidence({
      evidenceId: "ev_source_001",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: {
        actorId: "actor_classifier",
        kind: "ai",
        label: "Cestus governance classifier",
        model: "local-fixture-model"
      },
      tags: [
        { tag: "public_record", confidence: 0.96, rationale: "Produced by a public agency." },
        { tag: "contains_pii", confidence: 0.91, rationale: "Names and addresses are visible." }
      ]
    });

    expect(event.type).toBe("evidence.governance.classified");
    expect(event.context.causationId).toBe(evidence.id);
    expect(event.payload.contentHash).toBe(contentHash);
  });

  it("rejects classification when the evidence event is missing", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new GovernanceService({ ledger, actor: classifier });

    await expect(service.classifyEvidence({
      evidenceId: "ev_missing",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
      tags: [{ tag: "public_record", confidence: 0.96, rationale: "Public agency source." }]
    })).rejects.toThrow("Cannot classify evidence ev_missing without evidence.ingested");
  });

  it("records a human governance review after classification", async () => {
    const ledger = new InMemoryEventLedger();
    const evidence = await appendEvidence(ledger);
    const service = new GovernanceService({ ledger, actor: classifier });
    const classified = await service.classifyEvidence({
      evidenceId: "ev_source_001",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
      tags: [{ tag: "public_record", confidence: 0.96, rationale: "Public agency source." }]
    });

    const reviewService = new GovernanceService({ ledger, actor });
    const reviewed = await reviewService.reviewEvidenceGovernance({
      evidenceId: "ev_source_001",
      reviewedBy: "actor_investigator",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      decisions: [
        {
          tag: "public_safe",
          action: "add",
          rationale: "Reviewed and safe for public report defaults.",
          supersedesEventId: classified.id
        }
      ]
    });

    expect(reviewed.context.causationId).toBe(classified.id);
    expect((await ledger.readStream("evidence_ev_source_001")).map((event) => event.type)).toEqual([
      "evidence.ingested",
      "evidence.governance.classified",
      "evidence.governance.reviewed"
    ]);
    expect(evidence.payload.contentHash).toBe(contentHash);
  });

  it("rejects secret-bearing rationale before append", async () => {
    const ledger = new InMemoryEventLedger();
    await appendEvidence(ledger);
    const service = new GovernanceService({ ledger, actor: classifier });

    await expect(service.classifyEvidence({
      evidenceId: "ev_source_001",
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Classifier" },
      tags: [{ tag: "credential_risk", confidence: 0.96, rationale: "Found password abc123." }]
    })).rejects.toThrow("Governance text must not contain secrets");
  });
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
npm test -- packages/ontology/test/governance-service.test.ts
```

Expected: FAIL because `governance-service.ts` does not exist.

- [ ] **Step 4: Add the service**

Create `packages/ontology/src/governance-service.ts`:

```ts
import type { z } from "zod";
import {
  actorRefSchema,
  type AppendableKnowledgeEvent,
  type KnowledgeEventOf
} from "./contracts.js";
import type { EventLedger } from "./event-ledger.js";
import { assertSecretSafeText } from "./governance-policy.js";

type ActorRef = z.infer<typeof actorRefSchema>;
type PolicyRef = { policyId: string; version: string };
type GovernanceTag =
  | "public_record"
  | "public_safe"
  | "contains_pii"
  | "source_identity"
  | "private_correspondence"
  | "legal_risk"
  | "credential_risk"
  | "export_restricted"
  | "law_enforcement_sensitive";

interface GovernanceServiceDependencies {
  ledger: EventLedger;
  actor: ActorRef;
}

interface ClassifyEvidenceInput {
  evidenceId: string;
  policy: PolicyRef;
  classifier: {
    actorId: string;
    kind: "ai" | "human" | "system" | "ruleset";
    label: string;
    model?: string;
    tool?: string;
  };
  tags: Array<{ tag: GovernanceTag; confidence: number; rationale: string }>;
}

interface ReviewEvidenceGovernanceInput {
  evidenceId: string;
  reviewedBy: string;
  policy: PolicyRef;
  decisions: Array<{
    tag: GovernanceTag;
    action: "affirm" | "add" | "remove" | "supersede";
    rationale: string;
    supersedesEventId?: string;
  }>;
}

export class GovernanceService {
  private readonly actor: ActorRef;

  constructor(private readonly dependencies: GovernanceServiceDependencies) {
    const actor = actorRefSchema.safeParse(dependencies.actor);
    if (!actor.success) {
      throw new Error(`Invalid governance actor: ${actor.error.message}`);
    }
    this.actor = actor.data;
  }

  async classifyEvidence(input: ClassifyEvidenceInput): Promise<KnowledgeEventOf<"evidence.governance.classified">> {
    const evidence = await this.findEvidence(input.evidenceId);
    if (evidence === undefined) {
      throw new Error(`Cannot classify evidence ${input.evidenceId} without evidence.ingested`);
    }

    const event: AppendableKnowledgeEvent<"evidence.governance.classified"> = {
      type: "evidence.governance.classified",
      version: 1,
      streamId: this.evidenceStreamId(input.evidenceId),
      context: this.context(`corr_governance_${input.evidenceId}`, evidence.id),
      payload: {
        evidenceId: input.evidenceId,
        evidenceEventId: evidence.id,
        contentHash: evidence.payload.contentHash,
        policy: input.policy,
        classifier: {
          ...input.classifier,
          label: assertSecretSafeText(input.classifier.label),
          ...(input.classifier.model === undefined ? {} : { model: assertSecretSafeText(input.classifier.model) }),
          ...(input.classifier.tool === undefined ? {} : { tool: assertSecretSafeText(input.classifier.tool) })
        },
        tags: input.tags.map((tag) => ({
          ...tag,
          rationale: assertSecretSafeText(tag.rationale)
        }))
      }
    };

    const appended = await this.dependencies.ledger.append(event);
    if (appended.type !== "evidence.governance.classified") {
      throw new Error(`Unexpected event type appended for governance classification: ${appended.type}`);
    }
    return appended;
  }

  async reviewEvidenceGovernance(
    input: ReviewEvidenceGovernanceInput
  ): Promise<KnowledgeEventOf<"evidence.governance.reviewed">> {
    const streamEvents = await this.dependencies.ledger.readStream(this.evidenceStreamId(input.evidenceId));
    const causation = [...streamEvents].reverse().find((event) =>
      event.type === "evidence.governance.classified" || event.type === "evidence.governance.reviewed"
    );
    if (causation === undefined) {
      throw new Error(`Cannot review evidence ${input.evidenceId} without governance classification`);
    }

    const event: AppendableKnowledgeEvent<"evidence.governance.reviewed"> = {
      type: "evidence.governance.reviewed",
      version: 1,
      streamId: this.evidenceStreamId(input.evidenceId),
      context: this.context(causation.context.correlationId, causation.id),
      payload: {
        evidenceId: input.evidenceId,
        reviewedBy: input.reviewedBy,
        policy: input.policy,
        decisions: input.decisions.map((decision) => ({
          ...decision,
          rationale: assertSecretSafeText(decision.rationale)
        }))
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: streamEvents.length + 1
    });
    if (appended.type !== "evidence.governance.reviewed") {
      throw new Error(`Unexpected event type appended for governance review: ${appended.type}`);
    }
    return appended;
  }

  private async findEvidence(evidenceId: string): Promise<KnowledgeEventOf<"evidence.ingested"> | undefined> {
    const events = await this.dependencies.ledger.readStream(this.evidenceStreamId(evidenceId));
    return events.find(
      (event): event is KnowledgeEventOf<"evidence.ingested"> =>
        event.type === "evidence.ingested" && event.payload.evidenceId === evidenceId
    );
  }

  private evidenceStreamId(evidenceId: string): string {
    return `evidence_${evidenceId}`;
  }

  private context(correlationId: string, causationId?: string): AppendableKnowledgeEvent["context"] {
    return {
      actor: this.actor,
      occurredAt: new Date().toISOString(),
      ...(causationId === undefined ? {} : { causationId }),
      correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    };
  }
}
```

Export it from `packages/ontology/src/index.ts`:

```ts
export * from "./governance-service.js";
```

- [ ] **Step 5: Run the targeted test**

Run:

```bash
npm test -- packages/ontology/test/governance-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 7: Commit**

Update the claim with evidence and status `ready-for-review`, then commit:

```bash
git add packages/ontology/src/governance-service.ts packages/ontology/src/index.ts packages/ontology/test/governance-service.test.ts docs/agentic/claims/task-3-governance-service.md
git commit -m "feat: add governance service"
```

## Task 4: Add Governance Projection

**Files:**

- Create: `packages/ontology/src/governance-projection.ts`
- Modify: `packages/ontology/src/index.ts`
- Create: `packages/ontology/test/governance-projection.test.ts`
- Create: `packages/ontology/test/fixtures/golden-governance-ledger.ts`
- Create: `docs/agentic/claims/task-4-governance-projection.md`

- [ ] **Step 1: Claim and start the task**

Create the claim with owned files and commands:

```bash
npm test -- packages/ontology/test/governance-projection.test.ts
npm run verify
```

Commit `claimed`, then `in-progress`.

- [ ] **Step 2: Write failing projection tests and fixture**

Create `packages/ontology/test/fixtures/golden-governance-ledger.ts` with validated events covering one public-safe artifact, one PII artifact, one human override, one quarantine, and one tombstone. Use fixed event IDs and sequences so workers can reason about replay order.

Create `packages/ontology/test/governance-projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGovernanceProjection } from "../src/governance-projection.js";
import { validateKnowledgeEvent } from "../src/contracts.js";
import { goldenGovernanceLedgerEvents } from "./fixtures/golden-governance-ledger.js";

describe("governance projection", () => {
  it("uses only valid golden governance events", () => {
    expect(goldenGovernanceLedgerEvents.every((event) => validateKnowledgeEvent(event).success)).toBe(true);
  });

  it("rebuilds current governance tags from AI classification and human review", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    const source = projection.evidenceGovernance.get("ev_source_public");

    expect(source?.currentTags.get("public_record")).toMatchObject({
      tag: "public_record",
      status: "active",
      source: "ai"
    });
    expect(source?.currentTags.get("public_safe")).toMatchObject({
      tag: "public_safe",
      status: "active",
      source: "human"
    });
  });

  it("keeps sensitive evidence out of default public-safe exports", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);

    expect(projection.publicSafeEvidenceIds()).toEqual(["ev_source_public"]);
    expect(projection.requiresExportOptIn("ev_source_private")).toBe(true);
  });

  it("projects quarantine and tombstone state without deleting history", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);

    expect(projection.evidenceGovernance.get("ev_source_private")?.quarantined).toBe(true);
    expect(projection.evidenceGovernance.get("ev_source_removed")?.tombstoned).toBe(true);
    expect(projection.evidenceGovernance.has("ev_source_removed")).toBe(true);
  });

  it("returns immutable projection snapshots", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    expect(() => projection.evidenceGovernance.set("ev_mutated", projection.evidenceGovernance.values().next().value)).toThrow(
      "GovernanceProjection.evidenceGovernance is read-only"
    );
  });
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
npm test -- packages/ontology/test/governance-projection.test.ts
```

Expected: FAIL because `governance-projection.ts` does not exist.

- [ ] **Step 4: Add the projection**

Create `packages/ontology/src/governance-projection.ts`:

```ts
import type { KnowledgeEvent } from "./contracts.js";
import { defaultGovernancePolicy, isHighConfidence, restrictedExportTags, type GovernanceTag } from "./governance-policy.js";

export interface ProjectedGovernanceTag {
  readonly tag: GovernanceTag;
  readonly confidence: number;
  readonly rationale: string;
  readonly source: "ai" | "human";
  readonly status: "active" | "removed";
  readonly eventId: string;
}

export interface EvidenceGovernanceState {
  readonly evidenceId: string;
  readonly currentTags: ReadonlyMap<GovernanceTag, ProjectedGovernanceTag>;
  readonly classifiedEventIds: readonly string[];
  readonly reviewedEventIds: readonly string[];
  readonly quarantined: boolean;
  readonly tombstoned: boolean;
}

export interface GovernanceProjection {
  readonly evidenceGovernance: ReadonlyMap<string, EvidenceGovernanceState>;
  publicSafeEvidenceIds(): readonly string[];
  requiresExportOptIn(evidenceId: string): boolean;
}

export function buildGovernanceProjection(events: readonly KnowledgeEvent[]): GovernanceProjection {
  const mutable = new Map<string, MutableEvidenceGovernanceState>();

  for (const event of events) {
    switch (event.type) {
      case "evidence.ingested":
        ensureState(mutable, event.payload.evidenceId);
        break;
      case "evidence.governance.classified":
        applyClassification(ensureState(mutable, event.payload.evidenceId), event);
        break;
      case "evidence.governance.reviewed":
        applyReview(ensureState(mutable, event.payload.evidenceId), event);
        break;
      case "evidence.quarantined":
        ensureState(mutable, event.payload.evidenceId).quarantined = true;
        break;
      case "evidence.tombstoned":
        ensureState(mutable, event.payload.evidenceId).tombstoned = true;
        break;
      default:
        break;
    }
  }

  const evidenceGovernance = readOnlyMap(
    new Map([...mutable.entries()].map(([key, value]) => [key, freezeState(value)]))
  );

  return Object.freeze({
    evidenceGovernance,
    publicSafeEvidenceIds() {
      return Object.freeze(
        [...evidenceGovernance.values()]
          .filter((state) => hasActiveTag(state, "public_safe"))
          .filter((state) => !state.quarantined && !state.tombstoned)
          .map((state) => state.evidenceId)
          .sort()
      );
    },
    requiresExportOptIn(evidenceId: string) {
      const state = evidenceGovernance.get(evidenceId);
      if (state === undefined || state.quarantined || state.tombstoned) {
        return true;
      }
      return restrictedExportTags.some((tag) => hasActiveTag(state, tag));
    }
  });
}

interface MutableEvidenceGovernanceState {
  evidenceId: string;
  currentTags: Map<GovernanceTag, ProjectedGovernanceTag>;
  classifiedEventIds: string[];
  reviewedEventIds: string[];
  quarantined: boolean;
  tombstoned: boolean;
}

function ensureState(states: Map<string, MutableEvidenceGovernanceState>, evidenceId: string): MutableEvidenceGovernanceState {
  const existing = states.get(evidenceId);
  if (existing !== undefined) {
    return existing;
  }
  const created: MutableEvidenceGovernanceState = {
    evidenceId,
    currentTags: new Map(),
    classifiedEventIds: [],
    reviewedEventIds: [],
    quarantined: false,
    tombstoned: false
  };
  states.set(evidenceId, created);
  return created;
}

function applyClassification(
  state: MutableEvidenceGovernanceState,
  event: Extract<KnowledgeEvent, { type: "evidence.governance.classified" }>
): void {
  state.classifiedEventIds.push(event.id);
  for (const tag of event.payload.tags) {
    if (!isHighConfidence(tag.confidence, defaultGovernancePolicy)) {
      continue;
    }
    state.currentTags.set(tag.tag, Object.freeze({
      tag: tag.tag,
      confidence: tag.confidence,
      rationale: tag.rationale,
      source: "ai",
      status: "active",
      eventId: event.id
    }));
  }
}

function applyReview(
  state: MutableEvidenceGovernanceState,
  event: Extract<KnowledgeEvent, { type: "evidence.governance.reviewed" }>
): void {
  state.reviewedEventIds.push(event.id);
  for (const decision of event.payload.decisions) {
    if (decision.action === "remove") {
      state.currentTags.set(decision.tag, Object.freeze({
        tag: decision.tag,
        confidence: 1,
        rationale: decision.rationale,
        source: "human",
        status: "removed",
        eventId: event.id
      }));
      continue;
    }
    state.currentTags.set(decision.tag, Object.freeze({
      tag: decision.tag,
      confidence: 1,
      rationale: decision.rationale,
      source: "human",
      status: "active",
      eventId: event.id
    }));
  }
}

function hasActiveTag(state: EvidenceGovernanceState, tag: GovernanceTag): boolean {
  return state.currentTags.get(tag)?.status === "active";
}

function freezeState(state: MutableEvidenceGovernanceState): EvidenceGovernanceState {
  return Object.freeze({
    evidenceId: state.evidenceId,
    currentTags: readOnlyMap(new Map(state.currentTags)),
    classifiedEventIds: Object.freeze([...state.classifiedEventIds]),
    reviewedEventIds: Object.freeze([...state.reviewedEventIds]),
    quarantined: state.quarantined,
    tombstoned: state.tombstoned
  });
}

function readOnlyMap<Key, Value>(source: Map<Key, Value>): ReadonlyMap<Key, Value> {
  return new Proxy(source, {
    get(target, property, receiver) {
      if (property === "set" || property === "delete" || property === "clear") {
        return () => {
          throw new TypeError("GovernanceProjection.evidenceGovernance is read-only; rebuild the projection from ledger events instead.");
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}
```

Export it:

```ts
export * from "./governance-projection.js";
```

- [ ] **Step 5: Run the targeted test**

Run:

```bash
npm test -- packages/ontology/test/governance-projection.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 7: Commit**

Update the claim with evidence and status `ready-for-review`, then commit:

```bash
git add packages/ontology/src/governance-projection.ts packages/ontology/src/index.ts packages/ontology/test/governance-projection.test.ts packages/ontology/test/fixtures/golden-governance-ledger.ts docs/agentic/claims/task-4-governance-projection.md
git commit -m "feat: add governance projection"
```

## Task 5: Add Export And Report Governance Helpers

**Files:**

- Modify: `packages/ontology/src/governance-service.ts`
- Modify: `packages/ontology/src/governance-projection.ts`
- Create: `packages/ontology/test/governance-export.test.ts`
- Create: `docs/agentic/claims/task-5-governance-export.md`

- [ ] **Step 1: Claim and start the task**

Create the claim with owned files and commands:

```bash
npm test -- packages/ontology/test/governance-export.test.ts packages/ontology/test/governance-service.test.ts packages/ontology/test/governance-projection.test.ts
npm run verify
```

Commit `claimed`, then `in-progress`.

- [ ] **Step 2: Write failing export tests**

Create `packages/ontology/test/governance-export.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGovernanceProjection } from "../src/governance-projection.js";
import { goldenGovernanceLedgerEvents } from "./fixtures/golden-governance-ledger.js";

describe("governed exports and reports", () => {
  it("includes only public-safe evidence by default", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    expect(projection.buildDefaultExportEvidenceIds()).toEqual(["ev_source_public"]);
  });

  it("requires opt-in tags before restricted evidence can be included", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
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
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    const result = projection.planExport({
      requestedEvidenceIds: ["ev_source_private"],
      sensitiveOptInTags: ["contains_pii", "private_correspondence"]
    });

    expect(result.includedEvidenceIds).toEqual(["ev_source_private"]);
    expect(result.blockedEvidence).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
npm test -- packages/ontology/test/governance-export.test.ts packages/ontology/test/governance-projection.test.ts
```

Expected: FAIL because export planning methods are not on the projection.

- [ ] **Step 4: Add export planning methods**

Extend `GovernanceProjection` in `packages/ontology/src/governance-projection.ts`:

```ts
export interface ExportPlanInput {
  readonly requestedEvidenceIds: readonly string[];
  readonly sensitiveOptInTags: readonly GovernanceTag[];
}

export interface ExportPlan {
  readonly includedEvidenceIds: readonly string[];
  readonly blockedEvidence: readonly Array<{
    readonly evidenceId: string;
    readonly requiredOptInTags: readonly GovernanceTag[];
  }>;
}
```

Add methods to the returned projection:

```ts
buildDefaultExportEvidenceIds() {
  return this.publicSafeEvidenceIds();
},
planExport(input: ExportPlanInput): ExportPlan {
  const includedEvidenceIds: string[] = [];
  const blockedEvidence: Array<{ evidenceId: string; requiredOptInTags: readonly GovernanceTag[] }> = [];
  const optIns = new Set(input.sensitiveOptInTags);

  for (const evidenceId of input.requestedEvidenceIds) {
    const state = evidenceGovernance.get(evidenceId);
    if (state === undefined || state.quarantined || state.tombstoned) {
      blockedEvidence.push({ evidenceId, requiredOptInTags: [...restrictedExportTags] });
      continue;
    }
    const activeRestrictedTags = restrictedExportTags.filter((tag) => hasActiveTag(state, tag));
    const missing = activeRestrictedTags.filter((tag) => !optIns.has(tag));
    if (missing.length > 0) {
      blockedEvidence.push({ evidenceId, requiredOptInTags: Object.freeze([...missing]) });
      continue;
    }
    if (hasActiveTag(state, "public_safe") || activeRestrictedTags.length > 0) {
      includedEvidenceIds.push(evidenceId);
    }
  }

  return Object.freeze({
    includedEvidenceIds: Object.freeze([...includedEvidenceIds].sort()),
    blockedEvidence: Object.freeze(blockedEvidence.map((blocked) => Object.freeze({
      evidenceId: blocked.evidenceId,
      requiredOptInTags: Object.freeze([...blocked.requiredOptInTags].sort())
    })))
  });
}
```

Add `recordExportGenerated()` and `recordReportGenerated()` to `GovernanceService` using the event contracts from Task 1. The service must require explicit `sensitiveOptIns` for restricted evidence and must reject export/report generation for quarantined or tombstoned evidence.

- [ ] **Step 5: Run the targeted tests**

Run:

```bash
npm test -- packages/ontology/test/governance-export.test.ts packages/ontology/test/governance-service.test.ts packages/ontology/test/governance-projection.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 7: Commit**

Update the claim and commit:

```bash
git add packages/ontology/src/governance-service.ts packages/ontology/src/governance-projection.ts packages/ontology/test/governance-export.test.ts docs/agentic/claims/task-5-governance-export.md
git commit -m "feat: enforce governed export defaults"
```

## Task 6: Add Network Exposure And Device Approval Projection

**Files:**

- Modify: `packages/ontology/src/governance-service.ts`
- Modify: `packages/ontology/src/governance-projection.ts`
- Create: `packages/ontology/test/governance-network.test.ts`
- Modify: `packages/ontology/test/fixtures/golden-governance-ledger.ts`
- Create: `docs/agentic/claims/task-6-governance-network.md`

- [ ] **Step 1: Claim and start the task**

Create the claim with owned files and commands:

```bash
npm test -- packages/ontology/test/governance-network.test.ts packages/ontology/test/governance-projection.test.ts
npm run verify
```

Commit `claimed`, then `in-progress`.

- [ ] **Step 2: Write failing network tests**

Create `packages/ontology/test/governance-network.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGovernanceProjection } from "../src/governance-projection.js";
import { goldenGovernanceLedgerEvents } from "./fixtures/golden-governance-ledger.js";

describe("network exposure and device approval governance", () => {
  it("projects visible LAN or tailnet exposure state", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    expect(projection.networkExposure.activeExposure).toMatchObject({
      exposureId: "netexp_tailnet_001",
      mode: "tailnet",
      visibleWarning: true
    });
  });

  it("requires local approval before a session is trusted", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);

    expect(projection.isSessionApproved("devsess_reporter_laptop")).toBe(true);
    expect(projection.isSessionApproved("devsess_unapproved")).toBe(false);
  });

  it("revocation removes current session approval without deleting the approval event", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);

    expect(projection.isSessionApproved("devsess_revoked_tablet")).toBe(false);
    expect(projection.deviceSessions.get("devsess_revoked_tablet")?.approvalEventId).toBe("evt_device_tablet_approved");
    expect(projection.deviceSessions.get("devsess_revoked_tablet")?.revocationEventId).toBe("evt_device_tablet_revoked");
  });
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
npm test -- packages/ontology/test/governance-network.test.ts packages/ontology/test/governance-projection.test.ts
```

Expected: FAIL because network projection fields are not implemented.

- [ ] **Step 4: Extend fixture, service, and projection**

Add `network.exposure.enabled`, `device.session.approved`, `device.session.revoked`, and optional `network.exposure.disabled` events to `golden-governance-ledger.ts`.

Extend `governance-projection.ts` with:

```ts
export interface NetworkExposureState {
  readonly activeExposure?: {
    readonly exposureId: string;
    readonly mode: "lan" | "tailnet";
    readonly bindScope: "lan" | "tailnet";
    readonly visibleWarning: true;
    readonly eventId: string;
  };
}

export interface DeviceSessionState {
  readonly sessionId: string;
  readonly deviceLabel: string;
  readonly approved: boolean;
  readonly capabilities: readonly ("read" | "write")[];
  readonly approvalEventId: string;
  readonly revocationEventId?: string;
}
```

Handle `network.exposure.enabled`, `network.exposure.disabled`, `device.session.approved`, and `device.session.revoked` during replay. Add `isSessionApproved(sessionId)` to the projection.

Add service methods:

```ts
enableNetworkExposure(input: {
  exposureId: string;
  mode: "lan" | "tailnet";
  bindScope: "lan" | "tailnet";
  enabledBy: string;
  policy: { policyId: string; version: string };
}): Promise<KnowledgeEventOf<"network.exposure.enabled">>

approveDeviceSession(input: {
  sessionId: string;
  deviceLabel: string;
  approvedBy: string;
  exposureId: string;
  capabilities: readonly ("read" | "write")[];
  policy: { policyId: string; version: string };
}): Promise<KnowledgeEventOf<"device.session.approved">>
```

Make `visibleWarning` always `true` in `enableNetworkExposure()`. Do not accept secrets in device labels or reasons.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ontology/test/governance-network.test.ts packages/ontology/test/governance-projection.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 7: Commit**

Update the claim and commit:

```bash
git add packages/ontology/src/governance-service.ts packages/ontology/src/governance-projection.ts packages/ontology/test/governance-network.test.ts packages/ontology/test/fixtures/golden-governance-ledger.ts docs/agentic/claims/task-6-governance-network.md
git commit -m "feat: add network governance projection"
```

## Task 7: Add Incident And Repair Governance

**Files:**

- Modify: `packages/ontology/src/governance-service.ts`
- Modify: `packages/ontology/src/governance-projection.ts`
- Create: `packages/ontology/test/governance-incident.test.ts`
- Modify: `packages/ontology/test/fixtures/golden-governance-ledger.ts`
- Create: `docs/agentic/claims/task-7-governance-incidents.md`

- [ ] **Step 1: Claim and start the task**

Create the claim with owned files and commands:

```bash
npm test -- packages/ontology/test/governance-incident.test.ts packages/ontology/test/governance-projection.test.ts
npm run verify
```

Commit `claimed`, then `in-progress`.

- [ ] **Step 2: Write failing incident tests**

Create `packages/ontology/test/governance-incident.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGovernanceProjection } from "../src/governance-projection.js";
import { goldenGovernanceLedgerEvents } from "./fixtures/golden-governance-ledger.js";

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

  it("keeps incident summaries secret-safe", () => {
    const projection = buildGovernanceProjection(goldenGovernanceLedgerEvents);
    expect([...projection.incidents.values()].every((incident) => !/token|password|secret/i.test(incident.summary))).toBe(true);
  });
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
npm test -- packages/ontology/test/governance-incident.test.ts packages/ontology/test/governance-projection.test.ts
```

Expected: FAIL because incident projection fields are missing.

- [ ] **Step 4: Add incident replay and service helpers**

Add incident and repair events to the golden fixture.

Extend `governance-projection.ts`:

```ts
export interface GovernanceIncidentState {
  readonly incidentId: string;
  readonly severity: "info" | "warning" | "error" | "critical";
  readonly category: "classification" | "secret-leak" | "export" | "network" | "device" | "quarantine" | "projection";
  readonly summary: string;
  readonly status: "open" | "closed";
  readonly incidentEventId: string;
  readonly repairEventIds: readonly string[];
}
```

Replay `incident.recorded` into open incidents. Replay `incident.repair.recorded` by appending repair IDs and closing only when `closesIncident` is `true`. Add:

```ts
openIncidentIds(): readonly string[]
```

Add service methods:

```ts
recordIncident(input: {
  incidentId: string;
  severity: "info" | "warning" | "error" | "critical";
  category: "classification" | "secret-leak" | "export" | "network" | "device" | "quarantine" | "projection";
  recordedBy: string;
  summary: string;
  relatedEvidenceIds: readonly string[];
  relatedEventIds: readonly string[];
}): Promise<KnowledgeEventOf<"incident.recorded">>

recordIncidentRepair(input: {
  incidentId: string;
  repairId: string;
  repairedBy: string;
  action: string;
  closesIncident: boolean;
}): Promise<KnowledgeEventOf<"incident.repair.recorded">>
```

Use `assertSecretSafeText()` for summary and action.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ontology/test/governance-incident.test.ts packages/ontology/test/governance-projection.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 7: Commit**

Update the claim and commit:

```bash
git add packages/ontology/src/governance-service.ts packages/ontology/src/governance-projection.ts packages/ontology/test/governance-incident.test.ts packages/ontology/test/fixtures/golden-governance-ledger.ts docs/agentic/claims/task-7-governance-incidents.md
git commit -m "feat: add governance incident projection"
```

## Task 8: Add Factory Readiness For Governance Plan

**Files:**

- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`
- Create: `docs/agentic/claims/task-8-governance-readiness.md`

- [ ] **Step 1: Claim and start the task**

Create the claim with owned files and commands:

```bash
npm run factory:check
npm run verify
```

Commit `claimed`, then `in-progress`.

- [ ] **Step 2: Write the failing readiness requirement**

Modify `scripts/check-agent-readiness.mjs` by adding these two paths to `requiredFiles`:

```js
"docs/superpowers/specs/2026-07-05-security-threat-model-data-governance-design.md",
"docs/superpowers/plans/2026-07-05-security-threat-model-data-governance-implementation.md"
```

Run:

```bash
npm run factory:check
```

Expected: PASS because both files exist. If it fails, fix only missing path text or readiness-marker language in files owned by this task.

- [ ] **Step 3: Record readiness evidence**

Append a section to `docs/agentic/software-factory.md`:

````markdown
## Security Governance Plan Readiness

The security, threat-model, and data-governance plan was prepared from the approved design spec on 2026-07-05.

Required design and plan files:

- `docs/superpowers/specs/2026-07-05-security-threat-model-data-governance-design.md`
- `docs/superpowers/plans/2026-07-05-security-threat-model-data-governance-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded command evidence:

```text
npm run factory:check
factory-readiness passed
```

Governance implementation scope remains backend/domain work grounded in append-only ontology events. Runtime wiring, UI changes, live credentials, encryption/key management, and ingestion connector work require separate approved plans.
````

- [ ] **Step 4: Run readiness and full verification**

Run:

```bash
npm run factory:check
npm run verify
```

Expected: PASS.

- [ ] **Step 5: Commit**

Update the claim with evidence and status `ready-for-review`, then commit:

```bash
git add scripts/check-agent-readiness.mjs docs/agentic/software-factory.md docs/agentic/claims/task-8-governance-readiness.md
git commit -m "docs: record governance plan readiness"
```

## Review Gates

Every reviewer must check:

- The worker stayed inside the allowed files.
- The task claim was created and committed before source/test edits.
- A failing test or readiness check was recorded before production changes.
- Targeted commands and `npm run verify` passed.
- No event, blob, projection, audit, governance, device, or diagnostic hard-delete path was introduced.
- No secret-like value can be written to ledger events, diagnostics, raw metadata, report metadata, tracked files, or claims.
- AI classification can unlock only normal workflows at high confidence.
- AI classification cannot unlock PRR send, legal escalation, public export with restricted opt-ins, tombstone/redaction/quarantine decisions, or LAN/tailnet device approval.
- Governance projections are rebuildable from ledger events and immutable to callers.
- Public exports default to `public_safe` evidence and require explicit opt-ins for restricted tags.
- LAN/tailnet exposure is visible and new device/session access requires local approval.
- Incident/repair state is append-only and secret-safe.

## Completion Criteria

The implementation is complete when:

- All tasks are committed.
- `npm run verify` passes on the final branch.
- `npm run factory:check` requires the governance spec and plan.
- Contract tests cover every governance event family.
- Governance service tests prove causation, evidence existence checks, human gates, and secret-safe behavior.
- Projection tests rebuild governance, export, network/device, and incident state from golden ledger events.
- Factory readiness evidence is recorded in `docs/agentic/software-factory.md`.
- Fresh review finds no defects, missing tests, spec drift, invariant violations, or verification gaps.
