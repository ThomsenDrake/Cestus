# Portable Workspace Attachment Ops Design

Date: 2026-07-06

## Purpose

This design covers the remaining operator-readiness gap for portable Cestus ontology workspaces stored on an external drive.

The existing portable workspace mount design created the canonical workspace root and `ledger/ontology.sqlite` contract. The existing workspace ops design created stable CLI/JSON DTOs and read-only operations. The current code still leaves a practical gap: a solo investigator can create and configure a portable workspace, but the ops executable is not wired to real operations, workspace ops still uses a provisional layout adapter, and local runtime configuration does not yet record an expected workspace identity that catches a swapped drive before opening.

This slice makes the external-drive attachment flow real and safe from the command line:

1. Create a portable workspace on the external drive.
2. Configure the local runtime to attach to that workspace.
3. Detect whether the expected drive and workspace are present.
4. Verify the mounted workspace without creating hidden internal state.
5. Open the local runtime against the canonical external-drive ledger.
6. Diagnose missing, unreadable, or swapped-drive states through secret-safe JSON.

## Existing Authorization Check

The existing approved specs and plans authorize the foundation, but not the complete operator-ready flow.

Already authorized and implemented:

- `packages/workspace` owns the canonical manifest, root layout, mount validation, and fail-closed diagnostics.
- Portable mode uses exactly one canonical ontology ledger at `<workspace-root>/ledger/ontology.sqlite`.
- Local runtime portable mode uses the mounted workspace ledger and must not fall back to `.cestus/local/prr-ledger.sqlite`.
- `packages/workspace-ops` owns JSON DTOs for verify, disk usage, drive detection, projection rebuild checks, diagnostics, manifest export, and backup checks.

Not yet authorized by the existing plans:

- Binding `packages/workspace-ops` to the canonical `packages/workspace` manifest and layout instead of the provisional layout adapter.
- Making the `cestus-workspace` executable run real read-only operations rather than returning `WORKSPACE_OPS_RUNTIME_WIRING_REQUIRED`.
- Recording an expected workspace ID in secret-free local runtime config so a swapped external drive fails closed before opening.
- Treating an explicitly created but unopened portable workspace as valid even when the SQLite file has not yet been initialized.
- Providing a single tested create, configure, detect, verify, open, and diagnose operator path.

This design is therefore a focused follow-up, not a replacement for the mount or ops specs.

## Goals

- Make external-drive attachment usable through CLI/runtime commands before any UI work.
- Bind workspace ops to the canonical portable workspace layout and manifest.
- Detect missing, unmounted, unreadable, and swapped-drive states without creating directories at expected mount paths.
- Let operators store an expected workspace ID in local runtime config as an attachment guardrail.
- Keep the manifest as the canonical workspace identity and keep local config as a secret-free expectation, not a source of ontology truth.
- Run real workspace ops executable commands with JSON output and deterministic exit codes.
- Verify a newly created workspace before first runtime open without forcing internal storage or hidden ledger creation.
- Preserve append-only ledger semantics, provenance, projection rebuildability, portable mount validation, and secret-safe diagnostics.
- Keep repo-local and explicit SQLite modes as compatibility/developer modes.

## Non-Goals

- No UI panel or onboarding screen.
- No automatic migration from repo-local SQLite to a portable workspace.
- No copying large ontology data to internal disk.
- No backup copying, restore flow, cloud sync, or external service setup.
- No canonical ledger repair, deletion, compaction, rewrite, reset, or schema migration.
- No encryption or key-management changes.
- No live provider credentials, mailbox credentials, OAuth setup, or document transfer.
- No team server, Postgres adapter, collaboration permissions, or device trust model.

## Operator Flow

### Create

The operator explicitly creates a workspace on the external drive:

```bash
npm run local:workspace:create -- --workspace /media/case-drive/cestus-case --label "Case A"
```

The command writes only the portable workspace manifest and canonical empty directories under the selected external-drive root. It may generate a `ws_...` ID when the operator does not provide one. It must not create `.cestus/local/prr-ledger.sqlite` or copy ontology data to internal disk.

The command may leave `ledger/ontology.sqlite` absent. That state means "canonical ledger path is ready but not initialized." It is not a missing-drive error.

### Configure

The operator configures local runtime portable mode:

```bash
npm run local:runtime:configure -- --storage portable-workspace --workspace /media/case-drive/cestus-case --workspace-id ws_case_a
```

`--workspace-id` is secret-free and optional when the workspace manifest can be read during configuration. If omitted and the manifest is readable, the configure command records the manifest ID. If omitted and the manifest is not readable, configuration must either fail with a safe diagnostic or require the operator to provide `--workspace-id`.

The config file remains local runtime attachment state. It is not a source of ontology truth and it must not contain evidence, derived artifacts, provider credentials, auth material, or raw document content.

### Detect

The operator detects the external drive and identity before opening the runtime:

```bash
npm run workspace:ops -- detect drive --root /media/case-drive/cestus-case --workspace-id ws_case_a
```

The command must not create directories, manifests, SQLite files, projection artifacts, or placeholder roots. It returns JSON with `status` `ready` only when the selected root contains the expected canonical manifest identity.

If the path exists but contains another workspace ID, the command returns `status` `blocked`, `mountStatus.status` `wrong-drive`, and an action such as `select-workspace`.

### Verify

The operator verifies the workspace:

```bash
npm run workspace:ops -- verify workspace --root /media/case-drive/cestus-case --workspace-id ws_case_a
```

Verification checks the canonical layout, manifest validity, expected identity, ledger readability, blob roots, projection roots, job roots, cache/config roots, derived diagnostics, and backup/export manifest readiness. It reports a newly created workspace whose ledger file is absent as an empty uninitialized canonical ledger path, not as an instruction to fall back internally.

If `ledger/ontology.sqlite` exists but cannot be read as a valid SQLite ontology ledger, verification blocks and proposes an append-only repair workflow. It must not rewrite, delete, or repair the ledger.

### Open

The operator opens the local runtime:

```bash
npm run local:runtime
```

When local config selects `portable-workspace`, runtime startup mounts the workspace, validates the expected workspace ID when configured, and constructs `SQLiteEventLedger` only at the mounted workspace ledger path. A missing drive, invalid manifest, wrong workspace ID, or layout conflict stops startup. The runtime must not fall back to repo-local or explicit SQLite storage.

Health diagnostics may report `workspaceMounted: true` and the safe `workspaceId`. They must not expose auth material, provider credentials, raw evidence, or browser-facing absolute paths.

### Diagnose

The operator can diagnose without opening the runtime:

```bash
npm run workspace:ops -- diagnostics inspect --root /media/case-drive/cestus-case --workspace-id ws_case_a
npm run workspace:ops -- disk usage --root /media/case-drive/cestus-case
npm run workspace:ops -- manifest export --root /media/case-drive/cestus-case
```

Diagnostics merge durable diagnostic events from the ledger when readable with derived diagnostics from the current command. Output is secret-safe JSON. Raw document bodies, correspondence bodies, source-private notes, auth material, provider credentials, and long path listings are excluded by default.

## Architecture

### Canonical Workspace Package

`packages/workspace` remains the owner of the manifest schema, mount validation, path derivation, and secret-key rejection. This slice adds identity expectation support:

- `MountPortableWorkspaceInput.expectedWorkspaceId?: string`
- mount failure code `workspace-identity-mismatch`
- safe diagnostic text and repair actions for swapped-drive states

The manifest remains the canonical identity. Expected identity is a caller-supplied guardrail only.

### Local Runtime Config

`packages/local-runtime` extends portable storage config with:

- `workspaceRoot`
- `expectedWorkspaceId`

Environment support:

- `CESTUS_WORKSPACE_ROOT`
- `CESTUS_WORKSPACE_ID`

CLI support:

- `local:runtime:configure -- --storage portable-workspace --workspace <root> --workspace-id <id>`
- `local:workspace:create -- --workspace <root> --label <label>` with generated ID when omitted

Portable runtime startup passes `expectedWorkspaceId` into `mountPortableWorkspace`. It fails closed if the mounted manifest ID differs.

### Workspace Ops Binding

`packages/workspace-ops` stops using the provisional layout contract for real operator commands. It binds to the canonical layout:

```text
cestus-workspace.json
ledger/ontology.sqlite
blobs/
derivatives/
jobs/
projections/
cache/
config/
```

The JSON layout contract version becomes `portable-workspace-layout.v1`.

`diagnostics` and `backup` remain command concepts, not required canonical directories. Durable diagnostics come from `diagnostic.recorded` ledger events. Backup checks read an explicit backup/export manifest path when provided.

### Executable CLI

The workspace ops executable becomes a real Node/TSX CLI facade over package operations. It supports:

- `detect drive --root <root> [--workspace-id <id>]`
- `verify workspace --root <root> [--workspace-id <id>]`
- `disk usage --root <root>`
- `diagnostics inspect --root <root> [--workspace-id <id>]`
- `manifest export --root <root> [--workspace-id <id>]`
- `backup check --root <root> --manifest <path> [--workspace-id <id>]`
- existing projection rebuild readiness and rebuild commands for expendable projections

JSON remains the durable output contract. Exit codes remain:

- `0`: ready
- `2`: degraded
- `3`: blocked
- `1`: invocation or operation failure before an envelope

## Safety And Failure Handling

- Missing roots are inspected read-only and never created by detect or verify.
- A valid workspace at the wrong root returns `wrong-drive` without leaking the unexpected workspace ID.
- A manifest with secret-shaped keys is rejected.
- A local config file can store expected workspace ID and root, but not auth material for the portable workspace.
- Runtime startup never creates or uses repo-local storage while portable mode is selected.
- A just-created workspace with no SQLite file is acceptable until open; verify reports it as an empty uninitialized canonical ledger path.
- A corrupt or unreadable existing ledger blocks verification and runtime opening.
- Projection rebuilds remain limited to expendable projection artifacts.
- Canonical repair actions remain inert proposals that require future human-approved append-only repair events.

## Testing Requirements

Implementation should add tests for:

- Generated workspace IDs from `local:workspace:create`.
- Explicit workspace IDs still accepted for deterministic workflows.
- `local:runtime:configure` records expected workspace ID and redacts secret material.
- `CESTUS_WORKSPACE_ID` overrides config-file expected identity.
- Runtime portable startup fails closed on expected ID mismatch.
- Workspace ops layout reads the canonical manifest shape and canonical paths.
- Workspace ops missing-drive detection creates no directories or files.
- Workspace ops wrong-drive detection redacts the unexpected ID.
- Workspace ops executable returns real JSON envelopes for detect, verify, disk usage, diagnostics, manifest export, and backup check.
- A newly created but unopened workspace verifies without internal fallback.
- An existing unreadable or invalid ledger blocks instead of being repaired.
- Browser UI boundary tests continue to reject Node-only workspace/runtime imports.
- `npm run verify` passes.

## Acceptance Criteria

- A solo operator can create, configure, detect, verify, open, and diagnose an external-drive workspace from documented CLI/runtime commands.
- The only canonical ontology ledger used in portable mode is `<workspace-root>/ledger/ontology.sqlite`.
- Missing, unmounted, unreadable, and swapped-drive states are distinguishable through stable secret-safe JSON.
- Workspace ops no longer relies on a provisional layout adapter for real commands.
- The executable no longer returns `WORKSPACE_OPS_RUNTIME_WIRING_REQUIRED` for supported operator commands.
- Local expected workspace identity prevents accidental attachment to the wrong valid workspace.
- No large ontology data is written to internal disk by portable create, detect, verify, open, or diagnose flows.
- Factory verification passes after implementation.

## Approval Request

This spec should be reviewed before implementation. Approval authorizes only the CLI/runtime attachment flow described here. UI panels, backup copy/restore, migration from repo-local SQLite, encryption, and team-server behavior remain outside this slice.
