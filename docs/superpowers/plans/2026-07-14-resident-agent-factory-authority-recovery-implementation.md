# Resident Agent Factory Authority Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the Task132/134/135/140 cycle while keeping verified context
registrations, runner preparation, mounted stores, and terminal H readback in
their actual source-of-truth owners.

**Architecture:** The default factory remains blocked until it has actual
registrar or store inputs. Task132 first captures real package-registrar facts
inside a factory-held context closure. Task134 next normalizes a runner result
as an explicitly untrusted, nonterminal preparation input; Task135 constructs
only a mounted preparation-binder closure. After all prerequisites, Task140P
adds private pre-dispatch admission, Task140R0 registers the factory-held
closure, Task140H alone performs prepare, bind, readback, and terminal
completion, and Task140R1 removes the now-inert public H injection surface.

**Tech Stack:** TypeScript, strict Zod contracts, Vitest, existing Cestus
event ledger and task orchestrator.

## Global Constraints

- Preserve rejected `70f70375`, `b5d07b93`, and blocked evidence `f53fa2ce`
  forward-only; none is program-branch integration evidence.
- The default factory stays fail-closed when it lacks actual registrar, mounted
  store, or orchestration inputs.
- Never mint verified context/runner authority from caller-owned structural
  tuples, opaque lookalikes, callbacks, local maps, brands, or fallbacks.
- Task134 cannot call H readback or claim recorded/completed/terminal success.
  Task135 cannot manufacture H completion. Task orchestrator remains the sole
  H sequence/readback/terminal writer.
- A registry without an exact factory-private admission registration must fail
  before `appendRunnerDispatchingCheckpoint`, delegate/provider activity, or
  any runner-specific ledger append. A public registry, callback, capability,
  store, tuple, or lookalike never supplies admission or a factory closure.
- Full verification is **CLOSED**: do not run `npm run verify`. Do not touch
  `neo`, use provider/network/credential/Nous actions, self-review,
  self-integrate, or merge.
- Every exit-sensitive gate is one `&&` chain and must exit `0`; every task
  stops for a fresh independent Terra/xhigh review and coordinator-only merge.

## CF-1R5 Supersession Table

| Preserved prior plan requirement | Authoritative CF-1R5 behavior |
| --- | --- |
| Runtime-composition Task134 Step 3's `verifyDurableRunnerResult` and H readback | Task134A has no H capability/readback or durable/terminal return. It emits only `UntrustedSpecialistHandoffPreparationV1`; a shaped delegate value is never durable evidence. |
| Runtime-composition Task135's `createProductionMountedRunnerHandoffBinding` passing H and accepting lifecycle readback | Task135A receives only an untrusted preparation input, revalidates it against mounted stores, and returns preparation readback. It cannot call H or append/claim any terminal event. |
| Runtime-composition Task140 factory-only writer | Task140P owns private pre-dispatch admission; Task140R0 registers the factory closure after all prerequisites; Task140H alone performs terminal H sequencing through that registration; Task140R1 removes the obsolete public H injection surface. A final reviewer reads the complete P/R0/H/R1 range. |
| An ad hoc local-runtime preparation shape, parser, or hash | `packages/agent/src/specialist-handoff-preparation.ts` is the single canonical pure codec owner. Task134A creates normalized untrusted data with it; Task135A and Task140H import its parser and hash and may not reproduce a local variant. |

`packages/agent/src/specialist-handoff-preparation.ts` is the canonical,
dependency-safe codec boundary. It exports only these pure non-authoritative
operations and frozen data types:

```ts
export interface UntrustedSpecialistHandoffPreparationV1 {
  readonly schemaVersion: "agent-specialist-handoff-preparation.v1";
  readonly taskId: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
  readonly runType: string;
  readonly handoffMaterial: SpecialistHandoffMaterial;
  readonly handoffMaterialHash: `sha256:${string}`;
  readonly preparationHash: `sha256:${string}`;
}

export interface MountedSpecialistHandoffPreparationReadbackV1 {
  readonly schemaVersion: "agent-specialist-handoff-preparation-readback.v1";
  readonly preparationHash: `sha256:${string}`;
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly materialStoreBindingHash: `sha256:${string}`;
  readonly manifestStoreBindingHash: `sha256:${string}`;
  readonly readbackHash: `sha256:${string}`;
}

export function parseUntrustedSpecialistHandoffPreparation(value: unknown): UntrustedSpecialistHandoffPreparationV1;
export function hashUntrustedSpecialistHandoffPreparation(value: Omit<UntrustedSpecialistHandoffPreparationV1, "preparationHash">): `sha256:${string}`;
export function parseMountedSpecialistHandoffPreparationReadback(value: unknown): MountedSpecialistHandoffPreparationReadbackV1;
export function hashMountedSpecialistHandoffPreparationReadback(value: Omit<MountedSpecialistHandoffPreparationReadbackV1, "readbackHash">): `sha256:${string}`;
```

`packages/agent/src/task-orchestrator.ts` owns the one transport ABI from a
runner to H. Task134A adds, and the local runner returns, only this frozen
field; the existing `durableHandoff` field is legacy input and is never H
authority after Task140H:

```ts
export interface TaskOrchestratorRunnerPreparationResult {
  readonly schemaVersion: "agent.task-orchestrator.runner-preparation.v1";
  readonly preparation: UntrustedSpecialistHandoffPreparationV1;
}

export interface TaskOrchestratorRunnerDispatchResult {
  readonly preparation?: TaskOrchestratorRunnerPreparationResult;
  readonly durableHandoff?: TaskOrchestratorRunnerDurableHandoffResult;
}
```

Task135A does not mutate this public dispatch result. It exports only a
non-indexed local factory constructor whose captured mounted stores expose an
opaque `prepare(preparation)` closure. Task140R0 captures that closure and
registers it privately. The H port's exact resolver signature is
`resolve({ runnerRegistry, taskId, attemptId, approvedRunId, runType,
preparation })`; it reparses and hashes the dispatch preparation, invokes the
captured Task135A binder, reparses and hashes the returned readback, and returns
only factory-captured material/manifest stores plus the matching frozen
preparation/readback. Neither Task135A's readback nor a store crosses a public
runtime input or structural dispatch tuple.

The codec imports and reparses `SpecialistHandoffMaterial` only through its
existing canonical parser/hash; that material is frozen **untrusted data**, not
a durable final output or store receipt. Both parsers reject non-plain/
accessor/symbol/sparse/custom input, unknown fields, a mismatched schema
version, and a hash that does not exactly recompute from stated fields. The
codec owns no authority, store, registration, provenance, H, recorded,
manifest object, lifecycle, or terminal field. Task135A validates mounted
*store bindings* and returns only their data-only binding hashes; it does not
write material or a manifest. Task140H reparses both data objects and obtains
actual stores only from the factory-registered private port below, then alone
writes material, manifest, H readback, and terminal state in order.

`packages/agent/src/task-orchestrator-handoff-port.ts` is the sole H-owned
execution-port module. It holds a module-private `WeakMap` keyed by the exact
runner-registry object. Its non-indexed factory-only registration function may
be imported directly by `agent-runtime-factory.ts` but is never re-exported
from `packages/agent/src/index.ts` or accepted by a public runtime input. It
has two exact phases: `requireRegisteredTaskOrchestratorHandoffPort(registry)`
performs admission before the runner dispatch checkpoint, and
`port.resolve({ runnerRegistry, taskId, attemptId, approvedRunId, runType,
preparation })` performs the post-dispatch preparation/readback/store lookup.
The map value is a closure that rechecks task/attempt/approved-run/hash and
returns only the factory-captured material store, manifest store, reparsed
preparation, and Task135A readback. A shaped dispatch result, structural port,
stores, material, readback, or H capability cannot populate this map. Missing,
swapped, stale, or mismatched admission fails before runner-specific ledger,
delegate, or provider activity; a post-dispatch mismatch fails before H prepare
or a terminal append. Task140R0 alone installs this closure after every
prerequisite is integrated.

## Dependency Graph

```text
Task132A registrar attestation ──> Task133
           │
           └─> Task134A canonical-codec + nonterminal preparation ──> Task135A mounted stores
                                                        │
Task133 + Task135A + original 136–139 prerequisites ──┴─> Task140P admission
                                                              │
                                                       Task140R0 registration
                                                              │
                                                       Task140H terminal H
                                                              │
                                                   Task140R1 injection removal
```

## Task 132A: Factory-Held Registrar Attestation

**Files:**

- Modify: `packages/local-runtime/src/agent-runtime-factory.ts`
- Create from the preserved Task132 recovery base:
  `packages/local-runtime/src/agent-runtime-context-packs.ts`
- Create from the preserved Task132 recovery base:
  `packages/local-runtime/test/agent-runtime-context-packs.test.ts`
- Create: `packages/local-runtime/test/agent-runtime-context-attestation.test.ts`
- Modify only if needed to expose existing private registrar evidence:
  `packages/agent/src/prr-context-packs.ts`,
  `packages/agent/src/operational-context-packs.ts`, and
  `packages/agent/src/investigative-context-packs.ts`
- Claim: new Task132A recovery claim.

**Recovery base:** the program branch lacks the rejected Task132 context-pack
source and its test; they exist only in preserved `70f70375`. Before dispatch,
the coordinator alone creates an isolated Task132A recovery branch from the
current program head and stages only that candidate's source/test snapshot for
forward repair, leaving its old claim and all program history untouched. This
is not a merge or readiness assertion. The author neither rebases nor stages
the rejected candidate, and the fresh reviewer must read the complete
staged-base-through-repair range before coordinator-only integration.

**Frozen rebase gate:** before staging or claiming, the coordinator verifies
the recovery base descends from CF-1 integration
`48c9cbcdcf723bcc74868f782bc2375bae565ae6`, reviewed Task120
`49c3490a262162bd1d7146994390a2a6b5052394`, and Task125
`2e5c35ab7bca33df9f1a0c482c496fbb93350086`. The claim records all full SHAs,
the current program-base SHA, and exact staged-base SHA; mismatch blocks
dispatch rather than rebasing a child.

**Consumes:** actual package-owned registrar records and mounted authority.
**Produces:** an unexported lexical factory-held context-binding verifier for a
later R0 port closure; it exposes no capability constructor at Task132A time.
Each producer module keeps its existing `WeakMap` private and exports only a
read-only registry lookup; no producer exports a record/mint operation. The
factory calls all three lookups against its own captured registry and retains
their identities for the later private verifier rather than accepting identity
text or a registrar tuple. Default composition blocked on a missing lookup is
correct.

> **Retired by the CF-1R5 Observability-Boundary Amendment below.** Do not
> implement the original Task132A Steps 1–5. In particular, neither a public
> context-surface capability call nor a direct factory call with a structural
> registrar tuple is an admissible Task132A acceptance path. The only current
> Task132A implementation and test instructions are the replacement steps in
> that amendment; the original text remains available in Git history as the
> rejected pre-amendment contract.

## Task 134A: Factory-Closed Normalized Handoff Preparation

**Files:**

- Create from the preserved Task134 recovery base:
  `packages/local-runtime/src/agent-runtime-specialist-runners.ts`
- Create from the preserved Task134 recovery base:
  `packages/local-runtime/test/agent-runtime-specialist-runners.test.ts`
- Create: `packages/local-runtime/test/agent-runtime-runner-preparation.test.ts`
- Create: `packages/agent/src/specialist-handoff-preparation.ts`
- Modify (type-only transport ABI, no dispatch or H sequencing):
  `packages/agent/src/task-orchestrator.ts`
- Modify: `packages/agent/src/index.ts`
- Create: `packages/agent/test/specialist-handoff-preparation.test.ts`
- Claim: new Task134A recovery claim.

**Recovery base:** the program branch currently contains neither the rejected
Task134 runner source nor its test; both exist only in preserved `b5d07b93`.
After Task132A is reviewed and integrated, the coordinator alone creates an
isolated Task134A recovery branch from that integrated program head and stages
the `b5d07b93` runner source/test snapshot there for forward repair. That
staging branch is not program integration evidence. The final fresh reviewer
must read the complete staged-base-through-repair range before the coordinator
may merge it. The child neither rebases nor stages the rejected candidate.

**Frozen rebase gate:** Task134A starts only after reviewed/coordinator-
integrated Task132A and a base descendant of CF-1 integration
`48c9cbcdcf723bcc74868f782bc2375bae565ae6`, Task121
`1a92a2c2e41a6f15282307c6a29deb196a2e3fb5`, Task122
`9839fbf8c9010425f8585a4eb5edd8879c738eba`, Task123
`87f5d940a4476fdcb0040c4554d5a7a2172d0c4b`, and Task124
`73003f60441b531d95bcb80755a6fc90148e09fe`. Its claim records every full
SHA, Task132A integration SHA, current program-base SHA, and staged-base SHA.

**Consumes:** Task132A's reviewed factory closure as a rebase prerequisite and
the existing public four-field runner dispatch request. **Produces:** the
single canonical codec plus only normalized
`UntrustedSpecialistHandoffPreparationV1` data in
`TaskOrchestratorRunnerDispatchResult.preparation` with schema version
`agent.task-orchestrator.runner-preparation.v1`. The Task134A type-only
`task-orchestrator.ts` edit must not alter dispatch, append, H, or terminal
behavior. It has no executable capability constructor: before Task140R0 the
default factory keeps its existing blocked runner registry, and Task135A
receives only the data through the private future closure, never a factory
capability. It produces no recorded/terminal success.

- [ ] **Step 1: Write causal RED tests.**

  In the agent codec test, prove a local parser/hash divergence, a mismatched
  preparation/readback hash, and accessor/prototype/symbol/sparse shaped input
  reject. In the runner tests, prove a caller-supplied
  authority/store/registration/provenance/readiness/H tuple rejects before
  delegate/H activity; mutable input cannot cross an await; and a delegate
  event-shaped/durable-looking response is classified as the exact
  `preparation` dispatch field only, never a durable or terminal result.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/agent/test/specialist-handoff-preparation.test.ts packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/local-runtime/test/agent-runtime-runner-preparation.test.ts packages/agent/test/specialist-runner-kernel.test.ts` and record codec, structural-constructor, and terminal-claim failures.

- [ ] **Step 3: Implement the minimal nonterminal boundary.**

  First implement the agent-owned canonical parser/normalizer/hash functions
  and export them through `packages/agent/src/index.ts`; they must be pure and
  have no H or store import. Add only the declared `preparation` dispatch ABI
  to `task-orchestrator.ts`. The runner then normalizes once before await and
  returns only that parsed preparation under this ABI, with no H readback,
  recorded, manifest object, lifecycle, store, authority, or terminal
  assertion. Delete/refuse any public production-capability constructor or
  closed tuple path. The default factory remains blocked; the only future
  executable closure is Task140R0's private composition after Task135A.

- [ ] **Step 4: Run GREEN and exact gate.**

  `npm test -- packages/agent/test/specialist-handoff-preparation.test.ts packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/local-runtime/test/agent-runtime-runner-preparation.test.ts packages/agent/test/specialist-runner-kernel.test.ts && npm run typecheck && git diff --check && npm run factory:check`

- [ ] **Step 5: Commit and fresh review.**

  Commit only the listed files and Task134A claim. A fresh reviewer verifies
  that Task135A and Task140H have exactly one imported parser/hash owner and
  that no local shape is an authority. Coordinator integration unblocks
  Task135A; it does not authorize H finalization.

## Task 135A: Mounted Preparation Stores

**Files:**

- Create: `packages/local-runtime/src/mounted-agent-artifact-stores.ts`
- Create: `packages/local-runtime/test/mounted-agent-artifact-stores.test.ts`
- Claim: new Task135A recovery claim.

**Consumes:** a parsed-but-untrusted Task134A
`TaskOrchestratorRunnerDispatchResult.preparation` value. **Produces:** a
non-indexed, factory-direct mounted preparation-binder closure: its only
operation accepts that canonical preparation, verifies exact mounted
authority/task/attempt/run, and returns the canonical
`MountedSpecialistHandoffPreparationReadbackV1`. It captures actual material
and manifest stores but exposes neither through public runtime input or the
dispatch result. Task140R0 alone captures this closure and Task140P's private
port invokes it during `resolve`. These files do not exist on the program
branch, so this task creates them rather than silently assuming they landed. It
never writes material or manifest bytes, appends H recorded/terminal/task-status
completion, or receives an H capability.

- [ ] **Step 1: Write causal RED tests.**

  Prove forged/nonterminal delegate preparation, codec parser/hash divergence,
  structural binder lookalike, mismatched authority, and a terminal-looking
  substitute all reject before a binder/store/H activity. Prove no material or
  manifest write/readback can occur in this lane.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/agent/test/specialist-handoff-projection.test.ts` and record the missing preparation/readback failure.

- [ ] **Step 3: Implement mounted preparation readback only.**

  Parse the Task134A preparation only with the agent-owned codec, recheck
  mounted authority plus task/attempt/run, and construct the captured binder
  that creates canonical data-only material- and manifest-store binding hashes.
  Do **not** put material, create a manifest, append H, or claim a
  material/manifest artifact hash: Task140H alone does those terminal-sequence
  operations through Task140P's private factory lookup. The binder is imported
  directly by Task140R0 and is never accepted as an input, re-exported through
  an index, or returned in a public result. Return preparation evidence, not
  completion; no temporary/local/fallback copy or local parser/hash
  implementation is permitted.

- [ ] **Step 4: Run GREEN and exact gate.**

  `npm test -- packages/agent/test/specialist-handoff-preparation.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/agent/test/specialist-handoff-projection.test.ts && npm run typecheck && git diff --check && npm run factory:check`

- [ ] **Step 5: Commit and fresh review.**

  Commit only the listed files and Task135A claim. Coordinator integration
  records the SHA for Task140P/R0/H; it never marks a handoff terminal.

**Frozen rebase gate:** Task135A begins only after reviewed/coordinator-
integrated Task134A and a base descendant of CF-1 integration
`48c9cbcdcf723bcc74868f782bc2375bae565ae6`, Task121
`1a92a2c2e41a6f15282307c6a29deb196a2e3fb5`, Task122
`9839fbf8c9010425f8585a4eb5edd8879c738eba`, Task123
`87f5d940a4476fdcb0040c4554d5a7a2172d0c4b`, and Task125
`2e5c35ab7bca33df9f1a0c482c496fbb93350086`. Its claim records all full SHAs,
Task134A integration SHA, and exact program-base SHA.

## Task 140P: H-Owned Private Port Admission

**Files:**

- Create: `packages/agent/src/task-orchestrator-handoff-port.ts`
- Modify only for pre-dispatch admission: `packages/agent/src/task-orchestrator.ts`
- Create: `packages/agent/test/task-orchestrator-handoff-port.test.ts`
- Modify: `packages/agent/test/task-orchestrator-dispatch.test.ts`
- Modify: `packages/agent/test/task-orchestrator-approval.test.ts`
- Claim: new Task140P claim.

**Prerequisites:** reviewed/coordinator-integrated Task132A, Task133, Task134A,
Task135A, Task136–139, and their recorded rebases. Its claim enumerates every
accepted full 40-character SHA for 132 through 139 and proves its base descends
from CF-1 integration `48c9cbcdcf723bcc74868f782bc2375bae565ae6`; a candidate
SHA or “original prerequisites” is insufficient.

- [ ] **Step 1: Write causal RED tests.**

  Prove a public runtime registry with no exact private `WeakMap` registration
  cannot reach `appendRunnerDispatchingCheckpoint`, delegate/runner dispatch,
  provider activity, runner-specific ledger append, H, or terminal state. A
  forged registry/port/callback/tuple must have the same zero-effect result.
  Convert the existing valid provider-approval test to prove its unregistered
  standalone registry now fails closed without a provider call; valid admission
  is proved later only by Task140R0 factory-composition tests.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts` and record the absent-admission failure before any delegate/provider/ledger effect.

- [ ] **Step 3: Implement the minimal admission seam.**

  Create the non-indexed H-owned module with a module-private `WeakMap`, direct
  factory registration, and `requireRegisteredTaskOrchestratorHandoffPort`.
  In `dispatchApprovedRunner`, require the exact registry admission before any
  runner dispatch checkpoint or delegate call; this task does not parse a
  preparation, resolve stores, change H sequencing, or accept a public
  capability. A missing port fails closed. The future resolver interface is
  declared here but cannot be populated by structural input.

- [ ] **Step 4: Run GREEN and exact gate.**

  `npm test -- packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts && npm run typecheck && git diff --check && npm run factory:check`

- [ ] **Step 5: Commit and fresh review.**

  Commit only the listed files and Task140P claim. A fresh reviewer must verify
  the zero-effect hostile-registry test and that no H/terminal behavior changed.
  Coordinator integration intentionally leaves production dispatch fail-closed
  until Task140R0 is reviewed and integrated.

## Task 140R0: R-Owned Factory Port Registration

**Files:**

- Modify: `packages/local-runtime/src/agent-runtime-factory.ts`
- Create: `packages/local-runtime/test/agent-runtime-composition.test.ts`
- Modify: `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`
- Claim: new Task140R0 claim.

**Prerequisites:** reviewed/coordinator-integrated Task140P plus every Task140P
prerequisite. Its claim repeats the exact 132–139 full SHAs, Task140P SHA, and
CF-1 integration `48c9cbcdcf723bcc74868f782bc2375bae565ae6`. This is the sole
factory registration: it captures reviewed Task134A normalization and the
Task135A binder/stores, then registers the H-owned `WeakMap` resolver against
the exact runner registry. It accepts no public structural tuple and remains
blocked on any missing captured collaborator. Before edits, the coordinator
must explicitly approve and invoke `superpowers:subagent-driven-development`
and record that approval in the Task140R0 claim.

- [ ] **Step 1: Write causal RED tests.**

  Create the isolated composition suite. Prove a public tuple/lookalike cannot
  construct or register the closure; legacy-v1 and direct/caller-supplied
  exact-v2 artifacts are rejected; caller-supplied production bindings,
  `providerPostureHash`, and `exactRunBindingHash` are rejected; and each
  exact-run, provider-posture, and six private context value can be swapped one
  at a time only to fail closed. Every negative case must assert zero renderer,
  provider-adapter, ledger-append, runner-dispatch, H prepare/bind/readback,
  store, and terminal activity. A valid factory-captured control alone reaches
  exactly one exact-v2 renderer call and still performs none of those later
  effects in R0. Provider activity means readiness lookup, adapter invocation,
  or network call; ledger activity means any read, write, or append.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts` and record the missing private registration/exact renderer path and every incorrectly admitted direct, injected, or swapped case.

- [ ] **Step 3: Implement private registration only.**

  Construct the resolver inside the factory from reviewed collaborators and
  bind it through Task140P's non-indexed registration seam. Its `resolve` must
  reparse/hash the Task134A preparation, call the captured Task135A binder,
  reparse/hash its readback, then return only the captured stores plus matching
  frozen data. Before invoking the exact renderer, it strictly compares every
  captured exact-run, provider-posture, and context value. It exposes only the
  existing narrow orchestration route; it does not accept a caller artifact,
  binding, derived hash, capability argument, or duplicate H
  prepare/bind/readback.
  The old public `handoffCapability` remains temporarily inert for Task140H to
  remove functionally; Task140R1 removes its shape after H is reviewed.

- [ ] **Step 4: Run GREEN and exact gate.**

  `npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts && npm run typecheck && git diff --check && npm run factory:check`

  GREEN requires the valid captured control to invoke
  `renderExactlyBoundProductionSpecialistPrompt` exactly once and return a
  recomputed matching v2 binding, while every negative RED above rejects with
  all effect counters still at zero.

- [ ] **Step 5: Commit and fresh review.**

  Commit only the listed files and Task140R0 claim. A fresh reviewer verifies
  closure capture, exact registry identity, and the absence of H/terminal work.

## Task 140H: H-Owned Exact H Finalization

**Files:**

- Modify: `packages/agent/src/task-orchestrator.ts`
- Modify: `packages/agent/src/runtime.ts`
- Modify: `packages/agent/src/runtime-types.ts`
- Modify: `packages/agent/test/task-orchestrator-dispatch.test.ts`
- Modify supporting H tests only as required by removal of functional public
  runtime injection: `packages/agent/test/task-orchestrator-recovery.test.ts`,
  `packages/agent/test/task-orchestrator-evidence-triage.test.ts`, and
  `packages/agent/test/task-orchestrator-evidence-triage-live.test.ts`
- Modify: `packages/agent/test/task-orchestrator-handoff-port.test.ts`
- Claim: new Task140H claim.

**Prerequisites:** reviewed/coordinator-integrated Task140R0 and every Task140P
prerequisite. Its claim repeats all exact 132–139 and Task140P/R0 SHAs.

- [ ] **Step 1: Write causal RED tests.**

  Prove a registered runner's `preparation` is insufficient without an exact
  resolving port; a structural port, legacy `durableHandoff`, supplied H
  capability, swapped preparation/store binding/authority/readback, or
  delegate/H echo rejects before terminal/status append. Prove even a throwing
  public `handoffCapability` has no effect. Only the valid registered resolver
  may produce material -> manifest -> readback -> terminal ordering.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts packages/agent/test/specialist-runner-kernel.test.ts` and record resolver, legacy-handoff, and public-injection failures.

- [ ] **Step 3: Implement exact orchestration.**

  Import the agent-owned codec; do not create a task-orchestrator parser/hash
  or local shape. Consume only the declared dispatch `preparation`, reject a
  `durableHandoff` as H authority, and invoke the private port resolver.
  Recompute preparation/readback hashes and require exact mounted
  authority/task/attempt/run/material/manifest binding before task-orchestrator
  alone executes H prepare/bind/readback and terminal/task-status sequencing.
  Remove every functional use/forwarding of public `handoffCapability`; it may
  remain type-compatible but inert only until Task140R1 performs the serialized
  compile-safe shape removal. This is the only task that changes H sequencing.

- [ ] **Step 4: Run GREEN and exact gate.**

  `npm test -- packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts packages/agent/test/specialist-runner-kernel.test.ts && npm run typecheck && git diff --check && npm run factory:check`

- [ ] **Step 5: Commit and fresh review.**

  Commit only the listed files and Task140H claim. H review approves this
  commit before the serialized injection-removal claim starts.

## Task 140R1: Serialized Public-H Injection Removal

**Files:**

- Modify: `packages/local-runtime/src/agent-runtime-factory.ts`
- Modify: `packages/local-runtime/test/agent-runtime-composition.test.ts`
- Modify: `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`
- Modify only to remove the obsolete public field: `packages/agent/src/runtime-types.ts`,
  `packages/agent/src/runtime.ts`, and `packages/agent/src/task-orchestrator.ts`
- Modify: `packages/agent/test/task-orchestrator-dispatch.test.ts`,
  `packages/agent/test/runtime.test.ts`,
  `packages/agent/test/task-orchestrator-approval.test.ts`,
  `packages/agent/test/task-orchestrator-claims.test.ts`,
  `packages/agent/test/task-orchestrator-evidence-triage.test.ts`,
  `packages/agent/test/task-orchestrator-evidence-triage-live.test.ts`, and
  `packages/agent/test/task-orchestrator-recovery.test.ts`
- Claim: new Task140R1 claim.

**Prerequisites:** reviewed/coordinator-integrated Task140H plus every prior
Task140 prerequisite. Its claim repeats every exact 132–139, P, R0, and H SHA.
This serialized cleanup removes the public `handoffCapability` property and
factory construction in one typecheck-valid commit; it does not alter the
private port, binder, H order, or any terminal behavior.

- [ ] **Step 1: Write causal RED tests.**

  Prove no public runtime capability shape can carry `handoffCapability`, the
  production factory constructs no such object, every named prior typed test
  fixture compiles without that property, and valid private-port H execution
  remains reachable only through the registered resolver.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/runtime.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-claims.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts` and record the obsolete public-field failure.

- [ ] **Step 3: Remove only the obsolete structural route.**

  Remove `handoffCapability` from runtime capability types, forwarding,
  task-orchestrator inputs, and the local factory; retain the reviewed private
  port registration/resolver unchanged. Do not introduce a replacement tuple,
  brand, callback, public registration function, or H implementation change.

- [ ] **Step 4: Run GREEN and exact gate.**

  `npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/runtime.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-claims.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts && npm run typecheck && git diff --check && npm run factory:check`

- [ ] **Step 5: Commit and complete-range review.**

  Commit only the listed files and Task140R1 claim. A reviewer distinct from
  all Task140 authors reads the complete Task140P base through Task140R1 head
  and approves admission, factory capture, terminal H, and removal interaction
  before coordinator-only integration.

## Review And Dispatch Order

The coordinator first obtains a fresh plan review for this amendment. It then
dispatches Task132A; after review/integration, Task133 and serialized Task134A
may start. Task135A starts only after Task134A integration. Task140P remains
blocked until Task133, Task135A, and all original 136–139 prerequisites are
reviewed/integrated; reviewed integration then serializes Task140R0, Task140H,
and Task140R1. Each rejected candidate is repaired forward with a fresh review;
no child self-integrates.

## CF-1R5 Observability-Boundary Amendment — Task132A and Task140R0

**Status:** This amendment supersedes only the Task132A live-capability test
wording and the corresponding Task140R0 acceptance minimum. It is a forward
correction to resolve a verified testability/authority conflict; it does not
weaken registrar integrity, factory-private authority, H sequencing, terminal
state, provenance, or any prerequisite.

**Root cause:** Before Task140R0, no production caller registers the
factory-held closure into an observable runtime path. A Task132A test cannot
both construct a live capability from an external module and preserve the
invariant that no public tuple, brand, callback, fallback, constructor, or
shadow route can mint one. Frozen-object mutation is an immutability check, not
the required live resolution-integrity acceptance, and must not be labeled as
such.

### Task132A replacement acceptance boundary

**Files:** retain the existing Task132A eight-file ceiling. The preferred
minimal set is `packages/local-runtime/src/agent-runtime-factory.ts`,
`packages/local-runtime/src/agent-runtime-context-packs.ts`, the two named
local-runtime tests, the three named package registrar modules only when their
read-only accessor evidence needs correction, and the existing Task132A claim.

**Produces:** a lexical factory-owned closure that has no public construction
or capture/consume API. It may remain unused until Task140R0. The closure must
not be exported directly or indirectly; an external module must not be able to
supply a registry, obtain a factory capability, or create a mounted context
capability through a tuple, brand, callback, fallback, test hook, or shadow
constructor.

- [ ] **Step 1: Write Task132A causal REDs before source edits.**

  In `packages/local-runtime/test/agent-runtime-context-packs.test.ts`, import
  the public context/runtime modules exactly as an external consumer would and
  assert `Reflect.get(module, "captureFactoryContextPackAttestation")`,
  `Reflect.get(module, "createFactoryHeldMountedAgentContextCapability")`, and
  every exported capability-construction wrapper are `undefined`; an attempted
  external registry registration may retain its normal public
  `buildResolved` behavior but must not yield a factory-held attestation or
  mounted factory capability. Keep
  real PRR (`prr-request`), operational (no manifest), and investigative
  (plural high-water) registrar fixtures. Assert each read-only accessor returns
  its actual captured registrar evidence, while a foreign/manual registry
  returns `undefined` and the default empty factory composition returns blocked
  before builder activity. These are absence/readback/fail-closed REDs, not
  substitute resolution acceptance tests.

- [ ] **Step 2: Run the Task132A focused RED.**

  Run exactly:
  `npm test -- packages/local-runtime/test/agent-runtime-context-packs.test.ts packages/local-runtime/test/agent-runtime-context-attestation.test.ts packages/agent/test/context-packs.test.ts`

  Record the expected failure that a public capture/consume/constructor route
  exists or that foreign/manual/default composition does not fail closed.

- [ ] **Step 3: Implement the smallest lexical private closure.**

  Keep producer `WeakMap`s private; producer modules expose only read-only
  lookups. Build the closure lexically inside `agent-runtime-factory.ts` from
  its captured registry and those accessors. Do not export a capability
  constructor, a capture token, an attestation tuple, a callback accepting a
  caller registry, or a test-only hook. Preserve captured identity rechecks and
  default fail-closed behavior. Do not invoke H, task orchestration, provider
  work, durable append, or terminal/success logic.

- [ ] **Step 4: Run Task132A GREEN and the exact non-full gate.**

  `npm test -- packages/local-runtime/test/agent-runtime-context-packs.test.ts packages/local-runtime/test/agent-runtime-context-attestation.test.ts packages/agent/test/context-packs.test.ts && npm run typecheck && git diff --check && npm run factory:check`

  The claim must state that the six content-hash, source-high-water,
  selection-manifest, scope, policy, and provenance live-path swaps are
  intentionally deferred to Task140R0; it must not call frozen-object
  immutability a resolution rejection. Commit only the existing Task132A scope
  and stop for fresh complete staged-base review.

### Task140R0 added live-path registrar-integrity acceptance

**Files:** modify
`packages/local-runtime/src/agent-runtime-factory.ts`, create
`packages/local-runtime/test/agent-runtime-composition.test.ts`, modify
`packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`, and
create the Task140R0 claim. No other test path, Task132A public API, or
test-only constructor may be introduced.

**Consumes:** reviewed/coordinator-integrated Task132A lexical closure,
Task140P's non-indexed admission seam, reviewed Task134A normalization, and
Task135A binder/stores. **Produces:** the first actual production-observable
registration of the factory-held closure, still without H prepare or terminal
append authority.

**Private R0 bridge:** Task132A leaves an unexported
`verifyFactoryHeldContextBindings` lexical closure in
`packages/local-runtime/src/agent-runtime-factory.ts`. It captures only the
factory-created registry, mounted authority, and canonical registration bindings;
none is accepted by `LocalAgentRuntimeFactoryInput`, a public runtime DTO, or
the Task140P port request. Task140R0 creates this closure while composing the
actual factory and closes it inside the one `Task140P` handoff-port resolver it
registers for the exact runner-registry object. On every `resolve({
runnerRegistry, taskId, attemptId, approvedRunId, runType, preparation })`, the
private resolver must first derive required IDs and expected content hashes from
`preparation.handoffMaterial.contextPackRefs`, invoke the captured verifier,
and only then invoke the captured Task135A binder. The verifier rebuilds through
the captured registry and compares the actual resolved evidence against the
factory-captured binding for exact content hash, source high-water, selection
manifest/proof, scope, policy version, and provenance before the port returns
its existing stores/preparation/readback result. The verified binding set is
not a public result or caller-supplied argument. A mismatch throws from R0's
private resolver before Task135A binding, H prepare/readback, or terminal
append; a missing factory capture makes the port unavailable.

- [ ] **Step 1: Write Task140R0 causal REDs.**

  Through the real factory-created, Task140P-registered production path—not a
  direct exported helper—construct a valid captured registration control and
  six independent counterfactuals that swap exactly one of: content hash,
  source high-water, selection manifest, scope, policy, or provenance. Each
  counterfactual must reach the live admission/resolve boundary and reject
  before renderer, provider readiness/adapter/network, any ledger, runner-dispatch, H
  prepare/bind/readback, store, or terminal activity. Keep separate REDs
  proving a public tuple/lookalike cannot construct or register the closure;
  legacy-v1 and direct/caller-supplied exact-v2 artifacts cannot enter; caller
  production bindings or derived hashes cannot be injected; and every
  exact-run and provider-posture value swapped one at a time rejects at the
  same zero-effect boundary. The valid captured control alone may invoke the
  exact renderer once.

- [ ] **Step 2: Run Task140R0 focused RED.**

  Run exactly:
  `npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts`

  Record the missing registration/exact renderer path or each incorrectly
  accepted legacy, direct-v2, injected-hash, exact-run, posture, or context
  counterfactual.

- [ ] **Step 3: Implement only private R0 registration and live rechecks.**

  Construct the lexical verifier and the port resolver inside the factory from
  captured collaborators. The resolver must first map
  `preparation.handoffMaterial.contextPackRefs` to factory-captured bindings,
  rebuild the actual pack through the captured registry, and reject each exact
  mismatch of content hash, source high-water, selection manifest/proof, scope,
  policy version, or provenance before it calls Task135A's `prepare`. It then
  checks every captured exact-run and provider-posture value before rendering,
  performs the existing preparation/readback reparse/hash and binder checks,
  and invokes the exact-v2 renderer once only for the valid control.
  Register only that closed resolver through Task140P's non-indexed
  runner-registry `WeakMap`; no caller may pass a closure/capability/tuple, and
  the resolver does not return a context capability or verified binding set.
  No duplicate H sequencing or terminal logic is allowed. A missing, stale,
  swapped, or mismatched value fails closed before Task135A binding, H, and
  terminal state.

- [ ] **Step 4: Run Task140R0 GREEN and exact gate.**

  `npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts && npm run typecheck && git diff --check && npm run factory:check`

  GREEN and the Task140R0 claim must enumerate the successful exact-v2 control;
  legacy-v1, direct-v2, binding/hash-injection, every exact-run/posture swap,
  all six live-path context swaps, and public tuple rejection; and zero activity
  for every named effect in each negative case. Full verification remains
  closed; a fresh independent complete-range review is required before
  coordinator integration.

**Revised release order:** fresh plan review approves this amendment; then a
fresh bounded Task132A author may implement only the replacement Task132A
boundary. Task133 and Task134A remain blocked until its reviewed/coordinator
integration. Task140R0 remains blocked on all of its original prerequisites;
this amendment does not accelerate any H or terminal work.
## CF-1R5 Task133 Pure Renderer And Task140R0 Private Composition Amendment

This corrective amendment supersedes only the original Task133 public
`createProductionAgentPromptCapability({ authority, renderer, verifyContext })`
and structural `VerifiedContextBindingSet` callback contract. That contract is
retired: Task132A keeps `MountedWorkspaceRuntimeAuthority`,
`VerifyMountedContextForRunInput`, `VerifiedContextBindingSet`, its `WeakSet`
membership, factory attestation, and lexical verifier private in
`packages/local-runtime/src/agent-runtime-context-packs.ts` and
`packages/local-runtime/src/agent-runtime-factory.ts`. Task133 must not
re-export or duplicate those shapes, accept an authority/verifier/context
capability/registrar/factory capture, or add a public callback, tuple, brand,
fallback, shadow capability, mint route, or production-readiness claim.

### Source-backed canonical data ownership

`packages/agent/src/prompt-artifacts.ts` remains the canonical owner of
`ContextPackRef`, `PromptArtifactResolvedPayloadAudit`,
`PromptArtifactEvaluatedContextRequirement`, `PromptArtifactProductionBinding`,
`PromptArtifactEnvelope`, `buildPromptArtifact`,
`parsePromptArtifactEnvelope`, and `promptArtifactAuditMetadata`.
`buildPromptArtifact` already normalizes and freezes an envelope, but it does
not bind task/attempt/approved-run/provider posture and requires private
`VerifiedResolvedContextPack` values whenever a production binding is present.
`packages/agent/src/production-specialist-prompts.ts` likewise renders only
from verified resolved packs. Neither is a legal Task133 public input.

Task133 therefore owns the one canonical **data-only** input module
`packages/local-runtime/src/agent-runtime-prompt-render-input.ts` and its
test `packages/local-runtime/test/agent-runtime-prompt-render-input.test.ts`.
It exports exactly `PureAgentPromptRenderInputV1`,
`normalizePureAgentPromptRenderInput`, and
`hashPureAgentPromptRenderInput`; no package index re-export, capability, or
factory constructor is added. The normalizer accepts only a plain own-data,
symbol-free, dense-array input, freezes its result, and rejects accessor,
prototype, sparse-array, stale, or swapped values before any render. Its
canonical hash covers exactly:

- `schemaVersion: "agent-runtime-pure-prompt-render-input.v1"`, `taskId`,
  `attemptId`, `approvedRunId`, `runType`, and
  `residentAgentId: "agent_default"`;
- `workspaceId`, `mountInstanceId`, `workflowDescriptorHash`, `policyVersion`,
  and `scopeApplicabilityHash`;
- `providerPosture` data only: `providerId`, `modelId`, `capabilityIds`,
  `selectionPolicyVersion`, `readinessState: "ready"`,
  `approvalRequirementId`, and `postureHash`;
- `promptTemplateId`, `promptTemplateVersion`, `rendererId`,
  `rendererVersion`, `rendererHash`, `providerOutputSchemaId`,
  `providerOutputSchemaVersion`, `handoffSchemaId`, and
  `handoffSchemaVersion`; and
- canonical `contextPackRefs`, `resolvedPayloadAudits`,
  `evaluatedContextRequirements`, allowed omissions, and a bounded plain-data
  `templateData` value.

Those are normalized data/audit facts, never Task132 private verified-binding
objects or a substitute proof that a context pack was verified. Later users
import this one module rather than reproduce its parser or hash.

### Task133: pure renderer replacement

**Files:**

- Create: `packages/local-runtime/src/agent-runtime-prompt-render-input.ts`
- Create: `packages/local-runtime/test/agent-runtime-prompt-render-input.test.ts`
- Create: `packages/local-runtime/src/agent-runtime-prompt-renderer.ts`
- Create: `packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts`
- Create: `docs/agentic/claims/task-133-resident-runtime-prompt-renderer.md`

Task133 exports exactly
`renderPureAgentPrompt(input: PureAgentPromptRenderInputV1): Readonly<PromptArtifactEnvelope>`
from `agent-runtime-prompt-renderer.ts`. It first calls the canonical Task133
normalizer/hash, then uses the agent-owned prompt-artifact builder only to
return a frozen, local-only envelope with `safetyClass: "sensitive-local-only"`,
`transferApprovalClass: "none"`, and no production binding. Prompt text may
exist only inside that in-process returned envelope so a later private
composition can use it; it is never logged, placed in diagnostics, audit
metadata, DTOs, ledger events, errors, or a handoff. The envelope alone is not
provider-transferable, executable, readiness, verified-context, durable, or
terminal evidence. The renderer does not resolve a secret, call a provider,
consume approval, inspect a factory closure, or invoke a context verifier.

- [ ] **Step 1: Write causal REDs.**

  Prove malformed/accessor/prototype/symbol/sparse inputs and swaps of run,
  attempt, approved run, workspace/mount, policy, provider posture, template,
  renderer hash, schema version, context ref/audit, or input hash reject before
  text creation. Prove the result is frozen, has no production binding, cannot
  pass `assertPromptArtifactCanTransferToRemoteProvider`, and its diagnostics
  and `promptArtifactAuditMetadata` contain no rendered text. No RED may use a
  Task132 type, callback, or fake capability.

- [ ] **Step 2: Run the focused RED command.**

  `npm test -- packages/local-runtime/test/agent-runtime-prompt-render-input.test.ts packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts packages/agent/test/prompt-artifacts.test.ts`

  Expected: FAIL because the named pure input/renderer exports are absent;
  existing prompt-artifact coverage remains green.

- [ ] **Step 3: Implement the smallest data-only normalizer and renderer.**

  Implement only the named pure input parser/hash and
  `renderPureAgentPrompt`. Do not add a context/factory/provider API, a
  production binding, or a transfer/readiness assertion.

- [ ] **Step 4: Run focused GREEN and exact non-full gate.**

  GREEN reruns the Step 2 command. The final required fail-fast gate is one
  chain:

  `npm test -- packages/local-runtime/test/agent-runtime-prompt-render-input.test.ts packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts packages/agent/test/prompt-artifacts.test.ts && npm run typecheck && git diff --check && npm run factory:check`

  `npm run verify` remains **CLOSED**.

- [ ] **Step 5: Claim, commit, and review.**

  The claim records Task132A integration
  `7ec1eb6885716ac7324839c578677366fe1bb244`, reviewed/integrated Tasks126–130,
  exact program base/rebase, the causal RED, final gate, local-only envelope
  boundary, and no public authority route. A fresh independent Terra/xhigh
  reviewer reads the complete rebase-base-through-candidate range before a
  coordinator-only merge. Task134A remains independent.

### Task140R0 private renderer composition seam

Only Task140R0, after its existing lexical factory verifier has completed the
six live checks, may copy those private verified facts into
`PureAgentPromptRenderInputV1`, call `renderPureAgentPrompt` inside the private
resolver in `packages/local-runtime/src/agent-runtime-factory.ts`, and retain
the result only for its closed composition. It then uses the captured private
resolved packs and agent-owned prompt-artifact contracts to form any later
production binding; it does not return a capability, verified binding, or
caller-supplied verifier. Data flows one way from private R0 verification to
pure Task133 data to the private renderer call. Task133 does not import R0;
R0 depends on reviewed/integrated Task133, so no cycle arises.

Task140R0 modifies
`packages/local-runtime/src/agent-runtime-factory.ts`, creates
`packages/local-runtime/test/agent-runtime-composition.test.ts`, and modifies
`packages/local-runtime/test/agent-task-orchestrator-routes.test.ts` to add
causal tests that forged, stale, or each swapped normalized field cannot reach
the renderer, and that a direct Task133 local-only envelope is neither port
registration input nor executable/readiness evidence. Its focused RED/GREEN
and final non-full gate remain:

`npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts && npm run typecheck && git diff --check && npm run factory:check`

Task140R0 remains blocked on all of its existing prerequisites; this amendment
does not authorize its implementation, H sequencing, provider activity, or
terminal behavior.

## CF-1R5 Task133 Canonical Production Renderer Repair

This section supersedes the preceding Task133 pure-input/local-only-envelope
amendment in full. Do not implement
`agent-runtime-prompt-render-input.ts`, `templateData`, `postureHash` as an
input field, `renderPureAgentPrompt`, or a second local-only prompt artifact.
Those shapes were rejected because they left prompt material untyped, made
posture hashing circular, and required Task140R0 to create or upgrade a second
artifact.

Task133 instead extends the existing canonical agent-owned production prompt
path. It remains pure and non-authoritative: rendering an artifact never proves
mounted context, factory admission, provider approval, readiness, execution,
or terminal state. Task140R0 remains the sole later owner of private runtime
admission.

### Exact canonical binding owner

`packages/agent/src/prompt-artifacts.ts` owns these new frozen data contracts:

```ts
export interface PromptArtifactProviderPostureBinding {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityIds: readonly string[];
  readonly selectionPolicyVersion: string;
  readonly readinessState: "ready";
  readonly approvalRequirementId: string;
}

export interface PromptArtifactExactRunBinding {
  readonly schemaVersion: "agent-production-prompt-exact-run-binding.v1";
  readonly taskId: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
  readonly runId: string;
  readonly runType: AgentSpecialistRunType;
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workflowDescriptorHash: `sha256:${string}`;
  readonly policyVersion: string;
  readonly providerPosture: PromptArtifactProviderPostureBinding;
}
```

The same module exports exactly
`normalizePromptArtifactProviderPostureBinding`,
`hashPromptArtifactProviderPostureBinding`,
`normalizePromptArtifactExactRunBinding`, and
`hashPromptArtifactExactRunBinding`. The normalizers accept only exact-key,
plain own-data, symbol-free records and dense plain arrays. Capability IDs must
be unique and already in canonical lexical order. The posture hash is computed
from normalized posture material; it is never supplied as input. The exact-run
hash is computed from normalized exact-run material, including the nested
normalized posture; it is never supplied as input. Neither hash includes prompt
text, credentials, raw provider errors, local paths, or arbitrary template
data.

`PromptArtifactProductionBinding` gains required `exactRunBinding`,
`exactRunBindingHash`, and `providerPostureHash` fields. Build, parse,
serialize, freeze, transfer assertion, and audit metadata must normalize the
binding and recompute both hashes. A stale, forged, swapped, missing, or
noncanonical binding fails before an envelope is accepted or transferred.

### Task133 canonical renderer extension

Task133 changes exactly:

- modify `packages/agent/src/prompt-artifacts.ts`;
- modify `packages/agent/test/prompt-artifacts.test.ts`;
- modify `packages/agent/src/production-specialist-prompts.ts`;
- modify `packages/agent/test/production-specialist-prompts.test.ts`;
- create `docs/agentic/claims/task-133-resident-runtime-prompt-renderer.md`.

`RenderProductionSpecialistPromptInput` gains the exact-run fields not already
present: `attemptId`, `approvedRunId`, `residentAgentId`, `workspaceId`,
`mountInstanceId`, `workflowDescriptorHash`, `policyVersion`, and
`providerPosture`. Existing `taskId`, `runId`, `runType`, `generatedAt`,
`scope`, and `resolvedContextPacks` remain the sole canonical rendering inputs.
There is no `templateData`: the existing registered renderer and verified
resolved packs remain the only text-rendering path. Existing
`renderProductionSpecialistPrompt` normalizes the exact binding before text
rendering, calls the canonical template renderer once, and creates exactly one
provider-approved `PromptArtifactEnvelope` with the exact binding and computed
hashes in its production manifest. No second builder, local-only upgrade, or
Task140R0 renderer is permitted.

Task133 tests must establish causal rejection of changed task, attempt,
approved run, run, type, resident, workspace, mount, workflow descriptor,
policy, provider/model/capabilities/selection policy/readiness/approval
requirement, context ref/content hash, template/renderer/output/handoff schema,
and parsed/serialized exact-binding hashes. They must also reject accessors,
symbols, sparse/custom arrays, custom prototypes, duplicate or unsorted
capabilities, supplied hash lookalikes, and prompt/secret-bearing diagnostic
material. A valid artifact remains renderer-verified and provider-transfer
eligible only at the artifact boundary; tests must prove it performs zero
provider, approval, ledger, runner, H, store, or terminal effects.

RED command:

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/task-orchestrator-approval.test.ts
```

GREEN and final non-full fail-fast gate:

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/task-orchestrator-approval.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

Full verification remains **CLOSED**.

### Frozen Task133 dispatch gate

Before a fresh Task133 implementation author is dispatched, the coordinator
must integrate an independently approved version of this amendment and create
one new isolated branch from the then-current clean program head. That base
must descend from Task120 `49c3490a262162bd1d7146994390a2a6b5052394`,
Task126 `2e7a8a011ada9828f2978129ddc9f47719c33655`, Task127
`93a93844a18343a3d49933a4bf9fb92190224aa5`, Task128
`ba43f007c371229ca5ad96844f4b3bc08584702b`, Task129
`d362d1a73f45b947bcd6e1c7915c9e7fd9f96d3a`, Task130
`78f456263a9af1d010df494684ea2d0906134eb4`, and Task132A
`7ec1eb6885716ac7324839c578677366fe1bb244`. The coordinator records the
full resolved SHAs, plan-amendment integration SHA, exact program-base SHA,
focused prerequisite result, author session, and file ceiling before source
edits. Any mismatch blocks dispatch rather than creating a shadow type or
rebasing a child.

### One-way Task140R0 composition

Task140R0 modifies only its already assigned factory and route/composition
tests. After the factory's six live context checks and captured provider-policy
checks pass, it rebuilds the actual package-verified
`VerifiedResolvedContextPack[]` through its captured registry, constructs one
`RenderProductionSpecialistPromptInput` from the exact claim/attempt/run,
resident, mount, workflow, policy, provider posture, scope, and current time,
and calls `renderProductionSpecialistPrompt` exactly once. It checks the
artifact's exact-run and posture hashes before admitting only that artifact to
the existing private orchestration route. It does not create, upgrade, or
rebuild an envelope, render text, accept an artifact/binding from a caller, or
return a verifier/capability/private binding set.

Task140R0's existing focused suite must add one end-to-end causal path proving
canonical render -> exact binding/hash readback -> private factory admission.
Counterfactuals must prove every swapped exact-run/posture/context field and a
direct otherwise-valid production artifact fail before renderer/provider/
ledger/runner/H/store/terminal activity. Task133 has no Task140R0 dependency;
Task140R0 depends on reviewed/coordinator-integrated Task133, so no cycle or
conditional ownership remains. This section does not authorize Task140R0, H,
provider activity, or terminal work.

## CF-1R5 Task133 Discriminated Binding Migration And Exact Renderer Amendment

**Status:** This is the sole executable Task133 contract. It supersedes in
full the two earlier Task133 amendments headed `CF-1R5 Task133 Pure Renderer
And Task140R0 Private Composition Amendment` and `CF-1R5 Task133 Canonical
Production Renderer Repair`, including their local-only envelope, pure-input
module, `templateData`, five-file ceiling, and instruction to extend the
legacy renderer in place. Those rejected amendments remain forward-only Git
history, but no worker may implement, quote as current scope, or reconcile
their Task133 instructions. The current claim below is the only durable Task133
dispatch record.

### Non-authoritative Boundary

Task133 changes pure artifact data and its durable data projections only. It
does not construct or accept a factory authority, verifier callback, mounted
context capability, registrar capture, provider call, capability mint route,
H operation, store operation, terminal state, ledger-write authority, or
readiness claim. A rendered v1 or v2 artifact is not proof of verified context,
factory admission, provider approval, or execution. The ordinary runtime
continues to reject direct production invocation without its already-existing
proof; Task133 neither creates nor changes that proof route.

There is one canonical production prompt-text function:
`renderCanonicalProductionPrompt` in
`packages/agent/src/production-specialist-prompts.ts`. Both public renderer
entry points below call that function exactly once and then call the existing
`buildPromptArtifact` exactly once. No second text renderer, envelope upgrade,
local-only artifact, hash-to-text resolver, local parser/hash mirror, or
caller-supplied derived hash is permitted.

### Frozen Compatibility Contract

`packages/agent/src/prompt-artifacts.ts` remains the only owner of artifact
envelope, serialization, parser, transfer assertion, audit DTO, and derived
binding hashes. It must replace the unversioned production-binding object with
this discriminated output union. Every field shown is required; v2 has no
optional or defaulted exact-run, posture, or derived-hash field.

```ts
export interface PromptArtifactProductionBindingV1 {
  readonly schemaVersion: "agent-production-prompt-binding.v1";
  readonly rendererId: string;
  readonly rendererVersion: number;
  readonly rendererHash: `sha256:${string}`;
  readonly renderedPromptHash: `sha256:${string}`;
  readonly providerOutputSchemaId: string;
  readonly providerOutputSchemaVersion: number;
  readonly handoffSchemaId: string;
  readonly handoffSchemaVersion: number;
  readonly scopeApplicabilityHash: `sha256:${string}`;
  readonly evaluatedContextRequirements: readonly PromptArtifactEvaluatedContextRequirement[];
  readonly resolvedPayloadAudits: readonly PromptArtifactResolvedPayloadAudit[];
}

export interface PromptArtifactProviderPostureV2 {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityIds: readonly string[];
  readonly selectionPolicyVersion: string;
  readonly readinessState: "ready";
  readonly approvalRequirementId: string;
}

export interface PromptArtifactExactRunBindingV2 {
  readonly taskId: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
  readonly runId: string;
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workflowDescriptorHash: `sha256:${string}`;
  readonly policyVersion: string;
  readonly providerPosture: PromptArtifactProviderPostureV2;
}

export interface PromptArtifactProductionBindingV2 {
  readonly schemaVersion: "agent-production-prompt-binding.v2";
  readonly rendererId: string;
  readonly rendererVersion: number;
  readonly rendererHash: `sha256:${string}`;
  readonly renderedPromptHash: `sha256:${string}`;
  readonly providerOutputSchemaId: string;
  readonly providerOutputSchemaVersion: number;
  readonly handoffSchemaId: string;
  readonly handoffSchemaVersion: number;
  readonly scopeApplicabilityHash: `sha256:${string}`;
  readonly evaluatedContextRequirements: readonly PromptArtifactEvaluatedContextRequirement[];
  readonly resolvedPayloadAudits: readonly PromptArtifactResolvedPayloadAudit[];
  readonly exactRunBinding: PromptArtifactExactRunBindingV2;
  readonly providerPostureHash: `sha256:${string}`;
  readonly exactRunBindingHash: `sha256:${string}`;
}

export interface BuildPromptArtifactProductionBindingV2 {
  readonly schemaVersion: "agent-production-prompt-binding.v2";
  readonly rendererId: string;
  readonly rendererVersion: number;
  readonly rendererHash: `sha256:${string}`;
  readonly renderedPromptHash: `sha256:${string}`;
  readonly providerOutputSchemaId: string;
  readonly providerOutputSchemaVersion: number;
  readonly handoffSchemaId: string;
  readonly handoffSchemaVersion: number;
  readonly scopeApplicabilityHash: `sha256:${string}`;
  readonly evaluatedContextRequirements: readonly PromptArtifactEvaluatedContextRequirement[];
  readonly resolvedPayloadAudits: readonly PromptArtifactResolvedPayloadAudit[];
  readonly exactRun: CreatePromptArtifactExactRunBindingV2Input;
}

export type PromptArtifactProductionBinding =
  | PromptArtifactProductionBindingV1
  | PromptArtifactProductionBindingV2;
export type BuildPromptArtifactProductionBinding =
  | PromptArtifactProductionBindingV1
  | BuildPromptArtifactProductionBindingV2;
```

`BuildPromptArtifactInput.production` accepts only
`BuildPromptArtifactProductionBinding`, never the persisted v2 type. The v1
branch is the explicit compatibility shape for every current caller.
An unversioned production binding is invalid; the migration must add the v1
discriminator at every current direct construction instead of using an
optional `schemaVersion` or a parser default. V2 is the only exact-binding
shape and cannot be synthesized from v1.

The module also owns these data-only operations:

```ts
export interface CreatePromptArtifactExactRunBindingV2Input {
  readonly taskId: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
  readonly runId: string;
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workflowDescriptor: SpecialistWorkflowDescriptor;
  readonly policyVersion: string;
  readonly providerPosture: PromptArtifactProviderPostureV2;
}

export function createPromptArtifactExactRunBindingV2(
  input: CreatePromptArtifactExactRunBindingV2Input
): PromptArtifactExactRunBindingV2;
export function hashPromptArtifactProviderPostureV2(
  posture: PromptArtifactProviderPostureV2
): `sha256:${string}`;
export function hashPromptArtifactExactRunBindingV2(
  binding: PromptArtifactExactRunBindingV2
): `sha256:${string}`;
export function parsePromptArtifactAuditMetadata(
  value: unknown
): PromptArtifactAuditMetadata;
```

`createPromptArtifactExactRunBindingV2` normalizes the raw descriptor and
posture as plain own-data before computing `workflowDescriptorHash` with the
existing canonical agent hash. The build-only v2 production input contains the
raw exact-run input and no derived hash fields. `buildPromptArtifact` creates
both v2 hashes; `parsePromptArtifactEnvelope`,
`serializePromptArtifactEnvelope`, `promptArtifactAuditMetadata`, and
`parsePromptArtifactAuditMetadata` require the persisted v2 hashes and
recompute them. No caller, including Task140R0, supplies
`providerPostureHash` or `exactRunBindingHash`.

All v1/v2 parsers reject accessors, symbols, sparse or custom arrays,
non-plain prototypes, unknown fields, missing discriminators, duplicate or
non-lexically-sorted capability IDs, stale hashes, and secret-bearing
diagnostic material. The ontology contract may validate exact hash syntax and
required v2 fields but must not reimplement the agent hash algorithm; it
preserves the hashes emitted by the canonical artifact parser.

### Renderer Entry Points And Current Callers

`packages/agent/src/production-specialist-prompts.ts` keeps its current entry
point with its current input contract:

```ts
export function renderProductionSpecialistPrompt(
  input: RenderProductionSpecialistPromptInput
): PromptArtifactEnvelope;
```

It intentionally emits `PromptArtifactProductionBindingV1` and adds the v1
discriminator itself. It must not grow `attemptId`, `approvedRunId`,
workspace/mount, provider posture, optional exact fields, or defaulted v2
values. This preserves the existing specialist-runner path as an explicit
legacy compatibility path.

Add the strict v2-only entry point:

```ts
export interface RenderExactlyBoundProductionSpecialistPromptInput {
  readonly generatedAt: string;
  readonly scope: ProductionRunScope;
  readonly resolvedContextPacks: readonly VerifiedResolvedContextPack[];
  readonly exactRun: CreatePromptArtifactExactRunBindingV2Input;
}

export function renderExactlyBoundProductionSpecialistPrompt(
  input: RenderExactlyBoundProductionSpecialistPromptInput
): PromptArtifactEnvelope;
```

The exact entry derives task/run/type from `exactRun`, validates that the
workflow descriptor agrees with the registered specialist, calculates the
exact binding through the artifact owner, and emits v2. Its input has no
artifact, production-binding, verifier, hash, template-data, or authority
parameter. It must not accept omissions: applicability remains derived from
the registered context requirements.

The current `rg -n "\\brenderProductionSpecialistPrompt\\b" packages`
call-site census is frozen as follows:

- `packages/agent/src/specialist-runner-kernel.ts:219` remains a v1 caller.
- `packages/agent/test/production-specialist-prompts.test.ts` is the direct
  renderer/unit witness and gains the v2 cases.
- `packages/agent/test/evidence-triage-workflow.test.ts:849`,
  `packages/agent/test/prr-negotiation-workflow.test.ts:1723`, and
  `packages/agent/test/task-orchestrator-evidence-triage.test.ts:230` remain
  deterministic v1 caller witnesses.
- `packages/agent/test/evidence-triage-nous-live.test.ts:258`,
  `packages/agent/test/prr-negotiation-nous-live.test.ts:228`, and
  `packages/agent/test/task-orchestrator-evidence-triage-live.test.ts:235`
  remain unedited and unrun because provider/Nous work is closed.

No current caller is silently upgraded. Task140R0 is the first and only
planned v2 caller after private verification; it is not part of Task133 source
work.

### Exhaustive Task133 File Contract

The rejected five-file ceiling is retired. A future Task133 implementation may
modify only this source set, this test set, and its new implementation claim:

**Modify source**

- `packages/agent/src/prompt-artifacts.ts`
- `packages/agent/src/production-specialist-prompts.ts`
- `packages/agent/src/adapters/provider-byte-transfer.ts`
- `packages/agent/src/runtime.ts`
- `packages/agent/src/projection.ts`
- `packages/agent/src/projection-types.ts`
- `packages/ontology/src/contracts.ts`

**Modify tests**

- `packages/agent/test/prompt-artifacts.test.ts`
- `packages/agent/test/production-specialist-prompts.test.ts`
- `packages/agent/test/provider-byte-transfer-adapter.test.ts`
- `packages/agent/test/runtime.test.ts`
- `packages/agent/test/projection.test.ts`
- `packages/agent/test/specialist-runner-kernel.test.ts`
- `packages/agent/test/evidence-triage-workflow.test.ts`
- `packages/agent/test/prr-negotiation-workflow.test.ts`
- `packages/agent/test/task-orchestrator-evidence-triage.test.ts`
- `packages/ontology/test/agent-contracts.test.ts`
- `packages/workspace-ops/test/projection-rebuild.test.ts`

**Create**

- `docs/agentic/claims/task-133-resident-runtime-prompt-renderer.md`

`packages/agent/src/specialist-runner-kernel.ts`,
`packages/workspace-ops/src/projection-rebuild.ts`, the three closed live-test
files above, all factory files, every provider adapter other than
`provider-byte-transfer.ts`, all H files, and every store remain read-only
unless a future independent reviewer authorizes a new amendment. The workspace
rebuild source already delegates ledger validation to `validateKnowledgeEvent`;
its focused test must prove a v2 event survives that real rebuild path without
adding an agent-specific rebuild authority.

### Required Migration Tasks

> **For Task133 implementation workers:** the coordinator must explicitly
> approve and invoke `superpowers:subagent-driven-development` before source
> edits. Dispatch one fresh worker for each task below, require its claim and
> causal RED before code, and use a fresh defects-first reviewer between tasks.
> This approval is a prerequisite for implementation, not approval to run a
> provider, factory, H, store, or terminal path.

#### Task133.1: Canonical Artifact Union And Renderer Split

**Files:** modify only `packages/agent/src/prompt-artifacts.ts`,
`packages/agent/src/production-specialist-prompts.ts`,
`packages/agent/test/prompt-artifacts.test.ts`, and
`packages/agent/test/production-specialist-prompts.test.ts`.

1. Write causal REDs that require an explicit v1 discriminator, an exact v2
   artifact from `renderExactlyBoundProductionSpecialistPrompt`, computed
   posture/exact hashes, stable parse/serialize/audit round-trip, and rejection
   of every changed exact run/posture field and either derived hash. Cover a
   caller-supplied derived-hash property as an unknown build input, rather than
   accepting or correcting it.
2. Run:

   ```bash
   npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts
   ```

   Expected RED: the exact entry and discriminated parser are absent, and v2
   audit/hash expectations fail.
3. Implement the union, canonical audit parser, v1 legacy entry, and v2 exact
   entry. Each entry calls `renderCanonicalProductionPrompt` once and
   `buildPromptArtifact` once; v2 builds from raw exact input and never upgrades
   v1.
4. Rerun the same command. Expected GREEN: both explicit versions parse and
   v2 hashes recompute exactly.
5. Commit the four files with the Task133 implementation claim and stop for a
   fresh review that checks the one-renderer and no-caller-hash rules.

#### Task133.2: Durable Transfer, Runtime, And Projection Migration

**Files:** modify only
`packages/agent/src/adapters/provider-byte-transfer.ts`,
`packages/agent/src/runtime.ts`, `packages/agent/src/projection.ts`,
`packages/agent/src/projection-types.ts`, `packages/ontology/src/contracts.ts`,
and their four listed focused tests.

1. Write causal REDs with one v1 audit/event and one canonical v2 artifact
   audit. They must prove provider-audit parsing preserves the v2 discriminator,
   exact binding, and both hashes; the runtime requested-event payload retains
   the same fields; the ontology event contract accepts only strict v1/v2
   variants; and the agent projection reads back the unchanged v2 hashes.
   A runtime test may use the existing non-root proof fixture with an absent
   provider so the request event appends and is read back before provider
   lookup; it must assert that no adapter invocation occurs and it must not add
   a proof or capability mint API.
2. Run:

   ```bash
   npm test -- packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/ontology/test/agent-contracts.test.ts
   ```

   Expected RED: v2 audit fields are rejected, stripped, or absent on event
   and projection readback.
3. Replace the provider-local audit shape parser with the canonical
   data-only audit parser, map both discriminated variants explicitly in the
   runtime event payload and projection DTO, and mirror the strict union in the
   ontology event contract. Do not duplicate hash derivation in the provider,
   runtime, projection, or ontology package.
4. Rerun the same command. Expected GREEN: v1 compatibility remains explicit,
   v2 data and both hashes are byte-for-byte preserved, and no provider adapter
   invocation is recorded.
5. Commit the listed files and stop for a fresh review of strict union coverage,
   event provenance, and absence of a new authority path.

#### Task133.3: Legacy Caller And Rebuild Evidence

**Files:** modify only the five listed deterministic caller/rebuild tests.

1. Write causal REDs showing the existing kernel and workflow callers return
   v1 explicitly, while a validated v2 `agent.model-invocation.requested`
   event passes `validateKnowledgeEvent`, is replayed by
   `buildAgentProjection`, and is supplied through the real
   `rebuildProjection` builder without losing either hash. The rebuild fixture
   writes only its expendable projection artifact and performs no store, H,
   provider, or terminal action.
2. Run:

   ```bash
   npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/workspace-ops/test/projection-rebuild.test.ts
   ```

   Expected RED: the legacy output lacks its explicit v1 version or the v2
   projection/rebuild fixture cannot retain exact binding hashes.
3. Update only test fixtures and assertions required by the explicit union.
   Do not change `specialist-runner-kernel.ts` or `projection-rebuild.ts` to
   manufacture v2 data.
4. Rerun the same command. Expected GREEN: current callers remain v1 and the
   validated v2 event rebuilds faithfully.
5. Commit the tests and stop for a fresh review that checks caller migration
   was explicit and rebuildability did not become a second source of truth.

### Frozen Dispatch, Final Gate, And Review

Before dispatch, the coordinator must first integrate an independently
approved version of this amendment, then create a clean isolated Task133
worktree from a program head descending from these exact prerequisites:

- Task120 `49c3490a262162bd1d7146994390a2a6b5052394`
- Task126 `2e7a8a011ada9828f2978129ddc9f47719c33655`
- Task127 `93a93844a18343a3d49933a4bf9fb92190224aa5`
- Task128 `ba43f007c371229ca5ad96844f4b3bc08584702b`
- Task129 `d362d1a73f45b947bcd6e1c7915c9e7fd9f96d3a`
- Task130 `78f456263a9af1d010df494684ea2d0906134eb4`
- Task132A `7ec1eb6885716ac7324839c578677366fe1bb244`

The coordinator records every resolved SHA, the integrated amendment SHA, the
new program-base SHA, worker session IDs, the frozen file set, and the
subagent-driven-development approval in the new Task133 claim before edits.
Any missing ancestor, dirty base, divergent v1 fixture, or attempt to add a
defaulted v2 field blocks dispatch.

The final Task133 non-full gate is exactly:

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/ontology/test/agent-contracts.test.ts packages/workspace-ops/test/projection-rebuild.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

`npm run verify` remains closed. Do not run provider/network/credential/Nous
actions, reset credits, `neo`, implementation in this planning worktree,
self-review, self-integration, merge, or any live test. The fresh plan-review
range is `0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD`; the reviewer must
read that complete amendment lineage, and `HEAD` must be the clean child
documentation repair commit. A fresh independent Terra/xhigh reviewer must
return an approval before the coordinator alone integrates it. Rejection
requires another forward amendment; neither this branch nor a child
implementation branch may merge itself.

### Task140R0 V2-Only Composition Replacement

This subsection supersedes the preceding Task140R0 file contract and Steps
1–4 in full. It preserves Task140R0's original private-registration ownership,
all prerequisites, Step 5 fresh-review/coordinator-integration gate, and the six
live context checks. It adds no Task140 authorization.

**Files:**

- Modify: `packages/local-runtime/src/agent-runtime-factory.ts`
- Create: `packages/local-runtime/test/agent-runtime-composition.test.ts`
- Modify: `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`
- Create: `docs/agentic/claims/task-140-r0-r-owned-factory-port-registration.md`

The new composition test is the isolated production-factory integration
witness. The existing route test is the public/direct-input rejection witness.
The two agent tests in the focused command are read-only Task140P/dispatch
regression witnesses. No other source, test, or claim file is permitted.

**Prerequisites:** all original Task140P/R0 prerequisites plus reviewed and
coordinator-integrated Task133 implementation. Before edits, the coordinator
must explicitly approve and invoke `superpowers:subagent-driven-development`
and record that approval, every prerequisite full SHA, the clean base, and the
frozen file list in the new Task140R0 claim. The six private context checks and
captured provider-policy checks must exist before the exact renderer path.

- [ ] **Step 1: Create exhaustive causal Task140R0 REDs.**

  In `agent-runtime-composition.test.ts`, drive the real factory-created,
  Task140P-registered resolver. Add one valid captured control and table-driven
  counterfactuals that swap exactly one captured value at a time:
  `taskId`, `attemptId`, `approvedRunId`, `runId`, `runType`,
  `residentAgentId`, `workspaceId`, `mountInstanceId`, workflow descriptor,
  `policyVersion`; provider `providerId`, `modelId`, `capabilityIds`,
  `selectionPolicyVersion`, `readinessState`, `approvalRequirementId`; and
  context content hash, source high-water, selection manifest/proof, scope,
  policy version, and provenance. Each counterfactual must fail before renderer
  invocation.

  In `agent-task-orchestrator-routes.test.ts`, add separate real-route REDs for
  a legacy-v1 artifact, a direct/caller-supplied exact-v2 artifact, a
  caller-supplied production binding, injected `workflowDescriptorHash`,
  injected `providerPostureHash`, and injected `exactRunBindingHash`. Do not
  test an exported helper or add a test-only constructor. For every negative
  test, install counters/spies and
  assert zero renderer calls, provider readiness/adapter/network calls, ledger
  reads/writes/appends, runner dispatches, H prepare/bind/readback calls, store
  reads/writes, and terminal activity. The valid captured control must be the
  only case expected to reach one renderer call, and R0 itself still records
  zero later effects.

- [ ] **Step 2: Run the exact focused RED.**

  ```bash
  npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts
  ```

  Record causal failures for the absent private exact-v2 composition path and
  for every legacy/direct/injected/swapped case that is not yet rejected at the
  required zero-effect boundary. A missing test file is not acceptable RED
  evidence: create the suite before running this command.

- [ ] **Step 3: Implement private exact-v2 composition only.**

  After all private context and provider-policy comparisons succeed, construct
  exactly one `RenderExactlyBoundProductionSpecialistPromptInput` from captured
  task, attempt, approved-run, run, resident, workspace, mount, workflow,
  policy, and ready provider-posture facts. Call
  `renderExactlyBoundProductionSpecialistPrompt` exactly once, require an
  explicit v2 artifact, recompute and compare the provider-posture and exact-run
  hashes, and only then allow the existing private route to proceed. Reject all
  direct artifacts, caller bindings/hashes, and one-field swaps before that
  renderer call. Do not upgrade v1, render text locally, add a Task133 factory
  surface, mint a capability, invoke a provider, append a ledger event, dispatch
  a runner, or perform H, store, or terminal work.

- [ ] **Step 4: Run GREEN and the exact non-full gate.**

  ```bash
  npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts && npm run typecheck && git diff --check && npm run factory:check
  ```

  GREEN requires the valid captured control to call the canonical exact
  renderer exactly once and return an explicit v2 artifact whose exact binding
  and both recomputed hashes match the captured facts. Every legacy-v1,
  direct-v2, binding/hash injection, exact-run swap, provider-posture swap, and
  context swap must reject with every named effect counter at zero. The claim
  records each case and command result. `npm run verify`, provider/network/
  credential/Nous activity, reset credits, `neo`, H/store/terminal work,
  self-integration, and merge remain closed.
