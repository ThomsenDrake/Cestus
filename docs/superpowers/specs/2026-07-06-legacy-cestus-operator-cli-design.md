# Legacy Cestus Operator CLI Design

Date: 2026-07-06

## Determination

The existing legacy import design authorizes a command-line boundary for old-Cestus migration, including inspect, report JSON, raw import approval, raw import execution, staging preview, staging approval, and quarantine review. The existing legacy implementation plan does not authorize a complete operator workflow. It only covers backend/domain legacy services and pure DTO-style CLI handlers for the first artifact ask and report JSON.

This focused design fills that gap. It does not replace the legacy import design. It narrows the missing operator-ready command-line slice so implementation can proceed only after approval.

## Purpose

Old Cestus workspaces are messy file bundles. Operators need a safe terminal workflow that lets them inspect a legacy root, review a deterministic migration report, explicitly approve raw evidence import, execute that import into a portable workspace, review eligible legacy assertion candidates, approve a selected candidate set, and stage only evidence-tied legacy claims as `assertion.proposed`.

The workflow must be JSON-first and stable enough for generic coding agents, shell scripts, and future UI or HTTP adapters to consume without scraping prose.

## Goals

- Add a user-facing `cestus ingest legacy ...` CLI workflow.
- Resolve the portable workspace through the existing mount contract and reject missing or invalid mounts without fallback storage.
- Keep the old-Cestus source root read-only.
- Produce a deterministic migration report before any raw import.
- Store migration report artifacts in the portable workspace derivative store and reference them from append-only ledger events.
- Require explicit human raw import approval before copying legacy bytes into the workspace blob store.
- Execute raw import through the existing ingestion runtime path so stale source verification runs before blob writes.
- Preview ontology staging candidates from the reviewed report and imported evidence links.
- Require explicit human ontology staging approval before appending any assertion proposals.
- Stage only approved, evidence-tied legacy candidates as `assertion.proposed`.
- Return stable JSON envelopes for every success and failure.

## Non-Goals

- Accepting legacy assertions, entities, relationships, resolutions, merges, splits, domain packs, exports, or legal escalation automatically.
- Building UI or local HTTP routes for legacy import.
- Adding provider parsing, external services, crawling, or credential-backed workflows.
- Inferring ontology semantics from vague legacy field names.
- Writing metadata into or reorganizing the old-Cestus source tree.
- Implementing user-specific old-Cestus schema plugins without representative user samples.
- Changing append-only ledger, provenance, projection rebuildability, or portable workspace contracts.

## CLI Shape

The operator-facing command group is `cestus ingest legacy`.

Supported commands:

| Command | Purpose | Writes |
| --- | --- | --- |
| `legacy artifact-ask` | Print the first artifact ask as JSON. | None |
| `legacy inspect` | Register or verify the source, scan the old root, run conservative legacy detection/parsing, build and store a migration report. | Scan, occurrence, report events and report artifact |
| `legacy report` | Print the latest or selected migration report review JSON. | None |
| `legacy quarantine` | Print quarantine entries from the selected migration report. | None |
| `legacy approve-import` | Record human raw import approval for a completed legacy scan. | `ingestion.import.approved` only |
| `legacy import` | Execute approved raw evidence import after stale-source verification. | Evidence, link, import completion, diagnostics when needed |
| `legacy staging-preview` | Print evidence-tied staging candidates and quarantine reasons. | None |
| `legacy approve-staging` | Record human approval for selected assertion candidates. | `legacy.ontology.staging.approved` only |
| `legacy stage` | Append approved evidence-tied candidates as assertion proposals. | `assertion.proposed` only |

All workspace-aware commands accept `--workspace <root>` or `CESTUS_WORKSPACE_ROOT`. They must call the mount layer before constructing runtime services. The CLI must not silently use repo-local storage.

## Required Options

`legacy inspect`:

```text
--workspace <portable-workspace-root>
--source <old-cestus-root>
--source-id <src_...>
--scan <scan_...>
--label <human label>
```

`legacy approve-import`:

```text
--workspace <portable-workspace-root>
--source-id <src_...>
--scan <scan_...>
--import <imp_...>
--approved-by <actor id>
```

`legacy import`:

```text
--workspace <portable-workspace-root>
--source-id <src_...>
--scan <scan_...>
--import <imp_...>
```

`legacy approve-staging`:

```text
--workspace <portable-workspace-root>
--source-id <src_...>
--scan <scan_...>
--report <legacy_report_...>
--staging <legacy_stage_...>
--approved-by <actor id>
--candidate <legacy_candidate_...> repeatable
```

`legacy stage`:

```text
--workspace <portable-workspace-root>
--source-id <src_...>
--scan <scan_...>
--report <legacy_report_...>
--staging <legacy_stage_...>
```

Report and preview commands may omit `--report` to use the latest report for the source collection.

## Stable JSON Contract

Every command returns a JSON object followed by a single newline.

Success envelope:

```json
{
  "ok": true,
  "command": "legacy inspect",
  "workspace": {
    "workspaceId": "ws_portable_001",
    "label": "Portable Cestus"
  },
  "sourceCollectionId": "src_old_cestus",
  "scanBatchId": "scan_old_cestus_001",
  "legacyReportId": "legacy_report_...",
  "reportHash": "sha256:...",
  "candidateSetHash": "sha256:...",
  "totals": {
    "inspectedFiles": 0,
    "candidateMetadataFiles": 0,
    "proposedAssertionCandidates": 0,
    "quarantineEntries": 0,
    "unresolvedReferences": 0
  },
  "eventIds": ["evt_..."],
  "nextActions": ["review legacy report", "approve raw import"]
}
```

Failure envelope:

```json
{
  "ok": false,
  "error": {
    "code": "LEGACY_IMPORT_REPORT_REQUIRED",
    "command": "legacy staging-preview",
    "message": "A migration report is required before ontology staging preview.",
    "allowedRepairActions": ["run legacy inspect", "review legacy report"],
    "diagnostics": []
  }
}
```

Diagnostics must be secret-safe and must not include credentials, tokens, passwords, raw document bodies, raw extracted text, private keys, or unsafe absolute paths beyond mount-approved local display.

## Runtime Architecture

`LegacyImportRuntime` is the workflow boundary for the operator CLI. It composes existing services instead of duplicating their semantics:

- `IngestionSourceRegistry` for source registration.
- `LegacyCestusInspector` for read-only inspection and detector execution.
- A conservative legacy observation parser for explicit `legacyCestusType: "claims"` JSON metadata.
- `LegacyMigrationReportService` for deterministic report storage and report events.
- `createIngestionRuntime` for raw import approval and import execution, including stale-source verification.
- `buildIngestionProjection` to map imported content hashes to evidence IDs.
- `buildLegacyImportProjection` and `buildLegacyMigrationReviewDto` for report and staging review state.
- `LegacyOntologyStagingService` for human staging approval and `assertion.proposed` creation.

The CLI executable wires a real portable workspace resolver. It uses `mountPortableWorkspace` to validate the workspace root, `SQLiteEventLedger` for `ledger/ontology.sqlite`, `FileBlobStore` for `blobs` and `derivatives`, and the workspace job/cache paths from the portable workspace package. If the mount fails, no runtime service is constructed.

The existing pure handler `handleIngestionCommand` remains testable with injected dependencies. The executable supplies default dependencies for real command-line use.

## Conservative Candidate Parsing

This slice may parse only explicit legacy JSON metadata with `legacyCestusType: "claims"` and `claims` array records that contain a stable legacy claim ID, predicate, object, and optional subject reference. Unsupported or malformed records become quarantine entries. The parser must not infer semantics from generic fields such as `agency`, `person`, or `relationship` unless the approved legacy marker and exact claim shape are present.

The proposed assertion candidate evidence basis is the metadata file that contains the legacy claim. If a claim references another raw file, that reference may appear in the report, but the candidate still requires an imported evidence ID for the metadata file before staging.

## Workflow Semantics

1. `legacy artifact-ask` tells the operator what sample artifacts to provide or inspect first.
2. `legacy inspect` validates the mounted portable workspace, registers the old root as a read-only source, scans and hashes files, runs conservative detection/parsing, stores a deterministic migration report, and returns report hashes and next actions.
3. `legacy report` and `legacy quarantine` let the operator review the report before import.
4. `legacy approve-import` appends approval only.
5. `legacy import` re-reads current source bytes through the ingestion runtime and aborts before blob writes if source files, container hashes, or archive children changed since approval.
6. `legacy staging-preview` loads the reviewed report and imported evidence links, then returns only candidates whose report content hash can be resolved to imported evidence.
7. `legacy approve-staging` appends human approval for selected candidate IDs only.
8. `legacy stage` verifies the approved candidate set hash, verifies evidence IDs and hashes, and appends only `assertion.proposed`.

## Invariants

- The old-Cestus source tree is never mutated.
- Inspection and reports do not create evidence or assertions.
- Raw import approval does not copy bytes.
- Raw import execution does not stage ontology assertions.
- Staging approval does not create assertions.
- Staging execution creates only `assertion.proposed`.
- Accepted assertions, entity resolutions, relationship acceptance, candidate resolution events, legal escalation, and export/publication events are forbidden.
- Projections and CLI DTOs are rebuildable from ledger events and report artifacts.
- Report identity and candidate set identity are content-addressed.
- Human approval gates record actor, timestamp, source collection, scan batch, report hash, and candidate set hash.

## Testing Requirements

Tests must cover:

- CLI command normalization for `cestus ingest legacy ...`.
- Portable workspace mount failure returning stable JSON and constructing no runtime.
- `legacy inspect` producing a report event and derivative artifact without evidence, assertion, accepted entity, or accepted relationship events.
- Report and quarantine commands returning deterministic JSON.
- Raw import approval appending approval only.
- Raw import execution using the shared ingestion runtime stale-source gate.
- Staging preview excluding candidates whose evidence content hash is not imported.
- Staging approval requiring a human actor and selected candidate IDs.
- Staging execution appending only `assertion.proposed`.
- Stable JSON failure codes and repair actions.
- Executable help listing the legacy workflow.
- `npm run verify` passing after each implementation task.

## Stop Conditions

Stop and escalate on source-tree mutation risk, data-loss risk, schema conflict, missing portable workspace mount support, unavailable SQLite or blob-store dependency, credential need, live external service dependency, secret-unsafe diagnostics, user-specific parser need without samples, or repeated verifier failure.

## Approval Record

This focused design is proposed for approval. Implementation should not begin until the design and matching implementation plan are approved.
