# MVP Resident Agent Specialist Workflows Design

Date: 2026-07-09

## Purpose

This design defines the MVP specialist workflow contracts that sit under the single resident Cestus Agent identity after the ontology-bootstrap exemplar. The specialist names are typed work modes, not durable agent personas. A `prr-negotiation` run, an `evidence-triage` run, and a `report-builder` run all share the same resident identity, memory policy, approval model, provider boundary, and audit trail.

The workflows covered here are:

- `prr-negotiation`
- `evidence-triage`
- `timeline-builder`
- `contradiction-finder`
- `investigation-planner`
- `report-builder`

The design keeps ontology bootstrap as the pattern: evidence, dossiers, proposals, and review bundles first; never accepted truth by default.

## Goals

- Define purpose, context packs, prompt artifact templates, allowed tools, approval requirements, outputs, handoff DTOs, failure modes, and tests for each MVP specialist run mode.
- Preserve one resident Cestus Agent identity, with provider adapters remaining execution backends only.
- Make every workflow output content-addressed, provenance-backed, secret-safe, and reviewable by humans and future agents.
- Keep the first implementation lane safe: pure registry metadata and schemas may land only if they remain tested, inert, and fail-closed for execution.
- Defer full workflow execution until scheduler/resumer and domain adapter contracts can consume approved tool requests through authoritative services.

## Non-Goals

- Creating new durable agent identities, personas, or provider-owned assistants.
- Executing PRR sends, legal escalation, export/publication, provider byte transfer, destructive repair, accepted graph review, or graph truth acceptance from these workflow contracts.
- Building raw content scraping, portal crawling, email sending, publication pipelines, or live evidence transfer in this slice.
- Treating model output, memory, timeline items, contradiction candidates, or report drafts as accepted ontology state.
- Replacing PRR, ingestion, ontology, governance, local-runtime, or UI domain contracts.

## Existing Contracts

The workflows compose the resident-agent foundation and execution/approval contracts:

- `agent.identity.initialized` records one workspace resident identity.
- `agent.specialist-run.started`, `agent.specialist-run.step.recorded`, `agent.specialist-run.completed`, and `agent.specialist-run.failed` audit run lifecycle.
- `agent.model-invocation.*` records safe provider invocation metadata and prompt artifact audit refs.
- `agent.tool.requested`, `agent.tool.approved`, `agent.tool.denied`, `agent.tool.completed`, and `agent.tool.failed` bind tool previews and approvals.
- `ContextPackRef` and prompt artifact envelopes are the model boundary.
- Tool gateway events append and validate requests and decisions; schedulers and domain services execute effects.

The workflows also compose existing domain packages:

- PRR services own request lifecycle, correspondence, deadlines, stalling signals, and legal escalation gates.
- Ingestion services own evidence import, provider parse approvals, stale-source checks, evidence links, and parse jobs.
- Ontology services own assertion proposal, accepted assertion review, graph projection, and JSON-LD export boundaries.
- Governance services own classification, quarantine, redaction, sensitive opt-ins, export plans, and incident state.
- UI and local-runtime surfaces render browser-safe DTOs and append decisions; they do not execute risky effects.

## Shared Workflow Shape

Each specialist run follows the same orchestration shape:

1. Start a typed run under `agent_default`.
2. Build declared context packs with source refs, hashes, budgets, and staleness inputs.
3. Build a prompt artifact from template metadata and audited context refs when model reasoning is used.
4. Produce a local derivative artifact or review bundle.
5. Request risky domain tools through preview-hash-bound `agent.tool.requested` events.
6. Pause on approval or prerequisite failures.
7. Hand off a browser-safe DTO that lists artifacts, provenance, pending approvals, failure categories, and next safe actions.

No workflow may approve its own request or call a risky domain service directly.

## Common Context Packs

All workflow descriptors may reference these context packs. Builders remain separate contracts and must produce `ContextPackRef` values with hashes, provenance refs, safe summaries, and staleness inputs.

| Context pack | Purpose | Required by |
| --- | --- | --- |
| `accepted-graph-projection.v1` | Accepted assertions, entities, relationships, and provenance from rebuildable ontology projection. | timeline, contradiction, investigation, report, selected PRR/evidence work |
| `evidence-summary.v1` | Evidence metadata, content hashes, safe summaries, parse status, redaction, quarantine, and governance tags. | evidence, timeline, contradiction, investigation, report |
| `prr-read-model.v1` | PRR request state, correspondence summaries, deadlines, fee/stalling signals, legal gates, diagnostics, and timeline entries. | PRR, timeline, contradiction, investigation, report |
| `governance-locks.v1` | Active legal, export, quarantine, sensitive, data-loss, provider-transfer, and policy locks. | all workflows |
| `agent-memory-summary.v1` | Source-linked memory scoped to workspace, investigation, task, provider, and policy. | all workflows |
| `task-run-history.v1` | Prior task/run events, model summaries, tool requests, approvals, denials, failures, and artifact refs. | all workflows |
| `workspace-runtime-status.v1` | Mounted workspace identity, local-runtime readiness, projection high-water marks, and operator-status diagnostics. | all workflows |
| `jurisdiction-pack-summary.v1` | PRR jurisdiction rules, cited deadline/fee/exemption/appeal rules, and pack versions. | PRR, investigation, report |
| `timeline-draft-summary.v1` | Prior sourced timeline artifacts, item hashes, uncertainty flags, and omitted item categories. | contradiction, investigation, report |
| `contradiction-candidate-summary.v1` | Prior contradiction candidates, evidence refs, status, and reviewer decisions. | investigation, report |

Raw evidence bodies, private correspondence text, and source-sensitive excerpts stay out of remote prompt artifacts unless a provider byte-transfer approval exists and the prompt artifact is marked `provider-approved`.

## Common Prompt Artifact Contract

Each workflow has one MVP prompt artifact template. The template registration stores only safe metadata: run type, template ID, version, label, expected context packs, intended output schema, safety class, transfer approval class, and omissions. Production prompt text is stored only in prompt artifact envelopes or typed `inputText` at the approved provider boundary.

Prompt artifacts must:

- reference exact context pack hashes
- name the intended output schema
- list omitted context with safe reasons
- use `sensitive-local-only` when raw private material is present
- use `provider-approved` plus `provider-byte-transfer` only after the approval contract permits transfer
- reject secret-shaped text, raw provider errors, credentials, hidden source paths, and accepted-truth authority claims

## Common Handoff DTO

Every specialist run returns a handoff DTO with this common shape:

```ts
interface SpecialistWorkflowHandoffDto {
  readonly schemaVersion: "agent-specialist-handoff.v1";
  readonly runType: AgentSpecialistRunType;
  readonly runId: string;
  readonly taskId?: string;
  readonly residentAgentId: string;
  readonly generatedAt: string;
  readonly status: "ready-for-review" | "waiting-for-approval" | "blocked" | "failed";
  readonly safeSummary: string;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly promptArtifactHash?: `sha256:${string}`;
  readonly outputArtifacts: readonly SpecialistOutputArtifactRef[];
  readonly toolRequestIds: readonly string[];
  readonly approvalRequirements: readonly SpecialistApprovalRequirement[];
  readonly nextSafeActions: readonly SpecialistNextAction[];
  readonly failure?: SpecialistFailureDto;
}
```

Workflow-specific payloads extend this envelope through strict schema versions such as `prr-negotiation-handoff.v1` and `report-builder-handoff.v1`. Browser DTOs must reject unknown fields that look like raw content, credentials, raw provider errors, hidden storage paths, or executable command lines.

## Workflow Contracts

### `prr-negotiation`

Purpose: watch request state, deadlines, fee/stalling signals, and correspondence posture; draft follow-ups, narrowing responses, fee challenges, appeal posture notes, and legal-escalation review material.

Context packs: `prr-read-model.v1`, `jurisdiction-pack-summary.v1`, `governance-locks.v1`, `evidence-summary.v1` for request-linked evidence metadata, `agent-memory-summary.v1`, `task-run-history.v1`, and `workspace-runtime-status.v1`.

Prompt artifact template: `prr-negotiation.review.v1`. It consumes PRR summaries, jurisdiction citations, deadline calculations, correspondence hashes, and safe excerpts only when permitted. It outputs `prr-negotiation-handoff.v1`.

Allowed tools:

- `prr.request.read`
- `prr.deadline.review`
- `prr.stalling-signals.read`
- `prr.correspondence.draft-local`
- `prr.followup-send.request`
- `prr.appeal-draft.request`
- `prr.legal-escalation-review.request`
- `agent.memory.record-caveat`

Approval requirements:

- Human `external-message-send` approval for any send or follow-up request.
- Human `legal-escalation` approval before legal pressure, threat language, appeal posture, or escalation confirmation can leave draft state.
- Provider byte-transfer approval before raw correspondence text or private attachments leave the machine.

Safe outputs: correspondence draft artifact, deadline review artifact, fee/stalling note, narrowing options, legal-risk note, pending send/follow-up approval request, and unresolved question list.

Handoff DTO payload: request IDs, correspondence IDs, deadline refs, jurisdiction pack refs, draft body hash, recipient set hash, cited rule refs, pending approval IDs, and no rendered raw message body in browser DTOs.

Failure modes: `prr-request-missing`, `jurisdiction-pack-missing`, `deadline-conflict`, `legal-lock-active`, `approval-required`, `approval-stale`, `provider-byte-transfer-required`, `projection-lag`, `missing-provenance`, and `secret-detected`.

### `evidence-triage`

Purpose: classify productions, flag sensitive or quarantine issues, extract safe summaries, identify evidence gaps, and propose next review actions or assertion candidate bundles.

Context packs: `evidence-summary.v1`, `governance-locks.v1`, `prr-read-model.v1` for production linkage, `accepted-graph-projection.v1` for duplicate avoidance, `agent-memory-summary.v1`, `task-run-history.v1`, and `workspace-runtime-status.v1`.

Prompt artifact template: `evidence-triage.classify.v1`. It consumes evidence metadata, hashes, media types, safe summaries, parse status, governance tags, and quarantine categories. Raw evidence text stays local-only unless transfer is approved. It outputs `evidence-triage-handoff.v1`.

Allowed tools:

- `evidence.summary.read`
- `ingestion.parse-status.read`
- `ingestion.provider-parse-approval.request`
- `evidence.triage-dossier.write-local`
- `governance.classification.propose`
- `governance.quarantine-review.request`
- `assertion.candidate-bundle.write-local`
- `agent.memory.record-caveat`

Approval requirements:

- Provider byte-transfer approval before raw evidence or extracted text goes to a remote provider.
- Human governance review for sensitive opt-ins, quarantine release, redaction decisions, and export eligibility.
- Human/domain review before any assertion proposal tool executes through ontology services.

Safe outputs: triage dossier, safe evidence summaries, sensitive/quarantine flags, duplicate groups, assertion candidate bundle, evidence-gap list, and review queue suggestions.

Handoff DTO payload: evidence IDs, content hashes, parse job IDs, governance tag decisions with confidence/rationale, quarantine IDs, candidate bundle hashes, and suggested next review actions.

Failure modes: `evidence-missing`, `evidence-quarantined`, `parse-unavailable`, `provider-byte-transfer-required`, `governance-lock-active`, `projection-lag`, `missing-provenance`, `model-output-invalid`, and `secret-detected`.

### `timeline-builder`

Purpose: build sourced timelines from evidence, accepted assertions, PRR events, correspondence summaries, and reviewed notes while preserving uncertainty and source boundaries.

Context packs: `accepted-graph-projection.v1`, `evidence-summary.v1`, `prr-read-model.v1`, `governance-locks.v1`, `agent-memory-summary.v1`, `task-run-history.v1`, and `workspace-runtime-status.v1`.

Prompt artifact template: `timeline-builder.sourced-timeline.v1`. It consumes date-bearing evidence metadata, PRR timeline entries, accepted assertion refs, and uncertainty rules. It outputs `timeline-builder-handoff.v1`.

Allowed tools:

- `timeline.source-events.read`
- `timeline.draft.write-local`
- `timeline.uncertainty-record.write-local`
- `agent.memory.record-caveat`

Approval requirements:

- No approval for local derivative timeline artifacts.
- Provider byte-transfer approval before private raw chronology text leaves local context.
- Export/publication approval if a timeline is packaged for external sharing.

Safe outputs: timeline artifact, item-level citation map, date precision notes, uncertainty flags, omitted-source list, and unresolved-evidence prompts.

Handoff DTO payload: timeline artifact hash, item IDs, normalized date or date range, precision label, evidence refs, assertion refs, PRR event refs, uncertainty categories, and omission reasons.

Failure modes: `timeline-source-missing`, `date-parse-conflict`, `citation-missing`, `projection-lag`, `context-budget-exceeded`, `provider-byte-transfer-required`, `model-output-invalid`, and `secret-detected`.

### `contradiction-finder`

Purpose: compare assertions, agency statements, correspondence, timeline items, and records; output contradiction candidates tied to exact evidence and source refs, not conclusions.

Context packs: `accepted-graph-projection.v1`, `evidence-summary.v1`, `prr-read-model.v1`, `timeline-draft-summary.v1`, `governance-locks.v1`, `agent-memory-summary.v1`, `task-run-history.v1`, and `workspace-runtime-status.v1`.

Prompt artifact template: `contradiction-finder.candidates.v1`. It consumes sourced claims, accepted/proposed assertion summaries when allowed, agency-statement summaries, and timeline refs. It outputs `contradiction-finder-handoff.v1`.

Allowed tools:

- `contradiction.sources.read`
- `contradiction.candidate-dossier.write-local`
- `diagnostic.investigative-signal.request`
- `claim.contradiction-link.request`
- `agent.memory.record-caveat`

Approval requirements:

- Human/domain review before any claim link, diagnostic event, or assertion status change.
- No automatic assertion rejection, accepted graph mutation, or entity resolution.
- Provider byte-transfer approval before raw records or correspondence leave local context.

Safe outputs: contradiction candidate dossier, paired source refs, confidence caveats, alternative explanations, requested follow-up evidence, and review queue items.

Handoff DTO payload: candidate IDs, compared source refs, evidence IDs, content hashes, assertion IDs, timeline item IDs, contradiction category, confidence, rationale, alternative explanations, and required reviewer action.

Failure modes: `source-pair-missing`, `claim-scope-missing`, `citation-missing`, `projection-lag`, `context-budget-exceeded`, `provider-byte-transfer-required`, `model-output-invalid`, and `secret-detected`.

### `investigation-planner`

Purpose: identify evidence gaps, organize next investigative steps, propose PRR candidates, generate task suggestions, and coordinate work across other specialist handoffs.

Context packs: `accepted-graph-projection.v1`, `evidence-summary.v1`, `prr-read-model.v1`, `timeline-draft-summary.v1`, `contradiction-candidate-summary.v1`, `governance-locks.v1`, `agent-memory-summary.v1`, `task-run-history.v1`, and `workspace-runtime-status.v1`.

Prompt artifact template: `investigation-planner.next-steps.v1`. It consumes safe summaries, known gaps, current tasks, PRR posture, timeline uncertainty, contradiction candidates, and governance locks. It outputs `investigation-planner-handoff.v1`.

Allowed tools:

- `investigation.gaps.read`
- `investigation.plan.write-local`
- `agent.task-suggestion.write-local`
- `prr.draft-candidate.write-local`
- `prr.followup-send.request`
- `agent.memory.record-caveat`

Approval requirements:

- Human approval before any external request, PRR send/follow-up, portal action, or new provider byte transfer.
- Human review before durable task creation if task creation becomes a domain event rather than a local suggestion.
- No autonomous portal crawling or source scraping.

Safe outputs: investigation plan artifact, prioritized evidence gaps, task suggestion bundle, draft PRR candidate bundle, risk notes, dependencies, and safe next action list.

Handoff DTO payload: plan artifact hash, objective refs, gap IDs, task candidate IDs, PRR draft candidate IDs, linked evidence/timeline/contradiction refs, priority rationale, and approval requirements.

Failure modes: `investigation-scope-missing`, `insufficient-context`, `external-action-approval-required`, `governance-lock-active`, `projection-lag`, `provider-byte-transfer-required`, `model-output-invalid`, and `secret-detected`.

### `report-builder`

Purpose: assemble evidence-backed reporting packets, drafts, outlines, citation maps, and unresolved-risk notes from accepted facts, evidence, claims, PRR work, timelines, and reviewed notes.

Context packs: `accepted-graph-projection.v1`, `evidence-summary.v1`, `prr-read-model.v1`, `timeline-draft-summary.v1`, `contradiction-candidate-summary.v1`, `governance-locks.v1`, `agent-memory-summary.v1`, `task-run-history.v1`, and `workspace-runtime-status.v1`.

Prompt artifact template: `report-builder.packet-draft.v1`. It consumes accepted facts, citations, evidence summaries, governed exclusions, unresolved-risk notes, and style memory. It outputs `report-builder-handoff.v1`.

Allowed tools:

- `report.outline.write-local`
- `report.section-draft.write-local`
- `report.citation-map.write-local`
- `governance.export-preview.request`
- `governance.export-approval.request`
- `agent.memory.record-caveat`

Approval requirements:

- Human export/publication approval for any durable export, public report packet, or shareable bundle.
- Sensitive opt-in review for private, vulnerable-person, sealed, export-restricted, or law-enforcement-sensitive evidence.
- Legal review when draft language contains legal escalation, accusation posture, or sensitive allegations requiring lock handling.
- Provider byte-transfer approval before raw report context leaves local-only mode.

Safe outputs: report outline, draft sections, citation map, unresolved-risk note, excluded-evidence list, export preview, and pending export/publication approval request.

Handoff DTO payload: report packet ID, outline hash, section artifact hashes, citation map hash, included evidence IDs, excluded evidence IDs, governance policy refs, sensitive opt-in requirements, legal review flags, and publication/export approval IDs.

Failure modes: `citation-missing`, `accepted-fact-required`, `sensitive-opt-in-required`, `export-lock-active`, `legal-lock-active`, `projection-lag`, `provider-byte-transfer-required`, `model-output-invalid`, and `secret-detected`.

## Blocked And Approval States

The scheduler/resumer contract should expose these workflow-level states before full execution lands:

- `descriptor-ready`: registry metadata is present and execution remains disabled.
- `context-ready`: required context pack refs are built and hashed.
- `prompt-ready`: prompt artifact envelope is built and audited.
- `local-artifact-ready`: derivative dossier, draft, timeline, plan, or report artifact is ready for review.
- `waiting-for-approval`: one or more exact-preview tool requests require human decision.
- `blocked-prerequisite`: scheduler/resumer, domain adapter, projection, provider, or credential contract is missing.
- `blocked-lock`: legal, export, governance, secret, provider-transfer, or data-loss lock blocks the next effect.
- `blocked-provenance`: required source refs, evidence IDs, hashes, or context pack refs are missing.
- `failed-safe`: the workflow recorded a secret-safe failure and allowed repair actions.

Approval consumption must recheck preview hashes, source hashes, context pack hashes, policy version, locks, projection high-water marks, and independent human actor at resume time.

## Testing Expectations

The implementation plan should require tests that prove:

- Specialist metadata registers exactly the six MVP modes without creating new resident identities.
- Execution remains disabled unless a workflow-specific runner is explicitly called by a scheduler/resumer.
- Context pack requirements and prompt template registrations exist for each mode and reject unknown run types.
- Handoff DTOs reject unknown fields, raw content, secret-shaped keys, provider errors, executable commands, and accepted-truth authority claims.
- Tool descriptors include side-effect classes, approval classes, provenance requirements, preview hashes, and domain owner names.
- PRR workflows can request follow-up/send approval but cannot send.
- Evidence triage can produce candidate bundles and governance review requests but cannot accept graph truth.
- Timeline artifacts require citations and uncertainty notes.
- Contradiction candidates require paired source refs and do not reject assertions.
- Investigation plans produce local task/PRR candidates and do not crawl portals.
- Report packets require citation maps and export/governance approvals before publication.
- Live provider acceptance, when used, records only safe hashes, IDs, counts, categories, and markers.

Documentation validation for this design is:

```bash
git diff --check
npm run factory:check
npm run verify
```

## Implementation-Slice Decomposition

1. Pure workflow registry metadata

   Add tested descriptors for the six run modes: purpose, context packs, prompt template metadata, allowed tools, approvals, outputs, handoff schema IDs, failure categories, prerequisites, and execution disabled state.

2. Handoff DTO schemas

   Add strict safe DTO schemas, output artifact refs, approval requirement refs, and stable hashing for handoff payloads. Keep all DTOs browser-safe and raw-content-free.

3. Tool and prompt descriptor catalogs

   Add inert descriptor catalogs for prompt templates and tool previews. Descriptors name domain owners and approval classes but do not execute effects.

4. Scheduler/resumer prerequisite bridge

   After scheduler/resumer contracts land, add state derivation for blocked prerequisites, context readiness, approval waits, stale approvals, and safe failure handoffs.

5. Domain adapter slices

   Add one workflow runner at a time only after its authoritative domain adapter exists: PRR, evidence/governance, timeline artifact, contradiction/claim, investigation/task, and report/export.

6. Read-only cockpit integration

   Render mode descriptors, handoff DTOs, pending approvals, artifact refs, and next safe actions in the Agent workspace. Decision controls append approval or denial only.

7. Live provider gated acceptance

   Use real providers only where provider behavior matters, with explicit opt-in commands and safe output evidence only.

## First Slice Summary

The approved MVP framing is one trusted resident Cestus Agent with typed work modes underneath it. The safe first implementation is metadata and schema work only: descriptors, prompt template registrations, tool catalog entries, and handoff DTO schemas that make future specialist execution AI-legible while preserving fail-closed runtime behavior. Full workflow execution waits for scheduler/resumer and domain adapter contracts.
