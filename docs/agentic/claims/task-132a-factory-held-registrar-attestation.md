# Task 132A Claim: Factory-Held Registrar Attestation

- Task and gate: Task132A / CF-1R5 factory-held registrar attestation.
- Worker: `/root/task132a_registrar_attestation`.
- Branch and worktree: `codex/task-132a-factory-held-registrar-attestation` /
  `/home/drake/.codex/worktrees/task-132a-factory-held-registrar-attestation`.
- Registry authority: RV-1-E-201.
- Claimed at: `2026-07-15T02:19:05Z`.
- Status: `in-progress`.

## Frozen Recovery Bases

- CF-1 coordinator integration: `48c9cbcdcf723bcc74868f782bc2375bae565ae6`.
- Reviewed Task120: `49c3490a262162bd1d7146994390a2a6b5052394`.
- Reviewed Task125: `2e5c35ab7bca33df9f1a0c482c496fbb93350086`.
- Program base: `6d483986`.
- Isolated staged recovery base: `f66c100554301f57ce757c2cfe0f82e729c8bab6`.
- Preserved rejected source snapshot: `70f70375`; it is not program integration evidence and is not rebased, restaged, merged, or treated as readiness evidence.

## Exclusive Scope

- `packages/local-runtime/src/agent-runtime-factory.ts`;
- `packages/local-runtime/src/agent-runtime-context-packs.ts`;
- `packages/local-runtime/test/agent-runtime-context-packs.test.ts`;
- `packages/local-runtime/test/agent-runtime-context-attestation.test.ts`;
- only if required for read-only private-`WeakMap` evidence:
  `packages/agent/src/prr-context-packs.ts`,
  `packages/agent/src/operational-context-packs.ts`, and
  `packages/agent/src/investigative-context-packs.ts`;
- this append-only claim.

## Contract

The public context surface may not mint authority from a structural registrar
tuple, callback, local fallback, or shadow contract. Each package retains its
private registration `WeakMap` and exposes only a read-only lookup that returns
`undefined` for manually registered or foreign registries. The factory captures
immutable lookup snapshots from its actual registry. The verified capability
repeats those lookups against that captured registry and compares descriptor,
parser, producer, and registration identity before any resolution. The default
empty registry stays fail-closed.

The required non-full gate is:

```bash
npm test -- packages/local-runtime/test/agent-runtime-context-packs.test.ts packages/local-runtime/test/agent-runtime-context-attestation.test.ts packages/agent/test/context-packs.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

`npm run verify`, self-review, self-integration, merging, `neo`, providers,
network, credentials, and Nous are prohibited. A fresh independent Terra/xhigh
review must read the full staged-base-through-repair range before coordinator
integration.

## Execution Record

- Reboot continuation worker: `/root/task132a_reboot_continuation`; the
  original Task132A handle `019f6392-06f2-72d1-8336-0cd72f967a98` no longer
  existed after the machine reboot. Runtime authorization was independently
  confirmed as Terra/xhigh from
  `/home/drake/.codex/sessions/2026/07/14/rollout-2026-07-14T22-38-30-019f63a3-db09-75e0-bed3-985ed421ae15.jsonl`.
- Recovery audit: the in-scope producer accessors, factory/context source,
  this claim, and the new attestation test were preserved dirty work. The only
  interrupted state was deletion of the staged-base
  `agent-runtime-context-packs.test.ts` (788 lines / 31,828 bytes); it was
  restored exactly from `f66c100554301f57ce757c2cfe0f82e729c8bab6` before
  forward reconciliation. No reset, rebase, restage, history rewrite, or
  rejected-candidate integration occurred.
- Causal RED: after restoration, the required focused test command exited 1
  with all six legacy structural-constructor cases failing immediately as
  `blocked.factory-context-attestation-required`. This proved the preserved
  suite still supplied the forbidden callback registrar rather than a
  factory-held actual registry.
- GREEN: the restored-forward suite now uses real PRR, operational, and
  investigative package registrations; it proves structural tuple/callback
  rejection, producer/registration/parser swaps before build, foreign
  registry failure, and captured-registry recheck. Focused evidence:
  3 files / 67 tests passed, followed by `npm run typecheck` passing.
- Required non-full gate: on 2026-07-15,
  `npm test -- packages/local-runtime/test/agent-runtime-context-packs.test.ts packages/local-runtime/test/agent-runtime-context-attestation.test.ts packages/agent/test/context-packs.test.ts && npm run typecheck && git diff --check && npm run factory:check`
  exited 0: 3 files / 67 tests passed; typecheck and factory readiness passed.
  Full verification remains closed.
- Final repair commit: recorded by the scoped forward commit containing this
  recovery record; fresh independent complete-range review remains required.

## RV-1-E-217 Replacement Boundary Recovery

- Replacement worker: `/root/task132a_boundary_red_replacement`, on the same
  `codex/task-132a-boundary-reset-recovery` worktree and preserved
  `c7f36114973857019a2d25735790489b406189f5` base. The authoritative
  replacement `turn_context` is
  `/home/drake/.codex/sessions/2026/07/15/rollout-2026-07-15T00-08-18-019f63f6-1091-79e1-be8e-839ebbdfc930.jsonl:8`:
  `model=gpt-5.6-terra`, `reasoning_effort=xhigh`, and `effort=xhigh`.
  The 2026-07-14 `019f63ec-9d8e-7a30-a288-299871bd7119` record is the
  interrupted predecessor, not the replacement runtime.
- The audited causal RED first exited `1` with exactly two boundary failures:
  public `captureFactoryContextPackAttestation` was visible to an external
  module and default empty factory composition did not throw
  `blocked.factory-context-attestation-required`. The foreign manual
  `buildResolved` fixture was repaired only to supply its canonical
  `generatedAt` and `safeSummary` build-input fields; its normal public
  `buildResolved` behavior remains covered without yielding registrar evidence.
- The scoped correction removes all public factory/context capability capture,
  consume, constructor, wrapper, tuple, and type surfaces. The factory now
  captures only read-only package registrar snapshots in an unexported lexical
  verifier and fails closed when its default registry has no actual registrar
  evidence. It adds no H, task-orchestrator, provider, durable, or terminal
  behavior.
- Real PRR, operational, and investigative read-only registrar evidence stays
  covered; foreign/manual registries return `undefined` while ordinary public
  `buildResolved` remains available. The six live content-hash,
  source-high-water, selection-manifest, scope, policy, and provenance swap
  checks are intentionally deferred to Task140R0's private registered resolver;
  no frozen-object immutability assertion is labeled as a live rejection.

Status: ready-for-review after the post-claim exact Task132A non-full gate
exited `0` with 3 files / 55 focused tests passing, TypeScript, whitespace, and
factory readiness passing. One scoped forward commit, temporary dependency
removal, and fresh complete staged-base review remain. Full verification,
`neo`, provider/network/credential/Nous, reset credits, self-review,
self-integration, merge, and downstream work remain closed.
