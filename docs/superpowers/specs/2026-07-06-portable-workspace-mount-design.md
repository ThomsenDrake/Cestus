# Portable Workspace Mount Design

Date: 2026-07-06

## Purpose

This design covers the portable Cestus workspace mounting layer. It makes a local Cestus deployment able to keep canonical durable state on an external drive instead of internal storage.

Cestus now has a durable local PRR runtime with repo-local SQLite storage, and ingestion has a small portable workspace helper. Those pieces prove useful storage mechanics, but they do not yet define one canonical mounted workspace root for the ontology ledger, evidence blobs, derivatives, job state, rebuildable projections, and secret-free workspace metadata.

This slice creates that contract. Any runtime-wired ingestion, legacy import, PRR workflow, governance workflow, diagnostics writer, or future investigation/reasoning feature must write through the mounted workspace contract when portable mode is selected.

## Approved Direction

The approved approach is a first-class shared workspace package named `packages/workspace`.

`packages/workspace` owns the portable workspace manifest, layout, mount validation, canonical path resolution, and secret-free diagnostics. `packages/local-runtime` consumes it when configured for portable workspace mode. `packages/ingestion` delegates its existing portable helper to it instead of owning a separate storage contract.

Portable mode uses one canonical SQLite ontology ledger:

```text
<workspace-root>/ledger/ontology.sqlite
```

PRR, ingestion, governance, diagnostics, legacy import, and future investigation/reasoning events all append to that ledger. They remain separated by event type, stream ID, causation ID, correlation ID, source collection ID, request ID, investigation ID, and workspace ID, not by separate SQLite files.

Repo-local and explicit SQLite storage remain compatibility and developer modes. They are not portable ontology modes and must not be treated as the long-term portable workspace model.

## Goals

- Define one canonical portable workspace root and one canonical `ledger/ontology.sqlite`.
- Keep evidence blobs, derivative blobs, job state, and rebuildable projection/cache state rooted under the same workspace.
- Make portable workspace manifests secret-free, AI-legible, and safe to inspect.
- Fail closed when a requested portable workspace is unavailable, invalid, unmounted, or structurally unsafe.
- Forbid silent fallback to internal storage while portable workspace mode is selected.
- Let the local runtime use `--workspace <root>`, env, or config to mount a workspace.
- Keep repo-local PRR SQLite and explicit SQLite paths available for compatibility, tests, and developer workflows.
- Preserve append-only ledger semantics, provenance, projection rebuildability, PRR send gates, legal escalation locks, and secret-safe diagnostics.
- Leave a clean path to small-team storage implementations without changing domain event contracts.

## Non-Goals

- No legacy importer implementation.
- No automatic migration from repo-local PRR SQLite into a portable workspace.
- No deletion, reset, truncation, compaction, or rewrite of any ledger.
- No schema migration system for existing ledgers.
- No cloud sync, team server, Postgres adapter, or multi-user locking model.
- No encryption or key-management design.
- No live provider credentials, OAuth material, mailbox configuration, or external-service setup.
- No in-app onboarding UI.
- No automatic creation of portable workspaces during ordinary runtime startup.

## Current Context

`packages/local-runtime/src/config.ts` currently resolves `repo-local`, `explicit-path`, and `app-data` storage strategies around one `sqlitePath`. The repo-local default is `.cestus/local/prr-ledger.sqlite`.

`packages/local-runtime/src/runtime-factory.ts` constructs `SQLiteEventLedger` from `config.storage.sqlitePath` and injects it into `createPrrRuntime`.

`packages/ingestion/src/workspace.ts` currently creates a self-contained ingestion layout with:

```text
cestus-workspace.json
ledger/ontology.sqlite
blobs/
derivatives/
jobs/
```

That layout is the right shape, but the ownership is wrong for this slice. The canonical workspace contract must belong to a shared package, not ingestion, because PRR, governance, diagnostics, and future import/reasoning work must use the same mounted root.

## Architecture

`packages/workspace` is a small Node-safe package. It has no dependency on PRR, ingestion, UI, local-runtime HTTP handlers, or provider code.

It exports:

- `createPortableWorkspace(input)`: explicitly initializes a workspace layout and writes `cestus-workspace.json` using exclusive create semantics.
- `mountPortableWorkspace(input)`: validates an existing workspace root and returns an immutable mounted workspace handle.
- `readPortableWorkspaceManifest(input)`: parses and validates the manifest without constructing runtime storage.
- `portableWorkspacePaths(root)`: derives canonical paths from a root after the root has passed safety checks.
- Typed result and diagnostic objects for mount failures.

The mounted workspace handle is the contract passed to runtime wiring:

```ts
interface MountedPortableWorkspace {
  readonly workspaceId: string;
  readonly label: string;
  readonly rootDir: string;
  readonly manifestPath: string;
  readonly paths: {
    readonly ledgerPath: string;
    readonly blobRoot: string;
    readonly derivativeRoot: string;
    readonly jobRoot: string;
    readonly projectionRoot: string;
    readonly cacheRoot: string;
    readonly configRoot: string;
  };
}
```

`packages/local-runtime` adds a `portable-workspace` storage strategy. When selected, config resolution requires a workspace root and runtime factory uses `mountedWorkspace.paths.ledgerPath`.

`packages/ingestion` keeps its public workspace helper for compatibility with existing ingestion tests and imports, but the helper delegates to `packages/workspace`. Ingestion import, parsing, and provider approval code must receive a mounted workspace handle or stores constructed from it. They must not accept ad hoc ledger, blob, derivative, or job paths in portable runtime wiring.

## Workspace Layout

A portable workspace root contains:

```text
cestus-workspace.json
ledger/
  ontology.sqlite
blobs/
derivatives/
jobs/
projections/
cache/
config/
```

`ledger/ontology.sqlite` is the canonical append-only ontology ledger for portable mode. Large raw evidence content lives under `blobs/`. Parse and normalization outputs live under `derivatives/`. Job state and durable job manifests live under `jobs/`. Projection and cache directories are explicitly rebuildable and never sources of truth.

`config/` may contain workspace-local, secret-free settings and manifests. It must not contain auth tokens, provider keys, OAuth tokens, passwords, mailbox credentials, private keys, or raw session material.

The first implementation may create empty projection/cache/config directories so the AI-legible layout is visible, even if no projection writer uses them yet.

## Manifest Contract

`cestus-workspace.json` is secret-free and AI-legible. Version 1 includes:

- `version`: manifest schema version, starting at `1`.
- `layoutVersion`: workspace layout version, starting at `1`.
- `workspaceId`: stable ID matching `ws_...`.
- `label`: human-readable workspace label.
- `createdAt`: ISO datetime when the workspace was initialized.
- `createdBy`: actor or tool label such as `cestus-local-runtime` or `cestus-ingest`.
- `coreVersion`: Cestus core version string when known.
- `description`: optional human-readable description.

The manifest must reject unsupported keys in sections where secrets could hide. The parser must reject or fail the mount for fields whose keys look like secret material, including token, secret, password, oauth, credential, api key, private key, and session.

The manifest is not an authorization store and not a provider configuration file.

## Mount And Config Behavior

Local runtime config adds:

- Storage strategy: `portable-workspace`.
- Workspace root: from CLI, env, or config file.
- Env name: `CESTUS_WORKSPACE_ROOT`.
- CLI flag: `--workspace <root>`.
- Configure shape: `npm run local:runtime:configure -- --storage portable-workspace --workspace <root>`.

Resolution order follows the existing local runtime config model: env overrides config file, config file overrides defaults. Portable mode has no default root. A root must be supplied explicitly.

When `portable-workspace` is selected:

1. Config resolution verifies that a workspace root was supplied.
2. Runtime startup calls `mountPortableWorkspace(root)`.
3. Mounting validates the directory, manifest, layout, and path safety.
4. Runtime uses only paths returned by the mounted workspace handle.

Silent fallback to internal storage is explicitly forbidden in portable mode. If the external drive is missing, the manifest is missing, the manifest is invalid, or the ledger path is unavailable, startup must fail closed with a safe diagnostic. It must not create `.cestus/local/prr-ledger.sqlite`, use an explicit SQLite path, or create a new workspace unless the user runs an explicit workspace creation command.

Repo-local mode remains the default compatibility/local-dev mode. Explicit SQLite mode remains a compatibility/developer escape hatch and a possible migration source. Neither mode is considered a portable ontology workspace.

## Data Flow

### Runtime Startup In Portable Mode

1. Operator configures `portable-workspace` and a workspace root.
2. Local runtime resolves config.
3. Local runtime mounts the workspace through `packages/workspace`.
4. Runtime factory constructs `SQLiteEventLedger` with `paths.ledgerPath`.
5. PRR runtime loads workspace DTOs by replaying events from the canonical ontology ledger.
6. Health diagnostics report the storage strategy and mounted status without exposing secrets.

### PRR Draft Creation

1. Browser posts draft input to the local runtime.
2. HTTP handler validates the input before durable append.
3. `PrrRuntime` appends PRR request and deadline events to `ledger/ontology.sqlite`.
4. Workspace DTOs are rebuilt from replayed ledger events.
5. Restarting the runtime against the same mounted root shows the draft from replay.

### Ingestion And Legacy Import Wiring

1. Ingestion or importer code receives a mounted workspace handle.
2. Evidence blobs are written under `paths.blobRoot`.
3. Derivatives are written under `paths.derivativeRoot`.
4. Job state uses `paths.jobRoot`.
5. All source registration, occurrence, import, evidence linkage, parse, diagnostic, and provider approval events append to the same canonical ledger.

The importer is not designed in this slice. This slice only defines the storage/mount contract it must use.

## Failure Handling

Mount failures return structured, secret-safe diagnostics with stable categories:

- `workspace-root-required`
- `workspace-root-missing`
- `workspace-root-not-directory`
- `workspace-manifest-missing`
- `workspace-manifest-invalid-json`
- `workspace-manifest-invalid`
- `workspace-manifest-unsupported-version`
- `workspace-layout-conflict`
- `workspace-ledger-unavailable`
- `workspace-secret-material-rejected`

Portable mode handles these failures by stopping startup or returning an operator-facing error. It never falls back to internal storage.

Directory conflicts fail closed. For example, if `blobs` exists as a file, mount fails. If `ledger` exists as a file, mount fails. If `ledger/ontology.sqlite` cannot be created or opened by `SQLiteEventLedger`, runtime startup fails.

Projection/cache failures must be classified separately from ledger mount failures. Corrupt rebuildable projection/cache state must not become a hidden source of truth. A future projection worker may rebuild or quarantine those directories, but this slice must not silently repair or delete them.

Diagnostics must not include auth tokens, provider credentials, OAuth material, passwords, raw document bodies, private keys, or session material. Absolute paths may appear only in local operator diagnostics where they are necessary to identify the missing workspace; they must not be placed into browser-facing UI unless the route is local and safe under the runtime auth policy.

## Testing Requirements

Implementation should be test-driven and split into small factory tasks.

Workspace package tests should verify:

- `createPortableWorkspace` creates the canonical layout.
- The manifest is strict, versioned, AI-legible, and secret-free.
- Mounting returns exactly one canonical `ledger/ontology.sqlite`.
- Missing root fails closed.
- Missing manifest fails closed.
- Invalid JSON fails closed.
- Unsupported manifest version fails closed.
- File/directory layout conflicts fail closed.
- Secret-like manifest keys are rejected.
- Derived paths cannot escape the workspace root.

Local runtime config and factory tests should verify:

- `portable-workspace` requires a workspace root.
- Env/config/CLI resolution supports `CESTUS_WORKSPACE_ROOT` and `--workspace`.
- Portable mode uses `mountedWorkspace.paths.ledgerPath`.
- Portable mode never falls back to repo-local or explicit SQLite when mount fails.
- Repo-local mode still uses `.cestus/local/prr-ledger.sqlite` as compatibility/default-local mode.
- Explicit SQLite mode still works as a developer compatibility mode.
- Health/config diagnostics identify storage strategy and mount status without leaking secrets.

Runtime behavior tests should verify:

- Empty mounted ledger returns an empty PRR workspace without seeding.
- Draft creation appends to the portable workspace ledger.
- Closing and reopening the runtime against the same workspace root replays the draft.
- Dev seed, if enabled, seeds the mounted canonical ledger only when portable mode is mounted.
- No route deletes, resets, truncates, compacts, sends email, or triggers legal escalation.

Ingestion compatibility tests should verify:

- Existing ingestion workspace helper delegates to `packages/workspace`.
- Ingestion layout expectations remain stable.
- Blob, derivative, and job roots come from the mounted workspace contract.
- Ingestion event payloads continue to use workspace/source identifiers and do not store secret config.

Factory and boundary tests should verify:

- Browser UI imports no Node-only workspace, runtime, SQLite, or filesystem modules.
- `npm run factory:check` includes this spec after implementation readiness.
- `npm run verify` passes.

## Factory Execution Expectations

The implementation plan should define small work orders with:

- one measurable outcome per task
- allowed files
- required reading
- failing test or validation first
- exact targeted failing command
- smallest scoped change
- exact targeted passing command
- `npm run verify`
- commit
- review handoff
- rollback and escalation criteria

Autonomous execution stops on:

- data-loss risk
- schema conflict with ontology, PRR, ingestion, or governance event contracts
- unavailable external drive where portable mode is selected
- any silent fallback from portable mode to internal storage
- browser import of Node-only workspace/runtime code
- credential need
- external-service dependency
- verifier failure after two focused repair attempts
- changes that weaken append-only ledger semantics, provenance, projection rebuildability, PRR send gates, legal escalation locks, or secret-safe diagnostics

## Invariants

- Portable mode has one workspace root.
- Portable mode has one canonical ontology ledger at `ledger/ontology.sqlite`.
- Portable mode never silently falls back to internal storage.
- Repo-local and explicit SQLite modes are compatibility/developer modes, not portable ontology modes.
- The ledger remains append-only.
- Corrections, reversals, migrations, and review changes are new events.
- Projections and caches are rebuildable and never sources of truth.
- Manifest and workspace config are secret-free and AI-legible.
- Raw evidence blobs and derivative artifacts are content-addressed outside the ledger.
- PRR send gates and legal escalation locks remain human-approved and event-backed.
- Diagnostics are structured, inspectable, and secret-safe.

## Risks

The biggest product risk is split-brain local data. If a user starts portable mode without the external drive mounted and Cestus quietly writes internally, the canonical ontology would split. The design prevents this by making silent fallback forbidden and tested.

The biggest architecture risk is storage vocabulary drift. If ingestion, local-runtime, and legacy import each resolve their own ledger/blob/job paths, future agents may bypass the canonical contract. The design prevents this by making `packages/workspace` the owner of path derivation and mount validation.

The biggest scope risk is turning this slice into a migration or desktop packaging project. Migration from repo-local PRR SQLite and packaged app-data behavior remain separate follow-up slices.

## Approval Record

The approved choices were:

- Use `packages/workspace` as the first-class shared workspace package.
- Use one canonical portable workspace root.
- Use one canonical SQLite ontology ledger at `ledger/ontology.sqlite`.
- Require PRR, ingestion, governance, diagnostics, legacy import, and future investigation/reasoning events to append to the same ontology ledger in portable mode.
- Treat repo-local PRR SQLite and explicit SQLite paths as compatibility/developer modes.
- Forbid silent fallback to internal storage in portable mode.
- Keep manifest and config secret-free and AI-legible.
