# Task137B-W Claim: Mounted Wake Supervisor Runtime

- Status: `green-candidate`
- Task: `Task137B-W`, Task 2 of `docs/superpowers/plans/2026-07-16-task137b-wake-schema-ownership-correction-implementation.md`
- Branch: `codex/task137b-wake-runtime-v3`
- Worktree: `/home/drake/.codex/worktrees/task137b-wake-runtime-v3/Cestus`
- Worker: `Codex Task137B-W implementation worker`
- Claimed at (UTC): `2026-07-16T00:00:00Z`
- Task base: `7400e3c0394fd929c58b0c21434f438f9816d923`

## Authority And Prerequisites

The v3 correction design is
`docs/superpowers/specs/2026-07-16-task137b-wake-schema-ownership-correction-design.md`.
The executable correction plan is
`docs/superpowers/plans/2026-07-16-task137b-wake-schema-ownership-correction-implementation.md`.
The original behavior remains the Task137B section at lines 4893-4974 of
`docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`.

Released prerequisites read before this claim:

- `Task135B`: candidate `23cf539ca9c84980bd6d36001cf60df69b611d74`, integration `908d26fa252989c9217cb40e1f22a5b9f583aa8f`, release `task136-release-v4-Task135B`.
- `T120-R`: candidate and integration `0b5185f0d0dd276164ec70d5db150f5f6ccb3a79`, release `task136-release-v4-T120-R`.
- `Task129-MFA`: candidate `38dbb91a883f5c91e7d07f8fefdfa7bd6ab199f7`, integration `c599f9d7c9e08de155bfb98f49462ad01416ec40`, release `task136-release-v4-Task129-MFA`.

Consumed authority and runtime contract blobs at claim time:

- `packages/agent/src/wake-supervisor.ts`: `53da3ff9b887545a675a3af10ee91907e058ea8d`
- `packages/local-runtime/src/mounted-artifact-authority-operation.ts`: `138d588949ddc9e361bbcca5c90352548d29f3e8`
- `packages/local-runtime/src/portable-workspace-lifecycle.ts`: `5197322a772c322f3f917069ab82da677ea09f5e`
- `packages/local-runtime/src/runtime-factory.ts`: `42822b2d549ae20bd353151583d63dc988397191`
- `packages/ontology/src/event-ledger.ts`: `1f2725ea598f653bd1e58d22eff29c0d9dd4cf04`
- `packages/ontology/src/contracts.ts`: `0331b31cbf98f330853a006f82f82f40cc0a83b5`
- `packages/local-runtime/test/support/task137-authority-boundary-policy.ts`: `f0a50a5663f2a8a92e78dc66ec098697a2b098b2`
- `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`: `e4376726ac1449804010e1c923eb52d3ab776642`

The coordinator explicitly approved task-scoped
`superpowers:subagent-driven-development` and
`superpowers:test-driven-development`. This worker executes the one approved
Task137B-W slice continuously; review and integration remain coordinator work.

## Exact Owned Paths

1. `packages/local-runtime/src/wake-supervisor-runtime.ts`
2. `packages/local-runtime/src/mounted-wake-lifecycle-store.ts`
3. `packages/local-runtime/test/wake-supervisor-runtime.test.ts`
4. `packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts`
5. `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts`
6. `packages/local-runtime/test/support/task137-authority-boundary-policy.ts`
7. `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
8. `packages/ontology/src/contracts.ts`
9. `packages/ontology/test/resident-wake-contracts.test.ts`
10. `docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md`

## Global Constraints

- Add only the seven frozen canonical lifecycle schemas and the durable mounted
  lifecycle store/runtime behavior required by Task137B.
- Preserve append-only ledger semantics, strict durable readback, restart
  reconstruction, factory-only authority, provenance, no fallback storage,
  and stop-before-return invalidation.
- Keep the finite policy corpus at exactly eight allowed and twenty rejected
  fixtures, with exactly one `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20`
  marker per prescribed command.
- Do not edit the program registry or any eleventh path; do not implement
  Task 3, Task139, or later work.
- Do not run `npm run verify`; do not use network, providers, credentials,
  external services, live APIs, push, reset, rebase, integrate, or touch
  `neo`.
- Stop with structured evidence on a schema/API conflict, data-loss or safety
  risk, unavailable dependency, or two failed focused repairs.

## Causal RED

- Command: `npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/ontology/test/resident-wake-contracts.test.ts`
- Result: exit `1`, with the two expected missing runtime modules,
  `wake-supervisor-runtime.ts` and `mounted-wake-lifecycle-store.ts`, the
  zero-before-R0 import assertion unable to read the missing runtime source,
  and all seven accepted ontology lifecycle registrations rejected because the
  canonical schemas are absent.
- The unchanged-size policy suite passed and emitted exactly one
  `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker. The policy source
  now normalizes relative import segments so the replacement runtime-factory
  protected-module fixture proves the intended finite boundary.

The causal RED corpus is committed as
`87b050d5e67ccd157ad0a67cc345adbfc84ed843`.

## GREEN Candidate Evidence

- Focused command passed exactly 5 files and 39 tests with exactly one
  `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker.
- Cross-lane command passed exactly 9 files and 123 tests with exactly one
  `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker.
- `npm run typecheck` passed.
- The candidate contains only the seven canonical wake schemas, the mounted
  lifecycle store and wake runtime, and the one permitted lifecycle import.
- Before coordinator review, the committed candidate must still pass the six
  ordered Task137 terminal-gate stages, factory readiness, exact ten-path
  scope, clean checkout, and non-symlinked dependency checks.

## V4 Authority-Transfer Amendment

This append-only amendment governs the final Task137B-W repair from the clean
V4 integration base `a3dbea86a6a8edcaadaaba8e798c39b660512df0` on branch
`codex/task137b-wake-runtime-v4-final-repair`. The preserved eight commits
above remain verbatim evidence; only one new causal RED and one minimum GREEN
commit may follow them.

V4 transfers the portable lifecycle source/test from Task137A and the mounted
authority source/test from Task129-MFA. The resulting fourteen-path ceiling is
the four transferred paths plus the ten paths recorded above. The focused
derivation is `67 + 7 = 74` tests and the cross-lane derivation is
`123 + 7 = 130` tests. The existing standing authorization explicitly permits
task-scoped `superpowers:subagent-driven-development` and
`superpowers:test-driven-development` with one production writer; review and
integration remain coordinator work.

The RED adds exactly seven causal cases for factory-first authentication,
exact-capability bind, one-instant five-minute lease acquisition,
consumption-time expiry, wake raw-handle isolation, dedicated opaque-store
inspection, and monotonic expiry/successor invalidation. The policy corpus
advances to v3 while preserving eight allowed fixtures, twenty rejected
fixtures, and its single required marker.

## V4 GREEN Evidence

The minimum GREEN keeps the existing registrar as the sole discriminated
authenticate/bind seam. Factory authentication captures and inspects the raw
identity before any member access or effect; the opaque WeakMap capability is
the only authority input accepted by the mounted store. The wake runtime uses
that registrar import alone and reads mount, identity, and ledger state through
the capability-backed store. Lease acquisition derives one finite normalized
instant plus exactly 300000 milliseconds, and every lifecycle consumption
refreshes durable expiry before an effect. Mounted lease-port failure also
revokes its lifecycle generation, so a stale admission cannot revive after
revalidation.

The exact cumulative ceiling from
`a3dbea86a6a8edcaadaaba8e798c39b660512df0` is, in order:

1. `packages/local-runtime/src/portable-workspace-lifecycle.ts`
2. `packages/local-runtime/test/portable-workspace-lifecycle.test.ts`
3. `packages/local-runtime/src/mounted-artifact-authority-operation.ts`
4. `packages/local-runtime/test/mounted-artifact-authority-operation.test.ts`
5. `packages/local-runtime/src/wake-supervisor-runtime.ts`
6. `packages/local-runtime/src/mounted-wake-lifecycle-store.ts`
7. `packages/local-runtime/test/wake-supervisor-runtime.test.ts`
8. `packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts`
9. `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts`
10. `packages/local-runtime/test/support/task137-authority-boundary-policy.ts`
11. `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
12. `packages/ontology/src/contracts.ts`
13. `packages/ontology/test/resident-wake-contracts.test.ts`
14. `docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md`

The prescribed focused command passed `7 files / 74 tests` with exactly one
`TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker before the GREEN
commit. The prescribed cross-lane command is required to pass `9 files / 130
tests` with the same single marker, followed by typecheck, diff check, factory
readiness, the six-stage terminal gate, exact scope, clean checkout, and the
non-symlinked dependency preflight. No repository assurance or full verifier is
part of this evidence.

## V4 Consolidated Repair Round 2 RED

The coordinator authorized one append-only RED/GREEN pair after candidate
`e3cacc66d9bba1b97f95bd190fdc4cff88ff5676`, preserving the existing eleven
commits byte-for-byte. The RED strengthens existing causal cases without
adding or deleting any test case and migrates every in-scope authority test
caller to the phased registrar surface.

The prescribed focused command exited `1` with exactly `7 files / 74 tests`,
`4 failed / 70 passed`, and one
`TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker. The four failures were
exactly:

1. an exact unphased raw-handle registration remained live instead of failing
   before mounted lifecycle activity;
2. a supplied `supervisorLeaseDurationMs` policy override remained silently
   accepted instead of failing before ledger read or append;
3. a second authenticated store with the same workspace and supervisor epoch
   appended a second current lease instead of returning the durable held lease;
4. all three artifact-operation inspection seams continued to return authority
   after the real mounted supervisor's durable lease expiry.

No production source changed before this RED. The expected GREEN must remove
the unphased registrar fallback, require the exact frozen policy keys, enforce
one unexpired durable lease regardless of epoch, and make store-backed lease
currentness burn capabilities, lifecycle admission, and artifact operations
before any downstream effect.

## V4 Consolidated Repair Round 2 GREEN

The repair removes the deprecated unphased registrar overload and runtime
fallback. The only live phases are now `authenticate` and `bind`; factory
authentication produces an opaque WeakMap capability, the dedicated mounted
store inspector consumes that exact capability once, and bind never receives a
raw handle. The inspector returns module-private store authority whose fresh
lease revalidation and monotonic invalidation closures are not exposed on the
public capability.

The mounted store now rejects policy objects with any key beyond
`policyVersion`, `policyDigest`, and `lockStateDigest`, including every supplied
`supervisorLeaseDurationMs` override, before capability consumption or ledger
activity. Any unexpired durable workspace lease blocks acquisition regardless
of supervisor epoch. Exact global and stream readback still fixes the acquired
lease expiry, and each later store or artifact-operation consumption compares a
fresh normalized instant with that durable expiry before lifecycle or ledger
effects. Expiry burns the capability, mounted store, lifecycle admission, and
old artifact operation, so matching revalidation or successor acquisition
cannot revive the old authority.

The focused command passed exactly `7 files / 74 tests` with one
`TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker. `npm run typecheck`,
`git diff --check`, and `npm run factory:check` also passed before commit.

The prescribed cross-lane command exposed one remaining P1 scope-contract
collision: `portable-mounted-agent-artifact-stores.test.ts`, which is outside
the exact fourteen-path write ceiling, still contains six unphased
`{ wakeRuntime, lifecyclePorts, runtimeHandle }` calls. With the prohibited
fallback removed, the exact cross-lane result is `1 failed / 8 passed` files
and `16 failed / 114 passed` tests out of 130, with the one required policy
marker; all sixteen failures originate at those immutable legacy fixture
calls. Making that candidate pass would require either changing a fifteenth
path or restoring the forbidden live raw-handle route, so neither was done.

## Coordinator Final-Cycle Acceptance RED

The coordinator adjudicated the cross-lane collision inside the still-open
final repair cycle. The legacy composite caller may remain only as an
authentication-first compatibility adapter: it must authenticate the exact
factory-issued handle before observing lifecycle values, internally issue and
bind the same opaque capability used by the phased factory path, and bind that
authority to the registered lifecycle's own lease clock. The mounted wake-store
constructor remains capability-only, and no raw handle reaches its boundary.

The existing in-scope unphased-registration test was converted without changing
the 74-test count. It now requires the compatibility adapter to produce an
operation that burns at the exact synthetic durable lease expiry before any
artifact inspection can return authority. Against candidate `275d1b2a`, the
focused command is causally RED because the composite route still rejects at
registration. The already-recorded 16-failure cross-lane result remains the
broader integration RED; no fifteenth path is added.

## Coordinator Final-Cycle Acceptance GREEN

The registrar now recognizes the exact three-field legacy composition DTO only
after outer own-data validation. It authenticates `runtimeHandle` first, then
uses the resulting private WeakMap capability to bind the factory-registered
lifecycle ports and wake-runtime identity. No legacy value reaches
`createMountedWakeLifecycleStore`, which remains capability-only. Failure burns
the private capability rather than leaving a fallback authority path.

The compatibility authority installs a private currentness closure over the
factory-registered lifecycle ports. Portable lifecycle inspection now compares
the lease's durable expiry with the lifecycle's own injected `now` instant on
every consumption. Invalid or expired instants monotonically invalidate the
admission before an artifact inspection can return ledger or snapshot
authority. This keeps deterministic clocks authoritative and closes the old
caller without weakening factory authentication or expiry behavior.

The prescribed focused command passed exactly `7 files / 74 tests`; the
prescribed cross-lane command passed exactly `9 files / 130 tests`. Each emitted
exactly one `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker. The
cumulative candidate remains confined to the exact fourteen authorized paths.
