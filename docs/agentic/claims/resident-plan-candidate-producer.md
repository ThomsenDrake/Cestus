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
