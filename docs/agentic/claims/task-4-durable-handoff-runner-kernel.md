# Task 4 Durable Specialist Handoff Runner Kernel Claim

Status: ready-for-review
Branch: codex/durable-specialist-handoffs-core
Worktree: /home/drake/.codex/worktrees/1542/Cestus
Claimed At: 2026-07-11T22:28:08Z
Claim Base: 128d0273

Plan: docs/superpowers/plans/2026-07-10-durable-specialist-handoff-production-implementation.md
Spec: docs/superpowers/specs/2026-07-10-durable-specialist-handoff-production-design.md

Scope:
- packages/agent/src/specialist-runner-kernel.ts
- packages/agent/test/specialist-runner-kernel.test.ts
- packages/agent/src/index.ts
- docs/agentic/claims/task-4-durable-handoff-runner-kernel.md

Post-Wave-3 Preflight:
- Branch is fast-forwarded to Wave 3 merge tip 128d0273.
- Wave 3 production prompt/output migration is present in `specialist-runner-kernel.ts`: `prepareSpecialistRun`, `invokeSpecialistModel`, production prompt registration/render/verification, invocation proof minting, provider byte-transfer approval checks, resolved-context verification, strict provider output validation consumers, and derivative artifact persistence remain intact.
- Final-output step fields and `agent.specialist-handoff.prepared` / `agent.specialist-handoff.recorded` contracts are already present and routed to `agent_run_${runId}`.
- `EventLedger.append` supports `expectedNextSequence`, and the concrete ledgers enforce it.
- Current specialist descriptors expose provider-output and handoff schema IDs, not a separate final-output-step schema field. Task 4 now verifies recorded handoffs against the authoritative production handoff schema for the run type and will not edit prompt-template, context-pack builder, lifecycle-bootstrap, or orchestrator files.
- Current derivative artifact store exposes `put`; Task 4 handoff manifest storage requires `put` and `get` through a separate manifest store interface so readback can verify content-addressed bytes without changing Wave 3 prompt artifact contracts.

RED:
- Command: `npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts`
- Expected failure: lifecycle helpers and last-sequence helper do not exist or do not yet enforce durable final-output -> prepared -> recorded/readback -> terminal order.
- Observed 2026-07-11: FAIL as expected. Seven new lifecycle tests failed with `TypeError` because `expectedNextSequenceFromStream` and `appendSpecialistFinalOutputStep` are not functions; the Task 3 handoff projection suite passed (38 tests).
- Repair RED 2026-07-11: FAIL as expected. Six focused regressions failed: forged finalization was accepted, mutation crossed an await, final-output schema was unchecked, an exact append race escaped, stale task status was ignored, and revision-two supersession was rejected. Task 3 projection tests still passed.
- Repair 2-4 RED 2026-07-11: FAIL as expected. Re-review regressions showed caller-controlled schema/provenance, invalid supersession recording, post-completion finalization retry failure, and exact-plus-conflicting race companion acceptance for final-output, prepared, recorded, terminal, and task-status appends.

GREEN:
- Command: `npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts`
- Expected pass: all named lifecycle and projection tests pass.
- Observed 2026-07-11: PASS. Test Files 2 passed; Tests 45 passed (20 runner-kernel, 25 handoff-projection).
- Repair GREEN 2026-07-11: PASS. Test Files 2 passed; Tests 51 passed, including forged-result, snapshot/accessor, schema, race, task-status, and supersession regressions.
- Repair 4 GREEN 2026-07-11: PASS. Test Files 2 passed; Tests 55 passed, including authoritative schema, ledger-bound provenance, supersession pre-record, post-completion idempotency, and exact-plus-conflicting race companion regressions.

Verification:
- Command: `npm run verify`
- Status: blocked by sandbox socket restrictions after Task 4 typecheck passed. Fresh run observed:
  - `packages/local-runtime/test/server.test.ts`: seven failures from `listen EPERM` on `127.0.0.1` or `0.0.0.0`.
  - `packages/local-runtime/test/workspace-readiness-smoke.test.ts`: one downstream empty-stdout JSON parse failure.
  - `packages/workspace-ops/test/cli.test.ts`: eleven failures because `tsx` cannot create `/tmp/tsx-1000/*.pipe` IPC listeners (`listen EPERM`), plus downstream exit-code/stdout assertions.
  - Overall after review repair: 3 failed files, 19 failed tests, 175 passed files, 2050 passed tests, 3 skipped files, 3 skipped tests. No Task 4-owned test failed.
- Repair verification 2026-07-11: `npm run verify` typecheck passed. The full suite still reaches only sandbox-bound failures; direct server confirmation found seven `listen EPERM` failures on `127.0.0.1` or `0.0.0.0`.
- Repair 2 verification 2026-07-11: targeted runner/projection tests passed (51 tests) and typecheck passed; full verification remains blocked only by sandbox socket/IPC `EPERM` failures in local-runtime and dependent readiness tests.
- Repair 4 verification 2026-07-11: targeted runner/projection tests passed (55 tests). Fresh `npm run verify` typecheck passed, then failed only in sandbox-bound suites: `packages/local-runtime/test/server.test.ts` (7 `listen EPERM` socket failures), `packages/local-runtime/test/workspace-readiness-smoke.test.ts` (1 dependent empty-stdout JSON parse), and `packages/workspace-ops/test/cli.test.ts` (11 `tsx` IPC pipe `listen EPERM` / downstream assertion failures). Overall: 3 failed files, 19 failed tests, 175 passed files, 2054 passed tests, 3 skipped files, 3 skipped tests. No Task 4-owned test failed.

Review:
- Spec review: blocked 2026-07-11. Fresh Task 4 re-review found remaining critical issues:
  - `appendSpecialistFinalOutputStep` still allowed a caller-selected schema to persist before authoritative validation; this is fixable in the helper before append.
  - Rich manifest metadata (`contextPackRefs`, `outputArtifacts`, approval requirements, next actions, failure, and source/related refs) is not fully reconstructible from the current final-output event plus manifest store interface, so the helper still risks synthetic provenance if it copies caller-provided metadata after loose hash/event membership checks.
  - Supersession pre-record validation must compare the full preserved anchor set before appending `agent.specialist-handoff.recorded`.
- Code review: blocked on the same synthetic-provenance and pre-record supersession issues.
- Stop condition: synthetic provenance / partial-effect ambiguity. Continuing safely requires an explicit approved durable source for handoff material before `prepared` (for example a ledger-bound, content-addressed handoff-material artifact referenced by the final-output step, or a narrow event-contract extension) before Task 4 can claim spec compliance.

Coordinator Amendment 2026-07-11:
- The synthetic-provenance stop condition is resolved by the approved narrow content-addressed `agent-specialist-handoff-material.v1` artifact contract.
- Task 4 resumes with TDD for ontology contracts, manifest/projector readback, and runner-kernel lifecycle helpers.
- The implementation must persist canonical material bytes and exact-byte readback before final-output append, carry `handoffMaterialArtifactHash` through final-output/prepared/recorded/manifest, and derive recorded handoff material only from ledger-bound final-output refs plus verified content-addressed artifacts.

Amendment RED 2026-07-11:
- `npm test -- packages/ontology/test/agent-contracts.test.ts`: FAIL as expected, 3 failed and 52 passed; final-output rejected the new material hash while prepared/recorded still accepted its omission.
- `npm test -- packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: FAIL as expected, 44 failed and 32 passed; canonical material helpers were absent and lifecycle/projector APIs had no ledger-bound material path.

Amendment GREEN 2026-07-11:
- `npm test -- packages/ontology/test/agent-contracts.test.ts`: PASS, 1 file and 55 tests.
- `npm test -- packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 3 files and 76 tests.
- Controller RED repair: `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: FAIL as expected, 3 failed and 57 passed; projection accepted ambiguous final-output material/idempotency, runner omitted context-pack artifact hashes from final-output inputs, and runner accepted a foreign-run tool request ID.
- Controller GREEN repair: `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 2 files and 60 tests.
- Final targeted command: `npm test -- packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 3 files and 79 tests.
- `npm run verify`: typecheck phase PASS (`typecheck passed`).
- `git diff --check`: PASS.

Amendment Verification 2026-07-11:
- `npm run verify` reached `typecheck passed` and then failed only in sandbox-bound suites in the fresh run:
  - `packages/local-runtime/test/server.test.ts`: 7 `listen EPERM` socket-bind failures on `127.0.0.1` or `0.0.0.0`.
  - `packages/local-runtime/test/workspace-readiness-smoke.test.ts`: 1 dependent operator-command empty-stdout JSON parse failure.
  - `packages/workspace-ops/test/cli.test.ts`: 11 `tsx` IPC pipe `listen EPERM` failures plus downstream exit-code/stdout assertions.
  - Overall: 3 failed files, 19 failed tests, 175 passed files, 2069 passed tests, 3 skipped files, and 3 skipped tests. No Task 4-owned test failed.
- A direct `npm run factory:check` retry failed because `scripts/check-agent-readiness.mjs` could not `spawnSync git ls-files` in this sandbox (`EPERM`).
- Git metadata is read-only for this worker; no commit was attempted.

Review Repair RED 2026-07-11:
- Fresh review blocked on three Important gaps: referenced artifact readback was self-validating before final-output append, projector replay accepted forged final-output schemas, and supersession anchors omitted non-presentation fields.
- `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: FAIL as expected, 4 failed and 59 passed. Failures covered missing/mismatched content-addressed artifact bytes, forged final-output schema replay, output descriptor supersession drift, and approval-requirement supersession drift.

Review Repair GREEN 2026-07-11:
- `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 2 files and 63 tests.
- `npm test -- packages/ontology/test/agent-contracts.test.ts`: PASS, 1 file and 55 tests.
- `npm test -- packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 3 files and 82 tests.
- `npm run verify`: typecheck phase PASS (`typecheck passed`); test phase failed only in the known sandbox-bound suites:
  - `packages/local-runtime/test/server.test.ts`: 7 `listen EPERM` socket-bind failures on `127.0.0.1` or `0.0.0.0`.
  - `packages/local-runtime/test/workspace-readiness-smoke.test.ts`: 1 dependent operator-command empty-stdout JSON parse failure.
  - `packages/workspace-ops/test/cli.test.ts`: 11 `tsx` IPC pipe `listen EPERM` failures plus downstream exit-code/stdout assertions.
  - Overall: 3 failed files, 19 failed tests, 175 passed files, 2072 passed tests, 3 skipped files, and 3 skipped tests. No Task 4-owned test failed.
- `git diff --check`: PASS.
- `npm run factory:check`: still blocked by sandbox `spawnSync git ls-files` `EPERM`.

Mencius Review Repair RED 2026-07-11:
- Fresh final review blocked on two P1 gaps:
  - Restart recording/projecting could accept a final-output event with a forged idempotency key.
  - The supersession final-output exception accepted a same-material prior companion instead of requiring the actual prior recorded handoff's final-output event and deterministic prior idempotency key.
- `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: FAIL as expected, 2 files with 3 failed and 60 passed. Failures covered forged final-output idempotency in projection, forged idempotency during restart recording, and a forged-idempotency prior final-output companion during supersession append.

Mencius Review Repair GREEN 2026-07-11:
- `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 2 files and 72 tests.
- `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 4 files and 146 tests.
- `npm run verify`: typecheck phase PASS (`typecheck passed`); test phase failed only in the known sandbox-bound suites:
  - `packages/local-runtime/test/server.test.ts`: 7 `listen EPERM` socket-bind failures on `127.0.0.1` or `0.0.0.0`.
  - `packages/local-runtime/test/workspace-readiness-smoke.test.ts`: 1 dependent operator-command empty-stdout JSON parse failure.
  - `packages/workspace-ops/test/cli.test.ts`: 11 `tsx` IPC pipe `listen EPERM` failures plus downstream exit-code/stdout assertions.
  - Overall: 3 failed files, 19 failed tests, 175 passed files, 2081 passed tests, 3 skipped files, and 3 skipped tests. No Task 4-owned test failed.
- `git diff --check`: PASS.
- `npm run factory:check`: still blocked by sandbox `spawnSync git ls-files` `EPERM`.
- Final review: APPROVED. Reviewer reran `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`; PASS, 2 files and 72 tests.

Aquinas Review Repair RED 2026-07-11:
- Fresh re-review blocked on one P1 gap: final-output exact retry/race could return success while another same-run final-output companion used a different material hash/schema/idempotency/output binding.
- `npm test -- packages/agent/test/specialist-runner-kernel.test.ts`: FAIL as expected, 1 failed and 36 passed. The new test showed exact retry returning success over a different-material final-output companion.

Aquinas Review Repair GREEN 2026-07-11:
- `npm test -- packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 1 file and 37 tests.
- `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 2 files and 70 tests.
- `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 4 files and 144 tests.
- `npm run verify`: typecheck phase PASS (`typecheck passed`); test phase failed only in the known sandbox-bound suites:
  - `packages/local-runtime/test/server.test.ts`: 7 `listen EPERM` socket-bind failures on `127.0.0.1` or `0.0.0.0`.
  - `packages/local-runtime/test/workspace-readiness-smoke.test.ts`: 1 dependent operator-command empty-stdout JSON parse failure.
  - `packages/workspace-ops/test/cli.test.ts`: 11 `tsx` IPC pipe `listen EPERM` failures plus downstream exit-code/stdout assertions.
  - Overall: 3 failed files, 19 failed tests, 175 passed files, 2079 passed tests, 3 skipped files, and 3 skipped tests. No Task 4-owned test failed.
- `git diff --check`: PASS.
- `npm run factory:check`: still blocked by sandbox `spawnSync git ls-files` `EPERM`.

Second Review Repair RED 2026-07-11:
- Fresh re-review blocked on two Important gaps:
  - Projector replay did not require exactly one ledger-bound `agent.specialist-run.started` identity and derived final-output schema authority from manifest `runType` instead of run-started authority.
  - Runner/projector validated only top-level `toolRequestIds`, allowing nested approval/action/failure tool refs to name missing or foreign tool requests.
- `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: FAIL as expected, 2 files with 3 failed and 63 passed. Failures covered missing/duplicate run identity, nested projection tool refs absent from top-level same-run requests, and nested runner material tool refs absent from top-level same-run requests.

Second Review Repair GREEN 2026-07-11:
- `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 2 files and 66 tests.
- `npm test -- packages/ontology/test/agent-contracts.test.ts`: PASS, 1 file and 55 tests.
- `npm test -- packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 3 files and 85 tests.
- `npm run verify`: typecheck phase PASS (`typecheck passed`); test phase failed only in the known sandbox-bound suites:
  - `packages/local-runtime/test/server.test.ts`: 7 `listen EPERM` socket-bind failures on `127.0.0.1` or `0.0.0.0`.
  - `packages/local-runtime/test/workspace-readiness-smoke.test.ts`: 1 dependent operator-command empty-stdout JSON parse failure.
  - `packages/workspace-ops/test/cli.test.ts`: 11 `tsx` IPC pipe `listen EPERM` failures plus downstream exit-code/stdout assertions.
  - Overall: 3 failed files, 19 failed tests, 175 passed files, 2075 passed tests, 3 skipped files, and 3 skipped tests. No Task 4-owned test failed.
- `git diff --check`: PASS.
- `npm run factory:check`: still blocked by sandbox `spawnSync git ls-files` `EPERM`.

Final Review Repair RED 2026-07-11:
- Fresh review blocked on one P1 crash-boundary gap: a supersession final-output appended before `prepared` projected as `conflicting-final-output`, even though restart can resume from the ledger-bound `handoffMaterialArtifactHash`.
- `npm test -- packages/agent/test/specialist-handoff-projection.test.ts`: FAIL as expected, 1 failed and 31 passed. The new crash-gap test showed `inconsistent` with `conflicting-final-output` instead of preserving the prior completed handoff plus visible persisted supersession output.

Final Review Repair GREEN 2026-07-11:
- `npm test -- packages/agent/test/specialist-handoff-projection.test.ts`: PASS, 1 file and 32 tests.
- `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 2 files and 67 tests.
- `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 4 files and 141 tests.
- `npm run verify`: typecheck phase PASS (`typecheck passed`); test phase failed only in the known sandbox-bound suites:
  - `packages/local-runtime/test/server.test.ts`: 7 `listen EPERM` socket-bind failures on `127.0.0.1` or `0.0.0.0`.
  - `packages/local-runtime/test/workspace-readiness-smoke.test.ts`: 1 dependent operator-command empty-stdout JSON parse failure.
  - `packages/workspace-ops/test/cli.test.ts`: 11 `tsx` IPC pipe `listen EPERM` failures plus downstream exit-code/stdout assertions.
  - Overall: 3 failed files, 19 failed tests, 175 passed files, 2076 passed tests, 3 skipped files, and 3 skipped tests. No Task 4-owned test failed.
- `git diff --check`: PASS.
- `npm run factory:check`: still blocked by sandbox `spawnSync git ls-files` `EPERM`.

Euler Review Repair RED 2026-07-11:
- Fresh final review blocked on three gaps:
  - `output-persisted` projected without verifying the ledger-bound handoff material bytes.
  - Retrying an already-recorded supersession attempted to compute a new revision instead of returning the recorded revision from readback.
  - The runner record path did not reject duplicate run identities by run ID before writes.
- `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: FAIL as expected, 2 files with 3 failed and 66 passed. Failures covered missing output-persisted material verification, duplicate run identity reaching prepared projection, and supersession retry failing instead of reusing revision two.

Euler Review Repair GREEN 2026-07-11:
- `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 2 files and 69 tests.
- `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts`: PASS, 4 files and 143 tests.
- `npm run verify`: typecheck phase PASS (`typecheck passed`); test phase failed only in the known sandbox-bound suites:
  - `packages/local-runtime/test/server.test.ts`: 7 `listen EPERM` socket-bind failures on `127.0.0.1` or `0.0.0.0`.
  - `packages/local-runtime/test/workspace-readiness-smoke.test.ts`: 1 dependent operator-command empty-stdout JSON parse failure.
  - `packages/workspace-ops/test/cli.test.ts`: 11 `tsx` IPC pipe `listen EPERM` failures plus downstream exit-code/stdout assertions.
  - Overall: 3 failed files, 19 failed tests, 175 passed files, 2078 passed tests, 3 skipped files, and 3 skipped tests. No Task 4-owned test failed.
- `git diff --check`: PASS.
- `npm run factory:check`: still blocked by sandbox `spawnSync git ls-files` `EPERM`.
