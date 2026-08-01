# Sourced Timeline And Contradiction Review

Status: approved.

## Desired Behavior

The resident agent can produce two local, reviewable investigative artifacts:
a sourced timeline and a contradiction-candidate dossier. Both retain exact
evidence, assertion, PRR event, content-hash, and uncertainty references. They
are advisory derivative artifacts and cannot reject assertions, mutate the
accepted graph, or become published output.

## Observable Acceptance Examples

- Given date-bearing evidence, accepted assertions, and PRR events, the
  timeline contains stable item IDs, date or range, precision, citations,
  uncertainty, and omitted-source reasons.
- An item without a source reference is rejected rather than rendered as an
  unsourced event.
- The contradiction workflow compares at least two exact source references and
  produces category, rationale, confidence caveat, alternative explanations,
  and requested follow-up evidence.
- A contradiction candidate cannot automatically reject, contest, supersede,
  or relink an assertion or claim.
- Both handoffs survive ledger/artifact replay and are visible in the selected
  Agent run with browser-safe summaries.
- Remote context transfer remains blocked without exact provider-byte-transfer
  approval; deterministic tests use local/fake execution.

## Allowed Scope

- Timeline and contradiction workflow, context-pack, handoff, runner, and
  projection files under `packages/agent/src/**` and focused tests.
- Narrow runner composition and browser-safe route DTOs under
  `packages/local-runtime/src/**` plus focused tests.
- Selected-run artifact rendering under `packages/ui/src/agent/**` and tests.
- No accepted assertion/claim mutation, provider credential use, export,
  publication, PRR send, portal action, or factory changes.

## Relevant Context Entry Points

- `AGENTS.md`
- `packages/agent/src/specialist-workflows.ts`
- `packages/agent/src/investigative-context-packs.ts`
- `packages/agent/src/specialist-runner-kernel.ts`
- `packages/agent/src/specialist-handoffs.ts`
- `packages/ontology/src/graph-projection.ts`
- `packages/prr/src/read-api.ts`

## Risk Lane

Yellow. The workflows create local, reversible advisory artifacts only.

## Targeted Verification

- `npm test -- packages/agent/test/specialist-workflows.test.ts packages/agent/test/investigative-context-packs.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoffs.test.ts`
- `npm test -- packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/ui/test/agent-run-cockpit.test.tsx`
- `npm run typecheck`

Success means every output is cited, advisory, replayable, and local/fake in
standard verification.

## Integration Verification

Run `npm run verify` against the latest `neo` and add no failure beyond the
recorded integration baseline.

## Escalation Conditions

Escalate for a new investigative conclusion policy, accepted graph or claim
mutation, remote byte transfer or credentials, external export/publication,
unavailable dependencies, or the same concrete failure after two repairs.
