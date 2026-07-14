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

- Pending: add the first exact-use counterfactual before production code and
  retain the command result here.
