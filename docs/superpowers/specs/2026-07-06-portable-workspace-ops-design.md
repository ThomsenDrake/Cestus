# Portable Workspace Ops Design

Date: 2026-07-06

## Purpose

This design covers portable workspace operations for external-drive Cestus workspaces. The first ops slice should let investigators and autonomous coding agents verify a workspace, understand disk usage, detect missing or unmounted drives safely, rebuild expendable projections, inspect diagnostics, and check backup or export manifests without requiring the local runtime or UI to be running.

Portable workspace ops is lower priority than mount and ingestion runtime wiring, but it can be designed in parallel. The portable mount contract is owned by another workstream. This design treats mount resolution, workspace manifest shape, and final storage layout as interface dependencies instead of hardcoding final paths.

## Goals

- Define CLI/JSON-first package contracts as the first source of truth for workspace operations.
- Keep operations usable when the app runtime is down, the UI is unavailable, or an AI agent needs deterministic checks.
- Verify workspace identity, manifest validity, layout readability, ledger readability, blob-store integrity signals, projection state, diagnostics, and backup or export manifest readiness.
- Report disk usage by workspace storage category using stable machine-readable DTOs.
- Detect missing, unmounted, wrong-drive, and unreadable workspace states without creating directories at expected mount paths.
- Allow projection rebuilds only for expendable projection artifacts derived from append-only ledger events.
- Make canonical ledger, event, and blob repairs proposed-only until a future human-approved append-only repair flow exists.
- Preserve secret-safe diagnostics and avoid raw private content in default command output.
- Keep JSON DTOs stable and explicit enough for generic coding agents to consume.

## Non-Goals

- Implementing the portable mount contract or choosing final drive paths.
- Making local-runtime HTTP endpoints mandatory for the first ops slice.
- Building UI panels for workspace ops in the first slice.
- Repairing, deleting, rewriting, compacting, or migrating canonical ledger events or evidence blobs automatically.
- Copying evidence backups or restoring from backups in the first ops slice.
- Adding live external services, credentials, cloud sync, or device trust.
- Replacing ingestion runtime wiring, legacy importer work, or public portal ingestion.

## Approved Direction

The approved approach is a new workspace ops core package with a thin CLI facade. The package owns stable JSON DTOs and deterministic operation contracts. The CLI is the first consumer and prints JSON by default. Future local-runtime HTTP endpoints and UI panels adapt these contracts rather than becoming the source of truth.

The package depends on abstract workspace and mount interfaces. Once the portable mount contract lands, workspace ops should bind to it through an adapter. Until then, implementation tasks should keep layout assumptions narrow and testable through fixtures.

Read-only checks are first-class. Projection regeneration is first-class only because projections are expendable read models. Canonical repairs are never automatic: ops returns diagnostics and proposed repair actions that require future human approval and append-only repair events before any canonical state changes.

## Relationship To Existing Cestus Contracts

Workspace ops sits above the existing durable primitives:

- The ontology ledger remains append-only. Corrections, reviews, migrations, repairs, and reversals are new events.
- Evidence blobs remain content-addressed canonical artifacts. Ops may read and hash-check them but must not mutate or delete them.
- Projections remain rebuildable from ledger events and may be regenerated as expendable artifacts.
- Diagnostics remain structured, inspectable, and secret-safe.
- Ingestion workspace manifests and events remain owned by ingestion and the future mount contract. Ops validates and reports on them through interfaces.
- Governance incident and repair concepts remain event-backed. Ops may recommend repair events but must not invent hidden repair state.

## Architecture

The first implementation should add a package such as `packages/workspace-ops` and a CLI entrypoint such as `cestus-workspace`. Exact names can be refined during implementation planning, but the boundary should remain:

- `WorkspaceLocator`: resolves a user-provided workspace root, manifest path, or mount identity into a candidate workspace without creating missing paths.
- `WorkspaceLayout`: describes resolved paths or URIs for the manifest, ledger, blob roots, derivative roots, projection roots, job state, diagnostics, and backup manifests. It includes a layout contract version from the mount/workspace contract.
- `WorkspaceOps`: exposes deterministic operations that return JSON DTOs.
- `WorkspaceRepairPlanner`: turns failures into inert proposed repair actions.
- `ProjectionRebuilder`: rebuilds expendable projections from ledger events into projection artifact roots.
- CLI facade: parses argv, calls `WorkspaceOps`, prints JSON, and maps command status to exit codes.

The package should prefer dependency injection for filesystem, clock, hashing, and ledger access so tests can prove missing-drive behavior and DTO stability without touching real external drives.

## Initial Command Surface

The initial CLI should expose JSON-first commands for:

- `verify workspace`: validate workspace identity, manifest shape, mount status, ledger readability, blob roots, projection roots, diagnostic visibility, and backup/export manifest readiness.
- `disk usage`: report byte counts and free-space signals by storage category.
- `detect drive`: resolve mount availability and wrong-drive states without opening canonical stores when the mount is absent.
- `projection rebuild-readiness`: check whether requested projections can be rebuilt safely.
- `projection rebuild`: regenerate only expendable projection artifacts.
- `diagnostics inspect`: list durable and derived diagnostics with safe messages and repair hints.
- `manifest export`: create or validate a secret-free workspace manifest export.
- `backup check`: check backup/export manifest coverage and staleness without copying or deleting evidence.

Readable terminal summaries may be added as formatting over the same DTOs. JSON remains the durable first contract.

## JSON DTO Contract

Every command should return a stable envelope:

```ts
interface WorkspaceOpsEnvelope<TPayload> {
  schemaVersion: "workspace-ops.v1";
  command: string;
  ok: boolean;
  status: "ready" | "degraded" | "blocked";
  workspace?: WorkspaceRefDto;
  payload?: TPayload;
  diagnostics: WorkspaceDiagnosticDto[];
  proposedActions: ProposedRepairActionDto[];
}
```

`WorkspaceRefDto` should include only safe identity and layout information:

```ts
interface WorkspaceRefDto {
  workspaceId: string;
  label: string;
  manifestVersion: number;
  rootUri: string;
  layoutContractVersion: string;
}
```

The primary payload DTOs should include:

- `MountStatusDto`: `available`, `missing`, `unmounted`, `wrong-drive`, or `unreadable`, plus safe next-command hints.
- `WorkspaceVerifyDto`: manifest, layout, ledger, blob store, projections, jobs, diagnostics, and backup/export readiness sections.
- `DiskUsageDto`: per-root byte counts, estimated free bytes when available, threshold warnings, and category totals. Default output should avoid raw filenames.
- `ProjectionRebuildDto`: requested projections, readiness, input ledger high-water mark, artifact outputs, validation results, and failure details.
- `DiagnosticsInspectDto`: durable and derived diagnostics, severity, category, safe message, repair hint, related safe IDs, and whether the diagnostic is durable.
- `ManifestExportDto`: exported manifest hash, included sections, excluded secret-bearing fields, workspace identity, and coverage summary.
- `BackupCheckDto`: backup manifest identity match, covered roots, stale or missing categories, and safe next actions.

Proposed repair actions should be inert:

```ts
interface ProposedRepairActionDto {
  actionId: string;
  kind:
    | "remount-drive"
    | "select-workspace"
    | "rerun-verify"
    | "rebuild-projection"
    | "export-manifest"
    | "append-repair-event-required";
  title: string;
  severity: "info" | "warning" | "error";
  requiresHumanApproval: boolean;
  mutatesCanonicalState: boolean;
  allowedNextCommands: string[];
}
```

Any action that could affect canonical ledger events or evidence blobs must have `requiresHumanApproval: true` and `mutatesCanonicalState: true`, and the command must not execute that action automatically.

## Safety And Failure Handling

Missing drive checks must never create directories at expected mount paths. The locator may inspect a provided path, parent mount metadata, or a manifest path if present, but it must not call recursive directory creation, initialize SQLite, or create placeholder manifests during missing-drive detection.

Workspace verification should degrade or block instead of repairing. Examples:

- Missing root path returns `blocked` with `mountStatus: "missing"` or `mountStatus: "unmounted"`.
- Existing path with the wrong manifest returns `blocked` with `mountStatus: "wrong-drive"`.
- Unreadable manifest returns `blocked` with a safe diagnostic and no workspace initialization.
- Ledger read failure returns `blocked` or `degraded` depending on whether any read model can still be trusted.
- Blob hash mismatch returns an error diagnostic and a proposed append-only repair workflow, not a blob rewrite.
- Projection staleness returns `degraded` with an allowed `projection rebuild` action.

Diagnostics and DTOs must not include secrets, provider credentials, raw private document bodies, raw correspondence bodies, source identities beyond safe references, or long raw path listings by default. A future local-only verbose mode can be separately designed if needed.

## Projection Rebuild Behavior

Projection rebuilds may write only expendable projection artifacts. They must not write ledger events, evidence blobs, ingestion occurrence events, governance events, or repair events in the first ops slice.

`projection rebuild-readiness` should check:

- workspace and mount availability
- ledger readability
- event contract validation
- requested projection names and versions
- target projection root writability
- available disk space threshold
- whether prior projection artifacts can be preserved during rebuild

`projection rebuild` should:

- read all required events from the ledger
- rebuild into a temporary artifact directory under the projection root
- validate the rebuilt projection output
- atomically promote the rebuilt artifacts where the filesystem supports it
- preserve the previous projection when rebuild fails
- return a `ProjectionRebuildDto` that includes high-water marks, artifact hashes, warnings, and failures

If durable rebuild audit events such as `projection.checkpointed` become necessary, they should be added through a later explicit design because they append canonical ledger state.

## Diagnostics Behavior

`diagnostics inspect` should merge two diagnostic sources:

- Durable diagnostics from `diagnostic.recorded` ledger events.
- Derived ops diagnostics created during the current command.

The DTO must distinguish them with `durable: true` or `durable: false`. Derived diagnostics explain current state but do not pretend to be append-only history.

Diagnostic categories should support workspace concerns such as manifest validation, mount availability, disk capacity, ledger readability, blob integrity, projection rebuild, backup coverage, and unsupported layout versions. If existing ontology diagnostic categories are not sufficient for durable recording, a later implementation plan should add strict contract extensions rather than overloading unrelated categories.

Repair hints must list allowed next commands and approval requirements. They should be concrete enough for an AI agent to choose the next safe command without guessing.

## Backup And Manifest Behavior

`manifest export` should produce a secret-free portable manifest export. It should include:

- workspace identity and label
- manifest and layout contract versions
- ledger summary such as event count and high-water mark
- blob-store summary such as content-addressed root coverage and aggregate bytes
- derivative and projection artifact summaries
- diagnostic and job-state summary
- backup/export manifest creation time
- stable hashes for manifest sections

It must not include raw evidence bytes, secrets, provider credentials, private document text, raw correspondence bodies, or hidden runtime tokens.

`backup check` should verify whether a backup or export manifest:

- matches the current workspace identity
- references the active layout contract version
- covers expected workspace categories
- is stale relative to ledger high-water mark or manifest export time
- omits required categories
- contains secret-shaped fields

The first slice does not copy, restore, delete, or rewrite backups. It reports coverage and proposed next actions.

## CLI Semantics

The CLI should be non-interactive for core operations. It should support explicit paths or manifest references but must not rely on hidden globals.

Suggested exit mapping:

- `0`: command completed and `status` is `ready`.
- `2`: command completed with `status` `degraded`.
- `3`: command completed with `status` `blocked`.
- `1`: command invocation failed, such as unsupported flags or invalid JSON input.

Exit codes are secondary to JSON. Agents should read the JSON envelope first.

## AI-Agent Contract

Generic coding agents may:

- run read-only verify, disk usage, drive detection, diagnostics, manifest export, and backup check commands
- run projection rebuild-readiness
- run projection rebuild for expendable projections only
- report diagnostics and proposed actions
- create implementation tasks that add strict contracts and tests

Generic coding agents must not:

- create directories at missing mount paths during drive detection
- initialize a new workspace at an expected external-drive path as a side effect of verification
- delete, rewrite, compact, migrate, or repair canonical ledger events
- delete, rewrite, or repair evidence blobs
- forge human approval for repairs
- hide canonical repair behind projection rebuild
- include secrets or raw private content in diagnostics, manifests, claims, or command output

## Testing And Verification

Implementation planning should require focused tests for:

- JSON envelope stability and schema versioning
- CLI JSON output and exit-code mapping
- missing-drive detection that does not create directories
- wrong-drive and unreadable-manifest states
- manifest validation through a layout adapter
- disk usage categorization and threshold warnings
- ledger readability and event validation failures
- blob hash mismatch reporting without mutation
- projection rebuild-readiness checks
- projection rebuild writing only expendable artifacts
- failed projection rebuild preserving prior projection artifacts
- diagnostics redaction and durable versus derived diagnostic markers
- backup/export manifest identity, coverage, staleness, and secret-shaped field checks
- fixture-based deterministic DTO output for generic agents

Standard verification for the implementation plan should include targeted package tests plus:

```bash
npm run verify
```

## Acceptance Criteria

The design is ready for implementation planning when a future plan can assign small tasks that:

- create CLI/JSON-first workspace ops contracts
- avoid local-runtime HTTP endpoint requirements in the first slice
- keep the portable mount contract as an adapter dependency
- prove missing-drive checks never create directories at expected mount paths
- prove projection rebuild writes only expendable projection artifacts
- prove canonical ledger/event/blob repairs are proposed only
- keep diagnostics and manifests secret-safe
- produce stable JSON DTOs for generic coding agents
- preserve append-only ledger semantics, evidence provenance, and projection rebuildability
- stop on data-loss risk, schema conflict, mount contract conflict, credential need, unavailable dependency, external-service dependency, or repeated verifier failure

## First Slice Summary

The first implementation slice should make Cestus able to run runtime-independent workspace ops from a CLI and receive stable JSON results. It should verify a portable workspace, report disk usage, safely detect missing or unmounted drives, check projection rebuild readiness, rebuild expendable projections, inspect diagnostics, export secret-free manifests, and check backup manifest coverage. It should leave HTTP endpoints, UI panels, final mount path binding, backup copying, restore flows, and canonical repair execution to future approved slices.
