# Local Workspace Readiness Smoke Design

Date: 2026-07-06

## Purpose

This design covers an end-to-end local readiness smoke path for a fresh portable Cestus workspace. The smoke path proves that the completed portable workspace mount, ingestion runtime wiring, and workspace ops packages can work together before old-Cestus migration work relies on them.

The existing approved specs and plans prove each subsystem separately:

- Portable workspace mount creates and mounts one canonical workspace root with `ledger/ontology.sqlite`.
- Ingestion runtime wiring registers sources, runs dry-run inventories, records human raw-import approval, imports approved evidence, lists jobs, and reports diagnostics through stable DTOs.
- Workspace ops verifies workspace state, reports disk and manifest/export readiness, and returns JSON-first diagnostics.

They do not yet authorize one deterministic operator proof that creates a fresh workspace and walks the whole local chain. This slice adds that proof without changing migration semantics.

## Goals

- Provide a deterministic local smoke command and test fixture that can run without external services, credentials, provider parsing, network access, or a real external drive.
- Create a fresh portable workspace explicitly, then reopen it through the canonical mount contract.
- Verify mount identity and canonical path use before ingestion writes occur.
- Register a local source collection against a fixture source directory.
- Run a dry-run inventory that hashes source bytes and returns stable JSON.
- Record human raw-import approval as an approval-only event.
- Execute the approved import and prove evidence/blob writes are tied to the approved dry-run inventory.
- List ingestion jobs and diagnostics after import.
- Inspect the same workspace through workspace ops verify, disk usage, manifest export, and backup/export check operations.
- Return one AI-legible JSON report with stable schema version, named check IDs, success status, diagnostics, proposed repair actions, event counts, and safe workspace identity.
- Preserve append-only ledger semantics, evidence provenance, projection rebuildability, portable mount validation, human approval gates, and secret-safe diagnostics.

## Non-Goals

- No old-Cestus migration mapping, staging, assertion proposal, or ontology acceptance behavior.
- No live provider parsing, outbound document transfer, scraping, mailbox access, OAuth, or credentials.
- No PRR sending, legal escalation, publication, or irreversible external action.
- No automatic repair, deletion, reset, truncation, compaction, migration, or canonical ledger rewrite.
- No UI panels, desktop packaging, cloud sync, team server, or external-drive discovery beyond local temp or explicitly provided roots.
- No weakening of the pure package-level CLI injection contracts already used by workspace ops tests.

## Proposed Direction

Add a proof-oriented local runtime smoke module, exposed through an npm script, that composes the real local packages:

1. `packages/workspace` creates and mounts the portable workspace.
2. `packages/local-runtime` owns the smoke orchestration because it is the local app composition layer.
3. `packages/ingestion` receives an ingestion-facing mounted workspace backed by the mounted portable workspace's SQLite ledger and blob roots.
4. `packages/workspace-ops` verifies and exports the same workspace through its package operations.

The operator command should be JSON-only by default. It may print a short usage string for `--help`, but successful and failed runs must return a stable JSON envelope.

The command should be usable in two modes:

- `--workspace [root] --source [root]` uses caller-provided local paths and refuses unsafe or already-initialized workspace roots.
- No path flags creates a fresh temp workspace root and fixture source root for deterministic local verification. The command does not delete user-provided paths.

The smoke report should never include secrets, raw document bodies, raw extracted text, credentials, auth tokens, or provider configuration. Local absolute paths may appear only as safe file URIs in workspace ops DTOs where existing contracts already permit local operator diagnostics.

## Required Operator Chain

The smoke path must run the following checks in order. Each check returns a stable `checkId`, `ok`, `status`, and compact payload.

1. `workspace.create`: explicitly create `cestus-workspace.json` and canonical workspace directories.
2. `workspace.mount`: mount the workspace and confirm `ledger/ontology.sqlite` is the canonical ledger path.
3. `ingestion.mount-adapter`: construct an ingestion `MountedWorkspace` from the mounted portable workspace without inventing storage paths.
4. `ingestion.register-source`: append `ingestion.source.registered`.
5. `ingestion.dry-run`: hash fixture source bytes and append inventory events.
6. `ingestion.approve-import`: append raw import approval only and prove no evidence/blob write happens during approval.
7. `ingestion.import`: re-read current source bytes, verify the approved dry-run inventory, write unique blobs, append evidence linkage and import completion events, and enqueue local parse jobs.
8. `ingestion.jobs`: list scan, import, and local parse job DTOs.
9. `ingestion.diagnostics`: return ingestion diagnostics.
10. `workspace-ops.verify`: verify manifest, layout, ledger readability, blob store, projections, jobs, diagnostics, and backup/export readiness.
11. `workspace-ops.disk-usage`: report category byte counts.
12. `workspace-ops.manifest-export`: produce a secret-free manifest export summary.
13. `workspace-ops.backup-check`: validate the freshly exported manifest against current workspace identity and ledger high-water mark.

The smoke may create empty non-canonical support directories such as `diagnostics/` and `backups/` inside the fresh smoke workspace so workspace ops can report a fully ready proof. These directories are support state only. They must not contain credentials, raw evidence, or canonical repair state.

## JSON Contract

The top-level smoke report should follow this shape:

```ts
interface LocalWorkspaceReadinessSmokeReport {
  readonly schemaVersion: "local-workspace-readiness-smoke.v1";
  readonly ok: boolean;
  readonly status: "ready" | "degraded" | "blocked";
  readonly workspace: {
    readonly workspaceId: string;
    readonly label: string;
    readonly manifestVersion: number;
  };
  readonly source: {
    readonly sourceCollectionId: string;
    readonly label: string;
    readonly fixtureFileCount: number;
  };
  readonly checks: readonly LocalWorkspaceReadinessCheck[];
  readonly ingestion: {
    readonly eventCount: number;
    readonly evidenceCount: number;
    readonly blobCount: number;
    readonly jobCount: number;
    readonly diagnosticCount: number;
  };
  readonly workspaceOps: {
    readonly verifyStatus: "ready" | "degraded" | "blocked";
    readonly diskUsageStatus: "ready" | "degraded" | "blocked";
    readonly manifestExportStatus: "ready" | "degraded" | "blocked";
    readonly backupCheckStatus: "ready" | "degraded" | "blocked";
  };
  readonly diagnostics: readonly unknown[];
  readonly proposedActions: readonly unknown[];
}
```

`ok` is true only when all required checks succeeded and no canonical safety diagnostic is present. If workspace ops reports a support-state warning that does not affect canonical ledger, evidence, or provenance, the report may be `degraded`; the implementation should prefer initializing the fresh smoke support roots so the standard proof is `ready`.

## Safety And Failure Handling

- Existing portable workspace roots are never deleted, reset, or overwritten.
- The command must fail closed if a caller-provided workspace root already contains a manifest.
- Mount failures stop ingestion and return the mount diagnostic.
- Ingestion raw import approval must be measured before import execution and must not create evidence or blob writes.
- Import execution must rely on the existing stale-source verification gate.
- Workspace ops canonical repair actions remain proposed-only.
- Provider approval may be left unrun in this smoke because provider parsing is not needed for old-Cestus readiness and would imply outbound provider risk.
- Failed smoke runs should leave inspectable local artifacts in the fresh workspace root unless the root was created by a test harness that cleans up its own temp directories.

## Testing Requirements

Implementation must be test-driven and prove:

- A real fresh portable workspace manifest from `packages/workspace` can be resolved by `packages/workspace-ops`.
- The smoke report is deterministic under fixed IDs and timestamps.
- Approval-only raw import records an approval before evidence/blob writes.
- Import execution creates evidence and blob state only after approval and stale-source verification.
- The smoke report includes jobs, diagnostics, workspace verify, disk usage, manifest export, and backup check sections.
- The smoke command returns stable JSON and redacts secret-shaped arguments in errors.
- Missing or already-initialized workspace roots fail closed without deleting or rewriting state.
- `npm run verify` passes after implementation.

## Acceptance Criteria

The slice is ready when:

- `npm run local:workspace:smoke -- --json` runs locally without credentials or external services and returns a `local-workspace-readiness-smoke.v1` JSON report.
- The targeted smoke test proves the full chain from workspace creation through workspace ops export checks.
- The command is deterministic enough for AI coding agents to parse and compare.
- Factory readiness records this spec and plan after implementation.
- The implementation stays proof-oriented and does not change old-Cestus migration semantics.

## Approval Gate

Implementation should not begin until this spec and `docs/superpowers/plans/2026-07-06-local-workspace-readiness-smoke-implementation.md` are reviewed and approved.
