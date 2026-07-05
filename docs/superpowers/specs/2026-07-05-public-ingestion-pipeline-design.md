# Public Ingestion Pipeline Design

Date: 2026-07-05

## Purpose

This design covers the next independent Cestus development slice: a local-first ingestion pipeline for public datasets, documents, records productions, and other public-source material.

The first real use case is a messy external drive containing existing investigation artifacts from an older tool with rudimentary ontology support. Cestus should treat that drive as a read-only source, create a portable self-contained Cestus workspace on the external drive, ingest the material as raw evidence, normalize it, preserve provenance, and prepare future agents to propose investigations and ontology assertions from a unified evidence corpus.

The design must work first on a single investigator laptop, while preserving a direct path to a small newsroom or nonprofit team with shared workers and larger collections.

## Goals

- Ingest a messy local artifact drive as one unified shared evidence corpus.
- Keep the source drive read-only and create a Cestus-managed portable workspace on the external drive.
- Run a dry-run inventory before copying/importing raw evidence.
- Compute content hashes during dry-run so duplicates, storage growth, and refresh changes are visible before import.
- Preserve every source occurrence, including folder paths and archive-internal paths, without treating folders as investigation boundaries.
- Deduplicate by content hash so one canonical evidence item can have multiple source occurrences.
- Preserve changed-path history by creating a new evidence item when the same path later points to different bytes.
- Expand supported containers and ingest extracted child files as evidence with container provenance.
- Store raw evidence blobs in content-addressed storage and append strict provenance events.
- Start local normalization/parsing automatically after raw import approval.
- Support optional external document-AI parsing with Mistral Document AI as the recommended first provider, without making any provider mandatory.
- Require a batch/job-level human approval before any document bytes leave the machine for provider parsing.
- Expose both CLI and main-app UI workflows.
- Keep ingestion contracts durable and legible to generic AI coding agents.

## Non-Goals

- Mutating, reorganizing, deleting, or writing metadata into the source drive.
- Trusting the previous tool's ontology metadata as Cestus ontology structure.
- Creating accepted ontology facts from parsing output without the existing evidence-backed assertion proposal and review flow.
- Suggesting investigations in the first implementation slice.
- Live credentialed scraping or autonomous public portal crawling.
- Autonomous publication, legal action, public records sending, or legal escalation.
- Multi-tenant team administration.
- A required cloud parsing provider for standard local verification.
- Content-sensitivity screening as a provider eligibility gate in the first slice.

## Approved Direction

The approved approach is a local-first evented ingestion package with workspace-scoped storage.

Implementation should add a new `packages/ingestion` domain package that composes the ontology package rather than replacing it. The ingestion package owns source collections, scans, import approvals, refresh batches, occurrence tracking, deduplication, archive expansion, normalization and parse jobs, provider approval gates, retries, diagnostics, CLI contracts, projections, and UI-facing DTOs.

The package should define a small acquisition adapter seam from day one. The first adapter is a read-only local filesystem adapter with safe archive expansion. Future public portals, watched folders, bulk downloads, and API connectors should emit the same scan and import contracts.

## Relationship To The Ontology Layer

The ontology layer remains the durable knowledge foundation:

- append-only in-memory and SQLite event ledgers
- strict Zod event validation
- content-addressed blob storage
- evidence ingestion
- evidence-backed assertion proposals
- accepted-only graph projection
- structured diagnostics
- domain pack governance

The ingestion slice must not weaken those invariants.

Raw imported artifacts become ontology evidence through `evidence.ingested` events and the existing blob store. Ingestion-specific lineage should live in ingestion events and ingestion projections rather than overloading the current evidence payload. This keeps generic evidence small while still preserving detailed source occurrences, refresh history, job approvals, archive lineage, and parse state.

Parsing and normalization outputs are derivative artifacts. They may become content-addressed derivative blobs and may enqueue future extraction work, but they are not accepted ontology facts. Any future ontology assertion still needs evidence provenance and review through the existing assertion services.

## Portable Workspace

The first workflow creates or selects a self-contained portable Cestus workspace on the external drive. That workspace should contain:

- SQLite event ledger
- content-addressed blob store
- ingestion manifests and job state
- projection state that can be rebuilt from ledger events
- parse output blobs and metadata
- diagnostics and retry state
- workspace configuration that contains no secrets

The messy source artifact root remains a read-only source collection. Cestus records source paths, container paths, file metadata, hashes, and observations, but never writes back to the source tree.

The first implementation should support multiple named source collections at the contract level, while creating exactly one source collection for this external-drive corpus.

## Source Collections And Refreshes

A source collection is a stable logical source such as "external investigation archive". It has:

- stable source collection ID
- human label
- read-only local root path or source locator
- workspace-relative source registration metadata
- source fingerprint when available
- registration actor and timestamp
- acquisition adapter name and version

Rerunning dry-run/import on the same drive is a refresh of the same source collection, not a separate source. Each refresh is a new scan/import batch. Refreshes record added, changed, missing, duplicate, unsupported, unreadable, and oversized observations as append-only events. Missing files are observations only. They do not delete evidence or previous source history.

Path identity and content identity are separate. If the same path points to new bytes on a later refresh, the new bytes become a new canonical evidence item, and the old occurrence history remains intact.

## Dry-Run Inventory

Dry-run is mandatory before raw import.

The dry-run scan should:

- walk the read-only source tree
- expand supported containers safely
- compute SHA-256 hashes for every technically readable file or archive child
- detect duplicate content across paths
- estimate blob store growth for new unique content
- infer likely media types
- record file size and available source timestamps
- identify unreadable, unsupported, oversized, and unsafe-path items
- detect archive expansion failures and traversal attempts
- produce a stable inventory manifest hash
- produce CLI JSON and UI DTO summaries

The dry-run does not copy source bytes into the Cestus blob store and does not create evidence items. It records scan and occurrence observations so the review screen and CLI can show what import would do.

The UI and CLI must show enough information for a human to approve or reject the raw import batch: counts, bytes, new unique content, duplicate occurrences, skipped items, archive findings, diagnostics, and refresh comparison.

## Import Approval And Raw Evidence Import

Raw import requires a human approval gate after dry-run.

Once approved, import should:

- copy each new unique content hash into the portable workspace blob store
- create one canonical ontology evidence item per unique content hash
- append occurrence/linkage events for every source path and archive-internal occurrence
- avoid duplicate evidence when the same content hash already exists in the source collection or workspace
- record import completion counts and diagnostics
- enqueue local parse jobs for imported or newly linked evidence

The import job must be idempotent. Retrying a partially completed import should not create duplicate evidence for the same content hash or duplicate occurrence records for the same batch/path/hash tuple.

## Deduplication And Occurrences

Deduplication is content-first.

One canonical evidence item exists per unique content hash. Duplicate files across directories, duplicate archive children, and duplicate refresh observations attach multiple source occurrences to the canonical evidence item.

An occurrence should record:

- source collection ID
- scan batch ID
- source path for normal files
- container path and container hash for archive children
- internal path for archive children
- observed content hash
- observed size
- observed source mtime when available
- acquisition adapter name and version
- observation status

This lets later agents understand both the canonical artifact and the messy human context in which that artifact appeared.

## Archive And Container Handling

Supported containers should be expanded in the first slice. Examples include zip and tar-style archives, with other container formats added through explicit parser/adapter support.

Containers are transport, not evidence, in this design. Cestus should not ingest the original container as evidence by default. Instead, it should ingest each extracted child as a separate evidence item and preserve container provenance on each child occurrence.

Archive handling must include safety rails:

- never write extracted files into the source tree
- reject path traversal and absolute internal paths
- enforce maximum archive size, entry count, nesting depth, and expansion ratio
- record skipped entries as diagnostics
- record container hash, source path, internal path, extraction tool, and extraction adapter version
- make extraction deterministic enough for replayable tests

If a container cannot be expanded safely, Cestus records diagnostics and skips its children. The container is not silently imported as a substitute evidence item.

## Normalization And Parsing

Parsing has two lanes: local parsing and provider parsing.

Local parsing starts automatically after raw import approval. It should handle deterministic local work where tooling is available:

- media type sniffing
- filename and path metadata normalization
- plain text extraction
- HTML text extraction
- CSV and JSON structural normalization
- basic email parsing
- PDF, Office, and other document text extraction when local tools support them

Local parse failures create structured diagnostics and retryable parse job state.

Provider parsing is optional but recommended for high-fidelity document normalization. Mistral Document AI should be the recommended first provider, but the design must define a provider adapter contract so other document-AI suites can be added later.

Provider parsing requires a batch/job-level human approval gate before any document bytes leave the machine. Approval records:

- provider name and adapter version
- source collection ID
- import or parse batch ID
- actor approving the provider job
- eligible media types
- provider size limits
- policy to send all technically eligible files

Eligibility in the first slice is technical only: supported type, size limits, readable bytes, and provider capability. The first slice does not exclude files based on possible secrets, personal information, or content sensitivity. That can be designed as a later analysis layer.

Credentials must never be written to the repo, ledger, blobs, manifests, diagnostics, or UI DTOs. Live provider verification should run only when explicit credentials and environment variables are present. Standard repo verification should use deterministic local and fake providers.

## Parse Outputs And Extraction Queue

Parse outputs should be stored as derivative artifacts with provenance, not as trusted facts.

For each successful parse, Cestus should record:

- source evidence ID
- parse job ID
- parser/provider name and version
- local or external lane
- input content hash
- output content hash for derivative text/JSON
- media type and normalized output type
- confidence or quality metadata when provided
- warnings and skipped sections when available

Parse outputs may enqueue future extraction work for assertion proposals. The first ingestion slice should prepare this boundary but should not create accepted assertions automatically. A later extraction/reasoning slice can consume normalized derivatives and propose evidence-backed assertions for review.

## Event Model

The ingestion package should add strict Zod contracts for ingestion events. Exact payload names may be refined during implementation planning, but the first event catalog should cover:

- `ingestion.source.registered`
- `ingestion.scan.started`
- `ingestion.scan.completed`
- `ingestion.occurrence.observed`
- `ingestion.import.approved`
- `ingestion.import.completed`
- `ingestion.evidence.linked`
- `ingestion.parse.job.created`
- `ingestion.parse.completed`
- `ingestion.parse.failed`
- `ingestion.provider.approved`

The existing `diagnostic.recorded` event can be reused for secret-safe ingestion, validation, projection, migration, and deduplication failures where its current category contract is sufficient. If ingestion needs more diagnostic categories or fields, the plan should add strict contract changes without weakening existing diagnostic semantics.

Every ingestion event must carry actor identity, timestamp, causation or correlation references, source collection or batch IDs, schema version, and enough context for a generic coding agent to understand why it exists.

## Job Model

Scans, imports, local parses, provider parses, and retries are jobs.

Each job should have:

- stable job ID
- source collection ID
- scan/import/parse batch ID when applicable
- state
- attempt count
- input manifest hash or evidence hash
- actor or system identity
- created and updated timestamps
- causation/correlation references
- retry policy
- terminal result or diagnostic links

Jobs must be retryable and idempotent. Retrying a scan may produce a new scan batch if the source changed. Retrying an import or parse job should reuse deterministic IDs and avoid duplicate evidence, occurrence, or parse result records.

The first implementation may use an in-memory or SQLite-backed local queue, but the contracts should leave a clean path to team-worker coordination.

## Projections And Read Models

Ingestion projections must be rebuildable from ledger events. They should expose:

- source collection summaries
- latest dry-run scan summary
- refresh comparison
- duplicate content groups
- source occurrence history
- import approval state
- import progress and completion state
- parse/provider job queues
- diagnostic summaries
- evidence linkage by content hash
- UI-facing review DTOs
- CLI JSON summaries

Projection code should quarantine invalid or unrecognized events with diagnostics rather than inventing state.

## CLI Boundary

The CLI should support repeatable agent and power-user workflows:

- create or select portable workspace
- register source collection
- run dry-run scan
- print scan summary
- print stable JSON summaries
- approve raw import
- run import
- list jobs
- retry failed jobs
- approve provider parse batch
- inspect diagnostics
- export manifests

The CLI should avoid interactive-only flows for core operations. Human approvals can be explicit commands that append approval events. JSON output should be stable enough for future agents and scripts to consume.

## UI Boundary

The main Cestus app should include an ingestion/import workspace view.

The UI should show:

- portable workspace status
- source collection details
- dry-run scan summary
- duplicate and storage estimates
- skipped files and diagnostics
- archive findings
- refresh comparisons
- raw import approval gate
- import progress
- local parse progress
- provider approval gate
- provider parse progress
- retryable failures

The UI should not suggest investigations in this slice. Future investigation-suggestion agents can consume the shared corpus, occurrence history, parse outputs, and diagnostics.

Implementation planning must coordinate with the active local runtime and PRR workspace thread. Until explicitly directed later, ingestion work should avoid `packages/local-runtime`, `packages/ui/src/requests/request-adapter.ts`, `packages/ui/src/App.tsx`, local runtime scripts, and runtime-preview readiness files.

## Diagnostics

Failures should become inspectable state rather than logs only.

Important diagnostic categories include:

- unreadable source path
- unsupported media type
- oversized file
- archive expansion failure
- archive traversal attempt
- archive expansion limit exceeded
- duplicate occurrence conflict
- import copy failure
- evidence linkage conflict
- parse unsupported
- parse failed
- provider unavailable
- provider rejection
- provider rate limit
- provider credentials missing
- projection rebuild failure

Diagnostics must be secret-safe. They must not include provider credentials, OAuth tokens, API keys, refresh tokens, passwords, raw document bodies, or other secret material.

Diagnostics should include repair hints where possible: retry, skip, approve provider job, reduce batch size, install local parser, inspect source permissions, or rerun dry-run.

## Testing And Verification

Test coverage should protect:

- strict ingestion event contracts and unknown-key rejection
- dry-run scans over messy fixture trees
- duplicate content detection
- changed-path refresh behavior
- missing-file refresh observations
- unreadable, unsupported, and oversized file diagnostics
- safe archive expansion and child occurrence provenance
- path traversal rejection and expansion limits
- child-only evidence behavior for containers
- import approval gate before blob copy and evidence append
- one evidence item per content hash with multiple source occurrences
- idempotent import retry behavior
- local parse job creation and parse output provenance
- provider approval gate before outbound parsing
- fake provider parsing and provider failure diagnostics
- rebuildable ingestion projections from golden ledger fixtures
- CLI JSON DTO stability
- UI DTOs before product UI wiring

Standard verification remains:

```bash
npm run verify
```

Implementation tasks should also define targeted commands for each slice, such as package-specific contract tests, scan fixture tests, projection tests, CLI tests, and UI DTO tests.

Live provider checks should be separate opt-in commands that run only when explicit credentials are configured. Standard verification must remain deterministic without live external services.

## Software Factory Execution

The implementation plan should be written as task-scoped work orders. Each task should include:

- measurable outcome
- allowed files
- required reading
- failing test or validation first
- exact targeted failing command
- smallest production change
- exact targeted passing command
- `npm run verify`
- commit
- reviewer handoff
- stop conditions

Autonomous execution stops on:

- source-drive mutation risk
- data-loss risk
- schema conflict with ontology or ingestion contracts
- credential need that is not already configured outside the repo
- unavailable external service required by a task
- repeated verifier failure
- UI/runtime collision with the active PRR runtime thread
- changes that weaken append-only ledger semantics, provenance, projection rebuildability, send gates, or escalation locks

## First Slice Summary

The first implementation slice should make Cestus able to create a portable workspace on the external drive, register the messy drive root as one read-only source collection, run a hash-computing dry-run, present a reviewable summary through CLI and UI-facing DTOs, require human raw import approval, import unique raw artifacts as canonical evidence, preserve duplicate occurrences, safely expand supported archives into child evidence, automatically start local parse jobs, and prepare but not require provider parsing.

That delivers a useful laptop workflow while keeping the contracts broad enough for future public portals, team workers, investigation-suggestion agents, and ontology extraction.
