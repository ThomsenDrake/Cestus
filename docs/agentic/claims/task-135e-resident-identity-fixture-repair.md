# Task 135E: Resident Identity Fixture Repair

- Status: in-progress
- Branch: `codex/task-135e-resident-identity-fixture-repair`
- Source base: `3aeebe7e7fe3e79f99ed7cbc59f58899c5cd068b`

## Scope

- `packages/local-runtime/test/resident-identity-bootstrap.test.ts`
- `docs/agentic/claims/task-135e-resident-identity-fixture-repair.md`

The default local agent runtime factory intentionally remains fail-closed until
package-owned context registrar composition is available. This task repairs the
resident-identity lifecycle fixture only: it supplies a local runtime through
the existing HTTP-handler `agentRuntimeFactory` seam, using the mounted handle
ledger and resident-identity lifecycle/ready accessors. No production factory
or context-attestation behavior is changed.

## RED Evidence

`npm test -- packages/local-runtime/test/resident-identity-bootstrap.test.ts`
failed at the source base with one failed test file and all 9 tests failing.
The first status assertion received no `identityLifecycle`, and the remaining
failures were the same downstream default-factory boundary rather than
resident-identity lifecycle regressions.

## Required Verification

- `npm test -- packages/local-runtime/test/resident-identity-bootstrap.test.ts`
- `npm run typecheck && git diff --check && npm run factory:check`

`npm run verify` is closed by the active authority-recovery gate.
