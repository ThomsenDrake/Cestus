# Cestus Resident Agent Design

Date: 2026-07-07

## Purpose

Cestus needs a native, resident AI agent. The agent is the point of the app: it remembers investigative work, helps reason over evidence, asks for permission before risky actions, proposes next moves, and turns Cestus from a passive ontology workspace into an active accountability cockpit.

This design establishes the resident Cestus Agent architecture. It separates durable agent identity, task history, memory, permissions, tool requests, audit trail, workspace context, and specialist workflows from the model providers that execute language-model calls. OpenAI, xAI, BYOK, OpenAI-compatible endpoints, local models, and future providers are interchangeable execution backends. They are not agents.

The design preserves the existing Cestus invariants:

- append-only ledger semantics
- provenance-backed assertions and claims
- rebuildable projections
- evidence-first ingestion and legacy import
- human-approved PRR send gates
- legal escalation locks
- secret-safe diagnostics
- portable workspace support
- AI-legible contracts for generic coding agents

## Goals

- Define one default resident Cestus Agent identity for the workspace.
- Let that resident identity run specialized workflows such as `ontology-bootstrap`, `prr-negotiation`, `evidence-triage`, `timeline-builder`, `contradiction-finder`, `investigation-planner`, and `report-builder`.
- Keep model providers below the agent boundary as pluggable execution backends.
- Make agent actions durable through strict event contracts, provenance, and replayable projections.
- Give the agent durable memory without making memory a hidden source of ontology truth.
- Gate external effects, byte transfer, PRR sends, legal escalation, export, destructive filesystem actions, and accepted graph changes through explicit human approvals.
- Keep secrets out of the ledger, portable workspace manifests, diagnostics, UI DTOs, reports, and factory claims.
- Scale from a single investigator laptop to a small newsroom or nonprofit team without redesigning the agent identity model.

## Non-Goals

- Creating multiple default resident agents or a marketplace of autonomous agent personas.
- Treating a model provider, subscription account, API key, OAuth session, or local model process as the agent identity.
- Building a generic credential bridge where any consumer subscription becomes a general API credential.
- Allowing the resident agent to autonomously send PRRs, threaten legal action, export sensitive reports, or accept graph truth.
- Trusting legacy old-Cestus ontology metadata as accepted graph state.
- Defining the full implementation plan for all agent runtime packages. This document gives architecture and slice boundaries only.
- Replacing the ontology ledger, ingestion runtime, PRR runtime, governance layer, or operator cockpit contracts.

## Existing Context

Cestus already has the pieces the resident agent should compose:

- `packages/ontology/src/contracts.ts` defines strict Zod event contracts, actor context, provenance, human-gated governance events, ingestion provider approval, PRR lifecycle events, legal escalation confirmation, diagnostics, and legacy import staging approvals.
- `packages/ingestion/src/provider-adapter.ts` and `packages/ingestion/src/runtime.ts` keep provider parsing behind explicit approval gates. Approval appends `ingestion.provider.approved`; provider byte transfer remains separate.
- `packages/ui/src/workspace/command-types.ts` and `packages/ui/src/workspace/command-model.ts` define an advisory command-board model with an `AgentBrief`, queue items, provenance references, and decision votes. That UI is currently advisory, not a durable resident-agent runtime.
- The legacy import design requires old-Cestus artifacts to become evidence first, with legacy-derived structure allowed only as evidence-tied `assertion.proposed` after staging approval.

The resident agent should extend these contracts rather than build a parallel truth system.

## Provider And Auth Research Basis

The provider model must be designed around credential kinds instead of assuming every provider supports OAuth or every subscription can be reused as a generic API credential.

Official OpenAI docs establish this split:

- OpenAI Codex supports signing in with ChatGPT for subscription access and with an API key for usage-based access. Codex cloud requires ChatGPT sign-in, while Codex CLI and IDE support both sign-in methods. The same OpenAI doc says general OpenAI API calls should continue to use Platform API keys when using Codex access tokens for enterprise automation. Source: [OpenAI Codex authentication](https://developers.openai.com/codex/auth).
- The OpenAI API accepts bearer credentials from API keys or short-lived access tokens created with workload identity federation, and API keys are secrets that should be loaded from an environment variable or key management service. Source: [OpenAI API authentication](https://developers.openai.com/api/reference/overview#authentication).

Official xAI docs and news establish a different but compatible split:

- xAI's public Inference REST API is OpenAI REST API compatible and authenticates requests with `Authorization: Bearer <your xAI API key>`. Source: [xAI Inference REST API overview](https://docs.x.ai/developers/rest-api-reference/inference).
- xAI's quickstart instructs developers to create an API key, set `XAI_API_KEY`, and use OpenAI SDK clients by changing the base URL to `https://api.x.ai/v1`. Source: [xAI Quickstart](https://docs.x.ai/developers/quickstart).
- xAI announced subscription OAuth flows for named local-agent integrations. OpenCode offers `xAI Grok OAuth (SuperGrok Subscription)` and a headless or remote variant; OpenClaw offers subscription sign-in and device-code onboarding for remote hosts. These are integration-specific subscription flows, not proof that xAI subscriptions are generic API credentials. Sources: [Use Grok in OpenCode](https://x.ai/news/grok-opencode) and [Use Grok in OpenClaw](https://x.ai/news/grok-openclaw).

Design consequence: Cestus models credentials as typed references with provider-specific semantics. A credential reference can represent API-key bearer auth, workload identity, subscription OAuth for a named integration, device-code OAuth for a named integration, local no-secret execution, mTLS, or a future enterprise gateway. The resident agent chooses a provider capability; the credential store supplies the matching secret outside the ledger.

## Core Architecture

The architecture has five layers.

1. Resident agent domain

   Owns the default Cestus Agent identity, task ledger, specialist run records, memory, permission state, tool requests, model invocation audit, and agent-facing projections.

2. Tool gateway

   Mediates every agent action outside pure reasoning. It exposes typed tools such as read evidence, propose assertion, draft PRR text, request provider parse approval, inspect legacy report, generate report draft, or request export. The gateway enforces policy before any side effect occurs.

3. Model provider adapters

   Execute model calls for the resident agent. Adapters expose capabilities and credential requirements but do not own memory, permissions, task history, or workspace identity.

4. Existing Cestus domain packages

   Ontology, ingestion, PRR, governance, workspace, local-runtime, and operator-status remain authoritative for their own semantics. The agent calls these through typed services and tool gateway commands.

5. UI, CLI, and local runtime surfaces

   Render agent state, accept user instructions, show pending tool requests, display run provenance, and route human approvals. Browser-facing DTOs are secret-safe and never contain raw provider credentials.

The ledger remains the canonical source of truth. Agent projections, memory views, active-task dashboards, provider health summaries, and conversation summaries are rebuildable from events and content-addressed artifacts.

## Resident Actor Identity

Cestus has one default resident agent identity per workspace:

```text
actor_cestus_agent_default
```

The identity is durable and workspace-scoped. It is not a model name, provider account, user account, or secret. It has:

- stable actor ID
- display label such as `Cestus Agent`
- actor kind `agent` once the ontology actor contract is extended
- workspace ID
- installed capability policy version
- current memory projection version
- allowed specialist run types
- active provider preference set
- audit and permission projection references

The current ontology contract supports `human`, `extractor`, and `system` actor kinds. The resident-agent contract slice should extend `actorRefSchema` with `agent`. Until that contract change exists, early internal events may use `kind: "system"` only when the event type itself carries explicit resident-agent identity. They must never masquerade as `human`.

Specialist workflows are not separate agent identities. They are run types under the resident identity. A `timeline-builder` run and a `prr-negotiation` run share the same resident identity, memory policy, permission model, and audit trail.

## Specialist Run Types

The first specialist run vocabulary is:

| Run type | Purpose | Typical outputs | Required gates |
| --- | --- | --- | --- |
| `ontology-bootstrap` | Bootstrap a fresh ontology from imported artifacts and legacy migration reports. | evidence inventory, candidate assertions, suggested local ontology extensions, import questions | raw import approval, ontology staging approval, no accepted graph events |
| `prr-negotiation` | Help draft, narrow, follow up, and reason about public records requests. | draft correspondence, deadline review, fee challenge suggestions, scope analysis | human approval before send, legal escalation confirmation before legal language |
| `evidence-triage` | Review new evidence, classify relevance, summarize, and propose next review actions. | triage notes, governance tag suggestions, assertion candidates, quarantine recommendations | evidence provenance, governance policy, human gates for sensitive opt-ins |
| `timeline-builder` | Build event timelines from evidence, PRR events, notes, and accepted assertions. | timeline drafts, uncertainty flags, missing-evidence prompts | provenance on every timeline item, no accepted fact creation |
| `contradiction-finder` | Find tension across assertions, claims, correspondence, and evidence. | contradiction candidates, confidence notes, review queue items | proposed diagnostic or claim links only, no automatic rejection of assertions |
| `investigation-planner` | Suggest investigative next steps and organize work. | task suggestions, source ideas, PRR candidates, evidence gaps | tool approval for external requests, no autonomous portal crawling |
| `report-builder` | Assemble report drafts from accepted facts, evidence, claims, and reviewed notes. | report outlines, draft sections, citation maps, export previews | export/report governance, sensitive opt-ins, legal review where required |

Each run has:

- run ID
- run type
- resident actor ID
- initiating human or system event
- workspace and investigation scope
- input artifact references and hashes
- model provider invocation references
- tool request references
- output artifact references and hashes
- diagnostics
- completion state

Runs can read accepted graph projections, evidence metadata, PRR read models, governance projections, and memory projections. Runs can propose state changes only through existing domain services and strict event contracts.

## Event Vocabulary

The resident agent needs a small, strict event family. Exact schemas belong in an implementation plan, but the vocabulary should remain stable enough for future coding agents to understand the system.

Identity and configuration:

- `agent.identity.initialized`: records the default resident identity for a workspace.
- `agent.identity.updated`: records a reviewed change to label, policy, or capability metadata.
- `agent.policy.installed`: records the active agent capability policy and human-gated action classes.

Task and run lifecycle:

- `agent.task.created`: records a durable task or user request.
- `agent.task.status.changed`: records queued, running, waiting-for-approval, blocked, completed, failed, or canceled.
- `agent.specialist-run.started`: records run type, scope, inputs, and causation.
- `agent.specialist-run.step.recorded`: records a reasoning step, tool request, or summarized model step as a durable audit artifact.
- `agent.specialist-run.completed`: records output artifact hashes and event references.
- `agent.specialist-run.failed`: records secret-safe failure, retryability, and allowed next actions.

Model execution:

- `agent.model-invocation.requested`: records selected provider adapter, model family, input artifact hash, safety classification, and credential reference ID.
- `agent.model-invocation.completed`: records output artifact hash, usage summary, model metadata, and safe diagnostics.
- `agent.model-invocation.failed`: records provider error category, retryability, and repair hints without raw secrets or unredacted provider errors.

Tool gateway:

- `agent.tool.requested`: records a typed tool request, scope, preview, estimated effect, and required approval class.
- `agent.tool.approved`: records human approval for a specific request and exact preview hash.
- `agent.tool.denied`: records human or policy denial.
- `agent.tool.completed`: records event IDs, artifact hashes, and read-model changes returned by the domain service.
- `agent.tool.failed`: records secret-safe failure and allowed repair actions.

Memory:

- `agent.memory.recorded`: records a durable memory item with scope, source events, and confidence.
- `agent.memory.superseded`: records that a newer memory replaces or corrects an earlier memory.
- `agent.memory.retracted`: removes a memory from active projections without deleting history.

Permissions and lock state:

- `agent.permission.granted`: records a bounded permission such as reading an investigation, drafting PRR text, or running a local analysis.
- `agent.permission.revoked`: records removal of a permission.
- `agent.lock.activated`: records a legal, export, secret, governance, or data-loss lock.
- `agent.lock.cleared`: records human-cleared lock state with rationale.

This vocabulary must compose with existing events. For example, a tool request that proposes an assertion ultimately calls `AssertionService.propose()` and appends `assertion.proposed`. A PRR send still appends `prr.request.sent` or `prr.followup.sent` only after the existing human-approved send path. A provider parse approval still appends `ingestion.provider.approved` and does not itself transfer bytes.

## Model Provider Abstraction

A provider adapter is a stateless or lightly stateful execution backend. It must not own resident-agent memory or authority.

Provider capability metadata should include:

- provider ID and adapter version
- endpoint kind: OpenAI API, OpenAI-compatible API, local engine, enterprise gateway, or custom adapter
- supported model IDs or model families
- supported modalities
- structured-output support
- tool-calling support
- context and output limits
- data-retention and data-transfer notes when known
- credential kind requirements
- allowed workspace scopes
- local verification fake-provider support

Credential kinds should be explicit:

- `api-key-bearer`: API key used as a bearer credential, such as OpenAI Platform API keys or xAI API keys.
- `workload-identity-token`: short-lived bearer access token minted through workload identity federation.
- `subscription-oauth`: subscription account sign-in for a named product or integration, such as Codex ChatGPT sign-in or xAI Grok OAuth inside OpenCode.
- `device-code-oauth`: subscription sign-in for headless or remote named integrations, such as xAI device-code flows for OpenClaw.
- `local-no-secret`: local model execution with no remote credential.
- `mtls-certificate`: certificate-based provider authentication when supported by an adapter.
- `enterprise-gateway`: organization-managed credential exchange through a controlled gateway.

Provider selection is policy-driven. The resident agent may prefer local models for sensitive evidence, OpenAI or xAI for coding or reasoning tasks, fake providers for tests, or a newsroom-managed gateway for team mode. The selected provider never changes who the resident agent is.

## Credential And Secret Boundaries

Cestus stores secret material outside the ontology ledger and portable workspace manifest. Acceptable storage options include OS keyring, local encrypted secret store, enterprise secret manager, or environment variables in trusted local processes.

The ledger may store only secret-free references:

- credential reference ID
- provider ID
- credential kind
- creation and rotation metadata that is safe to display
- scope labels such as `model-inference` or `provider-parse`
- human actor who authorized the reference
- revocation status

The ledger must not store:

- API keys
- bearer tokens
- OAuth access tokens
- OAuth refresh tokens
- device-code secrets
- client secrets
- private keys
- session material
- raw provider error messages that may echo credentials
- credential-shaped keys in diagnostics or raw metadata

Browser-facing UI receives only connection status, provider label, allowed capability summary, and safe next actions. It never receives secret values or raw environment names that could expose operational details.

BYOK means the user brings a credential into a secret store and Cestus records a secret-free reference. It does not mean the key is copied into the ledger, portable workspace, tracked repo files, diagnostics, model prompts, or agent memory.

## Tool Gateway And Permissions

The tool gateway is the resident agent's hands. Every tool has:

- stable tool ID
- version
- input contract
- output contract
- side-effect class
- required approval class
- allowed actor kinds
- provenance requirements
- secret-safety rules
- idempotency key rules
- rollback or compensation notes where applicable

Side-effect classes:

- `read-only`: reads projections, evidence metadata, or safe artifact text.
- `local-derivative`: creates derivative artifacts, summaries, parse outputs, or report drafts.
- `ledger-proposal`: appends proposal events such as `assertion.proposed` or diagnostic events.
- `ledger-review`: appends human review events.
- `external-byte-transfer`: sends document bytes or prompts to a provider.
- `external-message-send`: sends PRRs, follow-ups, appeals, or other correspondence.
- `export-or-publication`: produces durable exports or reports.
- `destructive-or-repair`: alters noncanonical files, rebuilds projections, or executes repair commands.
- `legal-escalation`: creates or sends legal-escalation language.

Default policy:

- The resident agent may read safe projections in its active workspace scope.
- The resident agent may create local derivative artifacts and advisory drafts when provenance is preserved.
- The resident agent may propose assertions, diagnostics, tasks, plans, and report drafts.
- The resident agent may not approve its own tool requests.
- The resident agent may not send external messages, approve provider byte transfer, clear legal locks, opt sensitive evidence into export, or accept graph truth without the required human event.
- Denied, expired, or changed-preview tool requests must fail closed.

Approval must bind the exact request preview hash, actor, timestamp, scope, and intended effect. If the request changes after approval, the approval is stale and cannot execute.

## Agent Memory

Resident-agent memory is durable, scoped, and rebuildable. It helps the agent remember workspace context without creating a second truth store.

Memory scopes:

- workspace: stable preferences and safe operating context for the portable workspace
- investigation: goals, active threads, evidence gaps, recurring entities, style choices, and review decisions
- task: short-lived context for a specific run or user request
- provider: safe model-selection observations, rate-limit state, and provider health
- policy: active permission, lock, and governance summaries

Every memory item must include:

- memory ID
- scope
- source event IDs or artifact hashes
- resident actor ID
- confidence or review state
- created timestamp
- optional expiry
- projection version

Memory can guide future actions, but it cannot become accepted graph state by itself. If memory says "Agency X is connected to Vendor Y," the agent must still propose an evidence-backed assertion or claim link and route it through the normal review path. Memory entries with secrets, raw private document bodies, or source-identifying sensitive text must be rejected or quarantined.

## UI, CLI, And Runtime Surfaces

The first user-visible shape should be an Agent workspace, not a hidden assistant inside import screens.

Core surfaces:

- Agent status: current resident identity, active run, provider status, memory health, locks, and pending approvals.
- Task history: durable user requests, specialist runs, outputs, failure states, and provenance.
- Tool requests: exact preview, required approval, expected side effect, stale status, and result.
- Memory view: scoped, source-linked memory items with supersession and retraction state.
- Provider settings: safe provider labels, capability status, credential reference status, and connection checks.
- Specialist launchers: start an approved workflow with scoped inputs, such as selected investigation, evidence set, PRR stream, or legacy migration report.

Runtime surfaces:

- Local runtime endpoints for safe agent status, tasks, runs, memory summaries, provider status, and approval queues.
- CLI commands with stable JSON for agent task creation, run inspection, approval review, and diagnostics.
- Browser UI adapters that parse runtime DTOs and render safe commands only.

The existing command-board `AgentBrief` can evolve into a projection of resident-agent state. The current advisory model should remain browser-safe and provenance-linked. React must not duplicate workspace validation, approval gates, accepted ontology decisions, PRR send execution, legal escalation, provider byte transfer, or canonical repair execution.

## Legacy Bootstrap Workflow

Legacy old-Cestus import is one specialist workflow: `ontology-bootstrap`.

The workflow begins from a legacy migration report and imported evidence, not from trusted legacy ontology truth. It may:

- ask for a folder tree listing and sanitized samples when format-specific plugins need evidence
- inspect migration reports and parser observations
- explain candidate legacy shapes
- recommend raw import approval based on report evidence
- map recognized legacy observations to imported evidence IDs
- propose evidence-tied assertions after ontology staging approval
- suggest investigation-local ontology extensions for review
- record memory about migration caveats, unsupported formats, and evidence gaps

It must not:

- mutate the old source tree
- import old ontology metadata as accepted graph state
- append `assertion.accepted`, `entity.resolved`, `relationship.accepted`, or accepted merge/split events
- treat folder layout as accepted investigation boundaries
- bypass raw import approval or ontology staging approval
- suppress quarantine or diagnostics for malformed, ambiguous, stale, contradictory, or unsupported records

The workflow's output is a bootstrap dossier: evidence inventory, report references, proposed assertion candidates, quarantine summary, local extension suggestions, and recommended next human review actions.

## PRR, Legal, And External Action Boundaries

The resident agent can draft and reason about PRRs, but existing human gates remain authoritative.

Allowed:

- draft initial request text
- suggest narrowing options
- summarize agency correspondence
- estimate deadlines from jurisdiction packs
- propose fee challenge language
- detect possible stalling
- prepare follow-up or appeal drafts
- explain legal-escalation risk

Human-gated:

- `prr.request.sent`
- `prr.followup.sent`
- `prr.appeal.created`
- `prr.legal-escalation.confirmed`
- sensitive export or report generation
- opt-in of sensitive evidence to public outputs

The agent may prepare a legal-escalation draft only as locked review material. It cannot clear the legal lock, confirm legal escalation, or send legal language.

## Team Mode

The one-default-agent model still works for small teams. Team mode adds human actors, roles, device sessions, network exposure events, and workspace policies around the same resident identity.

Team mode requirements:

- One workspace resident agent remains the default coordinator.
- Human approvals bind to specific human actors and roles.
- Provider credential references can be user-scoped, workspace-scoped, or organization-scoped.
- Tool requests record the approving actor and policy version.
- Memory can be workspace-wide or investigation-scoped with role-aware visibility.
- Portable workspace mode remains compatible with a later server-backed deployment because projections rebuild from the same event vocabulary.

If a future team needs separate named agent identities, that should be an explicit new design. The default product should not multiply personas before the resident agent is trustworthy.

## Failure Handling

Agent failures become inspectable state.

Failure categories:

- `provider-unavailable`: backend cannot be reached or model is unavailable.
- `credential-missing`: credential reference has no usable secret in the configured store.
- `credential-revoked`: provider auth fails in a way consistent with revoked or expired credentials.
- `approval-required`: requested action needs a human approval.
- `approval-stale`: request changed after approval or source bytes changed after approval.
- `permission-denied`: policy blocks the request.
- `secret-detected`: prompt, tool input, output, diagnostic, or memory item appears to contain secret material.
- `legal-lock-active`: legal escalation or risky correspondence is locked pending human confirmation.
- `projection-lag`: required read model is stale or rebuild failed.
- `provenance-missing`: proposed output lacks source event IDs, evidence IDs, or artifact hashes.
- `model-output-invalid`: provider output failed schema or policy validation.
- `external-effect-failed`: external send, export, provider parse, or report generation failed after approval.

Failure events should include:

- run ID or task ID
- related tool request ID
- safe category
- safe message
- retryability
- allowed repair actions
- related event IDs
- artifact hashes when safe

Raw provider errors must be redacted before entering diagnostics. Any suspected secret leak should create or reference an incident event and block the affected output from normal projections.

## Tests And Verification

The eventual implementation should include tests that prove:

- Agent event contracts reject unknown fields, missing provenance, non-human approvals, stale approvals, and secret-shaped payloads.
- `actorRefSchema` either supports `agent` explicitly or uses a transitional system actor without permitting human-gated actions.
- Agent projections rebuild task history, runs, tool requests, permissions, locks, model invocations, and memory from ledger events.
- Fake model providers exercise provider selection without live credentials.
- OpenAI, xAI, OpenAI-compatible, BYOK, and local adapters share the same provider interface without becoming agent identities.
- Credential references never serialize secret values into ledger events, UI DTOs, diagnostics, reports, or factory claims.
- Tool gateway tests separate approval from execution for provider byte transfer, PRR sends, legal escalation, export, and destructive repair.
- Memory items cannot create accepted graph state.
- Legacy `ontology-bootstrap` can append only evidence-first import, diagnostics, report, staging approval, and `assertion.proposed` events.
- The PRR specialist cannot append send or legal-escalation confirmation events without human context actors.
- Browser DTOs redact provider errors and expose only safe action descriptors.
- Full replay from a golden agent ledger produces deterministic projections.

Documentation-only validation for this spec is:

```bash
git diff --check
npm run factory:check
```

If a readiness script is changed in the same slice, run the broader verification gate required by the factory contract.

## Implementation-Slice Decomposition

This is not an implementation plan. Future approved plans should keep slices small and preserve the boundaries below.

1. Agent contracts and projections

   Add strict agent event contracts, resident identity, actor-kind handling, task/run/tool/memory projections, and golden replay tests.

2. Provider and credential abstraction

   Add provider adapter interfaces, fake provider tests, credential-reference contracts, secret-store boundaries, and source-backed docs for provider auth semantics.

3. Tool gateway and permission policy

   Add typed tool contracts, side-effect classes, approval preview hashes, stale approval rejection, and policy projections.

4. Agent runtime core

   Add local runtime services for task creation, run execution, model invocation routing, tool request queues, memory recording, and diagnostics.

5. Agent UI and CLI surfaces

   Add browser-safe DTOs, agent workspace screens, approval review surfaces, stable CLI JSON, and command-board integration.

6. Legacy ontology bootstrap workflow

   Add `ontology-bootstrap` orchestration over legacy migration reports, imported evidence, staging candidates, and evidence-tied assertion proposals.

7. PRR, evidence, timeline, contradiction, investigation, and report specialists

   Add each specialist as a run type that composes existing domain services and respects human gates.

8. Team and portable deployment hardening

   Add role-aware approvals, provider credential scopes, memory visibility, network/device constraints, and server-compatible projections.

Each slice should receive its own approved implementation plan, exact file scope, targeted tests, full `npm run verify`, and review gate before it becomes implementation work.

## First Slice Summary

The approved architecture is a resident Cestus Agent with one default workspace identity. Specialist workflows run under that identity. Providers are replaceable execution backends with typed credential kinds. The agent owns durable task history, memory, permissions, tool requests, audit trail, and workspace context through append-only events and rebuildable projections. It may reason, draft, summarize, propose, and request tools, but it may not bypass evidence provenance, human PRR send gates, legal escalation locks, provider byte-transfer approvals, secret safety, or legacy import's evidence-first boundary.
