# Public Ingestion Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first public ingestion pipeline that can dry-run a messy read-only source drive, import unique artifacts into a portable Cestus workspace as provenance-backed evidence, normalize documents, and expose reviewable CLI/UI contracts.

**Architecture:** Add a new `packages/ingestion` domain package that composes ontology ledger, blob store, evidence service, and diagnostics. Ingestion state is append-only: source registrations, scans, occurrences, approvals, imports, evidence links, parse jobs, provider approvals, and projection checkpoints are ledger events. The first acquisition adapter is read-only local filesystem scanning with safe zip archive expansion; later connectors can emit the same scan/import contracts.

**Tech Stack:** TypeScript, Node.js 26, npm, Vitest, Zod, existing ontology ledger/blob/evidence primitives, `fflate` for deterministic zip fixture expansion, React for UI components, Markdown factory work orders.

---

## Required Reading

Before editing, every worker reads:

1. `AGENTS.md`
2. `.factory/skills/cestus-software-factory/SKILL.md`
3. `docs/agentic/software-factory.md`
4. `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
5. `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
6. `docs/superpowers/specs/2026-07-01-public-records-request-workflow-design.md`
7. `docs/superpowers/specs/2026-07-05-public-ingestion-pipeline-design.md`
8. This plan

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

Stop when a task needs source-drive mutation, data-loss migration, schema conflict, unavailable dependency, live external service as a standard verifier, credentials in tracked state, UI/runtime collision with the active PRR runtime thread, or a verifier still fails after two focused repair attempts.

## File Structure

- `packages/ingestion/src/index.ts`: public ingestion package exports.
- `packages/ingestion/src/types.ts`: shared ingestion IDs, source refs, batch IDs, actor helpers, job states, and value types.
- `packages/ingestion/src/workspace.ts`: portable workspace path contract and local workspace manifest helpers.
- `packages/ingestion/src/source-registry.ts`: source collection registration service.
- `packages/ingestion/src/local-filesystem.ts`: read-only local filesystem scan adapter and hash inventory.
- `packages/ingestion/src/archive-adapter.ts`: safe zip archive expansion for scan inventory.
- `packages/ingestion/src/import-service.ts`: raw import approval, content-addressed blob copy, evidence creation, and evidence linkage.
- `packages/ingestion/src/projection.ts`: rebuildable ingestion projection.
- `packages/ingestion/src/read-api.ts`: UI/CLI-facing DTO builders.
- `packages/ingestion/src/parser.ts`: local parse job contracts, local parser fakes, and derivative output metadata.
- `packages/ingestion/src/provider-adapter.ts`: provider parser contract, provider approval gate, and fake provider.
- `packages/ingestion/src/cli.ts`: pure command handlers for CLI workflows.
- `packages/ingestion/bin/cestus-ingest.mjs`: thin executable wrapper around CLI handlers.
- `packages/ingestion/test/*.test.ts`: focused unit and integration tests.
- `packages/ingestion/test/fixtures/*`: generated fixture trees and zip fixtures built inside tests.
- `packages/ontology/src/contracts.ts`: extend knowledge event contracts with ingestion events.
- `packages/ontology/test/contracts.test.ts`: ingestion event contract coverage.
- `packages/ontology/src/index.ts`: modified only if new contract exports require it.
- `packages/ui/src/ingestion/*`: ingestion UI models and components.
- `packages/ui/test/ingestion-*.test.tsx`: UI DTO/component tests.
- `packages/ui/src/workspace/workspace-nav.ts`: guarded final navigation integration only after runtime coordination.
- `packages/ui/src/App.tsx`: guarded final app integration only after runtime coordination.
- `scripts/check-agent-readiness.mjs`: add this spec and plan to required files after plan implementation begins.
- `docs/agentic/software-factory.md`: record final readiness evidence after all tasks pass.

## Scope Boundary

This plan builds the local-first ingestion foundation and a reviewable app integration. It does not build live public portal scraping, accepted ontology extraction, investigation suggestion agents, or team server coordination.

The active PRR runtime thread owns local runtime wiring. Do not edit `packages/local-runtime`, `packages/ui/src/requests/request-adapter.ts`, local runtime scripts, or runtime-preview readiness files in this plan. Do not edit `packages/ui/src/App.tsx` until Task 13 explicitly confirms runtime-thread coordination.

## Task 1: Bootstrap The Ingestion Package

**Files:**
- Create: `docs/agentic/claims/task-1-bootstrap-ingestion-package.md`
- Create: `packages/ingestion/src/index.ts`
- Create: `packages/ingestion/test/smoke.test.ts`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-bootstrap-ingestion-package.md` with status `claimed`, the active branch, this plan path, owned files, and the current UTC timestamp. Commit it:

```bash
git add docs/agentic/claims/task-1-bootstrap-ingestion-package.md
git commit -m "chore: claim ingestion package bootstrap"
```

- [ ] **Step 2: Mark the claim in progress**

Update the same claim status to `in-progress` and keep the owned file list unchanged. Do not commit yet.

- [ ] **Step 3: Write the failing smoke test**

Create `packages/ingestion/test/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ingestionPackageName } from "../src/index.js";

describe("ingestion package", () => {
  it("exposes a stable package name", () => {
    expect(ingestionPackageName).toBe("@cestus/ingestion");
  });
});
```

- [ ] **Step 4: Run the smoke test to verify it fails**

Run:

```bash
npm test -- packages/ingestion/test/smoke.test.ts
```

Expected: failure resolving `../src/index.js`.

- [ ] **Step 5: Create the package entrypoint**

Create `packages/ingestion/src/index.ts`:

```ts
export const ingestionPackageName = "@cestus/ingestion";
```

- [ ] **Step 6: Run the targeted test**

Run:

```bash
npm test -- packages/ingestion/test/smoke.test.ts
```

Expected: one test file passes.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add docs/agentic/claims/task-1-bootstrap-ingestion-package.md packages/ingestion/src/index.ts packages/ingestion/test/smoke.test.ts
git commit -m "chore: bootstrap ingestion package"
```

## Task 2: Add Ingestion Event Contracts

**Files:**
- Create: `docs/agentic/claims/task-2-ingestion-event-contracts.md`
- Modify: `packages/ontology/src/contracts.ts`
- Modify: `packages/ontology/test/contracts.test.ts`
- Create: `packages/ingestion/src/types.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-ingestion-event-contracts.md` with this task's owned files.

- [ ] **Step 2: Write failing contract tests**

Append a new `describe("ingestion event contracts", ...)` block to `packages/ontology/test/contracts.test.ts`:

```ts
describe("ingestion event contracts", () => {
  it("validates source registration, scan, occurrence, approval, evidence link, parse, and provider events", () => {
    const events: KnowledgeEvent[] = [
      ingestionEvent("evt_ing_source_registered", "ingestion.source.registered", {
        sourceCollectionId: "src_drive_001",
        label: "External investigation archive",
        mode: "read-only",
        adapter: { name: "local-filesystem", version: "0.1.0" },
        rootUri: "file:///mnt/investigation-drive/source",
        workspaceUri: "file:///mnt/investigation-drive/cestus-workspace"
      }),
      ingestionEvent("evt_ing_scan_started", "ingestion.scan.started", {
        scanBatchId: "scan_001",
        sourceCollectionId: "src_drive_001",
        hashPolicy: "sha256-dry-run",
        startedAt: "2026-07-05T12:00:00.000Z"
      }),
      ingestionEvent("evt_ing_occurrence_observed", "ingestion.occurrence.observed", {
        occurrenceId: "occ_001",
        scanBatchId: "scan_001",
        sourceCollectionId: "src_drive_001",
        contentHash: validHash,
        sourcePath: "/source/contracts/a.pdf",
        sizeBytes: 11,
        observedAt: "2026-07-05T12:01:00.000Z",
        status: "new"
      }),
      ingestionEvent("evt_ing_scan_completed", "ingestion.scan.completed", {
        scanBatchId: "scan_001",
        sourceCollectionId: "src_drive_001",
        completedAt: "2026-07-05T12:02:00.000Z",
        inventoryHash: validHash,
        totals: {
          observedFiles: 1,
          uniqueContent: 1,
          duplicateOccurrences: 0,
          skipped: 0,
          bytes: 11,
          estimatedNewBlobBytes: 11
        }
      }),
      ingestionEvent("evt_ing_import_approved", "ingestion.import.approved", {
        importBatchId: "imp_001",
        scanBatchId: "scan_001",
        sourceCollectionId: "src_drive_001",
        approvedBy: "actor_investigator",
        approvedAt: "2026-07-05T12:03:00.000Z"
      }),
      ingestionEvent("evt_ing_import_completed", "ingestion.import.completed", {
        importBatchId: "imp_001",
        scanBatchId: "scan_001",
        sourceCollectionId: "src_drive_001",
        completedAt: "2026-07-05T12:04:00.000Z",
        totals: { evidenceCreated: 1, occurrencesLinked: 1, duplicatesReused: 0, skipped: 0 }
      }),
      ingestionEvent("evt_ing_evidence_linked", "ingestion.evidence.linked", {
        evidenceId: "ev_ingested_001",
        importBatchId: "imp_001",
        sourceCollectionId: "src_drive_001",
        contentHash: validHash,
        occurrenceIds: ["occ_001"]
      }),
      ingestionEvent("evt_ing_parse_created", "ingestion.parse.job.created", {
        parseJobId: "parse_001",
        importBatchId: "imp_001",
        evidenceId: "ev_ingested_001",
        lane: "local",
        parser: { name: "local-text", version: "0.1.0" },
        state: "queued"
      }),
      ingestionEvent("evt_ing_parse_completed", "ingestion.parse.completed", {
        parseJobId: "parse_001",
        evidenceId: "ev_ingested_001",
        lane: "local",
        parser: { name: "local-text", version: "0.1.0" },
        outputHash: validHash,
        outputMediaType: "text/plain",
        completedAt: "2026-07-05T12:05:00.000Z"
      }),
      ingestionEvent("evt_ing_provider_approved", "ingestion.provider.approved", {
        providerJobId: "provider_001",
        sourceCollectionId: "src_drive_001",
        importBatchId: "imp_001",
        provider: { name: "mistral-document-ai", version: "0.1.0" },
        approvedBy: "actor_investigator",
        approvedAt: "2026-07-05T12:06:00.000Z",
        eligibleMediaTypes: ["application/pdf"],
        maxBytesPerFile: 50000000,
        policy: "send-all-technically-eligible"
      })
    ];

    for (const event of events) {
      expect(validateKnowledgeEvent(event).success, event.type).toBe(true);
    }
  });

  it("rejects uncontracted ingestion payload fields", () => {
    const event = ingestionEvent("evt_ing_bad_scan", "ingestion.scan.completed", {
      scanBatchId: "scan_002",
      sourceCollectionId: "src_drive_001",
      completedAt: "2026-07-05T12:02:00.000Z",
      inventoryHash: validHash,
      totals: {
        observedFiles: 1,
        uniqueContent: 1,
        duplicateOccurrences: 0,
        skipped: 0,
        bytes: 11,
        estimatedNewBlobBytes: 11
      },
      extra: true
    });

    expect(validateKnowledgeEvent(event).success).toBe(false);
  });
});

function ingestionEvent<Type extends KnowledgeEvent["type"]>(
  id: string,
  type: Type,
  payload: Extract<KnowledgeEvent, { type: Type }>["payload"]
): Extract<KnowledgeEvent, { type: Type }> {
  return {
    id,
    type,
    version: 1,
    streamId: `ingestion_${id}`,
    sequence: 1,
    context,
    payload
  } as Extract<KnowledgeEvent, { type: Type }>;
}
```

- [ ] **Step 3: Run contract tests to verify they fail**

Run:

```bash
npm test -- packages/ontology/test/contracts.test.ts
```

Expected: TypeScript or validation failure because ingestion event types do not exist.

- [ ] **Step 4: Add shared ingestion types**

Create `packages/ingestion/src/types.ts`:

```ts
export type IngestionJobState = "queued" | "running" | "succeeded" | "failed" | "skipped";
export type IngestionMode = "read-only";
export type OccurrenceStatus = "new" | "duplicate" | "changed" | "missing" | "skipped";
export type ParseLane = "local" | "provider";

export interface IngestionAdapterRef {
  name: string;
  version: string;
}

export interface SourceCollectionRef {
  sourceCollectionId: string;
  label: string;
}

export interface ContentOccurrenceRef {
  occurrenceId: string;
  sourceCollectionId: string;
  scanBatchId: string;
  contentHash: `sha256:${string}`;
}
```

Modify `packages/ingestion/src/index.ts`:

```ts
export const ingestionPackageName = "@cestus/ingestion";
export * from "./types.js";
```

- [ ] **Step 5: Extend ontology contracts**

In `packages/ontology/src/contracts.ts`, add strict payload schemas for the ingestion event types from the tests, add them to `payloadSchemas`, and add `eventContracts` entries with descriptions, agent guidance, and invariants. Use ID regexes:

```ts
const sourceCollectionIdSchema = z.string().regex(/^src_[a-zA-Z0-9_-]+$/);
const scanBatchIdSchema = z.string().regex(/^scan_[a-zA-Z0-9_-]+$/);
const importBatchIdSchema = z.string().regex(/^imp_[a-zA-Z0-9_-]+$/);
const occurrenceIdSchema = z.string().regex(/^occ_[a-zA-Z0-9_-]+$/);
const parseJobIdSchema = z.string().regex(/^parse_[a-zA-Z0-9_-]+$/);
const providerJobIdSchema = z.string().regex(/^provider_[a-zA-Z0-9_-]+$/);
const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const ingestionAdapterRefSchema = z.object({ name: z.string().min(1), version: z.string().min(1) }).strict();
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/ontology/test/contracts.test.ts packages/ingestion/test/smoke.test.ts
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
git add docs/agentic/claims/task-2-ingestion-event-contracts.md packages/ontology/src/contracts.ts packages/ontology/test/contracts.test.ts packages/ingestion/src/types.ts packages/ingestion/src/index.ts
git commit -m "feat: add ingestion event contracts"
```

## Task 3: Add Portable Workspace Contract

**Files:**
- Create: `docs/agentic/claims/task-3-ingestion-workspace.md`
- Create: `packages/ingestion/src/workspace.ts`
- Create: `packages/ingestion/test/workspace.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-ingestion-workspace.md`.

- [ ] **Step 2: Write failing workspace tests**

Create `packages/ingestion/test/workspace.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPortableIngestionWorkspace, readPortableWorkspaceManifest } from "../src/workspace.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-ingestion-workspace-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("portable ingestion workspace", () => {
  it("creates a self-contained workspace layout with no secrets", () => {
    const workspace = createPortableIngestionWorkspace({
      rootDir: dir,
      workspaceId: "ws_ingestion_001",
      label: "External drive corpus"
    });

    expect(workspace).toEqual({
      workspaceId: "ws_ingestion_001",
      label: "External drive corpus",
      rootDir: dir,
      manifestPath: join(dir, "cestus-workspace.json"),
      ledgerPath: join(dir, "ledger", "ontology.sqlite"),
      blobRoot: join(dir, "blobs"),
      derivativeRoot: join(dir, "derivatives"),
      jobRoot: join(dir, "jobs")
    });
    expect(readPortableWorkspaceManifest(workspace.manifestPath)).toEqual({
      workspaceId: "ws_ingestion_001",
      label: "External drive corpus",
      version: 1
    });
    expect(JSON.stringify(readPortableWorkspaceManifest(workspace.manifestPath))).not.toMatch(/token|secret|password/i);
  });
});
```

- [ ] **Step 3: Run workspace tests to verify they fail**

Run:

```bash
npm test -- packages/ingestion/test/workspace.test.ts
```

Expected: failure resolving `../src/workspace.js`.

- [ ] **Step 4: Create workspace helpers**

Create `packages/ingestion/src/workspace.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const workspaceManifestSchema = z.object({
  workspaceId: z.string().regex(/^ws_[a-zA-Z0-9_-]+$/),
  label: z.string().min(1),
  version: z.literal(1)
}).strict();

export type PortableWorkspaceManifest = z.infer<typeof workspaceManifestSchema>;

export interface CreatePortableWorkspaceInput {
  rootDir: string;
  workspaceId: string;
  label: string;
}

export interface PortableIngestionWorkspace {
  workspaceId: string;
  label: string;
  rootDir: string;
  manifestPath: string;
  ledgerPath: string;
  blobRoot: string;
  derivativeRoot: string;
  jobRoot: string;
}

export function createPortableIngestionWorkspace(input: CreatePortableWorkspaceInput): PortableIngestionWorkspace {
  const manifest = workspaceManifestSchema.parse({
    workspaceId: input.workspaceId,
    label: input.label,
    version: 1
  });
  const workspace = workspacePaths(input.rootDir, manifest.workspaceId, manifest.label);
  mkdirSync(join(input.rootDir, "ledger"), { recursive: true });
  mkdirSync(workspace.blobRoot, { recursive: true });
  mkdirSync(workspace.derivativeRoot, { recursive: true });
  mkdirSync(workspace.jobRoot, { recursive: true });
  writeFileSync(workspace.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return workspace;
}

export function readPortableWorkspaceManifest(manifestPath: string): PortableWorkspaceManifest {
  return workspaceManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
}

function workspacePaths(rootDir: string, workspaceId: string, label: string): PortableIngestionWorkspace {
  return {
    workspaceId,
    label,
    rootDir,
    manifestPath: join(rootDir, "cestus-workspace.json"),
    ledgerPath: join(rootDir, "ledger", "ontology.sqlite"),
    blobRoot: join(rootDir, "blobs"),
    derivativeRoot: join(rootDir, "derivatives"),
    jobRoot: join(rootDir, "jobs")
  };
}
```

Modify `packages/ingestion/src/index.ts`:

```ts
export const ingestionPackageName = "@cestus/ingestion";
export * from "./types.js";
export * from "./workspace.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ingestion/test/workspace.test.ts
```

Expected: targeted test passes.

- [ ] **Step 6: Run full verification and commit**

Run:

```bash
npm run verify
git add docs/agentic/claims/task-3-ingestion-workspace.md packages/ingestion/src/workspace.ts packages/ingestion/src/index.ts packages/ingestion/test/workspace.test.ts
git commit -m "feat: add portable ingestion workspace"
```

## Task 4: Add Source Registry

**Files:**
- Create: `docs/agentic/claims/task-4-ingestion-source-registry.md`
- Create: `packages/ingestion/src/source-registry.ts`
- Create: `packages/ingestion/test/source-registry.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-4-ingestion-source-registry.md`.

- [ ] **Step 2: Write failing source registry tests**

Create `packages/ingestion/test/source-registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { IngestionSourceRegistry } from "../src/source-registry.js";

const actor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };

describe("IngestionSourceRegistry", () => {
  it("registers a read-only local source collection", async () => {
    const ledger = new InMemoryEventLedger();
    const registry = new IngestionSourceRegistry({ ledger, actor });

    const event = await registry.registerLocalSource({
      sourceCollectionId: "src_drive_001",
      label: "External investigation archive",
      rootUri: "file:///mnt/source",
      workspaceUri: "file:///mnt/cestus-workspace"
    });

    expect(event.type).toBe("ingestion.source.registered");
    expect(event.payload.mode).toBe("read-only");
    expect(event.payload.adapter).toEqual({ name: "local-filesystem", version: "0.1.0" });
    expect(await ledger.readStream("ingestion_source_src_drive_001")).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
npm test -- packages/ingestion/test/source-registry.test.ts
```

Expected: failure resolving `../src/source-registry.js`.

- [ ] **Step 4: Create source registry service**

Create `packages/ingestion/src/source-registry.ts` with an `IngestionSourceRegistry` class that appends `ingestion.source.registered` with stream ID `ingestion_source_${sourceCollectionId}` and actor context. Validate duplicate source registration by reading the stream and throwing `Source collection ${id} is already registered` before append.

- [ ] **Step 5: Export and run targeted tests**

Modify `packages/ingestion/src/index.ts` to export `./source-registry.js`, then run:

```bash
npm test -- packages/ingestion/test/source-registry.test.ts
```

Expected: targeted test passes.

- [ ] **Step 6: Run full verification and commit**

Run:

```bash
npm run verify
git add docs/agentic/claims/task-4-ingestion-source-registry.md packages/ingestion/src/source-registry.ts packages/ingestion/src/index.ts packages/ingestion/test/source-registry.test.ts
git commit -m "feat: add ingestion source registry"
```

## Task 5: Add Local Dry-Run Scanner

**Files:**
- Create: `docs/agentic/claims/task-5-local-dry-run-scanner.md`
- Create: `packages/ingestion/src/local-filesystem.ts`
- Create: `packages/ingestion/test/local-filesystem.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-5-local-dry-run-scanner.md`.

- [ ] **Step 2: Write failing dry-run scanner tests**

Create `packages/ingestion/test/local-filesystem.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { LocalFilesystemScanner } from "../src/local-filesystem.js";

let root: string;
const duplicateText = "same";
const notesText = JSON.stringify({ agency: "Example" });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cestus-scan-"));
  mkdirSync(join(root, "contracts"), { recursive: true });
  writeFileSync(join(root, "contracts", "a.txt"), duplicateText);
  writeFileSync(join(root, "contracts", "copy.txt"), duplicateText);
  writeFileSync(join(root, "notes.json"), notesText);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("LocalFilesystemScanner", () => {
  it("runs a dry-run scan with hashes, duplicate counts, and occurrence events", async () => {
    const duplicateBytes = Buffer.byteLength(duplicateText);
    const notesBytes = Buffer.byteLength(notesText);
    const ledger = new InMemoryEventLedger();
    const scanner = new LocalFilesystemScanner({
      ledger,
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });

    const result = await scanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      rootDir: root
    });

    expect(result.totals).toMatchObject({
      observedFiles: 3,
      uniqueContent: 2,
      duplicateOccurrences: 1,
      skipped: 0,
      bytes: duplicateBytes * 2 + notesBytes,
      estimatedNewBlobBytes: duplicateBytes + notesBytes
    });
    expect(result.occurrences.map((occurrence) => occurrence.status).sort()).toEqual([
      "duplicate",
      "new",
      "new"
    ]);
    expect(result.inventoryHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "ingestion.scan.started",
      "ingestion.occurrence.observed",
      "ingestion.occurrence.observed",
      "ingestion.occurrence.observed",
      "ingestion.scan.completed"
    ]);
  });
});
```

- [ ] **Step 3: Run scanner test to verify it fails**

Run:

```bash
npm test -- packages/ingestion/test/local-filesystem.test.ts
```

Expected: failure resolving `../src/local-filesystem.js`.

- [ ] **Step 4: Create scanner implementation**

Create `packages/ingestion/src/local-filesystem.ts`. Implement `LocalFilesystemScanner.scan()` using `readdirSync`, `statSync`, `readFileSync`, and `crypto.createHash("sha256")`. Sort paths lexicographically before hashing. Skip directories by recursing into them. Emit `ingestion.scan.started`, one `ingestion.occurrence.observed` per readable file, and `ingestion.scan.completed`. Use stable occurrence IDs by hashing `${scanBatchId}:${relativePath}:${contentHash}` and prefixing `occ_`.

- [ ] **Step 5: Export and run targeted tests**

Modify `packages/ingestion/src/index.ts` to export `./local-filesystem.js`, then run:

```bash
npm test -- packages/ingestion/test/local-filesystem.test.ts
```

Expected: targeted test passes.

- [ ] **Step 6: Run full verification and commit**

Run:

```bash
npm run verify
git add docs/agentic/claims/task-5-local-dry-run-scanner.md packages/ingestion/src/local-filesystem.ts packages/ingestion/src/index.ts packages/ingestion/test/local-filesystem.test.ts
git commit -m "feat: add local ingestion dry-run scanner"
```

## Task 6: Add Safe Zip Archive Expansion

**Files:**
- Create: `docs/agentic/claims/task-6-archive-expansion.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `packages/ingestion/src/archive-adapter.ts`
- Create: `packages/ingestion/test/archive-adapter.test.ts`
- Modify: `packages/ingestion/src/local-filesystem.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-6-archive-expansion.md`.

- [ ] **Step 2: Write failing archive tests**

Create `packages/ingestion/test/archive-adapter.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { LocalFilesystemScanner } from "../src/local-filesystem.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cestus-archive-scan-"));
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("zip archive expansion", () => {
  it("observes zip children as evidence candidates with container provenance", async () => {
    writeFileSync(join(root, "bundle.zip"), zipSync({
      "folder/a.txt": strToU8("alpha"),
      "folder/b.txt": strToU8("beta")
    }));
    const scanner = new LocalFilesystemScanner({
      ledger: new InMemoryEventLedger(),
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });

    const result = await scanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_zip_001",
      rootDir: root
    });

    expect(result.occurrences).toHaveLength(2);
    expect(result.occurrences.map((occurrence) => occurrence.internalPath).sort()).toEqual([
      "folder/a.txt",
      "folder/b.txt"
    ]);
    expect(result.occurrences.every((occurrence) => occurrence.containerPath?.endsWith("bundle.zip"))).toBe(true);
  });

  it("rejects unsafe zip internal paths before occurrence creation", async () => {
    writeFileSync(join(root, "bad.zip"), zipSync({
      "../escape.txt": strToU8("nope")
    }));
    const ledger = new InMemoryEventLedger();
    const scanner = new LocalFilesystemScanner({
      ledger,
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });

    const result = await scanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_zip_002",
      rootDir: root
    });

    expect(result.occurrences).toHaveLength(0);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      category: "ingestion",
      message: expect.stringMatching(/unsafe archive path/)
    }));
  });
});
```

- [ ] **Step 3: Run archive test to verify it fails**

Run:

```bash
npm test -- packages/ingestion/test/archive-adapter.test.ts
```

Expected: failure resolving `fflate` or archive support.

- [ ] **Step 4: Add archive dependency**

Run:

```bash
npm install fflate@^0.8.2
```

Expected: `package.json` and `package-lock.json` update.

- [ ] **Step 5: Create archive adapter**

Create `packages/ingestion/src/archive-adapter.ts` with `ZipArchiveAdapter.expand(content, options)`. Use `fflate.unzipSync`. Reject internal paths that are absolute, contain `..`, contain backslashes, or exceed configured entry count and expansion bytes. Return child records with `internalPath`, `content`, `containerHash`, `tool: "fflate"`, and `version: "0.8.x"`.

- [ ] **Step 6: Wire scanner to zip adapter**

Update `packages/ingestion/src/local-filesystem.ts` so `.zip` source files produce occurrences for safe children instead of an occurrence for the container. Include `containerPath`, `containerHash`, `internalPath`, and archive adapter metadata in the occurrence payload.

- [ ] **Step 7: Export archive adapter and run tests**

Modify `packages/ingestion/src/index.ts` to export `./archive-adapter.js`, then run:

```bash
npm test -- packages/ingestion/test/archive-adapter.test.ts packages/ingestion/test/local-filesystem.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 8: Run full verification and commit**

Run:

```bash
npm run verify
git add docs/agentic/claims/task-6-archive-expansion.md package.json package-lock.json packages/ingestion/src/archive-adapter.ts packages/ingestion/src/local-filesystem.ts packages/ingestion/src/index.ts packages/ingestion/test/archive-adapter.test.ts
git commit -m "feat: expand ingestion zip archives safely"
```

## Task 7: Add Import Approval And Evidence Import

**Files:**
- Create: `docs/agentic/claims/task-7-import-service.md`
- Create: `packages/ingestion/src/import-service.ts`
- Create: `packages/ingestion/test/import-service.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-7-import-service.md`.

- [ ] **Step 2: Write failing import tests**

Create `packages/ingestion/test/import-service.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { IngestionImportService } from "../src/import-service.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-import-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("IngestionImportService", () => {
  it("requires raw import approval before evidence creation", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new IngestionImportService({
      ledger,
      blobStore: new FileBlobStore(dir),
      actor: { id: "actor_system", kind: "system", label: "Importer" }
    });

    await expect(service.importApprovedOccurrences({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001",
      occurrences: [{
        occurrenceId: "occ_001",
        content: Buffer.from("alpha"),
        sourcePath: "/source/a.txt",
        mediaType: "text/plain"
      }]
    })).rejects.toThrow(/approval/);
  });

  it("creates one evidence item for duplicate content with multiple occurrences", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new IngestionImportService({
      ledger,
      blobStore: new FileBlobStore(dir),
      actor: { id: "actor_system", kind: "system", label: "Importer" }
    });

    await service.approveImport({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001",
      approvedBy: "actor_investigator"
    });

    const result = await service.importApprovedOccurrences({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001",
      occurrences: [
        { occurrenceId: "occ_001", content: Buffer.from("same"), sourcePath: "/source/a.txt", mediaType: "text/plain" },
        { occurrenceId: "occ_002", content: Buffer.from("same"), sourcePath: "/source/b.txt", mediaType: "text/plain" }
      ]
    });

    expect(result.totals).toEqual({ evidenceCreated: 1, occurrencesLinked: 2, duplicatesReused: 1, skipped: 0 });
    expect((await ledger.readAll()).map((event) => event.type)).toContain("evidence.ingested");
    expect((await ledger.readAll()).filter((event) => event.type === "ingestion.evidence.linked")).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run import test to verify it fails**

Run:

```bash
npm test -- packages/ingestion/test/import-service.test.ts
```

Expected: failure resolving `../src/import-service.js`.

- [ ] **Step 4: Create import service**

Create `packages/ingestion/src/import-service.ts`. Implement `approveImport()` to append `ingestion.import.approved`. Implement `importApprovedOccurrences()` to require an approval event, group occurrences by SHA-256 content hash, call `EvidenceService.ingest()` once per new hash, append `ingestion.evidence.linked`, and append `ingestion.import.completed`. Use deterministic evidence IDs by hashing content hash and prefixing `ev_ing_`.

- [ ] **Step 5: Export and run targeted tests**

Modify `packages/ingestion/src/index.ts` to export `./import-service.js`, then run:

```bash
npm test -- packages/ingestion/test/import-service.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification and commit**

Run:

```bash
npm run verify
git add docs/agentic/claims/task-7-import-service.md packages/ingestion/src/import-service.ts packages/ingestion/src/index.ts packages/ingestion/test/import-service.test.ts
git commit -m "feat: add ingestion import service"
```

## Task 8: Add Rebuildable Ingestion Projection And Read API

**Files:**
- Create: `docs/agentic/claims/task-8-ingestion-projection.md`
- Create: `packages/ingestion/src/projection.ts`
- Create: `packages/ingestion/src/read-api.ts`
- Create: `packages/ingestion/test/projection.test.ts`
- Create: `packages/ingestion/test/read-api.test.ts`
- Create: `packages/ingestion/test/fixtures/golden-ingestion-ledger.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-8-ingestion-projection.md`.

- [ ] **Step 2: Write failing projection and read API tests**

Create `packages/ingestion/test/projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import { buildIngestionProjection } from "../src/projection.js";
import { goldenIngestionLedgerEvents } from "./fixtures/golden-ingestion-ledger.js";

describe("buildIngestionProjection", () => {
  it("rebuilds source, scan, occurrence, import, evidence link, and parse state", () => {
    for (const event of goldenIngestionLedgerEvents) {
      expect(validateKnowledgeEvent(event).success, event.type).toBe(true);
    }

    const projection = buildIngestionProjection(goldenIngestionLedgerEvents);
    expect(projection.sources.get("src_drive_001")?.latestScanBatchId).toBe("scan_001");
    expect(projection.duplicatesByHash.get("sha256:1111111111111111111111111111111111111111111111111111111111111111")).toEqual([
      "occ_001",
      "occ_002"
    ]);
    expect(projection.evidenceByHash.get("sha256:1111111111111111111111111111111111111111111111111111111111111111")).toBe("ev_ing_001");
  });
});
```

Create `packages/ingestion/test/read-api.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildIngestionProjection } from "../src/projection.js";
import { buildIngestionReviewDto } from "../src/read-api.js";
import { goldenIngestionLedgerEvents } from "./fixtures/golden-ingestion-ledger.js";

describe("ingestion read API", () => {
  it("builds a dry-run review DTO for CLI and UI use", () => {
    const dto = buildIngestionReviewDto(buildIngestionProjection(goldenIngestionLedgerEvents), "src_drive_001");
    expect(dto).toMatchObject({
      sourceCollectionId: "src_drive_001",
      latestScanBatchId: "scan_001",
      totals: {
        observedFiles: 2,
        uniqueContent: 1,
        duplicateOccurrences: 1,
        skipped: 0,
        bytes: 8,
        estimatedNewBlobBytes: 4
      },
      approvalRequired: false,
      duplicateGroups: [{ contentHash: expect.stringMatching(/^sha256:/), occurrenceCount: 2 }]
    });
  });
});
```

- [ ] **Step 3: Create golden fixture**

Create `packages/ingestion/test/fixtures/golden-ingestion-ledger.ts` with validated source, scan, two duplicate occurrences, import approval, import completion, evidence link, and parse job events. Use the fixed content hash `sha256:1111111111111111111111111111111111111111111111111111111111111111`.

- [ ] **Step 4: Run tests to verify they fail**

Run:

```bash
npm test -- packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts
```

Expected: failures resolving projection and read API modules.

- [ ] **Step 5: Create projection and read API**

Create `packages/ingestion/src/projection.ts` with `buildIngestionProjection(events)` that rebuilds source summaries, occurrence maps, duplicate groups, import approvals, import completions, evidence links, parse job state, and diagnostic references from ledger events.

Create `packages/ingestion/src/read-api.ts` with `buildIngestionReviewDto(projection, sourceCollectionId)` returning stable DTOs for UI and CLI review.

- [ ] **Step 6: Export and run targeted tests**

Modify `packages/ingestion/src/index.ts` to export `./projection.js` and `./read-api.js`, then run:

```bash
npm test -- packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 7: Run full verification and commit**

Run:

```bash
npm run verify
git add docs/agentic/claims/task-8-ingestion-projection.md packages/ingestion/src/projection.ts packages/ingestion/src/read-api.ts packages/ingestion/src/index.ts packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts packages/ingestion/test/fixtures/golden-ingestion-ledger.ts
git commit -m "feat: add ingestion projection and read api"
```

## Task 9: Add Local Parser Jobs And Derivative Outputs

**Files:**
- Create: `docs/agentic/claims/task-9-local-parser-jobs.md`
- Create: `packages/ingestion/src/parser.ts`
- Create: `packages/ingestion/test/parser.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-9-local-parser-jobs.md`.

- [ ] **Step 2: Write failing parser tests**

Create `packages/ingestion/test/parser.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { LocalParseService } from "../src/parser.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-parser-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("LocalParseService", () => {
  it("creates and completes a local parse job with derivative output hash", async () => {
    const ledger = new InMemoryEventLedger();
    const derivatives = new FileBlobStore(dir);
    const parser = new LocalParseService({
      ledger,
      derivativeStore: derivatives,
      actor: { id: "actor_system", kind: "system", label: "Local parser" }
    });

    await parser.createLocalParseJob({
      parseJobId: "parse_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      evidenceId: "ev_ing_001",
      parser: { name: "local-text", version: "0.1.0" }
    });
    const completed = await parser.completeTextParse({
      parseJobId: "parse_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      evidenceId: "ev_ing_001",
      text: "extracted text",
      parser: { name: "local-text", version: "0.1.0" }
    });

    expect(completed.type).toBe("ingestion.parse.completed");
    expect(completed.payload.outputHash).toMatch(/^sha256:/);
    await expect(derivatives.get(completed.payload.outputHash as `sha256:${string}`)).resolves.toEqual(Buffer.from("extracted text"));
  });
});
```

- [ ] **Step 3: Run parser test to verify it fails**

Run:

```bash
npm test -- packages/ingestion/test/parser.test.ts
```

Expected: failure resolving `../src/parser.js`.

- [ ] **Step 4: Create parser service**

Create `packages/ingestion/src/parser.ts`. Implement `LocalParseService.createLocalParseJob()` to append `ingestion.parse.job.created`; implement `completeTextParse()` to store text in the derivative blob store and append `ingestion.parse.completed`; implement `failParseJob()` to append `ingestion.parse.failed` with a secret-safe message.

- [ ] **Step 5: Export and run targeted tests**

Modify `packages/ingestion/src/index.ts` to export `./parser.js`, then run:

```bash
npm test -- packages/ingestion/test/parser.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification and commit**

Run:

```bash
npm run verify
git add docs/agentic/claims/task-9-local-parser-jobs.md packages/ingestion/src/parser.ts packages/ingestion/src/index.ts packages/ingestion/test/parser.test.ts
git commit -m "feat: add ingestion local parser jobs"
```

## Task 10: Add Provider Parser Approval Gate

**Files:**
- Create: `docs/agentic/claims/task-10-provider-parser-gate.md`
- Create: `packages/ingestion/src/provider-adapter.ts`
- Create: `packages/ingestion/test/provider-adapter.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-10-provider-parser-gate.md`.

- [ ] **Step 2: Write failing provider tests**

Create `packages/ingestion/test/provider-adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { FakeDocumentAiProvider, ProviderParseApprovalService } from "../src/provider-adapter.js";

describe("provider parser approval gate", () => {
  it("records batch approval before provider parsing is allowed", async () => {
    const ledger = new InMemoryEventLedger();
    const approvals = new ProviderParseApprovalService({
      ledger,
      actor: { id: "actor_investigator", kind: "human" as const, label: "Investigator" }
    });

    const event = await approvals.approveProviderBatch({
      providerJobId: "provider_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      provider: { name: "mistral-document-ai", version: "0.1.0" },
      approvedBy: "actor_investigator",
      eligibleMediaTypes: ["application/pdf"],
      maxBytesPerFile: 50000000
    });

    expect(event.type).toBe("ingestion.provider.approved");
    expect(JSON.stringify(event)).not.toMatch(/token|secret|password/i);
  });

  it("fake provider parses only technically eligible files", async () => {
    const provider = new FakeDocumentAiProvider({
      name: "mistral-document-ai",
      supportedMediaTypes: ["application/pdf"],
      maxBytesPerFile: 10
    });

    await expect(provider.parse({
      evidenceId: "ev_pdf",
      mediaType: "application/pdf",
      content: Buffer.from("12345")
    })).resolves.toMatchObject({ text: "fake parsed text for ev_pdf" });

    await expect(provider.parse({
      evidenceId: "ev_big",
      mediaType: "application/pdf",
      content: Buffer.from("12345678901")
    })).rejects.toThrow(/oversized/);
  });
});
```

- [ ] **Step 3: Run provider tests to verify they fail**

Run:

```bash
npm test -- packages/ingestion/test/provider-adapter.test.ts
```

Expected: failure resolving `../src/provider-adapter.js`.

- [ ] **Step 4: Create provider contract and fake**

Create `packages/ingestion/src/provider-adapter.ts` with:

```ts
export interface DocumentAiProvider {
  capabilities(): Promise<{ name: string; supportedMediaTypes: string[]; maxBytesPerFile: number }>;
  parse(input: { evidenceId: string; mediaType: string; content: Buffer }): Promise<{ text: string; warnings: string[] }>;
}
```

Add `ProviderParseApprovalService.approveProviderBatch()` that appends `ingestion.provider.approved`. Add `FakeDocumentAiProvider` that enforces media type and size eligibility.

- [ ] **Step 5: Export and run targeted tests**

Modify `packages/ingestion/src/index.ts` to export `./provider-adapter.js`, then run:

```bash
npm test -- packages/ingestion/test/provider-adapter.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification and commit**

Run:

```bash
npm run verify
git add docs/agentic/claims/task-10-provider-parser-gate.md packages/ingestion/src/provider-adapter.ts packages/ingestion/src/index.ts packages/ingestion/test/provider-adapter.test.ts
git commit -m "feat: add provider parser approval gate"
```

## Task 11: Add CLI Command Handlers

**Files:**
- Create: `docs/agentic/claims/task-11-ingestion-cli.md`
- Create: `packages/ingestion/src/cli.ts`
- Create: `packages/ingestion/bin/cestus-ingest.mjs`
- Create: `packages/ingestion/test/cli.test.ts`
- Modify: `package.json`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-11-ingestion-cli.md`.

- [ ] **Step 2: Write failing CLI tests**

Create `packages/ingestion/test/cli.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { handleIngestionCommand } from "../src/cli.js";

describe("ingestion CLI command handlers", () => {
  it("prints stable JSON for dry-run summaries", async () => {
    const output = await handleIngestionCommand({
      command: "summary-json",
      dto: {
        sourceCollectionId: "src_drive_001",
        latestScanBatchId: "scan_001",
        totals: { observedFiles: 1, uniqueContent: 1, duplicateOccurrences: 0, skipped: 0, bytes: 4, estimatedNewBlobBytes: 4 },
        approvalRequired: true,
        duplicateGroups: [],
        diagnostics: []
      }
    });

    expect(JSON.parse(output)).toEqual({
      sourceCollectionId: "src_drive_001",
      latestScanBatchId: "scan_001",
      totals: { observedFiles: 1, uniqueContent: 1, duplicateOccurrences: 0, skipped: 0, bytes: 4, estimatedNewBlobBytes: 4 },
      approvalRequired: true,
      duplicateGroups: [],
      diagnostics: []
    });
  });
});
```

- [ ] **Step 3: Run CLI test to verify it fails**

Run:

```bash
npm test -- packages/ingestion/test/cli.test.ts
```

Expected: failure resolving `../src/cli.js`.

- [ ] **Step 4: Create command handlers and executable wrapper**

Create `packages/ingestion/src/cli.ts` with pure command handlers for `summary-json`, `create-workspace`, `register-source`, `dry-run`, `approve-import`, `import`, `list-jobs`, `retry`, `approve-provider`, and `diagnostics`. For Task 11, only `summary-json` needs complete behavior; other commands should return a structured error object that says the command needs a runtime wiring object rather than using hidden globals.

Create `packages/ingestion/bin/cestus-ingest.mjs` as a thin Node executable that prints usage for `--help` and exits with a nonzero code for operational commands until runtime wiring is introduced by a separate task. Keep behavior tests against `src/cli.ts`.

Add a package script:

```json
"ingestion:help": "node packages/ingestion/bin/cestus-ingest.mjs --help"
```

- [ ] **Step 5: Export and run targeted tests**

Modify `packages/ingestion/src/index.ts` to export `./cli.js`, then run:

```bash
npm test -- packages/ingestion/test/cli.test.ts
```

Expected: targeted test passes.

- [ ] **Step 6: Run full verification and commit**

Run:

```bash
npm run verify
git add docs/agentic/claims/task-11-ingestion-cli.md package.json packages/ingestion/src/cli.ts packages/ingestion/bin/cestus-ingest.mjs packages/ingestion/src/index.ts packages/ingestion/test/cli.test.ts
git commit -m "feat: add ingestion cli contracts"
```

## Task 12: Add Ingestion UI DTO Components Without App Wiring

**Files:**
- Create: `docs/agentic/claims/task-12-ingestion-ui-components.md`
- Create: `packages/ui/src/ingestion/IngestionWorkspace.tsx`
- Create: `packages/ui/src/ingestion/ingestion-types.ts`
- Create: `packages/ui/test/ingestion-workspace.test.tsx`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-12-ingestion-ui-components.md`.

- [ ] **Step 2: Write failing UI component tests**

Create `packages/ui/test/ingestion-workspace.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IngestionWorkspace } from "../src/ingestion/IngestionWorkspace.js";

describe("IngestionWorkspace", () => {
  it("renders dry-run review, import gate, and provider gate state", () => {
    render(
      <IngestionWorkspace
        review={{
          sourceCollectionId: "src_drive_001",
          label: "External investigation archive",
          latestScanBatchId: "scan_001",
          totals: { observedFiles: 2, uniqueContent: 1, duplicateOccurrences: 1, skipped: 0, bytes: 8, estimatedNewBlobBytes: 4 },
          approvalRequired: true,
          duplicateGroups: [{ contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111", occurrenceCount: 2 }],
          diagnostics: []
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "Ingestion" })).toBeInTheDocument();
    expect(screen.getByText("External investigation archive")).toBeInTheDocument();
    expect(screen.getByText("2 observed files")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve raw import" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run UI test to verify it fails**

Run:

```bash
npm test -- packages/ui/test/ingestion-workspace.test.tsx
```

Expected: failure resolving `../src/ingestion/IngestionWorkspace.js`.

- [ ] **Step 4: Create UI types and component**

Create `packages/ui/src/ingestion/ingestion-types.ts`:

```ts
export interface IngestionReviewDto {
  sourceCollectionId: string;
  label: string;
  latestScanBatchId?: string;
  totals: {
    observedFiles: number;
    uniqueContent: number;
    duplicateOccurrences: number;
    skipped: number;
    bytes: number;
    estimatedNewBlobBytes: number;
  };
  approvalRequired: boolean;
  duplicateGroups: Array<{ contentHash: string; occurrenceCount: number }>;
  diagnostics: Array<{ severity: "info" | "warning" | "error"; message: string }>;
}
```

Create `packages/ui/src/ingestion/IngestionWorkspace.tsx` as a focused component that renders the review DTO, dry-run totals, duplicate count, diagnostics, and disabled approval buttons. Do not import runtime or Node modules.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ui/test/ingestion-workspace.test.tsx packages/ui/test/request-data-boundary.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification and commit**

Run:

```bash
npm run verify
git add docs/agentic/claims/task-12-ingestion-ui-components.md packages/ui/src/ingestion/IngestionWorkspace.tsx packages/ui/src/ingestion/ingestion-types.ts packages/ui/test/ingestion-workspace.test.tsx
git commit -m "feat: add ingestion workspace ui components"
```

## Task 13: Wire Main App Integration After Runtime Coordination

**Files:**
- Create: `docs/agentic/claims/task-13-ingestion-app-integration.md`
- Modify: `packages/ui/src/workspace/workspace-nav.ts`
- Modify: `packages/ui/src/App.tsx`
- Create: `packages/ui/test/ingestion-app-integration.test.tsx`

**Coordination Gate:** Do not start this task until the active PRR runtime thread has landed or the coordinator explicitly confirms that editing `packages/ui/src/App.tsx` is safe.

- [ ] **Step 1: Claim the task after the coordination gate is satisfied**

Create and commit `docs/agentic/claims/task-13-ingestion-app-integration.md`. Include the coordination evidence in the claim.

- [ ] **Step 2: Write failing app integration test**

Create `packages/ui/test/ingestion-app-integration.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("ingestion app integration", () => {
  it("exposes the ingestion workspace in the main app", () => {
    render(<App />);
    expect(screen.getByText("Ingestion")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run app integration test to verify it fails**

Run:

```bash
npm test -- packages/ui/test/ingestion-app-integration.test.tsx
```

Expected: failure because the ingestion workspace is not wired into the app.

- [ ] **Step 4: Wire navigation and app view**

Modify `packages/ui/src/workspace/workspace-nav.ts` to include an ingestion module item. Modify `packages/ui/src/App.tsx` to render `IngestionWorkspace` with a deterministic placeholder DTO until local runtime wiring provides real ingestion data. Keep this change minimal and do not touch request adapter or local runtime files.

- [ ] **Step 5: Run targeted UI tests**

Run:

```bash
npm test -- packages/ui/test/ingestion-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/request-data-boundary.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 6: Run full verification and commit**

Run:

```bash
npm run verify
git add docs/agentic/claims/task-13-ingestion-app-integration.md packages/ui/src/workspace/workspace-nav.ts packages/ui/src/App.tsx packages/ui/test/ingestion-app-integration.test.tsx
git commit -m "feat: wire ingestion workspace into app"
```

## Task 14: Add Factory Readiness For Ingestion Plan

**Files:**
- Create: `docs/agentic/claims/task-14-ingestion-factory-readiness.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-14-ingestion-factory-readiness.md`.

- [ ] **Step 2: Write failing readiness expectation**

Modify `scripts/check-agent-readiness.mjs` to add these required files to `requiredFiles`:

```js
"docs/superpowers/specs/2026-07-05-public-ingestion-pipeline-design.md",
"docs/superpowers/plans/2026-07-05-public-ingestion-pipeline-implementation.md"
```

Run:

```bash
npm run factory:check
```

Expected: pass if both files exist; fail if the paths were mistyped.

- [ ] **Step 3: Record readiness evidence**

Append an "Public Ingestion Pipeline Plan Readiness" section to `docs/agentic/software-factory.md` with:

- spec path
- plan path
- targeted command evidence from the completed task set
- `npm run verify` evidence
- note that provider live checks are opt-in and not part of standard verification

- [ ] **Step 4: Run validation**

Run:

```bash
git diff --check
npm run factory:check
npm run verify
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/agentic/claims/task-14-ingestion-factory-readiness.md scripts/check-agent-readiness.mjs docs/agentic/software-factory.md
git commit -m "docs: record ingestion factory readiness"
```

## Completion Criteria

The ingestion slice is complete when:

- All task claims are committed and end in `ready-for-review`, `merged`, or final documented handoff state.
- `packages/ingestion` exposes source registry, workspace, dry-run scan, archive expansion, import, projection, read API, parser, provider gate, and CLI contracts.
- Raw import requires approval before evidence creation.
- Provider parsing requires approval before outbound parsing.
- Duplicate content creates one canonical evidence item with multiple occurrences.
- Refresh behavior preserves changed and missing path observations without deletion.
- Archive children are ingested as evidence candidates with container provenance, while transport containers are not default evidence.
- Local parse jobs create derivative outputs without accepted ontology facts.
- Main-app UI integration is completed only after the coordination gate is satisfied.
- `npm run verify` passes.
- Factory readiness includes the ingestion spec and plan.
- Reviewers find no blocking defects, missing tests, spec drift, invariant violations, or verification gaps.
