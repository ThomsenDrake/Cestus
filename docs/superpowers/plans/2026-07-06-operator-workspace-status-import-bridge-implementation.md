# Operator Workspace Status And Import Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first operator-facing Command cockpit bridge that shows mounted workspace health, portable ontology readiness, ingestion readiness, legacy import readiness, PRR/investigation readiness, diagnostics, source evidence, and next safe commands without executing irreversible actions.

**Architecture:** Add a browser-safe `packages/operator-status` contract package, a read-only local-runtime status aggregation route, a UI HTTP adapter, and Command cockpit components. The aggregation layer adapts authoritative workspace-ops, ingestion, legacy import, PRR, and health DTOs; React renders those DTOs and never imports runtime, filesystem, SQLite, workspace, workspace-ops, or ingestion service modules.

**Tech Stack:** TypeScript, Zod, React 19, Vite, Testing Library, Vitest, existing local-runtime HTTP handler, existing workspace-ops DTOs, existing ingestion runtime DTOs, existing legacy import read DTOs, existing PRR read DTOs.

---

## Required Reading

- `AGENTS.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/software-factory.md`
- `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
- `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
- `docs/superpowers/specs/2026-07-06-operator-workspace-status-import-bridge-design.md`
- `docs/superpowers/specs/2026-07-06-portable-workspace-mount-design.md`
- `docs/superpowers/specs/2026-07-06-portable-workspace-ops-design.md`
- `docs/superpowers/specs/2026-07-06-ingestion-runtime-wiring-design.md`
- `docs/superpowers/specs/2026-07-06-legacy-cestus-import-design.md`
- Sibling planning outputs for legacy operator CLI, portable workspace attachment ops, and local workspace readiness smoke when they are available.

## Scope Boundary

This plan owns the operator status contract, read-only local-runtime aggregation, browser-safe UI adapter, Command cockpit rendering, tests, factory readiness, and implementation claims.

This plan does not own portable workspace mounting, workspace verification semantics, workspace repair execution, ingestion workflow semantics, provider byte transfer, legacy parsing/mapping semantics, legacy ontology staging execution, accepted graph review, PRR send execution, legal escalation, destructive repair, backup restore, migration, remote sync, or team permissions.

## File Map

- `packages/operator-status/src/contracts.ts`: Zod schemas, DTO types, safe action validation, summary helpers, and secret-safe text checks.
- `packages/operator-status/src/index.ts`: public exports for the contract package.
- `packages/operator-status/test/contracts.test.ts`: contract, safety, and summary tests.
- `packages/local-runtime/src/operator-status.ts`: provider interfaces and pure aggregation logic over authoritative DTOs.
- `packages/local-runtime/src/operator-status-routes.ts`: `GET /api/operator/status` transport wrapper.
- `packages/local-runtime/src/http-handler.ts`: route wiring and auth policy reuse.
- `packages/local-runtime/test/operator-status.test.ts`: pure aggregation tests for the required readiness states.
- `packages/local-runtime/test/operator-status-routes.test.ts`: HTTP route, read-only, auth, provider failure, and secret-safety tests.
- `packages/ui/src/operator-status/operator-status-types.ts`: UI-facing type exports from the browser-safe contract package.
- `packages/ui/src/operator-status/operator-status-adapter.ts`: HTTP adapter, parser, redaction, and static test adapter.
- `packages/ui/src/operator-status/OperatorCockpit.tsx`: Command cockpit container.
- `packages/ui/src/operator-status/OperatorStatusBand.tsx`: top-level status band component.
- `packages/ui/src/operator-status/OperatorStatusDetail.tsx`: diagnostics, metrics, source evidence, and safe command detail panel.
- `packages/ui/test/operator-status-adapter.test.ts`: adapter parsing, redaction, and runtime unavailable tests.
- `packages/ui/test/operator-cockpit.test.tsx`: component interaction and safety tests.
- `packages/ui/test/operator-app-integration.test.tsx`: Command first viewport integration tests.
- `packages/ui/test/request-data-boundary.test.ts`: browser-boundary and factory-readiness assertions.
- `packages/ui/test/visual-contract.test.ts`: tactical visual contract coverage for the new cockpit files.
- `packages/ui/src/App.tsx`: loads operator status for Command and renders the cockpit.
- `scripts/check-agent-readiness.mjs`: requires this spec and plan.
- `docs/agentic/software-factory.md`: records readiness evidence after implementation.
- `docs/agentic/claims/task-*-operator-*.md`: durable task claims.

## Task 1: Operator Status DTO Contracts

**Outcome:** A browser-safe contract package defines the aggregate operator status DTO and rejects unsafe actions.

**Files:**

- Create: `docs/agentic/claims/task-1-operator-status-contracts.md`
- Create: `packages/operator-status/src/contracts.ts`
- Create: `packages/operator-status/src/index.ts`
- Create: `packages/operator-status/test/contracts.test.ts`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-operator-status-contracts.md` with status `claimed`, then commit it.

```markdown
# Task 1 Claim: Operator Status DTO Contracts

- Plan: `docs/superpowers/plans/2026-07-06-operator-workspace-status-import-bridge-implementation.md`
- Task: Task 1, Operator Status DTO Contracts
- Worker: Codex
- Branch: `codex/operator-workspace-status-import-bridge`
- Worktree: record the current worktree path
- Claimed at: record the current UTC timestamp
- Status: claimed

## Owned Files

- `docs/agentic/claims/task-1-operator-status-contracts.md`
- `packages/operator-status/src/contracts.ts`
- `packages/operator-status/src/index.ts`
- `packages/operator-status/test/contracts.test.ts`
```

Run:

```bash
git add docs/agentic/claims/task-1-operator-status-contracts.md
git commit -m "chore: claim task 1 operator status contracts"
```

Expected: commit succeeds.

- [ ] **Step 2: Mark the claim in progress**

Change the claim status to `in-progress`, add a timestamped note, then commit.

Run:

```bash
git add docs/agentic/claims/task-1-operator-status-contracts.md
git commit -m "chore: start task 1 operator status contracts"
```

Expected: commit succeeds.

- [ ] **Step 3: Write the failing contract tests**

Create `packages/operator-status/test/contracts.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  buildOperatorStatusSummary,
  operatorStatusDtoSchema,
  operatorSafeActionSchema,
  type OperatorStatusDto
} from "../src/contracts.js";

describe("operator status contracts", () => {
  const readyDto: OperatorStatusDto = {
    schemaVersion: "operator-status.v1",
    generatedAt: "2026-07-06T20:00:00.000Z",
    runtime: {
      available: true,
      storageStrategy: "portable-workspace",
      bindMode: "loopback",
      workspaceMounted: true,
      safeMessage: "Local runtime is serving a mounted portable workspace."
    },
    summary: {
      overallState: "ready",
      blockedCount: 0,
      actionRequiredCount: 0,
      degradedCount: 0,
      nextSafeActionId: "action_open_ingestion"
    },
    sections: [
      {
        sectionId: "workspace",
        label: "Workspace",
        state: "ready",
        headline: "Mounted portable workspace",
        safeSummary: "Workspace manifest, ledger, and blob roots are readable.",
        metrics: [
          { metricId: "ledger_events", label: "Ledger events", value: "42", tone: "healthy" }
        ],
        diagnostics: [],
        sourceEvidence: [
          {
            evidenceId: "src_workspace_verify",
            sourceContract: "workspace-ops.v1",
            sourceKind: "workspace-ops",
            label: "verify workspace",
            refs: [{ label: "workspaceId", value: "ws_case_001" }]
          }
        ],
        nextSafeActionIds: ["action_open_ingestion"]
      }
    ],
    safeActions: [
      {
        actionId: "action_open_ingestion",
        label: "Open Ingestion",
        kind: "navigate",
        target: "ingestion",
        sourceContract: "operator-status.v1",
        requiresHumanApproval: false,
        mutatesCanonicalState: false,
        externalEffect: false,
        enabled: true
      }
    ]
  };

  it("accepts a scanner-friendly operator status DTO", () => {
    expect(operatorStatusDtoSchema.parse(readyDto)).toMatchObject({
      schemaVersion: "operator-status.v1",
      summary: { overallState: "ready" },
      sections: [{ sectionId: "workspace" }]
    });
  });

  it("summarizes blocked, action-required, and degraded sections deterministically", () => {
    const summary = buildOperatorStatusSummary([
      { sectionId: "workspace", state: "ready", nextSafeActionIds: [] },
      { sectionId: "ingestion", state: "action-required", nextSafeActionIds: ["action_open_ingestion"] },
      { sectionId: "legacy-import", state: "blocked", nextSafeActionIds: ["action_show_legacy_ask"] },
      { sectionId: "prr", state: "degraded", nextSafeActionIds: ["action_open_requests"] }
    ]);

    expect(summary).toEqual({
      overallState: "blocked",
      blockedCount: 1,
      actionRequiredCount: 1,
      degradedCount: 1,
      nextSafeActionId: "action_show_legacy_ask"
    });
  });

  it("rejects actions that mutate canonical state or have external effects", () => {
    expect(() =>
      operatorSafeActionSchema.parse({
        actionId: "action_send_prr",
        label: "Send request",
        kind: "show-command",
        command: "cestus prr send prr_001",
        sourceContract: "prr",
        requiresHumanApproval: true,
        mutatesCanonicalState: true,
        externalEffect: true,
        enabled: true
      })
    ).toThrow();
  });

  it("rejects secret-shaped diagnostic and command text", () => {
    expect(() =>
      operatorStatusDtoSchema.parse({
        ...readyDto,
        sections: [
          {
            ...readyDto.sections[0],
            diagnostics: [
              {
                diagnosticId: "diag_bad_secret",
                severity: "error",
                category: "workspace",
                message: "token=abc123"
              }
            ]
          }
        ]
      })
    ).toThrow(/secret-safe/i);
  });
});
```

- [ ] **Step 4: Run the failing test**

Run:

```bash
npm test -- packages/operator-status/test/contracts.test.ts
```

Expected: failure because `packages/operator-status/src/contracts.ts` does not exist.

- [ ] **Step 5: Add the contract implementation**

Create `packages/operator-status/src/contracts.ts` with Zod schemas for these exact public names:

```ts
export const operatorStatusSchemaVersion = "operator-status.v1" as const;
export const operatorReadinessStates = ["ready", "degraded", "action-required", "blocked", "unavailable"] as const;
export const operatorSectionIds = ["workspace", "ingestion", "legacy-import", "prr"] as const;
export const operatorSafeActionKinds = ["navigate", "refresh-status", "show-command", "open-doc"] as const;
export const operatorNavigationTargets = ["command", "requests", "ingestion", "evidence", "ontology", "settings"] as const;

export const operatorMetricSchema = z.object({
  metricId: operatorIdentifierSchema,
  label: operatorSecretSafeTextSchema,
  value: operatorSecretSafeTextSchema,
  tone: z.enum(["neutral", "healthy", "attention", "danger", "machine"])
}).strict();

export const operatorSafeActionSchema = z.object({
  actionId: operatorActionIdSchema,
  label: operatorSecretSafeTextSchema,
  kind: z.enum(operatorSafeActionKinds),
  target: z.enum(operatorNavigationTargets).optional(),
  command: operatorSecretSafeTextSchema.optional(),
  sourceContract: operatorSecretSafeTextSchema,
  requiresHumanApproval: z.boolean(),
  mutatesCanonicalState: z.literal(false),
  externalEffect: z.literal(false),
  enabled: z.boolean(),
  disabledReason: operatorSecretSafeTextSchema.optional()
}).strict().superRefine((action, ctx) => {
  if (action.kind === "navigate" && action.target === undefined) {
    ctx.addIssue({ code: "custom", path: ["target"], message: "navigate actions require a target" });
  }
  if (action.kind === "show-command" && action.command === undefined) {
    ctx.addIssue({ code: "custom", path: ["command"], message: "show-command actions require command text" });
  }
});
```

Also export:

```ts
export type OperatorReadinessState = z.infer<typeof operatorReadinessStateSchema>;
export type OperatorStatusDto = z.infer<typeof operatorStatusDtoSchema>;
export type OperatorStatusSectionDto = z.infer<typeof operatorStatusSectionSchema>;
export type OperatorSafeActionDto = z.infer<typeof operatorSafeActionSchema>;
export type OperatorDiagnosticDto = z.infer<typeof operatorDiagnosticSchema>;
export type OperatorSourceEvidenceDto = z.infer<typeof operatorSourceEvidenceSchema>;

export function buildOperatorStatusSummary(
  sections: readonly Pick<OperatorStatusSectionDto, "sectionId" | "state" | "nextSafeActionIds">[]
): OperatorStatusDto["summary"] {
  const blocked = sections.filter((section) => section.state === "blocked");
  const actionRequired = sections.filter((section) => section.state === "action-required");
  const degraded = sections.filter((section) => section.state === "degraded");
  const nextSafeActionId =
    blocked[0]?.nextSafeActionIds[0] ??
    actionRequired[0]?.nextSafeActionIds[0] ??
    degraded[0]?.nextSafeActionIds[0];

  return {
    overallState: blocked.length > 0
      ? "blocked"
      : actionRequired.length > 0
        ? "action-required"
        : degraded.length > 0
          ? "degraded"
          : sections.every((section) => section.state === "unavailable")
            ? "unavailable"
            : "ready",
    blockedCount: blocked.length,
    actionRequiredCount: actionRequired.length,
    degradedCount: degraded.length,
    ...(nextSafeActionId === undefined ? {} : { nextSafeActionId })
  };
}
```

Create `packages/operator-status/src/index.ts`:

```ts
export * from "./contracts.js";
```

- [ ] **Step 6: Run the targeted test**

Run:

```bash
npm test -- packages/operator-status/test/contracts.test.ts
```

Expected: pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add docs/agentic/claims/task-1-operator-status-contracts.md packages/operator-status/src/contracts.ts packages/operator-status/src/index.ts packages/operator-status/test/contracts.test.ts
git commit -m "feat: add operator status contracts"
```

Expected: commit succeeds.

## Task 2: Local Runtime Operator Status Aggregation

**Outcome:** Local runtime exposes a read-only aggregate status service over authoritative provider DTOs.

**Files:**

- Create: `docs/agentic/claims/task-2-operator-status-runtime.md`
- Create: `packages/local-runtime/src/operator-status.ts`
- Create: `packages/local-runtime/src/operator-status-routes.ts`
- Create: `packages/local-runtime/test/operator-status.test.ts`
- Create: `packages/local-runtime/test/operator-status-routes.test.ts`
- Modify: `packages/local-runtime/src/http-handler.ts`

- [ ] **Step 1: Claim and start the task**

Create and commit the claim, then update status to `in-progress` and commit that transition.

Run:

```bash
git add docs/agentic/claims/task-2-operator-status-runtime.md
git commit -m "chore: claim task 2 operator status runtime"
git add docs/agentic/claims/task-2-operator-status-runtime.md
git commit -m "chore: start task 2 operator status runtime"
```

Expected: both commits succeed.

- [ ] **Step 2: Write failing aggregation tests**

Create `packages/local-runtime/test/operator-status.test.ts` with tests for:

```ts
import { describe, expect, it } from "vitest";
import { buildOperatorStatusDto } from "../src/operator-status.js";

describe("operator status aggregation", () => {
  const now = () => "2026-07-06T21:00:00.000Z";

  it("reports mounted workspace, ingestion action gate, legacy samples, and PRR readiness", async () => {
    const status = await buildOperatorStatusDto({
      now,
      runtime: {
        available: true,
        storageStrategy: "portable-workspace",
        bindMode: "loopback",
        workspaceMounted: true,
        safeMessage: "Runtime ready."
      },
      workspace: async () => ({
        schemaVersion: "workspace-ops.v1",
        command: "verify workspace",
        ok: true,
        status: "ready",
        workspace: {
          workspaceId: "ws_case_001",
          label: "Case 001",
          manifestVersion: 1,
          rootUri: "file:///workspace",
          layoutContractVersion: "portable-workspace-layout.v1-provisional"
        },
        payload: {
          schemaVersion: "workspace-ops.v1",
          mountStatus: {
            status: "available",
            safeMessage: "Workspace is available.",
            nextCommandHints: [
              {
                allowedNextCommands: ["verify workspace"],
                safeReason: "Verify workspace state.",
                requiresHumanApproval: false
              }
            ]
          },
          manifest: { readable: true, valid: true, manifestVersion: 1, safeSummary: "Manifest valid." },
          layout: { contractVersion: "portable-workspace-layout.v1-provisional", readable: true, requiredRoots: [] },
          ledger: { readable: true, eventCount: 14, highWaterMark: 14 },
          blobStore: { available: true, contentAddressedRootCount: 2, aggregateBytes: 2048, missingBlobCount: 0, hashMismatchCount: 0 },
          projections: { available: true, staleCount: 0, rebuildable: true },
          jobs: { available: true, queuedCount: 0, failedCount: 0 },
          diagnostics: { visible: true, errorCount: 0, warningCount: 0 },
          backup: { manifestAvailable: false, stale: true }
        },
        diagnostics: [],
        proposedActions: []
      }),
      ingestion: async () => ({
        workspace: {
          mounted: true,
          workspaceId: "ws_case_001",
          label: "Case 001",
          capabilities: {
            canReadLedger: true,
            canAppendLedger: true,
            canWriteBlobs: true,
            canWriteDerivatives: true,
            canWriteJobState: true
          },
          review: {
            sourceCollectionId: "src_old_archive",
            label: "Old archive",
            latestScanBatchId: "scan_001",
            totals: { observedFiles: 8, uniqueContent: 6, duplicateOccurrences: 2, skipped: 0, bytes: 4096, estimatedNewBlobBytes: 2048 },
            approvalRequired: true,
            duplicateGroups: [],
            evidenceLinks: [],
            parseJobs: [],
            diagnostics: []
          },
          diagnostics: []
        },
        jobs: { jobs: [] },
        diagnostics: { diagnostics: [] }
      }),
      legacy: async () => ({
        sourceCollectionId: "src_old_archive",
        rawImportRequiresApproval: false,
        ontologyStagingApproved: false,
        firstArtifactAsk: [
          "Read-only folder tree listing of the old Cestus root",
          "Two to five sanitized metadata or ontology files",
          "Any old manifest, index, registry, or graph export file if present"
        ],
        diagnostics: []
      }),
      prr: async () => ({
        cards: [],
        diagnostics: []
      })
    });

    expect(status.summary.overallState).toBe("action-required");
    expect(status.sections.map((section) => [section.sectionId, section.state])).toEqual([
      ["workspace", "ready"],
      ["ingestion", "action-required"],
      ["legacy-import", "action-required"],
      ["prr", "ready"]
    ]);
    expect(JSON.stringify(status)).not.toMatch(/token|password|private key/i);
  });

  it("turns provider failure into unavailable section state without failing the whole DTO", async () => {
    const status = await buildOperatorStatusDto({
      now,
      runtime: { available: true, safeMessage: "Runtime ready." },
      workspace: async () => { throw new Error("workspace unavailable"); },
      ingestion: async () => ({ workspace: { mounted: false, diagnostics: [] }, jobs: { jobs: [] }, diagnostics: { diagnostics: [] } }),
      legacy: async () => { throw new Error("legacy unavailable"); },
      prr: async () => ({ cards: [], diagnostics: [] })
    });

    expect(status.sections.find((section) => section.sectionId === "workspace")?.state).toBe("unavailable");
    expect(status.sections.find((section) => section.sectionId === "legacy-import")?.state).toBe("unavailable");
  });
});
```

- [ ] **Step 3: Write failing route tests**

Create `packages/local-runtime/test/operator-status-routes.test.ts` with tests that:

- call `GET /api/operator/status`;
- prove `POST /api/operator/status` returns 404 or method-not-found;
- prove status route respects existing auth policy for non-loopback configurations;
- inject provider fakes and assert no request body path fields are accepted;
- assert raw provider error text with `token=abc123` is not returned.

- [ ] **Step 4: Run the failing runtime command**

Run:

```bash
npm test -- packages/local-runtime/test/operator-status.test.ts packages/local-runtime/test/operator-status-routes.test.ts
```

Expected: failure because `operator-status.ts` and route wiring do not exist.

- [ ] **Step 5: Add the status service**

Create `packages/local-runtime/src/operator-status.ts` with:

- `OperatorStatusProviderSet`;
- `buildOperatorStatusDto(input)`;
- section builders for workspace, ingestion, legacy import, and PRR;
- safe action builders for opening modules, refreshing status, and showing CLI commands;
- provider failure handling that creates `unavailable` sections.

Use `packages/operator-status/src/contracts.ts` for all DTO parsing. Import only types from domain packages when possible, and adapt the already-stable DTOs.

- [ ] **Step 6: Add the route and handler wiring**

Create `packages/local-runtime/src/operator-status-routes.ts` with `handleOperatorStatusRoute(input)`.

Modify `packages/local-runtime/src/http-handler.ts` so `GET /api/operator/status` is handled after auth checks and before the generic 404. Add optional `operatorStatusProviders` to `CreateLocalRuntimeHttpHandlerInput` for tests and future binding.

- [ ] **Step 7: Run targeted runtime tests**

Run:

```bash
npm test -- packages/local-runtime/test/operator-status.test.ts packages/local-runtime/test/operator-status-routes.test.ts packages/local-runtime/test/http-handler.test.ts
```

Expected: pass.

- [ ] **Step 8: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add docs/agentic/claims/task-2-operator-status-runtime.md packages/local-runtime/src/operator-status.ts packages/local-runtime/src/operator-status-routes.ts packages/local-runtime/src/http-handler.ts packages/local-runtime/test/operator-status.test.ts packages/local-runtime/test/operator-status-routes.test.ts
git commit -m "feat: expose operator status runtime"
```

Expected: commit succeeds.

## Task 3: Browser-Safe Operator Status Adapter

**Outcome:** UI code can load operator status through HTTP and tests prove it stays browser-safe.

**Files:**

- Create: `docs/agentic/claims/task-3-operator-status-ui-adapter.md`
- Create: `packages/ui/src/operator-status/operator-status-types.ts`
- Create: `packages/ui/src/operator-status/operator-status-adapter.ts`
- Create: `packages/ui/test/operator-status-adapter.test.ts`
- Modify: `packages/ui/test/request-data-boundary.test.ts`

- [ ] **Step 1: Claim and start the task**

Create and commit the claim, then change status to `in-progress` and commit.

- [ ] **Step 2: Write failing adapter tests**

Create `packages/ui/test/operator-status-adapter.test.ts` with tests that:

- `createHttpOperatorStatusAdapter({ baseUrl: "http://127.0.0.1:8787", fetcher })` calls `/api/operator/status`;
- successful JSON returns a parsed `OperatorStatusDto`;
- non-2xx JSON returns a runtime-unavailable DTO with safe diagnostics;
- secret-shaped diagnostics and absolute path prefixes are redacted;
- static adapter returns frozen test DTOs.

- [ ] **Step 3: Extend browser boundary tests**

Modify `packages/ui/test/request-data-boundary.test.ts` so product UI source files may import `../../operator-status/src/contracts.js` but may not import:

```ts
"../../workspace-ops/src"
"packages/workspace-ops"
"../../local-runtime/src/operator-status"
"packages/local-runtime/src/operator-status"
"../../local-runtime/src/operator-status-routes"
"../../workspace/src"
"packages/workspace"
```

Keep existing Node-only import checks intact.

- [ ] **Step 4: Run the failing adapter command**

Run:

```bash
npm test -- packages/ui/test/operator-status-adapter.test.ts packages/ui/test/request-data-boundary.test.ts
```

Expected: failure because UI operator status adapter files do not exist.

- [ ] **Step 5: Add UI adapter files**

Create `packages/ui/src/operator-status/operator-status-types.ts`:

```ts
export type {
  OperatorDiagnosticDto,
  OperatorReadinessState,
  OperatorSafeActionDto,
  OperatorSourceEvidenceDto,
  OperatorStatusDto,
  OperatorStatusSectionDto
} from "../../../operator-status/src/contracts.js";
```

Create `packages/ui/src/operator-status/operator-status-adapter.ts` with:

- `OperatorStatusAdapter`;
- `createHttpOperatorStatusAdapter`;
- `httpOperatorStatusAdapter`;
- `createStaticOperatorStatusAdapter`;
- `operatorStatusDtoFromJson`;
- `runtimeUnavailableStatus`;
- `safeOperatorText` redaction for credentials and local absolute paths.

The adapter must never import local-runtime, workspace, workspace-ops, Node built-ins, ingestion services, SQLite, filesystem, or blob-store modules.

- [ ] **Step 6: Run targeted UI adapter tests**

Run:

```bash
npm test -- packages/ui/test/operator-status-adapter.test.ts packages/ui/test/request-data-boundary.test.ts
```

Expected: pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add docs/agentic/claims/task-3-operator-status-ui-adapter.md packages/ui/src/operator-status/operator-status-types.ts packages/ui/src/operator-status/operator-status-adapter.ts packages/ui/test/operator-status-adapter.test.ts packages/ui/test/request-data-boundary.test.ts
git commit -m "feat: add operator status UI adapter"
```

Expected: commit succeeds.

## Task 4: Command Cockpit Components

**Outcome:** The app has tested cockpit components for status bands, section details, diagnostics, source evidence, and safe commands.

**Files:**

- Create: `docs/agentic/claims/task-4-operator-cockpit-components.md`
- Create: `packages/ui/src/operator-status/OperatorCockpit.tsx`
- Create: `packages/ui/src/operator-status/OperatorStatusBand.tsx`
- Create: `packages/ui/src/operator-status/OperatorStatusDetail.tsx`
- Create: `packages/ui/test/operator-cockpit.test.tsx`
- Modify: `packages/ui/test/visual-contract.test.ts`

- [ ] **Step 1: Claim and start the task**

Create and commit the claim, then change status to `in-progress` and commit.

- [ ] **Step 2: Write failing component tests**

Create `packages/ui/test/operator-cockpit.test.tsx` with tests that:

- render four bands with labels Workspace, Ingestion, Legacy Import, and PRR/Investigations;
- select a band and show diagnostics/source evidence in a detail panel;
- render command actions as display text, not executable submit controls;
- render navigation actions as buttons that call `onNavigate(target)`;
- render refresh as a button that calls `onRefresh`;
- confirm there is no button named Send, Escalate, Repair ledger, Accept assertion, or Stage ontology.

- [ ] **Step 3: Run failing component tests**

Run:

```bash
npm test -- packages/ui/test/operator-cockpit.test.tsx
```

Expected: failure because cockpit components do not exist.

- [ ] **Step 4: Add cockpit components**

Create the components with these responsibilities:

- `OperatorCockpit`: owns selected section state and composition.
- `OperatorStatusBand`: renders one dense status band with state, headline, metrics, and primary safe action label.
- `OperatorStatusDetail`: renders diagnostics, source evidence, command descriptors, and safe action controls.

Use tactical design tokens already present in `packages/ui/src/styles.css`. Use buttons only for refresh and navigation actions. Use `<code>` for display-only CLI commands.

- [ ] **Step 5: Extend visual contract coverage**

Modify `packages/ui/test/visual-contract.test.ts` so the scanned UI files include:

```ts
"packages/ui/src/operator-status/OperatorCockpit.tsx",
"packages/ui/src/operator-status/OperatorStatusBand.tsx",
"packages/ui/src/operator-status/OperatorStatusDetail.tsx"
```

Assert the joined source contains:

```ts
"Workspace"
"Legacy Import"
"source evidence"
"var(--signal-amber)"
"var(--signal-cyan)"
"var(--signal-green)"
"var(--signal-red)"
```

- [ ] **Step 6: Run targeted component and visual tests**

Run:

```bash
npm test -- packages/ui/test/operator-cockpit.test.tsx packages/ui/test/visual-contract.test.ts
```

Expected: pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add docs/agentic/claims/task-4-operator-cockpit-components.md packages/ui/src/operator-status/OperatorCockpit.tsx packages/ui/src/operator-status/OperatorStatusBand.tsx packages/ui/src/operator-status/OperatorStatusDetail.tsx packages/ui/test/operator-cockpit.test.tsx packages/ui/test/visual-contract.test.ts
git commit -m "feat: render operator cockpit status bridge"
```

Expected: commit succeeds.

## Task 5: Command Screen Integration

**Outcome:** The default Command first viewport loads and renders the operator cockpit without breaking Requests or Ingestion modules.

**Files:**

- Create: `docs/agentic/claims/task-5-operator-cockpit-app-integration.md`
- Create: `packages/ui/test/operator-app-integration.test.tsx`
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/test/app-smoke.test.tsx`
- Modify: `packages/ui/test/dashboard.test.tsx` if existing Command assertions need the new cockpit wrapper.

- [ ] **Step 1: Claim and start the task**

Create and commit the claim, then change status to `in-progress` and commit.

- [ ] **Step 2: Write failing app integration tests**

Create `packages/ui/test/operator-app-integration.test.tsx` with tests that:

- render `<App operatorStatusAdapter={createStaticOperatorStatusAdapter(dto)} />`;
- assert the default first screen contains `Operator cockpit`, `Workspace`, `Ingestion`, `Legacy Import`, and `PRR/Investigations`;
- click the Ingestion safe navigation action and assert the Ingestion module opens;
- click refresh and assert the adapter reloads;
- assert unavailable runtime state remains on Command and does not open modal workflows.

- [ ] **Step 3: Run failing app tests**

Run:

```bash
npm test -- packages/ui/test/operator-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx
```

Expected: failure because `App` does not accept or render the operator status adapter.

- [ ] **Step 4: Wire App state**

Modify `packages/ui/src/App.tsx`:

- import `httpOperatorStatusAdapter` and `OperatorCockpit`;
- add optional prop `operatorStatusAdapter`;
- load operator status when `activeModuleId === "command"`;
- pass `onNavigate` to reuse existing module selection;
- pass `onRefresh` to reload status;
- place `OperatorCockpit` at the top of the Command main surface, before the existing `CommandDashboard` or with the existing queue below a labeled operational queue region.

Do not remove Requests or Ingestion adapter behavior.

- [ ] **Step 5: Update smoke expectations**

Modify `packages/ui/test/app-smoke.test.tsx` so the Command entry point test expects the cockpit labels before navigating to Requests. Preserve existing Requests, builder, modal, and PRR assertions.

- [ ] **Step 6: Run targeted app tests**

Run:

```bash
npm test -- packages/ui/test/operator-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/dashboard.test.tsx packages/ui/test/ingestion-app-integration.test.tsx
```

Expected: pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add docs/agentic/claims/task-5-operator-cockpit-app-integration.md packages/ui/src/App.tsx packages/ui/test/operator-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/dashboard.test.tsx
git commit -m "feat: make command screen an operator cockpit"
```

Expected: commit succeeds.

## Task 6: Runtime Smoke And Failure-State Coverage

**Outcome:** Targeted tests cover the named failure states and align the route with sibling readiness smoke expectations.

**Files:**

- Create: `docs/agentic/claims/task-6-operator-status-smoke.md`
- Modify: `packages/local-runtime/test/operator-status.test.ts`
- Modify: `packages/local-runtime/test/operator-status-routes.test.ts`
- Modify: `packages/ui/test/operator-cockpit.test.tsx`
- Modify: sibling smoke file only if the sibling planning output has already named an exact local readiness smoke path.

- [ ] **Step 1: Claim and start the task**

Create and commit the claim, then change status to `in-progress` and commit.

- [ ] **Step 2: Add failure-state tests**

Extend targeted tests to cover:

- missing drive;
- swapped drive;
- uninitialized workspace root;
- stale projections;
- ingestion blocked pending approval;
- ingestion source changed since approval;
- legacy samples needed;
- legacy raw import approval required;
- runtime unavailable;
- PRR ready with zero open requests.

Each test must assert a distinct section state, diagnostic message, and safe command or navigation action.

- [ ] **Step 3: Run failing failure-state command**

Run:

```bash
npm test -- packages/local-runtime/test/operator-status.test.ts packages/ui/test/operator-cockpit.test.tsx
```

Expected: failure for any state not yet mapped precisely.

- [ ] **Step 4: Complete state mappings**

Update the pure aggregation and UI rendering code so every named state has a distinct status and safe summary. Keep all domain rule checks in provider DTO adaptation, not React.

- [ ] **Step 5: Run targeted failure-state tests**

Run:

```bash
npm test -- packages/local-runtime/test/operator-status.test.ts packages/local-runtime/test/operator-status-routes.test.ts packages/ui/test/operator-cockpit.test.tsx packages/ui/test/operator-app-integration.test.tsx
```

Expected: pass.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/agentic/claims/task-6-operator-status-smoke.md packages/local-runtime/test/operator-status.test.ts packages/local-runtime/test/operator-status-routes.test.ts packages/ui/test/operator-cockpit.test.tsx packages/ui/test/operator-app-integration.test.tsx
git commit -m "test: cover operator status failure states"
```

Expected: commit succeeds.

## Task 7: Factory Readiness And Final Evidence

**Outcome:** Factory readiness requires this approved spec and plan, and final evidence is durable.

**Files:**

- Create: `docs/agentic/claims/task-7-operator-status-readiness.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`
- Modify: `packages/ui/test/request-data-boundary.test.ts`

- [ ] **Step 1: Claim and start the task**

Create and commit the claim, then change status to `in-progress` and commit.

- [ ] **Step 2: Write failing readiness assertion**

Modify `packages/ui/test/request-data-boundary.test.ts` so the readiness test expects:

```ts
const operatorBridgeSpecPath = "docs/superpowers/specs/2026-07-06-operator-workspace-status-import-bridge-design.md";
const operatorBridgePlanPath = "docs/superpowers/plans/2026-07-06-operator-workspace-status-import-bridge-implementation.md";
```

and includes both paths in the `requiredFiles` assertion.

- [ ] **Step 3: Run the failing readiness command**

Run:

```bash
npm test -- packages/ui/test/request-data-boundary.test.ts
```

Expected: failure because `scripts/check-agent-readiness.mjs` does not yet require the new spec and plan.

- [ ] **Step 4: Update factory readiness**

Modify `scripts/check-agent-readiness.mjs` so `requiredFiles` includes:

```js
"docs/superpowers/specs/2026-07-06-operator-workspace-status-import-bridge-design.md",
"docs/superpowers/plans/2026-07-06-operator-workspace-status-import-bridge-implementation.md"
```

- [ ] **Step 5: Record readiness evidence**

Append a section to `docs/agentic/software-factory.md` named `Operator Workspace Status And Import Bridge Plan Readiness` with:

- spec path;
- plan path;
- targeted command evidence;
- `npm run factory:check` evidence;
- `npm run verify` evidence;
- a statement that implementation preserves append-only ledger semantics, provenance, projection rebuildability, no PRR send, legal escalation locks, evidence-first legacy import, and browser boundary safety.

- [ ] **Step 6: Run targeted readiness checks**

Run:

```bash
git diff --check
npm test -- packages/ui/test/request-data-boundary.test.ts
npm run factory:check
```

Expected: all commands pass.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, UI build, and factory readiness pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add docs/agentic/claims/task-7-operator-status-readiness.md scripts/check-agent-readiness.mjs docs/agentic/software-factory.md packages/ui/test/request-data-boundary.test.ts
git commit -m "docs: record operator status bridge readiness"
```

Expected: commit succeeds.

## Review Gates

After each implementation task:

- The implementer records red/green/full verification evidence in the task claim.
- A spec reviewer checks the diff against `docs/superpowers/specs/2026-07-06-operator-workspace-status-import-bridge-design.md`.
- A code-quality reviewer checks browser boundary safety, DTO parsing, component behavior, and invariant preservation.
- Dependent tasks start only after the current task is approved or explicitly released.

## Completion Criteria

The implementation is complete when:

- `packages/operator-status` defines and tests `OperatorStatusDto`.
- `GET /api/operator/status` returns a safe read-only aggregate status DTO.
- The Command first viewport renders Workspace, Ingestion, Legacy Import, and PRR/Investigations readiness.
- Detail panels show diagnostics, source evidence, metrics, and inert safe command descriptors.
- The UI cannot perform PRR sends, legal escalation, destructive repair, provider byte transfer, accepted legacy ontology truth, or hidden portable workspace duplication.
- Browser boundary tests prevent Node-only and runtime/storage imports.
- All named failure states have distinct statuses and suggested safe commands.
- `npm run verify` passes.
- Factory readiness requires this spec and implementation plan.

## Plan Stop Conditions

Stop and escalate if:

- Any bridge action would mutate canonical ledger, blob, or workspace state.
- Any bridge action would send PRR correspondence, escalate legally, execute provider byte transfer, stage legacy assertions, or accept ontology truth.
- Browser code imports workspace, workspace-ops, local-runtime, ingestion services, SQLite, filesystem, blob-store, mount, or Node built-in modules.
- Local-runtime status aggregation creates a workspace, copies portable ontology data, falls back to repo-local storage while portable mode is selected, or accepts arbitrary path fields from browser requests.
- A sibling contract is unavailable and a fake implementation would re-own that sibling's semantics.
- A schema conflicts with workspace-ops, ingestion, legacy import, PRR, ontology, or local-runtime contracts.
- Credentials, live external services, unavailable external drives, or user-specific legacy samples are required.
- The same verifier fails after two focused repair attempts.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-operator-workspace-status-import-bridge-implementation.md`. Stop here for implementation-plan approval before starting Task 1.
