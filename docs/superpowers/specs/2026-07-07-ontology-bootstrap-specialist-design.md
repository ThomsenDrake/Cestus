# Ontology Bootstrap Specialist Design

Date: 2026-07-07

## Purpose

The `ontology-bootstrap` specialist is the resident Cestus Agent workflow that helps a solo investigator bootstrap a fresh Cestus ontology from old-Cestus artifacts that have already entered the new workspace as evidence or legacy migration reports.

The specialist is not a migration importer. It is a zero-trust review funnel over existing ingestion, legacy import, ontology, resident-agent, local-runtime, and operator-status contracts. Old Cestus files, folder names, tags, notes, graph exports, derived metadata, and prior ontology structure are evidence or clues only. They can help the resident agent ask better questions and organize review, but they never become accepted ontology truth directly.

Critical invariant: legacy-derived structure can at most produce `assertion.proposed` with exact evidence IDs, content hashes, report identity, candidate-set identity, and staging approval provenance. It cannot produce `assertion.accepted`, `entity.resolved`, `relationship.accepted`, accepted merge or split events, domain-pack promotion, legal escalation, export, or publication.

## Goals

- Turn existing legacy migration reports, imported evidence summaries, quarantine entries, and staging candidates into an operator-friendly bootstrap dossier.
- Preserve zero-trust legacy import semantics: old artifacts are evidence first, and old ontology structure is only a source of proposed, evidence-tied review work.
- Orchestrate existing legacy runtime commands and services through resident-agent tool requests rather than building a parallel importer or staging service.
- Help the operator review evidence inventory, parser confidence, quarantine reasons, candidate assertions, candidate entities, candidate relationships, missing-context questions, and the next safe review action.
- Support incremental implementation through small phases: read existing reports, build dossiers, ask review questions, suggest local ontology extensions, request staging approval, stage approved assertion proposals, and record safe memory about caveats and gaps.
- Keep every output rebuildable from append-only ledger events and content-addressed report or dossier artifacts.
- Keep model providers optional. The first implementation can use deterministic fake dossier generation over existing reports without live AI orchestration.
- Preserve portable workspace compatibility and a path from solo investigator mode to team mode through actor-bound approvals and append-only event trails.

## Non-Goals

- Replacing `LegacyImportRuntime`, `LegacyCestusInspector`, `LegacyMigrationReportService`, `LegacyOntologyStagingService`, ingestion runtime gates, or ontology assertion services.
- Re-parsing old-Cestus source trees directly from the browser or agent UI.
- Inferring accepted investigations, entities, relationships, claims, folder boundaries, or ontology packs from old folder layout or graph exports.
- Running provider parsing, external byte transfer, PRR sends, legal escalation, publication, export, or destructive repair.
- Adding user-specific legacy format plugins without representative sanitized samples and a focused implementation plan.
- Requiring the resident-agent foundation branch to have landed before the design is useful.

## Existing Contracts To Compose

The specialist should compose these existing contracts rather than own their semantics:

- `legacy.import.report.generated` records a content-addressed migration report and candidate set for a read-only old-Cestus inspection batch.
- `legacy.ontology.staging.approved` records human approval for selected evidence-tied legacy candidates and permits only later `assertion.proposed` events.
- `ingestion.import.approved`, `ingestion.import.completed`, and `ingestion.evidence.linked` preserve raw import approval, stale-source verification, evidence creation, and source-to-evidence links.
- `LegacyMigrationReport` includes inspected files, detections, proposed assertion candidates, quarantine entries, `reportHash`, `candidateSetHash`, totals, generator identity, and recommended next actions.
- `LegacyMigrationReviewDto` exposes source collection identity, latest report identity, raw import approval need, staging approval state, first artifact ask, and diagnostics.
- `LegacyImportRuntime` already owns `inspect`, `report`, `quarantine`, `approveRawImport`, `importApproved`, `stagingPreview`, `approveStaging`, and `stageApproved`.
- `LegacyOntologyStagingService` preflights evidence existence and content-hash matches before appending any `assertion.proposed`.
- Operator status exposes the legacy-import section as a browser-safe readiness DTO with inert safe actions.
- The resident-agent design defines `agent.specialist-run.*`, tool requests, memory, model invocation audit, approval hash binding, and one default resident agent identity.

Current worktree note: `packages/agent` is not present in this branch. This design names resident-agent contracts from the approved foundation plan, but the specialist can be planned and reviewed before that foundation implementation is merged.

## Specialist Role

`ontology-bootstrap` is a run type under the default resident agent identity, not a separate agent persona.

The specialist may:

- Read safe legacy migration review DTOs, report artifacts, ingestion projections, evidence summaries, ontology pack summaries, and operator-status readiness.
- Build a bootstrap dossier as a local derivative artifact tied to report hashes, candidate-set hashes, evidence IDs, and source event IDs.
- Group review batches by evidence source, parser confidence, predicate, subject reference, quarantine reason, and missing context.
- Ask import-review questions when evidence, samples, report identity, raw import approval, or staging approval is missing.
- Request existing legacy runtime tool actions through approval-bound tool requests.
- Suggest investigation-local ontology extensions for human review.
- Request staging approval for selected eligible candidates.
- Request staging execution only after matching human approval exists.
- Record memory about caveats, unsupported formats, operator preferences, and evidence gaps.

The specialist must not:

- Read or mutate the old source tree outside the existing legacy runtime inspection path.
- Bypass raw import approval, stale-source verification, or staging approval.
- Append accepted graph events or accepted resolution events.
- Treat legacy candidate entities or relationships as graph state.
- Store raw old-Cestus text, secrets, private document bodies, or source-sensitive excerpts in memory, diagnostics, browser DTOs, or tracked docs.
- Approve its own tool requests.
- Treat memory as ontology truth.

## Inputs

The specialist accepts a scoped launch request with these references:

- workspace ID and mounted workspace readiness state
- source collection ID for the old-Cestus source
- optional scan batch ID
- optional legacy report ID
- optional import batch ID
- optional staging batch ID
- optional investigation scope or local ontology extension scope
- operator-provided goal, such as "bootstrap this archive for review"
- selected evidence IDs, candidate IDs, or quarantine IDs when narrowing a review batch

Required data comes from safe projections and artifacts:

- `LegacyMigrationReviewDto`
- selected `LegacyMigrationReport` artifact, verified against `legacy.import.report.generated`
- ingestion projection evidence links for the source collection
- evidence metadata and content hashes, not raw document bodies by default
- quarantine entries and parser diagnostics
- ontology pack summaries and existing accepted graph projection, only as context for avoiding duplicate proposals
- resident-agent task, run, tool request, approval, memory, and lock projections when available

If the required report identity, report artifact, source collection, or workspace mount is missing, the run blocks with a safe question or tool request. It does not guess from file paths or old graph exports.

## Outputs

The main output is a bootstrap dossier. It should be content-addressed and referenced by agent run events or legacy-readable derivative metadata once the resident-agent contracts exist.

The dossier contains:

- source collection, scan batch, report ID, report hash, candidate-set hash, and generated-at metadata
- evidence inventory grouped by source path, content hash, media type, duplicate status, and imported evidence ID when available
- parser and detector confidence summary by plugin, shape, and source path
- quarantine summary grouped by issue category, affected legacy IDs when safe, and allowed review action
- eligible assertion candidates grouped into small review batches
- candidate entity and relationship notes clearly labeled as report-only review material
- missing-context questions and requested sample artifacts
- suggested investigation-local ontology extensions with rationale and examples
- staging readiness summary showing which candidates are evidence-tied and which are blocked
- exact next safe action, such as inspect, review report, approve raw import, run raw import, preview staging, approve selected staging candidates, or stage approved proposals
- provenance map from every candidate to report hash, candidate-set hash, source path, evidence content hash, evidence ID when present, and source event IDs when known

Allowed ledger effects are narrow:

- agent task and run lifecycle events when resident-agent foundation contracts are available
- agent tool request, approval, completion, and failure events
- agent memory events for caveats and gaps
- existing ingestion and legacy runtime events created only by their owning services
- `assertion.proposed` events created only by `LegacyOntologyStagingService` after matching staging approval

No accepted ontology events are produced by this specialist.

## Phase Flow

### Phase 1: Readiness And Report Intake

The specialist reads operator status and the legacy migration review DTO. It determines whether the workspace is mounted, a report exists, raw import approval is pending, raw import has completed, staging preview is possible, and staging approval exists.

If no report exists, the specialist asks for the first artifact set or requests the existing `legacy inspect` tool. The artifact ask is the existing list: read-only folder tree listing, two to five sanitized metadata or ontology samples, and any old manifest, index, registry, or graph export file.

### Phase 2: Bootstrap Dossier Draft

The specialist loads the selected report artifact and verifies it against the ledger summary. It creates a deterministic dossier draft from report data, evidence links, parser confidence, quarantine entries, and safe ontology context.

The draft is local derivative state. It does not create evidence, assertions, accepted graph state, or staging approval.

### Phase 3: Review Questions

The specialist asks focused operator questions when the dossier reveals missing context. Questions should be answerable without exposing secrets or raw private content. Examples:

- Which source collection should be treated as the active old-Cestus import?
- Are these duplicate source paths expected duplicates or signs of stale export layout?
- Should these quarantine categories be ignored, inspected manually, or used to request a parser plugin?
- Which candidate batch should move to staging review?
- Is this local ontology extension useful for this investigation, or should candidates use existing predicates only?

Operator answers become agent run steps or memory items with source references. They do not become accepted ontology state.

### Phase 4: Local Ontology Extension Suggestions

When report observations do not fit existing predicates, the specialist may suggest investigation-local extension candidates. Suggestions are review material with examples and counterexamples.

The specialist may not install, promote, or migrate ontology packs in this workflow. Any extension creation or promotion needs the normal ontology governance path and a separate human-reviewed implementation plan.

### Phase 5: Staging Approval Request

The specialist builds a staging approval preview for selected evidence-tied candidates. The preview must include exact candidate IDs, report hash, candidate-set hash, evidence IDs, evidence content hashes, source paths, confidence, predicates, objects, subject references, quarantine exclusions, and the effect limit: selected candidates can only become `assertion.proposed`.

The approval request is a resident-agent tool request with side-effect class `ledger-review` or the resident-agent foundation's nearest approved class. Approval must bind the exact preview hash and human actor.

### Phase 6: Approved Staging Execution

After matching `legacy.ontology.staging.approved` exists, the specialist may request the existing legacy runtime to stage approved assertions. The staging service preflights evidence existence, content hashes, selected candidate IDs, and candidate-set hash.

The only successful ontology output is one or more `assertion.proposed` events. A zero-proposal result, missing evidence, stale candidate set, or unexpected accepted event is a failure.

### Phase 7: Memory And Follow-Up

The specialist records safe memory about:

- unsupported formats
- quarantine caveats
- preferred grouping style for review batches
- operator decisions about ignored categories
- parser/plugin gaps
- evidence gaps
- local ontology vocabulary under consideration

Memory must include source event IDs or artifact hashes and must not include accepted fact claims. If memory mentions "Vendor X appears related to Agency Y," it must label that as an unresolved review caveat and point to the evidence or candidate, not as graph truth.

## Tool Requests

The specialist should use typed tool requests. The exact IDs can be refined by implementation, but the first vocabulary should stay close to existing legacy commands:

| Tool request | Existing owner | Side effect | Approval |
| --- | --- | --- | --- |
| `legacy.artifact-ask.read` | ingestion legacy types | read-only | none |
| `legacy.review.read` | legacy read API | read-only | none |
| `legacy.report.read` | `LegacyImportRuntime.report` | read-only | none |
| `legacy.quarantine.read` | `LegacyImportRuntime.quarantine` | read-only | none |
| `legacy.inspect.request` | `LegacyImportRuntime.inspect` | local derivative and ledger report events | human approval when source path or new scan is operator-selected |
| `legacy.raw-import.approval.request` | ingestion runtime | ledger review | human approval |
| `legacy.raw-import.execute` | ingestion runtime | ledger and blob write | prior raw import approval |
| `legacy.staging-preview.read` | `LegacyImportRuntime.stagingPreview` | read-only | none |
| `legacy.staging.approval.request` | `LegacyOntologyStagingService.approveStaging` | ledger review | human approval bound to candidate preview |
| `legacy.staging.execute` | `LegacyImportRuntime.stageApproved` | ledger proposal | prior staging approval |
| `ontology.local-extension.suggest` | agent dossier | local derivative | none |
| `agent.memory.record-caveat` | resident agent memory | ledger memory | policy governed |

The browser UI should show these as requests and previews, not as hidden execution buttons. Risky or state-changing requests must require exact preview hashes and human actors.

## Event Flow

A complete successful flow is:

1. Human or system creates an agent task for `ontology-bootstrap`.
2. Agent starts `agent.specialist-run.started` with run type `ontology-bootstrap` and input references.
3. Agent reads operator status and legacy review DTOs.
4. If no report exists, agent requests artifact ask or `legacy.inspect.request`.
5. Existing legacy runtime appends source, scan, occurrence, and `legacy.import.report.generated` events as applicable.
6. Agent records a dossier draft artifact and `agent.specialist-run.step.recorded` with the dossier hash.
7. Agent requests raw import approval when report review is complete and raw evidence is not imported.
8. Existing ingestion runtime appends `ingestion.import.approved` after human approval.
9. Existing ingestion runtime executes raw import, stale-source checks, evidence creation, and evidence links.
10. Agent reads staging preview and builds selected candidate approval preview.
11. Human approves selected candidates through `legacy.ontology.staging.approved`.
12. Agent requests staging execution through the existing legacy runtime.
13. Existing staging service appends only `assertion.proposed` for approved evidence-tied candidates.
14. Agent records safe memory about caveats and completes the specialist run with dossier, proposal event IDs, and next review actions.

Every step must remain replayable from ledger events and content-addressed artifacts. Projections can be rebuilt without reading the old source tree after raw import and report storage.

## Gates And Approval Boundaries

Raw import approval:

- Requires a human actor.
- Allows byte copy into the portable workspace and evidence events through ingestion runtime.
- Does not stage ontology assertions.

Staging approval:

- Requires a human actor.
- Binds selected candidate IDs, report hash, candidate-set hash, source collection, scan batch, staging batch, and preview hash.
- Allows only `assertion.proposed`.
- Does not accept assertions, resolve entities, accept relationships, promote packs, export, or publish.

Agent tool approval:

- Requires exact preview hash binding for any state-changing action.
- Fails closed when the preview changes, source bytes change, candidate set changes, approval expires, or the actor is not human.
- The resident agent cannot approve its own requests.

Legal, export, publication, provider byte transfer, and destructive repair:

- Are out of scope for this specialist.
- If encountered, activate or respect existing locks and stop with a safe diagnostic.

## Memory Behavior

Memory is for operational continuity, not truth.

Allowed memory:

- "The latest bootstrap dossier for `src_old_cestus` had 12 unsupported YAML records."
- "The operator prefers review batches grouped by source path, then predicate."
- "Legacy graph export `ev_...` had relationship-like records, but no approved relationship event exists."
- "Parser `legacy-json-claim-parser@0.1.0` only recognizes explicit `legacyCestusType: claims` records."

Forbidden memory:

- "Agency A contracts with Vendor B" unless recorded as a caveat tied to a candidate or evidence reference.
- Raw document bodies, secrets, credentials, private notes, or source-identifying sensitive excerpts.
- Accepted graph conclusions.
- Hidden copies of old ontology structure without source artifact hashes.

Memory records should include scope, source event IDs or artifact hashes, confidence or review state, optional expiry, and resident actor ID. Supersession and retraction are append-only memory events.

## Failure States

The specialist must surface failures as safe, inspectable states:

- `workspace-unavailable`: portable workspace cannot be read or mounted.
- `legacy-report-required`: no migration report exists for the source.
- `legacy-report-mismatch`: stored report artifact does not match ledger summary.
- `legacy-source-required`: source root is not readable through the existing legacy runtime.
- `raw-import-approval-required`: raw import has not been approved.
- `raw-import-stale-source`: source changed after approval; no blob writes should occur.
- `evidence-link-required`: staging candidate has no imported same-source evidence link.
- `candidate-set-mismatch`: selected candidates no longer match the current evidence-tied candidate set.
- `staging-approval-required`: staging execution was requested before human approval.
- `accepted-event-forbidden`: any staging path attempted an accepted graph event.
- `secret-detected`: memory, diagnostic, dossier text, or tool preview contains secret-shaped text.
- `projection-lag`: required read model is stale or failed.
- `provider-unavailable`: optional model provider cannot be used; deterministic fake or no-model fallback can still build basic dossiers.
- `plugin-sample-needed`: a format needs representative sanitized samples before a recognizer or parser can be designed.

Allowed repair actions should name existing safe commands or review surfaces, such as review legacy report, inspect quarantine, approve raw import, run raw import, rerun staging preview, approve only listed candidate IDs, or create a focused parser-plugin plan.

## UI And Operator Review Needs

The operator experience should be a review funnel, not a batch migration wizard.

Primary surface: an Agent or Command cockpit view showing an `ontology-bootstrap` run with:

- current phase and readiness
- selected source collection and report identity
- bootstrap dossier link or preview
- evidence inventory counts
- parser confidence and plugin summary
- quarantine category counts and reasons
- candidate batches with evidence IDs and content hashes
- report-only entity and relationship notes clearly separated from assertion candidates
- missing-context questions
- suggested local ontology extensions
- pending tool requests and approval previews
- next safe action

The UI should not expose direct buttons for accepted graph review, PRR send, legal escalation, export, provider byte transfer, destructive repair, or hidden staging execution. Any state-changing action appears as a tool request with an exact preview.

Review batches should be small enough for a solo investigator to inspect. Suggested grouping:

- high-confidence assertion candidates with imported evidence
- medium-confidence candidates needing operator review
- unsupported or malformed metadata
- stale references
- duplicate legacy IDs or conflicting values
- candidate entity and relationship notes held in report-only state
- local extension suggestions

Team mode should reuse the same DTOs and events while adding role-aware human actors for approvals.

## Plugin Extensibility

Legacy format understanding stays plugin-like:

- Recognizers and parsers contribute observations, confidence, warnings, quarantine entries, and diagnostics.
- Plugins do not own review workflow, staging approval, assertion proposal execution, memory, or accepted graph state.
- The specialist owns dossier organization, review questions, local extension suggestions, and provenance binding across plugin outputs.
- User-specific plugins require sanitized samples and tests that prove deterministic output, secret-safe diagnostics, and no accepted graph events.

Plugin observations should remain neutral: possible claim, possible entity, possible relationship, possible property, candidate entity resolution, candidate relationship, stale reference, malformed record, or unknown field. Entity and relationship material remains report-only until a separate approved candidate-event contract exists.

## Composition With Resident-Agent Foundation

This design composes with the resident-agent foundation but does not require it to be merged first.

Before foundation exists, the specialist can be represented as documentation, plan tasks, fake dossier tests, and legacy runtime read-model code. Tool requests can be modeled as DTO previews and explicit service calls in tests.

After foundation exists, the specialist should use:

- `agent.task.created` and `agent.task.status.changed` for user requests
- `agent.specialist-run.started`, `agent.specialist-run.step.recorded`, `agent.specialist-run.completed`, and `agent.specialist-run.failed`
- `agent.tool.requested`, `agent.tool.approved`, `agent.tool.completed`, and `agent.tool.failed`
- `agent.memory.recorded`, `agent.memory.superseded`, and `agent.memory.retracted`
- fake providers first, then optional provider adapters under the resident-agent provider policy

The foundation should provide run identity, approval previews, memory, status, and UI surfaces. The legacy import package remains authoritative for inspecting, importing, staging approval, and assertion proposal execution.

## Testing And Verification

Implementation should be test-driven and preserve these behaviors:

- Dossier generation reads `LegacyMigrationReport` and projections without creating evidence or ontology events.
- Dossier output is deterministic for the same report hash, candidate-set hash, evidence links, and plugin versions.
- Missing report, report mismatch, raw approval required, stale source, missing evidence link, candidate-set mismatch, and staging approval required produce safe failure DTOs.
- Tool previews include report hash, candidate-set hash, selected candidate IDs, evidence IDs, content hashes, and exact effect class.
- The specialist cannot append `assertion.accepted`, `entity.resolved`, `relationship.accepted`, accepted merge or split events, export, legal escalation, or PRR send events.
- Memory rejects secret-shaped text and does not create accepted graph state.
- Browser DTOs redact unsafe diagnostics and never include raw source roots, raw old-Cestus content, credentials, provider errors, or hidden storage paths.
- A golden bootstrap ledger can replay a task, dossier, approval, staging execution, and memory caveat into deterministic projections.

Documentation-only validation for this spec is:

```bash
git diff --check
npm run factory:check
```

If this design is followed by an implementation plan in the same docs slice, the planning validation should also run:

```bash
npm run verify
```

## Implementation-Slice Decomposition

1. Specialist contract, projection, and read model

   Define dossier DTOs, bootstrap phase state, run failure categories, provenance maps, and safe read models over existing legacy reports and evidence links. Use fake data and existing legacy fixtures.

2. Fake dossier generator over existing legacy reports

   Build deterministic dossier artifacts from `LegacyMigrationReport`, `LegacyMigrationReviewDto`, ingestion evidence links, quarantine entries, and parser confidence. No model calls and no production staging.

3. Tool request previews for legacy workflow actions

   Add request builders for artifact ask, report review, raw import approval, raw import execution, staging preview, staging approval, and staging execution. Bind exact preview hashes and effect classes.

4. Review questions and local extension suggestions

   Generate missing-context questions and investigation-local ontology extension suggestions as derivative review material. Do not install or promote packs.

5. Approved staging orchestration

   Route staging approval and execution through `LegacyImportRuntime` and `LegacyOntologyStagingService`. Verify only `assertion.proposed` appears after approval.

6. Memory integration

   Record caveats, unsupported formats, and operator preferences as source-linked memory. Prove memory cannot become accepted graph state.

7. Agent UI and operator-status integration

   Render bootstrap phase, dossier batches, questions, pending tool requests, approval previews, and next safe actions in browser-safe DTOs.

8. Optional model-assisted dossier enrichment

   Add model assistance only after fake-provider and no-model paths are stable. Provider calls require existing resident-agent credential and byte-transfer policies.

## First Slice Summary

The first implementation slice should create the specialist contract and deterministic read model plus a fake dossier generator over existing legacy reports. It should not run live AI, inspect source roots directly, import bytes, stage assertions, or change UI execution paths. The output should make the next implementation slice obvious while preserving the zero-trust boundary: legacy-derived structure remains evidence-bound review material and can only become `assertion.proposed` after explicit human staging approval.
