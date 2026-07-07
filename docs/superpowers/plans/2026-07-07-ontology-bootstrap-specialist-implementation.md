# Ontology Bootstrap Specialist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first testable `ontology-bootstrap` specialist foundation: strict DTO contracts, deterministic read models, a fake dossier generator over existing legacy reports, and tool-preview contracts that preserve zero-trust legacy import gates.

**Architecture:** Create a small pure `packages/ontology-bootstrap` package that composes existing legacy import, ingestion, and ontology contracts without depending on the parallel resident-agent foundation branch. The package produces browser-safe dossier DTOs and approval previews; existing legacy runtime services remain authoritative for inspecting, importing, staging approval, and `assertion.proposed` execution. Once the resident-agent foundation lands, this package can be wrapped by `agent.specialist-run.*`, `agent.tool.*`, and `agent.memory.*` events.

**Tech Stack:** TypeScript, Zod, Vitest, existing `packages/ingestion` legacy report/read API contracts, existing ontology ledger event types, deterministic SHA-256 hashing, Markdown factory work orders.

## Implementation Evidence

Implemented on branch `codex/ontology-bootstrap-specialist` on 2026-07-07 as a pure `packages/ontology-bootstrap` foundation. The completed slice exports strict contracts, dossier builder, read-model helper, tool-preview builders, and fake runtime facade. Verification evidence is recorded in `docs/agentic/claims/task-*-ontology-bootstrap-*.md` and in `docs/agentic/software-factory.md`.

Final focused bundle before readiness tracking:

```bash
npm test -- packages/ontology-bootstrap/test/contracts.test.ts packages/ontology-bootstrap/test/dossier-builder.test.ts packages/ontology-bootstrap/test/read-model.test.ts packages/ontology-bootstrap/test/tool-previews.test.ts packages/ontology-bootstrap/test/fake-runtime.test.ts packages/ingestion/test/legacy-runtime.test.ts packages/ingestion/test/legacy-staging.test.ts
```

The implementation preserves the hard invariant: legacy-derived structure can only surface as evidence-tied dossier, preview, or `assertion.proposed` staging material with exact evidence IDs and content hashes; it cannot produce `assertion.accepted`, entity resolution, accepted relationships, merge/split acceptance, legal/export actions, provider byte transfer, or destructive repair.

---

## Required Reading

Before editing, every worker reads:

1. `AGENTS.md`
2. `.agents/skills/cestus-software-factory/SKILL.md`
3. `docs/agentic/software-factory.md`
4. `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
5. `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
6. `docs/superpowers/specs/2026-07-06-legacy-cestus-import-design.md`
7. `docs/superpowers/plans/2026-07-06-legacy-cestus-import-implementation.md`
8. `docs/superpowers/specs/2026-07-06-legacy-cestus-operator-cli-design.md`
9. `docs/superpowers/plans/2026-07-06-legacy-cestus-operator-cli-implementation.md`
10. `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`
11. `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`
12. `docs/superpowers/specs/2026-07-07-ontology-bootstrap-specialist-design.md`
13. This plan

## Invariants

- Old-Cestus artifacts, graph exports, tags, notes, folder names, and derived metadata are evidence or clues only.
- Legacy-derived structure can at most produce `assertion.proposed` with exact evidence IDs, content hashes, report identity, candidate-set identity, and staging approval provenance.
- This plan must not create a parallel importer, parallel staging service, direct source-tree parser, accepted graph path, legal/export path, provider byte-transfer path, or destructive repair path.
- `assertion.accepted`, `entity.resolved`, `relationship.accepted`, accepted merge or split events, domain-pack promotion, PRR send, legal escalation, export, and publication are forbidden outputs for this specialist.
- The first implementation uses deterministic fake dossier generation. Live model orchestration is out of scope.

## File Map

- `packages/ontology-bootstrap/src/contracts.ts`: Zod schemas, DTO types, phase and failure vocabulary, secret-safe text checks, and strict dossier contracts.
- `packages/ontology-bootstrap/src/dossier-builder.ts`: deterministic dossier builder from `LegacyMigrationReport`, `LegacyMigrationReviewDto`, and evidence-link summaries.
- `packages/ontology-bootstrap/src/read-model.ts`: phase and readiness helpers over legacy review DTOs and optional reports.
- `packages/ontology-bootstrap/src/tool-previews.ts`: stable preview builders and preview hashes for raw import and staging review requests.
- `packages/ontology-bootstrap/src/fake-runtime.ts`: local fake specialist runner that returns a dossier and safe next action without model calls or side effects.
- `packages/ontology-bootstrap/src/index.ts`: public package exports.
- `packages/ontology-bootstrap/test/contracts.test.ts`: strict DTO and secret-safety tests.
- `packages/ontology-bootstrap/test/dossier-builder.test.ts`: deterministic dossier and evidence-binding tests.
- `packages/ontology-bootstrap/test/read-model.test.ts`: phase and failure-state tests.
- `packages/ontology-bootstrap/test/tool-previews.test.ts`: preview hash, approval boundary, and forbidden event tests.
- `packages/ontology-bootstrap/test/fake-runtime.test.ts`: no-side-effect fake runtime tests.
- `packages/ontology-bootstrap/test/fixtures/bootstrap-fixtures.ts`: shared report, review, and evidence-link fixtures.
- `docs/agentic/claims/task-*-ontology-bootstrap-*.md`: durable task claims for implementation workers.
- `scripts/check-agent-readiness.mjs`: add this spec and plan during the final readiness task.
- `docs/agentic/software-factory.md`: record final readiness evidence during the final readiness task.

## Task 1: Ontology Bootstrap DTO Contracts

**Files:**

- Create: `docs/agentic/claims/task-1-ontology-bootstrap-contracts.md`
- Create: `packages/ontology-bootstrap/src/contracts.ts`
- Create: `packages/ontology-bootstrap/src/index.ts`
- Create: `packages/ontology-bootstrap/test/contracts.test.ts`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-ontology-bootstrap-contracts.md`:

```md
# Task 1: Ontology Bootstrap DTO Contracts

Plan: `docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md`
Task: Task 1: Ontology Bootstrap DTO Contracts
Branch: `codex/ontology-bootstrap-specialist`
Status: claimed
Claimed-at: record the current UTC timestamp
Worker: current Codex worker

## Owned Files

- `packages/ontology-bootstrap/src/contracts.ts`
- `packages/ontology-bootstrap/src/index.ts`
- `packages/ontology-bootstrap/test/contracts.test.ts`
```

Commit the claim:

```bash
git add docs/agentic/claims/task-1-ontology-bootstrap-contracts.md
git commit -m "chore: claim ontology bootstrap contracts"
```

- [ ] **Step 2: Mark the claim in progress**

Change `Status: claimed` to `Status: in-progress` in the claim file.

- [ ] **Step 3: Write failing contract tests**

Create `packages/ontology-bootstrap/test/contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ontologyBootstrapDossierSchema,
  ontologyBootstrapFailureSchema,
  ontologyBootstrapToolPreviewSchema,
  ontologyBootstrapPhaseSchema
} from "../src/contracts.js";

const hash = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;

describe("ontology bootstrap contracts", () => {
  it("accepts a strict evidence-tied bootstrap dossier", () => {
    const dossier = ontologyBootstrapDossierSchema.parse({
      schemaVersion: "ontology-bootstrap.v1",
      dossierId: "bootstrap_dossier_src_old_cestus_001",
      generatedAt: "2026-07-07T22:00:00.000Z",
      phase: "staging-review",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: "legacy_report_001",
      reportHash: hash,
      candidateSetHash: hash,
      summary: {
        evidenceFiles: 2,
        importedEvidenceFiles: 1,
        parserDetections: 1,
        eligibleAssertionCandidates: 1,
        blockedAssertionCandidates: 1,
        quarantineEntries: 1,
        localExtensionSuggestions: 0
      },
      evidenceInventory: [
        {
          sourcePath: "ontology/claims.json",
          contentHash: hash,
          mediaType: "application/json",
          sizeBytes: 128,
          imported: true,
          evidenceId: "ev_legacy_claims"
        }
      ],
      parserConfidence: [
        {
          pluginName: "legacy-json-claim-parser",
          pluginVersion: "0.1.0",
          shape: "json-legacy-metadata",
          sourcePath: "ontology/claims.json",
          confidence: 0.8,
          parserEligible: true
        }
      ],
      quarantineGroups: [
        {
          issueCategory: "malformed",
          count: 1,
          sourcePaths: ["ontology/corrupt.json"],
          repairActions: ["Review the legacy claims metadata shape."]
        }
      ],
      candidateBatches: [
        {
          batchId: "bootstrap_batch_eligible",
          label: "Eligible assertion candidates",
          readiness: "eligible",
          candidates: [
            {
              candidateId: "legacy_candidate_001",
              observationId: "legacy_observation_001",
              evidenceContentHash: hash,
              evidenceId: "ev_legacy_claims",
              sourcePath: "ontology/claims.json",
              predicate: "agency.name",
              object: "Example Agency",
              confidence: 0.8,
              provenance: {
                legacyReportId: "legacy_report_001",
                reportHash: hash,
                candidateSetHash: hash,
                sourceCollectionId: "src_old_cestus",
                scanBatchId: "scan_old_cestus_001"
              }
            }
          ]
        }
      ],
      reportOnlyNotes: [
        {
          noteId: "bootstrap_note_relationships",
          kind: "candidate-relationship",
          message: "Legacy relationship material remains report-only until a reviewed candidate contract exists.",
          sourceRefs: ["legacy_report_001"]
        }
      ],
      questions: [
        {
          questionId: "bootstrap_question_review_batch",
          prompt: "Which candidate batch should move to staging review?",
          reason: "Eligible candidates need human staging approval before assertion proposals.",
          relatedRefs: ["legacy_candidate_001"]
        }
      ],
      localExtensionSuggestions: [],
      nextSafeAction: {
        actionId: "bootstrap_action_approve_staging",
        label: "Approve selected staging candidates",
        kind: "request-tool",
        effect: "ledger-review"
      },
      provenanceRefs: ["evt_legacy_report_001"]
    });

    expect(dossier.phase).toBe("staging-review");
    expect(Object.isFrozen(dossier)).toBe(false);
  });

  it("rejects unknown fields and secret-shaped text", () => {
    expect(() =>
      ontologyBootstrapFailureSchema.parse({
        code: "secret-detected",
        message: "token=abc123",
        allowedRepairActions: ["review safe diagnostics"]
      })
    ).toThrow(/secret-safe/i);

    expect(() =>
      ontologyBootstrapPhaseSchema.parse("accepted-graph-import")
    ).toThrow();
  });

  it("rejects tool previews for accepted graph events", () => {
    expect(() =>
      ontologyBootstrapToolPreviewSchema.parse({
        previewId: "bootstrap_preview_bad",
        toolId: "legacy.staging.execute",
        effect: "ledger-proposal",
        previewHash: hash,
        summary: "Attempt accepted graph write.",
        sourceCollectionId: "src_old_cestus",
        legacyReportId: "legacy_report_001",
        reportHash: hash,
        candidateSetHash: hash,
        selectedCandidateIds: ["legacy_candidate_001"],
        allowedEventTypes: ["assertion.proposed", "assertion.accepted"],
        requiresHumanApproval: true
      })
    ).toThrow(/accepted graph/i);
  });
});
```

- [ ] **Step 4: Run the targeted failing test**

Run:

```bash
npm test -- packages/ontology-bootstrap/test/contracts.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/contracts.js"
```

- [ ] **Step 5: Add strict contracts**

Create `packages/ontology-bootstrap/src/contracts.ts`:

```ts
import { z } from "zod";

export const ontologyBootstrapSchemaVersion = "ontology-bootstrap.v1" as const;

const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const sourceCollectionIdSchema = z.string().regex(/^src_[a-zA-Z0-9_-]+$/);
const scanBatchIdSchema = z.string().regex(/^scan_[a-zA-Z0-9_-]+$/);
const legacyReportIdSchema = z.string().regex(/^legacy_report_[a-zA-Z0-9_-]+$/);
const legacyCandidateIdSchema = z.string().regex(/^legacy_candidate_[a-zA-Z0-9_-]+$/);
const evidenceIdSchema = z.string().regex(/^ev_[a-zA-Z0-9_-]+$/);
const bootstrapIdSchema = z.string().regex(/^bootstrap_[a-zA-Z0-9_-]+$/);

const secretPattern =
  /(?:^|[^a-z0-9])(?:access[\s._-]*token|api[\s._-]*key|authorization|bearer|token|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth|credential)(?:\s*[:=]\s*|\s+(?=[a-z0-9._~+/=-]{3,})(?=[a-z0-9._~+/=-]*[0-9])[a-z0-9][a-z0-9._~+/=-]*)/i;

export const ontologyBootstrapSafeTextSchema = z.string()
  .min(1)
  .max(500)
  .refine((value) => !secretPattern.test(value), {
    message: "ontology bootstrap text must be secret-safe"
  });

export const ontologyBootstrapPhaseSchema = z.enum([
  "report-required",
  "raw-import-review",
  "evidence-import",
  "dossier-review",
  "staging-review",
  "ready-to-stage",
  "completed",
  "blocked"
]);

export const ontologyBootstrapFailureCodeSchema = z.enum([
  "workspace-unavailable",
  "legacy-report-required",
  "legacy-report-mismatch",
  "legacy-source-required",
  "raw-import-approval-required",
  "raw-import-stale-source",
  "evidence-link-required",
  "candidate-set-mismatch",
  "staging-approval-required",
  "accepted-event-forbidden",
  "secret-detected",
  "projection-lag",
  "provider-unavailable",
  "plugin-sample-needed"
]);

export const ontologyBootstrapFailureSchema = z.object({
  code: ontologyBootstrapFailureCodeSchema,
  message: ontologyBootstrapSafeTextSchema,
  allowedRepairActions: z.array(ontologyBootstrapSafeTextSchema).min(1)
}).strict();

export const ontologyBootstrapCandidateProvenanceSchema = z.object({
  legacyReportId: legacyReportIdSchema,
  reportHash: contentHashSchema,
  candidateSetHash: contentHashSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  scanBatchId: scanBatchIdSchema,
  sourceEventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)).default([])
}).strict();

export const ontologyBootstrapCandidateSchema = z.object({
  candidateId: legacyCandidateIdSchema,
  observationId: z.string().regex(/^legacy_observation_[a-zA-Z0-9_-]+$/),
  evidenceContentHash: contentHashSchema,
  evidenceId: evidenceIdSchema.optional(),
  sourcePath: ontologyBootstrapSafeTextSchema,
  subjectRef: ontologyBootstrapSafeTextSchema.optional(),
  predicate: ontologyBootstrapSafeTextSchema,
  object: z.union([ontologyBootstrapSafeTextSchema, z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  provenance: ontologyBootstrapCandidateProvenanceSchema
}).strict();

export const ontologyBootstrapDossierSchema = z.object({
  schemaVersion: z.literal(ontologyBootstrapSchemaVersion),
  dossierId: bootstrapIdSchema,
  generatedAt: z.string().datetime(),
  phase: ontologyBootstrapPhaseSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  scanBatchId: scanBatchIdSchema,
  legacyReportId: legacyReportIdSchema,
  reportHash: contentHashSchema,
  candidateSetHash: contentHashSchema,
  summary: z.object({
    evidenceFiles: z.number().int().nonnegative(),
    importedEvidenceFiles: z.number().int().nonnegative(),
    parserDetections: z.number().int().nonnegative(),
    eligibleAssertionCandidates: z.number().int().nonnegative(),
    blockedAssertionCandidates: z.number().int().nonnegative(),
    quarantineEntries: z.number().int().nonnegative(),
    localExtensionSuggestions: z.number().int().nonnegative()
  }).strict(),
  evidenceInventory: z.array(z.object({
    sourcePath: ontologyBootstrapSafeTextSchema,
    contentHash: contentHashSchema,
    mediaType: ontologyBootstrapSafeTextSchema,
    sizeBytes: z.number().int().nonnegative(),
    imported: z.boolean(),
    evidenceId: evidenceIdSchema.optional()
  }).strict()),
  parserConfidence: z.array(z.object({
    pluginName: ontologyBootstrapSafeTextSchema,
    pluginVersion: ontologyBootstrapSafeTextSchema,
    shape: ontologyBootstrapSafeTextSchema,
    sourcePath: ontologyBootstrapSafeTextSchema,
    confidence: z.number().min(0).max(1),
    parserEligible: z.boolean()
  }).strict()),
  quarantineGroups: z.array(z.object({
    issueCategory: ontologyBootstrapSafeTextSchema,
    count: z.number().int().positive(),
    sourcePaths: z.array(ontologyBootstrapSafeTextSchema),
    repairActions: z.array(ontologyBootstrapSafeTextSchema)
  }).strict()),
  candidateBatches: z.array(z.object({
    batchId: bootstrapIdSchema,
    label: ontologyBootstrapSafeTextSchema,
    readiness: z.enum(["eligible", "blocked", "review-only"]),
    candidates: z.array(ontologyBootstrapCandidateSchema)
  }).strict()),
  reportOnlyNotes: z.array(z.object({
    noteId: bootstrapIdSchema,
    kind: z.enum(["candidate-entity", "candidate-relationship", "local-extension", "caveat"]),
    message: ontologyBootstrapSafeTextSchema,
    sourceRefs: z.array(ontologyBootstrapSafeTextSchema)
  }).strict()),
  questions: z.array(z.object({
    questionId: bootstrapIdSchema,
    prompt: ontologyBootstrapSafeTextSchema,
    reason: ontologyBootstrapSafeTextSchema,
    relatedRefs: z.array(ontologyBootstrapSafeTextSchema)
  }).strict()),
  localExtensionSuggestions: z.array(z.object({
    suggestionId: bootstrapIdSchema,
    scope: z.literal("investigation-local"),
    label: ontologyBootstrapSafeTextSchema,
    rationale: ontologyBootstrapSafeTextSchema,
    exampleCandidateIds: z.array(legacyCandidateIdSchema)
  }).strict()),
  nextSafeAction: z.object({
    actionId: bootstrapIdSchema,
    label: ontologyBootstrapSafeTextSchema,
    kind: z.enum(["read", "ask-operator", "request-tool", "review"]),
    effect: z.enum(["none", "local-derivative", "ledger-review", "ledger-proposal"])
  }).strict(),
  provenanceRefs: z.array(ontologyBootstrapSafeTextSchema)
}).strict();

const allowedBootstrapEventTypes = ["assertion.proposed"] as const;

export const ontologyBootstrapToolPreviewSchema = z.object({
  previewId: bootstrapIdSchema,
  toolId: ontologyBootstrapSafeTextSchema,
  effect: z.enum(["read-only", "local-derivative", "ledger-review", "ledger-proposal"]),
  previewHash: contentHashSchema,
  summary: ontologyBootstrapSafeTextSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  legacyReportId: legacyReportIdSchema.optional(),
  reportHash: contentHashSchema.optional(),
  candidateSetHash: contentHashSchema.optional(),
  selectedCandidateIds: z.array(legacyCandidateIdSchema).default([]),
  allowedEventTypes: z.array(z.string()).default([]),
  requiresHumanApproval: z.boolean()
}).strict().superRefine((preview, ctx) => {
  const forbidden = preview.allowedEventTypes.filter((type) => !allowedBootstrapEventTypes.includes(type as "assertion.proposed"));
  if (forbidden.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["allowedEventTypes"],
      message: "ontology bootstrap previews cannot allow accepted graph events"
    });
  }
});

export type OntologyBootstrapPhase = z.infer<typeof ontologyBootstrapPhaseSchema>;
export type OntologyBootstrapFailure = z.infer<typeof ontologyBootstrapFailureSchema>;
export type OntologyBootstrapDossier = z.infer<typeof ontologyBootstrapDossierSchema>;
export type OntologyBootstrapCandidate = z.infer<typeof ontologyBootstrapCandidateSchema>;
export type OntologyBootstrapToolPreview = z.infer<typeof ontologyBootstrapToolPreviewSchema>;
```

Create `packages/ontology-bootstrap/src/index.ts`:

```ts
export * from "./contracts.js";
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/ontology-bootstrap/test/contracts.test.ts
```

Expected:

```text
Test Files  1 passed
```

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 8: Commit**

Run:

```bash
git add docs/agentic/claims/task-1-ontology-bootstrap-contracts.md packages/ontology-bootstrap/src/contracts.ts packages/ontology-bootstrap/src/index.ts packages/ontology-bootstrap/test/contracts.test.ts
git commit -m "feat: add ontology bootstrap contracts"
```

**Acceptance Criteria:**

- Dossier, failure, phase, and tool-preview DTOs are strict Zod contracts.
- Secret-shaped text is rejected.
- Tool previews cannot include accepted graph event types.
- No source-tree access, import execution, staging execution, provider calls, or UI wiring exists in this task.

## Task 2: Deterministic Bootstrap Dossier Builder

**Files:**

- Create: `docs/agentic/claims/task-2-ontology-bootstrap-dossier-builder.md`
- Create: `packages/ontology-bootstrap/src/dossier-builder.ts`
- Create: `packages/ontology-bootstrap/test/fixtures/bootstrap-fixtures.ts`
- Create: `packages/ontology-bootstrap/test/dossier-builder.test.ts`
- Modify: `packages/ontology-bootstrap/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-ontology-bootstrap-dossier-builder.md` with the owned files above and status `claimed`. Then change status to `in-progress`.

- [ ] **Step 2: Write failing dossier tests**

Create `packages/ontology-bootstrap/test/fixtures/bootstrap-fixtures.ts`:

```ts
import type { LegacyMigrationReport } from "../../../ingestion/src/legacy-report.js";
import type { LegacyMigrationReviewDto } from "../../../ingestion/src/legacy-read-api.js";

export const reportHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
export const candidateSetHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
export const metadataHash = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
export const rawHash = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;

export const bootstrapReportFixture: LegacyMigrationReport = {
  sourceCollectionId: "src_old_cestus",
  scanBatchId: "scan_old_cestus_001",
  legacyReportId: "legacy_report_001",
  reportHash,
  candidateSetHash,
  generatedAt: "2026-07-06T00:00:00.000Z",
  generator: { name: "legacy-cestus-inspector", version: "0.1.0" },
  files: [
    {
      sourcePath: "ontology/claims.json",
      occurrenceId: "occ_claims",
      contentHash: metadataHash,
      sizeBytes: 128,
      mediaType: "application/json"
    },
    {
      sourcePath: "docs/contract.txt",
      occurrenceId: "occ_contract",
      contentHash: rawHash,
      sizeBytes: 64,
      mediaType: "text/plain"
    }
  ],
  detections: [
    {
      sourcePath: "ontology/claims.json",
      contentHash: metadataHash,
      plugin: { name: "legacy-json-metadata", version: "0.1.0" },
      shape: "json-legacy-metadata",
      confidence: 0.8 as never,
      parserEligible: true,
      reasonCodes: ["json", "explicit-legacy-cestus-marker"]
    }
  ],
  proposedAssertionCandidates: [
    {
      candidateId: "legacy_candidate_001",
      observationId: "legacy_observation_001",
      evidenceContentHash: metadataHash,
      sourcePath: "ontology/claims.json",
      subjectRef: "legacy:agency:example",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.8 as never
    },
    {
      candidateId: "legacy_candidate_missing",
      observationId: "legacy_observation_missing",
      evidenceContentHash: rawHash,
      sourcePath: "docs/contract.txt",
      predicate: "contract.title",
      object: "Missing import",
      confidence: 0.7 as never
    }
  ],
  quarantineEntries: [
    {
      quarantineId: "legacy_quarantine_corrupt",
      sourcePath: "ontology/corrupt.json",
      contentHash: metadataHash,
      plugin: { name: "legacy-json-claim-parser", version: "0.1.0" },
      issueCategory: "malformed",
      message: "Legacy JSON could not be parsed." as never,
      legacyIds: [],
      repairActions: ["Review the legacy claims metadata shape." as never]
    }
  ],
  totals: {
    inspectedFiles: 2,
    candidateMetadataFiles: 1,
    proposedAssertionCandidates: 2,
    quarantineEntries: 1,
    unresolvedReferences: 0
  },
  recommendedNextActions: [
    "Review raw import summary before evidence import",
    "Review proposed assertion candidates before ontology staging",
    "Keep candidate entity resolution and relationship material in the report"
  ]
};

export const bootstrapReviewFixture: LegacyMigrationReviewDto = {
  sourceCollectionId: "src_old_cestus",
  latestReportId: "legacy_report_001",
  rawImportRequiresApproval: false,
  ontologyStagingApproved: false,
  firstArtifactAsk: [
    "Read-only folder tree listing of the old Cestus root",
    "Two to five sanitized metadata or ontology files",
    "Any old manifest, index, registry, or graph export file if present"
  ],
  diagnostics: []
};

export const bootstrapEvidenceLinksFixture = [
  {
    sourceCollectionId: "src_old_cestus",
    evidenceId: "ev_legacy_claims",
    contentHash: metadataHash,
    occurrenceIds: ["occ_claims"]
  },
  {
    sourceCollectionId: "src_other_cestus",
    evidenceId: "ev_other_source",
    contentHash: rawHash,
    occurrenceIds: ["occ_contract"]
  }
] as const;
```

Create `packages/ontology-bootstrap/test/dossier-builder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildOntologyBootstrapDossier } from "../src/dossier-builder.js";
import {
  bootstrapEvidenceLinksFixture,
  bootstrapReportFixture,
  bootstrapReviewFixture
} from "./fixtures/bootstrap-fixtures.js";

describe("buildOntologyBootstrapDossier", () => {
  it("groups eligible candidates only when evidence is linked from the same source collection", () => {
    const dossier = buildOntologyBootstrapDossier({
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      now: () => "2026-07-07T22:30:00.000Z"
    });

    expect(dossier.phase).toBe("staging-review");
    expect(dossier.summary).toMatchObject({
      evidenceFiles: 2,
      importedEvidenceFiles: 1,
      eligibleAssertionCandidates: 1,
      blockedAssertionCandidates: 1,
      quarantineEntries: 1
    });
    expect(dossier.candidateBatches).toHaveLength(2);
    expect(dossier.candidateBatches[0]?.readiness).toBe("eligible");
    expect(dossier.candidateBatches[0]?.candidates[0]).toMatchObject({
      candidateId: "legacy_candidate_001",
      evidenceId: "ev_legacy_claims"
    });
    expect(dossier.candidateBatches[1]?.readiness).toBe("blocked");
    expect(JSON.stringify(dossier)).not.toContain("ev_other_source");
  });

  it("is deterministic for the same inputs and marks staging-approved dossiers ready to stage", () => {
    const first = buildOntologyBootstrapDossier({
      report: bootstrapReportFixture,
      review: { ...bootstrapReviewFixture, ontologyStagingApproved: true },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      now: () => "2026-07-07T22:30:00.000Z"
    });
    const second = buildOntologyBootstrapDossier({
      report: bootstrapReportFixture,
      review: { ...bootstrapReviewFixture, ontologyStagingApproved: true },
      evidenceLinks: [...bootstrapEvidenceLinksFixture].reverse(),
      now: () => "2026-07-07T22:30:00.000Z"
    });

    expect(first.phase).toBe("ready-to-stage");
    expect(JSON.stringify(first)).toEqual(JSON.stringify(second));
  });
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/ontology-bootstrap/test/dossier-builder.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/dossier-builder.js"
```

- [ ] **Step 4: Implement dossier builder**

Create `packages/ontology-bootstrap/src/dossier-builder.ts`:

```ts
import type { LegacyMigrationReport } from "../../ingestion/src/legacy-report.js";
import type { LegacyMigrationReviewDto } from "../../ingestion/src/legacy-read-api.js";
import {
  ontologyBootstrapDossierSchema,
  type OntologyBootstrapDossier,
  type OntologyBootstrapPhase
} from "./contracts.js";

export interface OntologyBootstrapEvidenceLink {
  readonly sourceCollectionId: string;
  readonly evidenceId: string;
  readonly contentHash: `sha256:${string}`;
  readonly occurrenceIds: readonly string[];
}

export interface BuildOntologyBootstrapDossierInput {
  readonly report: LegacyMigrationReport;
  readonly review: LegacyMigrationReviewDto;
  readonly evidenceLinks: readonly OntologyBootstrapEvidenceLink[];
  readonly now: () => string;
  readonly provenanceRefs?: readonly string[];
}

export function buildOntologyBootstrapDossier(
  input: BuildOntologyBootstrapDossierInput
): OntologyBootstrapDossier {
  const evidenceByHash = sameSourceEvidenceByHash(input);
  const evidenceInventory = [...input.report.files]
    .sort((left, right) => compareCodeUnits(left.sourcePath, right.sourcePath))
    .map((file) => {
      const evidenceId = evidenceByHash.get(file.contentHash);
      return {
        sourcePath: file.sourcePath,
        contentHash: file.contentHash,
        mediaType: file.mediaType,
        sizeBytes: file.sizeBytes,
        imported: evidenceId !== undefined,
        ...(evidenceId === undefined ? {} : { evidenceId })
      };
    });
  const candidates = [...input.report.proposedAssertionCandidates].sort((left, right) =>
    compareCodeUnits(left.candidateId, right.candidateId)
  );
  const eligible = candidates.filter((candidate) => evidenceByHash.has(candidate.evidenceContentHash));
  const blocked = candidates.filter((candidate) => !evidenceByHash.has(candidate.evidenceContentHash));
  const candidateBatches = [
    ...(eligible.length === 0 ? [] : [{
      batchId: "bootstrap_batch_eligible",
      label: "Eligible assertion candidates",
      readiness: "eligible" as const,
      candidates: eligible.map((candidate) => ({
        ...candidate,
        evidenceId: evidenceByHash.get(candidate.evidenceContentHash),
        provenance: candidateProvenance(input.report)
      }))
    }]),
    ...(blocked.length === 0 ? [] : [{
      batchId: "bootstrap_batch_blocked_evidence",
      label: "Candidates blocked on evidence links",
      readiness: "blocked" as const,
      candidates: blocked.map((candidate) => ({
        ...candidate,
        provenance: candidateProvenance(input.report)
      }))
    }])
  ];

  return ontologyBootstrapDossierSchema.parse({
    schemaVersion: "ontology-bootstrap.v1",
    dossierId: `bootstrap_dossier_${input.report.sourceCollectionId}_${input.report.scanBatchId}`,
    generatedAt: input.now(),
    phase: phaseFor(input, eligible.length),
    sourceCollectionId: input.report.sourceCollectionId,
    scanBatchId: input.report.scanBatchId,
    legacyReportId: input.report.legacyReportId,
    reportHash: input.report.reportHash,
    candidateSetHash: input.report.candidateSetHash,
    summary: {
      evidenceFiles: input.report.files.length,
      importedEvidenceFiles: evidenceInventory.filter((item) => item.imported).length,
      parserDetections: input.report.detections.length,
      eligibleAssertionCandidates: eligible.length,
      blockedAssertionCandidates: blocked.length,
      quarantineEntries: input.report.quarantineEntries.length,
      localExtensionSuggestions: 0
    },
    evidenceInventory,
    parserConfidence: input.report.detections.map((detection) => ({
      pluginName: detection.plugin.name,
      pluginVersion: detection.plugin.version,
      shape: detection.shape,
      sourcePath: detection.sourcePath,
      confidence: detection.confidence,
      parserEligible: detection.parserEligible
    })),
    quarantineGroups: quarantineGroups(input.report),
    candidateBatches,
    reportOnlyNotes: [
      {
        noteId: "bootstrap_note_report_only_relationships",
        kind: "candidate-relationship",
        message: "Candidate entity and relationship material remains report-only until a reviewed candidate contract exists.",
        sourceRefs: [input.report.legacyReportId]
      }
    ],
    questions: questionsFor(input, eligible.length, blocked.length),
    localExtensionSuggestions: [],
    nextSafeAction: nextSafeActionFor(input, eligible.length),
    provenanceRefs: [...(input.provenanceRefs ?? [input.report.legacyReportId])]
  });
}

function sameSourceEvidenceByHash(input: BuildOntologyBootstrapDossierInput): Map<string, string> {
  const pairs = input.evidenceLinks
    .filter((link) => link.sourceCollectionId === input.report.sourceCollectionId)
    .map((link) => [link.contentHash, link.evidenceId] as const)
    .sort(([left], [right]) => compareCodeUnits(left, right));
  return new Map(pairs);
}

function candidateProvenance(report: LegacyMigrationReport) {
  return {
    legacyReportId: report.legacyReportId,
    reportHash: report.reportHash,
    candidateSetHash: report.candidateSetHash,
    sourceCollectionId: report.sourceCollectionId,
    scanBatchId: report.scanBatchId,
    sourceEventIds: []
  };
}

function phaseFor(input: BuildOntologyBootstrapDossierInput, eligibleCount: number): OntologyBootstrapPhase {
  if (input.review.rawImportRequiresApproval) {
    return "raw-import-review";
  }
  if (eligibleCount === 0) {
    return "evidence-import";
  }
  if (input.review.ontologyStagingApproved) {
    return "ready-to-stage";
  }
  return "staging-review";
}

function quarantineGroups(report: LegacyMigrationReport) {
  const groups = new Map<string, { sourcePaths: Set<string>; repairActions: Set<string>; count: number }>();
  for (const entry of report.quarantineEntries) {
    const group = groups.get(entry.issueCategory) ?? { sourcePaths: new Set(), repairActions: new Set(), count: 0 };
    group.count += 1;
    group.sourcePaths.add(entry.sourcePath);
    for (const action of entry.repairActions) {
      group.repairActions.add(action);
    }
    groups.set(entry.issueCategory, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([issueCategory, group]) => ({
      issueCategory,
      count: group.count,
      sourcePaths: [...group.sourcePaths].sort(compareCodeUnits),
      repairActions: [...group.repairActions].sort(compareCodeUnits)
    }));
}

function questionsFor(input: BuildOntologyBootstrapDossierInput, eligibleCount: number, blockedCount: number) {
  if (input.review.rawImportRequiresApproval) {
    return [{
      questionId: "bootstrap_question_raw_import",
      prompt: "Should the reviewed legacy files be approved for raw evidence import?",
      reason: "Raw import approval is required before evidence copy.",
      relatedRefs: [input.report.legacyReportId]
    }];
  }
  if (eligibleCount > 0 && !input.review.ontologyStagingApproved) {
    return [{
      questionId: "bootstrap_question_staging_batch",
      prompt: "Which eligible assertion candidates should move to staging approval?",
      reason: "Evidence-tied candidates need human staging approval before assertion proposals.",
      relatedRefs: [input.report.candidateSetHash]
    }];
  }
  if (blockedCount > 0) {
    return [{
      questionId: "bootstrap_question_missing_evidence",
      prompt: "Should blocked candidates wait for raw import, be quarantined, or be ignored for this pass?",
      reason: "Blocked candidates lack same-source evidence links.",
      relatedRefs: [input.report.legacyReportId]
    }];
  }
  return [];
}

function nextSafeActionFor(input: BuildOntologyBootstrapDossierInput, eligibleCount: number) {
  if (input.review.rawImportRequiresApproval) {
    return {
      actionId: "bootstrap_action_approve_raw_import",
      label: "Review raw import approval",
      kind: "request-tool" as const,
      effect: "ledger-review" as const
    };
  }
  if (eligibleCount === 0) {
    return {
      actionId: "bootstrap_action_run_raw_import",
      label: "Run approved raw import or inspect missing evidence",
      kind: "review" as const,
      effect: "none" as const
    };
  }
  if (!input.review.ontologyStagingApproved) {
    return {
      actionId: "bootstrap_action_approve_staging",
      label: "Review staging approval preview",
      kind: "request-tool" as const,
      effect: "ledger-review" as const
    };
  }
  return {
    actionId: "bootstrap_action_stage_approved",
    label: "Stage approved assertion proposals",
    kind: "request-tool" as const,
    effect: "ledger-proposal" as const
  };
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
```

Modify `packages/ontology-bootstrap/src/index.ts`:

```ts
export * from "./contracts.js";
export * from "./dossier-builder.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ontology-bootstrap/test/dossier-builder.test.ts packages/ontology-bootstrap/test/contracts.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/agentic/claims/task-2-ontology-bootstrap-dossier-builder.md packages/ontology-bootstrap/src/dossier-builder.ts packages/ontology-bootstrap/src/index.ts packages/ontology-bootstrap/test/fixtures/bootstrap-fixtures.ts packages/ontology-bootstrap/test/dossier-builder.test.ts
git commit -m "feat: build ontology bootstrap dossiers"
```

**Acceptance Criteria:**

- Dossiers are deterministic and strict.
- Candidates are eligible only when a same-source evidence link exists for the candidate content hash.
- Foreign same-hash evidence from another source collection is ignored.
- Candidate entity and relationship material stays report-only.

## Task 3: Bootstrap Read Model

**Files:**

- Create: `docs/agentic/claims/task-3-ontology-bootstrap-read-model.md`
- Create: `packages/ontology-bootstrap/src/read-model.ts`
- Create: `packages/ontology-bootstrap/test/read-model.test.ts`
- Modify: `packages/ontology-bootstrap/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-ontology-bootstrap-read-model.md` with the owned files above and status `claimed`. Then change status to `in-progress`.

- [ ] **Step 2: Write failing read-model tests**

Create `packages/ontology-bootstrap/test/read-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildOntologyBootstrapReadiness } from "../src/read-model.js";
import {
  bootstrapEvidenceLinksFixture,
  bootstrapReportFixture,
  bootstrapReviewFixture
} from "./fixtures/bootstrap-fixtures.js";

describe("buildOntologyBootstrapReadiness", () => {
  it("blocks on missing reports without guessing from legacy paths", () => {
    const readiness = buildOntologyBootstrapReadiness({
      sourceCollectionId: "src_old_cestus",
      review: {
        sourceCollectionId: "src_old_cestus",
        rawImportRequiresApproval: false,
        ontologyStagingApproved: false,
        firstArtifactAsk: ["Read-only folder tree listing of the old Cestus root"],
        diagnostics: []
      },
      evidenceLinks: []
    });

    expect(readiness).toEqual({
      sourceCollectionId: "src_old_cestus",
      phase: "report-required",
      latestReportId: undefined,
      eligibleCandidateCount: 0,
      blockedCandidateCount: 0,
      failures: [{
        code: "legacy-report-required",
        message: "A legacy migration report is required before ontology bootstrap.",
        allowedRepairActions: ["run legacy inspect", "review the first artifact ask"]
      }]
    });
  });

  it("reports staging review counts from a verified report and same-source evidence links", () => {
    const readiness = buildOntologyBootstrapReadiness({
      sourceCollectionId: "src_old_cestus",
      review: bootstrapReviewFixture,
      report: bootstrapReportFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture
    });

    expect(readiness.phase).toBe("staging-review");
    expect(readiness.eligibleCandidateCount).toBe(1);
    expect(readiness.blockedCandidateCount).toBe(1);
    expect(readiness.failures).toEqual([]);
  });
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/ontology-bootstrap/test/read-model.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/read-model.js"
```

- [ ] **Step 4: Implement read-model helper**

Create `packages/ontology-bootstrap/src/read-model.ts`:

```ts
import type { LegacyMigrationReport } from "../../ingestion/src/legacy-report.js";
import type { LegacyMigrationReviewDto } from "../../ingestion/src/legacy-read-api.js";
import type {
  OntologyBootstrapFailure,
  OntologyBootstrapPhase
} from "./contracts.js";
import type { OntologyBootstrapEvidenceLink } from "./dossier-builder.js";

export interface BuildOntologyBootstrapReadinessInput {
  readonly sourceCollectionId: string;
  readonly review: LegacyMigrationReviewDto;
  readonly report?: LegacyMigrationReport;
  readonly evidenceLinks: readonly OntologyBootstrapEvidenceLink[];
}

export interface OntologyBootstrapReadiness {
  readonly sourceCollectionId: string;
  readonly phase: OntologyBootstrapPhase;
  readonly latestReportId?: string;
  readonly eligibleCandidateCount: number;
  readonly blockedCandidateCount: number;
  readonly failures: readonly OntologyBootstrapFailure[];
}

export function buildOntologyBootstrapReadiness(
  input: BuildOntologyBootstrapReadinessInput
): OntologyBootstrapReadiness {
  if (input.report === undefined || input.review.latestReportId === undefined) {
    return {
      sourceCollectionId: input.sourceCollectionId,
      phase: "report-required",
      latestReportId: input.review.latestReportId,
      eligibleCandidateCount: 0,
      blockedCandidateCount: 0,
      failures: [{
        code: "legacy-report-required",
        message: "A legacy migration report is required before ontology bootstrap.",
        allowedRepairActions: ["run legacy inspect", "review the first artifact ask"]
      }]
    };
  }

  const sameSourceHashes = new Set(
    input.evidenceLinks
      .filter((link) => link.sourceCollectionId === input.sourceCollectionId)
      .map((link) => link.contentHash)
  );
  const eligibleCandidateCount = input.report.proposedAssertionCandidates.filter((candidate) =>
    sameSourceHashes.has(candidate.evidenceContentHash)
  ).length;
  const blockedCandidateCount = input.report.proposedAssertionCandidates.length - eligibleCandidateCount;

  return {
    sourceCollectionId: input.sourceCollectionId,
    phase: phaseFor(input, eligibleCandidateCount),
    latestReportId: input.review.latestReportId,
    eligibleCandidateCount,
    blockedCandidateCount,
    failures: []
  };
}

function phaseFor(
  input: BuildOntologyBootstrapReadinessInput & { readonly report: LegacyMigrationReport },
  eligibleCandidateCount: number
): OntologyBootstrapPhase {
  if (input.review.rawImportRequiresApproval) {
    return "raw-import-review";
  }
  if (eligibleCandidateCount === 0) {
    return "evidence-import";
  }
  if (input.review.ontologyStagingApproved) {
    return "ready-to-stage";
  }
  return "staging-review";
}
```

Modify `packages/ontology-bootstrap/src/index.ts`:

```ts
export * from "./contracts.js";
export * from "./dossier-builder.js";
export * from "./read-model.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ontology-bootstrap/test/read-model.test.ts packages/ontology-bootstrap/test/dossier-builder.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 6: Run full verification and commit**

Run:

```bash
npm run verify
git add docs/agentic/claims/task-3-ontology-bootstrap-read-model.md packages/ontology-bootstrap/src/read-model.ts packages/ontology-bootstrap/src/index.ts packages/ontology-bootstrap/test/read-model.test.ts
git commit -m "feat: add ontology bootstrap read model"
```

Expected verification:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

**Acceptance Criteria:**

- Missing reports block the specialist with safe repair actions.
- Readiness uses report and evidence-link state, never source folder guesses.
- Phase output is deterministic and browser-safe.

## Task 4: Tool Preview Builders

**Files:**

- Create: `docs/agentic/claims/task-4-ontology-bootstrap-tool-previews.md`
- Create: `packages/ontology-bootstrap/src/tool-previews.ts`
- Create: `packages/ontology-bootstrap/test/tool-previews.test.ts`
- Modify: `packages/ontology-bootstrap/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-4-ontology-bootstrap-tool-previews.md` with the owned files above and status `claimed`. Then change status to `in-progress`.

- [ ] **Step 2: Write failing preview tests**

Create `packages/ontology-bootstrap/test/tool-previews.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createRawImportApprovalPreview,
  createStagingApprovalPreview,
  createStagingExecutionPreview
} from "../src/tool-previews.js";
import {
  bootstrapReportFixture,
  metadataHash
} from "./fixtures/bootstrap-fixtures.js";

describe("ontology bootstrap tool previews", () => {
  it("builds preview hashes from exact raw import identity", () => {
    const preview = createRawImportApprovalPreview({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001",
      legacyReportId: "legacy_report_001",
      reportHash: bootstrapReportFixture.reportHash
    });

    expect(preview.toolId).toBe("legacy.raw-import.approval.request");
    expect(preview.requiresHumanApproval).toBe(true);
    expect(preview.previewHash).toMatch(/^sha256:/);
    expect(preview.allowedEventTypes).toEqual([]);
  });

  it("binds staging approval to selected candidate ids and candidate-set hash", () => {
    const preview = createStagingApprovalPreview({
      report: bootstrapReportFixture,
      stagingBatchId: "legacy_stage_001",
      selectedCandidateIds: ["legacy_candidate_001"],
      evidenceRefs: [{
        candidateId: "legacy_candidate_001",
        evidenceId: "ev_legacy_claims",
        evidenceContentHash: metadataHash
      }]
    });

    expect(preview).toMatchObject({
      toolId: "legacy.staging.approval.request",
      effect: "ledger-review",
      selectedCandidateIds: ["legacy_candidate_001"],
      allowedEventTypes: []
    });
    expect(JSON.stringify(preview)).toContain("ev_legacy_claims");
  });

  it("limits staging execution previews to assertion.proposed", () => {
    const preview = createStagingExecutionPreview({
      report: bootstrapReportFixture,
      stagingBatchId: "legacy_stage_001",
      selectedCandidateIds: ["legacy_candidate_001"]
    });

    expect(preview.allowedEventTypes).toEqual(["assertion.proposed"]);
    expect(() =>
      createStagingExecutionPreview({
        report: bootstrapReportFixture,
        stagingBatchId: "legacy_stage_001",
        selectedCandidateIds: []
      })
    ).toThrow(/candidate/i);
  });
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/ontology-bootstrap/test/tool-previews.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/tool-previews.js"
```

- [ ] **Step 4: Implement preview builders**

Create `packages/ontology-bootstrap/src/tool-previews.ts`:

```ts
import { createHash } from "node:crypto";
import type { LegacyMigrationReport } from "../../ingestion/src/legacy-report.js";
import {
  ontologyBootstrapToolPreviewSchema,
  type OntologyBootstrapToolPreview
} from "./contracts.js";

export interface RawImportApprovalPreviewInput {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly importBatchId: string;
  readonly legacyReportId: string;
  readonly reportHash: `sha256:${string}`;
}

export interface StagingApprovalPreviewInput {
  readonly report: LegacyMigrationReport;
  readonly stagingBatchId: string;
  readonly selectedCandidateIds: readonly string[];
  readonly evidenceRefs: readonly {
    readonly candidateId: string;
    readonly evidenceId: string;
    readonly evidenceContentHash: `sha256:${string}`;
  }[];
}

export interface StagingExecutionPreviewInput {
  readonly report: LegacyMigrationReport;
  readonly stagingBatchId: string;
  readonly selectedCandidateIds: readonly string[];
}

export function createRawImportApprovalPreview(
  input: RawImportApprovalPreviewInput
): OntologyBootstrapToolPreview {
  return parsePreview({
    previewId: `bootstrap_preview_raw_import_${input.importBatchId}`,
    toolId: "legacy.raw-import.approval.request",
    effect: "ledger-review",
    summary: "Record human raw import approval; this does not copy bytes or stage ontology assertions.",
    sourceCollectionId: input.sourceCollectionId,
    legacyReportId: input.legacyReportId,
    reportHash: input.reportHash,
    selectedCandidateIds: [],
    allowedEventTypes: [],
    requiresHumanApproval: true,
    material: input
  });
}

export function createStagingApprovalPreview(
  input: StagingApprovalPreviewInput
): OntologyBootstrapToolPreview {
  assertSelectedCandidates(input.selectedCandidateIds);
  return parsePreview({
    previewId: `bootstrap_preview_staging_approval_${input.stagingBatchId}`,
    toolId: "legacy.staging.approval.request",
    effect: "ledger-review",
    summary: "Record human ontology staging approval for selected evidence-tied candidates only.",
    sourceCollectionId: input.report.sourceCollectionId,
    legacyReportId: input.report.legacyReportId,
    reportHash: input.report.reportHash,
    candidateSetHash: input.report.candidateSetHash,
    selectedCandidateIds: [...input.selectedCandidateIds].sort(compareCodeUnits),
    allowedEventTypes: [],
    requiresHumanApproval: true,
    material: {
      reportHash: input.report.reportHash,
      candidateSetHash: input.report.candidateSetHash,
      stagingBatchId: input.stagingBatchId,
      selectedCandidateIds: [...input.selectedCandidateIds].sort(compareCodeUnits),
      evidenceRefs: [...input.evidenceRefs].sort((left, right) => compareCodeUnits(left.candidateId, right.candidateId))
    }
  });
}

export function createStagingExecutionPreview(
  input: StagingExecutionPreviewInput
): OntologyBootstrapToolPreview {
  assertSelectedCandidates(input.selectedCandidateIds);
  return parsePreview({
    previewId: `bootstrap_preview_staging_execute_${input.stagingBatchId}`,
    toolId: "legacy.staging.execute",
    effect: "ledger-proposal",
    summary: "Execute approved staging through the legacy runtime; allowed output is assertion.proposed only.",
    sourceCollectionId: input.report.sourceCollectionId,
    legacyReportId: input.report.legacyReportId,
    reportHash: input.report.reportHash,
    candidateSetHash: input.report.candidateSetHash,
    selectedCandidateIds: [...input.selectedCandidateIds].sort(compareCodeUnits),
    allowedEventTypes: ["assertion.proposed"],
    requiresHumanApproval: false,
    material: {
      reportHash: input.report.reportHash,
      candidateSetHash: input.report.candidateSetHash,
      stagingBatchId: input.stagingBatchId,
      selectedCandidateIds: [...input.selectedCandidateIds].sort(compareCodeUnits)
    }
  });
}

function parsePreview(input: Omit<OntologyBootstrapToolPreview, "previewHash"> & { readonly material: unknown }) {
  const previewHash = sha256(stableJson(input.material));
  const { material: _material, ...preview } = input;
  return ontologyBootstrapToolPreviewSchema.parse({
    ...preview,
    previewHash
  });
}

function assertSelectedCandidates(candidateIds: readonly string[]): void {
  if (candidateIds.length === 0) {
    throw new Error("At least one selected candidate is required for ontology bootstrap staging previews.");
  }
}

function sha256(text: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortStable(value));
}

function sortStable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortStable);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, item]) => [key, sortStable(item)])
    );
  }
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
```

Modify `packages/ontology-bootstrap/src/index.ts`:

```ts
export * from "./contracts.js";
export * from "./dossier-builder.js";
export * from "./read-model.js";
export * from "./tool-previews.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ontology-bootstrap/test/tool-previews.test.ts packages/ontology-bootstrap/test/contracts.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 6: Run full verification and commit**

Run:

```bash
npm run verify
git add docs/agentic/claims/task-4-ontology-bootstrap-tool-previews.md packages/ontology-bootstrap/src/tool-previews.ts packages/ontology-bootstrap/src/index.ts packages/ontology-bootstrap/test/tool-previews.test.ts
git commit -m "feat: add ontology bootstrap tool previews"
```

Expected verification:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

**Acceptance Criteria:**

- Preview hashes bind exact report, candidate-set, candidate, evidence, and staging identity.
- Staging execution previews allow only `assertion.proposed`.
- Raw import approval previews make clear that approval does not copy bytes or stage ontology assertions.

## Task 5: Fake Specialist Runtime Facade

**Files:**

- Create: `docs/agentic/claims/task-5-ontology-bootstrap-fake-runtime.md`
- Create: `packages/ontology-bootstrap/src/fake-runtime.ts`
- Create: `packages/ontology-bootstrap/test/fake-runtime.test.ts`
- Modify: `packages/ontology-bootstrap/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-5-ontology-bootstrap-fake-runtime.md` with the owned files above and status `claimed`. Then change status to `in-progress`.

- [ ] **Step 2: Write failing fake runtime tests**

Create `packages/ontology-bootstrap/test/fake-runtime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runFakeOntologyBootstrapSpecialist } from "../src/fake-runtime.js";
import {
  bootstrapEvidenceLinksFixture,
  bootstrapReportFixture,
  bootstrapReviewFixture
} from "./fixtures/bootstrap-fixtures.js";

describe("runFakeOntologyBootstrapSpecialist", () => {
  it("returns a dossier and tool previews without model calls or side effects", () => {
    const result = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now: () => "2026-07-07T23:00:00.000Z"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dossier.phase).toBe("staging-review");
    expect(result.toolPreviews.map((preview) => preview.toolId)).toEqual([
      "legacy.staging.approval.request"
    ]);
    expect(result.sideEffects).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/assertion\.accepted|entity\.resolved|relationship\.accepted/);
  });

  it("returns a safe failure when no report is present", () => {
    const result = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      review: {
        sourceCollectionId: "src_old_cestus",
        rawImportRequiresApproval: false,
        ontologyStagingApproved: false,
        firstArtifactAsk: ["Read-only folder tree listing of the old Cestus root"],
        diagnostics: []
      },
      evidenceLinks: [],
      selectedCandidateIds: [],
      now: () => "2026-07-07T23:00:00.000Z"
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "legacy-report-required",
        message: "A legacy migration report is required before ontology bootstrap.",
        allowedRepairActions: ["run legacy inspect", "review the first artifact ask"]
      }
    });
  });
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/ontology-bootstrap/test/fake-runtime.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/fake-runtime.js"
```

- [ ] **Step 4: Implement fake runtime**

Create `packages/ontology-bootstrap/src/fake-runtime.ts`:

```ts
import type { LegacyMigrationReport } from "../../ingestion/src/legacy-report.js";
import type { LegacyMigrationReviewDto } from "../../ingestion/src/legacy-read-api.js";
import { buildOntologyBootstrapDossier, type OntologyBootstrapEvidenceLink } from "./dossier-builder.js";
import { buildOntologyBootstrapReadiness } from "./read-model.js";
import { createRawImportApprovalPreview, createStagingApprovalPreview, createStagingExecutionPreview } from "./tool-previews.js";
import type { OntologyBootstrapDossier, OntologyBootstrapFailure, OntologyBootstrapToolPreview } from "./contracts.js";

export interface RunFakeOntologyBootstrapSpecialistInput {
  readonly sourceCollectionId: string;
  readonly report?: LegacyMigrationReport;
  readonly review: LegacyMigrationReviewDto;
  readonly evidenceLinks: readonly OntologyBootstrapEvidenceLink[];
  readonly selectedCandidateIds: readonly string[];
  readonly importBatchId?: string;
  readonly stagingBatchId?: string;
  readonly now: () => string;
}

export type FakeOntologyBootstrapSpecialistResult =
  | {
      readonly ok: true;
      readonly dossier: OntologyBootstrapDossier;
      readonly toolPreviews: readonly OntologyBootstrapToolPreview[];
      readonly sideEffects: readonly never[];
    }
  | {
      readonly ok: false;
      readonly failure: OntologyBootstrapFailure;
    };

export function runFakeOntologyBootstrapSpecialist(
  input: RunFakeOntologyBootstrapSpecialistInput
): FakeOntologyBootstrapSpecialistResult {
  const readiness = buildOntologyBootstrapReadiness({
    sourceCollectionId: input.sourceCollectionId,
    review: input.review,
    report: input.report,
    evidenceLinks: input.evidenceLinks
  });

  if (readiness.failures.length > 0 || input.report === undefined) {
    return { ok: false, failure: readiness.failures[0] ?? {
      code: "legacy-report-required",
      message: "A legacy migration report is required before ontology bootstrap.",
      allowedRepairActions: ["run legacy inspect", "review the first artifact ask"]
    } };
  }

  const dossier = buildOntologyBootstrapDossier({
    report: input.report,
    review: input.review,
    evidenceLinks: input.evidenceLinks,
    now: input.now
  });

  return {
    ok: true,
    dossier,
    toolPreviews: toolPreviewsFor(input, dossier),
    sideEffects: []
  };
}

function toolPreviewsFor(
  input: RunFakeOntologyBootstrapSpecialistInput & { readonly report: LegacyMigrationReport },
  dossier: OntologyBootstrapDossier
): OntologyBootstrapToolPreview[] {
  if (dossier.phase === "raw-import-review") {
    return [createRawImportApprovalPreview({
      sourceCollectionId: input.report.sourceCollectionId,
      scanBatchId: input.report.scanBatchId,
      importBatchId: input.importBatchId ?? "imp_ontology_bootstrap_preview",
      legacyReportId: input.report.legacyReportId,
      reportHash: input.report.reportHash
    })];
  }

  if (dossier.phase === "staging-review") {
    const selected = selectCandidateIds(input, dossier);
    return selected.length === 0 ? [] : [createStagingApprovalPreview({
      report: input.report,
      stagingBatchId: input.stagingBatchId ?? "legacy_stage_ontology_bootstrap_preview",
      selectedCandidateIds: selected,
      evidenceRefs: dossier.candidateBatches
        .flatMap((batch) => batch.candidates)
        .filter((candidate) => selected.includes(candidate.candidateId) && candidate.evidenceId !== undefined)
        .map((candidate) => ({
          candidateId: candidate.candidateId,
          evidenceId: candidate.evidenceId as string,
          evidenceContentHash: candidate.evidenceContentHash
        }))
    })];
  }

  if (dossier.phase === "ready-to-stage") {
    const selected = selectCandidateIds(input, dossier);
    return selected.length === 0 ? [] : [createStagingExecutionPreview({
      report: input.report,
      stagingBatchId: input.stagingBatchId ?? "legacy_stage_ontology_bootstrap_preview",
      selectedCandidateIds: selected
    })];
  }

  return [];
}

function selectCandidateIds(
  input: RunFakeOntologyBootstrapSpecialistInput,
  dossier: OntologyBootstrapDossier
): string[] {
  const eligibleIds = new Set(
    dossier.candidateBatches
      .filter((batch) => batch.readiness === "eligible")
      .flatMap((batch) => batch.candidates.map((candidate) => candidate.candidateId))
  );
  return input.selectedCandidateIds
    .filter((candidateId) => eligibleIds.has(candidateId))
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}
```

Modify `packages/ontology-bootstrap/src/index.ts`:

```ts
export * from "./contracts.js";
export * from "./dossier-builder.js";
export * from "./read-model.js";
export * from "./tool-previews.js";
export * from "./fake-runtime.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ontology-bootstrap/test/fake-runtime.test.ts packages/ontology-bootstrap/test/tool-previews.test.ts packages/ontology-bootstrap/test/dossier-builder.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 6: Run full verification and commit**

Run:

```bash
npm run verify
git add docs/agentic/claims/task-5-ontology-bootstrap-fake-runtime.md packages/ontology-bootstrap/src/fake-runtime.ts packages/ontology-bootstrap/src/index.ts packages/ontology-bootstrap/test/fake-runtime.test.ts
git commit -m "feat: add fake ontology bootstrap specialist"
```

Expected verification:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

**Acceptance Criteria:**

- Fake runtime returns deterministic dossiers and previews.
- Fake runtime has no side effects, model calls, source-tree reads, imports, staging execution, or UI mutation.
- Missing reports produce safe failures.

## Task 6: Factory Readiness And Documentation Evidence

**Files:**

- Create: `docs/agentic/claims/task-6-ontology-bootstrap-readiness.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`
- Modify: `docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-6-ontology-bootstrap-readiness.md` with the owned files above and status `claimed`. Then change status to `in-progress`.

- [ ] **Step 2: Run focused verification bundle**

Run:

```bash
npm test -- packages/ontology-bootstrap/test/contracts.test.ts packages/ontology-bootstrap/test/dossier-builder.test.ts packages/ontology-bootstrap/test/read-model.test.ts packages/ontology-bootstrap/test/tool-previews.test.ts packages/ontology-bootstrap/test/fake-runtime.test.ts packages/ingestion/test/legacy-runtime.test.ts packages/ingestion/test/legacy-staging.test.ts
```

Expected:

```text
Test Files  7 passed
```

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 4: Track the new design and plan in factory readiness**

Modify `scripts/check-agent-readiness.mjs` by adding these entries to `requiredFiles` near the resident-agent files:

```js
  "docs/superpowers/specs/2026-07-07-ontology-bootstrap-specialist-design.md",
  "docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md"
```

- [ ] **Step 5: Record readiness evidence**

Append this section to `docs/agentic/software-factory.md`:

```md
## Ontology Bootstrap Specialist Plan Readiness

The ontology bootstrap specialist design and implementation plan were prepared from the approved zero-trust legacy import direction on 2026-07-07.

Required design and plan files:

- `docs/superpowers/specs/2026-07-07-ontology-bootstrap-specialist-design.md`
- `docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded validation commands from the planning slice:

```text
git diff --check
npm run factory:check
npm run verify
```

The plan scopes the first implementation to strict DTO contracts, deterministic read models, fake dossier generation over existing legacy reports, and approval-preview builders. It does not implement live model orchestration, direct source-tree import, raw byte copy, staging execution outside existing legacy services, accepted ontology truth, legal/export actions, or destructive repair.
```

- [ ] **Step 6: Run whitespace and factory checks**

Run:

```bash
git diff --check
npm run factory:check
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 7: Run full verification again**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 8: Commit readiness evidence**

Run:

```bash
git add docs/agentic/claims/task-6-ontology-bootstrap-readiness.md scripts/check-agent-readiness.mjs docs/agentic/software-factory.md docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md
git commit -m "docs: record ontology bootstrap readiness"
```

**Acceptance Criteria:**

- Focused ontology-bootstrap and legacy gating tests pass.
- Full verification passes.
- Factory readiness tracks the specialist spec and plan.
- Readiness docs explicitly state that first implementation is fake/deterministic and preserves zero-trust legacy import semantics.

## Completion Criteria

The ontology-bootstrap specialist foundation is complete when:

- Every task above has a commit.
- `npm run verify` passes.
- Factory readiness tracks the design and plan.
- `packages/ontology-bootstrap` exports strict contracts, dossier builder, read-model helper, tool-preview builders, and fake runtime.
- Dossiers are deterministic and evidence-bound.
- Tool previews bind exact report hash, candidate-set hash, selected candidate IDs, evidence IDs, and allowed event types.
- The fake runtime has no side effects.
- Tests prove legacy-derived structure can only be staged as evidence-tied `assertion.proposed` through existing legacy services after human approval.
- No accepted graph, legal/export, provider byte-transfer, destructive repair, or direct source-tree path exists in this specialist.
