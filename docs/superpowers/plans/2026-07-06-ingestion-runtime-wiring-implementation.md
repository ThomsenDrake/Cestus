# Ingestion Runtime Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the ingestion domain package into live local runtime, CLI, HTTP, and UI workflows while preserving portable workspace delegation, explicit approvals, stale-source verification, and browser-safe UI boundaries.

**Architecture:** Add a single `IngestionRuntime` orchestration boundary inside `packages/ingestion`; it consumes an injected mounted workspace contract and composes existing ingestion services. CLI, HTTP, and UI become adapters over that runtime and must not invent workflow or storage semantics. The local runtime host adds ingestion routes beside PRR routes, but workspace resolution remains delegated to the mount contract.

**Tech Stack:** TypeScript, Node.js 26, Vitest, Zod, existing ontology ledger/blob store, existing ingestion domain services, existing local-runtime HTTP handler, React 19, Vite, Testing Library.

---

## Required Reading

Before editing in any task, read:

1. `AGENTS.md`
2. `.agents/skills/cestus-software-factory/SKILL.md`
3. `docs/agentic/software-factory.md`
4. `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
5. `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
6. `docs/superpowers/specs/2026-07-05-public-ingestion-pipeline-design.md`
7. `docs/superpowers/plans/2026-07-05-public-ingestion-pipeline-implementation.md`
8. `docs/superpowers/specs/2026-07-05-durable-local-prr-runtime-design.md`
9. `docs/superpowers/specs/2026-07-06-ingestion-runtime-wiring-design.md`
10. This plan
11. Existing claim files for ingestion and local-runtime task areas before claiming a task

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
9. Run the targeted command again and confirm it passes.
10. Run `npm run verify`.
11. Commit only the task files plus the task claim.
12. Hand off to spec review and code-quality review before starting the next dependent task.

Stop on data-loss risk, schema conflict, portable workspace contract conflict, unavailable dependency, credential need, external-service dependency, browser import of Node-only runtime/storage modules, provider byte transfer without approval, or repeated verifier failure after two focused repair attempts.

## File Structure

- `packages/ingestion/src/mount-contract.ts`: ingestion-facing mounted workspace and mount resolver interfaces; no path resolution implementation.
- `packages/ingestion/src/runtime-types.ts`: stable runtime inputs, result envelopes, DTOs, error codes, and repair-action shapes.
- `packages/ingestion/src/source-materializer.ts`: source-byte materialization and stale-source verification helpers for regular files and archive children.
- `packages/ingestion/src/runtime.ts`: `createIngestionRuntime` and workflow orchestration over existing ingestion services.
- `packages/ingestion/src/cli.ts`: CLI command handling that delegates mount resolution and calls `IngestionRuntime`.
- `packages/ingestion/bin/cestus-ingest.mjs`: thin executable wrapper for `cestus ingest ...` ergonomics.
- `packages/local-runtime/src/ingestion-runtime-factory.ts`: adapter from resolved mount contract to ingestion runtime.
- `packages/local-runtime/src/ingestion-http-routes.ts`: transport-only route handlers for `/api/ingestion/*`.
- `packages/local-runtime/src/http-handler.ts`: dispatches ingestion routes beside PRR routes.
- `packages/ui/src/ingestion/ingestion-adapter.ts`: browser-safe HTTP adapter and static test adapter.
- `packages/ui/src/ingestion/ingestion-types.ts`: browser DTO and input types only.
- `packages/ui/src/ingestion/IngestionWorkspace.tsx`: live ingestion UI surface and action callbacks.
- `packages/ui/src/App.tsx`: injects the HTTP ingestion adapter by default.
- `packages/*/test/*.test.ts`: focused runtime, CLI, HTTP, UI adapter, app, and boundary tests.
- `scripts/check-agent-readiness.mjs`: adds the approved spec and this plan to required files.
- `docs/agentic/software-factory.md`: records final readiness evidence after implementation.

## Task 1: Add Mounted Workspace And Runtime Result Contracts

**Files:**
- Create: `docs/agentic/claims/task-1-ingestion-runtime-contracts.md`
- Create: `packages/ingestion/src/mount-contract.ts`
- Create: `packages/ingestion/src/runtime-types.ts`
- Create: `packages/ingestion/test/runtime-contracts.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-ingestion-runtime-contracts.md` with:

```md
# Task 1 Claim: Ingestion Runtime Contracts

- Plan: `docs/superpowers/plans/2026-07-06-ingestion-runtime-wiring-implementation.md`
- Task: Task 1, Add Mounted Workspace And Runtime Result Contracts
- Worker: record the executing agent identity before committing this claim
- Branch: record the active task branch before committing this claim
- Worktree: record the absolute worktree path before committing this claim
- Claimed at: record the current UTC timestamp before committing this claim
- Status: claimed

## Owned Files

- `docs/agentic/claims/task-1-ingestion-runtime-contracts.md`
- `packages/ingestion/src/mount-contract.ts`
- `packages/ingestion/src/runtime-types.ts`
- `packages/ingestion/test/runtime-contracts.test.ts`
- `packages/ingestion/src/index.ts`
```

Commit the claim:

```bash
git add docs/agentic/claims/task-1-ingestion-runtime-contracts.md
git commit -m "chore: claim ingestion runtime contracts"
```

- [ ] **Step 2: Mark the claim in progress**

Update the claim status to `in-progress`. Do not commit this status update until the task implementation commit.

- [ ] **Step 3: Write the failing contract tests**

Create `packages/ingestion/test/runtime-contracts.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import {
  ingestionErrorCodes,
  mountedWorkspaceCapabilities,
  stableIngestionError,
  type IngestionRuntimeResult,
  type MountedWorkspace
} from "../src/index.js";

describe("ingestion runtime contracts", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exports the stable error codes required by runtime, CLI, HTTP, and UI adapters", () => {
    expect(ingestionErrorCodes).toEqual([
      "INGESTION_WORKSPACE_NOT_MOUNTED",
      "INGESTION_WORKSPACE_NOT_WRITABLE",
      "INGESTION_SOURCE_NOT_REGISTERED",
      "INGESTION_SCAN_REQUIRED",
      "INGESTION_IMPORT_APPROVAL_REQUIRED",
      "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL",
      "INGESTION_ARCHIVE_CHILD_HASH_MISMATCH",
      "INGESTION_PROVIDER_APPROVAL_REQUIRED",
      "INGESTION_PROVIDER_SEND_NOT_PERMITTED",
      "INGESTION_JOB_NOT_RETRYABLE",
      "INGESTION_HTTP_STORAGE_PATH_FORBIDDEN",
      "INGESTION_COMMAND_UNSUPPORTED",
      "INGESTION_RUNTIME_INTERNAL"
    ]);
  });

  it("creates secret-safe stable error envelopes", () => {
    const result: IngestionRuntimeResult<never> = stableIngestionError({
      code: "INGESTION_WORKSPACE_NOT_MOUNTED",
      message: "Portable workspace is not mounted.",
      allowedRepairActions: ["mount the portable workspace", "retry the command"]
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INGESTION_WORKSPACE_NOT_MOUNTED",
        message: "Portable workspace is not mounted.",
        allowedRepairActions: ["mount the portable workspace", "retry the command"],
        diagnostics: []
      }
    });
  });

  it("keeps mounted workspace capabilities explicit and storage-agnostic", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "cestus-mounted-workspace-"));
    tempDirs.push(rootDir);
    const workspace = {
      workspaceId: "ws_runtime_001",
      label: "Mounted runtime workspace",
      ledger: new InMemoryEventLedger(),
      blobStore: new FileBlobStore(join(rootDir, "blobs")),
      derivativeStore: new FileBlobStore(join(rootDir, "derivatives")),
      jobStateRoot: join(rootDir, "jobs"),
      capabilities: mountedWorkspaceCapabilities({
        canReadLedger: true,
        canAppendLedger: true,
        canWriteBlobs: true,
        canWriteDerivatives: true,
        canWriteJobState: true
      })
    } satisfies MountedWorkspace;

    expect(workspace.capabilities.canWriteBlobs).toBe(true);
    expect(JSON.stringify(workspace)).not.toMatch(/token|secret|password/i);
  });
});
```

- [ ] **Step 4: Run the targeted test to verify it fails**

Run:

```bash
npm test -- packages/ingestion/test/runtime-contracts.test.ts
```

Expected: failure because `mountedWorkspaceCapabilities`, `stableIngestionError`, and the runtime contract exports do not exist.

- [ ] **Step 5: Add mount and runtime type contracts**

Create `packages/ingestion/src/mount-contract.ts`:

```ts
import type { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";

export interface MountedWorkspaceCapabilities {
  readonly canReadLedger: boolean;
  readonly canAppendLedger: boolean;
  readonly canWriteBlobs: boolean;
  readonly canWriteDerivatives: boolean;
  readonly canWriteJobState: boolean;
}

export interface MountedWorkspace {
  readonly workspaceId: string;
  readonly label: string;
  readonly ledger: EventLedger;
  readonly blobStore: FileBlobStore;
  readonly derivativeStore: FileBlobStore;
  readonly jobStateRoot: string;
  readonly diagnosticsRoot?: string;
  readonly projectionCacheRoot?: string;
  readonly capabilities: MountedWorkspaceCapabilities;
}

export interface IngestionMountRequest {
  readonly workspaceRoot?: string;
  readonly env?: Record<string, string | undefined>;
}

export type IngestionMountResult =
  | { readonly ok: true; readonly workspace: MountedWorkspace }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "INGESTION_WORKSPACE_NOT_MOUNTED" | "INGESTION_WORKSPACE_NOT_WRITABLE";
        readonly message: string;
        readonly allowedRepairActions: readonly string[];
      };
    };

export interface IngestionWorkspaceMountResolver {
  resolve(request: IngestionMountRequest): Promise<IngestionMountResult>;
}

export function mountedWorkspaceCapabilities(
  capabilities: MountedWorkspaceCapabilities
): MountedWorkspaceCapabilities {
  return Object.freeze({ ...capabilities });
}
```

Create `packages/ingestion/src/runtime-types.ts`:

```ts
import type { IngestionReviewDto } from "./read-api.js";

export const ingestionErrorCodes = [
  "INGESTION_WORKSPACE_NOT_MOUNTED",
  "INGESTION_WORKSPACE_NOT_WRITABLE",
  "INGESTION_SOURCE_NOT_REGISTERED",
  "INGESTION_SCAN_REQUIRED",
  "INGESTION_IMPORT_APPROVAL_REQUIRED",
  "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL",
  "INGESTION_ARCHIVE_CHILD_HASH_MISMATCH",
  "INGESTION_PROVIDER_APPROVAL_REQUIRED",
  "INGESTION_PROVIDER_SEND_NOT_PERMITTED",
  "INGESTION_JOB_NOT_RETRYABLE",
  "INGESTION_HTTP_STORAGE_PATH_FORBIDDEN",
  "INGESTION_COMMAND_UNSUPPORTED",
  "INGESTION_RUNTIME_INTERNAL"
] as const;

export type IngestionErrorCode = typeof ingestionErrorCodes[number];

export interface IngestionRuntimeError {
  readonly code: IngestionErrorCode;
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
  readonly diagnostics: readonly IngestionRuntimeDiagnosticDto[];
}

export interface IngestionRuntimeDiagnosticDto {
  readonly diagnosticId?: string;
  readonly severity: "info" | "warning" | "error";
  readonly category: string;
  readonly message: string;
}

export type IngestionRuntimeResult<T> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly error: IngestionRuntimeError };

export interface IngestionWorkspaceDto {
  readonly mounted: boolean;
  readonly workspaceId?: string;
  readonly label?: string;
  readonly capabilities?: {
    readonly canReadLedger: boolean;
    readonly canAppendLedger: boolean;
    readonly canWriteBlobs: boolean;
    readonly canWriteDerivatives: boolean;
    readonly canWriteJobState: boolean;
  };
  readonly review?: IngestionReviewDto;
  readonly diagnostics: readonly IngestionRuntimeDiagnosticDto[];
}

export interface IngestionActionResult {
  readonly review: IngestionReviewDto;
  readonly eventIds: readonly string[];
}

export interface IngestionScanResultDto extends IngestionActionResult {
  readonly scanBatchId: string;
  readonly inventoryHash: string;
}

export interface IngestionImportResultDto extends IngestionActionResult {
  readonly importBatchId: string;
  readonly totals: {
    readonly evidenceCreated: number;
    readonly occurrencesLinked: number;
    readonly duplicatesReused: number;
    readonly skipped: number;
  };
}

export interface IngestionJobListDto {
  readonly jobs: readonly IngestionJobDto[];
}

export interface IngestionJobDto {
  readonly jobId: string;
  readonly kind: "scan" | "import" | "local-parse" | "provider-parse";
  readonly state: "queued" | "running" | "succeeded" | "failed" | "skipped";
  readonly retryable: boolean;
  readonly sourceCollectionId?: string;
  readonly scanBatchId?: string;
  readonly importBatchId?: string;
  readonly evidenceId?: string;
  readonly diagnosticIds: readonly string[];
}

export interface IngestionDiagnosticsDto {
  readonly diagnostics: readonly IngestionRuntimeDiagnosticDto[];
}

export function stableIngestionError(input: {
  readonly code: IngestionErrorCode;
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
  readonly diagnostics?: readonly IngestionRuntimeDiagnosticDto[];
}): IngestionRuntimeResult<never> {
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code: input.code,
      message: input.message,
      allowedRepairActions: Object.freeze([...input.allowedRepairActions]),
      diagnostics: Object.freeze([...(input.diagnostics ?? [])])
    })
  });
}
```

Modify `packages/ingestion/src/index.ts`:

```ts
export const ingestionPackageName = "@cestus/ingestion";
export * from "./types.js";
export * from "./workspace.js";
export * from "./source-registry.js";
export * from "./local-filesystem.js";
export * from "./archive-adapter.js";
export * from "./import-service.js";
export * from "./projection.js";
export * from "./read-api.js";
export * from "./cli.js";
export * from "./parser.js";
export * from "./provider-adapter.js";
export * from "./mount-contract.js";
export * from "./runtime-types.js";
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/ingestion/test/runtime-contracts.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add docs/agentic/claims/task-1-ingestion-runtime-contracts.md packages/ingestion/src/mount-contract.ts packages/ingestion/src/runtime-types.ts packages/ingestion/src/index.ts packages/ingestion/test/runtime-contracts.test.ts
git commit -m "feat: add ingestion runtime contracts"
```

## Task 2: Add Core Ingestion Runtime Orchestration

**Files:**
- Create: `docs/agentic/claims/task-2-ingestion-runtime-core.md`
- Create: `packages/ingestion/src/runtime.ts`
- Create: `packages/ingestion/test/runtime-test-helpers.ts`
- Create: `packages/ingestion/test/runtime.test.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-ingestion-runtime-core.md` with this task's owned files and status `claimed`. Then change status to `in-progress` before test edits.

- [ ] **Step 2: Write failing runtime tests**

Create `packages/ingestion/test/runtime-test-helpers.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { mountedWorkspaceCapabilities, type MountedWorkspace } from "../src/mount-contract.js";

export function createFakeMountedWorkspace(label = "Runtime test workspace"): MountedWorkspace & {
  ledger: InMemoryEventLedger;
  blobStore: FileBlobStore;
  derivativeStore: FileBlobStore;
  rootDir: string;
} {
  const rootDir = mkdtempSync(join(tmpdir(), "cestus-ingestion-runtime-"));
  return {
    workspaceId: "ws_runtime_001",
    label,
    rootDir,
    ledger: new InMemoryEventLedger(),
    blobStore: new FileBlobStore(join(rootDir, "blobs")),
    derivativeStore: new FileBlobStore(join(rootDir, "derivatives")),
    jobStateRoot: join(rootDir, "jobs"),
    capabilities: mountedWorkspaceCapabilities({
      canReadLedger: true,
      canAppendLedger: true,
      canWriteBlobs: true,
      canWriteDerivatives: true,
      canWriteJobState: true
    })
  };
}
```

Create `packages/ingestion/test/runtime.test.ts`:

```ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIngestionRuntime } from "../src/runtime.js";
import { createFakeMountedWorkspace } from "./runtime-test-helpers.js";

const actor = { id: "actor_runtime_test", kind: "human" as const, label: "Runtime Test" };
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("IngestionRuntime core workflows", () => {
  it("reports unmounted workspaces without appending events", async () => {
    const runtime = createIngestionRuntime({ mountedWorkspace: undefined, actor });

    const result = await runtime.dryRunScan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_WORKSPACE_NOT_MOUNTED" }
    });
  });

  it("registers a source, runs a dry-run scan, and returns a review DTO from ledger projection", async () => {
    const workspace = createFakeMountedWorkspace();
    roots.push(workspace.rootDir);
    const sourceRoot = join(workspace.rootDir, "source");
    mkdirSync(sourceRoot, { recursive: true });
    writeFileSync(join(sourceRoot, "a.txt"), "alpha");
    const runtime = createIngestionRuntime({ mountedWorkspace: workspace, actor });

    const registered = await runtime.registerSource({
      sourceCollectionId: "src_drive_001",
      label: "Old archive",
      rootUri: `file://${sourceRoot}`,
      sourceRoot
    });
    const scanned = await runtime.dryRunScan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001"
    });

    expect(registered.ok).toBe(true);
    expect(scanned).toMatchObject({
      ok: true,
      scanBatchId: "scan_001",
      review: {
        sourceCollectionId: "src_drive_001",
        latestScanBatchId: "scan_001",
        totals: { observedFiles: 1, uniqueContent: 1 }
      }
    });
    expect((await workspace.ledger.readAll()).map((event) => event.type)).toEqual([
      "ingestion.source.registered",
      "ingestion.scan.started",
      "ingestion.occurrence.observed",
      "ingestion.scan.completed"
    ]);
  });

  it("requires source registration before dry-run scans", async () => {
    const workspace = createFakeMountedWorkspace();
    roots.push(workspace.rootDir);
    const runtime = createIngestionRuntime({ mountedWorkspace: workspace, actor });

    const result = await runtime.dryRunScan({
      sourceCollectionId: "src_missing",
      scanBatchId: "scan_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_SOURCE_NOT_REGISTERED" }
    });
    expect(await workspace.ledger.readAll()).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the targeted test to verify it fails**

Run:

```bash
npm test -- packages/ingestion/test/runtime.test.ts
```

Expected: failure resolving `../src/runtime.js`.

- [ ] **Step 4: Add core runtime orchestration**

Create `packages/ingestion/src/runtime.ts` with:

```ts
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import { actorRefSchema } from "../../ontology/src/contracts.js";
import { buildIngestionProjection } from "./projection.js";
import { buildIngestionReviewDto } from "./read-api.js";
import { IngestionSourceRegistry } from "./source-registry.js";
import { LocalFilesystemScanner } from "./local-filesystem.js";
import type { MountedWorkspace } from "./mount-contract.js";
import { stableIngestionError, type IngestionRuntimeResult } from "./runtime-types.js";

type ActorRef = z.infer<typeof actorRefSchema>;

export interface CreateIngestionRuntimeInput {
  readonly mountedWorkspace?: MountedWorkspace;
  readonly actor: ActorRef;
}

export interface RegisterSourceInput {
  readonly sourceCollectionId: string;
  readonly label: string;
  readonly rootUri: string;
  readonly sourceRoot: string;
}

export interface DryRunScanInput {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
}

export function createIngestionRuntime(input: CreateIngestionRuntimeInput) {
  return {
    async registerSource(command: RegisterSourceInput): Promise<IngestionRuntimeResult<{ review: ReturnType<typeof buildIngestionReviewDto>; eventIds: string[] }>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "write");
      if (!workspace.ok) {
        return workspace;
      }

      const registry = new IngestionSourceRegistry({ ledger: workspace.workspace.ledger, actor: input.actor });
      const event = await registry.registerLocalSource({
        sourceCollectionId: command.sourceCollectionId,
        label: command.label,
        rootUri: command.rootUri,
        workspaceUri: `cestus-workspace://${workspace.workspace.workspaceId}`
      });

      return {
        ok: true,
        review: await reviewFor(workspace.workspace, command.sourceCollectionId),
        eventIds: [event.id]
      };
    },

    async dryRunScan(command: DryRunScanInput): Promise<IngestionRuntimeResult<{ scanBatchId: string; inventoryHash: string; review: ReturnType<typeof buildIngestionReviewDto>; eventIds: string[] }>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "write");
      if (!workspace.ok) {
        return workspace;
      }
      const source = await sourceFor(workspace.workspace, command.sourceCollectionId);
      if (source === undefined) {
        return stableIngestionError({
          code: "INGESTION_SOURCE_NOT_REGISTERED",
          message: `Source collection ${command.sourceCollectionId} is not registered.`,
          allowedRepairActions: ["register the source collection", "retry dry-run"]
        });
      }

      const before = await workspace.workspace.ledger.readAll();
      const scanner = new LocalFilesystemScanner({ ledger: workspace.workspace.ledger, actor: input.actor });
      const result = await scanner.scan({
        sourceCollectionId: command.sourceCollectionId,
        scanBatchId: command.scanBatchId,
        rootDir: fileURLToPath(source.rootUri)
      });
      const after = await workspace.workspace.ledger.readAll();

      return {
        ok: true,
        scanBatchId: result.scanBatchId,
        inventoryHash: result.inventoryHash,
        review: await reviewFor(workspace.workspace, command.sourceCollectionId),
        eventIds: after.slice(before.length).map((event) => event.id)
      };
    }
  };
}

async function reviewFor(workspace: MountedWorkspace, sourceCollectionId: string) {
  return buildIngestionReviewDto(buildIngestionProjection(await workspace.ledger.readAll()), sourceCollectionId);
}

async function sourceFor(workspace: MountedWorkspace, sourceCollectionId: string) {
  return buildIngestionProjection(await workspace.ledger.readAll()).sources.get(sourceCollectionId);
}

function requireMountedWorkspace(workspace: MountedWorkspace | undefined, mode: "read" | "write"): IngestionRuntimeResult<{ workspace: MountedWorkspace }> {
  if (workspace === undefined) {
    return stableIngestionError({
      code: "INGESTION_WORKSPACE_NOT_MOUNTED",
      message: "Portable workspace is not mounted.",
      allowedRepairActions: ["mount the portable workspace", "retry the ingestion action"]
    });
  }
  if (mode === "write" && (!workspace.capabilities.canAppendLedger || !workspace.capabilities.canWriteJobState)) {
    return stableIngestionError({
      code: "INGESTION_WORKSPACE_NOT_WRITABLE",
      message: "Mounted workspace is not writable for ingestion.",
      allowedRepairActions: ["remount the workspace read-write", "retry the ingestion action"]
    });
  }
  return { ok: true, workspace };
}
```

Modify `packages/ingestion/src/index.ts` to export `./runtime.js`.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ingestion/test/runtime-contracts.test.ts packages/ingestion/test/runtime.test.ts
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
git add docs/agentic/claims/task-2-ingestion-runtime-core.md packages/ingestion/src/runtime.ts packages/ingestion/src/index.ts packages/ingestion/test/runtime-test-helpers.ts packages/ingestion/test/runtime.test.ts
git commit -m "feat: add ingestion runtime core"
```

## Task 3: Add Stale-Source Verification Before Import Writes

**Files:**
- Create: `docs/agentic/claims/task-3-ingestion-stale-source-verification.md`
- Create: `packages/ingestion/src/source-materializer.ts`
- Create: `packages/ingestion/test/runtime-import-stale-source.test.ts`
- Modify: `packages/ingestion/src/runtime.ts`
- Modify: `packages/ingestion/src/index.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-ingestion-stale-source-verification.md` with this task's owned files and status `claimed`. Then set status to `in-progress`.

- [ ] **Step 2: Write failing stale-source tests**

Create `packages/ingestion/test/runtime-import-stale-source.test.ts`:

```ts
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { createIngestionRuntime } from "../src/runtime.js";
import { createFakeMountedWorkspace } from "./runtime-test-helpers.js";

const actor = { id: "actor_import_safety", kind: "human" as const, label: "Import Safety" };
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("IngestionRuntime stale-source import verification", () => {
  it("raw import approval records approval only and writes no blobs", async () => {
    const { workspace, runtime } = await preparedRuntime({ "a.txt": "alpha" });

    const approved = await runtime.approveRawImport({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001",
      approvedBy: "actor_investigator"
    });

    expect(approved).toMatchObject({ ok: true, review: { latestImportBatchId: "imp_001" } });
    expect((await workspace.ledger.readAll()).map((event) => event.type)).toEqual([
      "ingestion.source.registered",
      "ingestion.scan.started",
      "ingestion.occurrence.observed",
      "ingestion.scan.completed",
      "ingestion.import.approved"
    ]);
    expect(readdirSync(join(workspace.rootDir, "blobs"), { recursive: true })).toEqual([]);
  });

  it("rejects changed regular files before blob writes", async () => {
    const { workspace, runtime, sourceRoot } = await preparedRuntime({ "a.txt": "alpha" });
    await approve(runtime);
    writeFileSync(join(sourceRoot, "a.txt"), "changed");

    const result = await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL" }
    });
    expect((await workspace.ledger.readAll()).some((event) => event.type === "evidence.ingested")).toBe(false);
    expect(readdirSync(join(workspace.rootDir, "blobs"), { recursive: true })).toEqual([]);
  });

  it("rejects missing regular files before blob writes", async () => {
    const { workspace, runtime, sourceRoot } = await preparedRuntime({ "a.txt": "alpha" });
    await approve(runtime);
    rmSync(join(sourceRoot, "a.txt"));

    const result = await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL" }
    });
    expect((await workspace.ledger.readAll()).some((event) => event.type === "evidence.ingested")).toBe(false);
  });

  it("rejects changed archive container hashes before blob writes", async () => {
    const { workspace, runtime, sourceRoot } = await preparedRuntimeWithArchive({ "folder/a.txt": "alpha" });
    await approve(runtime);
    writeFileSync(join(sourceRoot, "bundle.zip"), Buffer.from(zipSync({ "folder/a.txt": strToU8("alpha"), "extra.txt": strToU8("extra") })));

    const result = await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_ARCHIVE_CHILD_HASH_MISMATCH" }
    });
    expect((await workspace.ledger.readAll()).some((event) => event.type === "evidence.ingested")).toBe(false);
  });

  it("rejects changed archive child hashes before blob writes", async () => {
    const { workspace, runtime, sourceRoot } = await preparedRuntimeWithArchive({ "folder/a.txt": "alpha" });
    await approve(runtime);
    writeFileSync(join(sourceRoot, "bundle.zip"), Buffer.from(zipSync({ "folder/a.txt": strToU8("changed") })));

    const result = await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_ARCHIVE_CHILD_HASH_MISMATCH" }
    });
    expect((await workspace.ledger.readAll()).some((event) => event.type === "evidence.ingested")).toBe(false);
  });
});

async function preparedRuntime(files: Record<string, string | Buffer>) {
  const workspace = createFakeMountedWorkspace();
  roots.push(workspace.rootDir);
  const sourceRoot = join(workspace.rootDir, "source");
  mkdirSync(sourceRoot, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(join(sourceRoot, path), content);
  }
  const runtime = createIngestionRuntime({ mountedWorkspace: workspace, actor });
  await runtime.registerSource({
    sourceCollectionId: "src_drive_001",
    label: "Old archive",
    rootUri: `file://${sourceRoot}`,
    sourceRoot
  });
  await runtime.dryRunScan({ sourceCollectionId: "src_drive_001", scanBatchId: "scan_001" });
  return { workspace, runtime, sourceRoot };
}

async function preparedRuntimeWithArchive(entries: Record<string, string>) {
  const zipped = Object.fromEntries(Object.entries(entries).map(([path, content]) => [path, strToU8(content)]));
  return preparedRuntime({ "bundle.zip": Buffer.from(zipSync(zipped)) });
}

async function approve(runtime: ReturnType<typeof createIngestionRuntime>) {
  await runtime.approveRawImport({
    sourceCollectionId: "src_drive_001",
    scanBatchId: "scan_001",
    importBatchId: "imp_001",
    approvedBy: "actor_investigator"
  });
}
```

- [ ] **Step 3: Run the targeted test to verify it fails**

Run:

```bash
npm test -- packages/ingestion/test/runtime-import-stale-source.test.ts
```

Expected: failure because `approveRawImport`, `importApproved`, and source materialization are not implemented.

- [ ] **Step 4: Add source materialization helpers**

Create `packages/ingestion/src/source-materializer.ts` with exported helpers that:

- read current regular-file bytes by source path
- re-expand zip containers using `ZipArchiveAdapter`
- find archive children by `internalPath`
- compare current content hash, container hash, and child hash against projected occurrence payloads
- return materialized import occurrences only when all approved occurrences match
- return `INGESTION_SOURCE_CHANGED_SINCE_APPROVAL` or `INGESTION_ARCHIVE_CHILD_HASH_MISMATCH` before blob writes when mismatches occur

The main exported shape:

```ts
export interface MaterializedImportOccurrence {
  readonly occurrenceId: string;
  readonly content: Buffer;
  readonly sourcePath: string;
  readonly mediaType: string;
}

export interface MaterializeApprovedOccurrencesInput {
  readonly sourceRoot: string;
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly importBatchId: string;
  readonly occurrences: readonly IngestionOccurrenceSummary[];
}

export type MaterializeApprovedOccurrencesResult =
  | { readonly ok: true; readonly occurrences: readonly MaterializedImportOccurrence[] }
  | { readonly ok: false; readonly error: IngestionRuntimeResult<never>["error"] };
```

- [ ] **Step 5: Wire approval and import into runtime**

Modify `packages/ingestion/src/runtime.ts` so:

- `approveRawImport` verifies scan completion and calls `IngestionImportService.approveImport`
- `approveRawImport` returns updated review DTO and event IDs
- `approveRawImport` never calls `blobStore.put`
- `importApproved` verifies import approval exists
- `importApproved` rebuilds approved occurrences from projection
- `importApproved` calls `materializeApprovedOccurrences`
- `importApproved` returns mismatch errors before constructing `IngestionImportService.importApprovedOccurrences`
- `importApproved` calls `IngestionImportService.importApprovedOccurrences` only after materialization succeeds

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/ingestion/test/runtime.test.ts packages/ingestion/test/runtime-import-stale-source.test.ts packages/ingestion/test/import-service.test.ts packages/ingestion/test/archive-adapter.test.ts
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
git add docs/agentic/claims/task-3-ingestion-stale-source-verification.md packages/ingestion/src/source-materializer.ts packages/ingestion/src/runtime.ts packages/ingestion/src/index.ts packages/ingestion/test/runtime-import-stale-source.test.ts
git commit -m "feat: verify ingestion import source bytes"
```

## Task 4: Add Runtime Jobs, Retry, Provider Approval, And Diagnostics

**Files:**
- Create: `docs/agentic/claims/task-4-ingestion-runtime-jobs-provider.md`
- Create: `packages/ingestion/test/runtime-jobs-provider.test.ts`
- Modify: `packages/ingestion/src/runtime.ts`
- Modify: `packages/ingestion/src/runtime-types.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-4-ingestion-runtime-jobs-provider.md` with this task's owned files and status `claimed`. Then set status to `in-progress`.

- [ ] **Step 2: Write failing jobs and provider tests**

Create `packages/ingestion/test/runtime-jobs-provider.test.ts`:

```ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIngestionRuntime } from "../src/runtime.js";
import { createFakeMountedWorkspace } from "./runtime-test-helpers.js";

const actor = { id: "actor_jobs_provider", kind: "human" as const, label: "Jobs Provider" };
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("IngestionRuntime jobs, retry, provider approval, and diagnostics", () => {
  it("lists scan, import, and parse jobs from rebuildable projection state", async () => {
    const { runtime } = await preparedRuntime();

    await runtime.approveRawImport({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001",
      approvedBy: "actor_investigator"
    });
    await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });
    const jobs = await runtime.listJobs({ sourceCollectionId: "src_drive_001" });

    expect(jobs).toMatchObject({
      ok: true,
      jobs: expect.arrayContaining([
        expect.objectContaining({ kind: "scan", jobId: "scan_001", state: "succeeded" }),
        expect.objectContaining({ kind: "import", jobId: "imp_001", state: "succeeded" })
      ])
    });
  });

  it("provider approval records approval only and does not call provider parse", async () => {
    const { runtime, providerParse } = await preparedRuntime();

    const approved = await runtime.approveProviderParsing({
      providerJobId: "provider_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      provider: { name: "mistral-document-ai", version: "0.1.0" },
      approvedBy: "actor_investigator",
      eligibleMediaTypes: ["application/pdf"],
      maxBytesPerFile: 50000000
    });

    expect(approved).toMatchObject({ ok: true });
    expect(providerParse).not.toHaveBeenCalled();
  });

  it("rejects non-retryable jobs with a stable runtime error", async () => {
    const { runtime } = await preparedRuntime();

    const result = await runtime.retryJob({ jobId: "missing_job" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_JOB_NOT_RETRYABLE" }
    });
  });

  it("returns diagnostics from projection in stable DTO form", async () => {
    const { runtime } = await preparedRuntime();

    const diagnostics = await runtime.diagnostics({ sourceCollectionId: "src_drive_001" });

    expect(diagnostics).toMatchObject({
      ok: true,
      diagnostics: []
    });
  });
});

async function preparedRuntime() {
  const workspace = createFakeMountedWorkspace();
  roots.push(workspace.rootDir);
  const sourceRoot = join(workspace.rootDir, "source");
  mkdirSync(sourceRoot, { recursive: true });
  writeFileSync(join(sourceRoot, "a.txt"), "alpha");
  const providerParse = vi.fn();
  const runtime = createIngestionRuntime({
    mountedWorkspace: workspace,
    actor,
    providerRegistry: {
      "mistral-document-ai": { parse: providerParse }
    }
  });
  await runtime.registerSource({
    sourceCollectionId: "src_drive_001",
    label: "Old archive",
    rootUri: `file://${sourceRoot}`,
    sourceRoot
  });
  await runtime.dryRunScan({ sourceCollectionId: "src_drive_001", scanBatchId: "scan_001" });
  return { workspace, runtime, providerParse };
}
```

- [ ] **Step 3: Run the targeted test to verify it fails**

Run:

```bash
npm test -- packages/ingestion/test/runtime-jobs-provider.test.ts
```

Expected: failure because `listJobs`, `retryJob`, `approveProviderParsing`, and `diagnostics` are not implemented.

- [ ] **Step 4: Add jobs, retry, provider approval, and diagnostics runtime methods**

Modify `packages/ingestion/src/runtime.ts` so:

- `listJobs` rebuilds jobs from source, scan, import, parse, provider, and diagnostics projection state
- `retryJob` returns `INGESTION_JOB_NOT_RETRYABLE` for missing or terminal non-retryable jobs
- `approveProviderParsing` calls `ProviderParseApprovalService.approveProviderBatch`
- `approveProviderParsing` does not call provider `parse`
- `diagnostics` returns projection diagnostics in `IngestionDiagnosticsDto`

Modify `packages/ingestion/src/runtime-types.ts` only if a DTO needs an exact field added for the tests.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ingestion/test/runtime-jobs-provider.test.ts packages/ingestion/test/provider-adapter.test.ts packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts
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
git add docs/agentic/claims/task-4-ingestion-runtime-jobs-provider.md packages/ingestion/src/runtime.ts packages/ingestion/src/runtime-types.ts packages/ingestion/test/runtime-jobs-provider.test.ts
git commit -m "feat: add ingestion runtime jobs and provider gates"
```

## Task 5: Wire CLI Commands Through Mount Resolver And Runtime

**Files:**
- Create: `docs/agentic/claims/task-5-ingestion-cli-runtime.md`
- Modify: `packages/ingestion/src/cli.ts`
- Modify: `packages/ingestion/bin/cestus-ingest.mjs`
- Modify: `packages/ingestion/test/cli.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-5-ingestion-cli-runtime.md` with this task's owned files and status `claimed`. Then set status to `in-progress`.

- [ ] **Step 2: Write failing CLI runtime tests**

Modify `packages/ingestion/test/cli.test.ts` to add:

```ts
import { vi } from "vitest";
import { handleIngestionCommand } from "../src/cli.js";

it("delegates --workspace to the mount resolver before running dry-run", async () => {
  const mountResolver = {
    resolve: vi.fn(async () => ({
      ok: true as const,
      workspace: fakeMountedWorkspaceForCli()
    }))
  };
  const runtimeFactory = vi.fn(() => ({
    dryRunScan: vi.fn(async () => ({
      ok: true,
      scanBatchId: "scan_001",
      inventoryHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      review: cliReviewDto(),
      eventIds: ["evt_scan"]
    }))
  }));

  const output = await handleIngestionCommand({
    command: "dry-run",
    argv: ["--workspace", "/Volumes/Cestus", "--source-id", "src_drive_001", "--scan", "scan_001"],
    mountResolver,
    runtimeFactory
  });

  expect(mountResolver.resolve).toHaveBeenCalledWith({ workspaceRoot: "/Volumes/Cestus", env: expect.any(Object) });
  expect(JSON.parse(output)).toMatchObject({ ok: true, scanBatchId: "scan_001" });
});

it("returns stable JSON when the workspace is not mounted and performs no runtime call", async () => {
  const runtimeFactory = vi.fn();
  const output = await handleIngestionCommand({
    command: "dry-run",
    argv: ["--workspace", "/Volumes/Missing", "--source-id", "src_drive_001", "--scan", "scan_001"],
    mountResolver: {
      resolve: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "INGESTION_WORKSPACE_NOT_MOUNTED",
          message: "Portable workspace is not mounted.",
          allowedRepairActions: ["mount the workspace"]
        }
      }))
    },
    runtimeFactory
  });

  expect(JSON.parse(output)).toEqual({
    ok: false,
    error: {
      code: "INGESTION_WORKSPACE_NOT_MOUNTED",
      message: "Portable workspace is not mounted.",
      allowedRepairActions: ["mount the workspace"],
      diagnostics: []
    }
  });
  expect(runtimeFactory).not.toHaveBeenCalled();
});
```

Add local test helpers in the same file for `fakeMountedWorkspaceForCli()` and `cliReviewDto()` using minimal objects. Use `as unknown as MountedWorkspace` for the fake workspace to keep the CLI test focused on delegation.

- [ ] **Step 3: Run the targeted test to verify it fails**

Run:

```bash
npm test -- packages/ingestion/test/cli.test.ts
```

Expected: failure because `handleIngestionCommand` does not accept `argv`, `mountResolver`, or `runtimeFactory`.

- [ ] **Step 4: Implement CLI adapter behavior**

Modify `packages/ingestion/src/cli.ts` so:

- `summary-json` keeps the current stable behavior
- operational commands parse `argv`
- `--workspace <root>` and `CESTUS_WORKSPACE_ROOT` are forwarded to `mountResolver.resolve`
- no repo-local fallback exists
- unsupported commands return `INGESTION_COMMAND_UNSUPPORTED`
- dry-run, register-source, approve-import, import, jobs, retry, approve-provider, and diagnostics call the runtime methods by name
- all outputs are pretty JSON with a trailing newline

Modify `packages/ingestion/bin/cestus-ingest.mjs` so the executable supports `cestus-ingest ingest <command>` and `cestus-ingest <command>` forms, prints usage for `--help`, and returns stable JSON errors when no mount resolver is installed.

Update `package.json` script:

```json
"ingestion:help": "node packages/ingestion/bin/cestus-ingest.mjs ingest --help"
```

- [ ] **Step 5: Run targeted tests and help check**

Run:

```bash
npm test -- packages/ingestion/test/cli.test.ts
npm run ingestion:help
```

Expected: CLI tests pass, and help prints commands including `cestus ingest dry-run --workspace <root>`.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/agentic/claims/task-5-ingestion-cli-runtime.md package.json packages/ingestion/src/cli.ts packages/ingestion/bin/cestus-ingest.mjs packages/ingestion/test/cli.test.ts
git commit -m "feat: wire ingestion cli to runtime"
```

## Task 6: Add Transport-Only HTTP Ingestion Routes

**Files:**
- Create: `docs/agentic/claims/task-6-ingestion-http-routes.md`
- Create: `packages/local-runtime/src/ingestion-runtime-factory.ts`
- Create: `packages/local-runtime/src/ingestion-http-routes.ts`
- Create: `packages/local-runtime/test/ingestion-http-routes.test.ts`
- Modify: `packages/local-runtime/src/http-handler.ts`
- Modify: `packages/local-runtime/test/auth-and-seed.test.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-6-ingestion-http-routes.md` with this task's owned files and status `claimed`. Then set status to `in-progress`.

- [ ] **Step 2: Write failing HTTP route tests**

Create `packages/local-runtime/test/ingestion-http-routes.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createLocalRuntimeHttpHandler } from "../src/http-handler.js";

const actor = { id: "actor_http_ingestion", kind: "human" as const, label: "HTTP Ingestion" };

describe("local runtime ingestion HTTP routes", () => {
  it("returns workspace-not-mounted without accepting storage paths from request bodies", async () => {
    const runtimeFactory = vi.fn();
    const handler = createLocalRuntimeHttpHandler({
      config: resolveLocalRuntimeConfig({ cwd: process.cwd(), env: {} }),
      actor,
      ingestionMountResolver: {
        resolve: vi.fn(async () => ({
          ok: false as const,
          error: {
            code: "INGESTION_WORKSPACE_NOT_MOUNTED",
            message: "Portable workspace is not mounted.",
            allowedRepairActions: ["mount the workspace"]
          }
        }))
      },
      ingestionRuntimeFactory: runtimeFactory
    });

    const response = await handler({
      method: "POST",
      url: "/api/ingestion/scans/dry-run",
      body: JSON.stringify({
        workspaceRoot: "/tmp/forbidden",
        sourceCollectionId: "src_drive_001",
        scanBatchId: "scan_001"
      })
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: false,
      error: { code: "INGESTION_HTTP_STORAGE_PATH_FORBIDDEN" }
    });
    expect(runtimeFactory).not.toHaveBeenCalled();
  });

  it("calls the runtime for dry-run without encoding workflow semantics in HTTP", async () => {
    const dryRunScan = vi.fn(async () => ({
      ok: true,
      scanBatchId: "scan_001",
      inventoryHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      review: { sourceCollectionId: "src_drive_001", label: "Old archive", totals: emptyTotals(), approvalRequired: true, duplicateGroups: [], evidenceLinks: [], parseJobs: [], diagnostics: [] },
      eventIds: ["evt_scan"]
    }));
    const handler = createLocalRuntimeHttpHandler({
      config: resolveLocalRuntimeConfig({ cwd: process.cwd(), env: {} }),
      actor,
      ingestionMountResolver: mountedResolver(),
      ingestionRuntimeFactory: () => ({ dryRunScan })
    });

    const response = await handler({
      method: "POST",
      url: "/api/ingestion/scans/dry-run",
      body: JSON.stringify({ sourceCollectionId: "src_drive_001", scanBatchId: "scan_001" })
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true, scanBatchId: "scan_001" });
    expect(dryRunScan).toHaveBeenCalledWith({ sourceCollectionId: "src_drive_001", scanBatchId: "scan_001" });
  });

  it("provider approval route records approval only and does not parse provider bytes", async () => {
    const approveProviderParsing = vi.fn(async () => ({
      ok: true,
      review: { sourceCollectionId: "src_drive_001", label: "Old archive", totals: emptyTotals(), approvalRequired: false, duplicateGroups: [], evidenceLinks: [], parseJobs: [], diagnostics: [] },
      eventIds: ["evt_provider_approval"]
    }));
    const handler = createLocalRuntimeHttpHandler({
      config: resolveLocalRuntimeConfig({ cwd: process.cwd(), env: {} }),
      actor,
      ingestionMountResolver: mountedResolver(),
      ingestionRuntimeFactory: () => ({ approveProviderParsing })
    });

    const response = await handler({
      method: "POST",
      url: "/api/ingestion/provider-parsing/approve",
      body: JSON.stringify({
        providerJobId: "provider_001",
        sourceCollectionId: "src_drive_001",
        importBatchId: "imp_001",
        provider: { name: "mistral-document-ai", version: "0.1.0" },
        approvedBy: "actor_investigator",
        eligibleMediaTypes: ["application/pdf"],
        maxBytesPerFile: 50000000
      })
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).eventIds).toEqual(["evt_provider_approval"]);
    expect(approveProviderParsing).toHaveBeenCalledTimes(1);
  });
});

function emptyTotals() {
  return { observedFiles: 0, uniqueContent: 0, duplicateOccurrences: 0, skipped: 0, bytes: 0, estimatedNewBlobBytes: 0 };
}

function mountedResolver() {
  return {
    resolve: vi.fn(async () => ({
      ok: true as const,
      workspace: {
        workspaceId: "ws_http_001",
        label: "HTTP workspace",
        capabilities: {
          canReadLedger: true,
          canAppendLedger: true,
          canWriteBlobs: true,
          canWriteDerivatives: true,
          canWriteJobState: true
        }
      }
    }))
  };
}
```

Modify `packages/local-runtime/test/auth-and-seed.test.ts` to add one auth assertion for `/api/ingestion/jobs` in tailnet mode:

```ts
const rejected = await handler({ method: "GET", url: "/api/ingestion/jobs" });
expect(rejected.status).toBe(401);
```

- [ ] **Step 3: Run targeted tests to verify they fail**

Run:

```bash
npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts packages/local-runtime/test/auth-and-seed.test.ts
```

Expected: ingestion route tests fail because HTTP handler does not accept ingestion mount/runtime dependencies or route `/api/ingestion/*`.

- [ ] **Step 4: Implement transport-only routes**

Create `packages/local-runtime/src/ingestion-runtime-factory.ts`:

```ts
import { createIngestionRuntime } from "../../ingestion/src/runtime.js";
import type { MountedWorkspace } from "../../ingestion/src/mount-contract.js";
import type { CreateIngestionRuntimeInput } from "../../ingestion/src/runtime.js";

export type LocalIngestionRuntimeFactory = (input: {
  readonly mountedWorkspace: MountedWorkspace;
  readonly actor: CreateIngestionRuntimeInput["actor"];
}) => Partial<ReturnType<typeof createIngestionRuntime>>;

export const defaultLocalIngestionRuntimeFactory: LocalIngestionRuntimeFactory = ({ mountedWorkspace, actor }) =>
  createIngestionRuntime({ mountedWorkspace, actor });
```

Create `packages/local-runtime/src/ingestion-http-routes.ts` with:

- route matching for the approved route set
- storage-path forbidden-key checks for `workspace`, `workspaceRoot`, `workspacePath`, `storagePath`, `sqlitePath`, `blobRoot`
- JSON body parsing with safe diagnostics
- mount resolver invocation
- runtime factory invocation
- direct method dispatch with no workflow branching beyond transport validation

Modify `packages/local-runtime/src/http-handler.ts`:

- extend `CreateLocalRuntimeHttpHandlerInput` with optional `ingestionMountResolver` and `ingestionRuntimeFactory`
- route `/api/ingestion/*` through `handleIngestionHttpRoute`
- preserve `/api/health` public behavior
- preserve existing auth policy for non-loopback routes

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts packages/local-runtime/test/auth-and-seed.test.ts packages/local-runtime/test/http-handler.test.ts
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
git add docs/agentic/claims/task-6-ingestion-http-routes.md packages/local-runtime/src/ingestion-runtime-factory.ts packages/local-runtime/src/ingestion-http-routes.ts packages/local-runtime/src/http-handler.ts packages/local-runtime/test/ingestion-http-routes.test.ts packages/local-runtime/test/auth-and-seed.test.ts
git commit -m "feat: add ingestion local runtime routes"
```

## Task 7: Add Browser-Safe UI Adapter And Live Ingestion App Wiring

**Files:**
- Create: `docs/agentic/claims/task-7-ingestion-ui-runtime-adapter.md`
- Create: `packages/ui/src/ingestion/ingestion-adapter.ts`
- Create: `packages/ui/test/ingestion-http-adapter.test.ts`
- Modify: `packages/ui/src/ingestion/ingestion-types.ts`
- Modify: `packages/ui/src/ingestion/IngestionWorkspace.tsx`
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/test/ingestion-workspace.test.tsx`
- Modify: `packages/ui/test/ingestion-app-integration.test.tsx`
- Modify: `packages/ui/test/request-data-boundary.test.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-7-ingestion-ui-runtime-adapter.md` with this task's owned files and status `claimed`. Then set status to `in-progress`.

- [ ] **Step 2: Write failing UI adapter and boundary tests**

Create `packages/ui/test/ingestion-http-adapter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createHttpIngestionWorkspaceAdapter } from "../src/ingestion/ingestion-adapter.js";

describe("createHttpIngestionWorkspaceAdapter", () => {
  it("loads mounted workspace DTOs from the local ingestion runtime API", async () => {
    const payload = {
      mounted: true,
      workspaceId: "ws_ui_001",
      label: "UI workspace",
      diagnostics: []
    };
    const fetcher = vi.fn(async () => jsonResponse(200, { ok: true, workspace: payload }));
    const adapter = createHttpIngestionWorkspaceAdapter({ baseUrl: "http://127.0.0.1:8787", fetcher });

    await expect(adapter.loadWorkspace()).resolves.toEqual(payload);
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8787/api/ingestion/workspace", {
      credentials: "same-origin",
      headers: {},
      method: "GET"
    });
  });

  it("maps workspace-not-mounted into a safe UI DTO", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, {
      ok: false,
      error: {
        code: "INGESTION_WORKSPACE_NOT_MOUNTED",
        message: "Portable workspace is not mounted.",
        allowedRepairActions: ["mount the workspace"],
        diagnostics: []
      }
    }));
    const adapter = createHttpIngestionWorkspaceAdapter({ fetcher });

    await expect(adapter.loadWorkspace()).resolves.toEqual({
      mounted: false,
      diagnostics: [{
        severity: "error",
        category: "workspace",
        message: "Portable workspace is not mounted."
      }]
    });
  });

  it("does not send workspace paths in ingestion action bodies", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { ok: true, review: reviewDto(), eventIds: ["evt_scan"] }));
    const adapter = createHttpIngestionWorkspaceAdapter({ fetcher });

    await adapter.dryRunScan({ sourceCollectionId: "src_drive_001", scanBatchId: "scan_001" });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ sourceCollectionId: "src_drive_001", scanBatchId: "scan_001" });
    expect(JSON.stringify(body)).not.toMatch(/workspace|storage|sqlite|blobRoot/i);
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function reviewDto() {
  return {
    sourceCollectionId: "src_drive_001",
    label: "Old archive",
    totals: { observedFiles: 0, uniqueContent: 0, duplicateOccurrences: 0, skipped: 0, bytes: 0, estimatedNewBlobBytes: 0 },
    approvalRequired: false,
    duplicateGroups: [],
    evidenceLinks: [],
    parseJobs: [],
    diagnostics: []
  };
}
```

Modify `packages/ui/test/request-data-boundary.test.ts` to extend forbidden product UI fragments and imports:

```ts
const forbiddenProductUiSourceFragments = [
  "SQLiteEventLedger",
  "sqlite-event-ledger",
  "packages/prr/src/runtime",
  "packages/local-runtime/src/config",
  "packages/local-runtime/src/server",
  "packages/local-runtime/src/http-handler",
  "packages/local-runtime/src/runtime-factory",
  "packages/local-runtime/src/ingestion-http-routes",
  "packages/ingestion/src/runtime",
  "packages/ingestion/src/source-materializer",
  "packages/ingestion/src/import-service",
  "packages/ingestion/src/local-filesystem",
  "packages/ingestion/src/mount-contract",
  "FileBlobStore",
  "node:fs",
  "node:path"
];
```

Modify `packages/ui/test/ingestion-app-integration.test.tsx` to assert the app uses the injected ingestion adapter and no longer renders the old placeholder label:

```tsx
render(<App ingestionAdapter={staticIngestionAdapter({ mounted: false, diagnostics: [] })} />);
expect(screen.queryByText("External investigation archive placeholder")).not.toBeInTheDocument();
```

- [ ] **Step 3: Run targeted tests to verify they fail**

Run:

```bash
npm test -- packages/ui/test/ingestion-http-adapter.test.ts packages/ui/test/ingestion-workspace.test.tsx packages/ui/test/ingestion-app-integration.test.tsx packages/ui/test/request-data-boundary.test.ts
```

Expected: tests fail because the adapter file, app prop, live DTO shape, and boundary protections are not implemented.

- [ ] **Step 4: Add browser-safe adapter and UI DTOs**

Create `packages/ui/src/ingestion/ingestion-adapter.ts` with:

- `createHttpIngestionWorkspaceAdapter`
- `httpIngestionWorkspaceAdapter`
- `createStaticIngestionWorkspaceAdapter`
- safe JSON parsing
- diagnostic redaction
- methods for load, register source, dry-run, raw import approval, import execution, jobs, retry, provider approval, and diagnostics
- action methods that never include workspace or storage path fields in request bodies

Modify `packages/ui/src/ingestion/ingestion-types.ts` to include browser DTOs only. Do not import from `packages/ingestion/src/runtime.ts`, `packages/local-runtime`, `node:*`, or storage modules.

- [ ] **Step 5: Wire app and component**

Modify `packages/ui/src/ingestion/IngestionWorkspace.tsx`:

- accept workspace DTO, loading state, diagnostics, jobs, and action callbacks
- render workspace-not-mounted state
- render raw import approval and provider approval as explicit controls
- render import execution separately from approval
- render retryable jobs and diagnostics

Modify `packages/ui/src/App.tsx`:

- default to `httpIngestionWorkspaceAdapter`
- accept optional `ingestionAdapter` prop for tests
- load ingestion workspace when ingestion module is active
- remove placeholder ingestion review state

- [ ] **Step 6: Run targeted UI tests**

Run:

```bash
npm test -- packages/ui/test/ingestion-http-adapter.test.ts packages/ui/test/ingestion-workspace.test.tsx packages/ui/test/ingestion-app-integration.test.tsx packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx
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
git add docs/agentic/claims/task-7-ingestion-ui-runtime-adapter.md packages/ui/src/ingestion/ingestion-adapter.ts packages/ui/src/ingestion/ingestion-types.ts packages/ui/src/ingestion/IngestionWorkspace.tsx packages/ui/src/App.tsx packages/ui/test/ingestion-http-adapter.test.ts packages/ui/test/ingestion-workspace.test.tsx packages/ui/test/ingestion-app-integration.test.tsx packages/ui/test/request-data-boundary.test.ts
git commit -m "feat: add ingestion ui runtime adapter"
```

## Task 8: Add Factory Readiness And Final Review Evidence

**Files:**
- Create: `docs/agentic/claims/task-8-ingestion-runtime-readiness.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`
- Modify: `packages/ui/test/request-data-boundary.test.ts`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-8-ingestion-runtime-readiness.md` with this task's owned files and status `claimed`. Then set status to `in-progress`.

- [ ] **Step 2: Write failing readiness expectation**

Modify `packages/ui/test/request-data-boundary.test.ts` to assert factory readiness includes:

```ts
const ingestionRuntimeSpecPath = "docs/superpowers/specs/2026-07-06-ingestion-runtime-wiring-design.md";
const ingestionRuntimePlanPath = "docs/superpowers/plans/2026-07-06-ingestion-runtime-wiring-implementation.md";

expect(requiredFiles).toEqual(expect.arrayContaining([ingestionRuntimeSpecPath, ingestionRuntimePlanPath]));
```

Run:

```bash
npm test -- packages/ui/test/request-data-boundary.test.ts
```

Expected: failure because `scripts/check-agent-readiness.mjs` does not list the ingestion runtime wiring spec and plan.

- [ ] **Step 3: Add readiness required files**

Modify `scripts/check-agent-readiness.mjs` `requiredFiles` to include:

```js
"docs/superpowers/specs/2026-07-06-ingestion-runtime-wiring-design.md",
"docs/superpowers/plans/2026-07-06-ingestion-runtime-wiring-implementation.md"
```

- [ ] **Step 4: Record readiness evidence**

Append a "Ingestion Runtime Wiring Plan Readiness" section to `docs/agentic/software-factory.md` with:

- spec path
- plan path
- targeted runtime command evidence
- targeted CLI command evidence
- targeted HTTP command evidence
- targeted UI and boundary command evidence
- `npm run verify` evidence
- statement that live provider checks remain opt-in and are not part of standard verification

- [ ] **Step 5: Run validation**

Run:

```bash
git diff --check
npm test -- packages/ui/test/request-data-boundary.test.ts
npm run factory:check
npm run verify
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add docs/agentic/claims/task-8-ingestion-runtime-readiness.md scripts/check-agent-readiness.mjs docs/agentic/software-factory.md packages/ui/test/request-data-boundary.test.ts
git commit -m "docs: record ingestion runtime readiness"
```

## Completion Criteria

This implementation slice is complete when:

- Every task claim is committed and records verification evidence.
- `IngestionRuntime` owns workflow sequencing for source registration, dry-run scans, raw import approval, import execution, job listing, retry, provider approval, and diagnostics.
- CLI, HTTP, and UI are adapters over `IngestionRuntime`.
- CLI supports `cestus ingest ... --workspace <root>` ergonomics while delegating workspace resolution to the mount contract.
- HTTP route bodies reject arbitrary storage path fields.
- Raw import approval writes no blobs and creates no evidence.
- Import execution verifies current regular file bytes before blob writes.
- Import execution verifies archive container hashes before blob writes.
- Import execution verifies archive child hashes before blob writes.
- Provider approval writes approval only and sends no bytes externally.
- UI ingestion adapter imports DTOs and types only.
- Boundary tests prevent Node-only ingestion, local-runtime, filesystem, SQLite, blob store, and mount/storage modules from entering browser code.
- `npm run verify` passes.
- Factory readiness includes the spec and plan.
- Reviewers find no blocking defects, missing tests, spec drift, invariant violations, or verification gaps.
