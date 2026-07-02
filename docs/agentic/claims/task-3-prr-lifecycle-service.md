# Task 3 PRR Lifecycle Service Claim

Plan path: `docs/superpowers/plans/2026-07-01-public-records-request-workflow-implementation.md`

Task heading: `Task 3: Add Lifecycle Service And Transition Rules`

Worker identity: Codex worker agent

Branch: `codex/prr-workflow-design`

Worktree path: `/home/drake/.codex/worktrees/836b/Cestus`

Claimed-at UTC: `2026-07-01T15:53:53Z`

Owned files:

- `packages/prr/src/lifecycle.ts`
- `packages/prr/test/lifecycle.test.ts`
- `packages/prr/src/index.ts`
- `docs/agentic/claims/task-3-prr-lifecycle-service.md`

Status: `ready-for-review`

## Handoff

Implemented Task 3 only.

Changed files:

- `packages/prr/src/lifecycle.ts`
- `packages/prr/test/lifecycle.test.ts`
- `packages/prr/src/index.ts`
- `docs/agentic/claims/task-3-prr-lifecycle-service.md`

Implementation commit: `febc5a1f812b1918d312c89ce755ca93115964dc`

## Verification

Red test command:

```bash
npm test -- packages/prr/test/lifecycle.test.ts
```

Red result: failed as expected before implementation.

```text
Error: Cannot find module '../src/lifecycle.js'
Test Files  1 failed (1)
Tests  no tests
```

Green test command:

```bash
npm test -- packages/prr/test/lifecycle.test.ts
```

Green result:

```text
Test Files  1 passed (1)
Tests  2 passed (2)
```

Full verification command:

```bash
npm run verify
```

Full verification result:

```text
typecheck passed
Test Files  13 passed (13)
Tests  85 passed (85)
tests passed
factory-readiness passed
```

## Concerns

None.

## Review Fix Evidence

Review fix commit: `95415f8`

Addressed review findings:

- `createRequest()` now appends with `expectedNextSequence: 1`, so duplicate create events for a request stream are rejected by the ledger concurrency guard.
- `markRequestSent()` now rejects a stream that already contains `prr.request.sent`.
- Lifecycle tests now cover duplicate create rejection, successful sent event sequence/causation/correlation/payload, and duplicate sent rejection.

Review red test command:

```bash
npm test -- packages/prr/test/lifecycle.test.ts
```

Review red result before fix:

```text
Test Files  1 failed (1)
Tests  2 failed | 3 passed (5)
prevents duplicate request creation for the same request stream: promise resolved instead of rejecting
prevents duplicate request sent events for the same request stream: promise resolved instead of rejecting
```

Review green test command:

```bash
npm test -- packages/prr/test/lifecycle.test.ts
```

Review green result:

```text
Test Files  1 passed (1)
Tests  5 passed (5)
```

Review full verification command:

```bash
npm run verify
```

Review full verification result:

```text
typecheck passed
Test Files  13 passed (13)
Tests  88 passed (88)
tests passed
factory-readiness passed
```

Review-fix concerns: none.
