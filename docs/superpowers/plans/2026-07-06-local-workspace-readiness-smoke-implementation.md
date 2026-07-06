# Local Workspace Readiness Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic local smoke path that creates a fresh portable workspace, mounts it, runs ingestion through approval and import, and inspects the result through workspace ops JSON contracts.

**Architecture:** Keep the smoke orchestration in `packages/local-runtime` as the local composition layer. Reuse `packages/workspace` for creation and mount validation, `packages/ingestion` for workflow semantics, and `packages/workspace-ops` for verify/export inspection. Add only proof and operator wiring; do not change migration semantics.

**Tech Stack:** TypeScript, Vitest, Node filesystem APIs, existing SQLite event ledger, existing file blob store, existing Cestus workspace, ingestion, and workspace-ops packages.

---

## Required Reading

- `AGENTS.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/software-factory.md`
- `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
- `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
- `docs/superpowers/specs/2026-07-06-portable-workspace-mount-design.md`
- `docs/superpowers/plans/2026-07-06-portable-workspace-mount-implementation.md`
- `docs/superpowers/specs/2026-07-06-portable-workspace-ops-design.md`
- `docs/superpowers/plans/2026-07-06-portable-workspace-ops-implementation.md`
- `docs/superpowers/specs/2026-07-06-ingestion-runtime-wiring-design.md`
- `docs/superpowers/plans/2026-07-06-ingestion-runtime-wiring-implementation.md`
- `docs/superpowers/specs/2026-07-06-local-workspace-readiness-smoke-design.md`
- This plan

## File Map

- `packages/workspace-ops/src/layout.ts`: accept the canonical portable workspace manifest shape used by `packages/workspace`.
- `packages/workspace-ops/test/layout.test.ts`: prove workspace ops can resolve a real portable workspace created by `createPortableWorkspace`.
- `packages/local-runtime/src/workspace-readiness-smoke.ts`: smoke orchestration, JSON report contract, and CLI runner.
- `packages/local-runtime/test/workspace-readiness-smoke.test.ts`: deterministic e2e local smoke tests.
- `package.json`: add `local:workspace:smoke` operator script.
- `scripts/check-agent-readiness.mjs`: require the smoke spec and plan after implementation.
- `packages/ui/test/request-data-boundary.test.ts`: assert factory readiness includes the smoke spec and plan.
- `docs/agentic/software-factory.md`: record final smoke readiness evidence.
- `docs/agentic/claims/task-1-local-workspace-smoke-ops-layout.md`: Task 1 claim.
- `docs/agentic/claims/task-2-local-workspace-readiness-smoke.md`: Task 2 claim.
- `docs/agentic/claims/task-3-local-workspace-smoke-command.md`: Task 3 claim.
- `docs/agentic/claims/task-4-local-workspace-smoke-readiness.md`: Task 4 claim.

## Factory Rules

- Use a task-scoped branch or isolated worktree.
- Claim one task before source, test, script, or docs edits.
- Write the failing test or failing readiness check first.
- Run the exact targeted command in each task.
- Run `npm run verify` before each task commit.
- Commit only task-owned files plus claim/readiness evidence.
- Stop on data-loss risk, schema conflict, credential need, external-service dependency, or the same verifier failing after two focused repair attempts.

## Task 1: Bind Workspace Ops To Canonical Portable Manifest

**Outcome:** `packages/workspace-ops` can resolve a workspace created by `packages/workspace.createPortableWorkspace`, so the smoke path can inspect a real portable workspace instead of a provisional fixture manifest.

**Files:**
- Modify: `packages/workspace-ops/src/layout.ts`
- Modify: `packages/workspace-ops/test/layout.test.ts`
- Create: `docs/agentic/claims/task-1-local-workspace-smoke-ops-layout.md`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-local-workspace-smoke-ops-layout.md`:

```markdown
# Task 1: Local Workspace Smoke Ops Layout

Plan path: `docs/superpowers/plans/2026-07-06-local-workspace-readiness-smoke-implementation.md`
Task heading: `Task 1: Bind Workspace Ops To Canonical Portable Manifest`
Worker identity: Codex
Branch: `codex/local-workspace-readiness-smoke`
Worktree path: `/home/drake/.codex/worktrees/2800/Cestus`
Claimed at UTC: record the current UTC time when the claim is created.
Status: `claimed`

## Owned Files

- `docs/agentic/claims/task-1-local-workspace-smoke-ops-layout.md`
- `packages/workspace-ops/src/layout.ts`
- `packages/workspace-ops/test/layout.test.ts`

## Evidence

- Red command:
- Green command:
- Full verification:

## Review

- Reviewer records decision after review.
```

Commit the claim:

```bash
git add docs/agentic/claims/task-1-local-workspace-smoke-ops-layout.md
git commit -m "chore: claim task 1 local workspace smoke ops layout"
```

Update the claim status to `in-progress` and commit:

```bash
git add docs/agentic/claims/task-1-local-workspace-smoke-ops-layout.md
git commit -m "chore: start task 1 local workspace smoke ops layout"
```

- [ ] **Step 2: Write the failing canonical layout test**

Add this test to `packages/workspace-ops/test/layout.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { NodeWorkspaceFileSystem } from "../src/filesystem.js";
import { resolveWorkspaceLayout } from "../src/layout.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveWorkspaceLayout canonical portable workspace binding", () => {
  it("resolves a workspace created by the canonical workspace package", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "cestus-ops-canonical-"));
    tempDirs.push(rootDir);
    createPortableWorkspace({
      rootDir,
      workspaceId: "ws_ops_canonical_001",
      label: "Ops Canonical Fixture",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "workspace-ops-test"
    });

    const result = await resolveWorkspaceLayout({ rootPath: rootDir }, new NodeWorkspaceFileSystem());

    expect(result.status).toBe("ready");
    expect(result.workspace).toMatchObject({
      workspaceId: "ws_ops_canonical_001",
      label: "Ops Canonical Fixture",
      manifestVersion: 1
    });
    expect(result.layout).toMatchObject({
      rootPath: resolve(rootDir),
      ledgerPath: join(resolve(rootDir), "ledger", "ontology.sqlite"),
      blobRoot: join(resolve(rootDir), "blobs"),
      derivativeRoot: join(resolve(rootDir), "derivatives"),
      jobRoot: join(resolve(rootDir), "jobs"),
      projectionRoot: join(resolve(rootDir), "projections")
    });
  });
});
```

- [ ] **Step 3: Run the targeted failing command**

Run:

```bash
npm test -- packages/workspace-ops/test/layout.test.ts
```

Expected: FAIL because `resolveWorkspaceLayout` only accepts the provisional strict manifest shape and rejects the canonical portable workspace manifest.

- [ ] **Step 4: Update layout manifest parsing**

In `packages/workspace-ops/src/layout.ts`, add canonical manifest parsing beside the provisional parser:

```ts
const canonicalPortableWorkspaceManifestSchema = z.object({
  version: z.literal(1),
  layoutVersion: z.literal(1),
  workspaceId: z.string().regex(/^ws_[a-zA-Z0-9_-]+$/),
  label: secretSafeWorkspaceTextSchema,
  createdAt: z.string().datetime(),
  createdBy: secretSafeWorkspaceTextSchema,
  coreVersion: secretSafeWorkspaceTextSchema,
  description: secretSafeWorkspaceTextSchema.optional()
}).strict();

type WorkspaceManifestIdentity = {
  readonly workspaceId: string;
  readonly label: string;
  readonly version: 1;
};

function parseWorkspaceManifestIdentity(value: unknown): WorkspaceManifestIdentity | undefined {
  const canonical = canonicalPortableWorkspaceManifestSchema.safeParse(value);
  if (canonical.success) {
    return {
      workspaceId: canonical.data.workspaceId,
      label: canonical.data.label,
      version: canonical.data.version
    };
  }

  return parseProvisionalWorkspaceManifest(value);
}
```

Replace calls to `parseProvisionalWorkspaceManifest` inside `resolveWorkspaceLayout` and `validateResolvedManifest` with `parseWorkspaceManifestIdentity`. Keep `parseProvisionalWorkspaceManifest` exported so existing tests and callers keep working.

- [ ] **Step 5: Run the targeted passing command**

Run:

```bash
npm test -- packages/workspace-ops/test/layout.test.ts packages/workspace-ops/test/ops.test.ts
```

Expected: PASS. Canonical portable manifests and existing provisional fixtures both resolve.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 7: Commit**

```bash
git add docs/agentic/claims/task-1-local-workspace-smoke-ops-layout.md packages/workspace-ops/src/layout.ts packages/workspace-ops/test/layout.test.ts
git commit -m "fix: bind workspace ops to canonical manifests"
```

## Task 2: Add Local Workspace Readiness Smoke Orchestrator

**Outcome:** A package-level smoke function creates a fresh portable workspace, mounts it, runs ingestion through approval/import, and returns one stable JSON report with workspace ops inspection results.

**Files:**
- Create: `packages/local-runtime/src/workspace-readiness-smoke.ts`
- Create: `packages/local-runtime/test/workspace-readiness-smoke.test.ts`
- Create: `docs/agentic/claims/task-2-local-workspace-readiness-smoke.md`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-local-workspace-readiness-smoke.md` with owned files and status `claimed`, then update it to `in-progress` and commit that transition before editing source or tests.

- [ ] **Step 2: Write the failing smoke test**

Create `packages/local-runtime/test/workspace-readiness-smoke.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runLocalWorkspaceReadinessSmoke } from "../src/workspace-readiness-smoke.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("runLocalWorkspaceReadinessSmoke", () => {
  it("proves the fresh portable workspace, ingestion, and workspace ops chain", async () => {
    const workspaceRoot = tempDir("cestus-smoke-workspace-");
    const sourceRoot = tempDir("cestus-smoke-source-");

    const report = await runLocalWorkspaceReadinessSmoke({
      workspaceRoot,
      sourceRoot,
      workspaceId: "ws_smoke_001",
      workspaceLabel: "Smoke Workspace",
      sourceCollectionId: "src_smoke_001",
      sourceLabel: "Smoke Source",
      scanBatchId: "scan_smoke_001",
      importBatchId: "imp_smoke_001",
      approvedBy: "actor_smoke",
      now: () => "2026-07-06T12:00:00.000Z"
    });

    expect(report).toMatchObject({
      schemaVersion: "local-workspace-readiness-smoke.v1",
      ok: true,
      status: "ready",
      workspace: {
        workspaceId: "ws_smoke_001",
        label: "Smoke Workspace",
        manifestVersion: 1
      },
      source: {
        sourceCollectionId: "src_smoke_001",
        label: "Smoke Source",
        fixtureFileCount: 1
      },
      ingestion: {
        evidenceCount: 1,
        blobCount: 1,
        diagnosticCount: 0
      },
      workspaceOps: {
        verifyStatus: "ready",
        diskUsageStatus: "ready",
        manifestExportStatus: "ready",
        backupCheckStatus: "ready"
      }
    });
    expect(report.checks.map((check) => check.checkId)).toEqual([
      "workspace.create",
      "workspace.mount",
      "ingestion.mount-adapter",
      "ingestion.register-source",
      "ingestion.dry-run",
      "ingestion.approve-import",
      "ingestion.import",
      "ingestion.jobs",
      "ingestion.diagnostics",
      "workspace-ops.verify",
      "workspace-ops.disk-usage",
      "workspace-ops.manifest-export",
      "workspace-ops.backup-check"
    ]);
    expect(report.checks.every((check) => check.ok)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the targeted failing command**

Run:

```bash
npm test -- packages/local-runtime/test/workspace-readiness-smoke.test.ts
```

Expected: FAIL because `packages/local-runtime/src/workspace-readiness-smoke.ts` does not exist.

- [ ] **Step 4: Add the smoke orchestration module**

Create `packages/local-runtime/src/workspace-readiness-smoke.ts` with these public exports and behavior:

```ts
export const localWorkspaceReadinessSmokeSchemaVersion = "local-workspace-readiness-smoke.v1" as const;

export interface RunLocalWorkspaceReadinessSmokeInput {
  readonly workspaceRoot?: string;
  readonly sourceRoot?: string;
  readonly workspaceId?: string;
  readonly workspaceLabel?: string;
  readonly sourceCollectionId?: string;
  readonly sourceLabel?: string;
  readonly scanBatchId?: string;
  readonly importBatchId?: string;
  readonly approvedBy?: string;
  readonly now?: () => string;
}

export interface LocalWorkspaceReadinessCheck {
  readonly checkId: string;
  readonly ok: boolean;
  readonly status: "ready" | "degraded" | "blocked";
  readonly summary: string;
}
```

The implementation must:

- Create deterministic fixture source content when `sourceRoot` is empty.
- Call `createPortableWorkspace` with explicit IDs and timestamp.
- Create support directories `diagnostics/` and `backups/` under the fresh smoke workspace.
- Mount with `mountPortableWorkspace`.
- Open `SQLiteEventLedger` at `mounted.paths.ledgerPath` and close it in a `finally` block.
- Build the ingestion `MountedWorkspace` with `FileBlobStore`, `mountedWorkspaceCapabilities`, and the mounted portable paths.
- Run `createIngestionRuntime` methods in the required order.
- Count events from the SQLite ledger after import.
- Resolve workspace ops layout through `resolveWorkspaceLayout`.
- Run `verifyWorkspace`, `reportDiskUsage`, `exportWorkspaceManifest`, and `checkBackupManifest`.
- Return `status: "ready"` only when every check is ready and no canonical diagnostic is present.

- [ ] **Step 5: Run the targeted passing command**

Run:

```bash
npm test -- packages/local-runtime/test/workspace-readiness-smoke.test.ts packages/workspace-ops/test/layout.test.ts packages/ingestion/test/runtime.test.ts
```

Expected: PASS. The smoke report proves one fresh local chain with no credentials or external services.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 7: Commit**

```bash
git add docs/agentic/claims/task-2-local-workspace-readiness-smoke.md packages/local-runtime/src/workspace-readiness-smoke.ts packages/local-runtime/test/workspace-readiness-smoke.test.ts
git commit -m "test: add local workspace readiness smoke"
```

## Task 3: Add Operator Command

**Outcome:** Operators and AI agents can run the smoke path with `npm run local:workspace:smoke -- --json` and receive stable JSON.

**Files:**
- Modify: `packages/local-runtime/src/workspace-readiness-smoke.ts`
- Modify: `packages/local-runtime/test/workspace-readiness-smoke.test.ts`
- Modify: `package.json`
- Create: `docs/agentic/claims/task-3-local-workspace-smoke-command.md`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-local-workspace-smoke-command.md` with owned files and status `claimed`, then update it to `in-progress` and commit that transition before editing source or tests.

- [ ] **Step 2: Write the failing CLI tests**

Add tests to `packages/local-runtime/test/workspace-readiness-smoke.test.ts`:

```ts
import { runLocalWorkspaceReadinessSmokeCli } from "../src/workspace-readiness-smoke.js";

it("prints stable JSON from the operator command", async () => {
  const workspaceRoot = tempDir("cestus-smoke-cli-workspace-");
  const sourceRoot = tempDir("cestus-smoke-cli-source-");
  const lines: string[] = [];

  const exitCode = await runLocalWorkspaceReadinessSmokeCli([
    "--json",
    "--workspace", workspaceRoot,
    "--source", sourceRoot,
    "--workspace-id", "ws_smoke_cli_001",
    "--source-id", "src_smoke_cli_001",
    "--created-at", "2026-07-06T12:00:00.000Z"
  ], {
    stdout: (line) => lines.push(line)
  });

  expect(exitCode).toBe(0);
  const output = JSON.parse(lines.join(""));
  expect(output.schemaVersion).toBe("local-workspace-readiness-smoke.v1");
  expect(output.ok).toBe(true);
  expect(output.status).toBe("ready");
});

it("fails closed without deleting or overwriting an initialized workspace", async () => {
  const workspaceRoot = tempDir("cestus-smoke-cli-existing-");
  const firstLines: string[] = [];
  const secondLines: string[] = [];

  expect(await runLocalWorkspaceReadinessSmokeCli([
    "--json",
    "--workspace", workspaceRoot,
    "--workspace-id", "ws_smoke_existing_001",
    "--created-at", "2026-07-06T12:00:00.000Z"
  ], { stdout: (line) => firstLines.push(line) })).toBe(0);

  const exitCode = await runLocalWorkspaceReadinessSmokeCli([
    "--json",
    "--workspace", workspaceRoot,
    "--workspace-id", "ws_smoke_existing_001",
    "--created-at", "2026-07-06T12:00:00.000Z"
  ], { stdout: (line) => secondLines.push(line) });

  expect(exitCode).toBe(3);
  expect(JSON.parse(secondLines.join(""))).toMatchObject({
    schemaVersion: "local-workspace-readiness-smoke.v1",
    ok: false,
    status: "blocked"
  });
});
```

- [ ] **Step 3: Run the targeted failing command**

Run:

```bash
npm test -- packages/local-runtime/test/workspace-readiness-smoke.test.ts
```

Expected: FAIL because `runLocalWorkspaceReadinessSmokeCli` and the package script do not exist.

- [ ] **Step 4: Add CLI parser and entrypoint**

In `packages/local-runtime/src/workspace-readiness-smoke.ts`, export `runLocalWorkspaceReadinessSmokeCli(argv, dependencies)` and add an entrypoint guard. It must support:

```text
--json
--workspace [root]
--source [root]
--workspace-id [id]
--workspace-label [label]
--source-id [id]
--source-label [label]
--scan [id]
--import [id]
--approved-by [actor-id]
--created-at [iso-datetime]
--help
```

Errors must return a smoke JSON envelope with `ok: false`, `status: "blocked"`, and a safe diagnostic. Secret-shaped arguments must not be echoed.

Modify `package.json`:

```json
"local:workspace:smoke": "tsx packages/local-runtime/src/workspace-readiness-smoke.ts"
```

- [ ] **Step 5: Run the targeted passing commands**

Run:

```bash
npm test -- packages/local-runtime/test/workspace-readiness-smoke.test.ts
npm run local:workspace:smoke -- --json
```

Expected: the test passes, and the npm script prints a `local-workspace-readiness-smoke.v1` JSON report with `ok: true`.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 7: Commit**

```bash
git add docs/agentic/claims/task-3-local-workspace-smoke-command.md packages/local-runtime/src/workspace-readiness-smoke.ts packages/local-runtime/test/workspace-readiness-smoke.test.ts package.json
git commit -m "feat: add local workspace smoke command"
```

## Task 4: Record Factory Readiness

**Outcome:** Factory readiness requires the smoke spec and plan, final evidence is recorded, and the slice is review-ready.

**Files:**
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `packages/ui/test/request-data-boundary.test.ts`
- Modify: `docs/agentic/software-factory.md`
- Create: `docs/agentic/claims/task-4-local-workspace-smoke-readiness.md`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-4-local-workspace-smoke-readiness.md` with owned files and status `claimed`, then update it to `in-progress` and commit that transition before editing scripts, tests, or docs.

- [ ] **Step 2: Write the failing readiness expectation**

Modify `packages/ui/test/request-data-boundary.test.ts` to include:

```ts
const localWorkspaceSmokeSpecPath = "docs/superpowers/specs/2026-07-06-local-workspace-readiness-smoke-design.md";
const localWorkspaceSmokePlanPath = "docs/superpowers/plans/2026-07-06-local-workspace-readiness-smoke-implementation.md";
```

Add an assertion in the factory readiness test:

```ts
expect(requiredFiles).toEqual(expect.arrayContaining([
  localWorkspaceSmokeSpecPath,
  localWorkspaceSmokePlanPath
]));
```

- [ ] **Step 3: Run the targeted failing command**

Run:

```bash
npm test -- packages/ui/test/request-data-boundary.test.ts
```

Expected: FAIL because `scripts/check-agent-readiness.mjs` does not yet require the smoke spec and plan.

- [ ] **Step 4: Add readiness required files**

Modify `scripts/check-agent-readiness.mjs` `requiredFiles` to include:

```js
"docs/superpowers/specs/2026-07-06-local-workspace-readiness-smoke-design.md",
"docs/superpowers/plans/2026-07-06-local-workspace-readiness-smoke-implementation.md"
```

- [ ] **Step 5: Record readiness evidence**

Append a `## Local Workspace Readiness Smoke Plan Readiness` section to `docs/agentic/software-factory.md`. It must include:

- The two required files:
  - `docs/superpowers/specs/2026-07-06-local-workspace-readiness-smoke-design.md`
  - `docs/superpowers/plans/2026-07-06-local-workspace-readiness-smoke-implementation.md`
- A statement that factory readiness checks both files through `scripts/check-agent-readiness.mjs`.
- The exact observed output summary from `npm test -- packages/local-runtime/test/workspace-readiness-smoke.test.ts packages/workspace-ops/test/layout.test.ts`.
- The exact observed `schemaVersion`, `ok`, and `status` fields from `npm run local:workspace:smoke -- --json`.
- The exact observed summary from `npm run verify`.
- A boundary statement that the smoke path remains local-only and proof-oriented, with no provider credentials, outbound document transfer, canonical repair execution, old-Cestus migration mapping, PRR sends, or legal escalation.

- [ ] **Step 6: Run readiness and full verification**

Run:

```bash
npm test -- packages/ui/test/request-data-boundary.test.ts
npm run factory:check
npm run verify
```

Expected: targeted readiness, factory check, typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 7: Commit**

```bash
git add docs/agentic/claims/task-4-local-workspace-smoke-readiness.md scripts/check-agent-readiness.mjs packages/ui/test/request-data-boundary.test.ts docs/agentic/software-factory.md
git commit -m "docs: record local workspace smoke readiness"
```

## Review Gates

- After Task 1, review the workspace ops binding for compatibility with canonical portable manifests and existing provisional tests.
- After Task 2, review smoke orchestration for append-only ledger use, approval-only raw import, stale-source verification, and secret-safe JSON.
- After Task 3, review operator command behavior for stable JSON, safe failures, and no deletion or overwrite behavior.
- After Task 4, perform spec compliance and code-quality review, then run the targeted smoke command and `npm run verify` independently.

## Completion Criteria

- `npm run local:workspace:smoke -- --json` returns a `local-workspace-readiness-smoke.v1` report with `ok: true` and `status: "ready"` in the default local fixture mode.
- The report covers workspace create, mount, ingestion source registration, dry-run inventory, human-approved raw import, evidence import, jobs, diagnostics, workspace verify, disk usage, manifest export, and backup check.
- The smoke uses a real portable workspace manifest, a real SQLite ledger at `ledger/ontology.sqlite`, real file blob storage under the workspace, and workspace ops package operations.
- No standard verification path requires external services, credentials, live provider parsing, old-Cestus artifacts, PRR sends, legal escalation, or network access.
- `npm run verify` passes locally.
- Reviewers record no blocking defects, missing tests, spec drift, invariant violations, or verification gaps.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-local-workspace-readiness-smoke-implementation.md`. Execute this plan only after spec and plan approval.
