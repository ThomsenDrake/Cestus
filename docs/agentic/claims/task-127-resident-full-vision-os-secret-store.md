# Task 127 Claim: Resident Full-Vision OS Secret Store

- Task and gate: W1-127 / Lane P / `CF1-P-OS-SECRET`.
- Worker: `/root/task127_os_secret_store`.
- Branch and worktree: `codex/task-127-resident-full-vision-os-secret-store` /
  `/home/drake/.codex/worktrees/task-127-resident-full-vision-os-secret-store`.
- Coordinator base and required CF-1 descendant:
  `ceae7ca74d161196fd109d04c946976021bb8412`.
- Required freeze: `48c9cbcdcf723bcc74868f782bc2375bae565ae6` /
  `CF1-P-OS-SECRET`.
- Claimed at: `2026-07-14T00:00:00Z`.
- Status: in-progress.

## Scope And Authority

This task may change only:

- `packages/agent/src/os-secret-store.ts`
- `packages/agent/test/os-secret-store.test.ts`
- this append-only claim.

It creates the CF-1-selected exact-use `OsSecretStore` boundary. It validates a
current typed credential reference, capability hash, workspace, mount, run, and
declared purpose before an injected OS facility can resolve an opaque,
process-local handle. Unavailable or blocked outcomes expose only safe health
and diagnostic categories. The adapter neither authorizes invocation nor makes
any durable mutation.

No provider/configuration/registry/runtime/contract/secret-store compatibility
file, portable state, `.env`, plaintext configuration, database, artifact,
browser state, CLI auth store, cache, temporary file, command, locator, or
fallback is authorized. Tests use only credential-free in-process fakes; this
task must not use a real credential, call a provider, or start a live gate.
There is no child dispatch, self-review, self-integration, or `neo` merge.

## Verification Contract

Before production code, add and run a causal exact-use RED with:

```bash
npm test -- packages/agent/test/os-secret-store.test.ts packages/agent/test/secret-store.test.ts
```

The initial RED is expected because both focused test/module paths are absent.
After the minimal implementation, rerun that focused command, `npm run
typecheck`, `git diff --check`, and `npm run factory:check`. A serialized `npm
run verify` is prohibited unless the coordinator separately grants a fresh
usage-gated slot. Stop clean for a distinct fresh review after the one candidate
commit.

## RED/GREEN Evidence

- Dependency recovery: this isolated worktree initially lacked ignored
  lockfile-pinned dependencies (`vitest: command not found`). A temporary,
  untracked `node_modules` symlink to the coordinator worktree restored the
  pinned test runner without changing a tracked dependency or lockfile; it is
  removed before the candidate commit.
- RED: after the in-scope counterfactual suite was added and before
  `os-secret-store.ts` existed, the exact focused command exited `1` with one
  failed suite and zero tests because
  `../src/os-secret-store.js` could not be imported. The causal suite names a
  swapped workspace, a current successful exact use, current-reference health
  states, a purpose swap, hostile accessor/prototype/symbol/sparse-array input,
  and a locked/throwing facility. The named legacy `secret-store.test.ts` path
  is absent in this predecessor but Vitest accepted the explicit nonexistent
  filter; no forbidden compatibility test file was created.
- GREEN: the same exact focused command exited `0` with one test file and
  ten tests. The new boundary snapshots plain own-data input before an await,
  compares the whole typed credential reference and capability/workspace/mount/
  run/purpose tuple to the frozen current use, returns only bounded health and
  diagnostic codes, and exposes any resolved credential-free fake as a
  non-enumerable opaque handle. It performs no portable write, fallback, or
  facility discovery.
- Follow-up gates: `npm run typecheck` completed successfully; `git diff
  --check` exited `0` with no output; and `npm run factory:check` exited `0`
  with `factory-readiness passed`.
- Full verification: not run. The coordinator has not granted a serialized
  `npm run verify` slot for this candidate.
