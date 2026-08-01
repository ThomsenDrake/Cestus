# Governance Review And Export Preview

Status: approved.

## Desired Behavior

Cestus makes evidence-governance state reviewable and replayable. AI or rules
may propose independent governance tags with confidence and rationale; humans
may affirm, add, remove, or supersede them through append-only review. A
public-safe export preview includes only currently eligible evidence by
default and visibly lists exclusions and any human approvals that would be
required for sensitive inclusion. This slice produces previews only, not an
external export or publication.

## Observable Acceptance Examples

- A high-confidence classification can unlock an ordinary internal workflow
  under the active policy but cannot unlock PRR send, legal escalation,
  quarantine release, sensitive export, publication, or graph acceptance.
- Low-confidence, missing, failed, and unknown-tag classifications remain
  conservatively locked with a repair hint.
- A human review supersedes projected AI tags without mutating or deleting the
  original classification event.
- Rebuilding from the same ledger reproduces tag, quarantine, incident, and
  public-safe eligibility state.
- Export preview excludes private, source-identity, credential-risk,
  export-restricted, and other non-public-safe evidence by default and names
  the exact opt-in approval needed for each excluded category.
- DTOs and diagnostics contain safe references, never raw private content,
  source identities, tokens, keys, passwords, or provider errors.

## Allowed Scope

- `packages/ontology/src/governance-*`, `packages/ontology/src/contracts.ts`,
  `packages/ontology/src/jsonld-export.ts`, and focused ontology tests.
- Narrow governance read/review/preview routes in
  `packages/local-runtime/src/**` and focused tests.
- Governance review and export-preview components under
  `packages/ui/src/evidence/**` or `packages/ui/src/governance/**` and tests.
- Do not implement network exposure, device authorization, credential stores,
  actual export/publication, deletion, redaction application, or quarantine
  release in this slice.

## Relevant Context Entry Points

- `AGENTS.md`
- `packages/ontology/src/governance-policy.ts`
- `packages/ontology/src/governance-service.ts`
- `packages/ontology/src/governance-projection.ts`
- `packages/ontology/src/jsonld-export.ts`
- `packages/ontology/test/governance-service.test.ts`

## Risk Lane

Yellow. The slice implements reversible internal review and preview behavior;
the actual sensitive or external action remains human-gated and out of scope.

## Targeted Verification

- `npm test -- packages/ontology/test/governance-policy.test.ts packages/ontology/test/governance-service.test.ts packages/ontology/test/governance-projection.test.ts packages/ontology/test/governance-export.test.ts packages/ontology/test/governance-incident.test.ts`
- `npm test -- packages/ui/test/governance-review.test.tsx packages/ui/test/export-preview.test.tsx`
- `npm run typecheck`

Success means append-only review and public-safe default exclusion are proven.

## Integration Verification

Run `npm run verify` against the latest `neo`, allowing only the unrelated
baseline recorded in `docs/agentic/baselines/2026-08-01-integration-verification.md`.

## Escalation Conditions

Escalate for credential or secret-store work, authentication or device trust,
actual sensitive export/publication, quarantine release, redaction or
tombstone execution, changes to confidence policy that alter product scope,
data loss, unavailable dependency, or two failed focused repairs.
