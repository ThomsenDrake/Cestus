# Ingestion Runtime Wiring Design

Date: 2026-07-06

## Purpose

This design covers the runtime wiring that turns the existing ingestion domain package into live local API, CLI, and UI workflows.

The current ingestion package already defines source registration, local filesystem dry-run scans, archive expansion, raw import approval, evidence import, projections, read DTOs, local parse jobs, provider approval gates, and pure CLI command contracts. The product gap is runtime orchestration: operational CLI commands still report that runtime wiring is required, the local HTTP host is PRR-only, and the app renders ingestion through deterministic placeholder state.

This slice adds one shared `IngestionRuntime` orchestration boundary and connects it to the existing local runtime host, CLI, and browser UI adapter. Portable workspace resolution remains outside ingestion. Ingestion consumes a mounted workspace contract supplied by the portable workspace layer.

## Goals

- Add a single `IngestionRuntime` that owns ingestion workflow semantics.
- Consume an injected `MountedWorkspace` or `WorkspaceStorageAdapter` instead of resolving storage paths inside ingestion.
- Wire CLI commands such as `cestus ingest dry-run --workspace /Volumes/Cestus --source /Volumes/OldArchive` through the mount contract and shared runtime.
- Add local HTTP ingestion routes as transport-only wrappers over `IngestionRuntime`.
- Replace UI placeholder ingestion state with a browser-safe HTTP adapter and live DTOs.
- Preserve explicit human approval gates for raw import and provider parsing.
- Verify current source bytes, container hashes, and archive child hashes against the approved dry-run inventory before any raw blob writes.
- Keep provider approval separate from provider byte transfer.
- Return stable JSON DTOs and error codes that generic coding agents and scripts can consume.
- Preserve append-only ledger semantics, provenance, projection rebuildability, secret-safe diagnostics, and AI-legible contracts.

## Non-Goals

- Defining the portable workspace mount implementation, manifest layout, or storage resolution vocabulary.
- Hardcoding repo-local storage for ingestion.
- Defining old-Cestus legacy mapping semantics.
- Adding accepted ontology assertions from parse output.
- Performing live provider parsing in standard verification.
- Adding autonomous public portal crawling, scraping, publication, PRR sending, or legal escalation.
- Adding team permissions or multi-user worker coordination.
- Letting browser code import Node-only runtime, filesystem, SQLite, blob store, or mount code.

## Approved Direction

Use the existing shared local runtime host and add ingestion as a sibling to PRR runtime support. The local host provides HTTP serving, auth policy, safe health diagnostics, and static UI serving. Ingestion provides a runtime boundary with workflow semantics. CLI and HTTP call the same runtime methods. The UI talks only to an HTTP adapter.

The mount layer is canonical for portable workspace resolution. Ingestion may accept CLI ergonomics such as `--workspace <root>` or `CESTUS_WORKSPACE_ROOT`, but those values are forwarded to the mount package or mount contract. Ingestion does not invent its own storage strategy names, manifest validation, repo-local fallback, or app-data fallback.

## Workspace Dependency

The runtime consumes a resolved workspace contract shaped like this:

```ts
export interface MountedWorkspace {
  readonly workspaceId: string;
  readonly label: string;
  readonly ledger: EventLedger;
  readonly blobStore: FileBlobStore;
  readonly derivativeStore: FileBlobStore;
  readonly jobStateRoot: string;
  readonly diagnosticsRoot?: string;
  readonly projectionCacheRoot?: string;
  readonly capabilities: {
    readonly canReadLedger: boolean;
    readonly canAppendLedger: boolean;
    readonly canWriteBlobs: boolean;
    readonly canWriteDerivatives: boolean;
    readonly canWriteJobState: boolean;
  };
}
```

The exact mount-layer type may vary when that session lands, but the ingestion runtime contract needs the same logical capabilities:

- canonical ontology ledger handle or path resolved by mount
- blob store root or handle resolved by mount
- derivative store root or handle resolved by mount
- job state root resolved by mount
- diagnostics and projection cache roots when mount exposes them
- safe workspace identity and capability metadata

If the mount layer reports the workspace is absent, invalid, or not writable for the requested operation, ingestion returns a structured diagnostic and performs no ingestion writes.

## Ingestion Runtime Boundary

`IngestionRuntime` is the source of workflow semantics. It composes existing ingestion services and exposes one stable API for CLI, HTTP, UI, and later legacy import work.

```ts
export interface IngestionRuntime {
  registerSource(input: RegisterSourceInput): Promise<IngestionRuntimeResult<IngestionReviewDto>>;
  dryRunScan(input: DryRunScanInput): Promise<IngestionRuntimeResult<IngestionScanResultDto>>;
  approveRawImport(input: ApproveRawImportInput): Promise<IngestionRuntimeResult<IngestionReviewDto>>;
  importApproved(input: ImportApprovedInput): Promise<IngestionRuntimeResult<IngestionImportResultDto>>;
  listJobs(input: ListIngestionJobsInput): Promise<IngestionRuntimeResult<IngestionJobListDto>>;
  retryJob(input: RetryIngestionJobInput): Promise<IngestionRuntimeResult<IngestionJobResultDto>>;
  approveProviderParsing(input: ApproveProviderParsingInput): Promise<IngestionRuntimeResult<IngestionReviewDto>>;
  diagnostics(input: IngestionDiagnosticsInput): Promise<IngestionRuntimeResult<IngestionDiagnosticsDto>>;
}
```

Runtime construction:

```ts
createIngestionRuntime({
  mountedWorkspace,
  actor,
  acquisitionAdapters,
  providerRegistry
})
```

The runtime composes:

- `IngestionSourceRegistry`
- `LocalFilesystemScanner`
- `IngestionImportService`
- `LocalParseService`
- `ProviderParseApprovalService`
- `buildIngestionProjection`
- `buildIngestionReviewDto`

The runtime enforces:

- Source registration must exist before scans and imports.
- Dry-run must complete before raw import approval.
- Raw import approval records approval only.
- Import execution must verify the approved dry-run inventory against current source bytes before raw blob writes.
- Provider approval records approval only.
- Provider byte transfer happens only in an explicitly approved provider job or retry path.
- Projections are rebuilt from ledger events and never become hidden sources of truth.
- Job files and projection caches are support state only and must be rebuildable or derivable from ledger state.

## Stale Source Verification

Import execution has a hard safety gate. Before writing raw blobs or evidence events, the runtime must re-read the current source through the registered acquisition adapter and compare it with the approved scan.

For regular files, the runtime verifies:

- source occurrence identity
- source path
- observed content hash
- observed size when available
- adapter identity and version when relevant

For archive children, the runtime verifies:

- container path
- container hash
- archive adapter identity and version
- internal path
- child content hash
- child size when available

If any current source bytes, container hashes, or archive child hashes differ from the approved dry-run inventory, the runtime returns `INGESTION_SOURCE_CHANGED_SINCE_APPROVAL` or `INGESTION_ARCHIVE_CHILD_HASH_MISMATCH`, records diagnostics, and performs no raw blob writes for the unsafe import batch. Retrying import repeats verification.

This protects portable workspace import, old-Cestus legacy ingestion, and PRR-related evidence import from stale or swapped source drives.

## CLI Boundary

The CLI should feel like a native ingestion tool while still delegating storage resolution to the mount contract.

Example commands:

```bash
cestus ingest register-source --workspace /Volumes/Cestus --source /Volumes/OldArchive --source-id src_old_archive --label "Old archive"
cestus ingest dry-run --workspace /Volumes/Cestus --source-id src_old_archive
cestus ingest approve-import --workspace /Volumes/Cestus --source-id src_old_archive --scan scan_20260706_001
cestus ingest import --workspace /Volumes/Cestus --source-id src_old_archive --import imp_20260706_001
cestus ingest jobs --workspace /Volumes/Cestus
cestus ingest retry --workspace /Volumes/Cestus --job parse_20260706_001
cestus ingest approve-provider --workspace /Volumes/Cestus --import imp_20260706_001 --provider mistral-document-ai
cestus ingest diagnostics --workspace /Volumes/Cestus
```

Operational commands first call the mount layer with `--workspace` or `CESTUS_WORKSPACE_ROOT`. After mount returns a resolved workspace, the CLI constructs or receives `IngestionRuntime` and calls runtime methods.

CLI output is JSON-first. Human-friendly summaries may exist, but `--json` and non-success responses must be stable enough for AI agents and scripts. Operational errors use stable codes and repair actions. The CLI must not silently fall back to repo-local storage when the workspace root is missing or invalid.

Retry semantics:

- Scan retry creates a new scan batch.
- Import retry resumes only after stale-source verification passes.
- Local parse retry appends new parse job events or retry events according to runtime rules.
- Provider retry still requires provider approval.

## HTTP Boundary

The existing local runtime host adds ingestion routes beside PRR routes. HTTP is transport-only: parse JSON, authorize, ask the mount layer for configured mounted workspace state, call `IngestionRuntime`, and return stable JSON.

Route set:

```text
GET  /api/ingestion/workspace
GET  /api/ingestion/sources
POST /api/ingestion/sources
POST /api/ingestion/scans/dry-run
POST /api/ingestion/imports/approve
POST /api/ingestion/imports/run
GET  /api/ingestion/jobs
POST /api/ingestion/jobs/retry
POST /api/ingestion/provider-parsing/approve
GET  /api/ingestion/diagnostics
```

`GET /api/ingestion/workspace` returns safe mount status, workspace ID and label when mounted, capability flags, and diagnostics. It does not expose secrets. Absolute paths are returned only when the mount contract marks them safe for local display.

Mutation routes preserve the local runtime auth policy. Request bodies must not accept arbitrary storage paths. Workspace resolution comes from configured or mounted workspace state, not from ad hoc HTTP body fields.

Successful mutation responses should include updated DTOs when useful:

```json
{
  "ok": true,
  "review": {
    "sourceCollectionId": "src_old_archive"
  },
  "events": ["evt_..."]
}
```

Failure responses use stable codes:

```json
{
  "ok": false,
  "error": {
    "code": "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL",
    "message": "Approved dry-run inventory no longer matches current source bytes.",
    "diagnostics": []
  }
}
```

Provider approval routes append approval only. They must not invoke provider parsing or send bytes externally.

## UI Adapter Boundary

The browser UI uses an `IngestionWorkspaceAdapter` parallel to the Requests adapter pattern. It lives in UI code, imports DTOs and types only, and communicates with `/api/ingestion/*` using `fetch`.

```ts
export interface IngestionWorkspaceAdapter {
  loadWorkspace(): Promise<IngestionWorkspaceDto>;
  registerSource(input: RegisterSourceInput): Promise<IngestionActionResult>;
  dryRunScan(input: DryRunScanInput): Promise<IngestionActionResult>;
  approveRawImport(input: ApproveRawImportInput): Promise<IngestionActionResult>;
  importApproved(input: ImportApprovedInput): Promise<IngestionActionResult>;
  listJobs(input: ListIngestionJobsInput): Promise<IngestionJobListDto>;
  retryJob(input: RetryIngestionJobInput): Promise<IngestionActionResult>;
  approveProviderParsing(input: ApproveProviderParsingInput): Promise<IngestionActionResult>;
  loadDiagnostics(input: IngestionDiagnosticsInput): Promise<IngestionDiagnosticsDto>;
}
```

The UI adapter must not import:

- ingestion runtime or ingestion services
- local-runtime modules
- `node:*`
- SQLite ledgers
- filesystem APIs
- blob stores
- mount or storage code

`App.tsx` should default to an HTTP ingestion adapter and allow static or fake adapters in tests. `IngestionWorkspace` should render:

- mounted or not-mounted workspace state
- source collection registration state
- latest dry-run review
- duplicate and storage estimates
- raw import approval gate
- stale-source diagnostics
- import progress or completion state
- local parse jobs
- provider approval gate
- retryable failures
- diagnostics

UI actions keep approvals explicit:

- Raw import approval calls approval only.
- Import execution calls the import route that performs stale-source verification.
- Provider approval calls approval only.
- Retry calls the job retry route for a specific retryable job.

The UI may show workspace-not-mounted diagnostics and repair actions, but ingestion request bodies must not accept arbitrary workspace paths. Workspace selection or mounting belongs to the mount/onboarding layer.

## Diagnostics And Error Handling

Errors should become inspectable state rather than log-only output. Runtime, CLI, and HTTP responses should use stable error codes, messages safe for display, and repair actions.

Required codes:

```text
INGESTION_WORKSPACE_NOT_MOUNTED
INGESTION_WORKSPACE_NOT_WRITABLE
INGESTION_SOURCE_NOT_REGISTERED
INGESTION_SCAN_REQUIRED
INGESTION_IMPORT_APPROVAL_REQUIRED
INGESTION_SOURCE_CHANGED_SINCE_APPROVAL
INGESTION_ARCHIVE_CHILD_HASH_MISMATCH
INGESTION_PROVIDER_APPROVAL_REQUIRED
INGESTION_PROVIDER_SEND_NOT_PERMITTED
INGESTION_JOB_NOT_RETRYABLE
INGESTION_RUNTIME_INTERNAL
```

Diagnostics must not include:

- provider credentials
- auth tokens
- OAuth material
- passwords
- raw document bodies
- raw extracted text
- private keys
- full absolute paths unless the mount or source adapter marks them safe

Missing external drives, invalid mounted workspaces, unreadable source paths, unsafe archive entries, stale source bytes, provider approval gaps, and retry denials should return structured diagnostics and avoid hidden side effects.

## Data Flow

### Register Source

1. CLI or HTTP asks the mount layer for a mounted workspace.
2. Runtime calls `IngestionSourceRegistry.registerLocalSource`.
3. Ledger appends `ingestion.source.registered`.
4. Runtime rebuilds projection and returns review DTO.

### Dry-Run Scan

1. Runtime verifies the source is registered.
2. Runtime calls the configured acquisition adapter.
3. Adapter hashes readable files and safe archive children.
4. Ledger records scan and occurrence events.
5. Runtime returns scan result and review DTO.

### Approve Raw Import

1. Runtime verifies the scan completed.
2. Runtime appends `ingestion.import.approved`.
3. Runtime returns updated review DTO.
4. No blobs are written and no evidence is created.

### Import Approved Content

1. Runtime verifies import approval exists.
2. Runtime re-reads current source bytes through the acquisition adapter.
3. Runtime compares current file hashes, container hashes, and archive child hashes with the approved dry-run inventory.
4. If verification fails, runtime records diagnostics and returns an error.
5. If verification passes, runtime copies unique content into the mounted blob store, appends evidence events, links occurrences, records import completion, and enqueues local parse jobs.

### Approve Provider Parsing

1. Runtime verifies target import or job state.
2. Runtime appends `ingestion.provider.approved`.
3. Runtime returns updated review DTO.
4. No bytes leave the machine.

### Retry Jobs

1. Runtime verifies the job exists and is retryable.
2. Runtime applies job-type-specific retry semantics.
3. Runtime returns updated job and review DTOs.

## Testing Requirements

Implementation planning must include boundary and behavior tests for:

- `IngestionRuntime` with fake `MountedWorkspace`.
- Missing workspace returns `INGESTION_WORKSPACE_NOT_MOUNTED` and writes nothing.
- Non-writable workspace returns `INGESTION_WORKSPACE_NOT_WRITABLE` and writes nothing.
- Source registration, dry-run scan, approval-only raw import, import execution, job listing, retry, provider approval, and diagnostics.
- Raw import approval appends approval only and does not write blobs.
- Import execution rejects changed regular files before blob writes.
- Import execution rejects missing source files before blob writes.
- Import execution rejects changed container hashes before blob writes.
- Import execution rejects changed archive child hashes before blob writes.
- Import retry repeats stale-source verification.
- Duplicate content import remains idempotent.
- Provider approval appends approval only and does not call provider parse.
- Provider parsing or retry requires prior provider approval.
- CLI `cestus ingest ... --workspace <root>` delegates workspace resolution to the mount contract.
- CLI JSON output is stable for success and failure cases.
- HTTP routes call runtime methods and do not encode workflow semantics.
- HTTP request bodies do not accept arbitrary storage paths.
- HTTP auth policy remains intact for ingestion mutation routes.
- UI adapter maps stable JSON success and failure DTOs.
- UI renders workspace-not-mounted and diagnostics states.
- UI actions keep raw import approval, import execution, and provider approval separate.
- Browser boundary tests prove ingestion UI code imports DTOs and types only and does not import `node:*`, local-runtime modules, ingestion services, SQLite, filesystem APIs, blob stores, or mount/storage modules.
- `npm run verify` passes after every implementation task.

## Risks

- The runtime can accidentally duplicate semantics already present in domain services. The design avoids this by making the runtime sequence services rather than rewriting their internal validation.
- Import verification can become expensive for large source drives. Correctness wins in this slice; later worker optimization must preserve the same verification contract.
- HTTP could become a hidden storage resolver if request bodies accept paths. The route contract forbids arbitrary storage paths and delegates workspace state to mount.
- UI tests could accidentally rely on static adapters. App-level tests should cover the HTTP adapter shape while boundary tests protect browser-safe imports.
- Provider approval could be confused with provider execution. The API, UI copy, tests, and runtime must keep approval and byte transfer separate.

## Invariants

- Ingestion workflow semantics live in `IngestionRuntime`.
- Portable workspace resolution belongs to the mount layer.
- CLI, HTTP, and UI share stable runtime DTOs.
- HTTP is transport-only.
- Browser ingestion code remains browser-safe.
- Raw import approval records approval only.
- Import execution verifies current source bytes, container hashes, and archive child hashes before blob writes.
- Provider approval records approval only and sends no bytes externally.
- Projections are rebuildable from append-only ledger events.
- Diagnostics are structured, inspectable, and secret-safe.
- Stable JSON output remains consumable by generic coding agents and scripts.

## Approval Record

The approved choices are:

- Use the shared local runtime host.
- Add one `IngestionRuntime` orchestration boundary.
- Consume an injected `MountedWorkspace` or `WorkspaceStorageAdapter`.
- Keep CLI ergonomics as `cestus ingest ... --workspace <root>` while delegating resolution to mount.
- Keep HTTP route bodies free of arbitrary storage paths.
- Use a browser-safe UI adapter that imports DTOs and types only.
- Require stale-source verification before raw blob writes.
- Keep raw import approval and provider approval as approval-only actions.
- Require boundary tests that prevent Node-only ingestion, runtime, and storage modules from entering browser code.
