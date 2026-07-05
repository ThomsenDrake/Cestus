# Security, Threat Model, And Data Governance Design

Date: 2026-07-05

## Purpose

This design covers the next independent Cestus development slice: durable security, threat-model, and data-governance requirements for an AI-powered accountability tool used by citizens, journalists, investigators, and civic groups.

Cestus already uses strict Zod event contracts, append-only in-memory and SQLite ledgers, content-addressed blob storage, evidence ingestion, evidence-backed assertion proposals, accepted-only graph projection, JSON-LD export, diagnostics, domain packs, and replayable PRR workflow events. Security and governance should extend that foundation rather than become a separate hidden subsystem.

The design target is a policy and acceptance-criteria spec that future implementation plans and child threads can use. It must be valuable immediately for local-first solo laptop mode while preserving a credible path to small newsroom or nonprofit team mode.

## Goals

- Ground security and governance in the existing append-only event ledger.
- Define testable invariants for threat modeling, data governance, source protection, and AI-agent autonomy.
- Support AI-applied evidence classification with human override.
- Use independent governance tags rather than a single sensitivity ladder.
- Allow high-confidence AI classifications to unlock normal workflows uniformly across tags.
- Keep outward-facing, irreversible, or high-risk actions behind explicit human approval gates.
- Support early LAN/tailnet sharing through local device or session approval and visible exposure diagnostics.
- Make public exports and reports default to public-safe evidence, with explicit user opt-in for sensitive or private tagged evidence.
- Preserve append-only removal semantics through tombstone, redaction, quarantine, supersession, or access-lock events.
- Give future coding agents explicit allowed behavior, forbidden behavior, review checks, and verification hooks.

## Non-Goals

- Implementing encryption, key management, credential vaulting, or device trust in this slice.
- Adding live credentials, OAuth setup, external services, or production mailboxes.
- Implementing role-based access control or a full team administration system.
- Designing public data ingestion connectors or taking over ingestion architecture.
- Refactoring the local runtime, UI adapter, or PRR workspace runtime wiring.
- Weakening append-only ledger semantics, provenance requirements, projection rebuildability, human-approved PRR send gates, or legal escalation locks.

## Approved Direction

The approved approach is a governance contract on the existing ledger.

Security and governance decisions are durable knowledge events or event-backed diagnostics. AI classifications, confidence, human overrides, network exposure changes, device approvals, export/report choices, quarantine or redaction decisions, incidents, and repairs are replayable. Projections derive current governance state from those events and never become hidden sources of truth.

The spec should define acceptance criteria first, plus only the minimum event vocabulary needed to make governance replayable. It should not introduce a broad security subsystem before the core ontology and PRR runtime surfaces need it.

## Governance Tags

Cestus should classify evidence with independent governance tags. A single artifact may carry many tags at once. Initial tag families should include:

- `public_record`: source material obtained from public records, public datasets, public websites, or public proceedings.
- `public_safe`: safe for default export or report inclusion under the active policy.
- `contains_pii`: contains personally identifying information.
- `source_identity`: may identify a confidential source, requester, witness, or vulnerable person.
- `private_correspondence`: contains private messages, mailbox content, or correspondence not intended for public release.
- `legal_risk`: may affect legal posture, escalation, privilege, defamation risk, or sensitive legal strategy.
- `credential_risk`: appears to contain secrets, tokens, passwords, private keys, session identifiers, or credential configuration.
- `export_restricted`: should be excluded from public-safe exports unless a user explicitly opts in.
- `law_enforcement_sensitive`: may include sensitive law-enforcement, victim, witness, investigatory, or tactical content.

Domain packs may define additional tags, but pack-defined tags must include descriptions, examples, counterexamples, default export behavior, and agent-facing guidance. Unknown tags must not silently unlock workflows.

## Classification Flow

Evidence enters Cestus through the existing evidence pipeline: large content goes to the content-addressed blob store, and the ledger records metadata, hash, source, actor, and causation.

After ingestion, a governance classifier, usually an AI agent, classifies the evidence. The classification records:

- evidence ID and content hash reference
- policy version
- classifier actor identity
- model, tool, or ruleset identity when applicable
- tags
- confidence per tag
- rationale
- source event and causation reference
- timestamp and correlation ID

High-confidence AI classification may unlock normal internal workflows uniformly across tags. The confidence threshold belongs to the active governance policy and should be visible in contracts. Low-confidence, failed, unsupported, or missing classification must default to conservative behavior until repaired or reviewed.

Human review is append-only. A person may affirm, add, remove, or supersede tags through a review event with rationale. Projections resolve current governance state by replaying evidence ingestion, AI classifications, human reviews, redaction or quarantine events, and policy version events. Human review supersedes prior AI classifications in projections without mutating history.

## Threat Model

The first threat model covers local-first solo laptop mode and early shared-trust LAN/tailnet mode.

Threat actors include:

- accidental user mistakes
- over-eager AI agents
- malicious or compromised local processes
- lost or stolen laptops
- unauthorized LAN/tailnet visitors
- compromised browser sessions
- mistaken public export or report generation
- credential leakage
- hostile public officials or agencies
- future malicious insiders in small-team mode

Misuse cases include:

- autonomous legal escalation
- unreviewed outward messages
- exposing source identities
- publishing PII or private correspondence
- relying on ungrounded AI assertions
- deleting evidence, events, or audit trails to clean up history
- hiding provenance in projections
- storing secrets in ledger events, diagnostics, evidence blobs, provider metadata, tracked files, or reports
- enabling LAN/tailnet exposure without visible state or local device approval

Mitigations should be testable through contracts, projections, diagnostics, and review gates rather than informal guidance.

## Local And Team Modes

Solo laptop mode remains the first deployment target. SQLite and local blob storage are acceptable, but they must preserve append-only semantics, content hashes, provenance, and rebuildable projections.

LAN/tailnet sharing is an expected early workflow. Network exposure must be explicit, visible, and auditable. Once enabled, a new device or browser session must receive local approval before it can read or write investigative data. Approval and revocation are append-only events.

Small newsroom or nonprofit team mode starts as shared trust with audit trails, not role-based authorization. Approved collaborators are trusted participants. Accountability comes from actor identity, approved device or session identity, append-only events, diagnostics, and reviewable projections.

Future role-based access control remains a path, but owner/editor/viewer/source-protection reviewer roles are not acceptance criteria for the first governance implementation.

## Hard Invariants

These invariants must hold across future implementation tasks:

- Ledger events are append-only. Corrections, supersessions, reviews, quarantines, redactions, tombstones, and repairs are new events.
- Product and agent workflows must not hard-delete ledger events, evidence blobs, projections, audit records, governance classifications, device approvals, or diagnostics.
- Removal semantics are represented only by append-only redaction, tombstone, supersession, quarantine, or access-lock events.
- Secrets must not be written to ledger events, evidence blobs, diagnostics, report metadata, tracked files, provider raw metadata, or factory claims.
- AI agents may classify evidence and unlock normal workflows at high confidence, but they may not erase provenance, override human decisions, forge human approval, or bypass export/report toggles.
- AI classification must not unlock PRR send, legal escalation, public export with sensitive/private opt-ins, destructive/tombstone actions, or LAN/tailnet device approval.
- Governance tags do not turn AI assertions into accepted facts. Accepted graph state and investigative claims still require evidence-backed assertion or explicit reasoning events.
- Current governance state, export eligibility, LAN exposure, device approval state, incident status, and repair state are projections rebuildable from ledger events.
- Diagnostics must be structured, inspectable, and secret-safe.

## Human Approval Gates

The following actions require explicit human approval events:

- initial PRR send and follow-up send
- legal escalation confirmation or legal-pressure language
- public export or report generation that opts into sensitive, private, source-protected, legal-risk, credential-risk, or otherwise restricted tagged evidence
- LAN/tailnet approval for a new device or session
- quarantine release
- redaction/tombstone/access-lock decisions
- incident repair closure
- human override of AI governance classification

Approval events must include actor identity, rationale where applicable, causation, correlation, policy version, and enough safe context for a future reviewer to understand what was approved.

## Export And Reporting Defaults

Exports and reports default to public-safe evidence only. Evidence must be projected as `public_safe` under the active governance policy before it is included by default.

Sensitive or private tagged evidence is excluded unless the user explicitly opts in through visible controls. Opt-in state should be captured in an export or report event when the artifact is generated for external sharing or durable publication. That event should record included evidence IDs or hashes, excluded restricted categories where practical, policy version, actor identity, and whether any sensitive/private opt-ins were selected.

Public-safe export projection must be rebuildable from the ledger. A report renderer must not infer public-safety from UI state alone.

## Minimal Event Vocabulary

Exact event names may change during implementation planning, but future work should cover these event families or equivalent contracts:

- `governance.policy.installed`: records active policy version, tag definitions, confidence thresholds, export defaults, and review expectations.
- `evidence.governance.classified`: records AI or system-applied tags, confidence, rationale, classifier identity, evidence references, and policy version.
- `evidence.governance.reviewed`: records human tag additions, removals, affirmations, supersessions, and rationale.
- `evidence.redaction.applied`: records redaction decisions and safe references to redacted artifacts or views.
- `evidence.quarantined`: records quarantine/access-lock decisions for evidence that should not participate in normal workflows.
- `evidence.tombstoned`: records append-only removal semantics without deleting source history.
- `network.exposure.enabled` and `network.exposure.disabled`: record LAN/tailnet exposure state, safe metadata, actor, and policy version.
- `device.session.approved` and `device.session.revoked`: record local approval or revocation for a LAN/tailnet device or browser session.
- `export.generated` or `report.generated`: records public-safe defaults, sensitive/private opt-ins, included evidence IDs or hashes, actor, and policy version.
- `incident.recorded` and `incident.repair.recorded`: records governance failures, suspected leaks, policy violations, repair steps, and diagnostics.

Every event must use strict Zod contracts, actor identity, causation/correlation IDs, policy/core versions, secret-safe payloads, and replayable projection semantics.

## Diagnostics And Incidents

Governance failures should become inspectable diagnostics or incidents. Important categories include:

- classification failed
- unsupported governance tag
- low classification confidence
- secret-bearing content detected
- public-safe export blocked
- sensitive/private export opt-in missing
- device approval required
- LAN/tailnet exposure active
- suspicious session or repeated approval failure
- quarantine/redaction conflict
- incident repair incomplete
- projection rebuild failure

Diagnostics must include repair hints and allowed next actions. They must not include secrets, raw private content, source identities beyond safe references, or raw message bodies. Incident and repair projections must be rebuildable from events.

## AI-Agent Boundaries

AI agents may:

- classify evidence with governance tags
- propose public-safe status when confidence meets the policy threshold
- propose quarantine, redaction, source-protection, or export restriction
- generate diagnostics and repair hints
- suggest report/export exclusions
- suggest incident repair steps
- run verifier and review checks defined by plans

AI agents must not:

- hard-delete events, blobs, projections, or audit history
- store secrets in durable artifacts
- forge or infer human approval
- override a human governance review
- approve new LAN/tailnet devices or sessions
- send PRR correspondence autonomously
- unlock legal escalation autonomously
- include sensitive/private evidence in public exports without user opt-in
- treat governance tags as accepted investigative facts

## Testing And Verification Hooks

Future implementation plans should include focused tests for:

- strict event contracts and unknown-key rejection
- governance tags, confidence thresholds, and unsupported tag rejection
- AI classification unlocking normal workflows at high confidence
- low-confidence or missing classification preserving conservative locks
- human review superseding AI classification in projections
- no hard-delete product or agent paths
- secret-looking keys and text rejected from events, diagnostics, raw metadata, reports, and claims
- public-safe export projection excluding restricted evidence by default
- export/report events recording sensitive/private opt-ins
- LAN/tailnet exposure state requiring local device/session approval
- incident and repair diagnostics avoiding secret leakage
- projection rebuilds from golden governance ledger fixtures

Reviewers should fail changes that:

- introduce hard deletes or mutable governance state
- hide provenance in projections
- store secrets in diagnostics or raw metadata
- treat governance tags as accepted graph facts
- unlock send or legal escalation through AI classification
- expose LAN/tailnet mode without visible state
- allow unapproved devices or sessions to read/write investigative data
- export sensitive/private evidence without explicit user opt-in
- bypass append-only review or override semantics

## Suggested First Implementation Slice

The first implementation plan should likely begin with policy/tag contracts, AI classification and human review event contracts, a governance projection, and public-safe export-filter semantics.

Network exposure events, device/session approval, incident/repair events, and deeper local runtime enforcement can follow as separate tasks. Encryption/key management, live credentials, full team auth, and ingestion connector design remain out of scope until explicitly approved.

## Acceptance Criteria

The design is ready for implementation planning when a future plan can assign small tasks with:

- allowed files
- exact validation commands
- failing tests before production changes
- no runtime/ingestion ownership collision
- append-only event semantics
- provenance and causation requirements
- secret-safe diagnostics
- explicit human approval gates
- projection rebuild tests
- review checks for invariant violations

Implementation must stop on data-loss risk, schema conflict, credential need, external-service dependency, unavailable dependency, or repeated verifier failure.
