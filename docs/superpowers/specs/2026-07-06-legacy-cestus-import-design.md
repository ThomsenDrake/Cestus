# Legacy Old-Cestus Import Design

Date: 2026-07-06

## Purpose

This design covers the import path for artifacts from the old version of Cestus into the new append-only Cestus ontology. The old system is assumed to be a mixed file-based artifact bundle rather than a clean database export. It likely contains raw investigation files, notes, manifests, JSON, Markdown, YAML, CSV-like metadata, derived graph files, duplicated content, stale references, inconsistent names, and partial or corrupt records.

The importer must preserve useful legacy work without trusting old ontology metadata as accepted truth. Every legacy file enters as evidence first. Legacy ontology claims can become proposed assertions only when tied to imported evidence. Ambiguous, malformed, unknown, stale, or contradictory records become migration report entries and diagnostics rather than accepted graph state.

## Goals

- Inspect a read-only old-Cestus folder tree before import.
- Ask first for a folder tree listing plus 2-5 sanitized metadata or ontology samples, including any old manifest or index file if present.
- Treat every legacy file, including old metadata files, as evidence before any ontology staging.
- Detect candidate legacy file shapes through versioned detector and parser plugins.
- Produce a migration report that explains candidate formats, raw evidence inventory, proposed mappings, unresolved references, parser failures, and quarantine entries.
- Import raw files through the existing ingestion and evidence path into the portable Cestus workspace.
- Convert recognized legacy ontology claims into `assertion.proposed` only after they are tied to imported evidence.
- Keep candidate entity resolution in migration report state unless and until a strict candidate event contract is approved.
- Preserve append-only ledger semantics, content-addressed evidence blobs, provenance, projection rebuildability, human review gates, and secret-safe diagnostics.

## Non-Goals

- Mutating, reorganizing, deleting, or writing metadata into the old-Cestus source tree.
- Assuming a clean legacy database schema exists.
- Treating legacy metadata as accepted ontology structure.
- Emitting `assertion.accepted`, `entity.resolved`, `relationship.accepted`, or other accepted graph events from legacy import.
- Building runtime mount discovery or external-drive lifecycle management; that remains owned by the portable workspace mount session.
- Building public ingestion endpoints, provider parsing, legal escalation, export, or publication workflows.
- Inferring investigations from folder layout as accepted boundaries.

## Approved Direction

The approved approach is a recon-first plugin adapter. The importer begins with an `inspect` dry run that scans the old-Cestus root, hashes files, detects candidate metadata formats, and builds a migration report. Raw files are imported through the existing ingestion/evidence flow only after human approval. Legacy ontology metadata is parsed by small detector/parser plugins into neutral observations. Those observations may become proposed assertions after raw import and a staging approval gate, but they never become accepted graph state automatically.

The first implementation should optimize for messy file bundles. It should not wait for a perfect old schema, and it should not collapse all legacy parsing into one monolithic importer. Each recognizable legacy shape should have its own detector and parser with clear confidence, version, and diagnostics.

## Relationship To Existing Ingestion

The importer composes the current ingestion package:

- Source registration remains a read-only source collection.
- Dry-run scanning reuses content hashing, occurrence tracking, duplicate detection, archive provenance, and scan summaries where possible.
- Raw import reuses content-addressed blob storage, `evidence.ingested`, and `ingestion.evidence.linked`.
- Parse or detection output remains derivative migration state, not trusted fact.
- Provider parsing remains out of scope unless a separate approval and provider plan adds it.

Legacy import should be implemented as an adapter or adapter family under the ingestion boundary. It should not bypass `EvidenceService`, `AssertionService`, ingestion projections, or strict ontology event validation.

## Relationship To The Ontology Layer

The ontology ledger remains the source of truth. Imported legacy metadata can affect ontology state only through strict event contracts and human review gates.

Allowed ontology effect:

- `assertion.proposed` for a recognized legacy claim tied to an imported evidence ID.
- `diagnostic.recorded` for malformed, ambiguous, stale, unsupported, contradictory, or quarantined metadata.
- Future strict candidate events only after explicit contract approval.

Forbidden ontology effect:

- `assertion.accepted`
- `entity.resolved`
- `relationship.accepted`
- accepted entity merges, splits, or relationship decisions
- domain pack promotion
- legal escalation
- export or report publication

Current accepted resolution events are too strong for legacy import. Candidate entity resolution should remain in migration report state unless a later approved plan adds strict candidate-resolution event contracts with provenance, review state, replay behavior, and projection rules.

## Portable Workspace Dependency

The first durable migration target is a portable Cestus workspace on an external drive. This design treats portable workspace mounting as an interface dependency.

The legacy importer expects:

- a selected portable workspace root
- a read-only old-Cestus source root
- workspace paths for ledger, blob storage, derivative/report storage, and job state
- no secrets in workspace configuration

The importer must not edit mount-session files or own mount selection unless a later approved plan defines a small integration point.

## First Artifact Ask

Before implementing format-specific plugins, ask the user for:

1. A read-only folder tree listing of the old Cestus root.
2. Two to five sanitized representative ontology or metadata files.
3. Any old manifest, index, registry, or graph export file if present.

This sample should guide plugin order, parser fixtures, and report wording. High-level design and the generic recon adapter do not depend on receiving the sample first.

## Architecture

The importer has five bounded units.

`LegacyCestusInspector` walks the old-Cestus root in read-only mode, computes content hashes, records file metadata, identifies candidate metadata files, delegates detection to plugins, and produces an inspection result.

`LegacyDetectorRegistry` owns deterministic plugin ordering. It sends file metadata and safe preview bytes to detector plugins. It records all detector results above a low confidence threshold so the report can explain ambiguous matches.

`LegacyParserPlugin` owns one recognizable legacy shape. It parses full file content only when detector confidence and file constraints permit. It emits neutral legacy observations and parser diagnostics, not Cestus accepted facts.

`MigrationReportBuilder` turns inspection, detection, parsing, and mapping results into a deterministic report. The report includes summary counts, candidate legacy formats, raw evidence import readiness, proposed assertion candidates, unresolved references, duplicate and stale path findings, quarantine entries, and recommended user actions.

`LegacyAssertionStager` runs only after raw evidence import and ontology staging approval. It maps eligible legacy observations to `AssertionService.propose()` inputs using imported evidence IDs. It rejects observations that cannot be tied to evidence.

## Detector And Parser Plugin Contract

Each plugin should be narrow, deterministic, versioned, and testable.

Detector input:

- source path
- size
- content hash
- inferred media type
- preview bytes or preview text
- source collection ID
- scan batch ID

Detector output:

- plugin name and version
- shape label
- confidence from 0 to 1
- reason codes
- parser eligibility
- safe warnings

Parser input:

- full content bytes or text
- detector result
- source path
- content hash
- source collection context

Parser output:

- neutral observations such as possible entity, possible relationship, possible claim, possible property, stale reference, unknown field, or malformed record
- source locations when available
- parser diagnostics
- secret-safe repair hints

Mapping output:

- proposed assertion candidate if the observation is clear and evidence-tied
- migration report candidate if it needs human review
- quarantine entry if malformed, ambiguous, unsupported, stale, or unsafe

Generic JSON, Markdown, YAML, text, and CSV-ish detectors may exist, but they must not infer ontology semantics from vague field names. If a plugin cannot recognize a shape confidently, it should emit a report diagnostic rather than guessing.

## Evidence-First Import Flow

Inspection does not create accepted ontology state. It identifies what exists and what might be migrated.

The raw import flow is:

1. Register the old-Cestus root as a read-only source collection.
2. Run inspect/dry-run to hash files, classify candidates, detect plugins, and build a report.
3. Present the report for human raw import approval.
4. Import every approved legacy file as evidence through the existing ingestion path.
5. Link source occurrences to canonical evidence by content hash.
6. Preserve duplicate paths, archive-child provenance, stale references, and corrupt-file diagnostics.
7. Rebuild report/read models from ledger-backed scan, import, evidence-link, and diagnostic events.

Metadata files are not special at this stage. They are evidence files first, just like raw documents and notes.

## Legacy Ontology Staging Flow

Ontology staging happens after raw import.

The staging flow is:

1. Resolve parser observations to imported evidence IDs.
2. Filter observations that can become proposed assertions.
3. Quarantine observations without evidence, with unclear subject/object, with stale references, with parser conflicts, or with unsupported semantics.
4. Present proposed assertion candidates and quarantine entries for human staging approval.
5. Append only `assertion.proposed` events for approved, evidence-tied candidates.
6. Leave entity-resolution, relationship-acceptance, and candidate merge/split material in the migration report.

A legacy claim can become `assertion.proposed` only when tied to imported evidence. The evidence ID should normally be the metadata file that made the claim. If the legacy claim references a raw document, the report may record that reference, but the proposed assertion still needs a clear evidence basis and source path.

## Quarantine And Diagnostics

Quarantine is an append-only safety mechanism, not deletion.

The importer quarantines:

- malformed JSON, YAML, Markdown, CSV-ish, or text metadata
- partial records
- missing or stale file references
- unknown legacy IDs
- duplicate legacy IDs with conflicting values
- contradictory relationship claims
- unsupported metadata shapes
- detector conflicts
- parser confidence below the staging threshold
- metadata that appears to contain secrets or unsafe diagnostic text

Each quarantine entry should include:

- source path
- content hash
- detector or parser name and version
- shape label if available
- issue category
- issue message
- affected legacy IDs when safe
- proposed repair or review action

Diagnostics must be secret-safe. They must not include credentials, tokens, passwords, raw document bodies, or sensitive free-text extracts. Large or sensitive content remains in evidence blobs, not diagnostic payloads.

## Migration Report

The migration report is the central user-facing artifact for recon and review.

It should include:

- source collection and scan IDs
- inspected file counts and byte totals
- unique content and duplicate occurrence counts
- candidate metadata file counts by detector
- parser success, warning, and failure counts
- unsupported or corrupt file counts
- unresolved reference counts
- quarantine entries
- proposed assertion candidate counts by predicate/type
- candidate entity-resolution notes
- candidate relationship notes
- evidence import readiness
- ontology staging readiness
- recommended next actions

The report should be deterministic for the same input tree and plugin versions. The first implementation should store the report as a content-addressed derivative/report artifact and reference it from a strict append-only report event contract introduced in the implementation plan. If the implementation plan defers that report event for scope reasons, ontology staging must remain disabled until the report identity and candidate set identity are durable.

## Human Review Gates

The importer has two required gates.

Raw import approval happens after inspect/dry-run. It allows file bytes to be copied into the portable workspace blob store and `evidence.ingested` events to be appended.

Ontology staging approval happens after raw import. It allows eligible legacy observations to become `assertion.proposed`. It does not approve assertions, resolve entities, accept relationships, promote packs, export reports, or perform external actions.

Both gates must record actor, timestamp, source collection, batch identity, and report or candidate set identity. No AI-only action can bypass these gates.

## Event And Contract Policy

Use existing contracts where they fit:

- `ingestion.source.registered`
- `ingestion.scan.started`
- `ingestion.occurrence.observed`
- `ingestion.scan.completed`
- `ingestion.import.approved`
- `ingestion.import.completed`
- `ingestion.evidence.linked`
- `evidence.ingested`
- `assertion.proposed`
- `diagnostic.recorded`

Any legacy-specific durable state that cannot be represented by existing contracts must receive strict Zod event contracts before implementation. Likely candidates include inspection/report generation, detector findings, parser observations, staging approval, and report artifact references.

Legacy-specific contracts must include:

- schema version
- plugin name and version where applicable
- source collection and batch IDs
- evidence ID or content hash provenance
- actor and correlation context
- secret-safe diagnostic text
- replayable projection rules
- examples and counterexamples

## Projections And Read Models

Legacy migration views are projections, not sources of truth.

Read models should expose:

- latest inspection report for a source collection
- detector and parser summaries
- raw import readiness
- raw import completion
- quarantine entries
- proposed assertion candidates
- staging approval state
- unresolved legacy references
- candidate entity-resolution notes
- candidate relationship notes
- diagnostics

Projection rebuild must not require the old source tree after raw import. The ledger and content-addressed evidence blobs should be enough to rebuild imported state and report summaries.

## CLI And UI Boundary

The CLI should support non-interactive, agent-friendly operations:

- inspect old-Cestus root
- print migration report JSON
- approve raw import
- run raw import
- preview ontology staging candidates
- approve ontology staging
- inspect quarantine entries

The UI can later show the same report DTOs in the ingestion workspace. UI wiring is not part of this design unless a later implementation plan explicitly includes it and coordinates with runtime owners.

## Testing And Verification

Tests should use small fixture bundles that include:

- mixed raw files and metadata files
- duplicate content at multiple paths
- JSON metadata with recognizable claims
- Markdown or YAML metadata with recognizable claims
- CSV-ish relationship rows
- stale file references
- duplicate legacy IDs with conflicting values
- corrupt metadata
- unknown metadata
- archive children when relevant

Coverage should prove:

- inspect is read-only
- inspection is deterministic for the same fixture and plugin versions
- every approved legacy file is imported as evidence before ontology staging
- legacy claims become only `assertion.proposed`
- assertion proposals fail or quarantine when evidence is missing
- no accepted entity, relationship, or resolution event is emitted
- candidate entity resolution remains report state
- malformed and ambiguous records enter quarantine
- plugin ordering is deterministic
- migration reports are stable JSON DTOs
- projections rebuild from ledger events and report artifacts
- diagnostics are secret-safe

Standard verification remains:

```bash
npm run verify
```

Documentation-only work should also run:

```bash
git diff --check
npm run factory:check
```

## Stop Conditions

Stop and escalate on:

- source-drive mutation risk
- data-loss risk
- schema conflict with ontology or ingestion contracts
- missing legacy sample when implementing format-specific plugins
- unavailable portable workspace mount contract
- unavailable dependency
- credential need
- live external service dependency
- diagnostics that would expose secrets or raw sensitive content
- repeated verifier failure
- any change that would import legacy metadata as accepted truth

## First Slice Summary

The first implementation slice should create a legacy Cestus recon adapter that inspects a mixed file-based old-Cestus root, detects candidate metadata formats through plugins, produces a migration report, imports approved files as evidence through the existing ingestion path, and stages only evidence-backed legacy claims as proposed assertions after human approval. Accepted graph state remains untouched. Candidate entity resolution and relationship material stay in the migration report until strict candidate event contracts are approved.
