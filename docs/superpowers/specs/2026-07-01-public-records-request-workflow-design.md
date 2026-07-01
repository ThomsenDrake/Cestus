# Public Records Request Workflow Design

Date: 2026-07-01

## Purpose

This design covers the second Cestus build slice: a public records request workflow for tracking requests, correspondence, deadlines, fees, productions, denials, appeals, and escalation readiness. The first deployment target is a single investigator laptop, while preserving a direct path to a small newsroom or nonprofit team.

Cestus should help citizens, journalists, and civic organizations manage high-volume public records work without losing provenance. The PRR workflow must therefore use the existing append-only ontology ledger style: actions append events, projections build current tracker views, and evidence remains content-addressed and replayable.

## Goals

- Make the public records request lifecycle the next usable product spine.
- Track requests across agencies, contacts, jurisdictions, deadlines, correspondence, fees, productions, exemptions, denials, appeals, and closeout.
- Support real email integration in v1 through Gmail, IMAP/SMTP, and Himalaya CLI.
- Allow human-approved one-click send from Cestus without requiring manual copy and paste.
- Ship starter jurisdiction packs for US Federal FOIA and Florida Public Records.
- Use internal deadline estimates by default for reminders and routine follow-ups.
- Require user confirmation before legal-escalation language is unlocked.
- Ingest correspondence, attachments, and productions as evidence with hashes and request linkage.
- Define an assertion extraction queue contract for produced records without making full document intelligence part of this slice.
- Keep backend/domain work highly legible to generic coding agents and future Cestus agents.

## Non-Goals

- Full autonomous legal negotiation.
- Autonomous sending without human approval.
- Legal advice or definitive legal deadline guarantees.
- Full document content extraction from productions.
- A polished UI built through autonomous factory execution.
- Multi-tenant newsroom administration.
- A Postgres team-mode adapter, unless the implementation plan finds it necessary for a small shared interface boundary.

## Approved Direction

The approved approach is Lifecycle Core First. PRR v1 is an evented domain package and backend workflow that sits beside the ontology package. It provides request lifecycle state, jurisdiction packs, correspondence adapters, read projections, evidence linkage, and API boundaries. The UI is scoped as a collaborative product track: the spec may define UI-facing data contracts and expected screens, but full UI design and build should happen with the user directly involved.

## Relationship To The Ontology Layer

The ontology layer remains the source of durable knowledge primitives:

- append-only in-memory and SQLite event ledgers
- strict Zod event validation
- content-addressed blob storage
- evidence ingestion
- evidence-backed assertion proposal and acceptance
- accepted-only graph projection
- domain pack governance
- diagnostics as structured inspectable state

The PRR workflow must not weaken those invariants. It may introduce PRR-specific event contracts and projections, but request state must remain replayable from events. PRR artifacts that are source material should enter the evidence system rather than being stored only in request-specific tables.

## Architecture

The first PRR implementation should be organized around five backend/domain modules:

- Lifecycle domain: request aggregate, statuses, agency/contact references, deadlines, fees, productions, appeals, and allowed transitions.
- Jurisdiction packs: US Federal FOIA and Florida Public Records starter packs with deadline rules, guidance, templates, citations, and agent instructions.
- Correspondence adapters: Gmail, IMAP/SMTP, and Himalaya behind one provider-neutral contract.
- Evidence bridge: message bodies, sent requests, replies, attachments, productions, denials, fee letters, and appeal artifacts become evidence when useful for audit or downstream investigation.
- Read/API boundary: projections expose request queue rows, request detail state, timeline entries, deadline state, correspondence summaries, production batches, and review gates to the UI.

The canonical state is the event ledger. The UI, reminder views, queue filters, request detail pages, and sync status pages are projections. If a projection is corrupted, stale, or reshaped, Cestus must be able to rebuild it from the PRR and ontology events.

## Lifecycle Model

A request aggregate has a stable `prrRequestId`. It records:

- jurisdiction pack name and version
- agency identity and contact references
- requester identity
- request text and request scope
- delivery channel
- selected correspondence adapter
- tags and investigation links
- agency tracking numbers
- current projected status
- deadline state
- stalling and escalation review state

Primary projected statuses are:

- `draft`
- `sent`
- `acknowledged`
- `inNegotiation`
- `awaitingProduction`
- `partiallyProduced`
- `produced`
- `denied`
- `appealed`
- `closed`

Projected flags include:

- `overdue`
- `possibleStalling`
- `confirmedStalling`
- `legalEscalationReady`
- `needsHumanReview`

The first event catalog should include:

- `prr.request.created`
- `prr.request.sent`
- `prr.correspondence.received`
- `prr.followup.drafted`
- `prr.followup.sent`
- `prr.deadline.estimated`
- `prr.deadline.confirmed`
- `prr.fee.estimated`
- `prr.fee.challenged`
- `prr.scope.narrowing.proposed`
- `prr.scope.narrowing.accepted`
- `prr.production.received`
- `prr.exemption.claimed`
- `prr.denial.recorded`
- `prr.appeal.created`
- `prr.stalling.detected`
- `prr.stalling.confirmed`
- `prr.legal-escalation.confirmed`
- `prr.request.closed`

Implementation planning may split or rename events for clearer contracts, but the final catalog must preserve replayability, provenance, actor identity, causation, correlation, request linkage, and strict payload validation.

## Deadline Model

Deadline handling uses a dual track:

- Estimated deadlines are produced by jurisdiction packs and operate by default for reminders, queue prioritization, and routine follow-up suggestions.
- Confirmed deadlines are user-reviewed confirmations or overrides. They take precedence when present.

Legal escalation is a separate gate. Before Cestus drafts or sends language that threatens legal action, the request must have:

- a confirmed deadline basis or a user-confirmed stalling basis
- a cited jurisdiction rule or cited pack guidance
- evidence of the relevant correspondence history
- user confirmation that escalation is appropriate

Routine reminders and polite follow-ups may run from estimated deadlines. Legal-pressure language may not.

## Stalling Model

Cestus should detect possible stalling but not declare legal judgment on its own. The system can produce `possibleStalling` from signals such as:

- estimated or confirmed deadline passed without an adequate response
- repeated vague delay messages
- silence after a follow-up
- fee estimates that look unusually high for the request context
- narrowing demands that appear to erase the request's purpose
- repeated tolling or extension claims
- denial or exemption language that needs review

These signals create inspectable state and can prompt review. A user must confirm stalling before legal escalation becomes available.

## Jurisdiction Packs

The PRR slice ships two starter packs.

### US Federal FOIA Pack

The federal pack should model the 20-working-day determination clock and related extension, tolling, fee, exemption, denial, and appeal guidance from 5 U.S.C. 552. It should treat statutory date estimates as high confidence when request receipt date and tolling state are known.

Official source for initial pack drafting:

- https://www.justice.gov/oip/freedom-information-act-5-usc-552

### Florida Public Records Pack

The Florida pack should model Chapter 119 public records behavior. Florida does not use one universal fixed response-day deadline in the same way as federal FOIA. The pack should therefore produce operational estimates and stalling heuristics labeled as workflow estimates, with citations to prompt access and good-faith response obligations.

Official sources for initial pack drafting:

- https://www.flsenate.gov/laws/statutes/2025/119.07
- https://www.myfloridalegal.com/open-government/citizens

### Pack Contract Requirements

Each jurisdiction pack should include:

- stable pack ID and version
- jurisdiction scope
- rule descriptions
- calculator inputs and outputs
- confidence labels
- tolling and extension triggers
- fee guidance
- exemption and denial guidance
- appeal or enforcement paths
- template clauses with citations
- examples and counterexamples
- agent-facing warnings about overclaiming

Pack output must be inspectable. A generic coding agent should be able to explain why a deadline was estimated, which rule produced it, what inputs were used, and whether a user confirmed it.

## Correspondence And Email

The correspondence layer supports three v1 paths behind a shared `CorrespondenceAdapter` contract:

- Gmail adapter: Cestus-managed OAuth, one-click send after human approval, inbound thread sync, attachment capture, provider IDs, and sent-message verification.
- IMAP/SMTP adapter: direct provider support using configured host, port, TLS mode, and local secret references.
- Himalaya adapter: invokes the user's configured Himalaya CLI profile, detects version and capabilities, asks for structured output where available, and emits diagnostics when command shape or account config is incompatible.

Current Himalaya source for adapter design:

- https://github.com/pimalaya/himalaya

The adapter contract should cover:

- capability discovery
- account identity
- send preview inputs
- human-approved send
- inbound sync
- thread/message lookup
- attachment fetch
- idempotency keys
- provider raw metadata capture
- structured failure diagnostics

Outgoing mail flow:

1. Cestus drafts from a template or user text.
2. User reviews final body, recipients, subject, attachments, and cited rules.
3. User clicks send.
4. Adapter sends the message.
5. Cestus appends a sent correspondence event with provider IDs, content hash, rendered body hash, attachment evidence IDs, actor, timestamp, and causation reference.

There is no autonomous send in v1.

Inbound sync flow:

1. Adapter discovers new messages or thread updates.
2. Cestus matches messages to requests by provider IDs, addresses, subject, tracking numbers, and references.
3. Confident matches append received correspondence events.
4. Uncertain matches enter review state.
5. Attachments and useful raw message representations enter the evidence bridge.

Adapter failures must become diagnostics, not silent logs.

## Credential Handling

Credential handling is provider-specific:

- Gmail OAuth tokens are managed by Cestus and stored outside the ledger and repository in a local credential store.
- IMAP/SMTP credentials are referenced through approved local secret mechanisms such as OS keychain, pass-compatible stores, or environment-provided secret references.
- Himalaya credentials and account configuration remain owned by Himalaya; Cestus invokes configured profiles and records only non-secret adapter metadata.

No OAuth token, password, app password, refresh token, private key, or session secret may be written to the event ledger, tracked files, diagnostics, or evidence blobs.

## Evidence Bridge

Every outgoing request, sent follow-up, received reply, attachment, production file, fee estimate, denial letter, appeal artifact, and agency tracking message may become evidence. Large bodies and files go through the content-addressed blob store. The ledger records metadata, hashes, source information, message IDs, request IDs, and causation links.

PRR v1 extracts operational metadata only:

- provider message and thread IDs
- sender and recipient identity
- sent and received timestamps
- filenames
- media types
- sizes
- content hashes
- production batch labels
- request linkage
- fee amount, date, and source artifact
- exemption citations
- denial and appeal markers
- agency tracking numbers

The workflow defines an `AssertionExtractionQueue` contract. Queue items point to evidence IDs, request IDs, jurisdiction packs, suggested extraction mode, priority, and source metadata. The ingestion pipeline can consume these queue items in its own slice. Nothing extracted from production content becomes accepted graph knowledge without the existing evidence-backed assertion proposal and review flow.

## Projections And Read Models

PRR projections should be deterministic and rebuildable. Initial read models should include:

- request queue rows
- request detail state
- correspondence timeline
- deadline state
- stalling and escalation readiness state
- fee issue state
- production batch state
- evidence linkage state
- inbox match review queue
- adapter sync diagnostics

Projection code must quarantine invalid or unrecognized events with diagnostics rather than silently inventing request state. Diagnostic events should include repair hints where possible.

## UI Boundary

The PRR spec defines UI-facing data contracts and expected screens, but full UI design and development are outside autonomous factory scope.

Expected screens for the collaborative UI track:

- request queue
- request detail
- compose, review, and send
- inbox match review
- deadline panel
- stalling and escalation review
- production intake

Factory agents may create a minimal shell or stubs only when needed to exercise backend contracts. Product layout, interaction design, visual hierarchy, copy tone, and workflow ergonomics should be designed with the user directly involved.

## Storage And Scale

Solo mode should use SQLite and local blob storage. Request events, adapter sync checkpoints, and projections should be designed so a Postgres-backed team mode can satisfy the same logical contracts.

The design target is:

- one investigator laptop with many active requests and many productions
- small newsroom or nonprofit team with shared request queues and multiple reporters
- no dependency on the UI as the business logic owner

Adapter sync must be idempotent. Sending must use idempotency keys so retries do not create duplicate outbound messages without detection.

## Error Handling

Failures should create structured diagnostic state. Important diagnostic categories include:

- invalid PRR event payload
- illegal lifecycle transition
- deadline rule missing required input
- jurisdiction pack conflict
- adapter capability mismatch
- OAuth failure
- IMAP/SMTP authentication failure
- Himalaya command failure
- inbound message match ambiguity
- attachment ingestion failure
- projection rebuild failure
- legal escalation gate failure

Diagnostics should include relevant request IDs, event IDs, provider IDs, violated contract paths, and allowed next actions. They must not include secrets.

## Testing

Test coverage should protect:

- strict PRR event contracts and unknown-key rejection
- request lifecycle transition rules
- deadline calculators for US Federal FOIA and Florida workflow estimates
- estimated versus confirmed deadline behavior
- legal-escalation gate requirements
- stalling signal detection versus user confirmation
- Gmail, IMAP/SMTP, and Himalaya adapter contracts using fakes
- one-click send audit trail after human approval
- inbound sync and uncertain-match review behavior
- evidence ingestion and linkage for messages, attachments, and productions
- extraction queue contract without accepted graph assertions
- projection rebuild determinism from a golden PRR ledger fixture

Live credentials and external mailboxes are not required for standard test runs. Adapter contract tests should use fakes, fixtures, and command runners that can be simulated deterministically.

## Software Factory Execution

The PRR backend/domain track should run as a true AI software factory. Signals from user decisions, defects, review findings, and design changes become work orders. Each work order should have:

- one measurable outcome
- files allowed to change
- required reading
- failing test first
- targeted failing command
- production change
- targeted passing command
- `npm run verify`
- commit
- reviewer handoff
- stop conditions

Implementation plans must be legible to a fresh Codex, Claude Code, Opencode, or future Cestus agent without relying on chat history. Plans should include progress, decisions, surprises, verification evidence, and retrospective notes.

Worker agents should claim tasks through durable repo files. Reviewer agents lead with defects, missing tests, unsafe schema drift, weak provenance, and verifier gaps. Gatekeeper checks should verify typecheck, tests, and factory readiness.

Autonomous factory scope includes:

- backend/domain event contracts
- lifecycle services
- jurisdiction pack contracts and starter packs
- adapter contracts and fakes
- projections and read APIs
- evidence bridge
- extraction queue contract
- diagnostics

Autonomous execution stops on:

- real mailbox credentials
- live OAuth setup
- production legal language
- schema conflict
- data-loss risk
- repeated verifier failure
- UI design or build decisions
- changes that weaken append-only ledger semantics, provenance, or projection rebuildability

## Sources And Operating References

Legal and provider references:

- US Federal FOIA statute text via DOJ: https://www.justice.gov/oip/freedom-information-act-5-usc-552
- Florida Statutes Chapter 119 access provision: https://www.flsenate.gov/laws/statutes/2025/119.07
- Florida Attorney General public records citizen guide: https://www.myfloridalegal.com/open-government/citizens
- Himalaya CLI repository: https://github.com/pimalaya/himalaya

Software-factory references already captured in the ontology implementation plan:

- Steipete, "Just Talk To It": https://steipete.me/posts/just-talk-to-it
- Steipete, "Essential Reading for AI Coding": https://steipete.me/posts/2025/essential-reading
- Factory AI, "Software Factory": https://factory.ai/news/software-factory
- Factory AI, "Missions Architecture": https://factory.ai/news/missions-architecture
- OpenAI Codex best practices: https://developers.openai.com/codex/learn/best-practices
- OpenAI Codex execution plans: https://developers.openai.com/cookbook/articles/codex_exec_plans
- Anthropic Claude Code best practices: https://code.claude.com/docs/en/best-practices
- Anthropic Claude Code hooks: https://code.claude.com/docs/en/hooks
