# Portable Workspace Mount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared portable workspace mount layer so local Cestus portable mode uses one root and one canonical `ledger/ontology.sqlite` for PRR, ingestion, governance, diagnostics, import, and future reasoning events.

**Architecture:** Create `packages/workspace` as the canonical manifest, layout, and mount package. Wire `packages/local-runtime` to resolve and mount portable workspaces without silent fallback, then delegate the existing ingestion workspace helper to the shared package. Keep repo-local and explicit SQLite modes working as compatibility/developer modes.

**Tech Stack:** TypeScript, Node.js 26, Zod, Vitest, Node `fs`/`path`, Node built-in `node:sqlite`, existing Cestus local-runtime and ingestion packages.

---

## Required Reading

Every worker must read these files before editing task files:

- `AGENTS.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/software-factory.md`
- `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
- `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
- `docs/superpowers/specs/2026-07-05-durable-local-prr-runtime-design.md`
- `docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md`
- `docs/superpowers/specs/2026-07-05-public-ingestion-pipeline-design.md`
- `docs/superpowers/plans/2026-07-05-public-ingestion-pipeline-implementation.md`
- `docs/superpowers/specs/2026-07-06-portable-workspace-mount-design.md`
- this implementation plan

Workers must also read every source and test file listed in their task before editing.

## File Map

- `packages/workspace/src/index.ts`: canonical portable workspace manifest schema, layout path derivation, creation, mounting, typed diagnostics, and secret-key rejection.
- `packages/workspace/test/workspace.test.ts`: canonical layout, mount success, fail-closed mount diagnostics, path containment, and secret-free manifest tests.
- `packages/local-runtime/src/config.ts`: adds `portable-workspace` strategy, `workspaceRoot`, derived canonical SQLite path, and root-required checks.
- `packages/local-runtime/src/config-file.ts`: stores secret-free workspace root config, parses `portable-workspace`, and writes onboarding config.
- `packages/local-runtime/src/cli.ts`: parses `--workspace`, configures portable storage, and exposes explicit `create-workspace`.
- `packages/local-runtime/src/runtime-factory.ts`: mounts portable workspaces before constructing `SQLiteEventLedger`; no fallback on mount failure.
- `packages/local-runtime/src/http-handler.ts`: reports safe health diagnostics for portable workspace mode.
- `packages/local-runtime/test/config.test.ts`: portable config env/default behavior and compatibility-mode regression coverage.
- `packages/local-runtime/test/config-file.test.ts`: config-file parsing/writing for workspace roots and secret-free behavior.
- `packages/local-runtime/test/cli.test.ts`: configure and explicit create-workspace command coverage.
- `packages/local-runtime/test/http-handler.test.ts`: portable runtime create/reopen behavior and health diagnostics.
- `packages/ingestion/src/workspace.ts`: delegates existing ingestion workspace helper to `packages/workspace`.
- `packages/ingestion/test/workspace.test.ts`: verifies ingestion helper preserves layout while using the canonical workspace package.
- `packages/ui/test/request-data-boundary.test.ts`: prevents product UI from importing `packages/workspace` or Node-only mount code.
- `scripts/check-agent-readiness.mjs`: requires this spec and plan after final readiness.
- `docs/agentic/software-factory.md`: records portable workspace mount readiness evidence.
- `package.json`: adds a local workspace creation script.

## Factory Rules

- Use the existing branch or a new task-scoped branch with prefix `codex/`.
- Claim one task before editing its task files.
- Commit the claim, then commit the `in-progress` status transition before editing source or test files.
- Write failing tests or failing readiness checks before production changes.
- Run the exact targeted red command and record the expected failure in the claim.
- Run the targeted green command, then `npm run verify`.
- Commit only task-owned files plus claim/readiness evidence.
- Stop on data-loss risk, schema conflict, unavailable portable root in portable mode, silent fallback behavior, credential need, browser import of Node-only code, or verifier failure after two focused repair attempts.

---

## Task 1: Add Canonical Workspace Package

**Outcome:** `packages/workspace` creates and mounts one canonical portable workspace layout with a strict secret-free manifest and typed fail-closed diagnostics.

**Files:**

- Create: `docs/agentic/claims/task-1-portable-workspace-package.md`
- Create: `packages/workspace/src/index.ts`
- Create: `packages/workspace/test/workspace.test.ts`

### Steps

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-portable-workspace-package.md`:

```markdown
# Task 1: Add Canonical Workspace Package

Plan path: `docs/superpowers/plans/2026-07-06-portable-workspace-mount-implementation.md`
Task heading: `Task 1: Add Canonical Workspace Package`
Worker identity: Codex
Branch: `codex/portable-workspace-mount-design`
Worktree path: `/home/drake/.codex/worktrees/4ea6/Cestus`
Claimed at UTC: run `date -u +"%Y-%m-%dT%H:%M:%SZ"` and paste the emitted timestamp
Status: `claimed`

## Owned Files

- `packages/workspace/src/index.ts`
- `packages/workspace/test/workspace.test.ts`
- `docs/agentic/claims/task-1-portable-workspace-package.md`

## Evidence

- Red command: pending
- Green command: pending
- Full verification: pending

## Review

- Review status: pending
- Concerns: none recorded
```

Run:

```bash
git add docs/agentic/claims/task-1-portable-workspace-package.md
git commit -m "chore: claim task 1 portable workspace package"
```

Expected: commit succeeds.

- [ ] **Step 2: Mark the claim in progress**

Change `Status: claimed` to `Status: in-progress`, then run:

```bash
git add docs/agentic/claims/task-1-portable-workspace-package.md
git commit -m "chore: start task 1 portable workspace package"
```

Expected: commit succeeds.

- [ ] **Step 3: Write the failing workspace package tests**

Create `packages/workspace/test/workspace.test.ts`:

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPortableWorkspace,
  mountPortableWorkspace,
  portableWorkspacePaths,
  readPortableWorkspaceManifest
} from "../src/index.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-workspace-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("portable workspace contract", () => {
  it("creates and mounts the canonical secret-free layout", () => {
    const workspace = createPortableWorkspace({
      rootDir: dir,
      workspaceId: "ws_portable_001",
      label: "External drive case",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "workspace-package-test",
      coreVersion: "0.1.0",
      description: "Portable accountability workspace"
    });

    expect(workspace).toEqual({
      workspaceId: "ws_portable_001",
      label: "External drive case",
      rootDir: resolve(dir),
      manifestPath: join(resolve(dir), "cestus-workspace.json"),
      paths: {
        ledgerPath: join(resolve(dir), "ledger", "ontology.sqlite"),
        blobRoot: join(resolve(dir), "blobs"),
        derivativeRoot: join(resolve(dir), "derivatives"),
        jobRoot: join(resolve(dir), "jobs"),
        projectionRoot: join(resolve(dir), "projections"),
        cacheRoot: join(resolve(dir), "cache"),
        configRoot: join(resolve(dir), "config")
      }
    });
    expect(existsSync(join(dir, "ledger"))).toBe(true);
    expect(existsSync(join(dir, "blobs"))).toBe(true);
    expect(existsSync(join(dir, "derivatives"))).toBe(true);
    expect(existsSync(join(dir, "jobs"))).toBe(true);
    expect(existsSync(join(dir, "projections"))).toBe(true);
    expect(existsSync(join(dir, "cache"))).toBe(true);
    expect(existsSync(join(dir, "config"))).toBe(true);

    const manifest = readPortableWorkspaceManifest({
      manifestPath: workspace.manifestPath
    });
    expect(manifest).toEqual({
      version: 1,
      layoutVersion: 1,
      workspaceId: "ws_portable_001",
      label: "External drive case",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "workspace-package-test",
      coreVersion: "0.1.0",
      description: "Portable accountability workspace"
    });
    expect(JSON.stringify(manifest)).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);

    const mounted = mountPortableWorkspace({ rootDir: dir });
    expect(mounted.ok).toBe(true);
    if (mounted.ok) {
      expect(mounted.workspace.paths.ledgerPath).toBe(join(resolve(dir), "ledger", "ontology.sqlite"));
      expect(mounted.workspace.workspaceId).toBe("ws_portable_001");
    }
  });

  it("derives all canonical paths under the resolved root", () => {
    const paths = portableWorkspacePaths(dir);

    expect(paths).toEqual({
      manifestPath: join(resolve(dir), "cestus-workspace.json"),
      ledgerPath: join(resolve(dir), "ledger", "ontology.sqlite"),
      blobRoot: join(resolve(dir), "blobs"),
      derivativeRoot: join(resolve(dir), "derivatives"),
      jobRoot: join(resolve(dir), "jobs"),
      projectionRoot: join(resolve(dir), "projections"),
      cacheRoot: join(resolve(dir), "cache"),
      configRoot: join(resolve(dir), "config")
    });
    for (const value of Object.values(paths)) {
      expect(value.startsWith(resolve(dir))).toBe(true);
    }
  });

  it("fails closed when the root is missing or uninitialized", () => {
    const missing = mountPortableWorkspace({ rootDir: join(dir, "missing") });
    expect(missing).toEqual({
      ok: false,
      diagnostic: {
        code: "workspace-root-missing",
        message: "Portable workspace root does not exist.",
        allowedRepairActions: ["mount the external drive", "check CESTUS_WORKSPACE_ROOT"]
      }
    });

    const uninitialized = mountPortableWorkspace({ rootDir: dir });
    expect(uninitialized).toEqual({
      ok: false,
      diagnostic: {
        code: "workspace-manifest-missing",
        message: "Portable workspace manifest is missing.",
        allowedRepairActions: ["run the explicit portable workspace create command"]
      }
    });
  });

  it("rejects invalid JSON, unsupported versions, layout conflicts, and secret-looking keys", () => {
    writeFileSync(join(dir, "cestus-workspace.json"), "{not json");
    expect(mountPortableWorkspace({ rootDir: dir })).toMatchObject({
      ok: false,
      diagnostic: { code: "workspace-manifest-invalid-json" }
    });

    writeFileSync(
      join(dir, "cestus-workspace.json"),
      JSON.stringify({
        version: 2,
        layoutVersion: 1,
        workspaceId: "ws_portable_002",
        label: "Unsupported",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "test",
        coreVersion: "0.1.0"
      })
    );
    expect(mountPortableWorkspace({ rootDir: dir })).toMatchObject({
      ok: false,
      diagnostic: { code: "workspace-manifest-unsupported-version" }
    });

    writeFileSync(
      join(dir, "cestus-workspace.json"),
      JSON.stringify({
        version: 1,
        layoutVersion: 1,
        workspaceId: "ws_portable_003",
        label: "Secret-bearing",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "test",
        coreVersion: "0.1.0",
        authToken: "do-not-store"
      })
    );
    expect(mountPortableWorkspace({ rootDir: dir })).toMatchObject({
      ok: false,
      diagnostic: { code: "workspace-secret-material-rejected" }
    });
  });

  it("fails closed for layout conflicts and unavailable ledger paths", () => {
    writeFileSync(join(dir, "blobs"), "not a directory");
    writeFileSync(
      join(dir, "cestus-workspace.json"),
      JSON.stringify({
        version: 1,
        layoutVersion: 1,
        workspaceId: "ws_portable_004",
        label: "Layout conflict",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "test",
        coreVersion: "0.1.0"
      })
    );

    expect(mountPortableWorkspace({ rootDir: dir })).toMatchObject({
      ok: false,
      diagnostic: { code: "workspace-layout-conflict" }
    });

    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "ledger", "ontology.sqlite"), { recursive: true });
    mkdirSync(join(dir, "blobs"), { recursive: true });
    mkdirSync(join(dir, "derivatives"), { recursive: true });
    mkdirSync(join(dir, "jobs"), { recursive: true });
    mkdirSync(join(dir, "projections"), { recursive: true });
    mkdirSync(join(dir, "cache"), { recursive: true });
    mkdirSync(join(dir, "config"), { recursive: true });
    writeFileSync(
      join(dir, "cestus-workspace.json"),
      JSON.stringify({
        version: 1,
        layoutVersion: 1,
        workspaceId: "ws_portable_005",
        label: "Ledger path unavailable",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "test",
        coreVersion: "0.1.0"
      })
    );

    expect(mountPortableWorkspace({ rootDir: dir })).toMatchObject({
      ok: false,
      diagnostic: { code: "workspace-ledger-unavailable" }
    });
  });
});
```

- [ ] **Step 4: Run the targeted red command**

Run:

```bash
npm test -- packages/workspace/test/workspace.test.ts
```

Expected: Vitest fails because `../src/index.js` cannot be resolved.

- [ ] **Step 5: Implement the workspace package**

Create `packages/workspace/src/index.ts` with:

```ts
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

const secretKeyPattern = /token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i;

const portableWorkspaceManifestSchema = z.object({
  version: z.literal(1),
  layoutVersion: z.literal(1),
  workspaceId: z.string().regex(/^ws_[a-zA-Z0-9_-]+$/),
  label: z.string().min(1),
  createdAt: z.string().datetime(),
  createdBy: z.string().min(1),
  coreVersion: z.string().min(1),
  description: z.string().min(1).optional()
}).strict();

export type PortableWorkspaceManifest = z.infer<typeof portableWorkspaceManifestSchema>;

export type PortableWorkspaceMountDiagnosticCode =
  | "workspace-root-required"
  | "workspace-root-missing"
  | "workspace-root-not-directory"
  | "workspace-manifest-missing"
  | "workspace-manifest-invalid-json"
  | "workspace-manifest-invalid"
  | "workspace-manifest-unsupported-version"
  | "workspace-layout-conflict"
  | "workspace-ledger-unavailable"
  | "workspace-secret-material-rejected";

export interface PortableWorkspaceMountDiagnostic {
  readonly code: PortableWorkspaceMountDiagnosticCode;
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
}

export interface PortableWorkspacePaths {
  readonly manifestPath: string;
  readonly ledgerPath: string;
  readonly blobRoot: string;
  readonly derivativeRoot: string;
  readonly jobRoot: string;
  readonly projectionRoot: string;
  readonly cacheRoot: string;
  readonly configRoot: string;
}

export interface MountedPortableWorkspace {
  readonly workspaceId: string;
  readonly label: string;
  readonly rootDir: string;
  readonly manifestPath: string;
  readonly paths: Omit<PortableWorkspacePaths, "manifestPath">;
}

export interface CreatePortableWorkspaceInput {
  readonly rootDir: string;
  readonly workspaceId: string;
  readonly label: string;
  readonly createdAt?: string;
  readonly createdBy: string;
  readonly coreVersion?: string;
  readonly description?: string;
}

export interface MountPortableWorkspaceInput {
  readonly rootDir: string;
}

export interface ReadPortableWorkspaceManifestInput {
  readonly manifestPath: string;
}

export type PortableWorkspaceMountResult =
  | { readonly ok: true; readonly workspace: MountedPortableWorkspace }
  | { readonly ok: false; readonly diagnostic: PortableWorkspaceMountDiagnostic };

export function portableWorkspacePaths(rootDir: string): PortableWorkspacePaths {
  const root = resolve(rootDir);
  return Object.freeze({
    manifestPath: join(root, "cestus-workspace.json"),
    ledgerPath: join(root, "ledger", "ontology.sqlite"),
    blobRoot: join(root, "blobs"),
    derivativeRoot: join(root, "derivatives"),
    jobRoot: join(root, "jobs"),
    projectionRoot: join(root, "projections"),
    cacheRoot: join(root, "cache"),
    configRoot: join(root, "config")
  });
}

export function createPortableWorkspace(input: CreatePortableWorkspaceInput): MountedPortableWorkspace {
  const rootDir = resolve(input.rootDir);
  mkdirSync(rootDir, { recursive: true });
  assertDirectory(rootDir, "workspace root");

  const paths = portableWorkspacePaths(rootDir);
  for (const dir of [
    join(rootDir, "ledger"),
    paths.blobRoot,
    paths.derivativeRoot,
    paths.jobRoot,
    paths.projectionRoot,
    paths.cacheRoot,
    paths.configRoot
  ]) {
    mkdirSync(dir, { recursive: true });
    assertDirectory(dir, "workspace layout directory");
  }

  const manifest = portableWorkspaceManifestSchema.parse({
    version: 1,
    layoutVersion: 1,
    workspaceId: input.workspaceId,
    label: input.label,
    createdAt: input.createdAt ?? new Date().toISOString(),
    createdBy: input.createdBy,
    coreVersion: input.coreVersion ?? "0.1.0",
    ...(input.description === undefined ? {} : { description: input.description })
  });

  writeFileSync(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return mountedWorkspace(rootDir, manifest, paths);
}

export function mountPortableWorkspace(input: MountPortableWorkspaceInput): PortableWorkspaceMountResult {
  const normalizedRoot = input.rootDir.trim();
  if (normalizedRoot.length === 0) {
    return failure("workspace-root-required", "Portable workspace root is required.", [
      "set CESTUS_WORKSPACE_ROOT",
      "pass --workspace <root>"
    ]);
  }

  const rootDir = resolve(normalizedRoot);
  if (!existsSync(rootDir)) {
    return failure("workspace-root-missing", "Portable workspace root does not exist.", [
      "mount the external drive",
      "check CESTUS_WORKSPACE_ROOT"
    ]);
  }
  if (!statSync(rootDir).isDirectory()) {
    return failure("workspace-root-not-directory", "Portable workspace root is not a directory.", [
      "choose a directory created by the portable workspace create command"
    ]);
  }

  const paths = portableWorkspacePaths(rootDir);
  if (!existsSync(paths.manifestPath)) {
    return failure("workspace-manifest-missing", "Portable workspace manifest is missing.", [
      "run the explicit portable workspace create command"
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(paths.manifestPath, "utf8"));
  } catch {
    return failure("workspace-manifest-invalid-json", "Portable workspace manifest is not valid JSON.", [
      "inspect cestus-workspace.json",
      "restore the workspace manifest from backup"
    ]);
  }

  const secretKey = findSecretLikeKey(parsed);
  if (secretKey !== undefined) {
    return failure("workspace-secret-material-rejected", `Portable workspace manifest contains forbidden key ${secretKey}.`, [
      "remove secret material from the workspace manifest",
      "store credentials outside the workspace manifest"
    ]);
  }

  if (hasUnsupportedVersion(parsed)) {
    return failure("workspace-manifest-unsupported-version", "Portable workspace manifest version is not supported.", [
      "open this workspace with a compatible Cestus version"
    ]);
  }

  const manifest = portableWorkspaceManifestSchema.safeParse(parsed);
  if (!manifest.success) {
    return failure("workspace-manifest-invalid", "Portable workspace manifest does not match the schema.", [
      "inspect cestus-workspace.json",
      "restore a valid workspace manifest"
    ]);
  }

  const conflict = firstLayoutConflict(paths);
  if (conflict !== undefined) {
    return failure("workspace-layout-conflict", `Portable workspace path ${conflict} is not a directory.`, [
      "restore the canonical workspace layout",
      "choose a valid portable workspace root"
    ]);
  }

  if (existsSync(paths.ledgerPath) && statSync(paths.ledgerPath).isDirectory()) {
    return failure("workspace-ledger-unavailable", "Portable workspace ledger path is unavailable.", [
      "restore ledger/ontology.sqlite as a SQLite database file",
      "choose a valid portable workspace root"
    ]);
  }

  return { ok: true, workspace: mountedWorkspace(rootDir, manifest.data, paths) };
}

export function readPortableWorkspaceManifest(input: ReadPortableWorkspaceManifestInput): PortableWorkspaceManifest {
  const parsed = JSON.parse(readFileSync(input.manifestPath, "utf8")) as unknown;
  const secretKey = findSecretLikeKey(parsed);
  if (secretKey !== undefined) {
    throw new Error(`Portable workspace manifest contains forbidden key ${secretKey}`);
  }
  return portableWorkspaceManifestSchema.parse(parsed);
}

function mountedWorkspace(
  rootDir: string,
  manifest: PortableWorkspaceManifest,
  paths: PortableWorkspacePaths
): MountedPortableWorkspace {
  return Object.freeze({
    workspaceId: manifest.workspaceId,
    label: manifest.label,
    rootDir,
    manifestPath: paths.manifestPath,
    paths: Object.freeze({
      ledgerPath: paths.ledgerPath,
      blobRoot: paths.blobRoot,
      derivativeRoot: paths.derivativeRoot,
      jobRoot: paths.jobRoot,
      projectionRoot: paths.projectionRoot,
      cacheRoot: paths.cacheRoot,
      configRoot: paths.configRoot
    })
  });
}

function assertDirectory(path: string, label: string): void {
  if (!statSync(path).isDirectory()) {
    throw new Error(`${label} is not a directory: ${path}`);
  }
}

function firstLayoutConflict(paths: PortableWorkspacePaths): string | undefined {
  for (const dir of [
    join(resolve(paths.manifestPath), "..", "ledger"),
    paths.blobRoot,
    paths.derivativeRoot,
    paths.jobRoot,
    paths.projectionRoot,
    paths.cacheRoot,
    paths.configRoot
  ]) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      return dir;
    }
  }
  return undefined;
}

function failure(
  code: PortableWorkspaceMountDiagnosticCode,
  message: string,
  allowedRepairActions: readonly string[]
): PortableWorkspaceMountResult {
  return {
    ok: false,
    diagnostic: Object.freeze({
      code,
      message,
      allowedRepairActions: Object.freeze([...allowedRepairActions])
    })
  };
}

function hasUnsupportedVersion(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.version !== undefined && record.version !== 1;
}

function findSecretLikeKey(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSecretLikeKey(item);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  for (const [key, child] of Object.entries(value)) {
    if (secretKeyPattern.test(key)) {
      return key;
    }
    const found = findSecretLikeKey(child);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}
```

- [ ] **Step 6: Run the targeted green command**

Run:

```bash
npm test -- packages/workspace/test/workspace.test.ts
```

Expected: one test file passes.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit the task**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-1-portable-workspace-package.md packages/workspace/src/index.ts packages/workspace/test/workspace.test.ts
git commit -m "feat: add portable workspace package"
```

Expected: commit succeeds.

**Review gate:** Request review focused on manifest strictness, secret-key rejection, path containment, and fail-closed diagnostics.

**Rollback:** Revert this task commit. No runtime behavior depends on `packages/workspace` until later tasks wire it in.

**Escalate:** Stop if manifest parsing would allow secret-bearing keys, if derived paths can escape the root, or if create/mount behavior implies ledger deletion or rewrite.

---

## Task 2: Add Portable Workspace Config Contract

**Outcome:** Local runtime config and config files understand `portable-workspace`, `CESTUS_WORKSPACE_ROOT`, and `--workspace`, while repo-local and explicit SQLite remain compatibility/developer modes.

**Files:**

- Create: `docs/agentic/claims/task-2-portable-workspace-config.md`
- Modify: `packages/local-runtime/src/config.ts`
- Modify: `packages/local-runtime/src/config-file.ts`
- Modify: `packages/local-runtime/src/cli.ts`
- Modify: `packages/local-runtime/test/config.test.ts`
- Modify: `packages/local-runtime/test/config-file.test.ts`
- Modify: `packages/local-runtime/test/cli.test.ts`

### Steps

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-2-portable-workspace-config.md` with status `claimed`, then update it to `in-progress` and commit that transition before editing source files.

Use commit messages:

```bash
git commit -m "chore: claim task 2 portable workspace config"
git commit -m "chore: start task 2 portable workspace config"
```

Expected: both commits succeed.

- [ ] **Step 2: Write failing config tests**

Add these tests to `packages/local-runtime/test/config.test.ts`:

```ts
  it("requires a workspace root for portable workspace storage", () => {
    expect(() =>
      resolveLocalRuntimeConfig({
        cwd,
        env: {
          CESTUS_LOCAL_STORAGE: "portable-workspace"
        }
      })
    ).toThrow("CESTUS_WORKSPACE_ROOT is required for portable-workspace storage");
  });

  it("resolves portable workspace storage to the canonical ontology ledger path", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: "external/case-a"
      }
    });

    expect(config.storage).toEqual({
      strategy: "portable-workspace",
      workspaceRoot: resolve(cwd, "external/case-a"),
      sqlitePath: resolve(cwd, "external/case-a/ledger/ontology.sqlite")
    });
    expect(config.http.bindMode).toBe("loopback");
    expect(config.http.authRequired).toBe(false);
  });

  it("keeps explicit SQLite storage as a compatibility mode", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "explicit-path",
        CESTUS_LOCAL_SQLITE_PATH: "compat/prr-ledger.sqlite",
        CESTUS_WORKSPACE_ROOT: "external/case-a"
      }
    });

    expect(config.storage).toEqual({
      strategy: "explicit-path",
      sqlitePath: resolve(cwd, "compat/prr-ledger.sqlite")
    });
  });
```

Add this test to `packages/local-runtime/test/config-file.test.ts`:

```ts
  it("writes and reads secret-free portable workspace storage config", () => {
    const cwd = tempDir();

    const written = writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "loopback",
      storageStrategy: "portable-workspace",
      workspaceRoot: "external/case-a"
    });
    const resolved = resolveLocalRuntimeConfig({ cwd, env: {} });

    expect(written.config.storage).toEqual({
      strategy: "portable-workspace",
      workspaceRoot: "external/case-a"
    });
    expect(JSON.stringify(written.config)).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);
    expect(resolved.storage).toEqual({
      strategy: "portable-workspace",
      workspaceRoot: join(cwd, "external/case-a"),
      sqlitePath: join(cwd, "external/case-a", "ledger", "ontology.sqlite")
    });
  });
```

Add this test to `packages/local-runtime/test/cli.test.ts`:

```ts
  it("configures portable workspace storage with --workspace", async () => {
    const stdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    const exitCode = await runLocalRuntimeCli(
      ["configure", "--storage", "portable-workspace", "--workspace", "external/case-a"],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: () => undefined
      }
    );

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain('"strategy": "portable-workspace"');
    expect(stdout.join("\n")).toContain('"workspaceRoot": "external/case-a"');

    const configExitCode = await runLocalRuntimeCli(["config"], {
      cwd: tempDir,
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: () => undefined
    });

    expect(configExitCode).toBe(0);
    expect(stdout.join("\n")).toContain('"sqlitePath": "' + join(tempDir, "external/case-a/ledger/ontology.sqlite") + '"');
  });
```

If `packages/local-runtime/test/cli.test.ts` does not already import `mkdtempSync`, `tmpdir`, or `join`, extend its existing imports rather than duplicating them.

- [ ] **Step 3: Run the targeted red command**

Run:

```bash
npm test -- packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts
```

Expected: tests fail because `portable-workspace`, `workspaceRoot`, and `--workspace` are not implemented.

- [ ] **Step 4: Update local runtime config types and resolution**

In `packages/local-runtime/src/config.ts`:

- Change `LocalRuntimeStorageStrategy` to include `"portable-workspace"`.
- Change `ResolvedLocalRuntimeConfig["storage"]` into a union that includes:

```ts
  | {
      readonly strategy: "repo-local" | "explicit-path" | "app-data";
      readonly sqlitePath: string;
    }
  | {
      readonly strategy: "portable-workspace";
      readonly workspaceRoot: string;
      readonly sqlitePath: string;
    }
```

- In `resolveStorage`, add this branch before `app-data`:

```ts
  if (strategy === "portable-workspace") {
    const workspaceRoot = normalizeOptional(env.CESTUS_WORKSPACE_ROOT) ?? configFile?.storage?.workspaceRoot;
    if (workspaceRoot === undefined) {
      throw new Error("CESTUS_WORKSPACE_ROOT is required for portable-workspace storage");
    }
    const resolvedRoot = resolvePath(cwd, workspaceRoot);
    return Object.freeze({
      strategy,
      workspaceRoot: resolvedRoot,
      sqlitePath: join(resolvedRoot, "ledger", "ontology.sqlite")
    });
  }
```

- In `parseStorageStrategy`, accept `"portable-workspace"`:

```ts
  if (value === "explicit-path" || value === "app-data" || value === "portable-workspace") {
    return value;
  }
```

Keep repo-local and explicit SQLite behavior unchanged.

- [ ] **Step 5: Update config-file parsing and writing**

In `packages/local-runtime/src/config-file.ts`:

- Add `workspaceRoot?: string` to `LocalRuntimeConfigFile["storage"]`.
- Add `workspaceRoot?: string` to `WriteLocalRuntimeOnboardingConfigInput`.
- Allow `"portable-workspace"` in storage strategy enum parsing.
- Allow `"workspaceRoot"` in `parseStorageConfig`.
- Merge `input.workspaceRoot` in `mergeStorageConfig`.
- Extend `validateWritableConfig` with:

```ts
  if (config.storage?.strategy === "portable-workspace" && config.storage.workspaceRoot === undefined) {
    throw new Error("portable-workspace storage requires a workspaceRoot");
  }
```

Do not store any auth material in the storage section.

- [ ] **Step 6: Update CLI configure parsing**

In `packages/local-runtime/src/cli.ts`:

- Add `workspaceRoot?: string` to the internal configure options.
- Add a `--workspace` flag:

```ts
    if (arg === "--workspace") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.workspaceRoot = value;
      index = nextIndex;
      continue;
    }
```

- Include `workspaceRoot` in the returned configure flags:

```ts
    ...(options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot }),
```

- Extend `parseConfigureStorageStrategy` to accept `"portable-workspace"`.

- [ ] **Step 7: Run the targeted green command**

Run:

```bash
npm test -- packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts
```

Expected: listed tests pass.

- [ ] **Step 8: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 9: Commit the task**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-2-portable-workspace-config.md packages/local-runtime/src/config.ts packages/local-runtime/src/config-file.ts packages/local-runtime/src/cli.ts packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts
git commit -m "feat: add portable workspace config"
```

Expected: commit succeeds.

**Review gate:** Request review focused on root-required behavior, compatibility-mode preservation, config-file secret safety, and CLI parsing.

**Rollback:** Revert this task commit. `packages/workspace` remains independently useful.

**Escalate:** Stop if portable mode can resolve without a root, if env/config precedence breaks existing auth behavior, or if repo-local/explicit SQLite behavior changes outside the tested compatibility path.

---

## Task 3: Add Explicit Workspace Creation CLI

**Outcome:** Operators can explicitly initialize a portable workspace root through local runtime CLI; normal runtime startup still never auto-creates a portable workspace.

**Files:**

- Create: `docs/agentic/claims/task-3-portable-workspace-create-cli.md`
- Modify: `packages/local-runtime/src/cli.ts`
- Modify: `packages/local-runtime/test/cli.test.ts`
- Modify: `package.json`

### Steps

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-3-portable-workspace-create-cli.md` with status `claimed`, then update it to `in-progress` and commit that transition before editing source files.

Use commit messages:

```bash
git commit -m "chore: claim task 3 portable workspace create cli"
git commit -m "chore: start task 3 portable workspace create cli"
```

Expected: both commits succeed.

- [ ] **Step 2: Write failing CLI creation tests**

Add this test to `packages/local-runtime/test/cli.test.ts`:

```ts
  it("explicitly creates a portable workspace without printing secret material", async () => {
    const stdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    const workspaceRoot = join(tempDir, "external-case");

    const exitCode = await runLocalRuntimeCli(
      [
        "create-workspace",
        "--workspace",
        workspaceRoot,
        "--workspace-id",
        "ws_cli_001",
        "--label",
        "CLI Portable Workspace",
        "--created-at",
        "2026-07-06T12:00:00.000Z"
      ],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: () => undefined
      }
    );

    expect(exitCode).toBe(0);
    const output = JSON.parse(stdout.join("\n")) as {
      ok: true;
      workspace: {
        workspaceId: string;
        manifestPath: string;
        paths: { ledgerPath: string };
      };
    };
    expect(output.workspace.workspaceId).toBe("ws_cli_001");
    expect(output.workspace.paths.ledgerPath).toBe(join(workspaceRoot, "ledger", "ontology.sqlite"));
    expect(readFileSync(join(workspaceRoot, "cestus-workspace.json"), "utf8")).toContain('"workspaceId": "ws_cli_001"');
    expect(stdout.join("\n")).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);
  });
```

If `readFileSync` is not imported in `packages/local-runtime/test/cli.test.ts`, extend the existing `node:fs` import.

- [ ] **Step 3: Run the targeted red command**

Run:

```bash
npm test -- packages/local-runtime/test/cli.test.ts
```

Expected: the new test fails because `create-workspace` is not implemented.

- [ ] **Step 4: Implement the CLI command**

In `packages/local-runtime/src/cli.ts`:

- Import `createPortableWorkspace`:

```ts
import { createPortableWorkspace } from "../../workspace/src/index.js";
```

- Add this command branch before `config`:

```ts
    if (command === "create-workspace") {
      const workspace = createPortableWorkspace(parseCreateWorkspaceArgs(argv.slice(1)));
      stdout(
        JSON.stringify(
          {
            ok: true,
            workspace
          },
          null,
          2
        )
      );
      return 0;
    }
```

- Add these helpers:

```ts
function parseCreateWorkspaceArgs(argv: readonly string[]) {
  const options: {
    rootDir?: string;
    workspaceId?: string;
    label?: string;
    createdAt?: string;
    createdBy?: string;
    coreVersion?: string;
    description?: string;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--workspace") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.rootDir = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--workspace-id") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.workspaceId = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--label") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.label = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--created-at") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.createdAt = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--created-by") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.createdBy = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--core-version") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.coreVersion = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--description") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.description = value;
      index = nextIndex;
      continue;
    }
    throw new Error(
      arg.startsWith("--") ? `Unknown create-workspace flag: ${arg}` : `Unexpected create-workspace argument: ${arg}`
    );
  }

  if (options.rootDir === undefined) {
    throw new Error("create-workspace requires --workspace <root>");
  }
  if (options.workspaceId === undefined) {
    throw new Error("create-workspace requires --workspace-id <id>");
  }
  if (options.label === undefined) {
    throw new Error("create-workspace requires --label <label>");
  }

  return {
    rootDir: options.rootDir,
    workspaceId: options.workspaceId,
    label: options.label,
    createdBy: options.createdBy ?? "cestus-local-runtime",
    ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    ...(options.coreVersion === undefined ? {} : { coreVersion: options.coreVersion }),
    ...(options.description === undefined ? {} : { description: options.description })
  };
}
```

- [ ] **Step 5: Add package script**

Modify `package.json` scripts:

```json
"local:workspace:create": "tsx packages/local-runtime/src/cli.ts create-workspace"
```

Keep existing scripts unchanged.

- [ ] **Step 6: Run the targeted green command**

Run:

```bash
npm test -- packages/local-runtime/test/cli.test.ts
```

Expected: CLI tests pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit the task**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-3-portable-workspace-create-cli.md packages/local-runtime/src/cli.ts packages/local-runtime/test/cli.test.ts package.json
git commit -m "feat: add portable workspace creation cli"
```

Expected: commit succeeds.

**Review gate:** Request review focused on explicit creation, no runtime auto-create behavior, and secret-free CLI output.

**Rollback:** Revert this task commit. Portable workspaces can still be created through `packages/workspace` tests and future callers.

**Escalate:** Stop if CLI creation overwrites an existing manifest, prints secret material, or implies migration from repo-local SQLite.

---

## Task 4: Mount Portable Workspace In Local Runtime

**Outcome:** Local runtime portable mode mounts the requested workspace, uses `ledger/ontology.sqlite`, fails closed without fallback, and proves PRR draft replay after restart.

**Files:**

- Create: `docs/agentic/claims/task-4-local-runtime-portable-mount.md`
- Modify: `packages/local-runtime/src/runtime-factory.ts`
- Modify: `packages/local-runtime/src/http-handler.ts`
- Modify: `packages/local-runtime/test/http-handler.test.ts`

### Steps

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-4-local-runtime-portable-mount.md` with status `claimed`, then update it to `in-progress` and commit that transition before editing source files.

Use commit messages:

```bash
git commit -m "chore: claim task 4 local runtime portable mount"
git commit -m "chore: start task 4 local runtime portable mount"
```

Expected: both commits succeed.

- [ ] **Step 2: Write failing runtime mount tests**

In `packages/local-runtime/test/http-handler.test.ts`, import the workspace creator:

```ts
import { createPortableWorkspace } from "../../workspace/src/index.js";
```

Add this test:

```ts
  it("creates drafts in the mounted portable workspace ledger and replays them after reopen", async () => {
    const cwd = tempDir();
    const workspaceRoot = join(cwd, "external-case");
    createPortableWorkspace({
      rootDir: workspaceRoot,
      workspaceId: "ws_runtime_001",
      label: "Runtime portable workspace",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "local-runtime-test"
    });
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: workspaceRoot
      }
    });
    const first = createLocalRuntimeHttpHandler({
      config,
      actor,
      now: fixedNow,
      requestIdFactory: () => "prr_portable_city_budget"
    });

    const created = await first({
      method: "POST",
      url: "/api/requests/drafts",
      body: JSON.stringify({
        jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
        agency: { name: "City Clerk", email: "clerk@example.gov" },
        requester: { name: "Avery Investigator", email: "avery@example.org" },
        requestText: "All budget amendment memos from January 2026.",
        receivedAt: "2026-07-05T12:00:00.000Z"
      })
    });
    first.close();

    expect(created.status).toBe(200);
    expect(JSON.parse(created.body)).toMatchObject({
      ok: true,
      prrRequestId: "prr_portable_city_budget"
    });
    expect(existsSync(join(workspaceRoot, "ledger", "ontology.sqlite"))).toBe(true);
    expect(existsSync(join(cwd, ".cestus/local/prr-ledger.sqlite"))).toBe(false);

    const second = createLocalRuntimeHttpHandler({ config, actor, now: fixedNow });
    const reloaded = await second({ method: "GET", url: "/api/requests/workspace" });
    second.close();

    expect(JSON.parse(reloaded.body).cards.map((card: { prrRequestId: string }) => card.prrRequestId)).toContain(
      "prr_portable_city_budget"
    );
  });
```

Add this test:

```ts
  it("fails closed instead of falling back when the portable workspace is not mounted", () => {
    const cwd = tempDir();
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: join(cwd, "missing-drive")
      }
    });

    expect(() =>
      createLocalRuntimeHttpHandler({
        config,
        actor,
        now: fixedNow
      })
    ).toThrow("Portable workspace root does not exist.");
    expect(existsSync(join(cwd, ".cestus/local/prr-ledger.sqlite"))).toBe(false);
  });
```

If `existsSync` is not imported in `packages/local-runtime/test/http-handler.test.ts`, extend its `node:fs` import.

- [ ] **Step 3: Run the targeted red command**

Run:

```bash
npm test -- packages/local-runtime/test/http-handler.test.ts
```

Expected: tests fail because runtime factory does not mount portable workspaces.

- [ ] **Step 4: Mount portable workspaces in runtime factory**

In `packages/local-runtime/src/runtime-factory.ts`, import:

```ts
import { mountPortableWorkspace, type MountedPortableWorkspace } from "../../workspace/src/index.js";
```

Update `LocalRuntimeHandle`:

```ts
export interface LocalRuntimeHandle {
  readonly runtime: PrrRuntime;
  readonly mountedWorkspace?: MountedPortableWorkspace;
  close(): void;
}
```

Add this helper:

```ts
function sqlitePathFor(config: ResolvedLocalRuntimeConfig): {
  readonly sqlitePath: string;
  readonly mountedWorkspace?: MountedPortableWorkspace;
} {
  if (config.storage.strategy !== "portable-workspace") {
    return { sqlitePath: config.storage.sqlitePath };
  }

  const mounted = mountPortableWorkspace({ rootDir: config.storage.workspaceRoot });
  if (!mounted.ok) {
    throw new Error(mounted.diagnostic.message);
  }

  return {
    sqlitePath: mounted.workspace.paths.ledgerPath,
    mountedWorkspace: mounted.workspace
  };
}
```

Update `createSqlitePrrRuntime` to use it:

```ts
  const resolvedStorage = sqlitePathFor(dependencies.config);
  const ledger = new SQLiteEventLedger(resolvedStorage.sqlitePath);
```

Return `mountedWorkspace` when present:

```ts
    ...(resolvedStorage.mountedWorkspace === undefined
      ? {}
      : { mountedWorkspace: resolvedStorage.mountedWorkspace }),
```

Do not catch mount failures and do not construct a repo-local fallback path.

- [ ] **Step 5: Add safe health diagnostics**

In `packages/local-runtime/src/http-handler.ts`, include mounted workspace status in `/api/health`:

```ts
        workspaceMounted: handle.mountedWorkspace !== undefined,
        ...(handle.mountedWorkspace === undefined
          ? {}
          : { workspaceId: handle.mountedWorkspace.workspaceId })
```

Do not include auth tokens or provider secrets. Do not include absolute workspace paths in this browser-facing health response.

- [ ] **Step 6: Run the targeted green command**

Run:

```bash
npm test -- packages/local-runtime/test/http-handler.test.ts packages/local-runtime/test/auth-and-seed.test.ts
```

Expected: listed tests pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit the task**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-4-local-runtime-portable-mount.md packages/local-runtime/src/runtime-factory.ts packages/local-runtime/src/http-handler.ts packages/local-runtime/test/http-handler.test.ts
git commit -m "feat: mount portable workspace runtime"
```

Expected: commit succeeds.

**Review gate:** Request review focused on no silent fallback, one canonical ledger path, safe diagnostics, and PRR replay after restart.

**Rollback:** Revert this task commit. Config can still resolve portable workspace roots, but runtime will not use them until this task lands.

**Escalate:** Stop if portable startup can create `.cestus/local/prr-ledger.sqlite`, if health leaks absolute paths or secret material, or if mount failures are converted into repo-local runtime behavior.

---

## Task 5: Delegate Ingestion Workspace To Canonical Package

**Outcome:** Ingestion keeps its public helper names but delegates manifest and layout creation to `packages/workspace`, preserving the canonical root and `ledger/ontology.sqlite`.

**Files:**

- Create: `docs/agentic/claims/task-5-ingestion-workspace-delegation.md`
- Modify: `packages/ingestion/src/workspace.ts`
- Modify: `packages/ingestion/test/workspace.test.ts`

### Steps

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-5-ingestion-workspace-delegation.md` with status `claimed`, then update it to `in-progress` and commit that transition before editing source files.

Use commit messages:

```bash
git commit -m "chore: claim task 5 ingestion workspace delegation"
git commit -m "chore: start task 5 ingestion workspace delegation"
```

Expected: both commits succeed.

- [ ] **Step 2: Write the failing ingestion delegation test**

Replace `packages/ingestion/test/workspace.test.ts` with:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readPortableWorkspaceManifest as readCanonicalManifest } from "../../workspace/src/index.js";
import { createPortableIngestionWorkspace, readPortableWorkspaceManifest } from "../src/workspace.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-ingestion-workspace-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("portable ingestion workspace", () => {
  it("delegates to the canonical portable workspace layout with no secrets", () => {
    const workspace = createPortableIngestionWorkspace({
      rootDir: dir,
      workspaceId: "ws_ingestion_001",
      label: "External drive corpus",
      createdAt: "2026-07-06T12:00:00.000Z"
    });

    expect(workspace).toEqual({
      workspaceId: "ws_ingestion_001",
      label: "External drive corpus",
      rootDir: dir,
      manifestPath: join(dir, "cestus-workspace.json"),
      ledgerPath: join(dir, "ledger", "ontology.sqlite"),
      blobRoot: join(dir, "blobs"),
      derivativeRoot: join(dir, "derivatives"),
      jobRoot: join(dir, "jobs"),
      projectionRoot: join(dir, "projections"),
      cacheRoot: join(dir, "cache"),
      configRoot: join(dir, "config")
    });
    expect(readPortableWorkspaceManifest(workspace.manifestPath)).toEqual({
      version: 1,
      layoutVersion: 1,
      workspaceId: "ws_ingestion_001",
      label: "External drive corpus",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "cestus-ingest",
      coreVersion: "0.1.0"
    });
    expect(readCanonicalManifest({ manifestPath: workspace.manifestPath })).toEqual(
      readPortableWorkspaceManifest(workspace.manifestPath)
    );
    expect(JSON.stringify(readPortableWorkspaceManifest(workspace.manifestPath))).not.toMatch(/token|secret|password/i);
  });
});
```

- [ ] **Step 3: Run the targeted red command**

Run:

```bash
npm test -- packages/ingestion/test/workspace.test.ts
```

Expected: test fails because ingestion helper does not include canonical projection/cache/config paths and does not delegate to `packages/workspace`.

- [ ] **Step 4: Delegate implementation**

Replace `packages/ingestion/src/workspace.ts` with:

```ts
import {
  createPortableWorkspace,
  readPortableWorkspaceManifest as readCanonicalPortableWorkspaceManifest,
  type PortableWorkspaceManifest
} from "../../workspace/src/index.js";

export type { PortableWorkspaceManifest };

export interface CreatePortableWorkspaceInput {
  rootDir: string;
  workspaceId: string;
  label: string;
  createdAt?: string;
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
  projectionRoot: string;
  cacheRoot: string;
  configRoot: string;
}

export function createPortableIngestionWorkspace(input: CreatePortableWorkspaceInput): PortableIngestionWorkspace {
  const workspace = createPortableWorkspace({
    rootDir: input.rootDir,
    workspaceId: input.workspaceId,
    label: input.label,
    createdBy: "cestus-ingest",
    ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt })
  });

  return {
    workspaceId: workspace.workspaceId,
    label: workspace.label,
    rootDir: input.rootDir,
    manifestPath: workspace.manifestPath,
    ledgerPath: workspace.paths.ledgerPath,
    blobRoot: workspace.paths.blobRoot,
    derivativeRoot: workspace.paths.derivativeRoot,
    jobRoot: workspace.paths.jobRoot,
    projectionRoot: workspace.paths.projectionRoot,
    cacheRoot: workspace.paths.cacheRoot,
    configRoot: workspace.paths.configRoot
  };
}

export function readPortableWorkspaceManifest(manifestPath: string): PortableWorkspaceManifest {
  return readCanonicalPortableWorkspaceManifest({ manifestPath });
}
```

This keeps the existing ingestion function names while making `packages/workspace` the storage contract owner.

- [ ] **Step 5: Run the targeted green command**

Run:

```bash
npm test -- packages/ingestion/test/workspace.test.ts packages/workspace/test/workspace.test.ts
```

Expected: listed tests pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 7: Commit the task**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-5-ingestion-workspace-delegation.md packages/ingestion/src/workspace.ts packages/ingestion/test/workspace.test.ts
git commit -m "refactor: delegate ingestion workspace layout"
```

Expected: commit succeeds.

**Review gate:** Request review focused on canonical package ownership, ingestion compatibility, and secret-free manifests.

**Rollback:** Revert this task commit. Local runtime portable mode remains usable, but ingestion will not yet share the canonical helper.

**Escalate:** Stop if ingestion delegation changes event contracts, raw import semantics, provider approval gates, or blob content-addressing behavior.

---

## Task 6: Final Readiness And Boundary Evidence

**Outcome:** Factory readiness tracks the portable workspace spec and plan, UI boundary tests prevent Node-only workspace imports, full verification passes, and factory evidence is recorded.

**Files:**

- Create: `docs/agentic/claims/task-6-portable-workspace-readiness.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`
- Modify: `packages/ui/test/request-data-boundary.test.ts`

### Steps

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-6-portable-workspace-readiness.md` with status `claimed`, then update it to `in-progress` and commit that transition before editing source files.

Use commit messages:

```bash
git commit -m "chore: claim task 6 portable workspace readiness"
git commit -m "chore: start task 6 portable workspace readiness"
```

Expected: both commits succeed.

- [ ] **Step 2: Write failing readiness and boundary expectations**

Update `packages/ui/test/request-data-boundary.test.ts` so the factory readiness expectation includes:

```ts
const portableWorkspaceSpecPath = "docs/superpowers/specs/2026-07-06-portable-workspace-mount-design.md";
const portableWorkspacePlanPath = "docs/superpowers/plans/2026-07-06-portable-workspace-mount-implementation.md";
expect(requiredFiles).toEqual(expect.arrayContaining([portableWorkspaceSpecPath, portableWorkspacePlanPath]));
```

Update the UI import boundary in the same test file so product UI source is forbidden from importing:

```ts
"../../workspace/src"
"packages/workspace"
"../workspace"
"node:fs"
"node:path"
```

Use the existing test style in `request-data-boundary.test.ts` for scanning source text.

- [ ] **Step 3: Run the targeted red command**

Run:

```bash
npm test -- packages/ui/test/request-data-boundary.test.ts
```

Expected: readiness expectation fails because `scripts/check-agent-readiness.mjs` does not yet require the portable workspace spec and plan.

- [ ] **Step 4: Update factory readiness script**

In `scripts/check-agent-readiness.mjs`, add these paths to `requiredFiles`:

```js
  "docs/superpowers/specs/2026-07-06-portable-workspace-mount-design.md",
  "docs/superpowers/plans/2026-07-06-portable-workspace-mount-implementation.md"
```

- [ ] **Step 5: Record readiness evidence in software-factory docs**

Append this section to `docs/agentic/software-factory.md`:

````markdown
## Portable Workspace Mount Plan Readiness

The portable workspace mount plan was prepared from the approved design spec on 2026-07-06.

Required design and plan files:

- `docs/superpowers/specs/2026-07-06-portable-workspace-mount-design.md`
- `docs/superpowers/plans/2026-07-06-portable-workspace-mount-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded targeted command evidence from the implementation slice:

```text
npm test -- packages/workspace/test/workspace.test.ts
workspace package tests passed

npm test -- packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts
local runtime config and CLI tests passed

npm test -- packages/local-runtime/test/http-handler.test.ts packages/local-runtime/test/auth-and-seed.test.ts
local runtime portable mount tests passed

npm test -- packages/ingestion/test/workspace.test.ts packages/workspace/test/workspace.test.ts
ingestion workspace delegation tests passed

npm test -- packages/ui/test/request-data-boundary.test.ts
UI boundary and readiness tests passed
```

Final verification evidence:

```text
npm run factory:check
factory-readiness passed

npm run verify
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

Portable mode uses one canonical workspace root and one canonical `ledger/ontology.sqlite`. Repo-local and explicit SQLite modes remain compatibility/developer modes. Silent fallback to internal storage is forbidden in portable mode.
````

If exact test counts differ, record exact counts observed in the claim and final docs before committing.

- [ ] **Step 6: Run targeted green commands**

Run:

```bash
npm test -- packages/ui/test/request-data-boundary.test.ts
npm run factory:check
```

Expected: UI boundary test passes and factory readiness passes.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit readiness**

Update the claim with command evidence and status `ready-for-review`, then run:

```bash
git add docs/agentic/claims/task-6-portable-workspace-readiness.md scripts/check-agent-readiness.mjs docs/agentic/software-factory.md packages/ui/test/request-data-boundary.test.ts
git commit -m "test: finalize portable workspace readiness"
```

Expected: commit succeeds.

**Review gate:** Request final review focused on spec/plan readiness, UI boundary safety, verification evidence, and preservation of all portable workspace invariants.

**Rollback:** Revert this task commit. Functional portable workspace changes remain reviewable, but factory readiness will not yet require this slice.

**Escalate:** Stop if full verification fails after two focused repair attempts or if UI boundary checks cannot prevent Node-only workspace imports.

---

## Milestone Review Gates

- After Task 1, review the shared workspace package for manifest strictness, secret-free metadata, path containment, and fail-closed diagnostics.
- After Task 2, review config behavior for root-required portable mode and compatibility-mode preservation.
- After Task 4, review runtime behavior for one canonical ledger, no silent fallback, safe health diagnostics, and PRR replay after restart.
- After Task 5, review ingestion delegation for canonical workspace ownership and no ingestion event-contract drift.
- After Task 6, perform final factory readiness review.

## Completion Criteria

- `packages/workspace` exists and owns the portable workspace contract.
- `createPortableWorkspace` creates `cestus-workspace.json`, `ledger/`, `blobs/`, `derivatives/`, `jobs/`, `projections/`, `cache/`, and `config/`.
- `mountPortableWorkspace` returns typed success or fail-closed diagnostics.
- Portable workspace manifests are strict, versioned, secret-free, and AI-legible.
- Portable mode uses one canonical `ledger/ontology.sqlite`.
- Portable mode never silently falls back to repo-local, app-data, or explicit SQLite storage.
- Repo-local and explicit SQLite modes still work as compatibility/developer modes.
- Local runtime config supports `CESTUS_WORKSPACE_ROOT` and `--workspace`.
- The CLI has an explicit portable workspace creation command.
- PRR draft creation writes to and replays from the mounted portable workspace ledger.
- Ingestion workspace helper delegates to `packages/workspace`.
- Product UI cannot import Node-only workspace or runtime code.
- `npm run verify` passes.
- Factory readiness requires the portable workspace spec and plan.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-portable-workspace-mount-implementation.md`. Execute this plan only after plan review approval.

Two execution options after approval:

1. **Subagent-Driven (recommended)** - dispatch a fresh worker for each task, then run review between tasks.
2. **Inline Execution** - execute tasks in this session with checkpoint reviews after each task.

Do not begin implementation until the plan is approved.
