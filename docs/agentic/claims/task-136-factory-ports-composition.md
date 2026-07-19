# Task136-FC-Ports — Factory Ports Composition Claim

- Status transition: `claimed` -> `implementing`.
- Card: `Task136-FC-Ports`, strict V4 release-card position 21.
- Worker: Codex `gpt-5.6-terra` / `xhigh`.
- Branch: `codex/task136-fc-ports`.
- Worktree: `/home/drake/.codex/worktrees/7fcc/Cestus`.
- Exact base: `f2e283d138a35e9f8a7247a4041a5ea5847065d6`.
- Governing authority: `docs/agentic/contracts/task136-bounded-assurance-v4.json`,
  `RV-1-E-783`, and the released Task135D, Task136-FC-Core, and Task139-P2
  claims.

## Prerequisites and exclusive scope

Released prerequisites are Task135D, Task136-FC-Core, and Task139-P2. This
card owns exactly:

1. `packages/local-runtime/src/resident-loop-factory-ports.ts`
2. `packages/local-runtime/test/resident-loop-factory-ports.test.ts`
3. `packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts`
4. `packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts`
5. `docs/agentic/claims/task-136-factory-ports-composition.md`

The causal card command is:

```bash
npm test -- packages/local-runtime/test/resident-loop-factory-ports.test.ts packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts
```

## Boundary invariant

The implementation may compose only the released Core exact W/H/PM readback
and released P2 frozen provider posture into a data-only, cycle-free port for
the later bounded-loop factory. It preserves the sole `agent_default` identity
and exact workspace, mount, admission, policy, lock, high-water, task,
attempt, and run bindings. Caller copies, structural values, proxies,
accessors, extra keys, handles, stores, witnesses, issuers, provider
configuration, Task126 readers, credentials, endpoints, hosts, secrets, or
lookalike capabilities never gain authority. The card mints or upgrades no W,
H, PM, P2, gateway, approval, checkpoint, or handoff authority and returns no
raw handle, store, or witness.

There is no registry/fallback/global state, provider invocation, credential
resolution, network/external effect, ledger/artifact write, route/index
export, compatibility API, or alternate authority producer. Exact currentness
is compared around every consumed async released interface; stale,
cross-workspace, cross-run, cross-task, cross-policy, lock, high-water,
ledger, and provider-binding mismatches fail closed.

## Evidence and stop rules

The required history is claim-only, causal test/claim-only RED with production
absent and test blobs preserved byte-for-byte, then one minimal production plus
claim GREEN. The justified cross-boundary suite will include this card's three
files, released Core composition/import tests, P2 posture, and directly
consumed Task135D/W/H/PM boundaries. The final gates include typecheck, V4
contract/repository modes, full test/verify differential, diff/readiness,
scope, clean state, and real non-symlinked Vitest 4.1.9 dependencies.

`RV-1-E-783` records the concurrent record-20 assurance-fixture correction.
If it is not forward-merged when this card reaches the bounded-assurance gate,
the card records only the inherited `17 passed / 2 failed` result and stops for
coordinator refresh; it does not edit the assurance fixture, registry, or
contract.

No review, integration, registry edit, merge, rebase, reset, amend, squash,
reorder, rewrite, push, self-merge, provider/network/credential action, or
`neo` action is authorized.

## Causal RED

Before any production source existed, the exact card command exited `1` with
**3 files / 6 tests: 1 failed, 5 passed**. The new positive/adversarial test
first created a real portable workspace, started released Core, consumed the
real W/H/PM bind chain, and derived the released P2 posture. It then failed
only at the absent-module API assertion: `isFactoryPortsApi(imported)` received
`false` where `true` was required at
`resident-loop-factory-ports.test.ts:131`. The two import-boundary files and
their five tests passed. The production path
`packages/local-runtime/src/resident-loop-factory-ports.ts` remained absent.
The Vite TypeScript source-map warning is inherited local dependency noise, not
a test failure.

## GREEN

The minimal GREEN adds only the owned
`resident-loop-factory-ports.ts` production module. It type-imports the
released Core readback and P2 posture interfaces, validates their frozen
plain-data envelopes, and projects only a newly frozen workspace/run/provider
posture value. It performs no async work and therefore introduces no unchecked
await boundary; Core and P2 retain their released async currentness checks.
The projection verifies the exact workspace, mount, admission, policy, lock,
high-water, task, attempt, run, and H binding tuple before returning any data.
It neither retains nor returns a runtime handle, ledger, mounted operation,
witness, issuer, configuration, credential, endpoint, or callable capability.

From these GREEN bytes, the unchanged exact card command exits `0` with
**3 files / 6 tests passed**. `npm run typecheck` exits `0`. The test blobs are
byte-identical to the committed RED.

## RV-1-E-790 Causal Recovery RED

The reviewed candidate is resumed from the coordinator-forwarded recovery
authority at `c75b1ec5720058572f93c2c7a7c9c1cf06ce2a07`. The reproduced P1 is
that FC-Ports accepts a fully frozen structural Core/P2-shaped input with a
secret-pattern provider identifier and a proxied, ignored credential-reference
member, then returns the hostile identifier without traversing the nested
proxy. The root cause is local and contract-determined: the previous P2
normalizer inspected only projected selection, capability, approval, and
binding members; it silently ignored credential-reference and feasibility
shape, text, and cross-field facts.

The recovery RED changes only this claim plus the two owned FC-Ports test
paths. The production source is byte-identical to the reviewed candidate. It
requires rejection after normal fixture/API loading of secret-pattern provider
and credential-reference text, an ignored nested proxy, non-BYOK credential
and feasibility enums, feasibility extra keys and URI-host material, mismatched
capability/provider identity, and missing required provenance. The import
policy continues to allow only the existing three static imports or the exact
five-import Green set with Node IP classification and the released pure
secret-safety predicate; it passes at RED and does not cause the causal
failure.

From these RED bytes, the exact card command exits `1` with **3 files / 7
tests: 1 failed, 6 passed**. The only failure is
`rejects hostile P2 posture text, nested proxies, exact-shape drift, and
cross-field substitutions` at `resident-loop-factory-ports.test.ts:193`:
`expected [Function] to throw an error`, but the current production returns.
The normal real workspace/Core/PM/P2 fixture and API import complete first;
the import-boundary tests pass. The production blob is exactly
`9c529b81e4df9dc4dbd620aa29884cfdf6c23027` both before and after this RED.
The inherited local TypeScript source-map warning is not a test failure.
