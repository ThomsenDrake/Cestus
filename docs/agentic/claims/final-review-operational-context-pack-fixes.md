# Final Review Operational Context Pack Fixes

Task: latest whole-branch Critical and Important review repairs for operational context packs

Branch: `codex/operational-context-packs-spec`

Worktree: `/home/drake/.codex/worktrees/a559/Cestus`

Status: complete

## Scope

Owned files changed:

- `packages/agent/src/operational-context-packs.ts`
- `packages/agent/test/operational-context-packs.test.ts`
- `packages/agent/src/memory.ts`
- `packages/agent/test/memory.test.ts`
- `docs/agentic/claims/final-review-operational-context-pack-fixes.md`

No local-runtime, cockpit, prompt, PRR, evidence, graph, handoff, orchestrator, or UI files were edited.

## RED Evidence

Command:

```bash
npm test -- packages/agent/test/operational-context-packs.test.ts packages/agent/test/memory.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/specialist-readiness.test.ts
```

Result: failed as expected with 1 review-defect failure and 129 passing tests.

The direct public memory builder accepted `Provider failed after returning the raw response body.` because the shared operational-text policy recognized `provider error` and `provider failure`, but not `provider failed`.

## GREEN Evidence

Command:

```bash
npm test -- packages/agent/test/operational-context-packs.test.ts packages/agent/test/memory.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/specialist-readiness.test.ts
```

Result: passed with 4 test files and 130 tests.

The final focused suite covers payload/ref swaps across source metadata, size budgets, and staleness inputs for all three operational packs; direct memory-builder rejection of raw provider failures, prompt/model output, stack traces, and raw paths; contradictory lifecycle state; deterministic safety-record trimming; and machine-readable empty reasons.

## Critical Re-Review Repair

RED: the exact targeted command failed with 1 new regression failure and 130 passing tests. A resolver-backed legacy ref with hash-consistent raw prompt text in `safeSummary` was accepted by `buildResolved()`; the regression matrix also covers raw provider prose in `provenanceRefs`, raw model-output prose in `policyVersion`, and a raw path in an extra staleness input. Each case confirms legacy ref-only `build()` remains available.

GREEN: the same command passed with 4 test files and 131 tests. Operational parsers now apply safe-text or machine-reference validation to resolver ref metadata, enforce a machine-readable policy token, and accept only the pack-specific high-water and workspace omission staleness shapes. Resolver failures return only `blocked.payload-schema-mismatch`, without echoing raw material.

## Direct Memory-Builder Repair

RED: the exact targeted command failed as expected with 2 new memory regressions and 131 passing tests. The canonical memory builder normalized a direct snapshot before rejecting unsafe source metadata, and an accessor-backed builder input could be read and return a pack.

GREEN: the same command passed with 4 test files and 133 tests. Both public memory-builder APIs now reject raw scope paths, prose policy versions, invalid generated times, negative high-water marks, nonpositive budgets, and accessor-backed builder input before snapshot normalization or resolved-envelope/ref construction.

VERIFY: `npm run verify` passed with `typecheck passed`, 171 passed test files / 3 skipped, 1783 passed tests / 3 skipped, Vite production build, and `factory-readiness passed`. Non-blocking output was limited to established Node SQLite experimental warnings plus Vite browser-externalization and chunk-size warnings.

## Full Verification Evidence

Command:

```bash
npm run verify
```

Result: passed with `typecheck passed`, 171 passed test files / 3 skipped, 1781 passed tests / 3 skipped, Vite production build, and `factory-readiness passed` after the resolver-metadata repair.

Non-blocking output was limited to the established Node SQLite experimental warnings plus Vite browser-externalization and chunk-size warnings.
