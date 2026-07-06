# Legacy Cestus Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a recon-first, plugin-based old-Cestus importer that inspects mixed legacy file bundles, reports candidate legacy ontology material, imports every approved legacy file as evidence, and stages only evidence-tied legacy claims as `assertion.proposed`.

**Architecture:** Add a legacy import adapter inside `packages/ingestion` that composes the current local filesystem scanner, import service, evidence service, assertion service, and rebuildable projections. Legacy-specific durable state is represented by strict ontology events for report generation and ontology staging approval. Detector/parser plugins emit neutral report observations and quarantine entries before any ontology proposal is allowed.

**Tech Stack:** TypeScript, Node.js 26, npm, Vitest, Zod, existing ontology ledger/blob/evidence/assertion primitives, existing ingestion scanner/import/projection patterns, Markdown factory work orders.

---

## Required Reading

Before editing, every worker reads:

1. `AGENTS.md`
2. `.agents/skills/cestus-software-factory/SKILL.md`
3. `docs/agentic/software-factory.md`
4. `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
5. `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
6. `docs/superpowers/specs/2026-07-05-public-ingestion-pipeline-design.md`
7. `docs/superpowers/plans/2026-07-05-public-ingestion-pipeline-implementation.md`
8. `docs/superpowers/specs/2026-07-06-legacy-cestus-import-design.md`
9. This plan

## First Artifact Ask

Before implementing user-specific legacy mapping plugins, ask the user for:

1. A read-only folder tree listing of the old Cestus root.
2. Two to five sanitized representative metadata or ontology files.
3. Any old manifest, index, registry, or graph export file if present.

The generic recon infrastructure in this plan does not depend on that sample. Format-specific plugins beyond the conservative fixture plugin stop until the sample exists.

## Software Factory Rules

Every implementation task is a work order:

1. Use a task-scoped branch or isolated worktree.
2. Claim the task with a durable file at `docs/agentic/claims/task-N-short-slug.md`.
3. Commit the claim before editing task files.
4. Change the claim status to `in-progress`.
5. Read every file named by the task.
6. Write the failing test or validation first.
7. Run the exact targeted command and confirm the expected failure.
8. Implement the smallest scoped change.
9. Run the targeted command again.
10. Run `npm run verify`.
11. Commit only the files listed by the task plus the task claim.
12. Hand off to spec review and code-quality review before starting the next dependent task.

Stop when a task needs source-tree mutation, data-loss migration, schema conflict, unavailable dependency, live external service, credentials, missing user sample for a user-specific mapping plugin, unavailable portable workspace mount contract, or a verifier still fails after two focused repair attempts.

## File Structure

- `packages/ontology/src/contracts.ts`: add strict legacy report and ontology staging approval event contracts.
- `packages/ontology/test/contracts.test.ts`: verify legacy event validation, unknown-key rejection, human staging approval, and forbidden accepted-event import policy.
- `packages/ingestion/src/legacy-types.ts`: shared legacy import IDs, report DTOs, detector/parser result types, quarantine entries, proposed assertion candidates, and first artifact ask text.
- `packages/ingestion/src/legacy-plugins.ts`: detector/parser plugin interfaces, deterministic registry, and conservative generic metadata detector.
- `packages/ingestion/src/legacy-inspector.ts`: read-only legacy inspection service that composes `LocalFilesystemScanner`, runs plugins, and builds report inputs.
- `packages/ingestion/src/legacy-report.ts`: deterministic migration report builder, report hashing, report storage, and report event append service.
- `packages/ingestion/src/legacy-projection.ts`: rebuildable projection for legacy report events, staging approvals, diagnostics, and evidence links.
- `packages/ingestion/src/legacy-read-api.ts`: stable CLI/UI DTOs for migration report review, raw import readiness, staging readiness, and quarantine review.
- `packages/ingestion/src/legacy-import-service.ts`: evidence-first raw import bridge that imports report file records through `IngestionImportService`.
- `packages/ingestion/src/legacy-staging.ts`: staging approval service and assertion stager that calls `AssertionService.propose()` only for approved, evidence-tied candidates.
- `packages/ingestion/src/cli.ts`: add pure command handlers for legacy report JSON and first artifact ask output.
- `packages/ingestion/src/index.ts`: export legacy modules.
- `packages/ingestion/test/legacy-*.test.ts`: focused tests for contracts, plugins, inspection, report persistence, projections, import bridge, staging, and CLI DTOs.
- `packages/ingestion/test/fixtures/legacy-cestus-fixtures.ts`: generated mixed old-Cestus fixture tree and deterministic fixture plugin inputs.
- `scripts/check-agent-readiness.mjs`: require this spec and plan after implementation is complete.
- `docs/agentic/software-factory.md`: record final readiness evidence after all implementation tasks pass.

## Scope Boundary

This plan builds backend/domain contracts and pure CLI DTO handlers. It does not wire product UI, local runtime endpoints, portable mount discovery, provider parsing, accepted graph review UI, or user-specific legacy schema plugins.

Do not edit `packages/local-runtime`, `packages/ui/src/App.tsx`, `packages/ui/src/requests/request-adapter.ts`, runtime preview files, or portable mount files in this plan.

## Task 1: Add Legacy Event Contracts

**Files:**
- Create: `docs/agentic/claims/task-1-legacy-event-contracts.md`
- Modify: `packages/ontology/src/contracts.ts`
- Modify: `packages/ontology/test/contracts.test.ts`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-legacy-event-contracts.md` with:

```md
# Task 1: Legacy Event Contracts

Plan: `docs/superpowers/plans/2026-07-06-legacy-cestus-import-implementation.md`
Task: Task 1: Add Legacy Event Contracts
Branch: `codex/legacy-cestus-import`
Status: claimed
Claimed-at: use `date -u +%Y-%m-%dT%H:%M:%SZ`
Worker: current Codex worker

## Owned Files

- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/contracts.test.ts`
```

Commit the claim:

```bash
git add docs/agentic/claims/task-1-legacy-event-contracts.md
git commit -m "chore: claim legacy event contracts"
```

- [ ] **Step 2: Mark the claim in progress**

Change `Status: claimed` to `Status: in-progress` in the claim file. Do not commit the status change yet.

- [ ] **Step 3: Write failing contract tests**

Append this block to `packages/ontology/test/contracts.test.ts`:

```ts
describe("legacy Cestus import event contracts", () => {
  const legacyReportHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const legacyCandidateSetHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  it("validates report generation and staging approval events", () => {
    const report = legacyEvent("evt_legacy_report_generated", "legacy.import.report.generated", {
      legacyReportId: "legacy_report_001",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      reportHash: legacyReportHash,
      candidateSetHash: legacyCandidateSetHash,
      generatedAt: "2026-07-06T12:00:00.000Z",
      generator: { name: "legacy-cestus-inspector", version: "0.1.0" },
      totals: {
        inspectedFiles: 5,
        candidateMetadataFiles: 2,
        proposedAssertionCandidates: 1,
        quarantineEntries: 2,
        unresolvedReferences: 1
      }
    });

    const approval = legacyEvent("evt_legacy_staging_approved", "legacy.ontology.staging.approved", {
      stagingBatchId: "legacy_stage_001",
      legacyReportId: "legacy_report_001",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      reportHash: legacyReportHash,
      candidateSetHash: legacyCandidateSetHash,
      approvedBy: "actor_investigator",
      approvedAt: "2026-07-06T12:05:00.000Z",
      approvedAssertionCandidateIds: ["legacy_candidate_001"]
    });

    expect(validateKnowledgeEvent(report).success).toBe(true);
    expect(validateKnowledgeEvent(approval).success).toBe(true);
  });

  it("rejects uncontracted legacy report fields", () => {
    const event = legacyEvent("evt_legacy_report_extra", "legacy.import.report.generated", {
      legacyReportId: "legacy_report_extra",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      reportHash: legacyReportHash,
      candidateSetHash: legacyCandidateSetHash,
      generatedAt: "2026-07-06T12:00:00.000Z",
      generator: { name: "legacy-cestus-inspector", version: "0.1.0" },
      totals: {
        inspectedFiles: 1,
        candidateMetadataFiles: 1,
        proposedAssertionCandidates: 0,
        quarantineEntries: 1,
        unresolvedReferences: 0
      },
      acceptedEntityIds: ["ent_forbidden"]
    });

    expect(validateKnowledgeEvent(event).success).toBe(false);
  });

  it("requires human approval for legacy ontology staging", () => {
    const event = {
      ...legacyEvent("evt_legacy_staging_system", "legacy.ontology.staging.approved", {
        stagingBatchId: "legacy_stage_system",
        legacyReportId: "legacy_report_001",
        sourceCollectionId: "src_old_cestus",
        scanBatchId: "scan_old_cestus_001",
        reportHash: legacyReportHash,
        candidateSetHash: legacyCandidateSetHash,
        approvedBy: "actor_system",
        approvedAt: "2026-07-06T12:05:00.000Z",
        approvedAssertionCandidateIds: ["legacy_candidate_001"]
      }),
      context: {
        ...context,
        actor: { id: "actor_system", kind: "system" as const, label: "system" }
      }
    };

    const result = validateKnowledgeEvent(event);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("context.actor.kind");
    }
  });
});

function legacyEvent<Type extends KnowledgeEvent["type"]>(
  id: string,
  type: Type,
  payload: Extract<KnowledgeEvent, { type: Type }>["payload"]
): Extract<KnowledgeEvent, { type: Type }> {
  return {
    id,
    type,
    version: 1,
    streamId: type === "legacy.ontology.staging.approved"
      ? "legacy_staging_src_old_cestus_scan_old_cestus_001_legacy_stage_001"
      : "legacy_report_src_old_cestus_scan_old_cestus_001_legacy_report_001",
    sequence: 1,
    context,
    payload
  } as Extract<KnowledgeEvent, { type: Type }>;
}
```

- [ ] **Step 4: Run the targeted failing test**

Run:

```bash
npm test -- packages/ontology/test/contracts.test.ts
```

Expected: TypeScript or validation failure because `legacy.import.report.generated` and `legacy.ontology.staging.approved` do not exist.

- [ ] **Step 5: Add strict legacy schemas**

In `packages/ontology/src/contracts.ts`, add these schemas near the ingestion schemas:

```ts
const legacyReportIdSchema = z.string().regex(/^legacy_report_[a-zA-Z0-9_-]+$/);
const legacyStagingBatchIdSchema = z.string().regex(/^legacy_stage_[a-zA-Z0-9_-]+$/);
const legacyCandidateIdSchema = z.string().regex(/^legacy_candidate_[a-zA-Z0-9_-]+$/);

const legacyReportTotalsSchema = z.object({
  inspectedFiles: z.number().int().nonnegative(),
  candidateMetadataFiles: z.number().int().nonnegative(),
  proposedAssertionCandidates: z.number().int().nonnegative(),
  quarantineEntries: z.number().int().nonnegative(),
  unresolvedReferences: z.number().int().nonnegative()
}).strict();

const legacyImportReportGeneratedPayloadSchema = z.object({
  legacyReportId: legacyReportIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  scanBatchId: scanBatchIdSchema,
  reportHash: contentHashSchema,
  candidateSetHash: contentHashSchema,
  generatedAt: z.string().datetime(),
  generator: secretSafeIngestionAdapterRefSchema,
  totals: legacyReportTotalsSchema
}).strict();

const legacyOntologyStagingApprovedPayloadSchema = z.object({
  stagingBatchId: legacyStagingBatchIdSchema,
  legacyReportId: legacyReportIdSchema,
  sourceCollectionId: sourceCollectionIdSchema,
  scanBatchId: scanBatchIdSchema,
  reportHash: contentHashSchema,
  candidateSetHash: contentHashSchema,
  approvedBy: secretSafeStringSchema.min(3),
  approvedAt: z.string().datetime(),
  approvedAssertionCandidateIds: z.array(legacyCandidateIdSchema)
}).strict();
```

Add both payload schemas to `payloadSchemas`:

```ts
"legacy.import.report.generated": legacyImportReportGeneratedPayloadSchema,
"legacy.ontology.staging.approved": legacyOntologyStagingApprovedPayloadSchema,
```

Add event contract entries with these invariants:

```ts
"legacy.import.report.generated": {
  type: "legacy.import.report.generated",
  version: 1,
  description: "Records a content-addressed migration report for a read-only old-Cestus inspection batch.",
  agentGuidance: "Use after deterministic inspection and plugin parsing. This event references report artifacts and candidate sets; it does not import accepted graph truth.",
  invariants: [
    "reportHash and candidateSetHash must be sha256",
    "totals must be nonnegative",
    "accepted graph event IDs are not allowed in the payload"
  ]
},
"legacy.ontology.staging.approved": {
  type: "legacy.ontology.staging.approved",
  version: 1,
  description: "Records human approval to stage selected evidence-tied legacy observations as proposed assertions.",
  agentGuidance: "Use only after raw evidence import and report review. This event permits assertion.proposed only, never accepted assertions or entity resolution.",
  invariants: [
    "context actor must be human",
    "reportHash and candidateSetHash must match the reviewed report",
    "approved candidates can only become assertion.proposed"
  ]
},
```

Add `"legacy.ontology.staging.approved"` to `alwaysHumanGatedEventTypes`.

Add stream checks in the `knowledgeEventSchema.superRefine()` block:

```ts
if (event.type === "legacy.import.report.generated") {
  const legacyPayload = payload.data as PayloadByEventType["legacy.import.report.generated"];
  const expectedStreamId = `legacy_report_${legacyPayload.sourceCollectionId}_${legacyPayload.scanBatchId}_${legacyPayload.legacyReportId}`;
  if (event.streamId !== expectedStreamId) {
    ctx.addIssue({
      code: "custom",
      message: "legacy report streamId must match source, scan, and report identity",
      path: ["streamId"]
    });
  }
}

if (event.type === "legacy.ontology.staging.approved") {
  const legacyPayload = payload.data as PayloadByEventType["legacy.ontology.staging.approved"];
  const expectedStreamId = `legacy_staging_${legacyPayload.sourceCollectionId}_${legacyPayload.scanBatchId}_${legacyPayload.stagingBatchId}`;
  if (event.streamId !== expectedStreamId) {
    ctx.addIssue({
      code: "custom",
      message: "legacy staging streamId must match source, scan, and staging identity",
      path: ["streamId"]
    });
  }
}
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/ontology/test/contracts.test.ts
```

Expected: contract tests pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add docs/agentic/claims/task-1-legacy-event-contracts.md packages/ontology/src/contracts.ts packages/ontology/test/contracts.test.ts
git commit -m "feat: add legacy import event contracts"
```

## Task 2: Add Legacy Types And Plugin Contracts

**Files:**
- Create: `docs/agentic/claims/task-2-legacy-plugin-contracts.md`
- Create: `packages/ingestion/src/legacy-types.ts`
- Create: `packages/ingestion/src/legacy-plugins.ts`
- Create: `packages/ingestion/test/legacy-plugins.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-legacy-plugin-contracts.md` with this task's owned files.

- [ ] **Step 2: Write failing plugin contract tests**

Create `packages/ingestion/test/legacy-plugins.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { conservativeJsonMetadataPlugin, LegacyDetectorRegistry } from "../src/legacy-plugins.js";
import { firstLegacyArtifactAsk } from "../src/legacy-types.js";

const contentHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;

describe("legacy detector registry", () => {
  it("exposes the first artifact ask for user recon", () => {
    expect(firstLegacyArtifactAsk).toEqual([
      "Read-only folder tree listing of the old Cestus root",
      "Two to five sanitized metadata or ontology files",
      "Any old manifest, index, registry, or graph export file if present"
    ]);
  });

  it("runs detector plugins in deterministic order", () => {
    const registry = new LegacyDetectorRegistry([
      conservativeJsonMetadataPlugin,
      {
        name: "zzz-fixture-detector",
        version: "0.1.0",
        detect(input) {
          return {
            plugin: { name: "zzz-fixture-detector", version: "0.1.0" },
            shape: "fixture",
            confidence: input.sourcePath.endsWith(".json") ? 0.51 : 0,
            parserEligible: false,
            reasonCodes: ["fixture"]
          };
        }
      }
    ]);

    const detections = registry.detect({
      sourcePath: "ontology/person.json",
      sizeBytes: 28,
      contentHash,
      mediaType: "application/json",
      previewText: "{\"legacyCestusType\":\"claims\"}",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001"
    });

    expect(detections.map((detection) => detection.plugin.name)).toEqual([
      "legacy-json-metadata",
      "zzz-fixture-detector"
    ]);
    expect(detections[0]).toMatchObject({
      shape: "json-legacy-metadata",
      confidence: 0.8,
      parserEligible: true
    });
  });

  it("keeps generic JSON detection conservative", () => {
    const registry = new LegacyDetectorRegistry([conservativeJsonMetadataPlugin]);
    const detections = registry.detect({
      sourcePath: "notes/random.json",
      sizeBytes: 12,
      contentHash,
      mediaType: "application/json",
      previewText: "{\"agency\":true}",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001"
    });

    expect(detections).toEqual([]);
  });
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/ingestion/test/legacy-plugins.test.ts
```

Expected: failure resolving `../src/legacy-plugins.js` and `../src/legacy-types.js`.

- [ ] **Step 4: Create shared legacy types**

Create `packages/ingestion/src/legacy-types.ts`:

```ts
export const firstLegacyArtifactAsk = [
  "Read-only folder tree listing of the old Cestus root",
  "Two to five sanitized metadata or ontology files",
  "Any old manifest, index, registry, or graph export file if present"
] as const;

export type LegacyObservationKind =
  | "possible-claim"
  | "possible-entity"
  | "possible-relationship"
  | "possible-property"
  | "candidate-entity-resolution"
  | "candidate-relationship"
  | "stale-reference"
  | "malformed-record"
  | "unknown-field";

export interface LegacyPluginRef {
  name: string;
  version: string;
}

export interface LegacyFileRef {
  sourcePath: string;
  sizeBytes: number;
  contentHash: `sha256:${string}`;
  mediaType: string;
  sourceCollectionId: string;
  scanBatchId: string;
}

export interface LegacyDetectorInput extends LegacyFileRef {
  previewText?: string;
}

export interface LegacyDetection {
  plugin: LegacyPluginRef;
  shape: string;
  confidence: number;
  parserEligible: boolean;
  reasonCodes: string[];
  warnings?: string[];
}

export interface LegacyObservation {
  observationId: string;
  kind: LegacyObservationKind;
  sourcePath: string;
  contentHash: `sha256:${string}`;
  plugin: LegacyPluginRef;
  confidence: number;
  label: string;
  subjectRef?: string;
  predicate?: string;
  object?: string | number | boolean | null;
  legacyIds: string[];
  notes: string[];
}

export interface LegacyQuarantineEntry {
  quarantineId: string;
  sourcePath: string;
  contentHash: `sha256:${string}`;
  plugin: LegacyPluginRef;
  issueCategory: "malformed" | "ambiguous" | "unsupported" | "stale-reference" | "unsafe" | "conflict";
  message: string;
  legacyIds: string[];
  repairActions: string[];
}

export interface LegacyProposedAssertionCandidate {
  candidateId: string;
  observationId: string;
  evidenceContentHash: `sha256:${string}`;
  sourcePath: string;
  predicate: string;
  object: string | number | boolean | null;
  subjectRef?: string;
  confidence: number;
}
```

- [ ] **Step 5: Create plugin registry and conservative detector**

Create `packages/ingestion/src/legacy-plugins.ts`:

```ts
import type {
  LegacyDetection,
  LegacyDetectorInput,
  LegacyPluginRef
} from "./legacy-types.js";

export interface LegacyDetectorPlugin extends LegacyPluginRef {
  detect(input: LegacyDetectorInput): LegacyDetection | undefined;
}

export class LegacyDetectorRegistry {
  private readonly plugins: LegacyDetectorPlugin[];

  constructor(plugins: readonly LegacyDetectorPlugin[]) {
    this.plugins = [...plugins].sort((left, right) => compareCodeUnits(left.name, right.name));
  }

  detect(input: LegacyDetectorInput): LegacyDetection[] {
    return this.plugins
      .map((plugin) => plugin.detect(input))
      .filter((detection): detection is LegacyDetection => detection !== undefined && detection.confidence > 0)
      .sort((left, right) => {
        const confidence = right.confidence - left.confidence;
        return confidence === 0 ? compareCodeUnits(left.plugin.name, right.plugin.name) : confidence;
      });
  }
}

export const conservativeJsonMetadataPlugin: LegacyDetectorPlugin = {
  name: "legacy-json-metadata",
  version: "0.1.0",
  detect(input) {
    if (input.mediaType !== "application/json" && !input.sourcePath.toLowerCase().endsWith(".json")) {
      return undefined;
    }
    if (!input.previewText?.includes("legacyCestusType")) {
      return undefined;
    }
    return {
      plugin: { name: "legacy-json-metadata", version: "0.1.0" },
      shape: "json-legacy-metadata",
      confidence: 0.8,
      parserEligible: true,
      reasonCodes: ["json", "explicit-legacy-cestus-marker"]
    };
  }
};

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
```

Modify `packages/ingestion/src/index.ts`:

```ts
export * from "./legacy-types.js";
export * from "./legacy-plugins.js";
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/ingestion/test/legacy-plugins.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 8: Commit**

Run:

```bash
git add docs/agentic/claims/task-2-legacy-plugin-contracts.md packages/ingestion/src/legacy-types.ts packages/ingestion/src/legacy-plugins.ts packages/ingestion/src/index.ts packages/ingestion/test/legacy-plugins.test.ts
git commit -m "feat: add legacy plugin contracts"
```

## Task 3: Add Fixture-Driven Legacy Inspection

**Files:**
- Create: `docs/agentic/claims/task-3-legacy-inspector.md`
- Create: `packages/ingestion/src/legacy-inspector.ts`
- Create: `packages/ingestion/test/legacy-inspector.test.ts`
- Create: `packages/ingestion/test/fixtures/legacy-cestus-fixtures.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-legacy-inspector.md` with this task's owned files.

- [ ] **Step 2: Write failing fixture and inspector tests**

Create `packages/ingestion/test/fixtures/legacy-cestus-fixtures.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function writeLegacyCestusFixture(root: string): void {
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "ontology"), { recursive: true });
  writeFileSync(join(root, "docs", "contract.txt"), "contract body");
  writeFileSync(join(root, "docs", "contract-copy.txt"), "contract body");
  writeFileSync(join(root, "ontology", "claims.json"), JSON.stringify({
    legacyCestusType: "claims",
    claims: [{ id: "legacy_claim_1", predicate: "agency.name", object: "Example Agency" }]
  }, null, 2));
  writeFileSync(join(root, "ontology", "corrupt.json"), "{\"legacyCestusType\":");
}
```

Create `packages/ingestion/test/legacy-inspector.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { LegacyCestusInspector } from "../src/legacy-inspector.js";
import { conservativeJsonMetadataPlugin, LegacyDetectorRegistry } from "../src/legacy-plugins.js";
import { writeLegacyCestusFixture } from "./fixtures/legacy-cestus-fixtures.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "legacy-cestus-"));
  writeLegacyCestusFixture(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("LegacyCestusInspector", () => {
  it("inspects a mixed old-Cestus tree without importing evidence", async () => {
    const ledger = new InMemoryEventLedger();
    const inspector = new LegacyCestusInspector({
      ledger,
      detectorRegistry: new LegacyDetectorRegistry([conservativeJsonMetadataPlugin]),
      actor: { id: "actor_system", kind: "system", label: "Legacy inspector" }
    });

    const reportInput = await inspector.inspect({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      rootDir: root
    });

    expect(reportInput.files).toHaveLength(4);
    expect(reportInput.scan.totals.observedFiles).toBe(4);
    expect(reportInput.scan.totals.uniqueContent).toBe(3);
    expect(reportInput.detections.map((detection) => detection.sourcePath)).toEqual([
      "ontology/claims.json",
      "ontology/corrupt.json"
    ]);
    expect((await ledger.readAll()).map((event) => event.type)).not.toContain("evidence.ingested");
  });
});
```

- [ ] **Step 3: Run targeted failing test**

Run:

```bash
npm test -- packages/ingestion/test/legacy-inspector.test.ts
```

Expected: failure resolving `../src/legacy-inspector.js`.

- [ ] **Step 4: Implement the inspector**

Create `packages/ingestion/src/legacy-inspector.ts`:

```ts
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { z } from "zod";
import { actorRefSchema } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { LocalFilesystemScanner, type LocalFilesystemOccurrence, type LocalFilesystemScanResult } from "./local-filesystem.js";
import type { LegacyDetection, LegacyDetectorInput } from "./legacy-types.js";
import type { LegacyDetectorRegistry } from "./legacy-plugins.js";

type ActorRef = z.infer<typeof actorRefSchema>;

export interface LegacyCestusInspectorDependencies {
  ledger: EventLedger;
  actor: ActorRef;
  detectorRegistry: LegacyDetectorRegistry;
}

export interface LegacyInspectInput {
  sourceCollectionId: string;
  scanBatchId: string;
  rootDir: string;
}

export interface LegacyInspectedFile {
  sourcePath: string;
  contentHash: `sha256:${string}`;
  sizeBytes: number;
  mediaType: string;
}

export interface LegacyDetectionRecord extends LegacyDetection {
  sourcePath: string;
  contentHash: `sha256:${string}`;
}

export interface LegacyReportInput {
  sourceCollectionId: string;
  scanBatchId: string;
  rootDir: string;
  scan: LocalFilesystemScanResult;
  files: LegacyInspectedFile[];
  detections: LegacyDetectionRecord[];
}

export class LegacyCestusInspector {
  constructor(private readonly dependencies: LegacyCestusInspectorDependencies) {
    const actor = actorRefSchema.safeParse(dependencies.actor);
    if (!actor.success) {
      throw new Error(`Invalid legacy inspector actor: ${actor.error.issues[0]?.message ?? actor.error.message}`);
    }
  }

  async inspect(input: LegacyInspectInput): Promise<LegacyReportInput> {
    const rootDir = resolve(input.rootDir);
    const scanner = new LocalFilesystemScanner({
      ledger: this.dependencies.ledger,
      actor: this.dependencies.actor
    });
    const scan = await scanner.scan({ ...input, rootDir });
    const files = scan.occurrences.map((occurrence) => this.inspectedFile(occurrence));
    const detections = scan.occurrences.flatMap((occurrence) => this.detectOccurrence(rootDir, occurrence));

    return {
      sourceCollectionId: input.sourceCollectionId,
      scanBatchId: input.scanBatchId,
      rootDir,
      scan,
      files,
      detections
    };
  }

  private inspectedFile(occurrence: LocalFilesystemOccurrence): LegacyInspectedFile {
    return {
      sourcePath: occurrence.internalPath ?? occurrence.sourcePath,
      contentHash: occurrence.contentHash,
      sizeBytes: occurrence.sizeBytes,
      mediaType: mediaTypeForPath(occurrence.internalPath ?? occurrence.sourcePath)
    };
  }

  private detectOccurrence(rootDir: string, occurrence: LocalFilesystemOccurrence): LegacyDetectionRecord[] {
    if (occurrence.internalPath !== undefined) {
      return [];
    }
    const sourcePath = occurrence.sourcePath;
    const previewText = readFileSync(join(rootDir, sourcePath), "utf8").slice(0, 4096);
    const detectorInput: LegacyDetectorInput = {
      sourcePath,
      sizeBytes: occurrence.sizeBytes,
      contentHash: occurrence.contentHash,
      mediaType: mediaTypeForPath(sourcePath),
      previewText,
      sourceCollectionId: occurrence.sourceCollectionId,
      scanBatchId: occurrence.scanBatchId
    };
    return this.dependencies.detectorRegistry.detect(detectorInput).map((detection) => ({
      ...detection,
      sourcePath,
      contentHash: occurrence.contentHash
    }));
  }
}

function mediaTypeForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) {
    return "application/json";
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return "text/markdown";
  }
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    return "application/yaml";
  }
  if (lower.endsWith(".csv")) {
    return "text/csv";
  }
  return "application/octet-stream";
}
```

Modify `packages/ingestion/src/index.ts`:

```ts
export * from "./legacy-inspector.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ingestion/test/legacy-inspector.test.ts packages/ingestion/test/local-filesystem.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/agentic/claims/task-3-legacy-inspector.md packages/ingestion/src/legacy-inspector.ts packages/ingestion/src/index.ts packages/ingestion/test/legacy-inspector.test.ts packages/ingestion/test/fixtures/legacy-cestus-fixtures.ts
git commit -m "feat: inspect legacy Cestus bundles"
```

## Task 4: Add Migration Report Builder And Persistence

**Files:**
- Create: `docs/agentic/claims/task-4-legacy-report.md`
- Create: `packages/ingestion/src/legacy-report.ts`
- Create: `packages/ingestion/test/legacy-report.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-4-legacy-report.md` with this task's owned files.

- [ ] **Step 2: Write failing report tests**

Create `packages/ingestion/test/legacy-report.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { LegacyMigrationReportService, buildLegacyMigrationReport } from "../src/legacy-report.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "legacy-report-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("legacy migration report", () => {
  it("builds stable report summaries and candidate set hashes", () => {
    const report = buildLegacyMigrationReport({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      files: [
        { sourcePath: "docs/a.txt", contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111", sizeBytes: 4, mediaType: "text/plain" },
        { sourcePath: "ontology/claims.json", contentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222", sizeBytes: 60, mediaType: "application/json" }
      ],
      detections: [{
        sourcePath: "ontology/claims.json",
        contentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        plugin: { name: "legacy-json-metadata", version: "0.1.0" },
        shape: "json-legacy-metadata",
        confidence: 0.8,
        parserEligible: true,
        reasonCodes: ["json", "explicit-legacy-cestus-marker"]
      }],
      proposedAssertionCandidates: [{
        candidateId: "legacy_candidate_001",
        observationId: "legacy_obs_001",
        evidenceContentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        sourcePath: "ontology/claims.json",
        predicate: "agency.name",
        object: "Example Agency",
        confidence: 0.8
      }],
      quarantineEntries: []
    });

    expect(report.totals).toEqual({
      inspectedFiles: 2,
      candidateMetadataFiles: 1,
      proposedAssertionCandidates: 1,
      quarantineEntries: 0,
      unresolvedReferences: 0
    });
    expect(report.reportHash).toMatch(/^sha256:/);
    expect(report.candidateSetHash).toMatch(/^sha256:/);
  });

  it("stores report JSON and appends a report event", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new LegacyMigrationReportService({
      ledger,
      reportStore: new FileBlobStore(dir),
      actor: { id: "actor_system", kind: "system", label: "Legacy reporter" }
    });

    const report = buildLegacyMigrationReport({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      files: [],
      detections: [],
      proposedAssertionCandidates: [],
      quarantineEntries: []
    });
    const event = await service.recordReport(report);

    expect(event.type).toBe("legacy.import.report.generated");
    expect(event.payload.reportHash).toBe(report.reportHash);
    expect(await ledger.readAll()).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/ingestion/test/legacy-report.test.ts
```

Expected: failure resolving `../src/legacy-report.js`.

- [ ] **Step 4: Implement report builder and service**

Create `packages/ingestion/src/legacy-report.ts` with deterministic JSON hashing:

```ts
import { createHash } from "node:crypto";
import type { z } from "zod";
import { actorRefSchema, type AppendableKnowledgeEvent, type KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type {
  LegacyDetection,
  LegacyFileRef,
  LegacyProposedAssertionCandidate,
  LegacyQuarantineEntry
} from "./legacy-types.js";

type ActorRef = z.infer<typeof actorRefSchema>;

export interface BuildLegacyMigrationReportInput {
  sourceCollectionId: string;
  scanBatchId: string;
  files: LegacyFileRef[];
  detections: Array<LegacyDetection & { sourcePath: string; contentHash: `sha256:${string}` }>;
  proposedAssertionCandidates: LegacyProposedAssertionCandidate[];
  quarantineEntries: LegacyQuarantineEntry[];
}

export interface LegacyMigrationReport extends BuildLegacyMigrationReportInput {
  legacyReportId: string;
  reportHash: `sha256:${string}`;
  candidateSetHash: `sha256:${string}`;
  generatedAt: string;
  generator: { name: "legacy-cestus-inspector"; version: "0.1.0" };
  totals: {
    inspectedFiles: number;
    candidateMetadataFiles: number;
    proposedAssertionCandidates: number;
    quarantineEntries: number;
    unresolvedReferences: number;
  };
  recommendedNextActions: string[];
}

export interface LegacyMigrationReportServiceDependencies {
  ledger: EventLedger;
  reportStore: FileBlobStore;
  actor: ActorRef;
}

export class LegacyMigrationReportService {
  constructor(private readonly dependencies: LegacyMigrationReportServiceDependencies) {}

  async recordReport(report: LegacyMigrationReport): Promise<KnowledgeEventOf<"legacy.import.report.generated">> {
    const stored = await this.dependencies.reportStore.put(Buffer.from(reportArtifactJson(report), "utf8"));
    if (stored.contentHash !== report.reportHash) {
      throw new Error(`Report hash mismatch for ${report.legacyReportId}`);
    }
    const event: AppendableKnowledgeEvent<"legacy.import.report.generated"> = {
      type: "legacy.import.report.generated",
      version: 1,
      streamId: legacyReportStreamId(report),
      context: {
        actor: this.dependencies.actor,
        occurredAt: new Date().toISOString(),
        correlationId: `corr_${report.legacyReportId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0", legacy: "0.1.0" }
      },
      payload: {
        legacyReportId: report.legacyReportId,
        sourceCollectionId: report.sourceCollectionId,
        scanBatchId: report.scanBatchId,
        reportHash: report.reportHash,
        candidateSetHash: report.candidateSetHash,
        generatedAt: report.generatedAt,
        generator: report.generator,
        totals: report.totals
      }
    };
    const appended = await this.dependencies.ledger.append(event, { expectedNextSequence: 1 });
    if (appended.type !== "legacy.import.report.generated") {
      throw new Error(`Unexpected event type appended for legacy report: ${appended.type}`);
    }
    return appended;
  }
}

export function buildLegacyMigrationReport(input: BuildLegacyMigrationReportInput): LegacyMigrationReport {
  const candidateSetHash = sha256(stableJson(input.proposedAssertionCandidates));
  const legacyReportId = `legacy_report_${createHash("sha256").update(`${input.sourceCollectionId}:${input.scanBatchId}:${candidateSetHash}`).digest("hex")}`;
  const draft = {
    ...input,
    files: [...input.files].sort((left, right) => compareCodeUnits(left.sourcePath, right.sourcePath)),
    detections: [...input.detections].sort((left, right) => compareCodeUnits(left.sourcePath, right.sourcePath)),
    proposedAssertionCandidates: [...input.proposedAssertionCandidates].sort((left, right) => compareCodeUnits(left.candidateId, right.candidateId)),
    quarantineEntries: [...input.quarantineEntries].sort((left, right) => compareCodeUnits(left.quarantineId, right.quarantineId)),
    legacyReportId,
    candidateSetHash,
    generatedAt: "2026-07-06T00:00:00.000Z",
    generator: { name: "legacy-cestus-inspector", version: "0.1.0" } as const,
    totals: {
      inspectedFiles: input.files.length,
      candidateMetadataFiles: new Set(input.detections.map((detection) => detection.sourcePath)).size,
      proposedAssertionCandidates: input.proposedAssertionCandidates.length,
      quarantineEntries: input.quarantineEntries.length,
      unresolvedReferences: input.quarantineEntries.filter((entry) => entry.issueCategory === "stale-reference").length
    },
    recommendedNextActions: [
      "Review raw import summary before evidence import",
      "Review proposed assertion candidates before ontology staging",
      "Keep candidate entity resolution and relationship material in the report"
    ]
  };
  return { ...draft, reportHash: sha256(stableJson(draft)) };
}

export function legacyReportStreamId(report: Pick<LegacyMigrationReport, "sourceCollectionId" | "scanBatchId" | "legacyReportId">): string {
  return `legacy_report_${report.sourceCollectionId}_${report.scanBatchId}_${report.legacyReportId}`;
}

function reportArtifactJson(report: LegacyMigrationReport): string {
  const { reportHash: _reportHash, ...hashableReport } = report;
  return stableJson(hashableReport);
}

function sha256(text: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareCodeUnits(left, right)).map(([key, item]) => [key, sortJson(item)]));
  }
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
```

Modify `packages/ingestion/src/index.ts`:

```ts
export * from "./legacy-report.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ingestion/test/legacy-report.test.ts packages/ontology/test/contracts.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/agentic/claims/task-4-legacy-report.md packages/ingestion/src/legacy-report.ts packages/ingestion/src/index.ts packages/ingestion/test/legacy-report.test.ts
git commit -m "feat: record legacy migration reports"
```

## Task 5: Add Legacy Projection And Read API

**Files:**
- Create: `docs/agentic/claims/task-5-legacy-projection.md`
- Create: `packages/ingestion/src/legacy-projection.ts`
- Create: `packages/ingestion/src/legacy-read-api.ts`
- Create: `packages/ingestion/test/legacy-projection.test.ts`
- Create: `packages/ingestion/test/legacy-read-api.test.ts`
- Create: `packages/ingestion/test/fixtures/golden-legacy-ledger.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-5-legacy-projection.md` with this task's owned files.

- [ ] **Step 2: Write failing projection fixture and tests**

Create `packages/ingestion/test/fixtures/golden-legacy-ledger.ts`:

```ts
import type { KnowledgeEvent } from "../../../ontology/src/contracts.js";

const context = {
  actor: { id: "actor_system", kind: "system" as const, label: "legacy fixture" },
  occurredAt: "2026-07-06T12:00:00.000Z",
  correlationId: "corr_legacy_fixture",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0", ingestion: "0.1.0", legacy: "0.1.0" }
};

const humanContext = {
  ...context,
  actor: { id: "actor_investigator", kind: "human" as const, label: "Investigator" }
};

export const goldenLegacyLedgerEvents: KnowledgeEvent[] = [
  {
    id: "evt_legacy_source_registered",
    type: "ingestion.source.registered",
    version: 1,
    streamId: "ingestion_source_src_old_cestus",
    sequence: 1,
    context,
    payload: {
      sourceCollectionId: "src_old_cestus",
      label: "Old Cestus root",
      mode: "read-only",
      adapter: { name: "local-filesystem", version: "0.1.0" },
      rootUri: "file:///old-cestus",
      workspaceUri: "file:///portable-workspace"
    }
  },
  {
    id: "evt_legacy_scan_started",
    type: "ingestion.scan.started",
    version: 1,
    streamId: "ingestion_scan_scan_old_cestus_001",
    sequence: 1,
    context,
    payload: {
      scanBatchId: "scan_old_cestus_001",
      sourceCollectionId: "src_old_cestus",
      hashPolicy: "sha256-dry-run",
      startedAt: "2026-07-06T12:00:00.000Z"
    }
  },
  {
    id: "evt_legacy_occurrence",
    type: "ingestion.occurrence.observed",
    version: 1,
    streamId: "ingestion_scan_scan_old_cestus_001",
    sequence: 2,
    context,
    payload: {
      occurrenceId: "occ_legacy_claims",
      scanBatchId: "scan_old_cestus_001",
      sourceCollectionId: "src_old_cestus",
      contentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      sourcePath: "ontology/claims.json",
      sizeBytes: 60,
      observedAt: "2026-07-06T12:01:00.000Z",
      status: "new",
      adapter: { name: "local-filesystem", version: "0.1.0" }
    }
  },
  {
    id: "evt_legacy_scan_completed",
    type: "ingestion.scan.completed",
    version: 1,
    streamId: "ingestion_scan_scan_old_cestus_001",
    sequence: 3,
    context,
    payload: {
      scanBatchId: "scan_old_cestus_001",
      sourceCollectionId: "src_old_cestus",
      completedAt: "2026-07-06T12:02:00.000Z",
      inventoryHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      totals: {
        observedFiles: 1,
        uniqueContent: 1,
        duplicateOccurrences: 0,
        skipped: 0,
        bytes: 60,
        estimatedNewBlobBytes: 60
      }
    }
  },
  {
    id: "evt_legacy_report",
    type: "legacy.import.report.generated",
    version: 1,
    streamId: "legacy_report_src_old_cestus_scan_old_cestus_001_legacy_report_001",
    sequence: 1,
    context,
    payload: {
      legacyReportId: "legacy_report_001",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      reportHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      candidateSetHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      generatedAt: "2026-07-06T12:03:00.000Z",
      generator: { name: "legacy-cestus-inspector", version: "0.1.0" },
      totals: {
        inspectedFiles: 1,
        candidateMetadataFiles: 1,
        proposedAssertionCandidates: 1,
        quarantineEntries: 1,
        unresolvedReferences: 0
      }
    }
  },
  {
    id: "evt_legacy_quarantine_diag",
    type: "diagnostic.recorded",
    version: 1,
    streamId: "legacy_report_src_old_cestus_scan_old_cestus_001_legacy_report_001",
    sequence: 2,
    context,
    payload: {
      diagnosticId: "diag_legacy_quarantine",
      severity: "warning",
      category: "migration",
      message: "Legacy relationship record remained in migration report state.",
      repairHint: {
        contract: "legacy migration report",
        violatedPath: "candidateRelationships",
        allowedActions: ["Review candidate relationship before adding a strict candidate event contract."]
      }
    }
  },
  {
    id: "evt_legacy_staging",
    type: "legacy.ontology.staging.approved",
    version: 1,
    streamId: "legacy_staging_src_old_cestus_scan_old_cestus_001_legacy_stage_001",
    sequence: 1,
    context: humanContext,
    payload: {
      stagingBatchId: "legacy_stage_001",
      legacyReportId: "legacy_report_001",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      reportHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      candidateSetHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      approvedBy: "actor_investigator",
      approvedAt: "2026-07-06T12:05:00.000Z",
      approvedAssertionCandidateIds: ["legacy_candidate_001"]
    }
  }
];
```

Create `packages/ingestion/test/legacy-projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import { buildLegacyImportProjection } from "../src/legacy-projection.js";
import { goldenLegacyLedgerEvents } from "./fixtures/golden-legacy-ledger.js";

describe("buildLegacyImportProjection", () => {
  it("rebuilds report, staging approval, and diagnostics", () => {
    for (const event of goldenLegacyLedgerEvents) {
      expect(validateKnowledgeEvent(event).success, event.type).toBe(true);
    }

    const projection = buildLegacyImportProjection(goldenLegacyLedgerEvents);
    expect(projection.reports.get("legacy_report_001")?.candidateSetHash).toBe("sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(projection.latestReportBySource.get("src_old_cestus")).toBe("legacy_report_001");
    expect(projection.stagingApprovals.get("legacy_stage_001")?.approvedAssertionCandidateIds).toEqual(["legacy_candidate_001"]);
    expect(projection.diagnosticsBySourceCollectionId.get("src_old_cestus")).toEqual(["diag_legacy_quarantine"]);
  });
});
```

Create `packages/ingestion/test/legacy-read-api.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildLegacyImportProjection } from "../src/legacy-projection.js";
import { buildLegacyMigrationReviewDto } from "../src/legacy-read-api.js";
import { goldenLegacyLedgerEvents } from "./fixtures/golden-legacy-ledger.js";

describe("legacy read API", () => {
  it("builds stable review DTOs with the first artifact ask", () => {
    const dto = buildLegacyMigrationReviewDto(buildLegacyImportProjection(goldenLegacyLedgerEvents), "src_old_cestus");
    expect(dto).toMatchObject({
      sourceCollectionId: "src_old_cestus",
      latestReportId: "legacy_report_001",
      rawImportRequiresApproval: true,
      ontologyStagingApproved: true,
      firstArtifactAsk: [
        "Read-only folder tree listing of the old Cestus root",
        "Two to five sanitized metadata or ontology files",
        "Any old manifest, index, registry, or graph export file if present"
      ]
    });
  });
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/ingestion/test/legacy-projection.test.ts packages/ingestion/test/legacy-read-api.test.ts
```

Expected: failure resolving `legacy-projection.js` and `legacy-read-api.js`.

- [ ] **Step 4: Implement projection and read API**

Create `packages/ingestion/src/legacy-projection.ts` that validates events with `validateKnowledgeEvent`, records `legacy.import.report.generated`, records `legacy.ontology.staging.approved`, and indexes secret-safe `diagnostic.recorded` events by inferred `sourceCollectionId`.

Create `packages/ingestion/src/legacy-read-api.ts`:

```ts
import { firstLegacyArtifactAsk } from "./legacy-types.js";
import type { LegacyImportProjection } from "./legacy-projection.js";

export interface LegacyMigrationReviewDto {
  sourceCollectionId: string;
  latestReportId?: string;
  rawImportRequiresApproval: boolean;
  ontologyStagingApproved: boolean;
  firstArtifactAsk: readonly string[];
  diagnostics: Array<{
    diagnosticId: string;
    severity: "info" | "warning" | "error";
    category: string;
    message: string;
  }>;
}

export function buildLegacyMigrationReviewDto(
  projection: LegacyImportProjection,
  sourceCollectionId: string
): LegacyMigrationReviewDto {
  const latestReportId = projection.latestReportBySource.get(sourceCollectionId);
  const report = latestReportId === undefined ? undefined : projection.reports.get(latestReportId);
  const stagingApproved = [...projection.stagingApprovals.values()].some(
    (approval) => approval.sourceCollectionId === sourceCollectionId && approval.legacyReportId === latestReportId
  );

  return {
    sourceCollectionId,
    ...(latestReportId === undefined ? {} : { latestReportId }),
    rawImportRequiresApproval: report !== undefined,
    ontologyStagingApproved: stagingApproved,
    firstArtifactAsk,
    diagnostics: (projection.diagnosticsBySourceCollectionId.get(sourceCollectionId) ?? [])
      .map((diagnosticId) => projection.diagnostics.get(diagnosticId))
      .filter((diagnostic) => diagnostic !== undefined)
      .map((diagnostic) => ({
        diagnosticId: diagnostic.diagnosticId,
        severity: diagnostic.severity,
        category: diagnostic.category,
        message: diagnostic.message
      }))
  };
}
```

Modify `packages/ingestion/src/index.ts`:

```ts
export * from "./legacy-projection.js";
export * from "./legacy-read-api.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ingestion/test/legacy-projection.test.ts packages/ingestion/test/legacy-read-api.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/agentic/claims/task-5-legacy-projection.md packages/ingestion/src/legacy-projection.ts packages/ingestion/src/legacy-read-api.ts packages/ingestion/src/index.ts packages/ingestion/test/legacy-projection.test.ts packages/ingestion/test/legacy-read-api.test.ts packages/ingestion/test/fixtures/golden-legacy-ledger.ts
git commit -m "feat: add legacy import projection"
```

## Task 6: Add Evidence-First Raw Import Bridge

**Files:**
- Create: `docs/agentic/claims/task-6-legacy-import-bridge.md`
- Create: `packages/ingestion/src/legacy-import-service.ts`
- Create: `packages/ingestion/test/legacy-import-service.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-6-legacy-import-bridge.md` with this task's owned files.

- [ ] **Step 2: Write failing import bridge tests**

Create `packages/ingestion/test/legacy-import-service.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { LegacyRawImportService } from "../src/legacy-import-service.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "legacy-raw-import-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("LegacyRawImportService", () => {
  it("requires existing raw import approval through ingestion import service", async () => {
    const service = new LegacyRawImportService({
      ledger: new InMemoryEventLedger(),
      blobStore: new FileBlobStore(dir),
      actor: { id: "actor_system", kind: "system", label: "Legacy importer" }
    });

    await expect(service.importReportFiles({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001",
      files: [{
        occurrenceId: "occ_001",
        sourcePath: "ontology/claims.json",
        content: Buffer.from("{\"legacyCestusType\":\"claims\"}"),
        mediaType: "application/json"
      }]
    })).rejects.toThrow(/approval/);
  });

  it("imports metadata files as evidence before ontology staging", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new LegacyRawImportService({
      ledger,
      blobStore: new FileBlobStore(dir),
      actor: { id: "actor_system", kind: "system", label: "Legacy importer" }
    });

    await service.approveRawImport({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001",
      approvedBy: "actor_investigator"
    });
    await service.importReportFiles({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001",
      files: [{
        occurrenceId: "occ_001",
        sourcePath: "ontology/claims.json",
        content: Buffer.from("{\"legacyCestusType\":\"claims\"}"),
        mediaType: "application/json"
      }]
    });

    const eventTypes = (await ledger.readAll()).map((event) => event.type);
    expect(eventTypes).toContain("evidence.ingested");
    expect(eventTypes).toContain("ingestion.evidence.linked");
    expect(eventTypes).not.toContain("assertion.proposed");
    expect(eventTypes).not.toContain("assertion.accepted");
    expect(eventTypes).not.toContain("entity.resolved");
    expect(eventTypes).not.toContain("relationship.accepted");
  });
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/ingestion/test/legacy-import-service.test.ts
```

Expected: failure resolving `../src/legacy-import-service.js`.

- [ ] **Step 4: Implement raw import bridge**

Create `packages/ingestion/src/legacy-import-service.ts` that wraps `IngestionImportService`:

```ts
import type { z } from "zod";
import { actorRefSchema } from "../../ontology/src/contracts.js";
import type { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { IngestionImportService, type ApproveImportInput } from "./import-service.js";

type ActorRef = z.infer<typeof actorRefSchema>;

export interface LegacyRawImportServiceDependencies {
  ledger: EventLedger;
  blobStore: FileBlobStore;
  actor: ActorRef;
}

export interface LegacyReportFileImport {
  occurrenceId: string;
  sourcePath: string;
  content: Buffer;
  mediaType: string;
}

export interface LegacyImportReportFilesInput {
  sourceCollectionId: string;
  scanBatchId: string;
  importBatchId: string;
  files: LegacyReportFileImport[];
}

export class LegacyRawImportService {
  private readonly importService: IngestionImportService;

  constructor(dependencies: LegacyRawImportServiceDependencies) {
    this.importService = new IngestionImportService(dependencies);
  }

  async approveRawImport(input: ApproveImportInput) {
    return this.importService.approveImport(input);
  }

  async importReportFiles(input: LegacyImportReportFilesInput) {
    return this.importService.importApprovedOccurrences({
      sourceCollectionId: input.sourceCollectionId,
      scanBatchId: input.scanBatchId,
      importBatchId: input.importBatchId,
      occurrences: input.files.map((file) => ({
        occurrenceId: file.occurrenceId,
        sourcePath: file.sourcePath,
        content: file.content,
        mediaType: file.mediaType
      }))
    });
  }
}
```

Modify `packages/ingestion/src/index.ts`:

```ts
export * from "./legacy-import-service.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ingestion/test/legacy-import-service.test.ts packages/ingestion/test/import-service.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/agentic/claims/task-6-legacy-import-bridge.md packages/ingestion/src/legacy-import-service.ts packages/ingestion/src/index.ts packages/ingestion/test/legacy-import-service.test.ts
git commit -m "feat: import legacy files as evidence first"
```

## Task 7: Add Ontology Staging And Assertion Proposal

**Files:**
- Create: `docs/agentic/claims/task-7-legacy-staging.md`
- Create: `packages/ingestion/src/legacy-staging.ts`
- Create: `packages/ingestion/test/legacy-staging.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-7-legacy-staging.md` with this task's owned files.

- [ ] **Step 2: Write failing staging tests**

Create `packages/ingestion/test/legacy-staging.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { EvidenceService } from "../../ontology/src/evidence-service.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { LegacyOntologyStagingService } from "../src/legacy-staging.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "legacy-staging-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("LegacyOntologyStagingService", () => {
  it("requires human staging approval before assertion proposals", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new LegacyOntologyStagingService({
      ledger,
      actor: { id: "actor_system", kind: "system", label: "Legacy stager" }
    });

    await expect(service.stageApprovedAssertions({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      stagingBatchId: "legacy_stage_001",
      legacyReportId: "legacy_report_001",
      reportHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      candidateSetHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      candidates: [{
        candidateId: "legacy_candidate_001",
        evidenceId: "ev_legacy_metadata",
        predicate: "agency.name",
        object: "Example Agency",
        confidence: 0.8
      }]
    })).rejects.toThrow(/approval/);
  });

  it("creates only evidence-tied assertion.proposed events after approval", async () => {
    const ledger = new InMemoryEventLedger();
    const blobStore = new FileBlobStore(dir);
    await new EvidenceService({ ledger, blobStore }).ingest({
      evidenceId: "ev_legacy_metadata",
      content: Buffer.from("{\"legacyCestusType\":\"claims\"}"),
      mediaType: "application/json",
      source: { kind: "file", label: "ontology/claims.json" },
      actor: { id: "actor_system", kind: "system", label: "fixture" }
    });

    const service = new LegacyOntologyStagingService({
      ledger,
      actor: { id: "actor_investigator", kind: "human", label: "Investigator" }
    });

    await service.approveStaging({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      stagingBatchId: "legacy_stage_001",
      legacyReportId: "legacy_report_001",
      reportHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      candidateSetHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: ["legacy_candidate_001"]
    });

    await service.stageApprovedAssertions({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      stagingBatchId: "legacy_stage_001",
      legacyReportId: "legacy_report_001",
      reportHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      candidateSetHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      candidates: [{
        candidateId: "legacy_candidate_001",
        evidenceId: "ev_legacy_metadata",
        predicate: "agency.name",
        object: "Example Agency",
        confidence: 0.8
      }]
    });

    const eventTypes = (await ledger.readAll()).map((event) => event.type);
    expect(eventTypes).toContain("legacy.ontology.staging.approved");
    expect(eventTypes).toContain("assertion.proposed");
    expect(eventTypes).not.toContain("assertion.accepted");
    expect(eventTypes).not.toContain("entity.resolved");
    expect(eventTypes).not.toContain("relationship.accepted");
  });
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/ingestion/test/legacy-staging.test.ts
```

Expected: failure resolving `../src/legacy-staging.js`.

- [ ] **Step 4: Implement staging service**

Create `packages/ingestion/src/legacy-staging.ts`:

```ts
import { createHash } from "node:crypto";
import type { z } from "zod";
import { AssertionService } from "../../ontology/src/assertion-service.js";
import { actorRefSchema, type AppendableKnowledgeEvent, type KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";

type ActorRef = z.infer<typeof actorRefSchema>;

export interface LegacyOntologyStagingServiceDependencies {
  ledger: EventLedger;
  actor: ActorRef;
}

export interface ApproveLegacyStagingInput {
  sourceCollectionId: string;
  scanBatchId: string;
  stagingBatchId: string;
  legacyReportId: string;
  reportHash: `sha256:${string}`;
  candidateSetHash: `sha256:${string}`;
  approvedBy: string;
  approvedAssertionCandidateIds: string[];
}

export interface LegacyApprovedAssertionCandidate {
  candidateId: string;
  evidenceId: string;
  predicate: string;
  object: string | number | boolean | null;
  confidence: number;
  subjectRef?: string;
}

export interface StageApprovedLegacyAssertionsInput extends Omit<ApproveLegacyStagingInput, "approvedBy" | "approvedAssertionCandidateIds"> {
  candidates: LegacyApprovedAssertionCandidate[];
}

export class LegacyOntologyStagingService {
  private readonly assertions: AssertionService;

  constructor(private readonly dependencies: LegacyOntologyStagingServiceDependencies) {
    this.assertions = new AssertionService({ ledger: dependencies.ledger });
  }

  async approveStaging(input: ApproveLegacyStagingInput): Promise<KnowledgeEventOf<"legacy.ontology.staging.approved">> {
    const event: AppendableKnowledgeEvent<"legacy.ontology.staging.approved"> = {
      type: "legacy.ontology.staging.approved",
      version: 1,
      streamId: stagingStreamId(input),
      context: {
        actor: this.dependencies.actor,
        occurredAt: new Date().toISOString(),
        correlationId: `corr_${input.stagingBatchId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0", legacy: "0.1.0" }
      },
      payload: {
        stagingBatchId: input.stagingBatchId,
        legacyReportId: input.legacyReportId,
        sourceCollectionId: input.sourceCollectionId,
        scanBatchId: input.scanBatchId,
        reportHash: input.reportHash,
        candidateSetHash: input.candidateSetHash,
        approvedBy: input.approvedBy,
        approvedAt: new Date().toISOString(),
        approvedAssertionCandidateIds: input.approvedAssertionCandidateIds
      }
    };
    const appended = await this.dependencies.ledger.append(event, { expectedNextSequence: 1 });
    if (appended.type !== "legacy.ontology.staging.approved") {
      throw new Error(`Unexpected event type appended for legacy staging approval: ${appended.type}`);
    }
    return appended;
  }

  async stageApprovedAssertions(input: StageApprovedLegacyAssertionsInput): Promise<Array<KnowledgeEventOf<"assertion.proposed">>> {
    const approval = await this.findApproval(input);
    if (approval === undefined) {
      throw new Error(`Legacy ontology staging approval is required before ${input.stagingBatchId}`);
    }
    const approvedIds = new Set(approval.payload.approvedAssertionCandidateIds);
    const proposed: Array<KnowledgeEventOf<"assertion.proposed">> = [];

    for (const candidate of input.candidates) {
      if (!approvedIds.has(candidate.candidateId)) {
        continue;
      }
      const assertionId = `as_legacy_${createHash("sha256").update(`${input.stagingBatchId}:${candidate.candidateId}`).digest("hex")}`;
      proposed.push(await this.assertions.propose({
        assertionId,
        evidenceId: candidate.evidenceId,
        ...(candidate.subjectRef === undefined ? {} : { subjectRef: candidate.subjectRef }),
        predicate: candidate.predicate,
        object: candidate.object,
        confidence: candidate.confidence,
        actor: this.dependencies.actor
      }));
    }

    return proposed;
  }

  private async findApproval(input: Pick<ApproveLegacyStagingInput, "sourceCollectionId" | "scanBatchId" | "stagingBatchId" | "legacyReportId" | "reportHash" | "candidateSetHash">) {
    const events = await this.dependencies.ledger.readStream(stagingStreamId(input));
    return events.find(
      (event): event is KnowledgeEventOf<"legacy.ontology.staging.approved"> =>
        event.type === "legacy.ontology.staging.approved" &&
        event.payload.legacyReportId === input.legacyReportId &&
        event.payload.reportHash === input.reportHash &&
        event.payload.candidateSetHash === input.candidateSetHash
    );
  }
}

function stagingStreamId(input: Pick<ApproveLegacyStagingInput, "sourceCollectionId" | "scanBatchId" | "stagingBatchId">): string {
  return `legacy_staging_${input.sourceCollectionId}_${input.scanBatchId}_${input.stagingBatchId}`;
}
```

Modify `packages/ingestion/src/index.ts`:

```ts
export * from "./legacy-staging.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ingestion/test/legacy-staging.test.ts packages/ontology/test/assertion-service.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/agentic/claims/task-7-legacy-staging.md packages/ingestion/src/legacy-staging.ts packages/ingestion/src/index.ts packages/ingestion/test/legacy-staging.test.ts
git commit -m "feat: stage legacy assertions with approval"
```

## Task 8: Add Legacy CLI DTO Handlers

**Files:**
- Create: `docs/agentic/claims/task-8-legacy-cli.md`
- Modify: `packages/ingestion/src/cli.ts`
- Create: `packages/ingestion/test/legacy-cli.test.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-8-legacy-cli.md` with this task's owned files.

- [ ] **Step 2: Write failing CLI tests**

Create `packages/ingestion/test/legacy-cli.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { handleIngestionCommand } from "../src/cli.js";

describe("legacy ingestion CLI handlers", () => {
  it("prints the first artifact ask as stable JSON", async () => {
    const output = await handleIngestionCommand({ command: "legacy-artifact-ask-json" });
    expect(JSON.parse(output)).toEqual({
      firstArtifactAsk: [
        "Read-only folder tree listing of the old Cestus root",
        "Two to five sanitized metadata or ontology files",
        "Any old manifest, index, registry, or graph export file if present"
      ]
    });
  });

  it("prints legacy migration report DTOs as stable JSON", async () => {
    const output = await handleIngestionCommand({
      command: "legacy-report-json",
      dto: {
        sourceCollectionId: "src_old_cestus",
        latestReportId: "legacy_report_001",
        rawImportRequiresApproval: true,
        ontologyStagingApproved: false,
        firstArtifactAsk: [
          "Read-only folder tree listing of the old Cestus root",
          "Two to five sanitized metadata or ontology files",
          "Any old manifest, index, registry, or graph export file if present"
        ],
        diagnostics: []
      }
    });

    expect(JSON.parse(output)).toMatchObject({
      sourceCollectionId: "src_old_cestus",
      latestReportId: "legacy_report_001",
      rawImportRequiresApproval: true,
      ontologyStagingApproved: false
    });
  });
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/ingestion/test/legacy-cli.test.ts
```

Expected: handler rejects unknown legacy commands.

- [ ] **Step 4: Add pure CLI handlers**

Modify `packages/ingestion/src/cli.ts` to accept:

```ts
| { command: "legacy-artifact-ask-json" }
| { command: "legacy-report-json"; dto: LegacyMigrationReviewDto }
```

Import `firstLegacyArtifactAsk` and `type LegacyMigrationReviewDto`, then add command branches:

```ts
if (input.command === "legacy-artifact-ask-json") {
  return `${JSON.stringify({ firstArtifactAsk: firstLegacyArtifactAsk }, null, 2)}\n`;
}

if (input.command === "legacy-report-json") {
  return `${JSON.stringify(input.dto, null, 2)}\n`;
}
```

Do not wire filesystem access, runtime services, or interactive prompts in this task.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ingestion/test/legacy-cli.test.ts packages/ingestion/test/cli.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/agentic/claims/task-8-legacy-cli.md packages/ingestion/src/cli.ts packages/ingestion/test/legacy-cli.test.ts
git commit -m "feat: add legacy import cli contracts"
```

## Task 9: Add Factory Readiness Evidence

**Files:**
- Create: `docs/agentic/claims/task-9-legacy-import-readiness.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-9-legacy-import-readiness.md` with this task's owned files.

- [ ] **Step 2: Require the legacy spec and plan in factory check**

Modify `scripts/check-agent-readiness.mjs` so `requiredFiles` includes:

```js
"docs/superpowers/specs/2026-07-06-legacy-cestus-import-design.md",
"docs/superpowers/plans/2026-07-06-legacy-cestus-import-implementation.md"
```

- [ ] **Step 3: Record readiness evidence**

Append this section to `docs/agentic/software-factory.md`:

```md
## Legacy Cestus Import Plan Readiness

The legacy old-Cestus import plan was prepared from the approved design spec on 2026-07-06.

Required design and plan files:

- `docs/superpowers/specs/2026-07-06-legacy-cestus-import-design.md`
- `docs/superpowers/plans/2026-07-06-legacy-cestus-import-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded targeted command evidence from the implementation slice:

```text
npm test -- packages/ontology/test/contracts.test.ts packages/ingestion/test/legacy-plugins.test.ts packages/ingestion/test/legacy-inspector.test.ts packages/ingestion/test/legacy-report.test.ts packages/ingestion/test/legacy-projection.test.ts packages/ingestion/test/legacy-read-api.test.ts packages/ingestion/test/legacy-import-service.test.ts packages/ingestion/test/legacy-staging.test.ts packages/ingestion/test/legacy-cli.test.ts
```

Final verification evidence:

```text
npm run verify
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

Legacy import remains recon-first. Every legacy file is evidence first, ontology staging can only append evidence-tied `assertion.proposed`, and accepted assertion, entity, relationship, or resolution events are forbidden during import.
```

- [ ] **Step 4: Run readiness checks**

Run:

```bash
git diff --check
npm run factory:check
```

Expected: both commands pass.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 6: Commit**

Run:

```bash
git add docs/agentic/claims/task-9-legacy-import-readiness.md scripts/check-agent-readiness.mjs docs/agentic/software-factory.md
git commit -m "docs: record legacy import readiness"
```

## Completion Criteria

The legacy import implementation is complete when:

- The user-facing first artifact ask is available through code and CLI DTOs.
- Legacy event contracts validate report generation and human ontology staging approval.
- Detector/parser plugin contracts are deterministic and versioned.
- Inspection is read-only and produces a deterministic migration report input.
- Migration reports are content-addressed and ledger-referenced.
- Raw legacy files are imported as evidence before ontology staging.
- Legacy ontology claims become only `assertion.proposed` and only after human staging approval.
- Missing evidence prevents assertion proposal.
- Accepted assertion, entity, relationship, and resolution events are not emitted by legacy import.
- Candidate entity resolution and relationship material remain report state.
- CLI handlers return stable JSON for artifact ask and report review.
- `npm run verify` passes.
- Factory readiness records the completed legacy import slice.

## Plan Stop Conditions

Stop and escalate before or during execution if:

- A task would mutate the old-Cestus source tree.
- A task needs an unapproved portable mount integration.
- A task needs live credentials or external services.
- A user-specific legacy mapping plugin is requested before the folder tree listing and sanitized samples are available.
- A schema change would weaken append-only ledger semantics, provenance, projection rebuildability, or human review gates.
- Any code path emits `assertion.accepted`, `entity.resolved`, `relationship.accepted`, or resolution events from import.
- Diagnostics would expose secrets, credentials, raw sensitive content, or large document bodies.
- Verification fails after two focused repair attempts.
