# Helix refactor plan

Assessed tree: `16045d2c` (`main`). This plan answers the questions in `docs/v1-plan.md` (branch `cursor/v1-plan-94fc`, draft PR #49), section "Inputs for the Refactor Plan", using the codebase audit in `docs/decision-memo-2026-11.md` (draft PR #48). It does not repeat that plan's scoping figures. Milestones below are ordered by dependency and a checkable done-condition only.

Owner direction applied here: HelixDB is part of Cestus's core, not a side file the rest of the app ignores. `SECURITY.md` stays in force. Generic Helix gaps are isolated so they can be contributed upstream. Helix Foundry, FollowTheMoney, nomenklatura, Aleph, and Datashare stay out, as in the v1 plan.

## Decision

**The SQLite ledger remains the system of record for evidence bytes' provenance and for human decisions. HelixDB is the only live ontology graph the product reads and the store those decisions are applied to.**

That is not option A from the v1 plan (a projection beside the app, which keeps answering from in-memory maps). It is not option C (Helix replaces `packages/ontology`). It is the co-primary shape, with the ledger winning whenever the two disagree.

Why the ledger cannot move into Helix today, from this tree:

- `packages/ontology/src/sqlite-event-ledger.ts` inserts into `ontology_events` and `ontology_decisions`. A search of that file finds no `UPDATE` or `DELETE` of event rows. Stream order is `UNIQUE(stream_id, stream_sequence)`. `appendBatch` takes `expectedGlobalEventCount`.
- `packages/ontology/src/knowledge-service.ts` refuses a knowledge command unless the ledger has `appendBatch`, re-reads the ledger length, and commits one batch. Accept, reject, supersede, and `knowledge.mention.bound` are new events. They are not in-place edits.
- `packages/ontology/src/contracts.ts` `payloadSchemas` lists 118 event-type keys and spreads the 11 version-2 types in `packages/ontology/src/knowledge-contracts.ts` (`knowledgePayloadSchemas`). Of the explicit keys, 59 start with `agent.` and 19 with `prr.`. Those are authority, tool, and human-gate records. They are not a property graph.
- The installed TypeScript SDK `@helix-db/helix-db` `3.2.0` (`node_modules/@helix-db/helix-db/dist/dsl.d.ts`, not yet a dependency of this tree) types `drop()` as deleting the current nodes or edges, and deleting a node's incident edges. `setProperty` overwrites. There is `IndexSpec.nodeUniqueEquality` and `edgeEquality`, and no `edgeUniqueEquality`. Helix can forget or rewrite a fact. `SECURITY.md` says existing ledger events are never rewritten or deleted, and that a derived projection must be rebuildable from ledger events and canonical evidence.

So provenance is not "pushed into Helix instead of the ledger" in the first milestones. Every accepted graph fact in Helix carries the ledger event id that authorized it, plus `evidenceId` and `sha256` content hash. Helix may be dropped and rebuilt. The ledger may not. After an upstream append-only mode exists and is proven against this ledger's concurrency rules, a later milestone can revisit storing the decision log in Helix. That milestone is not on the path to the two checkpoints below.

Why a side projection is rejected: `buildGraphProjection` (`packages/ontology/src/graph-projection.ts`) and `KnowledgeService.read` fold the whole ledger into maps on read. `GET /api/ontology/workspace` (`packages/local-runtime/src/ontology-http-routes.ts`) calls `ledger.readAll()` and builds a DTO. A Helix database that nothing in those routes reads is a second system. The routes change to read Helix. The pure functions stay as the rebuild specification and as the test double.

## Target architecture

```
ingestion / PRR / agent commands
        │  append only
        ▼
SQLiteEventLedger  +  FileBlobStore     ← authority (events, bytes, hashes)
        │  after a successful append
        ▼
packages/ontology helix adapter         ← Cestus vocabulary, review rules
        │  generic facts only
        ▼
packages/helix-contrib                  ← no Cestus types; upstream-shaped
        │
        ▼
HelixDB on the T5600 (loopback)
        ▲
        │  reads fail closed if Helix is down or behind the ledger
ontology / knowledge / investigation HTTP
```

Write order is fixed. `KnowledgeService` commits the ledger batch first. Only then does the adapter apply those new events to Helix, idempotently, keyed by ledger event id. If Helix rejects the apply, the command reports the decision as stored and the graph as stale. It does not roll back the ledger, and it does not claim the graph accepted the decision. `projection rebuild` repairs the graph from the ledger.

Read order is fixed. Ontology, knowledge, and investigation routes read Helix. They do not scan the ledger into a second answer when Helix is absent. Missing Helix configuration, a failed health check, or a graph fingerprint older than the ledger is a failed-closed response, the same way `ontology-http-routes.ts` already returns 503 when a stored event is unreadable. Unit tests inject the existing pure projection as the reader. Production composition in `packages/local-runtime` is the only place that constructs the Helix reader.

Helix listens on `127.0.0.1` on the T5600. Cestus `local-runtime` remains the process bound to the tailnet (`--bind tailnet`), which that package already supports. Helix's local server has no authentication (decision memo). Putting it on the tailnet directly would expose every graph mutation to any tailnet device. Loopback plus Cestus in front is the access control. A direct tailnet publish of Helix is a separate explicit step, not the default.

Telemetry is off before any real file is sent: `DO_NOT_TRACK` and `HELIX_TELEMETRY_LEVEL=off` on the server process, confirmed by the server's own status command, then a health check, and only then a load. Default Helix telemetry includes query shape (decision memo). Detention text waits until that check passes.

Persistence is disk or an encrypted volume, not Helix's default in-memory mode, which the decision memo and Helix's own start docs describe as wiped on restart. The ledger and blob store remain the backup that matters. An AWS object under the owner's startup credits may hold an encrypted copy of the SQLite ledger and blob store, with keys the owner holds. It does not hold an unencrypted copy of detention PDFs, and it is not Helix Cloud. Helix itself is rebuildable, so an S3-backed Helix volume is optional convenience, not the authority. Exact KMS and credit state were not verified.

Client pin: `@helix-db/helix-db` `3.2.0`, speaking `POST /v2/query` through that SDK. npm, as recorded in the decision memo and as installed on this machine, has no `4.0.0`. Do not code against the unpublished `4.0.0` examples. Server pin: container `ghcr.io/helixdb/helixdb` tag `v0.0.19` by digest once the T5600 pull returns a digest, not the floating tag `latest`. The decision memo could not match that tag to engine `v3.7.0`. OpenCypher (`POST /v2/cypher`) is not the core path until the pinned server on the T5600 answers one pinned read. The contrib package hides the SDK so a later client bump is one module.

## Upstream-shaped package

New directory `packages/helix-contrib/`, with its own `LICENSE` (Apache-2.0, the HelixDB license) and its own tests. The Cestus repo has no top-level `LICENSE`. This package must not import `packages/ontology`, `packages/ingestion`, `packages/prr`, `packages/agent`, or `packages/ui`.

It knows:

- a provenance record: `sourceId`, `contentHash` (`sha256:` plus 64 hex digits), optional locator, `authorityId` (the id of the decision that authorized the element);
- an append-only writer that will not call `drop`, `setProperty`, or `removeProperty` on an element it has recorded, except through an explicit `rebuild()` that drops a named database and replays a caller-supplied log;
- idempotent insertion keyed by a caller-supplied stable key (Helix `addE` does not dedupe);
- an endpoint allowlist the caller passes in (label A may connect to label B via edge C);
- a text-span node: locator plus hash of the span text, with no agency, person, or investigation types;
- a thin client wrapper over SDK `3.2.0` `POST /v2/query`, including the health check and the telemetry-off precondition (the wrapper refuses to send a write if the process env does not show telemetry off, so a mistake fails before detention text moves).

`packages/ontology` maps Cestus words onto those generics at one boundary: `evidenceId` → `sourceId`, ledger event id → `authorityId`, `investigation.v1` entity types → label strings, `knowledge.mention.bound` → an append-only edge. Domain rules (who may accept, citation grounding, tombstones, PRR gates) stay in the ontology, PRR, and governance packages.

## Schema mapping

Helix labels and edges below are the Cestus domain schema. The contrib package does not contain them.

| Cestus today | Where it lives now | Helix representation |
|---|---|---|
| Evidence bytes | `FileBlobStore` (`packages/ontology/src/blob-store.ts`), hash `sha256:` | Not stored again. A `Document` node points at `evidenceId` and `contentHash`. |
| `evidence.ingested` | ledger event | Authorizes the `Document` node. The event stays in SQLite. |
| Extraction passages | `packages/ontology/src/extraction-contracts.ts` (`text` / `pdf` / `csv` locators, quote text) | `Passage` node (generic text-span in contrib; Cestus adds the evidence link). Edge `Document -HAS_PASSAGE→ Passage`. |
| Producing agency for a file set | ingestion source label (`ingestion.source.registered` plus append-only `ingestion.source.label.updated` corrections) | `Agency` node, role `producer`, edge `Agency -PRODUCED→ Production`, `Production -INCLUDES→ Document`. `Agency.name` is authoritative (advancing via provenance-chained supersession); `Document.sourceLabel` keeps the ingest-time snapshot from `evidence.ingested`, and queries resolve producing agency names via the `Agency` node. One production per import batch already identified by `imp_` / `src_` / `scan_` ids in `contracts.ts`. |
| `investigation.v1` entity types `person`, `organization`, `agency`, `contract`, `address` | `knowledge-contracts.ts` | Labels `Person`, `Organization`, `Agency`, `Contract`, `Address`. The producing agency and a mentioned agency are the same label. They merge only when a human `knowledge.mention.bound` says so. |
| Mention vs entity | `knowledge.proposed` plus `knowledge.mention.bound` (`mentionId`, `entityId`, `previousEntityId`, `assertionId`, `rationale`, `decisionId`) | `Mention` node per cited span. `Entity` node only after a bind event. Edge `Mention -BOUND_TO→ Entity` carrying `authorityId`. A later bind adds another edge; it does not `setProperty` the old one. Current binding is the edge whose authority event is latest in the ledger. |
| Same / not-same, without nomenklatura | no dedicated event; review actions are `accept`, `reject`, `withdraw`, `supersede`, `dispute` | A candidate pair is a query result (normalized label, two mentions, two agencies), not an edge. A human decision is a `knowledge.proposed` relationship `same_as` or `not_same`, added through the existing `knowledge.schema.extended` vocabulary path, then `knowledge.reviewed`. No automatic merge. |
| Relationship predicates `paid`, `awarded`, `employed_by`, `owns`, `associated_with` | vocabulary, entity-valued, typed endpoints | Helix edges with those labels. The ontology adapter checks `fromTypes` / `toTypes` before the contrib allowlist is called. Helix will not check this itself. |
| Fact predicates `name`, `identifier`, `address`, `description`, `amount`, `date` | vocabulary | Literal facts hang off the entity as citation-bearing values (authority id plus evidence id and hash). A grounded date also becomes a `Date` node so a cross-agency date query is a graph walk, not a scan of free text. |
| Occurrence predicates `payment`, `award`, `appointment`, `meeting`, `ownership_change` | vocabulary | `Occurrence` nodes. Edges to participants and, when the text supports it, to a place. |
| `investigation.created` and membership | ledger, version 2 | `Matter` node. Edges to included evidence, entities, and records. This is what removes the need to load every assertion into `prepareCaseComparison` for a structural question. |
| `investigation.hypothesis.recorded` | ledger | `Hypothesis` node. Accepted-entity queries must not return it. It never shares an edge type with an accepted relationship. |
| `assertion.proposed` / `assertion.accepted` | `graph-projection.ts` (version-1 graph) | Replayed for old ledgers into the same Mention / Entity shapes, marked with their event version. New writes go through `KnowledgeService` (version 2). |
| `knowledge.source.lineage` | ledger (`independent`, `derived`, `unknown`) | Property on the `Document` or `Mention`, copied from the event. Not inferred by Helix. |
| Passage text search | not implemented (no embedding or BM25 call under `packages/ontology`) | Helix BM25 on passage text, after passages exist. Vectors are a later derived index of the same text, rebuildable, not evidence. The two checkpoints do not depend on vectors. |
| `prepareCaseComparison` caps | `case-comparison.ts` `LIMITS`: 12 cases, 100 assertions, 24 passages, 32 KiB text, 100 candidates | Stay as the default bound for any model call. A Helix query that returns evidence ids, hashes, and locators is not a model call and is not subject to that text cap. Raising the model-call cap is out of this plan. |

### No clean mapping

These stay in SQLite and are not mirrored into Helix except as an optional pointer (an id), never as the state machine:

- `agent.*` events (identity, tasks, tools, locks, permissions, wake supervisor). They are the resident runtime's log.
- `prr.*` events, including `prr.fee.estimated`, `prr.fee.challenged`, and legal escalation. A gap may point at a `prr.request` id. Fee state, send gates, and stalling confirmation stay in `packages/prr` projections of the ledger. `packages/local-runtime/src/http-handler.ts` still exposes draft creation and not send; this plan does not add send.
- Governance: `evidence.quarantined`, `evidence.tombstoned`, `evidence.redaction.applied`, policy, network exposure, device sessions. A tombstone or quarantine must remove or hide the corresponding Helix nodes on apply and on rebuild. Helix is not allowed to answer around a tombstone.
- `export.generated` and `report.generated`. Export continues to be built from the ledger and `governance-export-preview.ts`, with `publicationAllowed` still false until a human gate that already exists in the report workflow. Helix is not the export source.
- JSON-LD export (`packages/ontology/src/jsonld-export.ts`). Remains a ledger projection.
- Optimistic concurrency (`expectedGlobalEventCount`, stream sequence). Helix has single-request write batches. It has no equivalent of the ledger's global revision. The ledger check remains the lock. Helix apply is idempotent on `authorityId`.
- Operator-status command policy (`packages/operator-status/src/contracts.ts`). The forbidden-text patterns already reject "projection rebuild" and destructive ledger/ontology phrases in operator copy. The cockpit does not gain a button whose label is that phrase. The human runs the existing workspace-ops command.
- OCR. `packages/ingestion/src/extraction.ts` records a textless PDF page as partial coverage and does not OCR. A scanned page has no passage to attach. That is an ingestion limit, not a Helix schema.

## Per-package changes

| Package | Change | Stays |
|---|---|---|
| `packages/helix-contrib/` (new) | Generic client, provenance record, append-only writer, idempotent edges, text spans, tests. | No domain types. |
| `packages/ontology/src/knowledge-service.ts` | After a successful `appendBatch`, apply the new events through the adapter. Failed apply → stale-graph result, ledger kept. | Ledger batch, citation checks, concurrency check. |
| `packages/ontology/src/graph-projection.ts`, `knowledge-projection.ts` | Remain the pure specification and the test double. | Not deleted, not replaced by live queries inside unit tests. |
| `packages/ontology/src/case-comparison.ts` | Gains a Helix-backed way to list candidate ids. The pure function and its caps remain for model calls. | Caps, fingerprint, authority-filtered input. |
| `packages/ontology/src/sqlite-event-ledger.ts`, `blob-store.ts`, `contracts.ts` | No semantic change for the checkpoints. No new event type is required: `same_as` / `not_same` are vocabulary additions (`knowledge.schema.extended`), not new ledger types. | Append-only insert, hash checks, event schemas. |
| `packages/ontology/src/evidence-service.ts` | Unchanged write path. The adapter creates the `Document` node from `evidence.ingested` plus a completed extraction. | Blob put, governance gate. |
| `packages/workspace-ops/src/projection-rebuild.ts`, `node-runner.ts` | The placeholder builder (`workspace-ops.projection-placeholder.v1` in `node-runner.ts`) for one named projection becomes "replay the ledger into Helix, write a fingerprint manifest under the projection root". Rebuild still reads the ledger and still uses a temp path before promote for that manifest. It does not open the ledger read-write. | `preservationCheck`, readiness failure blocks the rebuild. |
| `packages/local-runtime/src/ontology-http-routes.ts`, `knowledge-http-routes.ts`, `investigation-http-routes.ts` | Production reader is Helix. Tests inject the pure reader. Helix down → 503, not a silent ledger scan. | Route paths. Draft/send behavior elsewhere is untouched. |
| `packages/local-runtime/src/ingestion-http-routes.ts` | No route change required. `POST /api/ingestion/parse/run` already calls `runParseJobs`. | |
| `packages/ingestion/src/cli.ts`, `runtime.ts` | Additive only: a `parse` command that calls the existing `runParseJobs`, and a visible `imp_` rejection. Today `importBatchIdSchema` is `^imp_[a-zA-Z0-9_-]+$` (`contracts.ts`) and `approveRawImport` turns a schema throw into `INGESTION_RUNTIME_INTERNAL` (`runtime.ts`). The CLI has no `parse` command. | Register, dry-run, approve, import, Poppler extractors, no cloud OCR. |
| `packages/ingestion/src/central-fl-ice-preview.ts`, `packages/ontology-bootstrap/` | Not on this path. The preview targets an unmounted legacy SSD and is not exported from the ingestion index. Bootstrap's fake runtime records no side effects. Neither is wired to Helix. | Left in tree until a later deletion; not extended. |
| `packages/prr/`, `packages/ui/`, `packages/agent/` | No structural rewrite. They keep appending ledger events. The ontology UI follows whatever `/api/ontology/knowledge` returns. | Human send gate, report truth boundary. |

This stays inside the v1 plan's ban on a second rewrite of the host. `local-runtime` changes are the reader wiring and the fail-closed branch. `ingestion` changes are two CLI gaps that already block loading a document. `prr` and `ui` are not redesigned here.

## What breaks, and what is preserved

**Tests.** Route tests that assume `GET /api/ontology/workspace` always calls `ledger.readAll()` will fail once production code requires a reader. Fix: the route takes the reader it already almost takes (`readAuthorized` exists on `ontology-http-routes.ts`); tests pass the pure DTO builder. Knowledge route tests that expect a 409 with "Nothing from this decision was partially accepted" (`knowledge-http-routes.ts`) must grow a case for "ledger committed, Helix apply failed": the decision is durable, the graph is stale, the body must not say the decision was discarded. Ontology unit tests of the pure projections stay. New tests live next to `packages/helix-contrib` and next to the adapter: append-only writer refuses `setProperty`; rebuild reproduces `authorityId` and `contentHash`; a tombstone hides the node.

**Operator-status.** No change to the forbidden-pattern list if the cockpit never utters "projection rebuild" or "drop helix". When the rebuild command is documented inside the product UI, add it to `forbiddenCommandPatterns` in `packages/operator-status/src/contracts.ts` in the same change. That preserves the contract instead of routing around it.

**Append-only guarantee.** Preserved because SQLite event rows are still insert-only, corrections are still new events, and Helix elements that represent decisions are append-only edges keyed by `authorityId`. The one allowed destruction is `projection rebuild` of the Helix database, which `SECURITY.md` already allows for a derived projection: explicit command, exact target (Helix endpoint plus database name), ledger untouched, result checked by fingerprint. `setProperty` on a review state is forbidden in the adapter and in the contrib writer. A test that calls `setProperty` on an authority-bearing key must fail in `packages/helix-contrib` before any Cestus test runs.

**Fail-closed.** A missing Helix, a hash mismatch, or a graph fingerprint behind the ledger does not fall back to a partial map. Stored approvals are still revalidated when consumed (`SECURITY.md`); a Helix edge is not itself an approval.

**Human gates.** PRR send, legal escalation, and publication are not added and not delegated to a Helix query.

## Migration of existing data

No workspace in this repo has a Helix database. Migration is a rebuild, not a row rewrite.

1. Read the SQLite ledger at `ledger/ontology.sqlite` (the portable workspace layout in `packages/workspace/src/index.ts`).
2. Validate events with the existing `validateKnowledgeEvent` path the projection rebuild already uses.
3. Replay, in ledger order: evidence, completed extractions (derivative blobs), version-1 assertions, version-2 knowledge events, tombstones and quarantines last so hidden evidence cannot remain visible.
4. Write the fingerprint (ledger length, last event id, counts by label) into the projection manifest.
5. Compare a second rebuild to the first. Same `evidenceId`, `contentHash`, and `authorityId` sets. Helix's internal numeric ids are not part of the fingerprint; the decision memo's SDK and a live `drop` both show those ids are engine-assigned.

An empty ledger yields an empty graph. A ledger with evidence and no successful parse yields `Document` nodes and no `Passage` nodes, plus an explicit unextracted or parse-failed marker. Nothing is inserted into SQLite by the migration.

## Rollback

Rollback switches the local-runtime reader from Helix back to the pure ledger projection. The ledger was never replaced, so there is no ledger restore on the happy path. The Helix volume can be deleted; evidence blobs remain. Do not roll back by editing or deleting ledger events.

Because the checkpoints add no new event types, a binary from this tree can still read a ledger written by the Helix-aware binary. The danger is the opposite: a Helix-only fact with no ledger event. The write order forbids that. A rebuild after rollback is unnecessary for correctness and required only if the operator turns Helix back on.

## Ordered milestones

Each milestone's done-condition is something a person can check on the T5600 or in the test suite. Later milestones depend on earlier ones. The first two are the v1 plan's Helix checkpoints, stated as outcomes.

### 1. Helix is up on the T5600, and no corpus has been loaded

Depends on: nothing in this repo. The machine itself was not inspected.

Done when all of these are true:

- The pinned image digest is recorded, and the process survives a restart with data still present (disk, not the default memory mode).
- From another machine on the tailnet, the Helix port does not accept a connection. From the T5600, `127.0.0.1` answers a health check.
- Telemetry status is off, recorded before any document bytes are sent.
- A throwaway write of a synthetic node (not a detention record) can be dropped and is gone. That confirms the operator can destroy the projection without touching a Cestus ledger.

### 2. One produced I-4 document is in the live graph

Depends on: milestone 1, and on one real produced file from Seminole Sheriff, Orange County, or partial Osceola Corrections. Those files are not in the repository.

Done when all of these are true:

- The file went through the existing ingestion path (register, dry-run, approve with an `imp_` id, import, parse). The CLI `parse` command exists and calls `runParseJobs`.
- The ledger contains `evidence.ingested` for that file. The blob store returns bytes whose hash equals the event's `contentHash`.
- Helix contains one `Document` with that `evidenceId` and `contentHash`. If extraction produced text, each passage is a node with that same evidence id, the same content hash, and a locator. If the only page is unextracted, the document is still present and marked unextracted, and there is no fabricated passage.
- `GET /api/ontology/workspace` (or the knowledge read) for this workspace returns that document from Helix. Stopping Helix makes the route fail closed rather than reconstructing the document from a ledger scan.
- `projection rebuild` against this ledger, after a drop of this Helix database, yields the same evidence id and content hash. The SQLite file's event count is unchanged by the rebuild.
- `packages/helix-contrib` exists, has an Apache-2.0 `LICENSE`, imports no Cestus package, and its tests cover the append-only refusal and the idempotent key. The document load goes through that package.

### 3. Every produced I-4 document is loaded, and three cross-agency queries are source-checked

Depends on: milestone 2, and on the three produced sets. How many of those files are scans is unverified. A scan with no text layer still counts as loaded only when its `Document` node and its unextracted marker exist. It cannot support a source-checked hit. If every produced file is a scan, this milestone is not done until local OCR (a separate v1 ingestion workstream, not this refactor) has written a derivative and the passages carry that derivative's hash and the original evidence id. Cloud OCR is out.

Done when all of these are true:

- Every file in the three produced sets is either a Helix `Document` whose `evidenceId` and `contentHash` match the ledger and the blob store, or a ledger parse-failure the operator can list. No silent skip.
- Three queries each return at least one hit that spans two of the three agencies. Each hit includes the passage quote, locator, `evidenceId`, and `contentHash`, and a person can open that blob and find the quote.
- The three queries are: a person-mention shared across agencies, a facility or organization mention shared across agencies, and a grounded date shared across agencies. Shared means the same normalized value under two producer agencies. It does not mean a `BOUND_TO` edge. Hits are review candidates. Nothing in the query writes `knowledge.mention.bound`.
- A second rebuild reproduces the same hit set (same evidence ids and hashes, ignoring Helix-assigned ids).

### 4. Human decisions write the ledger first and Helix second

Depends on: milestone 3.

Done when all of these are true:

- Accepting a proposal and binding a mention through `KnowledgeService` appends `knowledge.reviewed` and `knowledge.mention.bound`, then a `BOUND_TO` edge whose `authorityId` is the bind event.
- A forced Helix failure after the ledger commit leaves the new events in SQLite, does not delete them, and makes the ontology route fail closed until rebuild. Rebuild restores the edge.
- Two mentions with the same normalized name and no bind remain two `Mention` nodes. A `not_same` or `same_as` decision is a reviewed vocabulary proposal, not an automatic edge.
- A tombstone or quarantine on the evidence hides the document and its passages on the next read, and a rebuild does not bring them back as visible.

### 5. The schema accepts a second matter shape without renaming the I-4 labels

Depends on: milestone 4. Executing the Florida Amendment 3 investigation is out of v1.0. This milestone is a fixture only.

Done when a fixture matter can use `person`, `organization`, `agency`, `contract`, and `address` plus one vocabulary addition, and a Helix query can name an entity id present in both the fixture and an I-4-shaped fixture, each with its own evidence id, without a code change to the I-4 labels. `prepareCaseComparison`'s model-call caps are still the defaults.

### 6. A gap hypothesis cannot come back as an accepted fact

Depends on: milestone 3 for the missing-edge query, and milestone 4 for the write path.

Done when a query for a `Person` with no `employed_by` / affiliation edge, a `Document` with no grounded date, and an `Occurrence` or `Production` with no place returns those nodes with their evidence ids, and recording a hypothesis writes `investigation.hypothesis.recorded` plus a `Hypothesis` node that the accepted-entity query does not return. Turning the hypothesis into a request creates a PRR draft only. It does not send.

## Upstream candidates

File none of these as part of this plan. The contrib package is the code that would become the pull request. Sizes are relative (a client patch, a server feature, or a storage-engine change), not a schedule.

| Candidate | Why it is generic | What Cestus does until it exists | Size |
|---|---|---|---|
| Append-only open mode: the server rejects `drop`, `setProperty`, and `removeProperty` for a database or label marked audit, and exposes an explicit rebuild that is not a quiet `drop`. | Any ledger-backed app needs this. The Cestus domain does not. | Contrib writer refuses those calls locally. The engine can still be asked to drop by something else, so the ledger stays the authority. | Storage-engine change. This is what would have to land before Helix could hold provenance alone. |
| Unique edge key / idempotent `addE`. Node unique indexes exist (`nodeUniqueEquality`). Edge indexes in SDK `3.2.0` are `edgeEquality` and range, not unique. Docs state edges are never deduplicated. | Replay and rebuild need it. | Contrib looks up the stable key and skips a second insert. | Server feature plus a small SDK method. |
| A missing-edge predicate (anti-join) in the operation tree. | Gap queries should not pull every node to the client. | Milestone 6 may compute the gap from a label scan minus an edge traversal if the pinned server has no anti-join. Whether `3.2.0` or `v0.0.19` already has one was not proved. | Server feature, if absent. |
| Typed provenance on a value (source id, content hash, locator, authority id) instead of an untyped property bag. | The decision memo's Foundry notes citations; the engine does not require them. | Contrib requires the fields on every element it writes and rejects a write without them. | Server feature or a documented convention. A convention is a small docs change; enforcement is a server feature. |
| Bind address. CLI configuration documents a host port, not an interface. The default publish is every interface. | Tailnet-only and loopback-only installs need it. | Milestone 1 publishes `127.0.0.1:6969` with Docker, or firewall-denies the port, and does not use a bare `helix start` that publishes widely. Confirm the CLI flag on the T5600; the docs read for the decision memo had no bind key. | Small CLI change. |
| Telemetry default off for a self-hosted server, or one env var the binary reads even when the CLI did not start it. `DO_NOT_TRACK` and `HELIX_TELEMETRY_LEVEL` are documented for the CLI and the server. The default is not off. | Detention text must not ship query shape anywhere. | The contrib client refuses writes unless the env shows off, and milestone 1 checks the server status. | Small default change. |
| Publish the client that matches the server, or document which `3.2.0` queries `v0.0.19` accepts. Docs describe `4.0.0`. npm has `3.2.0`. | Every embedder hits this. | Pin both and run the milestone 1 throwaway query on the T5600 before any real file. | Release engineering. |
| `addE` is typed as a node stream in the SDK even when the result is an edge. | Client correctness. | Contrib does not trust that return value; it re-reads by stable key. | Small SDK patch. |

Cestus-specific items that must not be upstreamed: `investigation.v1`, PRR gates, tombstone policy, `imp_` / `ev_` id grammar, I-4 agency names.

## Unverified

Checked in this tree at `16045d2c`, or in the SDK copy present on the machine that wrote this plan:

- Ledger insert-only surface, knowledge command batching, event-type counts, case-comparison caps, ontology and knowledge routes, ingestion parse route versus missing CLI command, `imp_` schema, projection placeholder builder, operator-status forbidden phrases, absence of an embedding call under `packages/ontology`, absence of a repo-level `LICENSE`.
- SDK `3.2.0` declarations for `drop`, `nodeUniqueEquality`, and `edgeEquality` only. Those declarations live in a local `node_modules` from a package install; `package.json` on `main` does not depend on Helix yet.

Not checked, or only known from the decision memo and Helix docs rather than from a T5600 run:

- Whether container `v0.0.19` implements the `3.2.0` operation tree, the Cypher endpoint, disk mode, and telemetry flags the same way the docs describe.
- T5600 OS, disk, Docker, Poppler, and Tailscale ACLs.
- File count, scan ratio, encryption, and PII of the Seminole, Orange, and Osceola productions. They are not in the repository. The legacy preview's 136-file path is a different corpus and is not the load path.
- The 24-request mail summary cited by the v1 plan (counts, the Pinellas figure, the unanswered review). Not re-read from a mailbox.
- Whether the operation tree can express "node with no edge" without a client-side subtraction.
- AWS account, KMS, and credit limits.
- Browser behavior of the ontology screen. The route change is specified; the screen was not clicked.
- That a stopped local spike's embedded engine matches the T5600 container. Do not treat that spike as this plan. It is not on `main` and it is not the architecture above.
