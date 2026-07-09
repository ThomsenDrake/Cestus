# Task Claim: Resident Agent Provider Byte Transfer Adapter

- Plan: `docs/superpowers/plans/2026-07-09-resident-agent-domain-execution-adapters-implementation.md`
- Task: Task 6, Provider Byte Transfer Adapter Family
- Branch: `codex/resident-agent-domain-adapters-plan`
- Worktree: `/home/drake/.codex/worktrees/7018/Cestus`
- Worker: Codex
- Claimed at: 2026-07-09T20:51:22Z
- Base commit: `6aada69 feat: add export and report execution adapters`
- Status: completed

## Scope

Implement resident-agent descriptors for `provider.bytes.transfer` and `ingestion.provider-parse.execute` over the existing provider approval, readiness, prompt-artifact audit, and ingestion projection contracts.

The current ingestion runtime records `ingestion.provider.approved` and projects a queued provider job, but exposes no ingestion-owned byte-transfer or provider-parse executor. Both execution paths therefore remain fail-closed after consume-time revalidation. This task must not call `DocumentAiProvider.parse()` or the separate Nous model-invocation runtime as a substitute.

## Files

- Create: `packages/agent/src/adapters/provider-byte-transfer.ts`
- Create: `packages/agent/test/provider-byte-transfer-adapter.test.ts`
- Modify: `packages/agent/src/index.ts`
- Do not modify ingestion/provider execution services unless a domain-owned executor is discovered on the current branch.

## Verification

- RED/GREEN focused: `npm test -- packages/agent/test/provider-byte-transfer-adapter.test.ts`
- Domain target: `npm test -- packages/agent/test/provider-byte-transfer-adapter.test.ts packages/ingestion/test/provider-adapter.test.ts packages/ingestion/test/runtime-jobs-provider.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/provider-readiness.test.ts`
- Live provider smoke where supported: `npm run agent:nous:smoke`
- Available local gates: `npm run typecheck`, `npm run ui:build`, `npm run factory:check`, `npm run verify`, and `git diff --check`.

## Implementation Evidence

- Added canonical `provider.bytes.transfer` and `ingestion.provider-parse.execute` descriptors.
- Rebuilds the current preview from the exact human-attested `ingestion.provider.approved` event, exact evidence and ingestion-link payloads, current provider capability/readiness, current prompt-artifact audit metadata, governance projection, and active resident-agent locks.
- Revalidates preview hash, source event IDs, artifact hashes, provenance refs, readiness health, provider policy, media/byte limits, evidence-bound prompt audit, and deterministic idempotency before execution.
- Both descriptors deliberately return `domain-gate-failed` after successful consume-time revalidation because `IngestionRuntime` exposes no provider execution service. No provider, parser, model, byte, prompt, credential resolver, or generic executor callback is accepted.
- Agent lifecycle coverage proves the gateway records only the generic safe failure and never raw bytes, prompt text, provider payloads, auth material, or environment setting names.

## Test Evidence

- Initial RED: focused test failed because `packages/agent/src/adapters/provider-byte-transfer.ts` did not exist.
- Review RED: focused tests exposed missing human provider-approval attestation, swapped ingestion-link payload acceptance, incomplete prompt/evidence binding, idempotency insensitivity, unhealthy readiness acceptance, and unvalidated prompt run types.
- GREEN focused: `npm test -- packages/agent/test/provider-byte-transfer-adapter.test.ts` -> 1 file passed, 12 tests passed.
- GREEN domain target: `npm test -- packages/agent/test/provider-byte-transfer-adapter.test.ts packages/ingestion/test/provider-adapter.test.ts packages/ingestion/test/runtime-jobs-provider.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/provider-readiness.test.ts` -> 5 files passed, 51 tests passed.
- `npm run typecheck` -> passed.
- `npm test -- --exclude packages/local-runtime/test/server.test.ts --exclude packages/local-runtime/test/workspace-readiness-smoke.test.ts --exclude packages/workspace-ops/test/cli.test.ts` -> 148 files passed, 1 skipped; 1488 tests passed, 1 skipped.
- `npm run ui:build` -> passed; 153 modules transformed.
- `npm run verify` -> typecheck passed; test stage reported 148 files passed, 1 skipped, 3 failed and 1504 tests passed, 1 skipped, 19 failed. All 19 failures are sandbox-only socket/IPC restrictions in `packages/local-runtime/test/server.test.ts`, `packages/local-runtime/test/workspace-readiness-smoke.test.ts`, and `packages/workspace-ops/test/cli.test.ts` (`listen EPERM` for `127.0.0.1`, `0.0.0.0`, or `/tmp/tsx-1000/*.pipe`). The verifier stopped before build/readiness; build was run separately and passed.
- `npm run factory:check` -> sandbox-blocked at `spawnSync git EPERM` while running `git ls-files`.
- `npm run agent:nous:smoke` -> safely blocked before provider invocation with `provider-settings-unavailable`; no credential or provider payload was emitted.
- Coordinator verification: unrestricted `npm run verify` passed with 151 passed / 1 skipped test files and 1523 passed / 1 skipped tests, followed by the Vite production build and factory readiness check.

## Review

- Fresh delegated reviewer was bounded, interrupted for a verdict, and closed after producing no findings or verdict.
- Inline Cestus review found and repaired the approval actor, ingestion-link payload, prompt/evidence binding, readiness health, idempotency, and run-type boundary issues listed above.
- Final verdict: **APPROVED**. No Critical or Important findings remain. Residual dependency: provider execution remains intentionally unavailable until ingestion owns and exposes the executor.

## Stop Conditions

- Stop before Task 7 or any PRR correspondence change.
- Stop before transferring raw bytes or prompt text without an ingestion-owned executor and exact matching domain approval.
- Stop before using the Nous chat provider as an ingestion document parser.
- Stop on missing, stale, swapped, or forged evidence hashes, prompt artifact hashes, provider approval payloads, descriptor/readiness state, credential refs, transfer policy, media types, byte counts, provenance refs, preview hashes, or active locks.
- Stop if any credential material, raw provider payload, raw document body, raw prompt text, or unsafe provider error could enter a diff, log, diagnostic, or agent lifecycle event.
- Stop if Git metadata write is required; leave the complete Task 6 diff for coordinator verification.
