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
