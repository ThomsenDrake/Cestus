# Cestus Ontology Layer Design

Date: 2026-06-30

## Purpose

Cestus is a greenfield rewrite of an AI-powered accountability platform for citizens, journalists, and civic organizations. Governments use Palantir-style tools to connect data about people; Cestus should help people connect public data about governments. The ontology layer is the foundation that lets public records requests, datasets, documents, investigations, claims, and inferred links inform each other across time.

This design covers the first slice of Cestus: a scalable, extensible, AI-legible ontology layer. It intentionally starts with an event-sourced core so replay, auditability, sync, collaboration, and future reasoning workflows are not retrofitted later.

## Goals

- Store knowledge in a durable event ledger that is append-only and replayable.
- Keep raw evidence intake permissive while requiring typed validation before facts influence the shared graph.
- Model knowledge as assertion-backed, provenance-first data rather than ungrounded facts.
- Provide a practical property graph model for investigators and developers.
- Support JSON-LD/RDF import and export as interoperability formats.
- Make ontology contracts legible to Cestus's own future AI agent and to generic coding agents such as Claude Code, Codex, and Opencode.
- Run first on a single investigator laptop while preserving a clean path to a small newsroom or nonprofit team server.
- Allow versioned domain packs and investigation-local extensions without letting the ontology become an ungoverned blob.

## Non-Goals

- Building the full Cestus application.
- Designing the complete public records request workflow.
- Choosing every future domain ontology.
- Optimizing the first implementation for public-data scale measured in billions of records.
- Making RDF or OWL the internal source of truth.
- Treating AI-generated assertions as trusted without review, provenance, and validation.

## Core Architecture

Cestus's ontology layer is an event-sourced knowledge system. The canonical source of truth is an immutable knowledge ledger. Every meaningful ontology change is represented as an append-only event, including evidence ingestion, extracted assertion proposals, human review actions, entity resolution decisions, relationship creation, claim updates, schema migrations, and domain-pack changes.

The graph investigators interact with is a materialized projection built from the ledger. Relational query views, full-text search, vector search, timeline views, reports, and JSON-LD/RDF exports are also projections. If a projection is corrupted, falls behind, or needs a new shape, Cestus can rebuild it from the ledger.

Solo mode should use SQLite as the default local embedded database for the durable event store plus local projection tables. Team mode should use Postgres with the same logical event model. If implementation planning finds a concrete blocker in either default, the replacement must preserve the same event contracts, replay semantics, and projection behavior. Multiple team users append events with optimistic concurrency, projection workers update read models, and audit history remains intact.

## Knowledge Model

The internal investigator and developer model is a property graph. Entities, relationships, assertions, claims, evidence, actors, events, investigations, ontology packs, and projections all have stable IDs and typed properties. This supports investigative questions such as:

- Which officials are connected to this vendor?
- What evidence supports this claim?
- Which investigations touched this agency?
- Where did this relationship come from?

The epistemic core is assertion-backed. Cestus does not store bare facts as if they arrived from nowhere. It stores assertions with source evidence, extractor or human actor, confidence, review state, timestamp, ontology version, and supporting or contradicting context. Durable shared entities and relationships are resolved from those assertions, not manually declared as ungrounded truth.

Investigations add claim layers on top of the shared graph. A claim can gather supporting assertions, contradicting assertions, inferred links, notes, and reasoning steps. Separate investigations can disagree or explore hypotheses without polluting the shared ontology.

JSON-LD and RDF are supported at the boundary for import, export, and interoperability with public-data ecosystems. Internally, the property graph plus event ledger is the model developers and agents work with.

## AI-Legible Contracts

Cestus should be designed for two readers at once: humans doing accountability work and AI/coding agents that need to safely extend, query, migrate, and reason over the system.

Every ontology primitive, event type, projection, and domain pack should have a machine-readable contract:

- Stable IDs and names.
- JSON Schema or equivalent validation.
- Semantic descriptions.
- Examples and counterexamples.
- Allowed transitions.
- Migration rules.
- Query examples.
- Agent-facing guidance.
- Invariants that must not be violated.

Domain packs should include agent guide metadata that explains what the pack means, when to use each entity or relationship type, common mistakes, sample evidence-to-assertion mappings, and review expectations.

The ledger should be self-describing. Events must carry schema versions, pack versions, causal references, actor or extractor identity, source provenance, confidence or review state when applicable, and enough context for a generic coding agent to understand why the event exists without reading hidden application code.

Projection definitions should be inspectable. A future Cestus-native AI agent, Claude Code, Codex, or Opencode should be able to inspect the contracts and know what can be created, what evidence is required, what validation applies, how to migrate it, and how to query it.

## Event Ledger

The event ledger is append-only. Events are immutable after commit. Corrections, reversals, supersessions, and review changes are represented by new events that reference prior events.

Each event should include:

- A stable event ID.
- Event type and version.
- Stream or aggregate reference.
- Timestamp.
- Actor, extractor, or system identity.
- Causation and correlation references.
- Ontology core version.
- Installed pack names and versions relevant to the event.
- Subject references such as evidence ID, assertion ID, entity ID, relationship ID, claim ID, or investigation ID.
- Payload validated by the event contract.
- Content hashes or blob references when evidence payloads are externalized.

Important event families include:

- Evidence events: evidence ingested, evidence annotated, evidence redacted, evidence superseded.
- Assertion events: assertion proposed, assertion validated, assertion accepted, assertion rejected, assertion contested, assertion superseded.
- Entity and relationship events: entity candidate created, entity resolved, entity merged, entity split, relationship asserted, relationship accepted, relationship contested.
- Claim events: claim created, support linked, contradiction linked, reasoning step recorded, claim state changed.
- Ontology events: pack installed, pack upgraded, local extension created, local extension promoted, migration applied.
- Projection events: projection created, projection rebuilt, projection checkpointed, projection failed.
- Diagnostic events: ingestion failed, validation failed, migration conflict detected, duplicate candidate detected.

The exact event catalog can evolve during implementation planning, but every event must preserve replayability, provenance, and contract validation.

## Extensibility And Governance

Cestus should have a small stable core ontology and a layered extension system.

The core defines primitives that should rarely change: evidence, source, actor, event, assertion, entity, relationship, claim, investigation, ontology pack, projection, and review state.

Domain-specific concepts belong in versioned packs. A pack can define entity types, relationship types, allowed properties, validation rules, extraction mappings, reasoning rules, projection definitions, examples, migrations, and agent-facing guidance.

There are three extension scopes:

- Core packs are bundled with Cestus and versioned with the app.
- Org/domain packs are installed and reviewed by a team or newsroom.
- Investigation-local extensions are allowed for fast-moving work, clearly marked as local, and not automatically promoted into shared ontology scope.

Promotion from local extension to org/domain pack is an explicit reviewed event in the ledger. Pack migrations are also events, so Cestus can replay history, rebuild projections, and explain which ontology rules were in force when an assertion was created or reviewed.

## Storage, Scale, And Projections

The design target is tiered scale:

- Day one: serious laptop scale with tens of thousands of documents and millions of assertions.
- Next tier: small newsroom or nonprofit server with millions of records/documents and tens to hundreds of millions of assertions.
- Later tier: public-data scale with hundreds of millions to billions of records is out of scope for the first plan, but core assumptions should not block it.

The first implementation should keep ontology logic above database-specific details, while keeping the event schema concrete and portable. SQLite and Postgres should share the same logical event model.

Read performance comes from projections:

- Current property graph state.
- Relational lookup tables.
- Full-text search indexes.
- Vector indexes.
- Timeline views.
- Export views.
- Investigation-specific working sets.

Projections are rebuildable from the ledger. They still require operational metadata: high-water marks, rebuild status, schema version, failure logs, and replay checkpoints. Projection updates should be idempotent and support incremental processing.

Large raw documents should not bloat the ledger. Raw files, extracted text, and bulky payloads should live in a content-addressed blob store or document store. The ledger stores metadata, hashes, provenance, and references.

## Data Flow

Raw evidence enters first with minimal assumptions. Evidence can include files, records, messages, datasets, annotations, URLs, extracted text, and PRR-related artifacts. Ingestion creates evidence events and stores large payloads outside the ledger with content hashes and source context.

Extractors and humans propose assertions from evidence. Proposed assertions are not automatically promoted into shared knowledge. They pass through validation from the core ontology and installed packs, then through review states such as proposed, needs-review, accepted, rejected, superseded, or contested.

Entity resolution and relationship creation are explicit events, not hidden side effects. This keeps merges, splits, inferred links, and disputed relationships auditable and reversible.

Investigations can create claims, link supporting or contradicting assertions, record reasoning steps, and use local ontology extensions. Shared ontology state changes only through reviewed events and governed promotion paths.

## Error Handling

Errors should become inspectable state rather than silent logs. Failed ingestion, failed validation, projection lag, projection rebuild errors, pack migration conflicts, duplicate entity candidates, and contradictory assertions should all create durable diagnostic records tied to relevant evidence and events.

Some failures are operational errors. Others are investigative signals. Cestus should preserve that distinction.

For AI use, failures should include structured repair hints where possible:

- Which contract failed.
- Which field or invariant was violated.
- Which event caused the failure.
- Which ontology or pack version applied.
- Which actions are allowed next.

This lets coding agents and Cestus's own future agent recover intelligently instead of guessing.

## Testing And Verification

The ontology layer needs tests that protect replayability, auditability, and extensibility.

Core tests should verify that every event type validates against its contract, appends immutably, preserves causality, and can be replayed into deterministic projections.

Projection tests should cover full rebuilds, incremental updates, idempotency, lag recovery, failure recording, and schema-version changes.

Storage tests should run against SQLite first and, where practical, the same logical suite against Postgres so solo and team modes do not drift.

Domain pack tests are mandatory. A pack should include examples and fixtures that prove its entity types, relationship types, validation rules, mappings, migrations, and agent guidance are internally consistent. Cestus should reject or quarantine packs that fail validation.

Epistemic tests should verify:

- Assertions trace back to evidence or another explicit reasoning event.
- Claims distinguish support from contradiction.
- Accepted graph facts are reconstructible from assertion events.
- Investigation-local extensions do not leak into shared ontology scope without a promotion event.

AI-legibility tests should include contract examples and golden replay scenarios that generic coding agents can read as living documentation. The system should be able to answer: given this ledger, why does this graph edge exist, which projection produced it, and what evidence supports it?

## Approved Direction

The approved direction is an event-sourced ontology foundation. The first implementation should prioritize ledger contracts, replayability, projection rebuilds, extensible domain packs, provenance-first assertions, and AI-legible metadata before higher-level product features.
