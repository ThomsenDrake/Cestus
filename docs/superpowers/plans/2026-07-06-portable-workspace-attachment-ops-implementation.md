# Portable Workspace Attachment Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the external-drive portable workspace attachment flow operator-ready through CLI/runtime commands backed by canonical mount validation, expected workspace identity checks, and real workspace ops executable wiring.

**Architecture:** Keep `packages/workspace` as the canonical manifest and mount owner. Add secret-free expected identity guardrails to local runtime config and bind `packages/workspace-ops` to the canonical layout for real read-only CLI commands. Runtime portable mode continues to open only the mounted workspace ledger and never falls back to internal storage.

**Tech Stack:** TypeScript, Node.js 26, npm, Vitest, Zod, Node built-in `node:sqlite`, TSX runtime scripts, Markdown factory docs.

---

## Required Reading

Before implementation, read:

- `AGENTS.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/software-factory.md`
- `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
- `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
- `docs/superpowers/specs/2026-07-06-portable-workspace-mount-design.md`
- `docs/superpowers/plans/2026-07-06-portable-workspace-mount-implementation.md`
- `docs/superpowers/specs/2026-07-06-portable-workspace-ops-design.md`
- `docs/superpowers/plans/2026-07-06-portable-workspace-ops-implementation.md`
- `docs/superpowers/specs/2026-07-06-portable-workspace-attachment-ops-design.md`
- this plan

## Software Factory Rules

- Use a task-scoped branch or isolated worktree.
- Claim one task in `docs/agentic/claims/task-<number>-<short-slug>.md` and commit the claim before editing task files.
- Mark the claim `in-progress` and commit that transition before writing tests.
- Write failing tests first.
- Run the exact targeted command in the task and record expected failure in the claim.
- Implement the smallest scoped change.
- Run the targeted green command.
- Run `npm run verify`.
- Commit only the task files plus the claim and readiness evidence named by the task.
- Stop on data-loss risk, schema conflict, unavailable dependency, credential need, external-service dependency, silent fallback to internal storage, browser import of Node-only code, or the same verifier failing after two focused repair attempts.

## File Map

- `packages/workspace/src/index.ts`: canonical manifest parsing, mount validation, optional expected workspace identity, path derivation, and mount diagnostics.
- `packages/workspace/test/workspace.test.ts`: canonical mount identity mismatch and manifest parser tests.
- `packages/local-runtime/src/config.ts`: portable runtime config resolution including expected workspace ID and env override.
- `packages/local-runtime/src/config-file.ts`: secret-free config-file shape and configure writing for expected workspace ID.
- `packages/local-runtime/src/cli.ts`: operator create/configure parsing, generated workspace IDs, and safe JSON output.
- `packages/local-runtime/src/runtime-factory.ts`: passes expected workspace ID into canonical mount validation.
- `packages/local-runtime/test/config.test.ts`: expected workspace ID env/config resolution.
- `packages/local-runtime/test/config-file.test.ts`: config file parsing/writing and secret-safety tests.
- `packages/local-runtime/test/cli.test.ts`: generated workspace ID and configure identity tests.
- `packages/local-runtime/test/http-handler.test.ts`: runtime fail-closed behavior for swapped workspace IDs and safe health output.
- `packages/workspace-ops/src/contracts.ts`: canonical layout category support and DTO stability.
- `packages/workspace-ops/src/layout.ts`: canonical manifest and path adapter replacing provisional runtime behavior.
- `packages/workspace-ops/src/ops.ts`: verify and disk usage behavior for canonical roots and absent-but-valid uninitialized ledger file.
- `packages/workspace-ops/src/node-runner.ts`: Node wiring for real workspace ops commands.
- `packages/workspace-ops/src/node-cli.ts`: executable CLI entrypoint that parses root and workspace identity flags.
- `packages/workspace-ops/bin/cestus-workspace.mjs`: shim to run the TSX-backed CLI without hidden globals.
- `packages/workspace-ops/test/layout.test.ts`: canonical layout, no-create missing-drive, and wrong-drive tests.
- `packages/workspace-ops/test/ops.test.ts`: verify behavior for uninitialized, valid, and invalid ledgers.
- `packages/workspace-ops/test/cli.test.ts`: real executable command JSON and exit-code tests.
- `package.json`: workspace ops scripts.
- `docs/agentic/software-factory.md`: final readiness evidence after all implementation tasks pass.
- `scripts/check-agent-readiness.mjs`: include this approved spec and plan only in the final readiness task.

## Task 1: Add Canonical Expected Workspace Identity

**Outcome:** `packages/workspace` can fail closed when a caller expects one workspace ID but the mounted manifest contains another.

**Files:**
- Create: `docs/agentic/claims/task-1-portable-attachment-identity.md`
- Modify: `packages/workspace/src/index.ts`
- Modify: `packages/workspace/test/workspace.test.ts`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-portable-attachment-identity.md`:

```md
# Task 1: Portable Attachment Identity Claim

Plan path: `docs/superpowers/plans/2026-07-06-portable-workspace-attachment-ops-implementation.md`
Task heading: `Task 1: Add Canonical Expected Workspace Identity`
Worker identity: Codex
Branch: `codex/portable-workspace-attachment-ops`
Worktree: `/home/drake/.codex/worktrees/db41/Cestus`
Claimed at: 2026-07-06T00:00:00.000Z
Status: claimed

## Owned Files

- `packages/workspace/src/index.ts`
- `packages/workspace/test/workspace.test.ts`

## Evidence

- Targeted red command:
- Targeted green command:
- Full verification:

## Review

- Pending.
```

Run:

```bash
git add docs/agentic/claims/task-1-portable-attachment-identity.md
git commit -m "chore: claim task 1 portable attachment identity"
```

- [ ] **Step 2: Mark the claim in progress**

Edit the claim status to `in-progress`, then run:

```bash
git add docs/agentic/claims/task-1-portable-attachment-identity.md
git commit -m "chore: start task 1 portable attachment identity"
```

- [ ] **Step 3: Write the failing workspace identity tests**

Add these tests to `packages/workspace/test/workspace.test.ts`:

```ts
  it("fails closed when the mounted workspace identity does not match the expected identity", () => {
    createPortableWorkspace({
      rootDir: dir,
      workspaceId: "ws_actual_drive",
      label: "Actual Drive",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "workspace-package-test",
      coreVersion: "0.1.0"
    });

    const mounted = mountPortableWorkspace({
      rootDir: dir,
      expectedWorkspaceId: "ws_expected_drive"
    });

    expect(mounted).toEqual({
      ok: false,
      diagnostic: {
        code: "workspace-identity-mismatch",
        message: "Portable workspace identity does not match the expected workspace.",
        allowedRepairActions: [
          "select the expected workspace root",
          "check CESTUS_WORKSPACE_ID"
        ]
      }
    });
    expect(JSON.stringify(mounted)).not.toContain("ws_actual_drive");
  });

  it("mounts when the expected workspace identity matches the manifest", () => {
    createPortableWorkspace({
      rootDir: dir,
      workspaceId: "ws_expected_drive",
      label: "Expected Drive",
      createdAt: "2026-07-06T12:00:00.000Z",
      createdBy: "workspace-package-test",
      coreVersion: "0.1.0"
    });

    const mounted = mountPortableWorkspace({
      rootDir: dir,
      expectedWorkspaceId: "ws_expected_drive"
    });

    expect(mounted.ok).toBe(true);
    if (mounted.ok) {
      expect(mounted.workspace.workspaceId).toBe("ws_expected_drive");
    }
  });
```

- [ ] **Step 4: Run the targeted red command**

Run:

```bash
npm test -- packages/workspace/test/workspace.test.ts
```

Expected: TypeScript or Vitest fails because `expectedWorkspaceId` and `workspace-identity-mismatch` are not yet supported.

- [ ] **Step 5: Implement identity validation**

In `packages/workspace/src/index.ts`, update the public types:

```ts
export type WorkspaceMountDiagnosticCode =
  | "workspace-root-required"
  | "workspace-root-missing"
  | "workspace-root-not-directory"
  | "workspace-manifest-missing"
  | "workspace-manifest-invalid-json"
  | "workspace-manifest-invalid"
  | "workspace-manifest-unsupported-version"
  | "workspace-layout-conflict"
  | "workspace-ledger-unavailable"
  | "workspace-secret-material-rejected"
  | "workspace-identity-mismatch";

export interface MountPortableWorkspaceInput {
  readonly rootDir: string;
  readonly expectedWorkspaceId?: string;
}
```

After manifest schema validation in `mountPortableWorkspace`, before layout conflict checks, add:

```ts
  if (
    input.expectedWorkspaceId !== undefined &&
    manifest.data.workspaceId !== input.expectedWorkspaceId
  ) {
    return failure(
      "workspace-identity-mismatch",
      "Portable workspace identity does not match the expected workspace.",
      ["select the expected workspace root", "check CESTUS_WORKSPACE_ID"]
    );
  }
```

- [ ] **Step 6: Run the targeted green command**

Run:

```bash
npm test -- packages/workspace/test/workspace.test.ts
```

Expected: workspace package tests pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit**

Update the claim evidence, then run:

```bash
git add docs/agentic/claims/task-1-portable-attachment-identity.md packages/workspace/src/index.ts packages/workspace/test/workspace.test.ts
git commit -m "feat: guard portable workspace identity"
```

**Review gate:** Review for secret-safe mismatch diagnostics and no leakage of the unexpected workspace ID.

## Task 2: Add Operator Create And Configure Identity Flow

**Outcome:** Operators can create a workspace without hand-authoring an ID, configure portable runtime storage with an expected ID, and resolve that ID from config or env.

**Files:**
- Create: `docs/agentic/claims/task-2-portable-attachment-config.md`
- Modify: `packages/local-runtime/src/config.ts`
- Modify: `packages/local-runtime/src/config-file.ts`
- Modify: `packages/local-runtime/src/cli.ts`
- Modify: `packages/local-runtime/src/runtime-factory.ts`
- Modify: `packages/local-runtime/test/config.test.ts`
- Modify: `packages/local-runtime/test/config-file.test.ts`
- Modify: `packages/local-runtime/test/cli.test.ts`
- Modify: `packages/local-runtime/test/http-handler.test.ts`

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-2-portable-attachment-config.md` with status `claimed`, then update it to `in-progress` and commit that transition before editing tests.

Commands:

```bash
git add docs/agentic/claims/task-2-portable-attachment-config.md
git commit -m "chore: claim task 2 portable attachment config"
git add docs/agentic/claims/task-2-portable-attachment-config.md
git commit -m "chore: start task 2 portable attachment config"
```

- [ ] **Step 2: Write failing config and CLI tests**

Add to `packages/local-runtime/test/config.test.ts`:

```ts
  it("resolves expected portable workspace identity from env over config", () => {
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: "external/case-a",
        CESTUS_WORKSPACE_ID: "ws_env_case"
      }
    });

    expect(config.storage).toEqual({
      strategy: "portable-workspace",
      workspaceRoot: resolve(cwd, "external/case-a"),
      expectedWorkspaceId: "ws_env_case",
      sqlitePath: resolve(cwd, "external/case-a/ledger/ontology.sqlite")
    });
  });
```

Add to `packages/local-runtime/test/config-file.test.ts`:

```ts
  it("writes portable workspace expected identity without secret material", () => {
    const written = writeLocalRuntimeOnboardingConfig({
      cwd,
      env: {},
      bindMode: "loopback",
      storageStrategy: "portable-workspace",
      workspaceRoot: "external/case-a",
      expectedWorkspaceId: "ws_config_case"
    });

    expect(written.config.storage).toEqual({
      strategy: "portable-workspace",
      workspaceRoot: "external/case-a",
      expectedWorkspaceId: "ws_config_case"
    });
    expect(JSON.stringify(written.config)).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);
  });
```

Add to `packages/local-runtime/test/cli.test.ts`:

```ts
  it("generates a portable workspace id when create-workspace omits one", async () => {
    const stdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    const workspaceRoot = join(tempDir, "external-case");

    const exitCode = await runLocalRuntimeCli(
      [
        "create-workspace",
        "--workspace",
        workspaceRoot,
        "--label",
        "Generated Id Workspace",
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

    const output = JSON.parse(stdout.join("\n")) as {
      ok: true;
      workspace: { workspaceId: string };
    };
    expect(exitCode).toBe(0);
    expect(output.workspace.workspaceId).toMatch(/^ws_[a-z0-9_]+$/);
    expect(stdout.join("\n")).not.toMatch(/token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i);
  });

  it("configures expected portable workspace identity with --workspace-id", async () => {
    const stdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));

    const exitCode = await runLocalRuntimeCli(
      [
        "configure",
        "--storage",
        "portable-workspace",
        "--workspace",
        "external/case-a",
        "--workspace-id",
        "ws_cli_case"
      ],
      {
        cwd: tempDir,
        env: {},
        stdout: (line) => stdout.push(line),
        stderr: () => undefined
      }
    );

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain('"expectedWorkspaceId": "ws_cli_case"');
  });
```

Add to `packages/local-runtime/test/http-handler.test.ts`:

```ts
  it("fails closed when portable config expects a different workspace identity", () => {
    const cwd = mkdtempSync(join(tmpdir(), "cestus-local-runtime-"));
    try {
      createPortableWorkspace({
        rootDir: join(cwd, "external-case"),
        workspaceId: "ws_actual_runtime",
        label: "Actual Runtime Workspace",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "local-runtime-test",
        coreVersion: "0.1.0"
      });

      const config = resolveLocalRuntimeConfig({
        cwd,
        env: {
          CESTUS_LOCAL_STORAGE: "portable-workspace",
          CESTUS_WORKSPACE_ROOT: "external-case",
          CESTUS_WORKSPACE_ID: "ws_expected_runtime"
        }
      });

      expect(() =>
        createLocalRuntimeHttpHandler({
          config,
          actor: { id: "actor_local_runtime_test", kind: "system", label: "Local Runtime Test" }
        })
      ).toThrow("Portable workspace identity does not match the expected workspace.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 3: Run the targeted red command**

Run:

```bash
npm test -- packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts packages/local-runtime/test/http-handler.test.ts
```

Expected: tests fail because expected workspace ID config, generated IDs, and runtime identity checks are not implemented.

- [ ] **Step 4: Implement config-file support**

In `packages/local-runtime/src/config-file.ts`, add `expectedWorkspaceId` to storage config types, parsing, merging, and validation:

```ts
export interface LocalRuntimeConfigFile {
  readonly storage?: {
    readonly strategy?: "repo-local" | "explicit-path" | "app-data" | "portable-workspace";
    readonly sqlitePath?: string;
    readonly appDataDir?: string;
    readonly workspaceRoot?: string;
    readonly expectedWorkspaceId?: string;
  };
  // existing sections stay unchanged
}

export interface WriteLocalRuntimeOnboardingConfigInput {
  // existing fields stay unchanged
  readonly expectedWorkspaceId?: string;
}
```

Add `"expectedWorkspaceId"` to the storage allowed keys and parse it with `parseOptionalString`. When writing portable-workspace storage, preserve or set it:

```ts
  const workspaceRoot = input.workspaceRoot ?? existing.workspaceRoot;
  const expectedWorkspaceId = input.expectedWorkspaceId ?? existing.expectedWorkspaceId;
  return {
    strategy,
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
    ...(expectedWorkspaceId === undefined ? {} : { expectedWorkspaceId })
  };
```

- [ ] **Step 5: Implement config and runtime support**

In `packages/local-runtime/src/config.ts`, update the portable storage variant:

```ts
    | {
        readonly strategy: "portable-workspace";
        readonly workspaceRoot: string;
        readonly expectedWorkspaceId?: string;
        readonly sqlitePath: string;
      };
```

Resolve `CESTUS_WORKSPACE_ID` over config file:

```ts
    const expectedWorkspaceId =
      normalizeOptional(env.CESTUS_WORKSPACE_ID) ?? configFile?.storage?.expectedWorkspaceId;
    return Object.freeze({
      strategy,
      workspaceRoot: resolvedRoot,
      ...(expectedWorkspaceId === undefined ? {} : { expectedWorkspaceId }),
      sqlitePath: join(resolvedRoot, "ledger", "ontology.sqlite")
    });
```

In `packages/local-runtime/src/runtime-factory.ts`, pass the expected identity:

```ts
  const mounted = mountPortableWorkspace({
    rootDir: config.storage.workspaceRoot,
    ...(config.storage.expectedWorkspaceId === undefined
      ? {}
      : { expectedWorkspaceId: config.storage.expectedWorkspaceId })
  });
```

- [ ] **Step 6: Implement CLI create/configure updates**

In `packages/local-runtime/src/cli.ts`, import `randomUUID`:

```ts
import { randomUUID } from "node:crypto";
```

Add `expectedWorkspaceId?: string` to `ConfigureFlags` and `parseConfigureArgs`, parse `--workspace-id`, and return it as `expectedWorkspaceId`.

Update `parseCreateWorkspaceArgs` so `--workspace-id` is optional:

```ts
  const workspaceId = options.workspaceId ?? generatedWorkspaceId();
  return {
    rootDir: options.rootDir,
    workspaceId,
    label: options.label,
    createdBy: options.createdBy ?? "cestus-local-runtime",
    ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    ...(options.coreVersion === undefined ? {} : { coreVersion: options.coreVersion }),
    ...(options.description === undefined ? {} : { description: options.description })
  };
```

Add:

```ts
function generatedWorkspaceId(): string {
  return `ws_${randomUUID().replaceAll("-", "_")}`;
}
```

Keep the existing explicit `--workspace-id` path working.

- [ ] **Step 7: Run the targeted green command**

Run:

```bash
npm test -- packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts packages/local-runtime/test/http-handler.test.ts
```

Expected: targeted local-runtime tests pass.

- [ ] **Step 8: Run full verification**

Run:

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 9: Commit**

Update the claim evidence, then run:

```bash
git add docs/agentic/claims/task-2-portable-attachment-config.md packages/local-runtime/src/config.ts packages/local-runtime/src/config-file.ts packages/local-runtime/src/cli.ts packages/local-runtime/src/runtime-factory.ts packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts packages/local-runtime/test/http-handler.test.ts
git commit -m "feat: configure portable workspace identity"
```

**Review gate:** Review for config-file secret safety, expected ID override order, and runtime fail-closed behavior.

## Task 3: Bind Workspace Ops To Canonical Layout

**Outcome:** Workspace ops uses the canonical portable workspace manifest and paths, reports wrong-drive states safely, and treats a missing SQLite file in a valid fresh workspace as an uninitialized external ledger path rather than internal fallback.

**Files:**
- Create: `docs/agentic/claims/task-3-portable-attachment-ops-layout.md`
- Modify: `packages/workspace-ops/src/contracts.ts`
- Modify: `packages/workspace-ops/src/layout.ts`
- Modify: `packages/workspace-ops/src/ops.ts`
- Modify: `packages/workspace-ops/test/layout.test.ts`
- Modify: `packages/workspace-ops/test/ops.test.ts`

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-3-portable-attachment-ops-layout.md` with status `claimed`, then update it to `in-progress` and commit that transition.

- [ ] **Step 2: Write failing canonical layout tests**

Replace the provisional layout expectation in `packages/workspace-ops/test/layout.test.ts` with a canonical manifest fixture:

```ts
  it("resolves the canonical portable workspace layout without creating layout roots", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "cestus-layout-"));
    const fileSystem = new NodeWorkspaceFileSystem();
    writeFileSync(
      join(rootPath, "cestus-workspace.json"),
      `${JSON.stringify({
        version: 1,
        layoutVersion: 1,
        workspaceId: "ws_ops_001",
        label: "Ops Fixture",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "workspace-ops-test",
        coreVersion: "0.1.0"
      })}\n`,
      "utf8"
    );

    try {
      const result = await resolveWorkspaceLayout({ rootPath }, fileSystem);

      expect(result.mountStatus.status).toBe("available");
      expect(result.workspace).toMatchObject({
        workspaceId: "ws_ops_001",
        label: "Ops Fixture",
        manifestVersion: 1,
        layoutContractVersion: "portable-workspace-layout.v1"
      });
      expect(result.layout).toMatchObject({
        manifestPath: join(rootPath, "cestus-workspace.json"),
        ledgerPath: join(rootPath, "ledger", "ontology.sqlite"),
        blobRoot: join(rootPath, "blobs"),
        derivativeRoot: join(rootPath, "derivatives"),
        jobRoot: join(rootPath, "jobs"),
        projectionRoot: join(rootPath, "projections"),
        cacheRoot: join(rootPath, "cache"),
        configRoot: join(rootPath, "config")
      });
      expect(existsSync(join(rootPath, "ledger"))).toBe(false);
      expect(existsSync(join(rootPath, "projections"))).toBe(false);
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });
```

Update wrong-drive tests to use canonical manifests with `layoutVersion`, `createdAt`, `createdBy`, and `coreVersion`.

- [ ] **Step 3: Write failing verify test for a fresh unopened workspace**

Add to `packages/workspace-ops/test/ops.test.ts`:

```ts
  it("verifies a fresh unopened canonical workspace without creating the SQLite ledger", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "cestus-ops-fresh-"));
    try {
      createPortableWorkspace({
        rootDir: rootPath,
        workspaceId: "ws_fresh_ops",
        label: "Fresh Ops Workspace",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "workspace-ops-test",
        coreVersion: "0.1.0"
      });

      const fs = new NodeWorkspaceFileSystem();
      const layout = await resolveWorkspaceLayout({ rootPath, expectedWorkspaceId: "ws_fresh_ops" }, fs);
      const result = await verifyWorkspace({
        layout,
        fileSystem: fs,
        eventReader: {
          async readAll() {
            return [];
          }
        }
      });

      expect(result.status).toBe("ready");
      expect(result.payload?.ledger).toEqual({
        readable: true,
        eventCount: 0,
        highWaterMark: 0
      });
      expect(existsSync(join(rootPath, "ledger", "ontology.sqlite"))).toBe(false);
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 4: Run the targeted red command**

Run:

```bash
npm test -- packages/workspace-ops/test/layout.test.ts packages/workspace-ops/test/ops.test.ts
```

Expected: tests fail because workspace ops still uses the provisional manifest and layout roots.

- [ ] **Step 5: Implement canonical layout binding**

In `packages/workspace-ops/src/layout.ts`:

- Rename the layout contract value to `portable-workspace-layout.v1`.
- Parse the canonical manifest shape with `version`, `layoutVersion`, `workspaceId`, `label`, `createdAt`, `createdBy`, `coreVersion`, and optional `description`.
- Reject secret-shaped manifest keys by reusing the same secret-key terms as `packages/workspace`.
- Update `ResolvedWorkspaceLayout` to include `cacheRoot` and `configRoot` and remove required `diagnosticsRoot` and `backupRoot`.
- Derive paths from the canonical root:

```ts
export const portableWorkspaceLayoutContractVersion = "portable-workspace-layout.v1" as const;

export interface ResolvedWorkspaceLayout {
  readonly layoutContractVersion: typeof portableWorkspaceLayoutContractVersion;
  readonly rootPath: string;
  readonly rootUri: string;
  readonly manifestPath: string;
  readonly ledgerPath: string;
  readonly blobRoot: string;
  readonly derivativeRoot: string;
  readonly jobRoot: string;
  readonly projectionRoot: string;
  readonly cacheRoot: string;
  readonly configRoot: string;
}
```

Export the canonical function and keep the old name as a compatibility alias:

```ts
export function createPortableWorkspaceOpsLayout(
  rootPath: string,
  rootUri = pathToSafeFileUri(rootPath),
  manifestName: string = portableWorkspaceManifestName
): ResolvedWorkspaceLayout {
  return {
    layoutContractVersion: portableWorkspaceLayoutContractVersion,
    rootPath,
    rootUri,
    manifestPath: childPath(rootPath, manifestName),
    ledgerPath: childPath(rootPath, "ledger", "ontology.sqlite"),
    blobRoot: childPath(rootPath, "blobs"),
    derivativeRoot: childPath(rootPath, "derivatives"),
    jobRoot: childPath(rootPath, "jobs"),
    projectionRoot: childPath(rootPath, "projections"),
    cacheRoot: childPath(rootPath, "cache"),
    configRoot: childPath(rootPath, "config")
  };
}

export const createProvisionalWorkspaceLayout = createPortableWorkspaceOpsLayout;
```

- [ ] **Step 6: Implement canonical verify roots**

In `packages/workspace-ops/src/contracts.ts`, extend `workspaceRootCategorySchema` with:

```ts
"cache",
"config"
```

In `packages/workspace-ops/src/ops.ts`, set root specs to canonical roots:

```ts
const workspaceRootSpecs = [
  { rootId: "manifest", category: "manifest", path: (layout: ResolvedWorkspaceLayout) => layout.manifestPath },
  { rootId: "ledger", category: "ledger", path: (layout: ResolvedWorkspaceLayout) => childPath(layout.rootPath, "ledger") },
  { rootId: "blobs", category: "blobs", path: (layout: ResolvedWorkspaceLayout) => layout.blobRoot },
  { rootId: "derivatives", category: "derivatives", path: (layout: ResolvedWorkspaceLayout) => layout.derivativeRoot },
  { rootId: "jobs", category: "jobs", path: (layout: ResolvedWorkspaceLayout) => layout.jobRoot },
  { rootId: "projections", category: "projections", path: (layout: ResolvedWorkspaceLayout) => layout.projectionRoot },
  { rootId: "cache", category: "cache", path: (layout: ResolvedWorkspaceLayout) => layout.cacheRoot },
  { rootId: "config", category: "config", path: (layout: ResolvedWorkspaceLayout) => layout.configRoot }
] as const;
```

Keep backup and diagnostics as payload sections. They are no longer required directories in the canonical workspace layout.

- [ ] **Step 7: Run the targeted green command**

Run:

```bash
npm test -- packages/workspace-ops/test/layout.test.ts packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts packages/workspace-ops/test/backup.test.ts
```

Expected: workspace ops layout, verify, disk usage, and backup tests pass.

- [ ] **Step 8: Run full verification**

Run:

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 9: Commit**

Update claim evidence, then run:

```bash
git add docs/agentic/claims/task-3-portable-attachment-ops-layout.md packages/workspace-ops/src/contracts.ts packages/workspace-ops/src/layout.ts packages/workspace-ops/src/ops.ts packages/workspace-ops/test/layout.test.ts packages/workspace-ops/test/ops.test.ts
git commit -m "feat: bind workspace ops to portable layout"
```

**Review gate:** Review for no directory creation during detection, canonical path consistency, and DTO stability.

## Task 4: Wire Real Workspace Ops CLI Commands

**Outcome:** `npm run workspace:ops -- <command>` and `packages/workspace-ops/bin/cestus-workspace.mjs` run real operations with stable JSON output.

**Files:**
- Create: `docs/agentic/claims/task-4-portable-attachment-ops-cli.md`
- Create: `packages/workspace-ops/src/node-runner.ts`
- Create: `packages/workspace-ops/src/node-cli.ts`
- Modify: `packages/workspace-ops/bin/cestus-workspace.mjs`
- Modify: `packages/workspace-ops/test/cli.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-4-portable-attachment-ops-cli.md` with status `claimed`, then update it to `in-progress` and commit that transition.

- [ ] **Step 2: Write failing executable tests**

In `packages/workspace-ops/test/cli.test.ts`, replace the executable runtime-wiring error test for `verify workspace` with:

```ts
  it("runs real executable detect and verify commands against a canonical workspace", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "cestus-workspace-cli-"));
    try {
      createPortableWorkspace({
        rootDir: rootPath,
        workspaceId: "ws_cli_ops",
        label: "CLI Ops Workspace",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "workspace-ops-cli-test",
        coreVersion: "0.1.0"
      });

      const detected = await execFileAsync("node", [
        "packages/workspace-ops/bin/cestus-workspace.mjs",
        "detect",
        "drive",
        "--root",
        rootPath,
        "--workspace-id",
        "ws_cli_ops"
      ]);
      expect(JSON.parse(detected.stdout)).toMatchObject({
        schemaVersion: "workspace-ops.v1",
        command: "detect drive",
        status: "ready",
        workspace: { workspaceId: "ws_cli_ops" }
      });

      const verified = await execFileAsync("node", [
        "packages/workspace-ops/bin/cestus-workspace.mjs",
        "verify",
        "workspace",
        "--root",
        rootPath,
        "--workspace-id",
        "ws_cli_ops"
      ]);
      expect(JSON.parse(verified.stdout)).toMatchObject({
        schemaVersion: "workspace-ops.v1",
        command: "verify workspace",
        status: "ready",
        payload: { ledger: { eventCount: 0 } }
      });
      expect(verified.stderr).toBe("");
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });
```

Add a swapped-drive executable test:

```ts
  it("returns blocked JSON for a swapped workspace identity without leaking the actual id", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "cestus-workspace-cli-"));
    try {
      createPortableWorkspace({
        rootDir: rootPath,
        workspaceId: "ws_actual_cli_ops",
        label: "Actual CLI Ops Workspace",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "workspace-ops-cli-test",
        coreVersion: "0.1.0"
      });

      await expect(
        execFileAsync("node", [
          "packages/workspace-ops/bin/cestus-workspace.mjs",
          "detect",
          "drive",
          "--root",
          rootPath,
          "--workspace-id",
          "ws_expected_cli_ops"
        ])
      ).rejects.toMatchObject({
        code: 3,
        stderr: ""
      });
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 3: Run the targeted red command**

Run:

```bash
npm test -- packages/workspace-ops/test/cli.test.ts
```

Expected: executable tests fail because the bin still reports runtime wiring required.

- [ ] **Step 4: Add Node runner operations**

Create `packages/workspace-ops/src/node-runner.ts`:

```ts
import { existsSync } from "node:fs";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import {
  checkBackupManifest,
  exportWorkspaceManifest,
  inspectWorkspaceDiagnostics,
  reportDiskUsage,
  resolveWorkspaceLayout,
  verifyWorkspace,
  type WorkspaceOpsCliCommand,
  type WorkspaceOpsCliOperationContext,
  type WorkspaceOpsEnvelope
} from "./index.js";
import { NodeWorkspaceFileSystem } from "./filesystem.js";

export async function runNodeWorkspaceOperation(
  context: WorkspaceOpsCliOperationContext
): Promise<WorkspaceOpsEnvelope> {
  const options = parseWorkspaceOpsFlags(context.argv);
  const fileSystem = new NodeWorkspaceFileSystem();
  const layout = await resolveWorkspaceLayout(
    {
      rootPath: options.root,
      ...(options.workspaceId === undefined ? {} : { expectedWorkspaceId: options.workspaceId })
    },
    fileSystem
  );

  if (context.command === "detect drive") {
    return layout.envelope;
  }

  if (layout.layout === undefined) {
    return verifyWorkspace({
      layout,
      fileSystem,
      eventReader: missingEventReader()
    });
  }

  const eventReader = sqliteEventReader();
  switch (context.command) {
    case "verify workspace":
      return verifyWorkspace({ layout, fileSystem, eventReader });
    case "disk usage":
      return reportDiskUsage({ layout: layout.layout, fileSystem });
    case "diagnostics inspect": {
      const durableEvents = await readDurableEventsIfPresent(layout.layout.ledgerPath);
      return inspectWorkspaceDiagnostics({
        durableEvents,
        derivedDiagnostics: layout.diagnostics
      });
    }
    case "manifest export": {
      const diskUsage = await reportDiskUsage({ layout: layout.layout, fileSystem });
      return exportWorkspaceManifest({
        workspace: layout.workspace!,
        layout: layout.layout,
        ledgerEventCount: 0,
        categoryBytes: diskUsage.payload?.categories ?? [],
        createdAt: new Date().toISOString()
      });
    }
    case "backup check":
      return checkBackupManifest({
        workspace: layout.workspace!,
        currentLedgerHighWaterMark: 0,
        backupManifest: undefined
      });
    default:
      throw new Error(`Workspace ops command ${context.command} is not wired in the node runner.`);
  }
}

function parseWorkspaceOpsFlags(argv: readonly string[]): { readonly root: string; readonly workspaceId?: string } {
  let root: string | undefined;
  let workspaceId: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      root = requiredValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--workspace-id") {
      workspaceId = requiredValue(argv, index, arg);
      index += 1;
    }
  }
  if (root === undefined) {
    throw new Error("Workspace ops commands require --root <workspace-root>.");
  }
  return workspaceId === undefined ? { root } : { root, workspaceId };
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function sqliteEventReader() {
  return {
    async readAll(layout: { readonly ledgerPath: string }) {
      if (!existsSync(layout.ledgerPath)) {
        return [];
      }
      const ledger = new SQLiteEventLedger(layout.ledgerPath);
      try {
        return await ledger.readAll();
      } finally {
        ledger.close();
      }
    }
  };
}

function missingEventReader() {
  return {
    async readAll() {
      return [];
    }
  };
}

async function readDurableEventsIfPresent(ledgerPath: string) {
  if (!existsSync(ledgerPath)) {
    return [];
  }
  const ledger = new SQLiteEventLedger(ledgerPath);
  try {
    return await ledger.readAll();
  } finally {
    ledger.close();
  }
}
```

Adjust imports and helper types as needed so the code typechecks. Keep root parsing secret-safe by relying on the existing CLI wrapper for unsupported command redaction.

- [ ] **Step 5: Add TSX CLI entrypoint and bin shim**

Create `packages/workspace-ops/src/node-cli.ts`:

```ts
import { pathToFileURL } from "node:url";
import { runWorkspaceOpsCli } from "./cli.js";
import { runNodeWorkspaceOperation } from "./node-runner.js";

const operations = {
  verifyWorkspace: runNodeWorkspaceOperation,
  diskUsage: runNodeWorkspaceOperation,
  detectDrive: runNodeWorkspaceOperation,
  diagnosticsInspect: runNodeWorkspaceOperation,
  manifestExport: runNodeWorkspaceOperation,
  backupCheck: runNodeWorkspaceOperation
};

const entrypoint = process.argv[1] === undefined ? undefined : pathToFileURL(process.argv[1]).href;

if (import.meta.url === entrypoint) {
  const exitCode = await runWorkspaceOpsCli(process.argv.slice(2), { operations });
  process.exitCode = exitCode;
}
```

Replace `packages/workspace-ops/bin/cestus-workspace.mjs` with a shim that executes TSX:

```js
#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "..", "src", "node-cli.ts");
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tsx", entry, ...process.argv.slice(2)],
  { stdio: "inherit" }
);

process.exitCode = result.status ?? 1;
```

In `package.json`, add:

```json
"workspace:ops": "tsx packages/workspace-ops/src/node-cli.ts"
```

Keep `workspace:help` working.

- [ ] **Step 6: Run the targeted green command**

Run:

```bash
npm test -- packages/workspace-ops/test/cli.test.ts
npm run workspace:ops -- --help
```

Expected: CLI tests pass and help prints usage text.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 8: Commit**

Update claim evidence, then run:

```bash
git add docs/agentic/claims/task-4-portable-attachment-ops-cli.md packages/workspace-ops/src/node-runner.ts packages/workspace-ops/src/node-cli.ts packages/workspace-ops/bin/cestus-workspace.mjs packages/workspace-ops/test/cli.test.ts package.json
git commit -m "feat: wire workspace ops cli"
```

**Review gate:** Review for real executable behavior, no secret leaks on failures, and no filesystem creation during detect.

## Task 5: Final Operator Flow Evidence And Readiness

**Outcome:** The create, configure, detect, verify, open, and diagnose path is tested and recorded as factory-ready.

**Files:**
- Create: `docs/agentic/claims/task-5-portable-attachment-readiness.md`
- Modify: `packages/local-runtime/test/cli.test.ts`
- Modify: `packages/local-runtime/test/http-handler.test.ts`
- Modify: `packages/workspace-ops/test/cli.test.ts`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`

- [ ] **Step 1: Claim and start the task**

Create and commit `docs/agentic/claims/task-5-portable-attachment-readiness.md` with status `claimed`, then update it to `in-progress` and commit that transition.

- [ ] **Step 2: Write failing operator flow tests**

Add a focused flow test to `packages/local-runtime/test/cli.test.ts`:

```ts
  it("creates and configures the same portable workspace identity for operator attachment", async () => {
    const createStdout: string[] = [];
    const configureStdout: string[] = [];
    tempDir = mkdtempSync(join(tmpdir(), "cestus-cli-"));
    const workspaceRoot = join(tempDir, "external-case");

    expect(
      await runLocalRuntimeCli(
        [
          "create-workspace",
          "--workspace",
          workspaceRoot,
          "--label",
          "Operator Case",
          "--created-at",
          "2026-07-06T12:00:00.000Z"
        ],
        {
          cwd: tempDir,
          env: {},
          stdout: (line) => createStdout.push(line),
          stderr: () => undefined
        }
      )
    ).toBe(0);

    const created = JSON.parse(createStdout.join("\n")) as {
      workspace: { workspaceId: string };
    };

    expect(
      await runLocalRuntimeCli(
        [
          "configure",
          "--storage",
          "portable-workspace",
          "--workspace",
          workspaceRoot,
          "--workspace-id",
          created.workspace.workspaceId
        ],
        {
          cwd: tempDir,
          env: {},
          stdout: (line) => configureStdout.push(line),
          stderr: () => undefined
        }
      )
    ).toBe(0);

    expect(configureStdout.join("\n")).toContain(`"expectedWorkspaceId": "${created.workspace.workspaceId}"`);
  });
```

Add this flow to `packages/workspace-ops/test/cli.test.ts`:

```ts
  it("runs the operator diagnose command set against one portable workspace", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "cestus-workspace-cli-"));
    try {
      createPortableWorkspace({
        rootDir: rootPath,
        workspaceId: "ws_operator_cli",
        label: "Operator CLI Workspace",
        createdAt: "2026-07-06T12:00:00.000Z",
        createdBy: "workspace-ops-cli-test",
        coreVersion: "0.1.0"
      });

      for (const command of [
        ["detect", "drive", "--root", rootPath, "--workspace-id", "ws_operator_cli"],
        ["verify", "workspace", "--root", rootPath, "--workspace-id", "ws_operator_cli"],
        ["disk", "usage", "--root", rootPath],
        ["diagnostics", "inspect", "--root", rootPath, "--workspace-id", "ws_operator_cli"]
      ] as const) {
        const result = await execFileAsync("node", [
          "packages/workspace-ops/bin/cestus-workspace.mjs",
          ...command
        ]);
        const body = JSON.parse(result.stdout) as { schemaVersion: string; status: string };
        expect(body.schemaVersion).toBe("workspace-ops.v1");
        expect(["ready", "degraded"]).toContain(body.status);
        expect(result.stderr).toBe("");
      }
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 3: Run targeted red or regression command**

Run:

```bash
npm test -- packages/local-runtime/test/cli.test.ts packages/local-runtime/test/http-handler.test.ts packages/workspace-ops/test/cli.test.ts
```

Expected: any missing readiness behavior fails before final implementation updates.

- [ ] **Step 4: Update readiness script**

In `scripts/check-agent-readiness.mjs`, add:

```js
  "docs/superpowers/specs/2026-07-06-portable-workspace-attachment-ops-design.md",
  "docs/superpowers/plans/2026-07-06-portable-workspace-attachment-ops-implementation.md"
```

to `requiredFiles` after the portable workspace ops spec and plan entries.

- [ ] **Step 5: Record readiness evidence**

Append to `docs/agentic/software-factory.md`:

````md
## Portable Workspace Attachment Ops Plan Readiness

The portable workspace attachment ops plan was prepared from the approved design spec on 2026-07-06.

Required design and plan files:

- `docs/superpowers/specs/2026-07-06-portable-workspace-attachment-ops-design.md`
- `docs/superpowers/plans/2026-07-06-portable-workspace-attachment-ops-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded targeted command evidence from the implementation slice:

```text
npm test -- packages/workspace/test/workspace.test.ts
workspace identity guard tests passed

npm test -- packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts packages/local-runtime/test/http-handler.test.ts
local runtime portable attachment config tests passed

npm test -- packages/workspace-ops/test/layout.test.ts packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts packages/workspace-ops/test/backup.test.ts
workspace ops canonical layout tests passed

npm test -- packages/workspace-ops/test/cli.test.ts
workspace ops executable tests passed
```

Final verification evidence:

```text
npm run verify
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

Portable attachment mode lets an operator create, configure, detect, verify, open, and diagnose an external-drive workspace from CLI/runtime commands. Portable mode still uses one canonical external-drive ledger at `ledger/ontology.sqlite`, never falls back to internal storage, and reports missing or swapped drives through secret-safe diagnostics.
````

- [ ] **Step 6: Run targeted green commands**

Run:

```bash
npm test -- packages/local-runtime/test/cli.test.ts packages/local-runtime/test/http-handler.test.ts packages/workspace-ops/test/cli.test.ts
npm run factory:check
```

Expected: targeted tests and factory readiness pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: full verification passes.

- [ ] **Step 8: Commit**

Update claim evidence, then run:

```bash
git add docs/agentic/claims/task-5-portable-attachment-readiness.md packages/local-runtime/test/cli.test.ts packages/local-runtime/test/http-handler.test.ts packages/workspace-ops/test/cli.test.ts scripts/check-agent-readiness.mjs docs/agentic/software-factory.md
git commit -m "test: finalize portable attachment readiness"
```

**Review gate:** Review for spec coverage, command evidence, no hidden local data copy, no portable fallback to internal storage, and no secret leakage.

## Review Gates

After Task 1, review identity mismatch diagnostics and ensure the unexpected workspace ID is not leaked.

After Task 2, review local runtime config for secret safety and verify that expected identity is an attachment guardrail only.

After Task 3, review canonical layout binding and ensure missing-drive checks do not create directories or stores.

After Task 4, review executable wiring and verify all supported operator commands produce stable JSON envelopes.

After Task 5, request final review focused on operator flow, tests, typecheck, factory readiness, and invariant preservation.

## Completion Criteria

- Operators can create a workspace on an external drive without manually inventing a workspace ID.
- Operators can configure portable runtime storage with the expected workspace identity.
- Workspace ops executable commands run real operations for detect, verify, disk usage, diagnostics, manifest export, and backup check.
- Swapped-drive and missing-drive states produce blocked JSON envelopes with safe proposed actions.
- A fresh unopened workspace verifies without creating `.cestus/local/prr-ledger.sqlite`.
- Runtime portable mode refuses expected workspace ID mismatches and never falls back to internal storage.
- Browser UI boundary tests continue to reject Node-only imports.
- `npm run verify` passes.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-portable-workspace-attachment-ops-implementation.md`. Execute this plan only after design and plan review approval.
