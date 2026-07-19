# C136-P Resident Plan Candidate Producer Claim

- Status: `implementing`.
- Card: `C136-P`, strict V4 release-card position 24.
- Worker: Codex `gpt-5.6-terra` / `xhigh`.
- Branch: `codex/c136-p-resident-plan-candidate-producer`.
- Worktree: `/home/drake/.codex/worktrees/8403/Cestus`.
- Exact base: `e6ba8d111abb5c96695daff8f8d3b1a294798e40`.

## Released prerequisites and authority

- `T120-R` is released at `0b5185f0d0dd276164ec70d5db150f5f6ccb3a79`.
- `Task139-P2` is released at `6472c92bce3b6cd23e3128666524e575d9f9d236`.
- The executable authority is `docs/agentic/contracts/task136-bounded-assurance-v4.json`, which fixes C136-P at position 24 with those two direct prerequisites.
- Standing recovery authority is `RV-1-E-732`; any contract-determined discovery preserves this history and uses a further causal RED/minimal GREEN cycle rather than rewriting it.

## Exclusive scope

1. `packages/agent/src/resident-plan-candidate-provider.ts`
2. `packages/agent/test/resident-plan-candidate-provider.test.ts`
3. `docs/agentic/claims/resident-plan-candidate-producer.md`

## Required model, commands, and invariants

- This card is deterministic, credential-free, data-only, and performs no model/provider invocation, credential resolution, network, tool/gateway execution, ledger/artifact write, projection, approval, fallback, compatibility path, export, or external effect.
- Its output is untrusted typed own-data; Task136/CF-1 must reparse it before any append. It is never authority or durable evidence.
- Preserve exact task, attempt, run, resident, run mode, workflow descriptor, policy, authority, source/context, budget, provider-posture, causation, and correlation bindings. Initial plans use revision 0. Replans use a fresh plan ID, the next contiguous revision, an exact prior-plan event, a required exact prior observation, and immutable narrower-or-equal policy data.
- Reject hostile or mutable data, secrets/credentials/URLs/hosts/raw commands/provider bodies, stale or swapped posture, invalid or noncontiguous steps, and every replan widening of tool/version/allowlist/output/prerequisite, provider/model, source/context, approval/effect/automatic class, or budget.
- Exact card command: `npm test -- packages/agent/test/resident-plan-candidate-provider.test.ts`.
- Cross-boundary command: `npm test -- packages/agent/test/resident-plan-candidate-provider.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts packages/local-runtime/test/resident-loop-provider-posture.test.ts`.
- Final admission includes standalone typecheck; V4 contract/repository modes; full `npm test` and `npm run verify` differential against the inherited 12 failing files / 69 failing tests / 2,764 passes / 5 skips cohort; `git diff --check`; `npm run factory:check`; exact three-path scope; clean state; and real non-symlinked local dependencies with Vitest 4.1.9.

## History contract

This claim-only checkpoint precedes the causal RED. The RED changes only the owned test and this claim to `implementing`; the minimal GREEN then changes only the owned source and this claim while preserving the RED test blob byte-identically.

## Causal RED

The focused test introduces three fixture-backed cases before production source exists: exact initial/replan output, hostile and secret-safe boundary rejection, and invalid/widening replan rejection. It requires the named `createResidentPlanCandidateProvider` API after all frozen Task120/P2-shaped fixtures load.

`npm test -- packages/agent/test/resident-plan-candidate-provider.test.ts` exited `1` with one failed file and three failed tests. Each failed solely at the intentional API-presence assertion (`expected false to be true`) for the absent `resident-plan-candidate-provider` module; all fixtures loaded successfully and no production path existed.

## RV-1-E-732 Test-Oracle Recovery

The initial minimal implementation reached the positive candidate assertion. Its only remaining failure was the RED helper `deeplyFrozen`: it returned `false` for primitive leaves before checking the enclosing frozen object, making the assertion unsatisfiable for every ordinary own-data candidate containing a string or number. This is a test-oracle defect, not a source, contract, scope, provider, credential, or external-behavior change. The correction treats primitive leaves as already immutable and preserves the original causal RED commit `346e00cf` byte-for-byte in history; no source behavior is widened.

The corrected focused GREEN command passed: 1 file and 3 tests. It proves the producer emits frozen initial and replan candidates, rejects hostile/secret/stale input before output, and blocks invalid or widening replan data. The source remains data-only and does not append, invoke a provider, resolve credentials, access a network, execute a tool, write an artifact, project, approve, or select a fallback.

The widening fixture now establishes an initial candidate on the same producer before every replan mutation, so each rejection reaches the immutable prior-plan, exact provider-posture, policy-constraint, source/context, and budget comparisons. The exact card command remains green at 1 file / 3 tests; the defined Task120/P2 cross-boundary command is green at 4 files / 18 tests. Standalone `npm run typecheck` exits 0.

## RV-1-E-732 Compiler Recovery

The final standalone compiler gate exposed one TS2322 at `requireNormalizedRecord`: the recursive `NormalizedRecord | NormalizedArray` union does not narrow through `Array.isArray` under the repository TypeScript configuration. The fail-closed runtime check remains correct; the minimal repair introduces an explicit `isNormalizedRecord` type predicate with the identical null/object/array condition. It adds no input shape, output field, authority, effect, fallback, or compatibility behavior.

## RV-1-E-827 Consolidated Review-Recovery RED

- Program authority `4eba9b0b99243d2ef0ce765bd39a12f54cc2c1c6` authorizes this single review-recovery cycle after the preserved candidate/merge `0b7af5a9835ded758b0b0ea9c2c921c95d29cc79`.
- Root cause: the data normalizer safely freezes hostile objects, but the candidate validator did not consume every released scalar plan/posture leaf. In particular it did not type or enumerate `runMode` and `correlationId`, did not consume every posture scalar, accepted a substituted P2 approval class, treated required approvals as a subset rather than a retained restriction, and only bounded replan budget consumption rather than binding it exactly to `actionConsumption`.
- This causal RED changes only this claim and the owned focused test. It introduces eight separately named hostile proofs: numeric `runMode`; an unknown `runMode`; numeric `correlationId`; a plan scalar object containing URL/DNS/IP/localhost material; a provider-posture scalar object containing nested Authorization/Bearer material; a non-`provider-byte-transfer` P2 approval class; removal of a prior required approval; and a consumed/remaining budget jump beyond the current action consumption. The existing positive replan fixture is corrected in RED to the released exact accounting (`planRevisions` action 1; every other action 0), and the existing stricter-approval fixture now proves additions are accepted only while retaining every prior requirement.
- Production remains byte-identical to the reviewed merge while this RED is run. The following GREEN may change only the owned source and this claim and must retain this exact test blob byte-for-byte.
- The exact focused RED command exited `1`: **1 failed file / 9 failed and 2 passed tests (11)**. The eight named hostile inputs were admitted by the reviewed source, and the corrected stricter-approval positive was rejected by its inverted subset comparison. No fixture-load, import, TypeScript, provider, credential, network, or unrelated failure occurred.

## RV-1-E-827 Consolidated Review-Recovery GREEN

- GREEN changes only the owned provider source and this claim. The owned test blob remains exactly `3701adeaad594120612e29e0d27c69bd7591ecac` from RED `659425ec4c204cb92edda153c73beb09de4d033a`.
- The minimal repair consumes every released scalar plan/posture leaf with explicit string, boolean, and integer checks; accepts only the eight frozen run modes; and requires a secret-safe `correlationId` of length at least three. Its local text boundary scans every accepted text leaf through normal validation, rejects URI/URL, localhost, standard and noncanonical IP, and structural DNS material without a finite TLD list, while retaining exact hashes, released version markers, and the literal `api-key-bearer` kind.
- It makes Task139-P2 approval exact (`required: true`, `remote-byte-transfer-gated`, `provider-byte-transfer`), permits only narrowed automatic classes, retains every prior required approval while permitting safe stricter additions, and requires each replan ceiling plus consumed/remaining balance to change exactly by the current action consumption (`planRevisions: 1`, every other action `0`). Prior-plan/readback/observation/posture/identity/step equality, deep freezing, data-only output, and no-effect behavior remain unchanged.
- The exact focused GREEN command passes: **1 file / 11 tests**. The RED test blob remains byte-identical. During implementation, the local structural classifier was narrowed twice against evidence: canonical ISO-millisecond-Z assessment timestamps are retained rather than misclassified by their clock fragment, and the frozen released tool version `1.0.0` is retained rather than parsed as an abbreviated IPv4 host; arbitrary numeric host forms are still locally rejected.
