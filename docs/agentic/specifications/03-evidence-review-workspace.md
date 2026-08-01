# Evidence Review Workspace

Status: approved.

## Desired Behavior

Cestus provides an Evidence module for reviewing the corpus created by
ingestion. An investigator can filter evidence, inspect source occurrences and
content hashes, see parse and governance state, understand request or
investigation linkage, and prepare evidence-backed assertion candidates. The
workspace never promotes parser or model output directly into accepted graph
truth.

## Observable Acceptance Examples

- Opening `Evidence` loads browser-safe runtime DTOs instead of a placeholder.
- Duplicate source occurrences resolve to one canonical evidence item while
  every path and archive-internal occurrence remains inspectable.
- Evidence detail shows content hash, source collection, import batch, parser
  identity/version, derivative hashes, governance tags, quarantine state, and
  linked PRR or investigation references when present.
- A quarantined or provenance-incomplete item cannot be selected for ordinary
  assertion-candidate preparation and explains the blocking reason.
- Preparing an assertion candidate records or returns evidence references and
  review-required state; it does not append `assertion.accepted`.
- Runtime or projection failure renders a secret-safe diagnostic and no
  fallback evidence fixture.

## Allowed Scope

- `packages/ingestion/src/read-api.ts`, `packages/ingestion/src/projection.ts`,
  `packages/ontology/src/evidence-service.ts`, and their focused tests.
- A narrow evidence read/proposal route under `packages/local-runtime/src/**`
  and its tests.
- `packages/ui/src/evidence/**`, minimum module routing in
  `packages/ui/src/App.tsx`, workspace navigation, and focused UI tests.
- No provider calls, accepted assertion review, export, publication, source
  mutation, credential handling, or factory changes.

## Relevant Context Entry Points

- `AGENTS.md`
- `packages/ingestion/src/read-api.ts`
- `packages/ontology/src/evidence-service.ts`
- `packages/ontology/src/governance-projection.ts`
- `packages/ui/src/ingestion/ingestion-types.ts`

## Risk Lane

Yellow. This is a read-and-propose product surface that preserves the existing
human acceptance and governance boundaries.

## Targeted Verification

- `npm test -- packages/ingestion/test/read-api.test.ts packages/ingestion/test/projection.test.ts packages/ontology/test/evidence-service.test.ts packages/ontology/test/governance-projection.test.ts`
- `npm test -- packages/ui/test/evidence-workspace.test.tsx packages/ui/test/evidence-app-integration.test.tsx`
- `npm run typecheck`

Success means evidence is provenance-complete, governed, and proposal-only.

## Integration Verification

Run `npm run verify` against the latest `neo`; accept only the recorded baseline
in `docs/agentic/baselines/2026-08-01-integration-verification.md` and no new
failure.

## Escalation Conditions

Escalate for new evidence truth semantics, automatic graph acceptance,
quarantine release, external byte transfer, sensitive export, credentials,
source mutation, data loss, unavailable dependencies, or the same failure
remaining after two focused repairs.
