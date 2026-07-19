# Task139-PM — Mounted Provider Authority

## Claim

- Status: in-progress (RV-1-E-760 proxy-envelope recovery).
- Card: `Task139-PM`.
- Exact base: `c160f5ad5b1841a9e7b2ae23d410327592445143` (`docs: release Task139-P1 as record 17`).
- Branch: `codex/task139-pm-mounted-provider-authority`.
- Owned paths:
  - `packages/local-runtime/src/mounted-provider-authority.ts`
  - `packages/local-runtime/test/mounted-provider-authority.test.ts`
  - `docs/agentic/claims/task-139-mounted-provider-authority.md`
  - `packages/local-runtime/src/mounted-artifact-authority-operation.ts`
  - `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
  - `packages/local-runtime/test/support/task137-authority-boundary-policy.ts`
- Prerequisites: released `Task126-R`, `Task139-P1`, `Task135D`, `Task137A`, and `T120-R` under `task136-bounded-assurance-v4`.
- Contract authority: `docs/agentic/contracts/task136-bounded-assurance-v4.json`, the resident full-vision contract freeze, RV-1-C-134, RV-1-E-442, RV-1-E-444, RV-1-E-479, RV-1-E-545, and RV-1-E-752.
  The V4 direct-source correction in RV-1-E-732 and RV-1-E-753 through
  RV-1-E-758 transfers the three Task137B-W source-boundary paths above and
  adds Task137B-W to this card's released prerequisites. The corrected
  authority was forwarded at `8b55872a27ad3e97a0a5666c7404ff6c8ba073fb`.

Task-scoped subagent-driven development and test-driven development are explicitly approved for this task.

## Frozen Role

Task139-P1 remains immutable, credential-free data and cannot mint mounted
authority. Task126-R keeps its private WeakSet reader factory as the trusted
injection seam. The released production import boundary permits no PM import,
re-export, loader, cast, or structural emulation of that factory. PM therefore
owns only the cycle-free, opaque mounted-provider locator staged from the exact
factory-issued mounted authority operation; a later composition owner may
consume the staged capability without treating P1 data or caller snapshots as
authority.

The staged locator must derive every readback from the current mounted runtime
and its durable ledger, bind the exact workspace, mount, admission generation,
policy, lock, and high-water facts, and fail closed after any stale, closed,
remounted, swapped, forged, copied, proxied, or conflicting state. It has no
provider invocation, network/DNS/socket access, credential or secret access,
OAuth, ledger/config mutation, fallback, default-factory edit, process-global
registration, or other external effect.

## Causal RED

- The RED adds only the focused PM suite and this claim; no production module
  exists in the RED commit.
- It exercises the released Task135D/Task137A factory-issued mounted operation,
  not scalar stand-ins. It requires an opaque locator, authoritative mounted
  ledger readback, deterministic immutable output, and revalidation after the
  asynchronous ledger read.
- It also rejects copied/proxied/structural operations and locators, a runtime
  handle in place of the operation, cross-workspace-shaped input, accessor
  input without getter invocation, stale/closed state, and P1-shaped provider
  facts. The latter proves P1 remains data only and cannot mint authority.
- The focused command must fail as a test assertion because the PM module is
  absent, then remain byte-identical for the minimal GREEN implementation.
- `npm test -- packages/local-runtime/test/mounted-provider-authority.test.ts`
  exited `1` with **1 failed file / 4 failed tests**. Each failure is the
  intentional API-presence assertion (`expected false to be true`) after the
  released factory-issued operation successfully admitted; it is not a fixture,
  syntax, dependency, or environment failure.

## GREEN Evidence

- The PM-specific source seam authenticates only the private factory-issued
  mounted operation identity, revalidates the mounted runtime and admission on
  every inspection, and exposes only its immutable snapshot plus a read-only
  durable-ledger reader. It does not import or mint Task126's private BYOK
  reader factory, expose a runtime handle or writer, or derive authority from
  P1 data.
- The locator is a module-private `WeakMap` capability. Issuance accepts only
  an own, enumerable, data-only `{ operation }` record; it rejects accessors,
  extra keys, lookalikes, copies, proxies, runtime handles, and P1-shaped
  inputs before any caller getter is invoked. Inspection binds and compares the
  exact operation, mounted snapshot, and durable-ledger-reader identity before
  and after the asynchronous ledger read; any failed currentness check burns
  the capability. Readback is frozen, deterministic, and derives its count
  solely from the authoritative ledger bytes. There are no writes, provider or
  network activity, credential/secret resolution, fallback, or external
  effect.
- The Task137 import policy grants only the PM static named value/type pair.
  Its existing authorized-consumer fixture was extended in place, preserving
  the grammar/corpus versions and `allowed=8 rejected=20` cardinality.
- Focused admission passed:
  `npm test -- packages/local-runtime/test/mounted-provider-authority.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
  — **2 files / 8 tests**, with exactly one
  `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker.
- Cross-boundary admission passed:
  `npm test -- packages/local-runtime/test/mounted-provider-authority.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-official-flow-feasibility.test.ts packages/local-runtime/test/agent-provider-configuration.test.ts packages/agent/test/byok-provider.test.ts`
  — **8 files / 122 tests**, with exactly one policy marker.
- `npm run typecheck` passed. Full `npm test` and `npm run verify` retain the
  clean record-17 inherited non-green cohort (**12 failing files / 69 failing
  tests / 5 skips**) with no PM failure or skip change; the positive delta is
  the four causal PM RED tests now passing. This is recorded as a differential,
  not as a full-green claim.
- `node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`
  passed **19/19**. V4 contract mode emitted all four required markers:
  `TASK136_RELEASE_GRAPH_OK records=29`,
  `TASK136_COMPOSITION_CORPUS_OK green=1 red=20`,
  `TASK136_COMMAND_CARDS_OK cards=29`, and
  `TASK136_ABI_CORPUS_OK green=1 red=15`. `npm run factory:check` passed and
  `git diff --check` was clean.
- The focused RED test blob remains byte-identical to
  `8479f8ece61417a49e880e7cf76687342a6230f7`. The cumulative corrected PM
  scope is exactly the six paths above. Preflight and post-verification use a
  real non-symlinked `node_modules`; `node_modules/.bin/vitest` is executable
  and reports `4.1.9`.

## RV-1-E-760 Proxy-Envelope Recovery RED

- The registry-only forward merge
  `362bb1222b4d7a028e7a91bd5b1230ee96c42222` records the accepted P1:
  `issueMountedProviderAuthority(new Proxy({ operation }, {}))` minted a
  locator from a real factory-issued operation. This recovery owns exactly the
  PM test, PM source, and this claim; the prior source remains byte-identical
  to `28072e576f7fb9f3937d4596d975c4fe80aeef3e` in this RED.
- The two new named real-fixture cases require rejection of a transparent
  proxy envelope and rejection of a trap-bearing proxy envelope before any
  object-handler trap runs. The latter records both `rejected` and the exact
  handler-trap count in one assertion.
- Focused RED command:
  `npm test -- packages/local-runtime/test/mounted-provider-authority.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
  exited `1` with **1 failed file / 2 failed tests / 8 passed tests** across
  **2 files / 10 tests**. The transparent envelope failed because it did not
  throw; the trap-bearing envelope observed `{ rejected: false, trapCalls: 4
  }` rather than `{ rejected: true, trapCalls: 0 }`. The existing import-policy
  fixture passed and emitted exactly one
  `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker. The recurring
  TypeScript source-map warning is an inherited dependency condition, not a
  test or environment failure.
