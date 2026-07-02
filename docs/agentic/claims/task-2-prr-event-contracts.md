# Task 2 Claim: PRR Event Contracts

Plan path: `docs/superpowers/plans/2026-07-01-public-records-request-workflow-implementation.md`

Task heading: `## Task 2: Add PRR Event Contracts To The Knowledge Ledger`

Worker identity: Codex worker agent GPT-5

Branch: `codex/prr-workflow-design`

Worktree path: `/home/drake/.codex/worktrees/836b/Cestus`

Claimed-at UTC: `2026-07-01T15:30:25Z`

Owned files:

- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/contracts.test.ts`
- `packages/prr/src/types.ts`
- `packages/prr/src/index.ts`
- `docs/agentic/claims/task-2-prr-event-contracts.md`

Status: `ready-for-review`

## Handoff

Implemented commit: `3a08456` (`feat: add prr event contracts`)

Changed owned files:

- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/contracts.test.ts`
- `packages/prr/src/types.ts`
- `packages/prr/src/index.ts`
- `docs/agentic/claims/task-2-prr-event-contracts.md`

Summary:

- Added strict local PRR payload schemas to the ontology contract catalog.
- Registered all Task 2 PRR events in `payloadSchemas` and `eventContracts`.
- Added PRR shared status, provider, jurisdiction pack, and contact types.
- Exported PRR shared types from the PRR package entrypoint.

## Verification

Red targeted run:

```text
$ npm test -- packages/ontology/test/contracts.test.ts
Test Files  1 failed (1)
Tests  3 failed | 8 passed (11)
validates a prr.request.created event: expected false to be true
rejects unknown keys in PRR payloads: expected [ 'type' ] to include 'payload'
requires human approval before a prr.followup.sent event: expected [ 'type' ] to include 'payload.approvedBy'
```

Green targeted run:

```text
$ npm test -- packages/ontology/test/contracts.test.ts
Test Files  1 passed (1)
Tests  11 passed (11)
```

Full verification:

```text
$ npm run verify
typecheck passed
Test Files  12 passed (12)
Tests  59 passed (59)
tests passed
factory-readiness passed
```

## Concerns

- No blocking concerns.
- No schema conflict observed with existing ontology invariants.
- PRR schemas remain local to `packages/ontology/src/contracts.ts`; no PRR package code is imported into ontology contracts.
- The implementation keeps the existing typed `payloadSchemas` and `eventContracts` structure rather than replacing it, so later PRR services can use payload-correlated `KnowledgeEventOf` and `AppendableKnowledgeEvent` types.

## Review Fix Evidence

Review fix commit: `9f9f61b` (`fix: harden prr event contract schemas`)

Fix summary:

- Removed the `z.default([])` from `prr.correspondence.received` so `payload.evidenceIds` must be explicit in committed event payloads.
- Tightened `prr.fee.estimated.currency` from any three characters to uppercase ISO-style letters with `/^[A-Z]{3}$/`.
- Added table-driven valid fixtures covering every Task 2 PRR event payload.
- Added targeted negative coverage for missing correspondence evidence links, invalid evidence IDs, missing citations, missing human approval, lowercase currency, and incomplete legal escalation support.

Review red targeted run:

```text
$ npm test -- packages/ontology/test/contracts.test.ts
Test Files  1 failed (1)
Tests  2 failed | 33 passed (35)
requires explicit evidenceIds on prr.correspondence.received payloads: expected true to be false
rejects lowercase PRR fee currencies: expected true to be false
```

Review green targeted run:

```text
$ npm test -- packages/ontology/test/contracts.test.ts
Test Files  1 passed (1)
Tests  35 passed (35)
```

Review full verification:

```text
$ npm run verify
typecheck passed
Test Files  12 passed (12)
Tests  83 passed (83)
tests passed
factory-readiness passed
```

Review concerns:

- No blocking concerns.
- The correspondence event contract now requires the caller to choose and persist an explicit `evidenceIds` array, including an empty array when no evidence is linked yet.
