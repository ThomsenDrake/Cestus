# Task 5: Builder Submit Appends Replayable Draft Events

Plan: `docs/superpowers/plans/2026-07-03-ledger-backed-prr-workspace-implementation.md`
Task heading: `Task 5: Builder Submit Appends Replayable Draft Events`
Worker: Codex
Branch: `codex/prr-ledger-backed-workspace-design`
Worktree: `/home/drake/.codex/worktrees/3ea1/Cestus`
Claimed at: `2026-07-03T22:34:52Z`
Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-5-builder-draft-append.md`
- `packages/ui/src/requests/request-types.ts`
- `packages/ui/src/requests/request-adapter.ts`
- `packages/ui/src/requests/RequestBuilder.tsx`
- `packages/ui/src/App.tsx`
- `packages/ui/test/request-builder.test.tsx`
- `packages/ui/test/app-smoke.test.tsx`
- `packages/ui/test/request-data-boundary.test.ts`

## Supporting Edits

None.

## Command Evidence

- Follow-up red targeted command for code-quality review fixes:

```bash
npm test -- packages/ui/test/request-builder.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/request-data-boundary.test.ts
```

Result: failed as expected before production changes. Vitest reported 3 targeted files, with 4 failing tests: duplicate generated request streams still appended successfully, unsupported local replay failures returned raw/redaction-shaped diagnostics instead of fixed step diagnostics, and invalid/empty builder forms still called `onSubmit`.

- Follow-up green targeted command:

```bash
npm test -- packages/ui/test/request-builder.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/request-data-boundary.test.ts
```

Result: passed. Vitest reported 3 test files passed and 21 tests passed.

- Follow-up full verification:

```bash
npm run verify
```

Result: passed. Typecheck passed; Vitest reported 40 test files passed and 315 tests passed; UI build completed; factory-readiness passed.

- Red targeted command:

```bash
npm test -- packages/ui/test/request-builder.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/request-data-boundary.test.ts
```

Result: failed as expected before production changes. After fixing a test self-scan issue, the intended red run had 5 failing tests: missing `Agency name` field, missing `Create draft` action, and missing `adapter.createDraftRequest`.

- Green targeted command:

```bash
npm test -- packages/ui/test/request-builder.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/request-data-boundary.test.ts
```

Result: passed. Vitest reported 3 test files passed and 17 tests passed.

- Full verification:

```bash
npm run verify
```

Result: passed. Typecheck passed; Vitest reported 40 test files passed and 311 tests passed; UI build completed; factory-readiness passed.

## Review

- Review status: ready for reviewer after follow-up fixes.
- Findings fixed:
  - Critical: local replay draft creation now rejects an existing generated request stream before reserving or appending events, and commits draft events only at expected stream sequences 1 and 2.
  - Important: the builder now blocks empty minimum draft fields and invalid received timestamps before calling `onSubmit`, with user-safe validation messages.
  - Important: local replay adapter failures now return fixed diagnostics keyed by failed step rather than raw exception, Zod, or input text.
- Deferred polish: `buildPrrBuilderModel` still drops `workspace.builder.jurisdictionPacks`; this remains outside the Task 5 allowed file set as requested.
- Concerns: none recorded.
