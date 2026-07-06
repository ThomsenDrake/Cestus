# Portable Workspace Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build runtime-independent portable workspace ops with CLI/JSON-first contracts for verification, disk usage, missing-drive detection, projection rebuilds, diagnostics, and backup/export manifest checks.

**Architecture:** Add a focused `packages/workspace-ops` package whose JSON DTOs are the source of truth. The package uses adapter seams for filesystem, workspace layout, ledger/event reads, and projection builders so it can bind to the portable mount contract without hardcoding final mount paths. A thin CLI facade prints stable JSON and future HTTP/UI adapters can call the same package contracts.

**Tech Stack:** TypeScript, Node.js 26, Vitest, Zod, existing ontology contracts and SQLite ledger types, injected filesystem adapters, npm factory verification.

---

## Required Reading

Before any task, read:

- `AGENTS.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/software-factory.md`
- `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
- `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
- `docs/superpowers/specs/2026-07-05-public-ingestion-pipeline-design.md`
- `docs/superpowers/specs/2026-07-06-portable-workspace-ops-design.md`
- this plan

Workers must also read every source and test file named by their task before editing.

## Software Factory Rules

- Use a task-scoped branch or isolated worktree.
- Claim exactly one task in `docs/agentic/claims/task-<number>-workspace-ops-<slug>.md` and commit the claim before editing task files.
- Change the claim status to `in-progress` before touching task files.
- Write the failing test or validation first.
- Run the exact targeted failing command recorded by the task.
- Make the smallest scoped change that satisfies the test.
- Run the exact targeted passing command.
- Run `npm run verify`.
- Commit only the files owned by the task plus its claim/readiness evidence.
- Hand off to spec review, then code-quality review, before starting dependent work.

Stop on data-loss risk, schema conflict, portable mount contract conflict, credential need, external-service dependency, unavailable dependency, or the same verifier failing after two focused repair attempts.

## Scope Boundary

This plan owns `packages/workspace-ops`, its tests, one CLI script, package scripts, readiness docs, and task claims. It does not implement the portable mount contract, local-runtime HTTP endpoints, UI panels, backup copying, restore flows, ingestion runtime wiring, or canonical repair execution.

Projection rebuild may write only expendable projection artifacts. Any issue involving canonical ledger events, evidence blobs, or canonical repair events must be returned as diagnostics plus proposed actions requiring human approval.

## File Structure

- `packages/workspace-ops/src/contracts.ts`: stable DTO schemas, command names, diagnostic helpers, proposed action contracts, JSON formatter, and envelope helpers.
- `packages/workspace-ops/src/filesystem.ts`: read-only filesystem interface, Node implementation, and narrow writable projection-artifact interface.
- `packages/workspace-ops/src/layout.ts`: workspace locator and provisional layout adapter that can be replaced by the portable mount contract adapter.
- `packages/workspace-ops/src/ops.ts`: high-level verify, disk usage, and drive detection operations.
- `packages/workspace-ops/src/projection-rebuild.ts`: rebuild-readiness and projection rebuild orchestration for expendable artifacts only.
- `packages/workspace-ops/src/diagnostics.ts`: durable and derived diagnostic inspection with secret-safe output.
- `packages/workspace-ops/src/backup.ts`: secret-free manifest export and backup manifest coverage checks.
- `packages/workspace-ops/src/cli.ts`: pure CLI command parser/dispatcher that returns JSON output and exit codes.
- `packages/workspace-ops/src/index.ts`: public package exports.
- `packages/workspace-ops/bin/cestus-workspace.mjs`: executable Node entrypoint.
- `packages/workspace-ops/test/*.test.ts`: focused unit and CLI tests.
- `package.json`: add `workspace:help` script.
- `scripts/check-agent-readiness.mjs`: require the ops spec and implementation plan once the plan is implemented.
- `docs/agentic/software-factory.md`: record portable workspace ops plan readiness evidence.

## Task 1: Workspace Ops DTO Contracts

**Files:**
- Create: `packages/workspace-ops/src/contracts.ts`
- Create: `packages/workspace-ops/src/index.ts`
- Create: `packages/workspace-ops/test/contracts.test.ts`
- Create: `docs/agentic/claims/task-1-workspace-ops-contracts.md`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-workspace-ops-contracts.md`:

```markdown
# Task 1 Claim: Workspace Ops DTO Contracts

Plan: `docs/superpowers/plans/2026-07-06-portable-workspace-ops-implementation.md`
Task: Task 1: Workspace Ops DTO Contracts
Worker: implementing agent for this task
Branch: task-scoped branch or worktree
Worktree: absolute worktree path
Claimed-at: ISO-8601 UTC timestamp
Status: claimed

Owned files:
- `packages/workspace-ops/src/contracts.ts`
- `packages/workspace-ops/src/index.ts`
- `packages/workspace-ops/test/contracts.test.ts`
- `docs/agentic/claims/task-1-workspace-ops-contracts.md`

Required commands:
- `npm test -- packages/workspace-ops/test/contracts.test.ts`
- `npm run verify`
```

Commit the claim:

```bash
git add docs/agentic/claims/task-1-workspace-ops-contracts.md
git commit -m "chore: claim task 1 workspace ops contracts"
```

- [ ] **Step 2: Mark the claim in progress**

Edit the claim status to `in-progress`, then commit:

```bash
git add docs/agentic/claims/task-1-workspace-ops-contracts.md
git commit -m "chore: start task 1 workspace ops contracts"
```

- [ ] **Step 3: Write failing contract tests**

Create `packages/workspace-ops/test/contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createWorkspaceOpsEnvelope,
  formatWorkspaceOpsJson,
  isSecretSafeWorkspaceText,
  workspaceOpsEnvelopeSchema,
  workspaceOpsSchemaVersion
} from "../src/contracts.js";

describe("workspace ops contracts", () => {
  it("uses a stable schema version and JSON envelope", () => {
    const envelope = createWorkspaceOpsEnvelope({
      command: "verify workspace",
      status: "ready",
      payload: {
        mountStatus: { status: "available", safeMessage: "Workspace is available." }
      }
    });

    expect(envelope.schemaVersion).toBe(workspaceOpsSchemaVersion);
    expect(workspaceOpsEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(JSON.parse(formatWorkspaceOpsJson(envelope))).toEqual(envelope);
  });

  it("marks canonical repairs as proposed actions requiring human approval", () => {
    const envelope = createWorkspaceOpsEnvelope({
      command: "verify workspace",
      status: "blocked",
      diagnostics: [
        {
          diagnosticId: "diag_workspace_blob_mismatch",
          severity: "error",
          category: "blob-integrity",
          message: "Blob hash mismatch for evidence content.",
          durable: false,
          repairHint: {
            allowedNextCommands: ["diagnostics inspect"],
            requiresHumanApproval: true
          }
        }
      ],
      proposedActions: [
        {
          actionId: "repair_workspace_blob_mismatch",
          kind: "append-repair-event-required",
          title: "Record a human-approved canonical repair event.",
          severity: "error",
          requiresHumanApproval: true,
          mutatesCanonicalState: true,
          allowedNextCommands: ["diagnostics inspect"]
        }
      ]
    });

    expect(envelope.ok).toBe(false);
    expect(envelope.proposedActions[0]).toMatchObject({
      requiresHumanApproval: true,
      mutatesCanonicalState: true
    });
  });

  it("rejects secret-shaped diagnostic text", () => {
    expect(isSecretSafeWorkspaceText("access_token=abc123")).toBe(false);
    expect(() =>
      workspaceOpsEnvelopeSchema.parse(
        createWorkspaceOpsEnvelope({
          command: "diagnostics inspect",
          status: "blocked",
          diagnostics: [
            {
              diagnosticId: "diag_secret",
              severity: "error",
              category: "diagnostics",
              message: "Found access_token=abc123",
              durable: false,
              repairHint: {
                allowedNextCommands: ["diagnostics inspect"],
                requiresHumanApproval: true
              }
            }
          ]
        })
      )
    ).toThrow("secret");
  });
});
```

- [ ] **Step 4: Run the failing test**

Run:

```bash
npm test -- packages/workspace-ops/test/contracts.test.ts
```

Expected: FAIL because `packages/workspace-ops/src/contracts.ts` does not exist.

- [ ] **Step 5: Add DTO contracts**

Create `packages/workspace-ops/src/contracts.ts`:

```ts
import { z } from "zod";

export const workspaceOpsPackageName = "@cestus/workspace-ops";
export const workspaceOpsSchemaVersion = "workspace-ops.v1" as const;

const secretTextPattern =
  /(?:^|[^a-z0-9])(?:access[\s._-]*token|api[\s._-]*key|authorization|bearer|token|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth|credential)(?:\s*[:=]\s*|\s+(?=[a-z0-9._~+/=-]{3,})(?=[a-z0-9._~+/=-]*[0-9])[a-z0-9][a-z0-9._~+/=-]*)/i;

export function isSecretSafeWorkspaceText(value: string): boolean {
  return !secretTextPattern.test(value);
}

export const secretSafeWorkspaceTextSchema = z.string().min(1).refine(isSecretSafeWorkspaceText, {
  message: "workspace ops text must not contain secrets"
});

export const workspaceOpsStatusSchema = z.enum(["ready", "degraded", "blocked"]);
export type WorkspaceOpsStatus = z.infer<typeof workspaceOpsStatusSchema>;

export const workspaceCommandSchema = z.enum([
  "verify workspace",
  "disk usage",
  "detect drive",
  "projection rebuild-readiness",
  "projection rebuild",
  "diagnostics inspect",
  "manifest export",
  "backup check"
]);
export type WorkspaceOpsCommand = z.infer<typeof workspaceCommandSchema>;

export const workspaceDiagnosticSchema = z.object({
  diagnosticId: z.string().regex(/^diag_[a-zA-Z0-9_-]+$/),
  severity: z.enum(["info", "warning", "error"]),
  category: z.enum([
    "manifest",
    "mount",
    "disk",
    "ledger",
    "blob-integrity",
    "projection",
    "diagnostics",
    "backup",
    "layout",
    "security"
  ]),
  message: secretSafeWorkspaceTextSchema,
  durable: z.boolean(),
  relatedIds: z.array(z.string().min(1)).default([]),
  repairHint: z.object({
    allowedNextCommands: z.array(workspaceCommandSchema).min(1),
    requiresHumanApproval: z.boolean()
  }).strict()
}).strict();
export type WorkspaceDiagnosticDto = z.infer<typeof workspaceDiagnosticSchema>;

export const proposedRepairActionSchema = z.object({
  actionId: z.string().regex(/^(repair|action)_[a-zA-Z0-9_-]+$/),
  kind: z.enum([
    "remount-drive",
    "select-workspace",
    "rerun-verify",
    "rebuild-projection",
    "export-manifest",
    "append-repair-event-required"
  ]),
  title: secretSafeWorkspaceTextSchema,
  severity: z.enum(["info", "warning", "error"]),
  requiresHumanApproval: z.boolean(),
  mutatesCanonicalState: z.boolean(),
  allowedNextCommands: z.array(workspaceCommandSchema).min(1)
}).strict().superRefine((action, ctx) => {
  if (action.mutatesCanonicalState && !action.requiresHumanApproval) {
    ctx.addIssue({
      code: "custom",
      path: ["requiresHumanApproval"],
      message: "canonical repair actions require human approval"
    });
  }
});
export type ProposedRepairActionDto = z.infer<typeof proposedRepairActionSchema>;

export const workspaceRefSchema = z.object({
  workspaceId: z.string().regex(/^ws_[a-zA-Z0-9_-]+$/),
  label: secretSafeWorkspaceTextSchema,
  manifestVersion: z.number().int().positive(),
  rootUri: secretSafeWorkspaceTextSchema,
  layoutContractVersion: secretSafeWorkspaceTextSchema
}).strict();
export type WorkspaceRefDto = z.infer<typeof workspaceRefSchema>;

export const mountStatusSchema = z.object({
  status: z.enum(["available", "missing", "unmounted", "wrong-drive", "unreadable"]),
  safeMessage: secretSafeWorkspaceTextSchema,
  expectedRootUri: secretSafeWorkspaceTextSchema.optional()
}).strict();
export type MountStatusDto = z.infer<typeof mountStatusSchema>;

export const workspaceOpsEnvelopeSchema = z.object({
  schemaVersion: z.literal(workspaceOpsSchemaVersion),
  command: workspaceCommandSchema,
  ok: z.boolean(),
  status: workspaceOpsStatusSchema,
  workspace: workspaceRefSchema.optional(),
  payload: z.unknown().optional(),
  diagnostics: z.array(workspaceDiagnosticSchema),
  proposedActions: z.array(proposedRepairActionSchema)
}).strict();
export type WorkspaceOpsEnvelope<TPayload = unknown> = Omit<
  z.infer<typeof workspaceOpsEnvelopeSchema>,
  "payload"
> & {
  readonly payload?: TPayload;
};

export interface CreateWorkspaceOpsEnvelopeInput<TPayload> {
  readonly command: WorkspaceOpsCommand;
  readonly status: WorkspaceOpsStatus;
  readonly workspace?: WorkspaceRefDto;
  readonly payload?: TPayload;
  readonly diagnostics?: readonly WorkspaceDiagnosticDto[];
  readonly proposedActions?: readonly ProposedRepairActionDto[];
}

export function createWorkspaceOpsEnvelope<TPayload>(
  input: CreateWorkspaceOpsEnvelopeInput<TPayload>
): WorkspaceOpsEnvelope<TPayload> {
  const envelope = {
    schemaVersion: workspaceOpsSchemaVersion,
    command: input.command,
    ok: input.status === "ready",
    status: input.status,
    ...(input.workspace === undefined ? {} : { workspace: input.workspace }),
    ...(input.payload === undefined ? {} : { payload: input.payload }),
    diagnostics: [...(input.diagnostics ?? [])],
    proposedActions: [...(input.proposedActions ?? [])]
  } satisfies WorkspaceOpsEnvelope<TPayload>;

  workspaceOpsEnvelopeSchema.parse(envelope);
  return envelope;
}

export function formatWorkspaceOpsJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
```

Create `packages/workspace-ops/src/index.ts`:

```ts
export * from "./contracts.js";
```

- [ ] **Step 6: Run the targeted test**

Run:

```bash
npm test -- packages/workspace-ops/test/contracts.test.ts
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
git add packages/workspace-ops/src/contracts.ts packages/workspace-ops/src/index.ts packages/workspace-ops/test/contracts.test.ts docs/agentic/claims/task-1-workspace-ops-contracts.md
git commit -m "feat: add workspace ops dto contracts"
```

## Task 2: Workspace Layout And Missing-Drive Locator

**Files:**
- Create: `packages/workspace-ops/src/filesystem.ts`
- Create: `packages/workspace-ops/src/layout.ts`
- Modify: `packages/workspace-ops/src/index.ts`
- Create: `packages/workspace-ops/test/layout.test.ts`
- Create: `docs/agentic/claims/task-2-workspace-ops-layout.md`

- [ ] **Step 1: Claim and start the task**

Create the claim with owned files above and required commands:

```bash
npm test -- packages/workspace-ops/test/layout.test.ts
npm run verify
```

Commit the claim, set status to `in-progress`, and commit the status update before editing source or test files.

- [ ] **Step 2: Write failing layout tests**

Create `packages/workspace-ops/test/layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveWorkspaceLayout } from "../src/layout.js";
import type { WorkspaceFileSystem, WorkspaceStats } from "../src/filesystem.js";

class RecordingReadOnlyFs implements WorkspaceFileSystem {
  readonly createdPaths: string[] = [];
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>();

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path);
  }

  async readText(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) {
      throw new Error(`missing file ${path}`);
    }
    return value;
  }

  async stat(path: string): Promise<WorkspaceStats> {
    if (this.directories.has(path)) {
      return { kind: "directory", sizeBytes: 0 };
    }
    const value = this.files.get(path);
    if (value !== undefined) {
      return { kind: "file", sizeBytes: Buffer.byteLength(value) };
    }
    throw new Error(`missing path ${path}`);
  }

  async list(path: string): Promise<readonly string[]> {
    const prefix = `${path}/`;
    return [...this.files.keys(), ...this.directories]
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => entry.slice(prefix.length).split("/")[0])
      .filter((entry, index, entries) => entry.length > 0 && entries.indexOf(entry) === index);
  }

  async realpath(path: string): Promise<string> {
    return path;
  }

  async availableBytes(): Promise<number | undefined> {
    return 1_000_000;
  }
}

describe("resolveWorkspaceLayout", () => {
  it("reports a missing root without creating directories", async () => {
    const fs = new RecordingReadOnlyFs();

    const result = await resolveWorkspaceLayout({ rootPath: "/Volumes/CestusPortable" }, fs);

    expect(result.mountStatus.status).toBe("missing");
    expect(result.workspace).toBeUndefined();
    expect(fs.createdPaths).toEqual([]);
  });

  it("reports a wrong drive when the root exists without the workspace manifest", async () => {
    const fs = new RecordingReadOnlyFs();
    fs.directories.add("/Volumes/OtherDrive");

    const result = await resolveWorkspaceLayout({ rootPath: "/Volumes/OtherDrive" }, fs);

    expect(result.mountStatus.status).toBe("wrong-drive");
    expect(result.diagnostics[0]?.category).toBe("manifest");
  });

  it("resolves the provisional layout through an adapter seam", async () => {
    const fs = new RecordingReadOnlyFs();
    fs.directories.add("/Volumes/CestusPortable");
    fs.files.set(
      "/Volumes/CestusPortable/cestus-workspace.json",
      JSON.stringify({ workspaceId: "ws_ops_001", label: "Ops Fixture", version: 1 })
    );

    const result = await resolveWorkspaceLayout({ rootPath: "/Volumes/CestusPortable" }, fs);

    expect(result.mountStatus.status).toBe("available");
    expect(result.workspace).toMatchObject({
      workspaceId: "ws_ops_001",
      label: "Ops Fixture",
      manifestVersion: 1,
      layoutContractVersion: "portable-workspace-layout.v1-provisional"
    });
    expect(result.layout?.ledgerPath).toBe("/Volumes/CestusPortable/ledger/ontology.sqlite");
    expect(result.layout?.projectionRoot).toBe("/Volumes/CestusPortable/projections");
  });
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
npm test -- packages/workspace-ops/test/layout.test.ts
```

Expected: FAIL because `packages/workspace-ops/src/layout.ts` does not exist.

- [ ] **Step 4: Add read-only filesystem and layout resolver**

Create `packages/workspace-ops/src/filesystem.ts`:

```ts
import { readdir, readFile, realpath as nodeRealpath, stat } from "node:fs/promises";
import { statfs } from "node:fs/promises";
import { join } from "node:path";

export interface WorkspaceStats {
  readonly kind: "file" | "directory" | "other";
  readonly sizeBytes: number;
}

export interface WorkspaceFileSystem {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  stat(path: string): Promise<WorkspaceStats>;
  list(path: string): Promise<readonly string[]>;
  realpath(path: string): Promise<string>;
  availableBytes(path: string): Promise<number | undefined>;
}

export class NodeWorkspaceFileSystem implements WorkspaceFileSystem {
  async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  async readText(path: string): Promise<string> {
    return readFile(path, "utf8");
  }

  async stat(path: string): Promise<WorkspaceStats> {
    const stats = await stat(path);
    return {
      kind: stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other",
      sizeBytes: stats.size
    };
  }

  async list(path: string): Promise<readonly string[]> {
    return readdir(path);
  }

  async realpath(path: string): Promise<string> {
    return nodeRealpath(path);
  }

  async availableBytes(path: string): Promise<number | undefined> {
    try {
      const stats = await statfs(path);
      return Number(stats.bavail) * Number(stats.bsize);
    } catch {
      return undefined;
    }
  }
}

export function childPath(parent: string, child: string): string {
  return join(parent, child);
}
```

Create `packages/workspace-ops/src/layout.ts`:

```ts
import { z } from "zod";
import {
  createWorkspaceOpsEnvelope,
  type MountStatusDto,
  type WorkspaceDiagnosticDto,
  type WorkspaceOpsEnvelope,
  type WorkspaceRefDto
} from "./contracts.js";
import { childPath, type WorkspaceFileSystem } from "./filesystem.js";

const provisionalManifestSchema = z.object({
  workspaceId: z.string().regex(/^ws_[a-zA-Z0-9_-]+$/),
  label: z.string().min(1),
  version: z.literal(1)
}).strict();

export interface ResolveWorkspaceLayoutInput {
  readonly rootPath: string;
  readonly manifestName?: string;
}

export interface ResolvedWorkspaceLayout {
  readonly rootPath: string;
  readonly manifestPath: string;
  readonly ledgerPath: string;
  readonly blobRoot: string;
  readonly derivativeRoot: string;
  readonly jobRoot: string;
  readonly projectionRoot: string;
  readonly diagnosticsRoot: string;
  readonly backupRoot: string;
}

export type WorkspaceLayoutResult = WorkspaceOpsEnvelope<{
  readonly mountStatus: MountStatusDto;
  readonly layout?: ResolvedWorkspaceLayout;
}> & {
  readonly mountStatus: MountStatusDto;
  readonly layout?: ResolvedWorkspaceLayout;
};

export async function resolveWorkspaceLayout(
  input: ResolveWorkspaceLayoutInput,
  fs: WorkspaceFileSystem
): Promise<WorkspaceLayoutResult> {
  const rootExists = await fs.exists(input.rootPath);
  if (!rootExists) {
    return layoutResult({
      mountStatus: {
        status: "missing",
        safeMessage: "Workspace root is not available.",
        expectedRootUri: pathToSafeFileUri(input.rootPath)
      },
      diagnostics: [mountDiagnostic("diag_workspace_root_missing", "Workspace root is not available.")]
    });
  }

  const manifestPath = childPath(input.rootPath, input.manifestName ?? "cestus-workspace.json");
  const manifestExists = await fs.exists(manifestPath);
  if (!manifestExists) {
    return layoutResult({
      mountStatus: {
        status: "wrong-drive",
        safeMessage: "Workspace manifest was not found at the selected root.",
        expectedRootUri: pathToSafeFileUri(input.rootPath)
      },
      diagnostics: [manifestDiagnostic("diag_workspace_manifest_missing", "Workspace manifest was not found.")]
    });
  }

  try {
    const parsed = provisionalManifestSchema.parse(JSON.parse(await fs.readText(manifestPath)));
    const rootPath = await fs.realpath(input.rootPath);
    const workspace: WorkspaceRefDto = {
      workspaceId: parsed.workspaceId,
      label: parsed.label,
      manifestVersion: parsed.version,
      rootUri: pathToSafeFileUri(rootPath),
      layoutContractVersion: "portable-workspace-layout.v1-provisional"
    };
    const layout = provisionalLayout(rootPath, manifestPath);
    return layoutResult({
      workspace,
      mountStatus: { status: "available", safeMessage: "Workspace is available." },
      layout
    });
  } catch {
    return layoutResult({
      mountStatus: {
        status: "unreadable",
        safeMessage: "Workspace manifest could not be parsed safely.",
        expectedRootUri: pathToSafeFileUri(input.rootPath)
      },
      diagnostics: [manifestDiagnostic("diag_workspace_manifest_unreadable", "Workspace manifest could not be parsed safely.")]
    });
  }
}

function layoutResult(input: {
  readonly workspace?: WorkspaceRefDto;
  readonly mountStatus: MountStatusDto;
  readonly layout?: ResolvedWorkspaceLayout;
  readonly diagnostics?: readonly WorkspaceDiagnosticDto[];
}): WorkspaceLayoutResult {
  const envelope = createWorkspaceOpsEnvelope({
    command: "detect drive",
    status: input.mountStatus.status === "available" ? "ready" : "blocked",
    workspace: input.workspace,
    payload: {
      mountStatus: input.mountStatus,
      ...(input.layout === undefined ? {} : { layout: input.layout })
    },
    diagnostics: input.diagnostics ?? []
  });

  return {
    ...envelope,
    mountStatus: input.mountStatus,
    ...(input.layout === undefined ? {} : { layout: input.layout })
  };
}

function provisionalLayout(rootPath: string, manifestPath: string): ResolvedWorkspaceLayout {
  return {
    rootPath,
    manifestPath,
    ledgerPath: childPath(childPath(rootPath, "ledger"), "ontology.sqlite"),
    blobRoot: childPath(rootPath, "blobs"),
    derivativeRoot: childPath(rootPath, "derivatives"),
    jobRoot: childPath(rootPath, "jobs"),
    projectionRoot: childPath(rootPath, "projections"),
    diagnosticsRoot: childPath(rootPath, "diagnostics"),
    backupRoot: childPath(rootPath, "backups")
  };
}

function mountDiagnostic(diagnosticId: string, message: string): WorkspaceDiagnosticDto {
  return {
    diagnosticId,
    severity: "error",
    category: "mount",
    message,
    durable: false,
    relatedIds: [],
    repairHint: { allowedNextCommands: ["detect drive"], requiresHumanApproval: false }
  };
}

function manifestDiagnostic(diagnosticId: string, message: string): WorkspaceDiagnosticDto {
  return {
    diagnosticId,
    severity: "error",
    category: "manifest",
    message,
    durable: false,
    relatedIds: [],
    repairHint: { allowedNextCommands: ["detect drive"], requiresHumanApproval: false }
  };
}

function pathToSafeFileUri(path: string): string {
  return `file://${path}`;
}
```

Update `packages/workspace-ops/src/index.ts`:

```ts
export * from "./contracts.js";
export * from "./filesystem.js";
export * from "./layout.js";
```

- [ ] **Step 5: Run the targeted test**

Run:

```bash
npm test -- packages/workspace-ops/test/layout.test.ts
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
git add packages/workspace-ops/src/filesystem.ts packages/workspace-ops/src/layout.ts packages/workspace-ops/src/index.ts packages/workspace-ops/test/layout.test.ts docs/agentic/claims/task-2-workspace-ops-layout.md
git commit -m "feat: add workspace ops layout resolver"
```

## Task 3: Verify Workspace And Disk Usage Operations

**Files:**
- Create: `packages/workspace-ops/src/ops.ts`
- Modify: `packages/workspace-ops/src/index.ts`
- Create: `packages/workspace-ops/test/ops.test.ts`
- Create: `packages/workspace-ops/test/disk-usage.test.ts`
- Create: `docs/agentic/claims/task-3-workspace-ops-verify-disk.md`

- [ ] **Step 1: Claim and start the task**

Create the claim with owned files above and required commands:

```bash
npm test -- packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts
npm run verify
```

Commit the claim, set status to `in-progress`, and commit the status update before editing source or test files.

- [ ] **Step 2: Write failing operation tests**

Create `packages/workspace-ops/test/ops.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { verifyWorkspace } from "../src/ops.js";
import type { ResolvedWorkspaceLayout, WorkspaceLayoutResult } from "../src/layout.js";

const layout: ResolvedWorkspaceLayout = {
  rootPath: "/workspace",
  manifestPath: "/workspace/cestus-workspace.json",
  ledgerPath: "/workspace/ledger/ontology.sqlite",
  blobRoot: "/workspace/blobs",
  derivativeRoot: "/workspace/derivatives",
  jobRoot: "/workspace/jobs",
  projectionRoot: "/workspace/projections",
  diagnosticsRoot: "/workspace/diagnostics",
  backupRoot: "/workspace/backups"
};

function layoutResult(status: "ready" | "blocked"): WorkspaceLayoutResult {
  return {
    schemaVersion: "workspace-ops.v1",
    command: "detect drive",
    ok: status === "ready",
    status,
    workspace:
      status === "ready"
        ? {
            workspaceId: "ws_ops_001",
            label: "Ops Fixture",
            manifestVersion: 1,
            rootUri: "file:///workspace",
            layoutContractVersion: "portable-workspace-layout.v1-provisional"
          }
        : undefined,
    payload: { mountStatus: { status: "missing", safeMessage: "missing" } },
    diagnostics: [],
    proposedActions: [],
    mountStatus: status === "ready"
      ? { status: "available", safeMessage: "Workspace is available." }
      : { status: "missing", safeMessage: "Workspace root is not available." },
    ...(status === "ready" ? { layout } : {})
  };
}

describe("verifyWorkspace", () => {
  it("blocks verification when the drive is missing", async () => {
    const result = await verifyWorkspace({
      layout: layoutResult("blocked"),
      fileSystem: {
        exists: async () => false,
        readText: async () => "",
        stat: async () => ({ kind: "other", sizeBytes: 0 }),
        list: async () => [],
        realpath: async (path) => path,
        availableBytes: async () => undefined
      },
      eventReader: { readAll: async () => [] }
    });

    expect(result.status).toBe("blocked");
    expect(result.proposedActions[0]).toMatchObject({
      kind: "remount-drive",
      mutatesCanonicalState: false
    });
  });

  it("verifies readable ledger and reports canonical repair as proposed-only", async () => {
    const result = await verifyWorkspace({
      layout: layoutResult("ready"),
      fileSystem: {
        exists: async (path) => path !== layout.blobRoot,
        readText: async () => "",
        stat: async () => ({ kind: "file", sizeBytes: 1 }),
        list: async () => [],
        realpath: async (path) => path,
        availableBytes: async () => 1_000_000
      },
      eventReader: {
        readAll: async () => [
          {
            id: "evt_evidence",
            type: "evidence.ingested",
            version: 1,
            streamId: "evidence_ev_ops_001",
            sequence: 1,
            context: {
              actor: { id: "actor_system", kind: "system", label: "fixture" },
              occurredAt: "2026-07-06T12:00:00.000Z",
              correlationId: "corr_ops",
              coreVersion: "0.1.0",
              packVersions: { core: "0.1.0" }
            },
            payload: {
              evidenceId: "ev_ops_001",
              source: { kind: "file", label: "fixture.txt" },
              contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              mediaType: "text/plain",
              sizeBytes: 1
            }
          }
        ]
      }
    });

    expect(result.status).toBe("degraded");
    expect(result.payload?.ledger.readable).toBe(true);
    expect(result.payload?.blobStore.available).toBe(false);
    expect(result.proposedActions).toContainEqual(
      expect.objectContaining({
        kind: "append-repair-event-required",
        requiresHumanApproval: true,
        mutatesCanonicalState: true
      })
    );
  });
});
```

Create `packages/workspace-ops/test/disk-usage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reportDiskUsage } from "../src/ops.js";
import type { WorkspaceFileSystem, WorkspaceStats } from "../src/filesystem.js";
import type { ResolvedWorkspaceLayout } from "../src/layout.js";

class TreeFs implements WorkspaceFileSystem {
  constructor(
    private readonly entries: ReadonlyMap<string, { kind: "file" | "directory"; sizeBytes: number; children?: readonly string[] }>
  ) {}

  async exists(path: string): Promise<boolean> {
    return this.entries.has(path);
  }

  async readText(): Promise<string> {
    return "";
  }

  async stat(path: string): Promise<WorkspaceStats> {
    const entry = this.entries.get(path);
    if (entry === undefined) {
      throw new Error(`missing ${path}`);
    }
    return { kind: entry.kind, sizeBytes: entry.sizeBytes };
  }

  async list(path: string): Promise<readonly string[]> {
    return this.entries.get(path)?.children ?? [];
  }

  async realpath(path: string): Promise<string> {
    return path;
  }

  async availableBytes(): Promise<number | undefined> {
    return 10_000;
  }
}

const layout: ResolvedWorkspaceLayout = {
  rootPath: "/workspace",
  manifestPath: "/workspace/cestus-workspace.json",
  ledgerPath: "/workspace/ledger/ontology.sqlite",
  blobRoot: "/workspace/blobs",
  derivativeRoot: "/workspace/derivatives",
  jobRoot: "/workspace/jobs",
  projectionRoot: "/workspace/projections",
  diagnosticsRoot: "/workspace/diagnostics",
  backupRoot: "/workspace/backups"
};

describe("reportDiskUsage", () => {
  it("reports category totals without raw filenames", async () => {
    const result = await reportDiskUsage({
      layout,
      fileSystem: new TreeFs(
        new Map([
          ["/workspace/blobs", { kind: "directory", sizeBytes: 0, children: ["sha256"] }],
          ["/workspace/blobs/sha256", { kind: "directory", sizeBytes: 0, children: ["aa"] }],
          ["/workspace/blobs/sha256/aa", { kind: "directory", sizeBytes: 0, children: ["aaaaaaaa"] }],
          ["/workspace/blobs/sha256/aa/aaaaaaaa", { kind: "file", sizeBytes: 12 }],
          ["/workspace/projections", { kind: "directory", sizeBytes: 0, children: ["graph.json"] }],
          ["/workspace/projections/graph.json", { kind: "file", sizeBytes: 7 }],
          ["/workspace/ledger/ontology.sqlite", { kind: "file", sizeBytes: 20 }],
          ["/workspace/derivatives", { kind: "directory", sizeBytes: 0, children: [] }],
          ["/workspace/jobs", { kind: "directory", sizeBytes: 0, children: [] }],
          ["/workspace/diagnostics", { kind: "directory", sizeBytes: 0, children: [] }],
          ["/workspace/backups", { kind: "directory", sizeBytes: 0, children: [] }]
        ])
      )
    });

    expect(result.status).toBe("ready");
    expect(result.payload?.categories).toEqual([
      { category: "ledger", bytes: 20, exists: true },
      { category: "blobs", bytes: 12, exists: true },
      { category: "derivatives", bytes: 0, exists: true },
      { category: "jobs", bytes: 0, exists: true },
      { category: "projections", bytes: 7, exists: true },
      { category: "diagnostics", bytes: 0, exists: true },
      { category: "backups", bytes: 0, exists: true }
    ]);
    expect(JSON.stringify(result)).not.toContain("aaaaaaaa");
  });
});
```

- [ ] **Step 3: Run the failing tests**

Run:

```bash
npm test -- packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts
```

Expected: FAIL because `packages/workspace-ops/src/ops.ts` does not exist.

- [ ] **Step 4: Add verify and disk usage operations**

Create `packages/workspace-ops/src/ops.ts` with the following public API:

```ts
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import {
  createWorkspaceOpsEnvelope,
  type ProposedRepairActionDto,
  type WorkspaceDiagnosticDto,
  type WorkspaceOpsEnvelope
} from "./contracts.js";
import { childPath, type WorkspaceFileSystem } from "./filesystem.js";
import type { ResolvedWorkspaceLayout, WorkspaceLayoutResult } from "./layout.js";

export interface WorkspaceEventReader {
  readAll(layout: ResolvedWorkspaceLayout): Promise<readonly unknown[]>;
}

export interface VerifyWorkspaceInput {
  readonly layout: WorkspaceLayoutResult;
  readonly fileSystem: WorkspaceFileSystem;
  readonly eventReader: WorkspaceEventReader;
}

export interface WorkspaceVerifyDto {
  readonly mountStatus: WorkspaceLayoutResult["mountStatus"];
  readonly ledger: { readonly readable: boolean; readonly eventCount: number };
  readonly blobStore: { readonly available: boolean };
  readonly projections: { readonly available: boolean };
  readonly backup: { readonly available: boolean };
}

export async function verifyWorkspace(
  input: VerifyWorkspaceInput
): Promise<WorkspaceOpsEnvelope<WorkspaceVerifyDto>> {
  if (input.layout.layout === undefined || input.layout.workspace === undefined) {
    return createWorkspaceOpsEnvelope({
      command: "verify workspace",
      status: "blocked",
      payload: {
        mountStatus: input.layout.mountStatus,
        ledger: { readable: false, eventCount: 0 },
        blobStore: { available: false },
        projections: { available: false },
        backup: { available: false }
      },
      diagnostics: input.layout.diagnostics,
      proposedActions: [
        {
          actionId: "action_remount_workspace_drive",
          kind: "remount-drive",
          title: "Remount the workspace drive and rerun verification.",
          severity: "error",
          requiresHumanApproval: false,
          mutatesCanonicalState: false,
          allowedNextCommands: ["detect drive", "verify workspace"]
        }
      ]
    });
  }

  const events = await input.eventReader.readAll(input.layout.layout);
  const invalidEvents = events.filter((event) => !validateKnowledgeEvent(event).success);
  const blobAvailable = await input.fileSystem.exists(input.layout.layout.blobRoot);
  const projectionAvailable = await input.fileSystem.exists(input.layout.layout.projectionRoot);
  const backupAvailable = await input.fileSystem.exists(input.layout.layout.backupRoot);
  const diagnostics: WorkspaceDiagnosticDto[] = [];
  const proposedActions: ProposedRepairActionDto[] = [];

  if (invalidEvents.length > 0) {
    diagnostics.push(canonicalDiagnostic("diag_workspace_ledger_invalid", "Ledger contains events that failed validation."));
    proposedActions.push(canonicalRepairAction("repair_workspace_ledger_invalid"));
  }

  if (!blobAvailable) {
    diagnostics.push(canonicalDiagnostic("diag_workspace_blob_root_missing", "Blob store root is missing."));
    proposedActions.push(canonicalRepairAction("repair_workspace_blob_root_missing"));
  }

  if (!projectionAvailable) {
    diagnostics.push({
      diagnosticId: "diag_workspace_projection_root_missing",
      severity: "warning",
      category: "projection",
      message: "Projection root is missing and can be regenerated.",
      durable: false,
      relatedIds: [],
      repairHint: { allowedNextCommands: ["projection rebuild-readiness"], requiresHumanApproval: false }
    });
    proposedActions.push({
      actionId: "action_rebuild_workspace_projections",
      kind: "rebuild-projection",
      title: "Rebuild expendable projection artifacts.",
      severity: "warning",
      requiresHumanApproval: false,
      mutatesCanonicalState: false,
      allowedNextCommands: ["projection rebuild-readiness", "projection rebuild"]
    });
  }

  return createWorkspaceOpsEnvelope({
    command: "verify workspace",
    status: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "degraded" : "ready",
    workspace: input.layout.workspace,
    payload: {
      mountStatus: input.layout.mountStatus,
      ledger: { readable: true, eventCount: events.length },
      blobStore: { available: blobAvailable },
      projections: { available: projectionAvailable },
      backup: { available: backupAvailable }
    },
    diagnostics,
    proposedActions
  });
}

export interface ReportDiskUsageInput {
  readonly layout: ResolvedWorkspaceLayout;
  readonly fileSystem: WorkspaceFileSystem;
}

export interface DiskUsageDto {
  readonly availableBytes?: number;
  readonly categories: readonly Array<{ readonly category: string; readonly bytes: number; readonly exists: boolean }>;
}

export async function reportDiskUsage(input: ReportDiskUsageInput): Promise<WorkspaceOpsEnvelope<DiskUsageDto>> {
  const categories = [
    ["ledger", input.layout.ledgerPath],
    ["blobs", input.layout.blobRoot],
    ["derivatives", input.layout.derivativeRoot],
    ["jobs", input.layout.jobRoot],
    ["projections", input.layout.projectionRoot],
    ["diagnostics", input.layout.diagnosticsRoot],
    ["backups", input.layout.backupRoot]
  ] as const;

  const totals = [];
  for (const [category, path] of categories) {
    const exists = await input.fileSystem.exists(path);
    totals.push({ category, bytes: exists ? await bytesForPath(input.fileSystem, path) : 0, exists });
  }

  return createWorkspaceOpsEnvelope({
    command: "disk usage",
    status: "ready",
    payload: {
      ...(await input.fileSystem.availableBytes(input.layout.rootPath) === undefined
        ? {}
        : { availableBytes: await input.fileSystem.availableBytes(input.layout.rootPath) }),
      categories: totals
    }
  });
}

async function bytesForPath(fs: WorkspaceFileSystem, path: string): Promise<number> {
  const stats = await fs.stat(path);
  if (stats.kind !== "directory") {
    return stats.sizeBytes;
  }
  let total = 0;
  for (const child of await fs.list(path)) {
    total += await bytesForPath(fs, childPath(path, child));
  }
  return total;
}

function canonicalDiagnostic(diagnosticId: string, message: string): WorkspaceDiagnosticDto {
  return {
    diagnosticId,
    severity: "error",
    category: diagnosticId.includes("ledger") ? "ledger" : "blob-integrity",
    message,
    durable: false,
    relatedIds: [],
    repairHint: { allowedNextCommands: ["diagnostics inspect"], requiresHumanApproval: true }
  };
}

function canonicalRepairAction(actionId: string): ProposedRepairActionDto {
  return {
    actionId,
    kind: "append-repair-event-required",
    title: "Canonical repair requires human approval and a future append-only repair event.",
    severity: "error",
    requiresHumanApproval: true,
    mutatesCanonicalState: true,
    allowedNextCommands: ["diagnostics inspect"]
  };
}
```

Update `packages/workspace-ops/src/index.ts`:

```ts
export * from "./contracts.js";
export * from "./filesystem.js";
export * from "./layout.js";
export * from "./ops.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts
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
git add packages/workspace-ops/src/ops.ts packages/workspace-ops/src/index.ts packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts docs/agentic/claims/task-3-workspace-ops-verify-disk.md
git commit -m "feat: verify workspace ops state"
```

## Task 4: Projection Rebuild Readiness And Artifact Writes

**Files:**
- Create: `packages/workspace-ops/src/projection-rebuild.ts`
- Modify: `packages/workspace-ops/src/index.ts`
- Create: `packages/workspace-ops/test/projection-rebuild.test.ts`
- Create: `docs/agentic/claims/task-4-workspace-ops-projection-rebuild.md`

- [ ] **Step 1: Claim and start the task**

Create the claim with owned files above and required commands:

```bash
npm test -- packages/workspace-ops/test/projection-rebuild.test.ts
npm run verify
```

Commit the claim, set status to `in-progress`, and commit the status update before editing source or test files.

- [ ] **Step 2: Write failing projection rebuild tests**

Create `packages/workspace-ops/test/projection-rebuild.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rebuildProjection, rebuildProjectionReadiness } from "../src/projection-rebuild.js";
import type { ResolvedWorkspaceLayout } from "../src/layout.js";

const layout: ResolvedWorkspaceLayout = {
  rootPath: "/workspace",
  manifestPath: "/workspace/cestus-workspace.json",
  ledgerPath: "/workspace/ledger/ontology.sqlite",
  blobRoot: "/workspace/blobs",
  derivativeRoot: "/workspace/derivatives",
  jobRoot: "/workspace/jobs",
  projectionRoot: "/workspace/projections",
  diagnosticsRoot: "/workspace/diagnostics",
  backupRoot: "/workspace/backups"
};

class RecordingProjectionFs {
  readonly writes: Array<{ path: string; content: string }> = [];
  readonly removed: string[] = [];
  readonly promoted: Array<{ from: string; to: string }> = [];

  constructor(private readonly failWrite = false) {}

  async exists(): Promise<boolean> {
    return true;
  }

  async writeText(path: string, content: string): Promise<void> {
    if (!path.startsWith("/workspace/projections/")) {
      throw new Error(`canonical write attempted: ${path}`);
    }
    if (this.failWrite) {
      throw new Error("projection write failed");
    }
    this.writes.push({ path, content });
  }

  async remove(path: string): Promise<void> {
    if (!path.startsWith("/workspace/projections/")) {
      throw new Error(`canonical remove attempted: ${path}`);
    }
    this.removed.push(path);
  }

  async promoteDirectory(from: string, to: string): Promise<void> {
    if (!from.startsWith("/workspace/projections/") || !to.startsWith("/workspace/projections/")) {
      throw new Error("canonical promote attempted");
    }
    this.promoted.push({ from, to });
  }

  async availableBytes(): Promise<number | undefined> {
    return 1_000_000;
  }
}

describe("projection rebuild", () => {
  it("reports rebuild readiness without canonical writes", async () => {
    const fs = new RecordingProjectionFs();

    const result = await rebuildProjectionReadiness({
      layout,
      projectionName: "graph",
      fileSystem: fs,
      eventReader: { readAll: async () => [] }
    });

    expect(result.status).toBe("ready");
    expect(fs.writes).toEqual([]);
  });

  it("writes only expendable projection artifacts", async () => {
    const fs = new RecordingProjectionFs();

    const result = await rebuildProjection({
      layout,
      projectionName: "graph",
      fileSystem: fs,
      eventReader: { readAll: async () => [] },
      builder: {
        projectionName: "graph",
        build: async () => ({ "projection.json": JSON.stringify({ nodes: [] }) })
      },
      rebuildId: "rb_001"
    });

    expect(result.status).toBe("ready");
    expect(fs.writes.map((write) => write.path)).toEqual([
      "/workspace/projections/.tmp-rb_001/projection.json"
    ]);
    expect(fs.promoted).toEqual([
      { from: "/workspace/projections/.tmp-rb_001", to: "/workspace/projections/graph" }
    ]);
  });

  it("preserves prior artifacts when rebuild fails", async () => {
    const fs = new RecordingProjectionFs(true);

    const result = await rebuildProjection({
      layout,
      projectionName: "graph",
      fileSystem: fs,
      eventReader: { readAll: async () => [] },
      builder: {
        projectionName: "graph",
        build: async () => ({ "projection.json": "{}" })
      },
      rebuildId: "rb_002"
    });

    expect(result.status).toBe("degraded");
    expect(fs.promoted).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({
      category: "projection",
      durable: false
    });
  });
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
npm test -- packages/workspace-ops/test/projection-rebuild.test.ts
```

Expected: FAIL because `packages/workspace-ops/src/projection-rebuild.ts` does not exist.

- [ ] **Step 4: Add projection rebuild orchestration**

Create `packages/workspace-ops/src/projection-rebuild.ts`:

```ts
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { createWorkspaceOpsEnvelope, type WorkspaceOpsEnvelope } from "./contracts.js";
import { childPath } from "./filesystem.js";
import type { ResolvedWorkspaceLayout } from "./layout.js";
import type { WorkspaceEventReader } from "./ops.js";

export interface ProjectionArtifactFileSystem {
  exists(path: string): Promise<boolean>;
  writeText(path: string, content: string): Promise<void>;
  remove(path: string): Promise<void>;
  promoteDirectory(from: string, to: string): Promise<void>;
  availableBytes(path: string): Promise<number | undefined>;
}

export interface ProjectionBuilder {
  readonly projectionName: string;
  build(events: readonly KnowledgeEvent[]): Promise<Record<string, string>>;
}

export interface ProjectionRebuildDto {
  readonly projectionName: string;
  readonly ledgerEventCount: number;
  readonly artifactPaths: readonly string[];
  readonly wroteExpendableArtifactsOnly: boolean;
}

export async function rebuildProjectionReadiness(input: {
  readonly layout: ResolvedWorkspaceLayout;
  readonly projectionName: string;
  readonly fileSystem: ProjectionArtifactFileSystem;
  readonly eventReader: WorkspaceEventReader;
}): Promise<WorkspaceOpsEnvelope<ProjectionRebuildDto>> {
  const events = await input.eventReader.readAll(input.layout);
  const availableBytes = await input.fileSystem.availableBytes(input.layout.projectionRoot);
  const ready = availableBytes === undefined || availableBytes > 0;
  return createWorkspaceOpsEnvelope({
    command: "projection rebuild-readiness",
    status: ready ? "ready" : "blocked",
    payload: {
      projectionName: input.projectionName,
      ledgerEventCount: events.length,
      artifactPaths: [],
      wroteExpendableArtifactsOnly: true
    },
    diagnostics: ready
      ? []
      : [
          {
            diagnosticId: "diag_projection_disk_unavailable",
            severity: "error",
            category: "projection",
            message: "Projection root does not report writable capacity.",
            durable: false,
            relatedIds: [],
            repairHint: { allowedNextCommands: ["disk usage"], requiresHumanApproval: false }
          }
        ]
  });
}

export async function rebuildProjection(input: {
  readonly layout: ResolvedWorkspaceLayout;
  readonly projectionName: string;
  readonly fileSystem: ProjectionArtifactFileSystem;
  readonly eventReader: WorkspaceEventReader;
  readonly builder: ProjectionBuilder;
  readonly rebuildId: string;
}): Promise<WorkspaceOpsEnvelope<ProjectionRebuildDto>> {
  const events = (await input.eventReader.readAll(input.layout)) as readonly KnowledgeEvent[];
  const tempRoot = childPath(input.layout.projectionRoot, `.tmp-${input.rebuildId}`);
  const finalRoot = childPath(input.layout.projectionRoot, input.projectionName);

  try {
    const artifacts = await input.builder.build(events);
    const artifactPaths: string[] = [];
    for (const [name, content] of Object.entries(artifacts).sort(([left], [right]) => left.localeCompare(right))) {
      const artifactPath = childPath(tempRoot, name);
      await input.fileSystem.writeText(artifactPath, content);
      artifactPaths.push(artifactPath);
    }
    await input.fileSystem.promoteDirectory(tempRoot, finalRoot);
    return createWorkspaceOpsEnvelope({
      command: "projection rebuild",
      status: "ready",
      payload: {
        projectionName: input.projectionName,
        ledgerEventCount: events.length,
        artifactPaths,
        wroteExpendableArtifactsOnly: true
      }
    });
  } catch {
    return createWorkspaceOpsEnvelope({
      command: "projection rebuild",
      status: "degraded",
      payload: {
        projectionName: input.projectionName,
        ledgerEventCount: events.length,
        artifactPaths: [],
        wroteExpendableArtifactsOnly: true
      },
      diagnostics: [
        {
          diagnosticId: "diag_projection_rebuild_failed",
          severity: "error",
          category: "projection",
          message: "Projection rebuild failed; previous artifacts were preserved.",
          durable: false,
          relatedIds: [input.projectionName],
          repairHint: { allowedNextCommands: ["projection rebuild-readiness"], requiresHumanApproval: false }
        }
      ]
    });
  }
}
```

Update `packages/workspace-ops/src/index.ts`:

```ts
export * from "./contracts.js";
export * from "./filesystem.js";
export * from "./layout.js";
export * from "./ops.js";
export * from "./projection-rebuild.js";
```

- [ ] **Step 5: Run the targeted test**

Run:

```bash
npm test -- packages/workspace-ops/test/projection-rebuild.test.ts
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
git add packages/workspace-ops/src/projection-rebuild.ts packages/workspace-ops/src/index.ts packages/workspace-ops/test/projection-rebuild.test.ts docs/agentic/claims/task-4-workspace-ops-projection-rebuild.md
git commit -m "feat: rebuild workspace projections safely"
```

## Task 5: Diagnostics Inspect And Backup Manifest Checks

**Files:**
- Create: `packages/workspace-ops/src/diagnostics.ts`
- Create: `packages/workspace-ops/src/backup.ts`
- Modify: `packages/workspace-ops/src/index.ts`
- Create: `packages/workspace-ops/test/diagnostics.test.ts`
- Create: `packages/workspace-ops/test/backup.test.ts`
- Create: `docs/agentic/claims/task-5-workspace-ops-diagnostics-backup.md`

- [ ] **Step 1: Claim and start the task**

Create the claim with owned files above and required commands:

```bash
npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts
npm run verify
```

Commit the claim, set status to `in-progress`, and commit the status update before editing source or test files.

- [ ] **Step 2: Write failing diagnostics and backup tests**

Create `packages/workspace-ops/test/diagnostics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { inspectWorkspaceDiagnostics } from "../src/diagnostics.js";

describe("inspectWorkspaceDiagnostics", () => {
  it("distinguishes durable and derived diagnostics with secret-safe messages", async () => {
    const result = await inspectWorkspaceDiagnostics({
      durableEvents: [
        {
          id: "evt_diag",
          type: "diagnostic.recorded",
          version: 1,
          streamId: "diagnostic_diag_projection",
          sequence: 1,
          context: {
            actor: { id: "actor_system", kind: "system", label: "fixture" },
            occurredAt: "2026-07-06T12:00:00.000Z",
            correlationId: "corr_diag",
            coreVersion: "0.1.0",
            packVersions: { core: "0.1.0" }
          },
          payload: {
            diagnosticId: "diag_projection",
            severity: "warning",
            category: "projection",
            message: "Projection is stale.",
            repairHint: {
              contract: "projection",
              violatedPath: "projection.highWaterMark",
              allowedActions: ["projection rebuild-readiness"]
            }
          }
        }
      ],
      derivedDiagnostics: [
        {
          diagnosticId: "diag_secret",
          severity: "error",
          category: "diagnostics",
          message: "Found access_token=abc123",
          durable: false,
          relatedIds: [],
          repairHint: { allowedNextCommands: ["diagnostics inspect"], requiresHumanApproval: true }
        }
      ]
    });

    expect(result.payload?.diagnostics).toHaveLength(2);
    expect(result.payload?.diagnostics[0]).toMatchObject({ durable: true });
    expect(JSON.stringify(result)).not.toMatch(/access_token|abc123/);
  });
});
```

Create `packages/workspace-ops/test/backup.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkBackupManifest, exportWorkspaceManifest } from "../src/backup.js";
import type { ResolvedWorkspaceLayout } from "../src/layout.js";

const workspace = {
  workspaceId: "ws_ops_001",
  label: "Ops Fixture",
  manifestVersion: 1,
  rootUri: "file:///workspace",
  layoutContractVersion: "portable-workspace-layout.v1-provisional"
};

const layout: ResolvedWorkspaceLayout = {
  rootPath: "/workspace",
  manifestPath: "/workspace/cestus-workspace.json",
  ledgerPath: "/workspace/ledger/ontology.sqlite",
  blobRoot: "/workspace/blobs",
  derivativeRoot: "/workspace/derivatives",
  jobRoot: "/workspace/jobs",
  projectionRoot: "/workspace/projections",
  diagnosticsRoot: "/workspace/diagnostics",
  backupRoot: "/workspace/backups"
};

describe("workspace backup manifests", () => {
  it("exports a secret-free manifest summary", async () => {
    const result = await exportWorkspaceManifest({
      workspace,
      layout,
      ledgerEventCount: 12,
      categoryBytes: [
        { category: "ledger", bytes: 100, exists: true },
        { category: "blobs", bytes: 200, exists: true }
      ],
      createdAt: "2026-07-06T12:00:00.000Z"
    });

    expect(result.status).toBe("ready");
    expect(result.payload?.manifestHash).toMatch(/^sha256:/);
    expect(JSON.stringify(result)).not.toMatch(/token|password|secret/i);
  });

  it("reports stale or mismatched backup manifests without copying evidence", async () => {
    const result = await checkBackupManifest({
      workspace,
      ledgerEventCount: 15,
      backupManifest: {
        workspaceId: "ws_other",
        layoutContractVersion: "portable-workspace-layout.v1-provisional",
        ledgerEventCount: 10,
        coveredCategories: ["ledger"]
      }
    });

    expect(result.status).toBe("degraded");
    expect(result.diagnostics.map((diagnostic) => diagnostic.category)).toEqual(["backup", "backup", "backup"]);
    expect(result.proposedActions[0]).toMatchObject({
      kind: "export-manifest",
      mutatesCanonicalState: false
    });
  });
});
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts
```

Expected: FAIL because `diagnostics.ts` and `backup.ts` do not exist.

- [ ] **Step 4: Add diagnostics inspection and backup checks**

Create `packages/workspace-ops/src/diagnostics.ts`:

```ts
import { type KnowledgeEvent } from "../../ontology/src/contracts.js";
import {
  createWorkspaceOpsEnvelope,
  isSecretSafeWorkspaceText,
  type WorkspaceDiagnosticDto,
  type WorkspaceOpsEnvelope
} from "./contracts.js";

export interface DiagnosticsInspectDto {
  readonly diagnostics: readonly WorkspaceDiagnosticDto[];
}

export async function inspectWorkspaceDiagnostics(input: {
  readonly durableEvents: readonly unknown[];
  readonly derivedDiagnostics: readonly WorkspaceDiagnosticDto[];
}): Promise<WorkspaceOpsEnvelope<DiagnosticsInspectDto>> {
  const durableDiagnostics = input.durableEvents
    .filter(isDiagnosticRecordedEvent)
    .map((event): WorkspaceDiagnosticDto => ({
      diagnosticId: event.payload.diagnosticId,
      severity: event.payload.severity,
      category: workspaceCategory(event.payload.category),
      message: safeMessage(event.payload.message),
      durable: true,
      relatedIds: [event.id],
      repairHint: {
        allowedNextCommands: ["diagnostics inspect"],
        requiresHumanApproval: false
      }
    }));
  const derivedDiagnostics = input.derivedDiagnostics.map((diagnostic) => ({
    ...diagnostic,
    message: safeMessage(diagnostic.message)
  }));
  const diagnostics = [...durableDiagnostics, ...derivedDiagnostics].sort((left, right) =>
    left.diagnosticId.localeCompare(right.diagnosticId)
  );

  return createWorkspaceOpsEnvelope({
    command: "diagnostics inspect",
    status: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "degraded" : "ready",
    payload: { diagnostics },
    diagnostics
  });
}

function isDiagnosticRecordedEvent(event: unknown): event is KnowledgeEvent & { type: "diagnostic.recorded" } {
  return typeof event === "object" && event !== null && "type" in event && (event as { type?: unknown }).type === "diagnostic.recorded";
}

function workspaceCategory(category: string): WorkspaceDiagnosticDto["category"] {
  return category === "projection" ? "projection" : category === "security" ? "security" : "diagnostics";
}

function safeMessage(message: string): string {
  return isSecretSafeWorkspaceText(message) ? message : "Diagnostic message contained secret-shaped text and was redacted.";
}
```

Create `packages/workspace-ops/src/backup.ts`:

```ts
import { createHash } from "node:crypto";
import {
  createWorkspaceOpsEnvelope,
  type ProposedRepairActionDto,
  type WorkspaceDiagnosticDto,
  type WorkspaceOpsEnvelope,
  type WorkspaceRefDto
} from "./contracts.js";
import type { DiskUsageDto } from "./ops.js";
import type { ResolvedWorkspaceLayout } from "./layout.js";

export interface ManifestExportDto {
  readonly workspaceId: string;
  readonly layoutContractVersion: string;
  readonly ledgerEventCount: number;
  readonly categoryBytes: readonly DiskUsageDto["categories"][number][];
  readonly createdAt: string;
  readonly manifestHash: `sha256:${string}`;
}

export interface BackupManifestInput {
  readonly workspaceId: string;
  readonly layoutContractVersion: string;
  readonly ledgerEventCount: number;
  readonly coveredCategories: readonly string[];
}

export async function exportWorkspaceManifest(input: {
  readonly workspace: WorkspaceRefDto;
  readonly layout: ResolvedWorkspaceLayout;
  readonly ledgerEventCount: number;
  readonly categoryBytes: readonly DiskUsageDto["categories"][number][];
  readonly createdAt: string;
}): Promise<WorkspaceOpsEnvelope<ManifestExportDto>> {
  const manifest = {
    workspaceId: input.workspace.workspaceId,
    layoutContractVersion: input.workspace.layoutContractVersion,
    ledgerEventCount: input.ledgerEventCount,
    categoryBytes: input.categoryBytes,
    createdAt: input.createdAt
  };
  const manifestHash = `sha256:${createHash("sha256").update(JSON.stringify(manifest)).digest("hex")}` as const;

  return createWorkspaceOpsEnvelope({
    command: "manifest export",
    status: "ready",
    workspace: input.workspace,
    payload: { ...manifest, manifestHash }
  });
}

export async function checkBackupManifest(input: {
  readonly workspace: WorkspaceRefDto;
  readonly ledgerEventCount: number;
  readonly backupManifest: BackupManifestInput | undefined;
}): Promise<WorkspaceOpsEnvelope<{ readonly backupPresent: boolean }>> {
  const diagnostics: WorkspaceDiagnosticDto[] = [];
  if (input.backupManifest === undefined) {
    diagnostics.push(backupDiagnostic("diag_backup_manifest_missing", "Backup manifest is missing."));
  } else {
    if (input.backupManifest.workspaceId !== input.workspace.workspaceId) {
      diagnostics.push(backupDiagnostic("diag_backup_workspace_mismatch", "Backup manifest belongs to a different workspace."));
    }
    if (input.backupManifest.ledgerEventCount < input.ledgerEventCount) {
      diagnostics.push(backupDiagnostic("diag_backup_manifest_stale", "Backup manifest is behind the workspace ledger."));
    }
    if (!input.backupManifest.coveredCategories.includes("blobs")) {
      diagnostics.push(backupDiagnostic("diag_backup_blob_coverage_missing", "Backup manifest does not cover blob storage."));
    }
  }

  const proposedActions: ProposedRepairActionDto[] =
    diagnostics.length === 0
      ? []
      : [
          {
            actionId: "action_export_workspace_manifest",
            kind: "export-manifest",
            title: "Export a fresh secret-free workspace manifest.",
            severity: "warning",
            requiresHumanApproval: false,
            mutatesCanonicalState: false,
            allowedNextCommands: ["manifest export", "backup check"]
          }
        ];

  return createWorkspaceOpsEnvelope({
    command: "backup check",
    status: diagnostics.length === 0 ? "ready" : "degraded",
    workspace: input.workspace,
    payload: { backupPresent: input.backupManifest !== undefined },
    diagnostics,
    proposedActions
  });
}

function backupDiagnostic(diagnosticId: string, message: string): WorkspaceDiagnosticDto {
  return {
    diagnosticId,
    severity: "warning",
    category: "backup",
    message,
    durable: false,
    relatedIds: [],
    repairHint: { allowedNextCommands: ["manifest export", "backup check"], requiresHumanApproval: false }
  };
}
```

Update `packages/workspace-ops/src/index.ts`:

```ts
export * from "./contracts.js";
export * from "./filesystem.js";
export * from "./layout.js";
export * from "./ops.js";
export * from "./projection-rebuild.js";
export * from "./diagnostics.js";
export * from "./backup.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts
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
git add packages/workspace-ops/src/diagnostics.ts packages/workspace-ops/src/backup.ts packages/workspace-ops/src/index.ts packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts docs/agentic/claims/task-5-workspace-ops-diagnostics-backup.md
git commit -m "feat: inspect workspace diagnostics and backups"
```

## Task 6: CLI JSON Facade

**Files:**
- Create: `packages/workspace-ops/src/cli.ts`
- Create: `packages/workspace-ops/bin/cestus-workspace.mjs`
- Modify: `packages/workspace-ops/src/index.ts`
- Modify: `package.json`
- Create: `packages/workspace-ops/test/cli.test.ts`
- Create: `docs/agentic/claims/task-6-workspace-ops-cli.md`

- [ ] **Step 1: Claim and start the task**

Create the claim with owned files above and required commands:

```bash
npm test -- packages/workspace-ops/test/cli.test.ts
npm run verify
```

Commit the claim, set status to `in-progress`, and commit the status update before editing source or test files.

- [ ] **Step 2: Write failing CLI tests**

Create `packages/workspace-ops/test/cli.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runWorkspaceOpsCli } from "../src/cli.js";
import { createWorkspaceOpsEnvelope } from "../src/contracts.js";

describe("runWorkspaceOpsCli", () => {
  it("prints JSON for a supported command and maps ready status to exit code 0", async () => {
    const lines: string[] = [];
    const exitCode = await runWorkspaceOpsCli(["verify", "workspace", "--root", "/workspace"], {
      stdout: (line) => lines.push(line),
      operations: {
        verifyWorkspace: async () =>
          createWorkspaceOpsEnvelope({
            command: "verify workspace",
            status: "ready",
            payload: { mountStatus: { status: "available", safeMessage: "Workspace is available." } }
          })
      }
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(lines.join(""))).toMatchObject({
      schemaVersion: "workspace-ops.v1",
      command: "verify workspace",
      status: "ready"
    });
  });

  it("maps degraded and blocked envelopes to deterministic exit codes", async () => {
    const degraded = await runWorkspaceOpsCli(["disk", "usage", "--root", "/workspace"], {
      stdout: () => undefined,
      operations: {
        diskUsage: async () =>
          createWorkspaceOpsEnvelope({
            command: "disk usage",
            status: "degraded",
            diagnostics: [
              {
                diagnosticId: "diag_disk_warning",
                severity: "warning",
                category: "disk",
                message: "Disk space is below the warning threshold.",
                durable: false,
                relatedIds: [],
                repairHint: { allowedNextCommands: ["disk usage"], requiresHumanApproval: false }
              }
            ]
          })
      }
    });
    const blocked = await runWorkspaceOpsCli(["detect", "drive", "--root", "/missing"], {
      stdout: () => undefined,
      operations: {
        detectDrive: async () =>
          createWorkspaceOpsEnvelope({
            command: "detect drive",
            status: "blocked",
            payload: { mountStatus: { status: "missing", safeMessage: "Workspace root is not available." } }
          })
      }
    });

    expect(degraded).toBe(2);
    expect(blocked).toBe(3);
  });

  it("prints stable JSON errors for unsupported commands", async () => {
    const lines: string[] = [];
    const exitCode = await runWorkspaceOpsCli(["unknown"], {
      stdout: (line) => lines.push(line),
      operations: {}
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(lines.join(""))).toEqual({
      ok: false,
      error: {
        code: "WORKSPACE_OPS_COMMAND_UNSUPPORTED",
        command: "unknown",
        message: "Unsupported workspace ops command unknown."
      }
    });
  });
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
npm test -- packages/workspace-ops/test/cli.test.ts
```

Expected: FAIL because `packages/workspace-ops/src/cli.ts` does not exist.

- [ ] **Step 4: Add pure CLI facade and executable**

Create `packages/workspace-ops/src/cli.ts`:

```ts
import { formatWorkspaceOpsJson, type WorkspaceOpsEnvelope } from "./contracts.js";

export interface WorkspaceOpsCliOperations {
  verifyWorkspace?: () => Promise<WorkspaceOpsEnvelope>;
  diskUsage?: () => Promise<WorkspaceOpsEnvelope>;
  detectDrive?: () => Promise<WorkspaceOpsEnvelope>;
  projectionRebuildReadiness?: () => Promise<WorkspaceOpsEnvelope>;
  projectionRebuild?: () => Promise<WorkspaceOpsEnvelope>;
  diagnosticsInspect?: () => Promise<WorkspaceOpsEnvelope>;
  manifestExport?: () => Promise<WorkspaceOpsEnvelope>;
  backupCheck?: () => Promise<WorkspaceOpsEnvelope>;
}

export interface WorkspaceOpsCliDependencies {
  readonly stdout?: (line: string) => void;
  readonly operations: WorkspaceOpsCliOperations;
}

export async function runWorkspaceOpsCli(
  argv: readonly string[],
  dependencies: WorkspaceOpsCliDependencies
): Promise<number> {
  const stdout = dependencies.stdout ?? ((line: string) => console.log(line));
  const command = normalizeCommand(argv);
  const operation = operationFor(command, dependencies.operations);

  if (command === "help") {
    stdout(`${formatWorkspaceOpsCliUsage()}\n`);
    return 0;
  }

  if (operation === undefined) {
    stdout(formatWorkspaceOpsJson({
      ok: false,
      error: {
        code: "WORKSPACE_OPS_COMMAND_UNSUPPORTED",
        command,
        message: `Unsupported workspace ops command ${command}.`
      }
    }));
    return 1;
  }

  const envelope = await operation();
  stdout(formatWorkspaceOpsJson(envelope));
  return exitCodeForStatus(envelope.status);
}

export function formatWorkspaceOpsCliUsage(executableName = "cestus-workspace"): string {
  return [
    `Usage: ${executableName} <command> [options]`,
    "",
    "Commands:",
    "  verify workspace                 Verify portable workspace state.",
    "  disk usage                       Report workspace disk usage by category.",
    "  detect drive                     Detect missing, unmounted, or wrong-drive state.",
    "  projection rebuild-readiness     Check projection rebuild prerequisites.",
    "  projection rebuild               Rebuild expendable projection artifacts.",
    "  diagnostics inspect              Inspect durable and derived diagnostics.",
    "  manifest export                  Export a secret-free workspace manifest summary.",
    "  backup check                     Check backup manifest coverage.",
    "",
    "JSON is the stable output contract. HTTP and UI adapters should call package operations directly."
  ].join("\n");
}

function normalizeCommand(argv: readonly string[]): string {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "help") {
    return "help";
  }
  const first = argv[0] ?? "";
  const second = argv[1] ?? "";
  if (first === "verify" && second === "workspace") return "verify workspace";
  if (first === "disk" && second === "usage") return "disk usage";
  if (first === "detect" && second === "drive") return "detect drive";
  if (first === "projection" && second === "rebuild-readiness") return "projection rebuild-readiness";
  if (first === "projection" && second === "rebuild") return "projection rebuild";
  if (first === "diagnostics" && second === "inspect") return "diagnostics inspect";
  if (first === "manifest" && second === "export") return "manifest export";
  if (first === "backup" && second === "check") return "backup check";
  return argv.join(" ");
}

function operationFor(command: string, operations: WorkspaceOpsCliOperations): (() => Promise<WorkspaceOpsEnvelope>) | undefined {
  switch (command) {
    case "verify workspace":
      return operations.verifyWorkspace;
    case "disk usage":
      return operations.diskUsage;
    case "detect drive":
      return operations.detectDrive;
    case "projection rebuild-readiness":
      return operations.projectionRebuildReadiness;
    case "projection rebuild":
      return operations.projectionRebuild;
    case "diagnostics inspect":
      return operations.diagnosticsInspect;
    case "manifest export":
      return operations.manifestExport;
    case "backup check":
      return operations.backupCheck;
    default:
      return undefined;
  }
}

function exitCodeForStatus(status: WorkspaceOpsEnvelope["status"]): number {
  if (status === "ready") return 0;
  if (status === "degraded") return 2;
  return 3;
}
```

Create `packages/workspace-ops/bin/cestus-workspace.mjs`:

```js
#!/usr/bin/env node

const usage = [
  "Usage: cestus-workspace <command> [options]",
  "",
  "Commands:",
  "  verify workspace                 Verify portable workspace state.",
  "  disk usage                       Report workspace disk usage by category.",
  "  detect drive                     Detect missing, unmounted, or wrong-drive state.",
  "  projection rebuild-readiness     Check projection rebuild prerequisites.",
  "  projection rebuild               Rebuild expendable projection artifacts.",
  "  diagnostics inspect              Inspect durable and derived diagnostics.",
  "  manifest export                  Export a secret-free workspace manifest summary.",
  "  backup check                     Check backup manifest coverage.",
  "",
  "JSON is the stable output contract. Operational commands require explicit package wiring."
].join("\n");

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h") || args[0] === "help") {
  console.log(usage);
  process.exit(0);
}

console.error(formatJson({
  ok: false,
  error: {
    code: "WORKSPACE_OPS_RUNTIME_WIRING_REQUIRED",
    command: args.join(" "),
    message: "Workspace ops executable commands require explicit package wiring; the executable does not use hidden globals."
  }
}));
process.exit(1);

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
```

Update `packages/workspace-ops/src/index.ts`:

```ts
export * from "./contracts.js";
export * from "./filesystem.js";
export * from "./layout.js";
export * from "./ops.js";
export * from "./projection-rebuild.js";
export * from "./diagnostics.js";
export * from "./backup.js";
export * from "./cli.js";
```

Modify `package.json` scripts:

```json
"workspace:help": "node packages/workspace-ops/bin/cestus-workspace.mjs --help"
```

- [ ] **Step 5: Run targeted tests and help script**

Run:

```bash
npm test -- packages/workspace-ops/test/cli.test.ts
npm run workspace:help
```

Expected: PASS for the test and usage text containing `Usage: cestus-workspace`.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 7: Commit**

Update the claim with evidence and status `ready-for-review`, then commit:

```bash
git add packages/workspace-ops/src/cli.ts packages/workspace-ops/bin/cestus-workspace.mjs packages/workspace-ops/src/index.ts packages/workspace-ops/test/cli.test.ts package.json docs/agentic/claims/task-6-workspace-ops-cli.md
git commit -m "feat: add workspace ops cli facade"
```

## Task 7: Factory Readiness For Workspace Ops

**Files:**
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`
- Create: `docs/agentic/claims/task-7-workspace-ops-readiness.md`

- [ ] **Step 1: Claim and start the task**

Create the claim with owned files above and required commands:

```bash
npm run factory:check
npm run verify
```

Commit the claim, set status to `in-progress`, and commit the status update before editing source or docs.

- [ ] **Step 2: Write the readiness requirement**

Modify `scripts/check-agent-readiness.mjs` by adding these paths to `requiredFiles`:

```js
"docs/superpowers/specs/2026-07-06-portable-workspace-ops-design.md",
"docs/superpowers/plans/2026-07-06-portable-workspace-ops-implementation.md"
```

Run:

```bash
npm run factory:check
```

Expected: PASS because both files exist.

- [ ] **Step 3: Record readiness evidence**

Append this section to `docs/agentic/software-factory.md`:

````markdown
## Portable Workspace Ops Plan Readiness

The portable workspace ops plan was prepared from the approved design spec on 2026-07-06.

Required design and plan files:

- `docs/superpowers/specs/2026-07-06-portable-workspace-ops-design.md`
- `docs/superpowers/plans/2026-07-06-portable-workspace-ops-implementation.md`

Factory readiness checks both files through `scripts/check-agent-readiness.mjs`.

Recorded command evidence:

```text
npm run factory:check
factory-readiness passed
```

Workspace ops implementation remains CLI/JSON-first package work. Runtime HTTP endpoints, UI panels, final portable mount binding, backup copying, restore flows, and canonical repair execution require separate approved plans.
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
git add scripts/check-agent-readiness.mjs docs/agentic/software-factory.md docs/agentic/claims/task-7-workspace-ops-readiness.md
git commit -m "docs: record workspace ops plan readiness"
```

## Review Gates

Every reviewer must check:

- The worker stayed inside the allowed files.
- The task claim was created and committed before source/test edits.
- A failing test or readiness check was recorded before production changes.
- Targeted commands and `npm run verify` passed.
- CLI/JSON DTOs remain the first source of truth.
- Workspace layout resolution remains an adapter seam and does not hardcode final mount contract paths.
- Missing-drive detection does not create directories or initialize stores.
- Projection rebuild writes only under projection artifact roots and preserves previous artifacts on failure.
- Canonical ledger, event, and blob repair remains proposed-only.
- Canonical repair proposed actions require human approval.
- Diagnostics, manifest exports, backup checks, command output, and claim files remain secret-safe.
- Future HTTP/UI work is not introduced in this implementation slice.

## Completion Criteria

The implementation is complete when:

- All tasks are committed and reviewed.
- `npm run verify` passes on the final branch.
- `npm run factory:check` requires the portable workspace ops spec and plan.
- Workspace ops contracts expose schema-versioned stable JSON envelopes.
- The layout resolver proves missing root checks do not create directories.
- Verify and disk usage commands return machine-readable DTOs.
- Projection rebuild-readiness and rebuild tests prove only expendable artifacts are written.
- Failed projection rebuilds preserve prior artifacts.
- Diagnostics inspection distinguishes durable and derived diagnostics.
- Backup checks report stale, mismatched, or incomplete manifests without copying or deleting evidence.
- CLI tests prove stable JSON output and exit-code mapping.
- Fresh review finds no defects, missing tests, spec drift, invariant violations, or verification gaps.
