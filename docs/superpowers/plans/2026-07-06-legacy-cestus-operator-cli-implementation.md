# Legacy Cestus Operator CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an operator-ready `cestus ingest legacy ...` command-line workflow for inspecting, reporting, approving, importing, reviewing, approving staging, and staging old-Cestus legacy claims as `assertion.proposed` only.

**Architecture:** Add a `LegacyImportRuntime` in `packages/ingestion` that composes the existing legacy inspector/report/staging services and the shared ingestion runtime. Add a portable workspace CLI mount resolver that adapts the existing portable workspace package to ingestion's `MountedWorkspace` contract. Extend the CLI parser and executable so real command-line use emits stable JSON and never falls back to hidden storage.

**Tech Stack:** TypeScript, Node.js 26, npm, Vitest, Zod, SQLiteEventLedger, FileBlobStore, existing portable workspace, ontology, and ingestion packages.

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
8. `docs/superpowers/specs/2026-07-06-ingestion-runtime-wiring-design.md`
9. `docs/superpowers/plans/2026-07-06-ingestion-runtime-wiring-implementation.md`
10. `docs/superpowers/specs/2026-07-06-legacy-cestus-operator-cli-design.md`
11. This plan
12. Existing `docs/agentic/claims/*.md` files for ingestion and legacy task areas before claiming a task

## Factory Rules

Each task is a separate work order:

1. Use the task branch `codex/legacy-cestus-operator-cli` or an isolated worktree derived from it.
2. Create and commit the task claim before editing task files.
3. Mark the claim `in-progress` before writing tests.
4. Read every file named by the task.
5. Write the failing test first.
6. Run the exact targeted failing command and record the expected failure.
7. Implement the smallest scoped change.
8. Run the targeted passing command.
9. Run `npm run verify`.
10. Commit only the files listed by the task plus the task claim.
11. Hand off to spec review and code-quality review before dependent tasks.

Stop on source-tree mutation risk, data-loss risk, schema conflict, unavailable portable workspace mount dependency, credential need, live external service dependency, secret-unsafe diagnostics, user-specific parser need without representative samples, or repeated verifier failure after two focused repair attempts.

## File Structure

- `packages/ingestion/src/legacy-runtime-types.ts`: stable legacy operator runtime result envelopes, command names, error codes, DTOs, and next-action strings.
- `packages/ingestion/src/portable-mount.ts`: CLI mount resolver that uses `mountPortableWorkspace`, `SQLiteEventLedger`, and `FileBlobStore` to create an ingestion `MountedWorkspace`.
- `packages/ingestion/src/legacy-claim-parser.ts`: conservative parser for explicit `legacyCestusType: "claims"` JSON metadata and quarantine entries.
- `packages/ingestion/src/legacy-runtime.ts`: operator workflow orchestration over inspector, report service, ingestion runtime, projections, and staging service.
- `packages/ingestion/src/cli.ts`: nested `legacy` command parsing, argument mapping, runtime delegation, and stable JSON formatting.
- `packages/ingestion/bin/cestus-ingest.mjs`: executable dependency wiring for real operator commands and help output.
- `packages/ingestion/src/index.ts`: exports new legacy operator modules.
- `packages/ingestion/test/legacy-runtime-types.test.ts`: stable DTO and error contract tests.
- `packages/ingestion/test/portable-mount.test.ts`: mount resolver tests.
- `packages/ingestion/test/legacy-claim-parser.test.ts`: conservative parser tests.
- `packages/ingestion/test/legacy-runtime.test.ts`: end-to-end workflow semantics with fake mounted workspace.
- `packages/ingestion/test/legacy-cli-workflow.test.ts`: CLI parser, dependency delegation, executable help, and JSON envelopes.
- `scripts/check-agent-readiness.mjs`: require this approved spec and plan after implementation.
- `docs/agentic/software-factory.md`: record readiness evidence after all tasks pass.

## Task 1: Add Legacy Operator Runtime Contracts

**Files:**
- Create: `docs/agentic/claims/task-1-legacy-operator-runtime-contracts.md`
- Create: `packages/ingestion/src/legacy-runtime-types.ts`
- Create: `packages/ingestion/test/legacy-runtime-types.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-legacy-operator-runtime-contracts.md`:

```md
# Task 1: Legacy Operator Runtime Contracts

Plan: `docs/superpowers/plans/2026-07-06-legacy-cestus-operator-cli-implementation.md`
Task: Task 1: Add Legacy Operator Runtime Contracts
Branch: `codex/legacy-cestus-operator-cli`
Status: claimed
Claimed-at: use `date -u +%Y-%m-%dT%H:%M:%SZ`
Worker: current Codex worker

## Owned Files

- `packages/ingestion/src/legacy-runtime-types.ts`
- `packages/ingestion/test/legacy-runtime-types.test.ts`
- `packages/ingestion/src/index.ts`
```

Commit the claim:

```bash
git add docs/agentic/claims/task-1-legacy-operator-runtime-contracts.md
git commit -m "chore: claim legacy operator runtime contracts"
```

- [ ] **Step 2: Mark the claim in progress**

Change `Status: claimed` to `Status: in-progress`.

- [ ] **Step 3: Write failing contract tests**

Create `packages/ingestion/test/legacy-runtime-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  legacyImportErrorCodes,
  legacyImportNextActions,
  stableLegacyImportError,
  stableLegacyImportSuccess,
  type LegacyImportRuntimeResult
} from "../src/legacy-runtime-types.js";

describe("legacy operator runtime contracts", () => {
  it("exports stable error codes for operator CLI automation", () => {
    expect(legacyImportErrorCodes).toEqual([
      "LEGACY_IMPORT_INVALID_ARGUMENTS",
      "LEGACY_IMPORT_WORKSPACE_NOT_MOUNTED",
      "LEGACY_IMPORT_WORKSPACE_NOT_WRITABLE",
      "LEGACY_IMPORT_SOURCE_REQUIRED",
      "LEGACY_IMPORT_SOURCE_NOT_REGISTERED",
      "LEGACY_IMPORT_REPORT_REQUIRED",
      "LEGACY_IMPORT_REPORT_NOT_FOUND",
      "LEGACY_IMPORT_RAW_IMPORT_APPROVAL_REQUIRED",
      "LEGACY_IMPORT_STAGING_APPROVAL_REQUIRED",
      "LEGACY_IMPORT_EVIDENCE_LINK_REQUIRED",
      "LEGACY_IMPORT_CANDIDATE_SET_MISMATCH",
      "LEGACY_IMPORT_ACCEPTED_EVENT_FORBIDDEN",
      "LEGACY_IMPORT_COMMAND_UNSUPPORTED",
      "LEGACY_IMPORT_RUNTIME_INTERNAL"
    ]);
  });

  it("creates stable secret-safe error envelopes", () => {
    const result = stableLegacyImportError({
      code: "LEGACY_IMPORT_REPORT_REQUIRED",
      command: "legacy staging-preview",
      message: "A migration report is required before ontology staging preview.",
      allowedRepairActions: ["run legacy inspect", "review legacy report"]
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "LEGACY_IMPORT_REPORT_REQUIRED",
        command: "legacy staging-preview",
        message: "A migration report is required before ontology staging preview.",
        allowedRepairActions: ["run legacy inspect", "review legacy report"],
        diagnostics: []
      }
    });
    expect(JSON.stringify(result)).not.toMatch(/token|secret|password/i);
  });

  it("creates stable success envelopes with next actions", () => {
    const result: LegacyImportRuntimeResult<{ legacyReportId: string }> = stableLegacyImportSuccess({
      command: "legacy inspect",
      workspace: { workspaceId: "ws_cli", label: "CLI Workspace" },
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      eventIds: ["evt_report"],
      nextActions: [legacyImportNextActions.reviewReport, legacyImportNextActions.approveRawImport],
      data: { legacyReportId: "legacy_report_001" }
    });

    expect(result).toEqual({
      ok: true,
      command: "legacy inspect",
      workspace: { workspaceId: "ws_cli", label: "CLI Workspace" },
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: "legacy_report_001",
      eventIds: ["evt_report"],
      nextActions: ["review legacy report", "approve raw import"]
    });
  });
});
```

- [ ] **Step 4: Run the targeted failing test**

Run:

```bash
npm test -- packages/ingestion/test/legacy-runtime-types.test.ts
```

Expected: failure resolving `../src/legacy-runtime-types.js`.

- [ ] **Step 5: Add runtime contract module**

Create `packages/ingestion/src/legacy-runtime-types.ts` with exported error codes, `LegacyImportRuntimeResult<T>`, `LegacyImportDiagnosticDto`, `LegacyImportWorkspaceDto`, `stableLegacyImportError()`, `stableLegacyImportSuccess()`, and `legacyImportNextActions`. Keep diagnostics single-line and secret-safe by reusing `legacySecretSafeDiagnosticTextSchema` from `legacy-types.ts`.

Key exported shapes:

```ts
export type LegacyImportCommandName =
  | "legacy artifact-ask"
  | "legacy inspect"
  | "legacy report"
  | "legacy quarantine"
  | "legacy approve-import"
  | "legacy import"
  | "legacy staging-preview"
  | "legacy approve-staging"
  | "legacy stage";

export const legacyImportNextActions = {
  reviewReport: "review legacy report",
  approveRawImport: "approve raw import",
  runRawImport: "run raw import",
  previewStaging: "preview ontology staging",
  approveStaging: "approve ontology staging",
  stageApprovedAssertions: "stage approved assertion proposals",
  inspectQuarantine: "inspect quarantine entries"
} as const;
```

Modify `packages/ingestion/src/index.ts`:

```ts
export * from "./legacy-runtime-types.js";
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/ingestion/test/legacy-runtime-types.test.ts
```

Expected: contract tests pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit**

```bash
git add docs/agentic/claims/task-1-legacy-operator-runtime-contracts.md packages/ingestion/src/legacy-runtime-types.ts packages/ingestion/src/index.ts packages/ingestion/test/legacy-runtime-types.test.ts
git commit -m "feat: add legacy operator runtime contracts"
```

## Task 2: Add Portable Workspace CLI Mount Resolver

**Files:**
- Create: `docs/agentic/claims/task-2-legacy-portable-mount-resolver.md`
- Create: `packages/ingestion/src/portable-mount.ts`
- Create: `packages/ingestion/test/portable-mount.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-legacy-portable-mount-resolver.md` with this task's owned files and status `claimed`. Then change status to `in-progress`.

- [ ] **Step 2: Write failing mount tests**

Create `packages/ingestion/test/portable-mount.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { createPortableIngestionMountResolver } from "../src/portable-mount.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("portable ingestion mount resolver", () => {
  it("mounts a portable workspace as an ingestion MountedWorkspace", async () => {
    const rootDir = tempDir("portable-ingestion-");
    createPortableWorkspace({
      rootDir,
      workspaceId: "ws_legacy_cli",
      label: "Legacy CLI workspace",
      createdBy: "test"
    });

    const resolver = createPortableIngestionMountResolver();
    const result = await resolver.resolve({ workspaceRoot: rootDir });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace).toMatchObject({
      workspaceId: "ws_legacy_cli",
      label: "Legacy CLI workspace",
      jobStateRoot: join(rootDir, "jobs"),
      capabilities: {
        canReadLedger: true,
        canAppendLedger: true,
        canWriteBlobs: true,
        canWriteDerivatives: true,
        canWriteJobState: true
      }
    });
    expect(JSON.stringify(result.workspace)).not.toMatch(/token|secret|password/i);
    await result.workspace.ledger.readAll();
    (result.workspace as typeof result.workspace & { close?: () => void }).close?.();
  });

  it("returns stable mount errors without constructing storage", async () => {
    const resolver = createPortableIngestionMountResolver();
    const result = await resolver.resolve({ workspaceRoot: "" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INGESTION_WORKSPACE_NOT_MOUNTED",
        message: "Portable workspace root is required.",
        allowedRepairActions: ["set CESTUS_WORKSPACE_ROOT", "pass --workspace <root>"]
      }
    });
  });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
```

- [ ] **Step 3: Run the targeted failing test**

```bash
npm test -- packages/ingestion/test/portable-mount.test.ts
```

Expected: failure resolving `../src/portable-mount.js`.

- [ ] **Step 4: Implement mount resolver**

Create `packages/ingestion/src/portable-mount.ts`:

```ts
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { mountPortableWorkspace } from "../../workspace/src/index.js";
import {
  mountedWorkspaceCapabilities,
  type IngestionWorkspaceMountResolver,
  type MountedWorkspace
} from "./mount-contract.js";

export interface ClosableMountedWorkspace {
  close?(): void;
}

export function createPortableIngestionMountResolver(): IngestionWorkspaceMountResolver {
  return {
    async resolve(request) {
      const workspaceRoot = request.workspaceRoot ?? request.env?.CESTUS_WORKSPACE_ROOT ?? "";
      const mounted = mountPortableWorkspace({ rootDir: workspaceRoot });
      if (!mounted.ok) {
        return {
          ok: false,
          error: {
            code: mounted.diagnostic.code === "workspace-ledger-unavailable"
              ? "INGESTION_WORKSPACE_NOT_WRITABLE"
              : "INGESTION_WORKSPACE_NOT_MOUNTED",
            message: mounted.diagnostic.message,
            allowedRepairActions: [...mounted.diagnostic.allowedRepairActions]
          }
        };
      }

      const ledger = new SQLiteEventLedger(mounted.workspace.paths.ledgerPath);
      const workspace: MountedWorkspace & { close(): void } = {
        workspaceId: mounted.workspace.workspaceId,
        label: mounted.workspace.label,
        ledger,
        blobStore: new FileBlobStore(mounted.workspace.paths.blobRoot),
        derivativeStore: new FileBlobStore(mounted.workspace.paths.derivativeRoot),
        jobStateRoot: mounted.workspace.paths.jobRoot,
        diagnosticsRoot: mounted.workspace.paths.cacheRoot,
        projectionCacheRoot: mounted.workspace.paths.projectionRoot,
        capabilities: mountedWorkspaceCapabilities({
          canReadLedger: true,
          canAppendLedger: true,
          canWriteBlobs: true,
          canWriteDerivatives: true,
          canWriteJobState: true
        }),
        close() {
          ledger.close();
        }
      };

      return {
        ok: true,
        workspace
      };
    }
  };
}
```

Modify `packages/ingestion/src/index.ts`:

```ts
export * from "./portable-mount.js";
```

- [ ] **Step 5: Run targeted tests**

```bash
npm test -- packages/ingestion/test/portable-mount.test.ts packages/workspace/test/workspace.test.ts packages/ontology/test/sqlite-event-ledger.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification**

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 7: Commit**

```bash
git add docs/agentic/claims/task-2-legacy-portable-mount-resolver.md packages/ingestion/src/portable-mount.ts packages/ingestion/src/index.ts packages/ingestion/test/portable-mount.test.ts
git commit -m "feat: add portable ingestion mount resolver"
```

## Task 3: Add Conservative Legacy Claim Parser

**Files:**
- Create: `docs/agentic/claims/task-3-legacy-claim-parser.md`
- Create: `packages/ingestion/src/legacy-claim-parser.ts`
- Create: `packages/ingestion/test/legacy-claim-parser.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-legacy-claim-parser.md` with this task's owned files and status `claimed`. Then change status to `in-progress`.

- [ ] **Step 2: Write failing parser tests**

Create `packages/ingestion/test/legacy-claim-parser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseLegacyClaimMetadata } from "../src/legacy-claim-parser.js";

const contentHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const;

describe("legacy claim parser", () => {
  it("creates proposed assertion candidates only for explicit legacy claims metadata", () => {
    const result = parseLegacyClaimMetadata({
      sourcePath: "ontology/claims.json",
      contentHash,
      text: JSON.stringify({
        legacyCestusType: "claims",
        claims: [{
          id: "legacy_claim_1",
          subjectRef: "legacy:agency:example",
          predicate: "agency.name",
          object: "Example Agency",
          confidence: 0.8
        }]
      })
    });

    expect(result.candidates).toEqual([{
      candidateId: expect.stringMatching(/^legacy_candidate_/),
      observationId: expect.stringMatching(/^legacy_observation_/),
      evidenceContentHash: contentHash,
      sourcePath: "ontology/claims.json",
      subjectRef: "legacy:agency:example",
      predicate: "agency.name",
      object: "Example Agency",
      confidence: 0.8
    }]);
    expect(result.quarantineEntries).toEqual([]);
  });

  it("keeps generic JSON out of ontology staging", () => {
    const result = parseLegacyClaimMetadata({
      sourcePath: "notes/random.json",
      contentHash,
      text: JSON.stringify({ agency: "Example Agency" })
    });

    expect(result.candidates).toEqual([]);
    expect(result.quarantineEntries).toEqual([]);
  });

  it("quarantines malformed and incomplete explicit claim records", () => {
    const malformed = parseLegacyClaimMetadata({
      sourcePath: "ontology/corrupt.json",
      contentHash,
      text: "{\"legacyCestusType\":"
    });
    const incomplete = parseLegacyClaimMetadata({
      sourcePath: "ontology/claims.json",
      contentHash,
      text: JSON.stringify({ legacyCestusType: "claims", claims: [{ id: "legacy_claim_missing" }] })
    });

    expect(malformed.quarantineEntries[0]).toMatchObject({
      issueCategory: "malformed",
      sourcePath: "ontology/corrupt.json"
    });
    expect(incomplete.quarantineEntries[0]).toMatchObject({
      issueCategory: "unsupported",
      legacyIds: ["legacy_claim_missing"]
    });
    expect(JSON.stringify([...malformed.quarantineEntries, ...incomplete.quarantineEntries]))
      .not.toMatch(/token|secret|password/i);
  });
});
```

- [ ] **Step 3: Run the targeted failing test**

```bash
npm test -- packages/ingestion/test/legacy-claim-parser.test.ts
```

Expected: failure resolving `../src/legacy-claim-parser.js`.

- [ ] **Step 4: Implement parser**

Create `packages/ingestion/src/legacy-claim-parser.ts` with:

```ts
export interface ParseLegacyClaimMetadataInput {
  readonly sourcePath: string;
  readonly contentHash: `sha256:${string}`;
  readonly text: string;
}

export interface ParseLegacyClaimMetadataResult {
  readonly candidates: LegacyProposedAssertionCandidate[];
  readonly quarantineEntries: LegacyQuarantineEntry[];
}
```

Behavior:

- Return no candidates and no quarantine for JSON without `legacyCestusType: "claims"`.
- Parse only an object with `legacyCestusType: "claims"` and `claims` array.
- Accept claim records with string `id`, string `predicate`, primitive JSON `object`, optional string `subjectRef`, and optional confidence in `[0, 1]`.
- Build deterministic IDs from `sourcePath`, `contentHash`, and legacy claim ID using SHA-256.
- Quarantine malformed JSON as `issueCategory: "malformed"`.
- Quarantine incomplete explicit claim records as `issueCategory: "unsupported"`.
- Use `assertLegacyConfidence()` and `assertLegacySecretSafeDiagnosticText()`.

Modify `packages/ingestion/src/index.ts`:

```ts
export * from "./legacy-claim-parser.js";
```

- [ ] **Step 5: Run targeted tests**

```bash
npm test -- packages/ingestion/test/legacy-claim-parser.test.ts packages/ingestion/test/legacy-report.test.ts packages/ingestion/test/legacy-plugins.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification**

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 7: Commit**

```bash
git add docs/agentic/claims/task-3-legacy-claim-parser.md packages/ingestion/src/legacy-claim-parser.ts packages/ingestion/src/index.ts packages/ingestion/test/legacy-claim-parser.test.ts
git commit -m "feat: parse explicit legacy claim metadata"
```

## Task 4: Add Legacy Inspect, Report, Quarantine, And Preview Runtime

**Files:**
- Create: `docs/agentic/claims/task-4-legacy-operator-runtime-review.md`
- Create: `packages/ingestion/src/legacy-runtime.ts`
- Create: `packages/ingestion/test/legacy-runtime.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-4-legacy-operator-runtime-review.md` with this task's owned files and status `claimed`. Then change status to `in-progress`.

- [ ] **Step 2: Write failing runtime review tests**

Create `packages/ingestion/test/legacy-runtime.test.ts` with an initial describe block:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLegacyImportRuntime } from "../src/legacy-runtime.js";
import { createFakeMountedWorkspace } from "./runtime-test-helpers.js";
import { writeLegacyCestusFixture } from "./fixtures/legacy-cestus-fixtures.js";

let sourceRoot: string;

beforeEach(() => {
  sourceRoot = mkdtempSync(join(tmpdir(), "legacy-runtime-source-"));
  writeLegacyCestusFixture(sourceRoot);
});

afterEach(() => {
  rmSync(sourceRoot, { recursive: true, force: true });
});

const actor = { id: "actor_legacy_cli", kind: "human" as const, label: "Legacy CLI" };

describe("LegacyImportRuntime review workflow", () => {
  it("inspects, stores a report, and creates no evidence or accepted graph state", async () => {
    const workspace = createFakeMountedWorkspace("Legacy CLI workspace");
    const runtime = createLegacyImportRuntime({ mountedWorkspace: workspace, actor });

    const result = await runtime.inspect({
      sourceCollectionId: "src_old_cestus",
      label: "Old Cestus",
      sourceRoot,
      scanBatchId: "scan_old_cestus_001"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command).toBe("legacy inspect");
    expect(result.sourceCollectionId).toBe("src_old_cestus");
    expect(result.totals.inspectedFiles).toBe(4);
    expect(result.totals.proposedAssertionCandidates).toBe(1);
    expect(result.nextActions).toContain("review legacy report");

    const events = await workspace.ledger.readAll();
    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toContain("ingestion.source.registered");
    expect(eventTypes).toContain("legacy.import.report.generated");
    expect(eventTypes).not.toContain("evidence.ingested");
    expect(eventTypes).not.toContain("assertion.proposed");
    expect(eventTypes).not.toContain("assertion.accepted");
    expect(eventTypes).not.toContain("entity.resolved");
    expect(eventTypes).not.toContain("relationship.accepted");
  });

  it("prints report and quarantine review DTOs from stored report artifacts", async () => {
    const workspace = createFakeMountedWorkspace("Legacy CLI workspace");
    const runtime = createLegacyImportRuntime({ mountedWorkspace: workspace, actor });
    const inspected = await runtime.inspect({
      sourceCollectionId: "src_old_cestus",
      label: "Old Cestus",
      sourceRoot,
      scanBatchId: "scan_old_cestus_001"
    });
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;

    const report = await runtime.report({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: inspected.legacyReportId
    });
    const quarantine = await runtime.quarantine({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: inspected.legacyReportId
    });

    expect(report.ok).toBe(true);
    expect(quarantine.ok).toBe(true);
    if (!report.ok || !quarantine.ok) return;
    expect(report.legacyReportId).toBe(inspected.legacyReportId);
    expect(quarantine.quarantineEntries.map((entry) => entry.sourcePath)).toContain("ontology/corrupt.json");
  });
});
```

- [ ] **Step 3: Run the targeted failing test**

```bash
npm test -- packages/ingestion/test/legacy-runtime.test.ts
```

Expected: failure resolving `../src/legacy-runtime.js`.

- [ ] **Step 4: Implement review runtime**

Create `packages/ingestion/src/legacy-runtime.ts` with `createLegacyImportRuntime({ mountedWorkspace, actor })`.

Review methods:

```ts
inspect(input: {
  sourceCollectionId: string;
  label: string;
  sourceRoot: string;
  scanBatchId: string;
}): Promise<LegacyImportRuntimeResult<LegacyInspectData>>;

report(input: {
  sourceCollectionId: string;
  legacyReportId?: string;
}): Promise<LegacyImportRuntimeResult<LegacyReportData>>;

quarantine(input: {
  sourceCollectionId: string;
  legacyReportId?: string;
}): Promise<LegacyImportRuntimeResult<LegacyQuarantineData>>;

stagingPreview(input: {
  sourceCollectionId: string;
  legacyReportId?: string;
}): Promise<LegacyImportRuntimeResult<LegacyStagingPreviewData>>;
```

Implementation details:

- Require mounted workspace with read capability for report, quarantine, and preview.
- Require mounted workspace with append and derivative-write capability for inspect.
- Register source using `IngestionSourceRegistry.registerLocalSource()` with a `file://` root URI and `cestus-workspace://<workspaceId>` workspace URI.
- If source already exists, reuse it only when it points to the same root URI.
- Run `LegacyCestusInspector` with `LegacyDetectorRegistry([conservativeJsonMetadataPlugin])`.
- For each detected explicit legacy JSON metadata file, read the file content from the source root and call `parseLegacyClaimMetadata()`.
- Build and record the migration report through `buildLegacyMigrationReport()` and `LegacyMigrationReportService`.
- Load reports from `mountedWorkspace.derivativeStore.get(reportHash)`.
- Resolve latest report through `buildLegacyImportProjection(await ledger.readAll())`.
- Return stable success envelopes using `stableLegacyImportSuccess()`.
- Convert caught internal failures to `stableLegacyImportError({ code: "LEGACY_IMPORT_RUNTIME_INTERNAL", ... })`.

Modify `packages/ingestion/src/index.ts`:

```ts
export * from "./legacy-runtime.js";
```

- [ ] **Step 5: Run targeted tests**

```bash
npm test -- packages/ingestion/test/legacy-runtime.test.ts packages/ingestion/test/legacy-inspector.test.ts packages/ingestion/test/legacy-report.test.ts packages/ingestion/test/legacy-read-api.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification**

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 7: Commit**

```bash
git add docs/agentic/claims/task-4-legacy-operator-runtime-review.md packages/ingestion/src/legacy-runtime.ts packages/ingestion/src/index.ts packages/ingestion/test/legacy-runtime.test.ts
git commit -m "feat: add legacy import review runtime"
```

## Task 5: Add Raw Import And Ontology Staging Runtime Gates

**Files:**
- Create: `docs/agentic/claims/task-5-legacy-operator-runtime-gates.md`
- Modify: `packages/ingestion/src/legacy-runtime.ts`
- Modify: `packages/ingestion/test/legacy-runtime.test.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-5-legacy-operator-runtime-gates.md` with this task's owned files and status `claimed`. Then change status to `in-progress`.

- [ ] **Step 2: Extend failing runtime tests**

Append to `packages/ingestion/test/legacy-runtime.test.ts`:

```ts
describe("LegacyImportRuntime gated import and staging workflow", () => {
  it("approves raw import without copying bytes, then imports through stale-source verification", async () => {
    const workspace = createFakeMountedWorkspace("Legacy CLI workspace");
    const runtime = createLegacyImportRuntime({ mountedWorkspace: workspace, actor });
    await runtime.inspect({
      sourceCollectionId: "src_old_cestus",
      label: "Old Cestus",
      sourceRoot,
      scanBatchId: "scan_old_cestus_001"
    });

    const approved = await runtime.approveRawImport({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001",
      approvedBy: "actor_investigator"
    });
    expect(approved.ok).toBe(true);
    expect((await workspace.ledger.readAll()).map((event) => event.type)).not.toContain("evidence.ingested");

    const imported = await runtime.importApproved({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001"
    });

    expect(imported.ok).toBe(true);
    expect((await workspace.ledger.readAll()).map((event) => event.type)).toContain("evidence.ingested");
  });

  it("previews only evidence-tied staging candidates after raw import", async () => {
    const { runtime, inspected } = await preparedImportedRuntime();

    const preview = await runtime.stagingPreview({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: inspected.legacyReportId
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.candidates).toHaveLength(1);
    expect(preview.candidates[0]).toMatchObject({
      candidateId: expect.stringMatching(/^legacy_candidate_/),
      evidenceId: expect.stringMatching(/^ev_/),
      predicate: "agency.name",
      object: "Example Agency"
    });
  });

  it("requires human staging approval before appending assertion.proposed only", async () => {
    const { workspace, runtime, inspected } = await preparedImportedRuntime();
    const preview = await runtime.stagingPreview({
      sourceCollectionId: "src_old_cestus",
      legacyReportId: inspected.legacyReportId
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const approved = await runtime.approveStaging({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: inspected.legacyReportId,
      stagingBatchId: "legacy_stage_001",
      approvedBy: "actor_investigator",
      approvedAssertionCandidateIds: preview.candidates.map((candidate) => candidate.candidateId)
    });
    expect(approved.ok).toBe(true);

    const staged = await runtime.stageApproved({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: inspected.legacyReportId,
      stagingBatchId: "legacy_stage_001"
    });

    const eventTypes = (await workspace.ledger.readAll()).map((event) => event.type);
    expect(staged.ok).toBe(true);
    expect(eventTypes).toContain("legacy.ontology.staging.approved");
    expect(eventTypes).toContain("assertion.proposed");
    expect(eventTypes).not.toContain("assertion.accepted");
    expect(eventTypes).not.toContain("entity.resolved");
    expect(eventTypes).not.toContain("relationship.accepted");
  });
});

async function preparedImportedRuntime() {
  const workspace = createFakeMountedWorkspace("Legacy CLI workspace");
  const runtime = createLegacyImportRuntime({ mountedWorkspace: workspace, actor });
  const inspected = await runtime.inspect({
    sourceCollectionId: "src_old_cestus",
    label: "Old Cestus",
    sourceRoot,
    scanBatchId: "scan_old_cestus_001"
  });
  expect(inspected.ok).toBe(true);
  if (!inspected.ok) throw new Error("inspect failed");
  await runtime.approveRawImport({
    sourceCollectionId: "src_old_cestus",
    scanBatchId: "scan_old_cestus_001",
    importBatchId: "imp_old_cestus_001",
    approvedBy: "actor_investigator"
  });
  await runtime.importApproved({
    sourceCollectionId: "src_old_cestus",
    scanBatchId: "scan_old_cestus_001",
    importBatchId: "imp_old_cestus_001"
  });
  return { workspace, runtime, inspected };
}
```

- [ ] **Step 3: Run the targeted failing test**

```bash
npm test -- packages/ingestion/test/legacy-runtime.test.ts
```

Expected: failure because raw import and staging methods are missing or incomplete.

- [ ] **Step 4: Implement gate methods**

Add methods to `LegacyImportRuntime`:

```ts
approveRawImport(input: {
  sourceCollectionId: string;
  scanBatchId: string;
  importBatchId: string;
  approvedBy: string;
}): Promise<LegacyImportRuntimeResult<LegacyRawImportApprovalData>>;

importApproved(input: {
  sourceCollectionId: string;
  scanBatchId: string;
  importBatchId: string;
}): Promise<LegacyImportRuntimeResult<LegacyRawImportResultData>>;

approveStaging(input: {
  sourceCollectionId: string;
  scanBatchId: string;
  legacyReportId: string;
  stagingBatchId: string;
  approvedBy: string;
  approvedAssertionCandidateIds: string[];
}): Promise<LegacyImportRuntimeResult<LegacyStagingApprovalData>>;

stageApproved(input: {
  sourceCollectionId: string;
  scanBatchId: string;
  legacyReportId: string;
  stagingBatchId: string;
}): Promise<LegacyImportRuntimeResult<LegacyStageResultData>>;
```

Implementation details:

- `approveRawImport()` delegates to `createIngestionRuntime({ mountedWorkspace, actor }).approveRawImport()`.
- `importApproved()` delegates to `createIngestionRuntime({ mountedWorkspace, actor }).importApproved()` so source bytes are re-read and stale-source verification runs before blob writes.
- `stagingPreview()` loads report candidates, builds ingestion projection, maps `candidate.evidenceContentHash` to imported evidence IDs from `evidenceLinks`, and excludes candidates without evidence with a stable diagnostic.
- `approveStaging()` loads the report to obtain `reportHash` and `candidateSetHash`; it passes selected IDs to `LegacyOntologyStagingService.approveStaging()`.
- `stageApproved()` reuses staging preview candidates, verifies report identity, and calls `LegacyOntologyStagingService.stageApprovedAssertions()`.
- Before returning success from `stageApproved()`, inspect newly added event types and return `LEGACY_IMPORT_ACCEPTED_EVENT_FORBIDDEN` if any new event type is `assertion.accepted`, `entity.resolved`, or `relationship.accepted`.

- [ ] **Step 5: Run targeted tests**

```bash
npm test -- packages/ingestion/test/legacy-runtime.test.ts packages/ingestion/test/runtime.test.ts packages/ingestion/test/runtime-import-stale-source.test.ts packages/ingestion/test/legacy-staging.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification**

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 7: Commit**

```bash
git add docs/agentic/claims/task-5-legacy-operator-runtime-gates.md packages/ingestion/src/legacy-runtime.ts packages/ingestion/test/legacy-runtime.test.ts
git commit -m "feat: add legacy import operator gates"
```

## Task 6: Wire Legacy Commands Through CLI And Executable

**Files:**
- Create: `docs/agentic/claims/task-6-legacy-operator-cli.md`
- Create: `packages/ingestion/test/legacy-cli-workflow.test.ts`
- Create: `packages/ingestion/src/cli-runner.ts`
- Modify: `packages/ingestion/src/cli.ts`
- Modify: `packages/ingestion/bin/cestus-ingest.mjs`
- Modify: `package.json`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-6-legacy-operator-cli.md` with this task's owned files and status `claimed`. Then change status to `in-progress`.

- [ ] **Step 2: Write failing CLI workflow tests**

Create `packages/ingestion/test/legacy-cli-workflow.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { handleIngestionCommand, normalizeIngestionCliArgs } from "../src/cli.js";
import type { LegacyImportRuntime } from "../src/legacy-runtime.js";

describe("legacy operator CLI workflow", () => {
  it("normalizes nested cestus ingest legacy commands", () => {
    expect(normalizeIngestionCliArgs(["ingest", "legacy", "inspect", "--workspace", "/w"])).toEqual({
      kind: "command",
      command: "legacy inspect",
      argv: ["--workspace", "/w"]
    });
  });

  it("delegates legacy inspect through mount resolver and runtime factory", async () => {
    const inspect = vi.fn(async () => ({
      ok: true,
      command: "legacy inspect",
      workspace: { workspaceId: "ws_cli", label: "CLI" },
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: "legacy_report_001",
      eventIds: ["evt_report"],
      nextActions: ["review legacy report"]
    }));
    const output = await handleIngestionCommand({
      command: "legacy inspect",
      argv: [
        "--workspace", "/Volumes/Cestus",
        "--source", "/Volumes/OldCestus",
        "--source-id", "src_old_cestus",
        "--scan", "scan_old_cestus_001",
        "--label", "Old Cestus"
      ],
      mountResolver: fakeMountResolver(),
      legacyRuntimeFactory: () => fakeLegacyRuntime({ inspect })
    });

    expect(inspect).toHaveBeenCalledWith({
      sourceCollectionId: "src_old_cestus",
      label: "Old Cestus",
      sourceRoot: "/Volumes/OldCestus",
      scanBatchId: "scan_old_cestus_001"
    });
    expect(JSON.parse(output)).toMatchObject({
      ok: true,
      command: "legacy inspect",
      legacyReportId: "legacy_report_001"
    });
  });

  it("rejects missing legacy command options before resolving workspace", async () => {
    const mountResolver = { resolve: vi.fn() };
    const output = await handleIngestionCommand({
      command: "legacy inspect",
      argv: ["--workspace", "/Volumes/Cestus"],
      mountResolver,
      legacyRuntimeFactory: () => fakeLegacyRuntime()
    });

    expect(JSON.parse(output)).toMatchObject({
      ok: false,
      error: {
        code: "LEGACY_IMPORT_INVALID_ARGUMENTS",
        command: "legacy inspect",
        message: "Missing required ingestion CLI option --source."
      }
    });
    expect(mountResolver.resolve).not.toHaveBeenCalled();
  });
});

function fakeMountResolver() {
  return {
    resolve: vi.fn(async () => ({
      ok: true as const,
      workspace: {
        workspaceId: "ws_cli",
        label: "CLI",
        ledger: {},
        blobStore: {},
        derivativeStore: {},
        jobStateRoot: "/tmp/jobs",
        capabilities: {
          canReadLedger: true,
          canAppendLedger: true,
          canWriteBlobs: true,
          canWriteDerivatives: true,
          canWriteJobState: true
        }
      } as any
    }))
  };
}

function fakeLegacyRuntime(overrides: Partial<LegacyImportRuntime> = {}): LegacyImportRuntime {
  return {
    inspect: vi.fn(),
    report: vi.fn(),
    quarantine: vi.fn(),
    approveRawImport: vi.fn(),
    importApproved: vi.fn(),
    stagingPreview: vi.fn(),
    approveStaging: vi.fn(),
    stageApproved: vi.fn(),
    ...overrides
  };
}
```

- [ ] **Step 3: Run the targeted failing test**

```bash
npm test -- packages/ingestion/test/legacy-cli-workflow.test.ts
```

Expected: failure because nested command normalization and `legacyRuntimeFactory` are missing.

- [ ] **Step 4: Implement CLI wiring**

Modify `packages/ingestion/src/cli.ts`:

- Export `normalizeIngestionCliArgs(argv)`.
- Add `legacyRuntimeFactory?: LegacyImportCliRuntimeFactory` to `IngestionCommandInput`.
- Add `LegacyImportCliRuntimeFactoryInput` with `mountedWorkspace`.
- Add command parsing for `legacy artifact-ask`, `legacy inspect`, `legacy report`, `legacy quarantine`, `legacy approve-import`, `legacy import`, `legacy staging-preview`, `legacy approve-staging`, and `legacy stage`.
- Parse repeatable `--candidate` for staging approval.
- Return `LEGACY_IMPORT_INVALID_ARGUMENTS` before resolving workspace when required options are missing.
- Reuse `formatCliJson()` for all legacy outputs.

Command to runtime mapping:

```ts
case "legacy inspect":
  return runtime.inspect({
    sourceCollectionId: requiredOption(argv, "source-id"),
    label: requiredOption(argv, "label"),
    sourceRoot: requiredOption(argv, "source"),
    scanBatchId: requiredOption(argv, "scan")
  });
case "legacy approve-staging":
  return runtime.approveStaging({
    sourceCollectionId: requiredOption(argv, "source-id"),
    scanBatchId: requiredOption(argv, "scan"),
    legacyReportId: requiredOption(argv, "report"),
    stagingBatchId: requiredOption(argv, "staging"),
    approvedBy: requiredOption(argv, "approved-by"),
    approvedAssertionCandidateIds: optionValues(argv, "candidate")
  });
```

Create `packages/ingestion/src/cli-runner.ts`:

```ts
import {
  createLegacyImportRuntime,
  createIngestionRuntime,
  createPortableIngestionMountResolver,
  formatIngestionCliUsage,
  handleIngestionCommand,
  normalizeIngestionCliArgs
} from "./index.js";

export async function runIngestionCli(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const normalized = normalizeIngestionCliArgs(argv);
  if (normalized.kind === "help") {
    process.stdout.write(`${formatIngestionCliUsage("cestus-ingest")}\n`);
    return 0;
  }

  const output = await handleIngestionCommand({
    command: normalized.command,
    argv: normalized.argv,
    mountResolver: createPortableIngestionMountResolver(),
    runtimeFactory: ({ mountedWorkspace }) => createIngestionRuntime({
      mountedWorkspace,
      actor: { id: "actor_ingestion_cli", kind: "human", label: "Ingestion CLI" }
    }),
    legacyRuntimeFactory: ({ mountedWorkspace }) => createLegacyImportRuntime({
      mountedWorkspace,
      actor: { id: "actor_legacy_cli", kind: "human", label: "Legacy CLI" }
    })
  });
  process.stdout.write(output);
  return JSON.parse(output).ok === true ? 0 : 1;
}
```

Keep `cli-runner.ts` as the only place that creates default CLI dependencies.

Modify `packages/ingestion/bin/cestus-ingest.mjs` so it has no workflow logic. It should locate the repo-local `tsx` CLI and execute `packages/ingestion/src/cli-runner.ts` with the original arguments:

```js
#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const tsxCli = resolve(repoRoot, "node_modules/tsx/dist/cli.mjs");
const runner = resolve(repoRoot, "packages/ingestion/src/cli-runner.ts");

if (!existsSync(tsxCli)) {
  console.error(JSON.stringify({
    ok: false,
    error: {
      code: "INGESTION_RUNTIME_WIRING_REQUIRED",
      command: "cestus-ingest",
      message: "The ingestion CLI requires local project dependencies. Run npm install before using this command."
    }
  }, null, 2));
  process.exit(1);
}

const result = spawnSync(process.execPath, [tsxCli, runner, ...process.argv.slice(2)], {
  stdio: "inherit"
});

process.exit(result.status ?? 1);
```

Add a tail call in `cli-runner.ts`:

```ts
if (import.meta.url === `file://${process.argv[1]}`) {
  runIngestionCli().then((code) => process.exit(code));
}
```

Ensure `--help` prints the legacy commands.

Modify `package.json`:

```json
"ingestion:help": "node packages/ingestion/bin/cestus-ingest.mjs ingest --help"
```

Keep the existing script name. The help output must include `cestus ingest legacy inspect --workspace <root> --source <old-root>`.

- [ ] **Step 5: Run targeted tests**

```bash
npm test -- packages/ingestion/test/legacy-cli-workflow.test.ts packages/ingestion/test/legacy-cli.test.ts packages/ingestion/test/cli.test.ts
npm run ingestion:help
```

Expected: CLI tests pass and help output lists the legacy workflow.

- [ ] **Step 6: Run full verification**

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 7: Commit**

```bash
git add docs/agentic/claims/task-6-legacy-operator-cli.md package.json packages/ingestion/src/cli.ts packages/ingestion/src/cli-runner.ts packages/ingestion/bin/cestus-ingest.mjs packages/ingestion/test/legacy-cli-workflow.test.ts
git commit -m "feat: wire legacy import operator cli"
```

## Task 7: Add Factory Readiness Evidence

**Files:**
- Create: `docs/agentic/claims/task-7-legacy-operator-cli-readiness.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-7-legacy-operator-cli-readiness.md` with this task's owned files and status `claimed`. Then change status to `in-progress`.

- [ ] **Step 2: Write failing readiness validation**

Modify or add a readiness assertion in the relevant test or checker path so `scripts/check-agent-readiness.mjs` requires:

```text
docs/superpowers/specs/2026-07-06-legacy-cestus-operator-cli-design.md
docs/superpowers/plans/2026-07-06-legacy-cestus-operator-cli-implementation.md
```

Run:

```bash
npm run factory:check
```

Expected: failure before the checker includes the new files.

- [ ] **Step 3: Update factory checker and evidence**

Modify `scripts/check-agent-readiness.mjs` to include the approved spec and plan. Append a `Legacy Cestus Operator CLI Plan Readiness` section to `docs/agentic/software-factory.md` with targeted command evidence:

```text
npm test -- packages/ingestion/test/legacy-runtime-types.test.ts packages/ingestion/test/portable-mount.test.ts packages/ingestion/test/legacy-claim-parser.test.ts packages/ingestion/test/legacy-runtime.test.ts packages/ingestion/test/legacy-cli-workflow.test.ts packages/ingestion/test/legacy-cli.test.ts packages/ingestion/test/cli.test.ts
npm run ingestion:help
npm run verify
```

Record that the workflow remains recon-first, evidence-first, human-gated, and forbidden from accepted graph events.

- [ ] **Step 4: Run targeted readiness and full verification**

```bash
npm run factory:check
npm run verify
```

Expected: both commands pass.

- [ ] **Step 5: Commit**

```bash
git add docs/agentic/claims/task-7-legacy-operator-cli-readiness.md scripts/check-agent-readiness.mjs docs/agentic/software-factory.md
git commit -m "docs: record legacy operator cli readiness"
```

## Acceptance Criteria

- `cestus ingest legacy artifact-ask` prints stable JSON.
- `cestus ingest legacy inspect --workspace <root> --source <old-root> --source-id <src> --scan <scan> --label <label>` validates the portable workspace, scans the old root read-only, stores a migration report artifact, appends a report event, and emits stable JSON.
- `legacy report` and `legacy quarantine` print deterministic report data.
- `legacy approve-import` appends approval only.
- `legacy import` executes only after approval and uses stale-source verification before blob writes.
- `legacy staging-preview` returns only candidates tied to imported evidence IDs.
- `legacy approve-staging` records human approval for selected candidates only.
- `legacy stage` appends only `assertion.proposed`.
- No legacy CLI command appends `assertion.accepted`, `entity.resolved`, `relationship.accepted`, legal escalation, export, or publication events.
- Stable JSON error envelopes include code, command, message, allowed repair actions, and diagnostics.
- Diagnostics are secret-safe.
- `npm run verify` passes.

## Approval Gate

This plan awaits approval with the focused design. Implementation should begin only after approval.
