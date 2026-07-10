# Production Specialist Prompt Template Registry Design

Date: 2026-07-10

## Purpose

This design closes the remaining prompt boundary for the MVP resident-agent
specialist workflows. The first resident-agent MVP proved that prompt artifacts
are the provider text boundary, but the specialist runner still has a fallback
path that can synthesize prompt text from context pack summaries when no
production prompt artifact is supplied. That fallback is not acceptable for
production specialist execution.

This slice defines a production prompt-template registry for:

- `prr-negotiation.review.v1`
- `evidence-triage.classify.v1`
- `timeline-builder.sourced-timeline.v1`
- `contradiction-finder.candidates.v1`
- `investigation-planner.next-steps.v1`
- `report-builder.packet-draft.v1`

The registry is not just metadata around an arbitrary injected builder. Cestus
owns real versioned deterministic template definitions and renderers in the
agent package. Runtime integration may inject authoritative context, storage,
clock, provider, and approval capabilities, but injected code cannot replace the
registered template content while still satisfying production readiness.

## Goals

- Make prompt artifacts the sole provider text boundary for the six production
  specialist templates.
- Register package-owned production template definitions and deterministic
  renderers for all six specialist modes.
- Bind each template to exact context-pack requirements, bounded optional
  omissions, safety class, transfer approval class, provider output contract,
  and handoff contract.
- Remove the specialist runner's fallback prompt synthesis in the same approved
  implementation sequence that registers and tests the production templates.
- Validate supplied prebuilt prompt artifacts by re-verifying registered
  template identity, renderer identity, renderer hash, deterministic rendered
  hash, ordered context hashes, output schema, omissions, safety class, and
  transfer class.
- Treat model output as untrusted structured input. Output can create local
  artifacts, review suggestions, or approval requests only through existing
  gates.
- Keep production prompt text and provider response text out of ledger events,
  diagnostics, browser DTOs, claims, readiness notes, and logs.

## Non-Goals

- Building new context-pack producers.
- Building durable handoff projections for every specialist.
- Building scheduler-to-runner dispatch.
- Creating new PRR send, legal escalation, export, repair, provider-transfer,
  contradiction-review, or accepted-graph execution paths.
- Letting test prompt builders satisfy production execution readiness.
- Storing production prompt text in append-only ledger events or public DTOs.

## Existing Context

The design composes these existing contracts:

- `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`
  defines one resident Cestus Agent identity and typed specialist run modes.
- `docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md`
  defines context packs, model invocation audit, exact preview hash approval,
  and approval consumption checks.
- `docs/superpowers/specs/2026-07-07-resident-agent-provider-auth-design.md`
  defines provider and credential boundaries.
- `docs/superpowers/plans/2026-07-08-resident-agent-prompt-artifact-context-resolver-implementation.md`
  established durable prompt artifacts and removed hash-to-text provider
  resolver callbacks.
- `docs/superpowers/specs/2026-07-09-mvp-specialist-workflows-design.md`
  names the six specialist templates, context packs, tools, approvals, and
  handoff schemas.
- `packages/agent/src/prompt-artifacts.ts` defines prompt artifact envelopes,
  audit metadata, policy checks, and the current thin template registration
  surface.
- `packages/agent/src/specialist-workflows.ts` defines current specialist
  workflow descriptors.
- `packages/agent/src/specialist-runner-kernel.ts` currently prepares a run by
  building context packs and, when no artifact is supplied, synthesizing prompt
  text from context pack refs. This fallback must be closed.

## Approved Direction

Use package-owned production template definitions and deterministic renderers.
The agent package owns the registry, renderer identities, template material,
renderer hashes, output validators, and prompt artifact validation logic.

Injection remains useful, but only around the edges:

- Context-pack registries provide authoritative `ContextPackRef` values.
- Artifact stores persist envelopes and local derivative outputs.
- Clocks supply envelope metadata such as `generatedAt`.
- Runtime/provider capabilities invoke models after prompt artifact policy
  checks pass.
- Approval proof capabilities prove provider byte-transfer approval.

Injected code cannot provide alternate production prompt text or alternate
template material. A supplied prompt artifact is production-valid only when
Cestus can re-render or otherwise verify it against the exact registered
template/renderer identity and the exact context hashes.

## Architecture

### Production Template Registry

Add an agent-package registry with a shape equivalent to:

```ts
type ProductionContextRequirement =
  | {
      readonly contextPackId: string;
      readonly order: number;
      readonly requirementMode: "always";
    }
  | {
      readonly contextPackId: string;
      readonly order: number;
      readonly requirementMode: "when-scope-associated-prr";
      readonly omissionWhenNotApplicable: "no-associated-prr";
    };

interface ProductionPromptTemplateRegistration {
  readonly runType: AgentSpecialistRunType;
  readonly promptTemplateId: string;
  readonly promptTemplateVersion: number;
  readonly rendererId: string;
  readonly rendererVersion: number;
  readonly rendererHash: `sha256:${string}`;
  readonly providerOutputSchemaId: string;
  readonly providerOutputSchemaVersion: number;
  readonly handoffSchemaId: string;
  readonly handoffSchemaVersion: number;
  readonly contextRequirements: readonly ProductionContextRequirement[];
  readonly allowedOmissions: readonly ProductionPromptOmissionRule[];
  readonly safetyClass: "provider-approved";
  readonly transferApprovalClass: "provider-byte-transfer";
}
```

`rendererHash` is a stable hash of canonical registered template and renderer
material, not an environment-dependent hash of compiled JavaScript. The
canonical material should be explicit package data, such as renderer ID,
renderer version, template ID, template version, static template sections,
rendering policy version, context ordering policy, omission policy, and output
contract refs, serialized as stable JSON. The hash must be reproducible across
machines, builds, and test runs.

The injected clock is used only for prompt envelope metadata such as
`generatedAt`. It cannot affect rendered prompt content, rendered prompt hash,
renderer hash, context ordering, omissions, or provider output schema binding.

### Context Applicability Contract

Context requirements are not a flat `required: true` list. Each requirement has
a machine-readable `requirementMode` and stable `order`.

- `always` means the pack is required for every run of the template.
- `when-scope-associated-prr` means the pack is required only when the run/task
  scope declares an associated PRR request.

The applicability evaluator normalizes the task/run scope fields used by these
predicates and produces a stable `scopeApplicabilityHash`. For v1, those fields
are run type, task ID, scope kind, associated PRR request ID when present, and
the selected PRR read-model ref when present.

For each render attempt, Cestus records an evaluated applicability set:

- applicable context requirements with ordered context pack refs and content
  hashes,
- non-applicable conditional requirements with exact omission reason
  `no-associated-prr`,
- the `scopeApplicabilityHash`,
- the ordered requirement modes that were evaluated.

A missing applicable context pack is `required-context-missing` and blocks
rendering. A non-applicable `when-scope-associated-prr` PRR context requirement
is not missing provenance; it is a bounded `no-associated-prr` omission. If the
task/run scope later changes, including adding or removing an associated PRR,
the `scopeApplicabilityHash` changes and any prior prompt artifact or approval
is stale.

### Renderer Ownership

Each production renderer lives in the agent package. It accepts normalized
inputs:

- run type
- ordered applicable context refs
- evaluated non-applicable conditional context omissions
- bounded omissions for optional material
- registered template metadata

It returns deterministic prompt text plus a render audit:

- renderer ID/version/hash
- prompt template ID/version
- provider output schema ID/version
- handoff schema ID/version
- ordered context pack IDs and content hashes
- evaluated context requirement modes
- omission records
- scope applicability hash
- rendered prompt hash

The renderer must not read environment variables, current time, filesystem
paths, provider settings, credential refs, or mutable runtime state. It only
reads its arguments and package-owned template material.

### Prompt Artifact Manifest Extension

Prompt artifacts should include enough manifest metadata to validate production
renders without exposing text:

- `inputArtifactHash`
- `runType`
- `promptTemplateId`
- `promptTemplateVersion`
- `rendererId`
- `rendererVersion`
- `rendererHash`
- `providerOutputSchemaId`
- `providerOutputSchemaVersion`
- `handoffSchemaId`
- `handoffSchemaVersion`
- `safetyClass`
- `transferApprovalClass`
- ordered `contextPackRefs`
- evaluated `contextRequirements`
- `scopeApplicabilityHash`
- bounded `omissions`
- `safeSummary`
- `generatedAt`

Ledger model-invocation events may record this audit metadata and context refs,
but never prompt text or provider response text.

### Supplied Prompt Artifact Verification

An externally supplied prompt artifact is treated as a persisted copy, not as
trusted authority. Before a runner may invoke a provider, Cestus verifies:

- run type matches the run.
- prompt template ID/version match the production registration.
- renderer ID/version/hash match the production registration.
- provider output schema ID/version match the production registration.
- handoff schema ID/version match the production registration.
- safety class and transfer approval class match the production registration.
- context requirement modes match the production registration.
- the evaluated applicability set matches the current task/run scope.
- applicable context pack IDs are present in exact registered order.
- applicable context pack content hashes match the current prepared context.
- non-applicable conditional requirements have exact bounded omission reasons.
- optional context refs, if introduced by a future template version, are present
  only in registered order when supplied.
- omissions are bounded, exact, and allowed by the registration.
- deterministic re-rendered prompt hash equals the supplied artifact hash.
- artifact text passes secret-safety and unsafe authority restrictions.

If any check fails, the run blocks or fails before model invocation.

### Production Versus Test Capability

There are two distinct capability classes:

- Production prompt rendering capability: package-owned registry and renderers
  with `production: true`, stable renderer hashes, exact output contracts, and
  readiness eligibility.
- Test prompt capability: deterministic fixtures or test-only builders with
  `production: false`.

Tests may use test prompt capabilities for local unit isolation, but readiness
and production runner execution must reject them. A test builder can prove a
runner's error handling, but it cannot make `projectSpecialistWorkflowReadiness`
or production execution report `prompt-ready`.

## Template Registrations

All six registrations use `promptTemplateVersion: 1`, `rendererVersion: 1`,
`providerOutputSchemaVersion: 1`, `handoffSchemaVersion: 1`,
`safetyClass: "provider-approved"`, and
`transferApprovalClass: "provider-byte-transfer"`.

| Run type | Prompt template | Provider output schema | Handoff schema | Always-applicable context packs | Conditional context requirements |
| --- | --- | --- | --- | --- | --- |
| `prr-negotiation` | `prr-negotiation.review.v1` | `prr-negotiation.review-output.v1` | `prr-negotiation-handoff.v1` | `prr-read-model.v1`, `jurisdiction-pack-summary.v1`, `governance-locks.v1`, `evidence-summary.v1`, `agent-memory-summary.v1`, `task-run-history.v1`, `workspace-runtime-status.v1` | none |
| `evidence-triage` | `evidence-triage.classify.v1` | `evidence-triage.classify-output.v1` | `evidence-triage-handoff.v1` | `evidence-summary.v1`, `governance-locks.v1`, `accepted-graph-projection.v1`, `agent-memory-summary.v1`, `task-run-history.v1`, `workspace-runtime-status.v1` | `prr-read-model.v1` when scope declares an associated PRR request; otherwise `no-associated-prr` |
| `timeline-builder` | `timeline-builder.sourced-timeline.v1` | `timeline-builder.sourced-timeline-output.v1` | `timeline-builder-handoff.v1` | `accepted-graph-projection.v1`, `evidence-summary.v1`, `governance-locks.v1`, `agent-memory-summary.v1`, `task-run-history.v1`, `workspace-runtime-status.v1` | `prr-read-model.v1` when scope declares an associated PRR request; otherwise `no-associated-prr` |
| `contradiction-finder` | `contradiction-finder.candidates.v1` | `contradiction-finder.candidates-output.v1` | `contradiction-finder-handoff.v1` | `accepted-graph-projection.v1`, `evidence-summary.v1`, `timeline-draft-summary.v1`, `governance-locks.v1`, `agent-memory-summary.v1`, `task-run-history.v1`, `workspace-runtime-status.v1` | `prr-read-model.v1` when scope declares an associated PRR request; otherwise `no-associated-prr` |
| `investigation-planner` | `investigation-planner.next-steps.v1` | `investigation-planner.next-steps-output.v1` | `investigation-planner-handoff.v1` | `accepted-graph-projection.v1`, `evidence-summary.v1`, `timeline-draft-summary.v1`, `contradiction-candidate-summary.v1`, `governance-locks.v1`, `agent-memory-summary.v1`, `task-run-history.v1`, `workspace-runtime-status.v1` | `prr-read-model.v1` when scope declares an associated PRR request; otherwise `no-associated-prr` |
| `report-builder` | `report-builder.packet-draft.v1` | `report-builder.packet-draft-output.v1` | `report-builder-handoff.v1` | `accepted-graph-projection.v1`, `evidence-summary.v1`, `timeline-draft-summary.v1`, `contradiction-candidate-summary.v1`, `governance-locks.v1`, `agent-memory-summary.v1`, `task-run-history.v1`, `workspace-runtime-status.v1` | `prr-read-model.v1` when scope declares an associated PRR request; otherwise `no-associated-prr` |

`prr-negotiation` always requires a selected `prr-read-model.v1` context pack
and `jurisdiction-pack-summary.v1`. It is selected-request scoped.

The other five registrations support PRR-linked and non-PRR workflows. When the
task/run scope declares an associated PRR request, `prr-read-model.v1` is an
applicable required context pack and absence blocks rendering. When the scope
has no associated PRR request, absence of `prr-read-model.v1` is an explicit
bounded `no-associated-prr` omission. This is required for imported public
datasets, legacy artifact review, proactive investigations, and first-PRR
planning.

The MVP registrations have no free optional context packs. The omission
mechanism is still part of the contract because prompt artifacts already support
omissions, conditional context requirements need bounded not-applicable records,
and future template versions may introduce optional packs. For version 1,
absence of any applicable required pack blocks rendering and cannot be
represented as an omission.

Allowed omission categories for optional material or conditional applicability
are:

- `context-budget`
- `policy-redaction`
- `raw-content-local-only`
- `quarantine-or-lock`
- `optional-pack-unavailable`
- `no-associated-prr`

Every omission record must include category, source ref, safe summary, and the
template field, optional context pack, or conditional context requirement it
affects. `no-associated-prr` is allowed only for a non-applicable
`when-scope-associated-prr` requirement. Omission records must never hide
missing applicable context.

## Renderer Content Policy

Each renderer must instruct the provider to return only the registered JSON
shape. The templates should include the safety rules common to all specialist
outputs:

- Output is advisory structured input, not accepted truth.
- The provider cannot approve byte transfer, send PRRs, escalate legally,
  export, publish, clear locks, execute repairs, accept ontology truth, resolve
  entities, accept relationships, or create durable claim links.
- Every suggested action remains local-only or approval-gated.
- The output should name uncertainty, missing context, and required review.
- The output must not include credentials, raw provider errors, hidden local
  paths, auth headers, or secret-shaped material.

Production renderer text may include safe IDs, hashes, counts, categories,
deadline refs, citation refs, governance flags, and short safe summaries from
context packs. It must not include raw private evidence bodies, raw
correspondence bodies, source-sensitive excerpts, raw report prose, or provider
credential material unless those exact bytes are already present in approved
context-pack inputs and the exact prompt artifact is covered by the provider
byte-transfer approval class and current approval proof.

The v1 renderers can render only bytes present in approved context-pack inputs.
Provider byte-transfer approval authorizes sending the exact generated prompt
artifact and its bound context bytes or summaries. It does not authorize the
renderer, runner, or provider integration to fetch raw evidence, raw
correspondence, local files, or report prose outside those packs. Any future
raw-content prompt lane needs its own explicit capability, approval class, and
spec.

## Provider Output Contracts

Each provider output schema is strict and field-specific. The system must not
apply a blanket ban on executable-command-shaped text across all narrative
fields. Some evidence or report wording may legitimately mention command-like
strings, public instructions, or quoted source material. Instead, each field
uses:

- type and length limits,
- enum constraints where possible,
- ID and hash patterns where applicable,
- per-field secret-safety checks,
- raw provider error rejection,
- hidden path and credential rejection for fields that leave local-only scope,
- authority-claim restrictions that reject claims of completed external effects
  or accepted ontology truth.

### PRR Negotiation Output

`prr-negotiation.review-output.v1` may include:

- `draftSummary`
- `requestFollowUpApproval`
- `citedRuleRefs`
- `deadlineNotes`
- `feeOrStallingSignals`
- `unresolvedQuestions`

It must not include rendered sendable body text in public DTOs. Any send or
follow-up remains a domain-supplied preview and `external-message-send`
approval request.

### Evidence Triage Output

`evidence-triage.classify-output.v1` may include:

- `dossierSummary`
- `safeSummaries`
- `governanceFlags`
- `duplicateGroups`
- `evidenceGaps`
- `assertionCandidates`
- local review booleans for provider parse, governance, quarantine, and
  assertion proposal review

Evidence IDs must belong to the current run. Assertion candidates remain local
candidate material unless a separate domain review path proposes them.

### Timeline Builder Output

`timeline-builder.sourced-timeline-output.v1` may include:

- timeline items with stable item IDs,
- normalized date or date range,
- precision label,
- evidence refs,
- assertion refs,
- PRR event refs,
- uncertainty categories,
- omission reasons,
- unresolved prompts.

Every timeline item needs at least one source ref. Timeline output cannot create
accepted facts.

### Contradiction Finder Output

`contradiction-finder.candidates-output.v1` may include:

- candidate IDs,
- compared source refs,
- evidence IDs and content hashes,
- assertion IDs,
- timeline item IDs,
- contradiction category,
- confidence,
- rationale,
- alternative explanations,
- required reviewer action.

It cannot reject assertions, mutate claim state, or record durable diagnostic or
claim links without a separate human/domain review path.

### Investigation Planner Output

`investigation-planner.next-steps-output.v1` may include:

- plan summary,
- objective refs,
- gap IDs,
- task candidates,
- PRR draft candidates,
- linked evidence/timeline/contradiction refs,
- priority rationale,
- approval requirements.

It cannot create durable tasks, crawl portals, send requests, or transfer new
provider bytes.

### Report Builder Output

`report-builder.packet-draft-output.v1` may include:

- report packet ID,
- outline refs,
- draft section refs or safe local section summaries,
- citation map refs,
- included and excluded evidence IDs,
- governance policy refs,
- sensitive opt-in requirements,
- legal review flags,
- export/publication approval refs.

It cannot export, publish, clear legal/export locks, or present unsupported
facts as accepted.

## Runner Preparation Contract

`prepareSpecialistRun()` should change from "build context and synthesize a
prompt if absent" to "build context and require production prompt rendering or
verification."

Preparation flow:

1. Load the current run from the agent projection.
2. Confirm run type, task ID, and `agent_default`.
3. Look up the production prompt registration for the run type.
4. Evaluate context requirement applicability against the current task/run
   scope and compute `scopeApplicabilityHash`.
5. Build applicable context pack refs in the exact registered order.
6. Record bounded omission records for non-applicable conditional requirements.
7. Block if any applicable context pack is missing, stale, missing provenance,
   or fails its own context contract.
8. Render a production prompt artifact through the package-owned renderer, or
   verify a supplied artifact by deterministic re-render.
9. Return prepared context refs, evaluated applicability metadata, production
   registration audit metadata, and prompt artifact.

Missing registration, test-only registration, renderer mismatch, applicable
context absence, context applicability mismatch, omission mismatch, stale
supplied artifact, hash mismatch, or disallowed safety/transfer class fails
before model invocation.

The old fallback prompt text helper must be removed or made unreachable for
provider invocation in the same implementation commit that enforces production
registry use.

## Readiness Contract

`projectSpecialistWorkflowReadiness()` should require production prompt
readiness, not thin template metadata. A specialist can reach prompt-ready only
when:

- the production template registration exists,
- renderer ID/version/hash match the package-owned registration,
- context requirement modes match the package-owned registration,
- the current task/run scope can be evaluated into a stable applicability set,
- applicable context producers are available,
- applicable context refs are current and provenance-backed,
- non-applicable conditional requirements have bounded omission reasons,
- provider output schema ID/version match the registration,
- handoff schema ID/version match the registration,
- safety class and transfer class match the registration,
- provider posture is compatible,
- provider byte-transfer approval is present when the selected provider requires
  it.

Placeholder prompt text, hash-only prompt artifact labels, arbitrary injected
builders, and `production: false` test capabilities cannot satisfy readiness.

## Transfer Approval Binding

Provider byte-transfer approval binds the exact prompt artifact and the exact
bytes or context summaries sent. The approval preview and consume-time proof
must cover:

- provider ID and credential ref ID,
- run ID and task ID,
- prompt template ID/version,
- renderer ID/version/hash,
- input artifact hash,
- scope applicability hash,
- evaluated context requirement modes and statuses,
- ordered context pack IDs and content hashes,
- evidence or source byte hashes when raw bytes or excerpts are included,
- omissions,
- safety class and transfer class,
- provider output schema ID/version,
- current provider readiness and active locks.

If any prompt artifact hash, context hash, scope applicability hash, evaluated
omission reason, evidence byte hash, renderer hash, provider descriptor,
credential ref, lock state, or policy ref changes, the approval is stale and the
provider call must fail closed before transfer.

## Diagnostics And Audit

Failures should be structured and secret-safe. Useful categories include:

- `prompt-template-missing`
- `renderer-mismatch`
- `prompt-artifact-missing`
- `prompt-artifact-stale`
- `prompt-artifact-hash-mismatch`
- `required-context-missing`
- `context-applicability-mismatch`
- `optional-omission-invalid`
- `provider-output-schema-mismatch`
- `test-template-not-production`
- `provider-byte-transfer-required`
- `model-output-invalid`
- `secret-detected`

Diagnostics may record IDs, versions, hashes, counts, categories, event IDs,
and safe summaries. They must not record prompt text, provider output text,
credentials, raw provider errors, raw private evidence, raw correspondence,
raw report prose, hidden local paths, or executable repair commands.

## Atomic Migration Requirement

The implementation plan must keep the migration atomic. No intermediate code
commit may leave a state where specialist runners can invoke a provider through
fallback or placeholder prompt synthesis.

The descriptor change for conditional PRR context and the prompt readiness
enforcement must land in the same approved implementation task. No intermediate
state may treat conditional PRR absence as generic missing provenance, and no
intermediate state may consider a placeholder or synthesized prompt provider
ready.

Recommended task order:

1. Add deterministic tests for all six production template registrations,
   renderer hashes, context requirement applicability, output schemas, and
   production/test distinction.
2. Add package-owned production renderers and provider output validators.
3. Add tests that prove missing or mismatched production registration blocks
   before provider invocation.
4. Remove or disable fallback prompt synthesis and update runner preparation in
   the same implementation commit as production registry enforcement and
   conditional PRR applicability handling.
5. Update current PRR, evidence triage, and investigation planner runner tests
   to use production renderers or explicitly non-production fixtures that fail
   readiness.
6. Add or update gated live Nous acceptance for the production renderer/provider
   boundary. Existing PRR and evidence triage live paths are the best first
   candidates because they already exercise provider-byte-transfer proof.
7. Run focused tests, live gated smoke when credentials are available,
   `npm run verify`, and factory checks before committing readiness evidence.

## Testing Expectations

Deterministic credential-free tests should prove:

- exactly six production templates are registered;
- renderer hashes are stable across calls and independent of injected clock;
- clock changes affect envelope `generatedAt` only, not rendered prompt hash;
- applicable required context absence blocks before prompt render and provider
  invocation;
- PRR-linked evidence triage, investigation planner, and report builder runs
  require `prr-read-model.v1` and reject stale or missing PRR context;
- non-PRR evidence triage, investigation planner, and report builder runs record
  exact `no-associated-prr` omissions and do not fail readiness for absent PRR
  context;
- changing task/run scope between PRR-linked and non-PRR modes stales the prompt
  artifact and provider byte-transfer approval;
- optional and conditional omissions are bounded and cannot hide missing
  applicable packs;
- supplied artifacts are rejected on renderer mismatch, template mismatch,
  output schema mismatch, context hash mismatch, context applicability mismatch,
  omission mismatch, safety class mismatch, transfer class mismatch, or artifact
  hash mismatch;
- test prompt capabilities cannot satisfy production readiness;
- v1 renderers cannot fetch or render bytes outside approved context-pack inputs;
- provider output schemas reject unsafe authority claims while permitting
  legitimate field-specific narrative text;
- PRR sends, legal escalation, export, repair, provider byte transfer, accepted
  graph review, and durable claim links remain approval-gated;
- ledger events, diagnostics, DTOs, claims, and logs store hashes/audit metadata
  only, never production prompt text or provider response text;
- fallback prompt synthesis cannot invoke a provider.

Live provider acceptance should be separately gated and secret-safe:

```bash
CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/evidence-triage-nous-live.test.ts
```

The evidence-triage live acceptance must include at least one non-PRR
imported-evidence run with a bounded `no-associated-prr` omission, because
imported evidence triage is a core Cestus workflow.

The visible output may include provider ID, model ID, hashes, event IDs, counts,
categories, and fixed markers only. It must not print prompt text, provider
response text, credentials, raw provider errors, raw request bodies, raw
evidence text, or hidden local paths.

## Acceptance Criteria

- The agent package owns production template content and deterministic renderer
  identity for all six specialist templates.
- `rendererHash` is stable canonical material, not compiled JavaScript or
  environment state.
- Injected clocks cannot affect rendered prompt bytes or rendered prompt hash.
- `prr-negotiation` always requires selected `prr-read-model.v1` and
  `jurisdiction-pack-summary.v1`.
- For the other five templates, `prr-read-model.v1` is required only when the
  task/run scope declares an associated PRR request.
- Non-PRR runs bind exact `no-associated-prr` omissions instead of failing
  readiness for absent PRR context.
- Applicable required context pack absence blocks rendering and provider
  invocation.
- Conditional and optional omissions are bounded, exact, and versioned.
- Production readiness rejects arbitrary injected builders and test-only
  renderers.
- Supplied prompt artifacts are re-verified against the registered production
  renderer, evaluated applicability set, omission reasons, and current ordered
  context hashes.
- Provider byte-transfer approval binds exact prompt artifact and sent
  byte/context hashes, including scope applicability hash.
- V1 renderers can render only bytes present in approved context-pack inputs.
- Model output remains untrusted and cannot accept ontology truth, send PRRs,
  escalate legally, export, clear locks, transfer bytes, or execute repairs.
- No prompt text or provider response text enters ledger events, diagnostics,
  DTOs, claims, readiness docs, or logs.
- No implementation commit leaves fallback prompt synthesis able to invoke a
  provider.
