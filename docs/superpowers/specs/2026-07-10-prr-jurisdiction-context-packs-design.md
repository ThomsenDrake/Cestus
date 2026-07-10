# PRR And Jurisdiction Context Packs Design

Date: 2026-07-10

## Purpose

This design defines the first production context-pack builders and runtime registration contract for selected public records request work:

- `prr-read-model.v1`
- `jurisdiction-pack-summary.v1`

These packs unblock resident-agent specialist workflows that need PRR context, especially `prr-negotiation`, without broadening authority, leaking unrelated request state, or weakening Cestus's append-only and provenance-first invariants. The builders produce provider-safe resolved envelopes against the shared operational context-pack resolver contract; refs alone are not sufficient for prompt rendering.

The first production contract is selected-request scoped. A PRR run receives only the selected request context plus bounded proof that other PRRs were intentionally excluded. Workspace-wide PRR aggregation is not the default and belongs in a separately named pack or a later version with its own approval.

## Goals

- Build deterministic, content-addressed resolved context envelopes for one selected PRR request.
- Bind the selected request stream, correspondence state, evidence hashes, jurisdiction pack artifact hash, pack name/version, projection high-water marks, and staleness inputs.
- Summarize lifecycle state, deadlines, fee and narrowing posture, correspondence posture, cited jurisdiction rules, diagnostics, gates, and safe source refs without raw private content.
- Keep legal posture advisory and cited to exact jurisdiction rule IDs plus the jurisdiction artifact content hash.
- Preserve active send, legal, and governance gates as non-truncatable context.
- Make omissions explicit and machine-readable without enumerating unrelated request IDs.
- Keep ledger events, readiness DTOs, and audit manifests ref-only while production prompt rendering resolves bounded selected-request payloads locally.
- Verify resolved payload bytes exactly against the ref content hash and size before any provider invocation, then parse the payload through the exact PRR pack parser keyed by context pack ID and version.
- Register builders and parsers idempotently by stable descriptor/parser/producer identity while rejecting conflicting duplicate ID/version bindings.
- Keep the packs read-only. They never send, follow up, appeal, confirm escalation, clear locks, grant approval, or execute domain effects.

## Non-Goals

- Workspace-wide PRR summaries.
- Autonomous PRR sending, follow-up sending, appeal filing, legal escalation confirmation, or lock clearing.
- Raw correspondence body transfer.
- Raw recipient lists outside a normalized, safe correspondence-state summary.
- Raw provider metadata, provider message/thread IDs in remote context, credentials, credential refs, local paths, or raw provider errors.
- New PRR lifecycle events or jurisdiction-pack semantics.
- Legal advice or uncited legal conclusions.
- Implementing the shared provider-safe `ResolvedContextPack` resolver contract; that is owned by the operational lane.
- Changes to operational or investigative context packs, specialist prompt templates, handoffs, or orchestrator files owned by other lanes, except consuming the operational resolver contract through its approved public surface.

## Existing Context

The resident-agent workflow design declares `prr-read-model.v1` and `jurisdiction-pack-summary.v1` as required context packs for PRR and downstream specialist modes. The generic context-pack registry already validates descriptors, refs, size budgets, provenance refs, stable hashes, scopes, artifact hashes, projection high-water marks, and staleness inputs.

The generic registry currently returns refs, and existing provider prompt text can only see context-pack IDs, hashes, and `safeSummary` values. That is not enough for PRR negotiation, because the selected request deadline, fee posture, correspondence state, gates, and jurisdiction rules are payload facts rather than ref metadata.

The operational lane owns the shared provider-safe resolved-envelope and content-addressed resolver contract. This PRR design depends on that contract but does not implement arbitrary hash-to-text lookup behavior.

## Resolved Payload Contract

Both PRR builders produce a provider-safe resolved envelope:

```ts
interface ResolvedContextPack {
  readonly ref: ContextPackRef;
  readonly payload: AgentContextPackJsonValue;
}
```

The resolved envelope is content-addressed:

- `ref.contentHash` is the stable hash of the canonical normalized `payload`.
- `ref.sizeBytes` is the byte length of those exact canonical payload bytes.
- `ref.contextPackId`, `ref.version`, `ref.scope`, `ref.sourceEventIds`, `ref.artifactHashes`, `ref.projectionHighWaterMark`, and `ref.stalenessInputs` summarize and bind the payload but do not replace it.
- the payload is normalized through the same provider-safe JSON boundary used for context-pack hashing.

Hash and size verification are necessary but not sufficient. The operational resolved-envelope registry/parser contract must apply a strict payload parser after hash/size verification and before prompt rendering. PRR registration supplies exact parsers for:

- `prr-read-model.v1` version `1`.
- `jurisdiction-pack-summary.v1` version `1`.

Each parser is keyed by context pack ID and version, validates the pack-specific payload shape, rejects unknown or missing required fields, and returns a frozen typed payload. Generic JSON safety cannot substitute for these pack-specific parsers. An attacker who builds a matching ref/hash for a generic JSON object with the wrong PRR payload shape must still be rejected before prompt rendering.

Ledger events, readiness DTOs, prompt manifests, approval previews, and durable audit records continue to store or reference `ContextPackRef` values only. They must not persist the PRR payload bytes.

Production prompt rendering resolves the selected PRR payloads locally through the operational content-addressed resolver and includes the exact verified and parsed payload bytes in the prompt artifact text. Before rendering or invoking a provider, the renderer recomputes the payload hash and size, compares them to the ref, and applies the registered parser for that ref's ID/version. A missing payload, mismatched payload hash, mismatched payload size, missing parser, parser rejection, wrong context pack ID/version, wrong selected-request scope, or stale resolver result blocks provider invocation with a safe error.

The resolver contract must not be an arbitrary hash-to-text callback. Callers supply or obtain bounded `ResolvedContextPack` envelopes from approved context-pack builders or an approved local resolver that has already normalized and verified the payload against the ref.

The PRR package already owns lifecycle events, projections, read API DTOs, jurisdiction packs, deadline calculation, diagnostics, stalling detection, legal escalation gates, correspondence services, and evidence bridge behavior. These packs must project from those authoritative inputs rather than duplicating domain authority inside the agent package.

## Scope Model

`prr-read-model.v1` requires:

```ts
scope: { kind: "prr-request", id: prrRequestId }
```

The builder accepts the selected request read model, selected request event stream, selected request stream head metadata, cited evidence/correspondence hashes, and bounded workspace metadata. It must not scan or materialize unrelated request records to render the selected request context.

Bounded workspace metadata is optional except for the aggregate omission proof required when the workspace contains other PRR requests:

```ts
{
  kind: "all-other-prr-requests",
  reason: "out-of-scope-selected-request",
  omittedCount,
  projectionHighWaterMark
}
```

The aggregate omission record contains no unrelated request IDs, agencies, subjects, parties, correspondence IDs, evidence IDs, or diagnostics. If the caller cannot supply `omittedCount` and the projection high-water mark needed to prove exclusion, the builder fails closed with `missing-provenance`.

Future investigation-level or workspace-level PRR summaries must be separate context packs or versions. They must not weaken the selected-request guarantees of `prr-read-model.v1`.

## PRR Read Model Pack

`prr-read-model.v1` summarizes only the selected request. Its resolved payload includes:

- schema version and selected request scope.
- request lifecycle summary: request ID, current status, agency display label, jurisdiction pack ref, selected request stream head event ID, and selected request stream sequence or high-water mark.
- deadline posture: estimated and confirmed deadline refs, confidence, date, explanation summary, cited rule refs, and source event IDs.
- fee posture: estimate/challenge state, amount summary if present, currency, cited rule refs, evidence hash refs, and event IDs.
- narrowing posture: proposed and accepted scope summaries, source evidence refs or hashes, and event IDs.
- correspondence state: latest outbound, latest inbound, follow-up drafts, follow-up sends, correspondence IDs, body/rendered-body hashes, attachment evidence hashes, event IDs, and safe normalized posture labels.
- production, exemption, denial, appeal, stalling, and legal escalation posture with event IDs and safe evidence refs.
- diagnostics tied to selected request events, with safe messages and allowed repair actions.
- active send, legal, and governance gates.
- source refs and staleness inputs.
- explicit omissions.

The pack must exclude:

- raw request text when it would carry private body material beyond a safe normalized summary.
- raw correspondence bodies and rendered bodies.
- raw unrestricted recipient sets, email body text, full headers, provider thread/message IDs, and raw provider metadata.
- credentials, credential refs, local paths, and provider error text.
- uncited legal conclusions.
- unrelated PRR request IDs or details.

Where the PRR read model contains fields that are useful locally but unsafe for provider context, the builder records a safe payload summary plus a machine-readable omission. The `safeSummary` in the ref is only a short audit summary; deadline dates, fee posture, correspondence state, gate checks, and other selected-request facts required by PRR negotiation belong in the resolved payload and must not rely on ref metadata.

## Jurisdiction Pack Summary

`jurisdiction-pack-summary.v1` binds the selected request jurisdiction. It requires the selected request's jurisdiction pack name/version and the jurisdiction artifact content hash.

The resolved payload includes:

- schema version and selected request scope.
- `packName`, `packVersion`, jurisdiction label, and `jurisdictionArtifactHash`.
- cited rule summaries by exact rule ID.
- rule category: `deadline`, `fee`, `exemption`, `appeal`, or `enforcement`.
- citation label, citation text, source URL when available, confidence label, and agent warning.
- advisory legal posture notes tied to exact rule IDs and the artifact hash.
- omissions for missing rule categories or categories outside the selected request's pack.

Version alone is not a staleness proof. The jurisdiction artifact content hash is mandatory for a usable resolved envelope. If the selected request names a jurisdiction pack but the artifact hash or exact pack content cannot be supplied, the builder fails closed with `missing-provenance`.

Legal posture is always advisory. A statement about deadline, fee, exemption, appeal, enforcement, or escalation posture must cite exact jurisdiction rule IDs and the jurisdiction artifact hash. Missing legal categories are explicit omissions, not invented conclusions.

## Non-Truncatable Gates

Active send, legal, and governance gates are non-truncatable. The builder must include their current state or fail closed.

Non-truncatable gate context includes:

- send gate checks and locked/ready posture.
- legal escalation gate checks, confirmed basis state, cited rule refs, correspondence evidence refs, and user-confirmation state.
- governance locks or policy gates relevant to the selected request, including quarantine, legal, provider-transfer, export, and sensitive-data locks when supplied by authoritative inputs.

If these gates exceed the size budget, the builder returns `context-budget-exceeded` and no context pack ref. It must not silently omit, summarize away, or mark gates ready.

## Provenance And Staleness

Both packs must bind enough data for a future runner to detect stale context before model invocation or approval consumption. Ref fields are the durable staleness and audit surface; resolved payloads are prompt-local bytes verified against those refs.

`prr-read-model.v1` provenance includes:

- selected request creation event ID.
- selected request stream head event ID and stream sequence or stream high-water mark.
- source event IDs for selected deadline, correspondence, fee, narrowing, production, denial, appeal, stalling, escalation, and diagnostic facts included in the payload.
- correspondence body/rendered-body hashes when correspondence posture is referenced.
- evidence IDs and content hashes when evidence-backed facts are referenced.
- PRR projection high-water mark.
- aggregate all-other-requests omission count and high-water mark when other requests exist.

`jurisdiction-pack-summary.v1` provenance includes:

- selected request event ID that binds the jurisdiction pack ref.
- jurisdiction artifact content hash.
- pack name and version.
- cited rule IDs and rule citation refs included in the summary.

Staleness inputs include, at minimum:

- selected request stream head event ID.
- selected request stream high-water mark.
- PRR projection high-water mark.
- jurisdiction pack artifact hash.
- correspondence/evidence content hashes referenced by the selected request.
- gate state source event IDs or policy version where available.

## Determinism

Builders are pure functions over injected inputs. They do not read ambient time, scan global workspace state, or inspect unrelated records.

The caller supplies `generatedAt`. Identical normalized inputs, including `generatedAt`, must produce identical resolved payloads, canonical payload bytes, typed parser results, content hashes, source refs, omissions, and safe summaries.

Canonical ordering rules:

- event refs by stream sequence, then event ID.
- correspondence refs by occurred-at timestamp, then event ID, then correspondence ID.
- evidence hashes by evidence ID, then hash.
- jurisdiction rules by category order, then rule ID.
- diagnostics by event ID, then diagnostic ID.
- omissions by stable kind and reason.

Every payload is normalized through the existing context-pack DTO safety boundary so accessors, symbols, sparse arrays, custom prototypes, unsafe keys, and secret-shaped values are rejected before hashing. Verification recomputes the hash and size from the normalized payload immediately before prompt rendering, then runs the strict pack parser registered for the exact ID/version.

## Runtime Registration

Registration should be narrow and explicit. The first runtime integration registers only:

- `prr-read-model.v1`
- `jurisdiction-pack-summary.v1`

The registration operation is idempotent when the same context pack ID, version, descriptor identity, parser identity, and producer registration identity are registered more than once. It conflicts when the same ID/version is registered with a different descriptor, parser, or incompatible producer registration. Idempotency must not rely only on a freshly allocated builder function or dependency object identity.

Descriptors must use conservative limits and safe policies:

- `redactionPolicy`: safe normalized summaries only.
- `requiredProvenanceKinds`: event IDs and content/artifact hashes as applicable.
- source projection names that identify PRR projection and jurisdiction pack artifacts.
- bounded max bytes suitable for selected-request context.
- strict parser registration for the exact context pack ID/version.

Shared registry integration remains a narrow implementation task. Operational packs, investigative packs, specialist prompt templates, handoffs, and orchestrator files are outside this design's implementation scope. The only prompt-rendering dependency is the operational lane's shared resolved-envelope contract: PRR code supplies verified selected-request resolved envelopes and does not add a generic hash-to-text callback.

## Error Handling

Builders fail closed with safe diagnostic categories:

- `prr-request-missing`
- `jurisdiction-pack-missing`
- `missing-provenance`
- `projection-lag`
- `context-budget-exceeded`
- `legal-lock-active`
- `secret-detected`
- `schema-conflict`

Failures must not include raw correspondence bodies, unrestricted recipients, provider metadata, credentials, local paths, raw provider errors, or unrelated request IDs.

## Tests

Implementation is test-driven. Required tests include:

- `prr-read-model.v1` requires `scope.kind === "prr-request"` and exact selected request ID.
- selected request stream head and PRR projection high-water mark are bound in refs and staleness inputs.
- unrelated request IDs are not included; only aggregate omitted count and high-water mark appear.
- missing aggregate omission proof fails when other requests are known to exist.
- correspondence summaries bind body/rendered-body/evidence hashes without raw bodies, raw recipients, provider IDs, or raw metadata.
- deadline, fee, narrowing, production, denial, appeal, stalling, escalation, and diagnostics order deterministically.
- active send, legal, and governance gates are non-truncatable and fail closed when over budget.
- `jurisdiction-pack-summary.v1` requires pack name, version, and jurisdiction artifact hash.
- legal advisory notes require exact rule IDs and jurisdiction artifact hash.
- missing rule categories produce machine-readable omissions.
- identical injected inputs produce identical context hashes.
- both builders return resolved envelopes whose payload hash and size exactly match the ref.
- PRR registrations supply exact parsers keyed by ID/version, and the resolver applies them after hash/size verification.
- an attacker-built resolved envelope with a matching ref/hash but invalid PRR payload shape is rejected by the parser before prompt rendering.
- selected deadline and jurisdiction-rule sentinel facts are present in resolved payloads, absent from `safeSummary`, and reach production prompt rendering only after ref hash, size, and parser verification.
- payload mismatch or missing local resolution blocks provider invocation before any provider call.
- hostile DTO structures and secret-shaped keys or values are rejected before hashing.
- registration is idempotent for the same ID/version/stable descriptor/parser/producer identity and conflicts for different descriptor or parser identity.
- builders have no send, follow-up, appeal, escalation-confirmation, lock-clear, approval-grant, or domain-effect path.

Documentation validation for this design is:

```bash
git diff --check
npm run factory:check
```

## Approval Record

The approved direction is selected-request scoped context for the first production PRR context-pack contract. `prr-read-model.v1` uses `scope: { kind: "prr-request", id }`, exact selected request stream and correspondence/evidence bindings, bounded aggregate omission proof for other PRRs, non-truncatable active gates, deterministic canonical output, and a no-effects boundary. `jurisdiction-pack-summary.v1` binds the selected request jurisdiction by pack name, version, exact rule IDs, and jurisdiction artifact content hash.

The amended integration direction is that both PRR builders produce provider-safe `ResolvedContextPack { ref, payload }` envelopes against the operational lane's shared content-addressed resolver and strict parser contract. Durable ledger/events/readiness surfaces keep refs only; production prompt rendering resolves the bounded selected-request and jurisdiction payloads locally, verifies exact hash and size, parses with the registered ID/version parser, and includes those approved bytes in the prompt artifact. Missing, mismatched, or parser-invalid resolution blocks provider invocation, and no arbitrary hash-to-text callback is allowed.
