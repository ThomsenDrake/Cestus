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
this discriminated output union. Every persisted output field shown is
required; v2 has no optional or defaulted exact-run, posture, or derived-hash
field. Its distinct build-input shape accepts only raw inputs and must reject
every persisted or lookalike output-hash field before builder acceptance.

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
  readonly providerOutputSchemaId: string;
  readonly providerOutputSchemaVersion: number;
  readonly handoffSchemaId: string;
  readonly handoffSchemaVersion: number;
  readonly evaluatedContextRequirements: readonly PromptArtifactEvaluatedContextRequirement[];
  readonly resolvedPayloadAudits: readonly PromptArtifactResolvedPayloadAudit[];
  readonly scope: ProductionRunScope;
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
shape and cannot be synthesized from v1. The v2 build shape deliberately
omits every persisted derived hash: `rendererHash`, `renderedPromptHash`,
`scopeApplicabilityHash`, `providerPostureHash`, and `exactRunBindingHash`.
The builder accepts raw `scope` and raw `exactRun` instead; it verifies the
named non-derived registration fields against the canonical registration and
derives the persisted hashes from that canonical registration, the canonical
scope/exact-run material, and the canonical rendered text. It must reject an
otherwise-valid v2 object with any omitted hash field or any unknown
hash-lookalike own property before constructing an envelope; it must never
normalize, silently correct, or overwrite caller hash material.

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
raw scope and raw exact-run input and no derived hash fields.
`buildPromptArtifact` is the artifact owner: it derives `renderedPromptHash`
from canonical rendered text, derives the canonical registration and scope
hashes, and creates both exact-run/posture hashes. No caller may supply one of
those values. `parsePromptArtifactEnvelope`,
`serializePromptArtifactEnvelope`, `promptArtifactAuditMetadata`, and
`parsePromptArtifactAuditMetadata` require the persisted v2 hashes and
recompute them. No caller, including Task140R0, supplies a v2 output hash.

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
   accepting or correcting it. Freeze and run named witnesses
   `rejectsV2BuildInputWithRenderedPromptHashBeforeBuilderAcceptance` and
   `rejectsV2BuildInputWithOutputHashLookalikeBeforeBuilderAcceptance`; each
   supplies an otherwise-valid v2 build object augmented with the prohibited
   own property, proves strict rejection before `buildPromptArtifact` accepts
   it, and proves no silent correction or envelope formation occurs.
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
and final-gate review range is exactly
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD`. The reviewer must inspect
every commit in that full lineage: `38c2456f1f935aca291d24447c31b6a1d0728fd1`,
`ffc2dc81c189af3163ec7b573b4f6f4767660de7`,
`d91f28a3f6434490246daaa97e399a905c902761` (the final pre-correction repair),
`6f399c4d52d97bd2cc74a4800d065ce4bcb878bf`, and this forward correction at
`HEAD`. A fresh independent Terra/xhigh reviewer must return an approval
before the coordinator alone integrates it. Rejection requires another forward
amendment; neither this branch nor a child implementation branch may merge
itself.

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

## CF-1R5 Task133 Raw-V2 And Task140R0 Data-Bridge Correction

**Status:** This is the sole current replacement for the earlier
`BuildPromptArtifactProductionBindingV2` build-input wording, Task133.1 Steps
1–4, and Task140R0's file contract, interfaces, Steps 1–4, and focused/final
commands. The strict discriminated v1/v2 output union, one canonical text
renderer, compatibility migration, transfer/runtime/ontology/projection/rebuild
preservation, Task140 prerequisites, zero-effect rejection matrix, Step 5 fresh
review, coordinator-only integration, and every closed activity remain in
force. Earlier contradictory text remains reviewable lineage, not executable
instruction.

### Raw-V2 Builder Replacement

`BuildPromptArtifactInput.text`, the raw scope below, the raw exact-run input,
the verified packs, and the existing canonical renderer material are the full
inputs from which the artifact owner derives every persisted v2 output hash.
Replace the prior raw-v2 build shape in full with:

```ts
export interface BuildPromptArtifactProductionBindingV2 {
  readonly schemaVersion: "agent-production-prompt-binding.v2";
  readonly rendererMaterial: ProductionSpecialistRendererMaterial;
  readonly evaluatedContextRequirements: readonly PromptArtifactEvaluatedContextRequirement[];
  readonly resolvedPayloadAudits: readonly PromptArtifactResolvedPayloadAudit[];
  readonly scope: ProductionRunScope;
  readonly exactRun: CreatePromptArtifactExactRunBindingV2Input;
}
```

`rendererMaterial` is the frozen plain-data result of
`productionSpecialistRendererMaterialFor(exactRun.runType)`, never a callback,
hash, artifact, or caller-defined renderer. `buildPromptArtifact` exact-key
parses that material and requires canonical equality before deriving the
persisted renderer ID/version, output/handoff contract IDs/versions, and
`rendererHash` through the existing canonical renderer-material hash. It
derives `renderedPromptHash` from `BuildPromptArtifactInput.text`,
`scopeApplicabilityHash` from raw `scope`, exact task/run type, canonical
requirements/omissions, and verified packs, and the posture/exact hashes from
raw `exactRun`. The v1 compatibility branch remains unchanged. No output hash
is accepted, corrected, overwritten, or used as raw input.

Task133.1 retains its four-file ceiling. Replace its RED/GREEN instructions
with these executable steps:

- [ ] **Step 1: Write the strict raw-v2 RED table.**

  In `packages/agent/test/prompt-artifacts.test.ts`, construct one otherwise
  valid raw v2 build input containing canonical `rendererMaterial`, raw
  `scope`, raw `exactRun`, verified packs, evaluated requirements/audits, and
  top-level canonical rendered `text`. Use one table-driven test with exactly
  these prohibited own keys:

  ```ts
  const prohibitedV2BuildHashKeys = [
    "rendererHash",
    "renderedPromptHash",
    "scopeApplicabilityHash",
    "providerPostureHash",
    "exactRunBindingHash",
    "postureHash"
  ] as const;
  ```

  The first five are persisted output keys; `postureHash` is the frozen
  hash-lookalike. For each key, add a valid SHA-256-looking value as an own data
  property and require strict unknown-key rejection from `buildPromptArtifact`.
  The test must receive no envelope and must not observe a normalized,
  corrected, or overwritten value. In
  `packages/agent/test/production-specialist-prompts.test.ts`, add the positive
  control proving the exact renderer passes canonical raw renderer material,
  raw scope, and raw exact-run data once and receives all five owner-derived
  persisted hashes.

- [ ] **Step 2: Run the exact Task133.1 RED.**

  ```bash
  npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts
  ```

  Expected RED: the raw-v2 schema/material derivation is absent or one of the
  six supplied hash/hash-lookalike keys is accepted or silently corrected.
  An "omitted output hash" is not a RED because output hashes do not belong to
  the raw build input.

- [ ] **Step 3: Implement owner-only hash derivation.**

  In `packages/agent/src/prompt-artifacts.ts`, strictly parse the replacement
  raw shape before envelope construction, validate canonical renderer material,
  and derive all five output hashes from the named raw inputs. Reuse one
  canonical renderer-material hash and one canonical scope-applicability hash;
  do not duplicate either algorithm. In
  `packages/agent/src/production-specialist-prompts.ts`, both v1 and exact-v2
  entries still call `renderCanonicalProductionPrompt` exactly once and
  `buildPromptArtifact` exactly once; only the exact-v2 entry supplies the raw
  renderer material/scope/exact-run shape. Do not accept a persisted v2 object,
  caller hash, default, local upgrade, or second renderer.

- [ ] **Step 4: Rerun the exact Task133.1 GREEN.**

  Rerun the Step 2 command. GREEN requires all six table rows to throw before
  envelope formation and the positive exact-renderer control to emit the five
  correctly derived hashes. Task133.1 then follows its existing claim, commit,
  fresh-review, and final non-full gate.

### Task140R0 Exact Context-Render Data Bridge

The live source census is binding: `checkpointContextOrBlock` owns
`claim.payload.attemptId` and normalized `tickedAt`, but the current
`TaskOrchestratorContextRenderInput` carries only task/run/scope/workflow/packs.
The agent-owned path may transport the missing attempt and timestamp as
non-authoritative required data. It may not transport provider approval,
workspace/mount authority, a binding, a verifier, a capability, a hash, or an
artifact.

Replace the two agent-owned interfaces with these exact required shapes:

```ts
export interface TaskOrchestratorContextRenderInput {
  readonly taskId: string;
  readonly attemptId: string;
  readonly generatedAt: string;
  readonly runType: TaskOrchestratorRunType;
  readonly scope: ProductionRunScope;
  readonly workflow: SpecialistWorkflowDescriptor;
  readonly resolvedContextPacks: readonly VerifiedResolvedContextPack[];
}

export interface AssembleTaskOrchestratorContextInput {
  readonly taskId: string;
  readonly attemptId: string;
  readonly generatedAt: string;
  readonly runType: TaskOrchestratorRunType;
  readonly scope: ProductionRunScope;
  readonly workflow: SpecialistWorkflowDescriptor;
  readonly contextRegistry: ContextPackRegistry;
  readonly renderPrompt?: (
    input: TaskOrchestratorContextRenderInput
  ) => unknown | Promise<unknown>;
}
```

`checkpointContextOrBlock` passes `attemptId: claim.payload.attemptId` and
`generatedAt: tickedAt`; `assembleTaskOrchestratorContext` forwards both
unchanged in its frozen render input. No fallback, generated default, public
setter, or parser upgrade is permitted.

The local factory closes the following private data-only capture into its
existing private prompt-renderer wrapper; this interface is lexical to
`agent-runtime-factory.ts` and is not exported:

```ts
interface FactoryExactPromptAuthorityV2 {
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly policyVersion: string;
  readonly approvedRunId: string;
  readonly runId: string;
  readonly providerPosture: PromptArtifactProviderPostureV2;
}
```

The captured Task132A mounted authority supplies workspace, mount, and policy;
the captured provider policy and selected descriptor supply provider/model/
capabilities/selection-policy/approval-requirement posture after their private
checks. Both `approvedRunId` and `runId` come from
`providerPolicy.approval.runId`, matching the live dispatch contract that uses
that value as `approvedRunId` and requires durable handoff `runId` equality.
The wrapper requires the render input workflow to be the captured canonical
descriptor and its verified packs to match the Task132A private binding set.
Only then may it construct:

```ts
const exactRenderInput: RenderExactlyBoundProductionSpecialistPromptInput = {
  generatedAt: renderInput.generatedAt,
  scope: renderInput.scope,
  resolvedContextPacks: renderInput.resolvedContextPacks,
  exactRun: {
    taskId: renderInput.taskId,
    attemptId: renderInput.attemptId,
    approvedRunId: captured.approvedRunId,
    runId: captured.runId,
    runType: renderInput.runType,
    residentAgentId: captured.residentAgentId,
    workspaceId: captured.workspaceId,
    mountInstanceId: captured.mountInstanceId,
    workflowDescriptor: renderInput.workflow,
    policyVersion: captured.policyVersion,
    providerPosture: captured.providerPosture
  }
};
```

This is the one executable bridge. Neither agent-owned interface is authority,
and no caller may supply `captured`, `exactRenderInput`, a v2 artifact, a
binding/hash, verified binding set, verifier, capability, registration, or mint
route.

**Task140R0 files:**

- Modify: `packages/agent/src/task-orchestrator-types.ts`
- Modify: `packages/agent/src/task-orchestrator-context.ts`
- Modify: `packages/agent/src/task-orchestrator.ts`
- Modify: `packages/agent/test/task-orchestrator-context.test.ts`
- Modify: `packages/agent/test/task-orchestrator-evidence-triage.test.ts`
- Modify fixture only: `packages/agent/test/prompt-artifacts.test.ts`
- Modify fixture only: `packages/agent/test/cockpit.test.ts`
- Modify: `packages/local-runtime/src/agent-runtime-factory.ts`
- Create: `packages/local-runtime/test/agent-runtime-composition.test.ts`
- Modify: `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`
- Create: `docs/agentic/claims/task-140-r0-r-owned-factory-port-registration.md`
- Read-only regression witnesses:
  `packages/agent/test/task-orchestrator-handoff-port.test.ts` and
  `packages/agent/test/task-orchestrator-dispatch.test.ts`

The direct assembly census contains thirteen calls in
`task-orchestrator-context.test.ts`, one in `prompt-artifacts.test.ts`, and one
in `cockpit.test.ts`; all receive explicit required attempt/time fixture data.
No optional/default field hides that migration. Task133 implementation and
Task140P are reviewed/coordinator-integrated before R0. R0 is the sole owner of
these bridge edits in its commit; Task140H and Task140R1 remain blocked until
R0 review/integration and therefore cannot concurrently edit
`task-orchestrator.ts`. The second `prompt-artifacts.test.ts` edit is likewise
serialized after reviewed Task133 integration and is fixture-only.

- [ ] **Step 1: Write the agent bridge REDs.**

  In `task-orchestrator-context.test.ts`, prove required `attemptId` and
  `generatedAt` are forwarded unchanged with raw scope and the same verified
  pack identities. Migrate every direct fixture explicitly. In
  `task-orchestrator-evidence-triage.test.ts`, capture the real registry render
  input and prove its `attemptId` equals the appended claim payload and its
  `generatedAt` equals that tick's normalized `now`. Update only the direct
  assembly fixtures in `prompt-artifacts.test.ts` and `cockpit.test.ts`; do not
  add authority or artifact behavior there.

- [ ] **Step 2: Write the private-wrapper and hostile-input REDs.**

  In the created composition test, prove the factory combines the agent-owned
  attempt/time/scope/packs only with its private captured authority to create
  the exact input above. Retain the valid v2 control and every prior one-field
  exact-run/posture/context swap. In the route test, retain legacy-v1,
  direct-v2, caller binding, and hash injection rejection, and add attempts to
  supply `approvedRunId`, workspace/mount/policy/provider posture, or the
  private capture object. Every hostile or swapped case rejects before
  renderer, provider, ledger, runner, H, store, or terminal activity.

- [ ] **Step 3: Run the exact expanded Task140R0 RED.**

  ```bash
  npm test -- packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/cockpit.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts
  ```

  Expected RED: the required attempt/time carrier is absent, the factory cannot
  construct the strict exact input, or a hostile/direct/swapped input reaches a
  named effect. A missing created composition test is not valid RED evidence.

- [ ] **Step 4: Implement only the required carrier and private wrapper.**

  Add the two required non-authoritative fields, forward the live claim/tick
  values, migrate every enumerated direct fixture, and construct the exact
  input only inside the factory closure after all captured checks. Invoke
  `renderExactlyBoundProductionSpecialistPrompt` exactly once for the valid
  control and require its v2 binding/hashes to match the captured facts. Do not
  add a public authority field, provider call, artifact input, local renderer,
  verifier callback, capability/mint route, H/store/terminal operation, or
  ledger append/read.

- [ ] **Step 5: Run GREEN and the exact expanded non-full gate.**

  ```bash
  npm test -- packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/cockpit.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts && npm run typecheck && git diff --check && npm run factory:check
  ```

  GREEN requires exact bridge provenance, one exact renderer call for the valid
  control, and every legacy/direct/injected/swapped/authority attempt to leave
  every named effect counter at zero. Commit only the listed modified/created
  files and the R0 claim, then stop for fresh complete-range review. Full
  verification, implementation in this planning worktree, provider/network/
  credential/Nous activity, reset credits, `neo`, self-integration, and merge
  remain closed.

### Corrected Review Gate

The fresh plan-review and eventual final-gate range remains exactly
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD`. The reviewer reads every
lineage commit through `8169fc7f344ce40b0bbd91e60a66dab697d4446d` and this
new clean child correction at `HEAD`. Only a fresh independent approval permits
coordinator integration; rejection requires another forward correction.

## CF-1R5 Task133 Post-Approval V2 Binding Lifecycle Correction

**Status:** This section is the sole current Task133/Task140 prompt-lifecycle
contract. It supersedes every instruction above that calls
`renderExactlyBoundProductionSpecialistPrompt`, forms v2 during context
assembly, adds `attemptId` or `generatedAt` to the context-render hook, captures
provider approval in the runtime factory before approval exists, or forbids a
canonical post-approval binding envelope. The already integrated `8169fc7f`
plan and the unintegrated `ceb255dd` pre-approval bridge remain reviewable
history, not implementation authority.

The live lifecycle fixes the ordering:

```text
context assembly
  -> render canonical v1 text exactly once
  -> append context-ready checkpoint with v1 artifact hash
  -> select provider and consume human approval bound to exact v1 artifact
  -> private Task140P/R0 post-approval admission
  -> bind that byte-identical approved v1 artifact into strict v2
  -> later H/provider execution may consume only the admitted v2 artifact
```

There is no second text render. V2 is a new immutable binding envelope over the
approved v1 artifact, not a rerender, mutation, local-only upgrade, or caller
artifact. Its provenance includes the exact approved v1 artifact hash.

### Task133 canonical post-approval binder

`packages/agent/src/prompt-artifacts.ts` keeps the explicit discriminated v1/v2
output union, but v2 adds this required field:

```ts
readonly sourceApprovedPromptArtifactHash: `sha256:${string}`;
```

Replace every earlier raw-v2 build shape with:

```ts
export interface BuildPromptArtifactProductionBindingV2 {
  readonly schemaVersion: "agent-production-prompt-binding.v2";
  readonly sourceApprovedPromptArtifact: PromptArtifactEnvelope;
  readonly scope: ProductionRunScope;
  readonly exactRun: CreatePromptArtifactExactRunBindingV2Input;
}

export interface BindApprovedProductionSpecialistPromptV2Input {
  readonly approvedPromptArtifact: PromptArtifactEnvelope;
  readonly generatedAt: string;
  readonly scope: ProductionRunScope;
  readonly resolvedContextPacks: readonly VerifiedResolvedContextPack[];
  readonly exactRun: CreatePromptArtifactExactRunBindingV2Input;
}

export function bindApprovedProductionSpecialistPromptV2(
  input: BindApprovedProductionSpecialistPromptV2Input
): PromptArtifactEnvelope;
```

The binder accepts only a canonical parsed v1 artifact. It requires the v1
template, renderer registration, output/handoff schemas, rendered-text hash,
scope applicability, context refs, evaluated requirements, resolved-payload
audits, omissions, and top-level input artifact hash to recompute exactly. It
requires current verified packs to match the v1 refs and audits. It preserves
`approvedPromptArtifact.text` byte-for-byte and calls no renderer. The artifact
owner derives `sourceApprovedPromptArtifactHash` from the parsed v1 envelope;
`rendererHash`, `renderedPromptHash`, `scopeApplicabilityHash`,
`providerPostureHash`, `exactRunBindingHash`, and `workflowDescriptorHash` from
canonical raw material; and every other persisted v2 field from the canonical
registration or verified packs. Neither the binder nor `buildPromptArtifact`
accepts one of those persisted values as raw v2 input.

Strict exact-key REDs are table-driven at their real nesting level:

```ts
const prohibitedV2ProductionKeys = [
  "sourceApprovedPromptArtifactHash",
  "rendererHash",
  "renderedPromptHash",
  "scopeApplicabilityHash",
  "providerPostureHash",
  "exactRunBindingHash"
] as const;
const prohibitedV2ExactRunKeys = ["workflowDescriptorHash"] as const;
const prohibitedV2ProviderPostureKeys = ["postureHash"] as const;
const prohibitedV2LookalikeKeys = [
  "approvedPromptHash",
  "renderHash",
  "workflowHash",
  "providerHash"
] as const;
```

Each row augments an otherwise valid raw object with one own data property and
must reject before normalization, envelope creation, approval read, provider
activity, or any other effect. The parsed v1 source artifact legitimately
contains its own v1 hashes; tests must distinguish that immutable approved
source from prohibited raw-v2 output fields.

`packages/agent/src/production-specialist-prompts.ts` retains only
`renderProductionSpecialistPrompt` for canonical v1 rendering and adds the
post-approval binder above. Delete/never add
`renderExactlyBoundProductionSpecialistPrompt`. Existing callers remain
explicit v1 callers. The binder does not accept prompt text separately, a
renderer callback, a persisted binding, an approval boolean, a verifier, a
capability, or factory authority.

### Consume-time approval and transfer binding

The approval proof continues to bind its exact v1 prompt artifact and hash.
Task133 extends the canonical approval/transfer assertion rather than changing
the human-approved bytes. When a later caller presents an admitted v2 artifact,
consume-time validation must prove all of the following in one normalized
snapshot:

- `v2.production.sourceApprovedPromptArtifactHash` equals the current proof's
  approved v1 artifact hash;
- v2 text is byte-identical to the proof's parsed v1 text and both recomputed
  rendered-text hashes match;
- v2 context refs/audits equal the proof, current preview, context-ready
  checkpoint, and current verified packs;
- v2 task, attempt, approved run, run, run type, provider/model/capabilities,
  selection policy, approval requirement, workflow, workspace, mount, and
  policy equal the consume-time facts; and
- approval, provider readiness, source hashes, locks, and preview are still
  current when the v2 artifact is consumed.

Direct v2, a v2 derived from a different v1 artifact, rerendered text, stale or
swapped approval, changed provider/run/context/workflow, and every hash or
lookalike injection reject before provider invocation, ledger append, runner
dispatch, H, store, or terminal activity. The proof parser never treats a v2
artifact as the source approval artifact. No boolean `approved` flag is
authority.

### Revised Task133 implementation ownership

The future Task133 implementation is serialized into these reviewed tasks. The
coordinator must explicitly approve and invoke
`superpowers:subagent-driven-development` for each implementation task.

#### Task133.1: v1 artifact and post-approval v2 binder

**Files:**

- Modify `packages/agent/src/prompt-artifacts.ts`
- Modify `packages/agent/src/production-specialist-prompts.ts`
- Modify `packages/agent/test/prompt-artifacts.test.ts`
- Modify `packages/agent/test/production-specialist-prompts.test.ts`
- Create `docs/agentic/claims/task-133-resident-runtime-prompt-renderer.md`

REDs require explicit v1, byte-identical v1-to-v2 binding, required source v1
hash, all owner-derived hashes, strict nesting-level prohibited-key tables,
hostile-object rejection, current-pack equality, immutable source/result, and
zero renderer calls during binding. The positive witness counts exactly one
canonical render for v1 and zero additional renders for v2.

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts
```

GREEN implements the minimum canonical binder and reruns the same command.

#### Task133.2: approval and provider-transfer derivation

**Files:**

- Modify `packages/agent/src/specialist-runner-kernel.ts`
- Modify `packages/agent/src/task-orchestrator-approval.ts`
- Modify `packages/agent/src/adapters/provider-byte-transfer.ts`
- Modify `packages/agent/test/specialist-runner-kernel.test.ts`
- Modify `packages/agent/test/task-orchestrator-approval.test.ts`
- Modify `packages/agent/test/provider-byte-transfer-adapter.test.ts`

REDs prove consume-time v1-proof-to-v2 derivation succeeds only for the exact
approved bytes and current run/provider/context facts. Table-driven stale,
swapped, direct-v2, different-source-v1, rerendered-text, and hash-injection
cases assert zero provider/ledger/runner/H/store/terminal effects.

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts
```

GREEN reuses canonical artifact parsers/hashes and current approval validation;
it adds no provider call, approval mint route, or duplicate parser.

#### Task133.3: durable event, projection, ontology, and rebuild migration

**Files:**

- Modify `packages/agent/src/runtime.ts`
- Modify `packages/agent/src/projection.ts`
- Modify `packages/agent/src/projection-types.ts`
- Modify `packages/ontology/src/contracts.ts`
- Modify `packages/agent/test/runtime.test.ts`
- Modify `packages/agent/test/projection.test.ts`
- Modify `packages/ontology/test/agent-contracts.test.ts`
- Modify `packages/workspace-ops/test/projection-rebuild.test.ts`

RED/GREEN proves strict v1 and v2 audit/event parsing, required source-approved
artifact hash, unchanged exact hashes through append/readback/projection, and
faithful rebuild from ledger events without making projection state truth.

```bash
npm test -- packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/ontology/test/agent-contracts.test.ts packages/workspace-ops/test/projection-rebuild.test.ts
```

#### Task133.4: deterministic legacy caller compatibility

**Files:** tests only:

- `packages/agent/test/evidence-triage-workflow.test.ts`
- `packages/agent/test/prr-negotiation-workflow.test.ts`
- `packages/agent/test/task-orchestrator-evidence-triage.test.ts`

The tests prove existing deterministic callers remain explicit v1 and that no
caller silently forms v2. Live Nous/provider tests remain untouched and unrun.

```bash
npm test -- packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts
```

The exact final Task133 non-full gate is:

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/ontology/test/agent-contracts.test.ts packages/workspace-ops/test/projection-rebuild.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

### Task140P post-approval private-port amendment

Task140P remains after reviewed/coordinator-integrated Task133 and all original
prerequisites. It owns the post-approval orchestration call and private port
contract; Task140R0 and H do not edit those files concurrently.

**Task140P files:**

- Create `packages/agent/src/task-orchestrator-handoff-port.ts`
- Modify `packages/agent/src/task-orchestrator.ts`
- Modify `packages/agent/test/task-orchestrator-handoff-port.test.ts`
- Modify `packages/agent/test/task-orchestrator-dispatch.test.ts`
- Modify `packages/agent/test/task-orchestrator-approval.test.ts`
- Create the existing Task140P claim

The port exposes no public resolver constructor. Its factory-registered private
resolver receives one normalized data-only input assembled inside
`dispatchApprovedRunner` after `approvalReader.inspect` reports the exact proof
approved:

```ts
interface ResolveApprovedPromptBindingForDispatchInput {
  readonly taskId: string;
  readonly attemptId: string;
  readonly runType: TaskOrchestratorRunType;
  readonly generatedAt: string;
  readonly scope: ProductionRunScope;
  readonly approvalProof: TaskOrchestratorProviderApprovalProof;
  readonly providerPosture: PromptArtifactProviderPostureV2;
}
```

The port never receives the provider registry, selection service, callback,
or whole `TaskOrchestratorProviderPolicy`; those remain in the orchestrator and
factory closures. `dispatchApprovedRunner` exact-key normalizes and freezes the
proof/posture data snapshot before the port `await`. The structural input is
not authority. The private resolver registration,
consume-time proof readback, factory-held context/workspace checks, and exact
result membership are authority. Task140P normalizes before `await`, invokes
the port before `appendRunnerDispatchingCheckpoint`, and rejects a missing,
foreign, duplicate, stale, or lookalike resolver before provider/ledger/runner/
H/store/terminal effects. It does not build v2 itself and does not expose the
resolved artifact in a public result.

Task140P RED/GREEN and final command add causal witnesses that context rendering
still emits v1 exactly once, approval precedes the port call, and runner
dispatch cannot occur until the private port returns one admitted v2 artifact.
Its existing non-full gate remains, with the three listed test files.

### Task140R0 factory-private post-approval resolver

This replaces all pre-approval Task140R0 renderer/bridge instructions.

**Files:**

- Modify `packages/local-runtime/src/agent-runtime-factory.ts`
- Create `packages/local-runtime/test/agent-runtime-composition.test.ts`
- Modify `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`
- Create `docs/agentic/claims/task-140-r0-r-owned-factory-port-registration.md`
- Read-only regression witnesses:
  `packages/agent/test/task-orchestrator-handoff-port.test.ts` and
  `packages/agent/test/task-orchestrator-dispatch.test.ts`

The factory registers one lexical resolver into the Task140P private port. On
each post-approval call it normalizes the data input once, reconsumes the exact
provider approval against the ledger/current preview, selects and verifies the
current provider descriptor/readiness, reruns all six live context checks,
re-resolves current verified packs from the approved v1 refs, verifies current
workspace/mount/identity/policy/source-high-water/locks, derives the canonical
workflow descriptor, and calls `bindApprovedProductionSpecialistPromptV2`
exactly once. It compares the returned source-v1, exact-run, posture, workflow,
scope, context, and derived hashes before marking that exact object admitted in
the private port's `WeakSet`/`WeakMap`.

The valid control observes one v1 render earlier, zero renders in R0, one binder
call, and zero later effects. Counterfactuals cover each task/attempt/run/type,
provider/posture, source-v1/text, context/workflow/scope, workspace/mount/
identity/policy/high-water/lock, approval, and prohibited hash field. Direct or
caller-built v2 and resolver lookalikes fail before binder or later effects.

```bash
npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

Task140H may consume only the exact private-port-admitted v2 artifact. It may
not rerender, rebind, accept a caller artifact, weaken approval, or infer
completion from preparation.

### Frozen lifecycle review gate

Before Task133 source dispatch, the coordinator must integrate an independently
approved version of this correction and record a clean program base descending
from the previously frozen Task120, Task126, Task127, Task128, Task129, Task130,
Task132A, Task134A, compiler repair, and Task135A integration SHAs. The claim
records exact full SHAs, every serialized file owner, and explicit approval to
use `superpowers:subagent-driven-development`.

The plan review range is exactly
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD`, including every rejected
intermediate amendment and this correction. A fresh independent Terra/xhigh
reviewer must return unqualified **APPROVED** before coordinator-only plan
integration or source dispatch. `npm run verify`, provider/network/credential/
Nous activity, reset credits, `neo`, source implementation in this worktree,
self-review, self-integration, and merge remain closed.

## CF-1R5 Durable Approval Artifact And Admission-Token Correction

**Status:** This section supersedes the preceding lifecycle correction only
where that correction omitted the pre-approval v1 owner, durable prompt
artifact readback, or the v2 consumer channel. Its post-approval v1-to-v2
binder, strict hash rules, Task133.1-.4 ownership, and safety gates remain
current. No source task is authorized until this combined contract receives a
fresh full-lineage approval.

### Task133.5: executable pre-approval v1 and durable mounted store

Task133.5 starts only after reviewed/coordinator-integrated Task133.1-.4. It is
serialized before Task140P/R0/H and is the sole owner of the live v1 context
render path.

**Files:**

- Modify `packages/agent/src/task-orchestrator-types.ts`
- Modify `packages/agent/src/task-orchestrator-context.ts`
- Modify `packages/agent/src/task-orchestrator.ts`
- Modify `packages/agent/test/task-orchestrator-context.test.ts`
- Modify `packages/agent/test/task-orchestrator-evidence-triage.test.ts`
- Modify `packages/local-runtime/src/agent-prompt-artifacts.ts`
- Modify `packages/local-runtime/src/agent-runtime-factory.ts`
- Modify `packages/local-runtime/test/agent-prompt-artifacts.test.ts`
- Create `packages/local-runtime/test/agent-runtime-preapproval-prompt.test.ts`
- Create `docs/agentic/claims/task-133-5-preapproval-prompt-store.md`

The agent-owned context render input gains required non-authoritative
`attemptId` and `generatedAt`. `checkpointContextOrBlock` supplies the exact
claim attempt and normalized tick time; direct fixtures migrate explicitly
with no optional/default fields. The local factory's renderer registry uses:

```ts
renderProductionSpecialistPrompt({
  taskId: input.taskId,
  runId: input.attemptId,
  runType: input.runType,
  generatedAt: input.generatedAt,
  scope: input.scope,
  resolvedContextPacks: input.resolvedContextPacks
});
```

For this v1 approval draft, `runId` deliberately equals the durable attempt ID;
it is not the later approved provider run. The v2 exact binding records the
later `approvedRunId`/`runId` without changing the approved text. No provider
or approval fact enters context rendering.

`agent-prompt-artifacts.ts` replaces its write-only private helper and
in-memory-only resolver for resident orchestration with one captured mounted
store:

```ts
export interface MountedPromptArtifactEnvelopeStore {
  put(envelope: PromptArtifactEnvelope): PromptArtifactEnvelopeReadback;
  read(inputArtifactHash: `sha256:${string}`): PromptArtifactEnvelope;
}
```

The store writes canonical serialized envelope bytes under the mounted
workspace blob root, uses create-only semantics, and on duplicate requires
byte-identical canonical content. `read` parses the bytes, recomputes the
artifact hash, and requires the requested hash. Resident orchestration has no
internal-disk fallback when a portable workspace is configured or becomes
unavailable. This is prompt-envelope persistence only, not H material/manifest
storage.

The factory renders v1, stores it, reads it back, and returns only that exact
readback to the orchestrator. `appendContextReadyCheckpoint` appends its hash
only after readback succeeds. On restart a fresh runtime can read the identical
v1 envelope by the checkpoint/proof hash; no rerender is allowed. REDs cover
missing attempt/time, swapped mutable input after await, failed/partial store,
EEXIST byte mismatch, corrupt/hash-mismatched readback, portable-drive
disconnect, restart readback, and zero checkpoint/approval/provider activity
until exact readback.

```bash
npm test -- packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/agent-runtime-preapproval-prompt.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

The valid control observes exactly one text render, one create-or-verify put,
one exact readback, and then one context-ready checkpoint. Commit only the
listed files/claim and stop for fresh review.

### Task140P opaque prompt-admission token

The Task140P post-approval port returns an opaque in-process admission token,
not the v2 envelope and not a public result:

```ts
export interface TaskOrchestratorPromptAdmission {
  readonly schemaVersion: "agent-task-orchestrator.prompt-admission.v1";
  readonly taskId: string;
  readonly attemptId: string;
  readonly runType: TaskOrchestratorRunType;
  readonly promptArtifactHash: `sha256:${string}`;
}
```

The fields are diagnostics, not authority. Object identity membership in the
port's private `WeakMap`, created only after its registered resolver returns a
durably read-back v2 artifact, is authority. There is no public token builder,
parser-to-authority conversion, serializer, or registration constructor.

Task140P adds required `promptAdmission` to the internal
`TaskOrchestratorRunnerDispatchInput`. `dispatchApprovedRunner` resolves the
token after approval and before `appendRunnerDispatchingCheckpoint`, then
passes that exact object to `dispatchVerifiedTaskRunner`. The latter rejects a
foreign/structural/stale/swapped token before registry dispatch. Public route
DTOs and task-orchestrator results never expose the token or v2 text.

Task140P's existing files/gate remain current, but its RED/GREEN matrix adds
missing, forged, copied, wrong-task/attempt/type/hash, reused, and post-await
swapped tokens with zero checkpoint/provider/runner/H/store/terminal effects.
Only one valid identity token may reach one private runner-registry dispatch.

### Task140R0 durable v2 registration and restart recovery

R0 uses the mounted prompt store from Task133.5. It reads the checkpoint/proof
v1 by hash, compares its canonical bytes to the proof's parsed v1 envelope,
reconsumes current approval, reruns all factory/context/provider/workspace
checks, binds v2 once, persists v2 create-only, reads it back, and only then
mints the Task140P admission token whose private mapping contains the exact v2
hash and object. The v2 envelope itself is not stored in ledger events or
returned publicly.

After process restart no token is trusted or restored. A new runtime reads the
durable v1/checkpoint/approval facts, repeats all live checks, deterministically
rebinds or byte-verifies the same v2 store object, and mints a new in-process
token. Drive disconnect, source high-water change, stale approval, v1/v2 byte
mismatch, or any lock/provider/context change blocks reminting.

R0's files add `packages/local-runtime/src/agent-prompt-artifacts.ts` and
`packages/local-runtime/test/agent-prompt-artifacts.test.ts` only if Task133.5
needs no source change but R0 needs a focused durable v2 witness; otherwise
they remain read-only imports. The R0 claim freezes that decision before RED.
Its exact final gate includes the prompt-artifact test plus the existing
composition, route, port, and dispatch tests.

### Task140H admission consumption and actual invocation path

This subsection supersedes Task140H's instruction to consume an undefined
resolved object. H receives only the exact Task140P admission token through the
private runner-registry call. The factory-created runner closure consumes that
token once through the same private port, reads the mapped v2 envelope from the
mounted store, reparses/recomputes it, and requires task/attempt/type/hash
equality before any invocation proof, provider call, H operation, or terminal
append.

Task140H expands its serialized file set with:

- Modify `packages/agent/src/production-specialist-invocation-proof.ts`
- Modify `packages/agent/test/production-specialist-invocation-proof.test.ts`
- Modify `packages/local-runtime/src/agent-runtime-factory.ts`
- Modify `packages/local-runtime/test/agent-runtime-composition.test.ts`
- Modify `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`

alongside its already listed orchestrator/runtime/H files and tests. The
production-specialist invocation proof may be minted only from successful
single-use port consumption plus exact mounted v2 readback; the older separate
identity proof alone is insufficient. The proof binds admission identity,
v2 hash, source approved-v1 hash, task, attempt, approved run, run type,
provider posture, and context hashes. Runtime/provider execution consumes that
proof and the same v2 envelope. It does not render, bind, accept caller text,
or resolve by an unadmitted hash.

REDs prove a structural/copied/reused admission, arbitrary v2 hash, separately
minted legacy identity proof, swapped mounted readback, and restart-stale token
all reject before provider/ledger/runner/H/store-write/terminal effects. The
valid vertical is exactly:

```text
approved durable v1 -> private R0 checks -> durable v2 readback
-> opaque admission token -> private runner consumption
-> v2-bound invocation proof -> existing provider/H sequence
```

Task140H's exact non-full gate is its existing focused suite plus
`packages/agent/test/production-specialist-invocation-proof.test.ts`,
`packages/local-runtime/test/agent-runtime-composition.test.ts`, and
`packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`, followed
by typecheck, diff check, and factory readiness. Full verification and live
provider execution remain closed until the later acceptance wave explicitly
opens them.

### Corrected durable-lifecycle review gate

The complete review range remains
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD`. A fresh reviewer must trace
the concrete v1 render/store/checkpoint/restart path, post-approval v2
bind/store/remint path, admission-token dispatch/consumption path, and final
invocation-proof/provider/H path against live source. Approval must explicitly
confirm that every produced artifact or token has a durable or intentionally
ephemeral owner and one serialized consumer. No source dispatch, plan merge,
full verifier, provider/network/credential/Nous activity, reset credit, `neo`,
self-review, or self-integration is authorized before that approval.

## CF-1R6 Durable Binding Receipt, Recovery State, And Invocation Ownership Correction

**Status:** This section is the sole current correction for Task133.3,
Task133.5, Task140P, Task140R0, and Task140H. It preserves the approved
post-approval v1-to-v2 binder and strict hash derivation above, but supersedes
every earlier instruction that (a) treats a stored v2 hash as discoverable
without a ledger receipt, (b) mints a token before durable binding-receipt
readback, (c) returns immediately whenever `runner-dispatching` already exists,
or (d) lets `invokeSpecialistModel` mint production invocation authority from a
prepared specialist run alone. No source task is authorized until a fresh
full-lineage review approves the combined contract.

### One durable and replayable authority chain

The only executable order is:

```text
durable v1 readback
  -> consume exact approval event bound to v1
  -> derive v2 generatedAt from that durable approval event occurredAt
  -> bind v2 without rerendering
  -> mounted v2 create-or-verify put and exact readback
  -> append and read back hash-only prompt-bound receipt
  -> mint ephemeral prompt-admission token
  -> append or read exact runner-dispatching checkpoint
  -> consume token once in the factory runner closure
  -> mint v2-bound production invocation proof
  -> append deterministic model-invocation request before provider/H effect
```

The approval event timestamp is the sole source of v2 `generatedAt`; wall-clock
time, restart time, caller time, and token time are forbidden. Therefore a
crash after v2 put but before receipt append can recreate byte-identical v2 from
the same durable approval event and verify the existing content-addressed file.
The token remains intentionally ephemeral and is never serialized.

### Task133.3 prompt-binding receipt migration

Task133.3 extends its already serialized event/ontology/projection/rebuild work
with one strict `prompt-bound` orchestration checkpoint. Add `"prompt-bound"`
to the checkpoint-kind contract and add this required nested payload only for
that kind:

```ts
interface TaskOrchestratorPromptBindingReceiptV1 {
  readonly schemaVersion: "agent-task-orchestrator.prompt-binding-receipt.v1";
  readonly sourceApprovedPromptArtifactHash: `sha256:${string}`;
  readonly boundPromptArtifactHash: `sha256:${string}`;
  readonly generatedAt: string;
  readonly approvalEventId: string;
  readonly providerPostureHash: `sha256:${string}`;
  readonly exactRunBindingHash: `sha256:${string}`;
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly receiptHash: `sha256:${string}`;
}
```

The checkpoint also requires exact `runId`, tool request, approval requirement,
provider posture, context bindings, source event IDs, input artifact hashes,
`promptArtifactHash`, and lock snapshot. `promptArtifactHash` must equal
`boundPromptArtifactHash`; `sourceEventIds` must include the approval event;
`generatedAt` must equal that event's durable `context.occurredAt`; all receipt
fields and `receiptHash` are owner-derived and recomputed on append/readback.
No path, prompt bytes, token, capability, proof, credential, or provider output
is stored. Projection and rebuild preserve the exact hash-only receipt but do
not make it authority.

Task133.3's file set additionally owns the strict checkpoint subtype in
`packages/agent/src/task-orchestrator-types.ts`, its projector in
`packages/agent/src/task-orchestrator-projection.ts`, and focused coverage in
`packages/agent/test/task-orchestrator-events.test.ts` and
`packages/agent/test/task-orchestrator-projection.test.ts`. Its exact command is:

```bash
npm test -- packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/task-orchestrator-events.test.ts packages/agent/test/task-orchestrator-projection.test.ts packages/ontology/test/agent-contracts.test.ts packages/workspace-ops/test/projection-rebuild.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

### Task133.5 mounted prompt store authority

Task133.5 replaces the pathname-only store wording above with a captured
factory store whose operations are asynchronous:

```ts
interface MountedPromptArtifactEnvelopeStore {
  put(envelope: PromptArtifactEnvelope): Promise<PromptArtifactEnvelopeReadback>;
  read(inputArtifactHash: `sha256:${string}`): Promise<PromptArtifactEnvelopeReadback>;
}
```

Create `packages/local-runtime/src/mounted-prompt-artifact-store.ts` and
`packages/local-runtime/test/mounted-prompt-artifact-store.test.ts`; do not add
prompt-envelope authority to the Task135A preparation binder. The factory
captures the portable configuration root, expected workspace ID, and initial
mounted tuple (`workspaceId`, resolved `rootDir`, and `paths.blobRoot`).
Immediately before and after every `put` and `read`, it calls the existing
`mountPortableWorkspace` with that captured root and expected ID, exact-key
normalizes the result, and requires the returned tuple to equal the captured
tuple. The operation uses the freshly returned `blobRoot`, never the startup
handle path. Mount failure, disconnect, root/identity/path replacement, or any
pre/post tuple change rejects and returns no artifact.

The production resident prompt store is portable-only: the factory refuses to
construct it without a verified portable mount. Remove resident use of the
in-memory resolver and `cwd/.cestus/local/prompt-artifacts` fallback; there is
no internal fallback before, during, or after an outage. `put` canonicalizes
once, writes create-only, and on `EEXIST` requires exact canonical-byte
equality. `read` parses, recomputes `inputArtifactHash`, requires the requested
hash, and requires reserialized canonical bytes to equal stored bytes before
the post-I/O mount check. `FileBlobStore` is not the public lookup contract
because its blob hash is not the envelope's `inputArtifactHash`. Tests mutate
each captured mount tuple field before I/O and between I/O and post-check, with
separate original/replacement I/O counters. Corrupt readback, restart readback,
and zero checkpoint/approval/provider/H/terminal effects remain required.
Replace the earlier Task133.5 gate with:

```bash
npm test -- packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/agent-runtime-preapproval-prompt.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

### Task140P two-phase private admission and recovery transition

The private port has two opaque object-identity stages. `prepare` invokes the
registered Task140R0 resolver and returns a `PreparedPromptBinding` whose
diagnostic fields are copied into the proposed receipt; its private `WeakMap`
holds the exact durable v2 readback. The orchestrator appends or reads the
strict `prompt-bound` checkpoint, reads it back from the ledger, and calls
`admit(prepared, receiptReadback)`. Only exact private membership plus exact
receipt-event readback mints `TaskOrchestratorPromptAdmission`. Structural
objects, copied diagnostics, direct v2, or a receipt-shaped object are not
authority.

`dispatchApprovedRunner` then appends or reads the deterministic
`runner-dispatching` checkpoint. That checkpoint must include the prompt-bound
checkpoint event ID, receipt hash, bound v2 hash, and deterministic
`invocationId`; these are hash-only recovery facts. An existing exact
`runner-dispatching` checkpoint is a recovery branch, not an unconditional
return. Recovery reacquires the claim, reruns approval/provider/context/
workspace/lock checks, repeats `prepare -> receipt readback -> admit`, and may
dispatch only under the state matrix below.

Task140P additionally owns
`packages/agent/test/task-orchestrator-recovery.test.ts` for this transition.
RED/GREEN covers crashes before v2 put, after put/before receipt, after receipt/
before admission, after admission/before dispatch checkpoint, and after the
dispatch checkpoint/before token consumption. Every pre-invocation crash
recovers with a fresh token and the same receipt/invocation ID; no token is
restored or structurally reconstructed.

### Task140R0 exact receipt preparation and restart lookup

Task140R0 must never locate v2 from memory or recompute it from restart time.
It reads the durable v1 and approval event, uses the approval event's exact
`occurredAt`, binds v2, performs mounted create-or-verify and exact readback,
and returns the port-private prepared object. If a `prompt-bound` receipt
already exists, R0 reads v2 by `boundPromptArtifactHash` and requires byte-
identical parser/hash/timestamp/source-v1/provider/run/context/workspace/mount
equality before creating a new prepared object. Missing or divergent receipt,
artifact, timestamp, approval, or mounted authority blocks before token mint.
R0 never appends the receipt itself and never exposes v2 through a route DTO.

R0's focused suite adds restart byte-equality cases for crash-after-put and
crash-after-receipt, plus a lookup test proving a fresh factory has no in-memory
resolver state. Its exact command is:

```bash
npm test -- packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

### Task140H sole invocation owner and no-duplicate state matrix

This subsection replaces the entire earlier Task140H Step 1 through Step 5,
including its files and gate. Task140H owns all of these files serially:

- Modify `packages/agent/src/task-orchestrator-handoff-port.ts`
- Modify `packages/agent/src/task-orchestrator.ts`
- Modify `packages/agent/src/runtime.ts`
- Modify `packages/agent/src/runtime-types.ts`
- Modify `packages/agent/src/specialist-runner-kernel.ts`
- Modify `packages/agent/src/production-specialist-invocation-proof.ts`
- Modify `packages/agent/test/task-orchestrator-handoff-port.test.ts`
- Modify `packages/agent/test/task-orchestrator-dispatch.test.ts`
- Modify `packages/agent/test/task-orchestrator-recovery.test.ts`
- Modify `packages/agent/test/task-orchestrator-evidence-triage.test.ts`
- Modify `packages/agent/test/task-orchestrator-evidence-triage-live.test.ts`
- Modify `packages/agent/test/specialist-runner-kernel.test.ts`
- Create `packages/agent/test/production-specialist-invocation-proof.test.ts`
- Modify `packages/agent/test/runtime.test.ts`
- Modify `packages/local-runtime/src/agent-runtime-factory.ts`
- Modify `packages/local-runtime/test/agent-runtime-composition.test.ts`
- Modify `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`
- Create the Task140H claim

`packages/agent/test/task-orchestrator-evidence-triage-live.test.ts` is a
compile-only signature-migration file in Task140H. It must not be selected by a
Task140H non-live command. Its real Nous execution remains reserved for the
later coordinator-authorized live provider acceptance gate with the exact live
environment switch stated there.

The port consumes the exact admission once and returns a second opaque
`ConsumedPromptAdmission` whose private binding contains the reparsed mounted
v2 readback. `production-specialist-invocation-proof.ts` removes the public
`mintProductionSpecialistInvocationProof` export and Task140H owns
`ProductionSpecialistInvocationProof`, the private `InvocationBinding` and
`bindings`, the sole mint path, and `consumeProductionSpecialistInvocationProof`.
The sole mint path accepts the exact privately registered consumed-admission
object and binds admission identity, receipt hash, v2/source-v1 hashes, task,
attempt, approved run, invocation ID, run type, provider posture, context
hashes, credential/provider identity, and the same parsed v2 envelope object.

`specialist-runner-kernel.ts` no longer mints a proof from
`PreparedSpecialistRun`; `invokeSpecialistModel` can reach runtime invocation
only with the H-owned v2-bound proof and exact mounted v2 envelope supplied by
the factory runner closure. Direct calls, legacy prepared runs, separate
identity proofs, copied/reused tokens, arbitrary hashes, or v1 artifacts fail
before model-request append, provider adapter, H store, handoff, or terminal
effects.

The deterministic invocation stream governs recovery:

- no `agent.model-invocation.requested`: a fresh admitted token may be consumed
  and the same deterministic invocation may start;
- `requested` without `completed` or `failed`: append/read one causally linked
  `agent.task.orchestration.failed` event with category
  `external-effect-failed`, a secret-safe provider-outcome-unknown message,
  `retryable: false`, and the request event in `relatedEventIds`; never call the
  provider or H automatically, and never infer provider failure or success;
- terminal `agent.model-invocation.failed`: no automatic replay; only a new
  explicit retry generation with a fresh approval can invoke;
- `completed`: never call the provider again; resume only from exact durable
  derivative/handoff readback under existing content-addressed idempotency, or
  block if that readback is absent;
- durable handoff or terminal orchestration already present: return the exact
  durable result without runner/provider/H replay.

Crash tests cover before and after admission consumption, model-request
append, provider call, model completion append, H material put, manifest put,
handoff readback, and terminal append. A crash after model-request append is
intentionally recorded as an unknown external outcome rather than guessed or
retried. Repeated recovery reads the same orchestration failure and appends no
duplicate. Every branch asserts at most one provider invocation and at most one
durable H/terminal effect.

Task140H's exact non-full gate is:

```bash
npm test -- packages/agent/test/production-specialist-invocation-proof.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/runtime.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

### Integrated final Task133.1-.5 non-live gate

This command replaces the earlier exact final Task133 command at lines
2096-2100. It aggregates the binder, approval/transfer, event/projection/
ontology/rebuild, deterministic compatibility, executable preapproval v1, and
portable mounted-store suites. No live/provider-bearing test is selected:

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/task-orchestrator-events.test.ts packages/agent/test/task-orchestrator-projection.test.ts packages/ontology/test/agent-contracts.test.ts packages/workspace-ops/test/projection-rebuild.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-context.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/agent-runtime-preapproval-prompt.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

### CF-1R6 review and dispatch gate

The fresh defects-first plan review range remains exactly
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD`. Review must trace each
crash boundary and prove that v1/v2 bytes have durable content-addressed owners,
the v2 receipt has one append/readback owner, ephemeral objects have one private
consumer, `specialist-runner-kernel.ts` has no legacy proof mint bypass, and an
unknown provider outcome never causes automatic replay. Only unqualified fresh
Terra/xhigh approval permits coordinator-only plan integration. After that,
each serialized implementation task still requires a coordinator message that
specifically approves use of `superpowers:subagent-driven-development`.
Implementation, full verification, provider/network/credential/Nous activity,
reset credits, `neo`, self-review, self-integration, and merge remain closed
until their later durable gates explicitly open them.

## CF-1R7 H-Private Model Invocation Command Correction

**Status:** This section supersedes CF-1R6 Task140H only where the public
runtime command still carries prompt bytes or proof authority. The durable
v1/v2 store, receipt, admission-token, proof-binding, crash-recovery, and
no-duplicate contracts remain current. Task133/Task140 source stays frozen
pending a new full-lineage approval.

### Data-only public command and private identity binding

`packages/agent/src/runtime.ts` keeps a package-exported invocation command only
as strict secret-safe data:

```ts
export interface InvokeAgentModelInput {
  readonly invocationId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly modelFamily: string;
  readonly inputArtifactHash: string;
  readonly credentialRef: CredentialReference;
  readonly safetyClass?:
    | "workspace-safe"
    | "public-safe"
    | "sensitive-local-only"
    | "provider-approved";
  readonly returnOutputText?: boolean;
}
```

Delete `promptArtifact` and `productionInvocationProof` from that interface.
`runtime.invokeModel` exact-key validates own enumerable data descriptors and
freezes the **same command object in place** before any `await`; it must not
clone or reconstruct the object because object identity is the private
admission binding. Caller-supplied `promptArtifact`, `productionInvocationProof`, token,
admission, v2 binding, text, callback, resolver, or lookalike key rejects before
ledger read/append, provider lookup/invocation, artifact I/O, H, or terminal
activity. The public command and every route/result DTO contain IDs and hashes
only.

Create `packages/agent/src/production-model-invocation-admission.ts`. It is
intentionally **not** re-exported by `packages/agent/src/index.ts`. It owns a
module-private `WeakMap<InvokeAgentModelInput, HiddenProductionInvocation>`.
The module exports no authority through `packages/agent/src/index.ts`; the
production factory imports its package-internal bridge by explicit source-module
path, matching existing `local-runtime` composition practice. Only that
Task140H factory bridge can call the module-private constructor with the exact
private `ConsumedPromptAdmission`; construction uses the H-owned private
consumed-admission accessor, reparses the mounted v2,
creates the v2-bound production invocation proof, freezes one data-only command
object, and maps that exact object identity to the v2 envelope and proof.
Copying or reconstructing the command loses membership. The hidden mapping is
single-use and never serialized, projected, returned, logged, or placed in a
route DTO.

`runtime.invokeModel` imports only internal lookup-and-claim functions. Before
its first `await`, it freezes the exact command and performs a non-consuming
identity lookup. For a production specialist run it requires exact command
identity membership,
reparses and recomputes the hidden v2 envelope and all source-v1/run/provider/
context/receipt hashes, and verifies command equality. It then atomically
claims/deletes the same mapping and consumes the production proof exactly
once, with no `await` between final validation, claim, and proof consumption.
V2 validation occurs **before** either authority is burned. Only after both
succeed may it append the deterministic
`agent.model-invocation.requested` event and call the provider. Invalid v2 does
not burn a valid proof; a later exact first use may succeed, while any second
use fails.

Unadmitted public remote-provider commands fail closed even when all diagnostic
IDs and hashes match. Existing non-production local-engine calls may remain a
separate data-only branch because they transfer no prompt envelope; this
correction creates no generic remote-provider bypass. Future remote workflows
must register their own reviewed private admission rather than adding bytes or
proofs back to the public command.

### Factory proxy and caller migration

`packages/agent/src/specialist-runner-kernel.ts` retains the narrow
`SpecialistRunnerModelInvoker`, but production composition must never inject
the public runtime object directly. Task140H's lexical factory runner closure
creates one private proxy bound to the consumed admission. The kernel submits
only data fields; the proxy creates the identity-bound admitted command and
delegates it to runtime. A caller-supplied invoker remains useful for pure unit
tests but cannot register a command with the real runtime or reach a real
provider.

Remove the direct `runtime.invokeModel({ promptArtifact })` path from
`packages/local-runtime/src/agent-nous-smoke.ts`. The smoke becomes a thin
caller of the resident orchestrator/H vertical and receives only its safe
report; it never receives the private proxy, command binding, envelope, proof,
or token. Its deterministic mocked test runs in Task140H. Real Nous execution
remains in the separately authorized acceptance gate and must exercise the same
resident path.

### Revised complete Task140H ownership

In addition to every CF-1R6 Task140H file, Task140H owns serially:

- Read-only contract: `packages/agent/src/index.ts` must not export the private module
- Create `packages/agent/src/production-model-invocation-admission.ts`
- Create `packages/agent/test/production-model-invocation-admission.test.ts`
- Modify `packages/agent/test/evidence-triage-workflow.test.ts`
- Modify `packages/agent/test/prr-negotiation-workflow.test.ts`
- Modify `packages/agent/test/investigation-planner-workflow.test.ts`
- Modify `packages/local-runtime/src/agent-nous-smoke.ts`
- Modify `packages/local-runtime/test/agent-nous-smoke.test.ts`

The three specialist workflow tests migrate real-runtime controls to the
factory-private proxy and add direct-public-runtime counterfactuals; deterministic
fake invokers remain test-only. Live Nous workflow tests are compile-only until
their later live gate. No HTTP/cockpit runtime object exposes the proxy.

REDs in `production-model-invocation-admission.test.ts`, `runtime.test.ts`, and
`specialist-runner-kernel.test.ts` cover missing membership; structural and
spread-copied commands; direct public runtime calls; old envelope/proof fields;
forged, copied, reused, or swapped consumed admission; v1 or mismatched v2;
wrong receipt/source-v1/task/attempt/run/provider/model/credential/context;
post-normalization mutation; invalid-v2-before-proof-consume ordering; and
second proof/command use. Every rejection asserts zero ledger append, provider,
network, artifact write, H, handoff, and terminal activity.

This command replaces every earlier Task140H non-live command:

```bash
npm test -- packages/agent/test/production-model-invocation-admission.test.ts packages/agent/test/production-specialist-invocation-proof.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/runtime.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts && npm run typecheck && ! rg -n 'production-model-invocation-admission' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

No live test is selected. The fresh plan-review range is exactly
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD`; reviewers must use Git to
inspect every commit and verify that the public command can carry neither bytes
nor proof and that only private exact object identity reaches the runtime
consumer. Only two fresh unqualified Terra/xhigh approvals permit
coordinator-only plan integration. Each later source task still requires a
coordinator message specifically approving
`superpowers:subagent-driven-development`. Full verification,
provider/network/credential/Nous activity, reset credits, `neo`, self-review,
self-integration, and merge remain closed.

## CF-1R8 Task140H Executable RED/GREEN Sequence

**Status:** This section preserves CF-1R6 lifecycle and CF-1R7 architecture but
supersedes their prose-only Task140H implementation instructions. It is the
sole executable Task140H sequence. Task140H remains one serialized source lane.
H.1 and H.2 are separate RED/GREEN cycles inside one atomic ABI-migration
commit because removing the public fields makes the existing kernel and smoke
callers uncompilable until H.2 migrates them. H.3 is a second independently
reviewed recovery commit; H.4 is the final integrated non-live gate.
The coordinator's dispatch message for every increment must specifically
approve use of `superpowers:subagent-driven-development`; generic plan approval
does not open source work.

### Task140H preflight and frozen interfaces

Start from a fresh worktree at the coordinator-integrated plan head. Do not
reuse, commit, rebase, or copy the dirty interrupted Task133.1 worktree. Read
the current Task133/Task140P/Task140R0 claims and verify their prerequisite
commits are ancestors. Before RED, record exact source ownership and confirm
that no other lane owns a Task140H file.

The internal module interface is frozen as follows; it is imported only by
explicit source-module path and is absent from `packages/agent/src/index.ts`:

```ts
export interface ProductionModelInvocationBridge {
  invoke(input: {
    readonly command: InvokeAgentModelInput;
    readonly consumedAdmission: ConsumedPromptAdmission;
  }): Promise<AgentRuntimeResult<InvokeAgentModelResult>>;
}

export function createProductionModelInvocationBridge(input: {
  readonly invokeAdmittedCommand: (
    command: InvokeAgentModelInput
  ) => Promise<AgentRuntimeResult<InvokeAgentModelResult>>;
}): ProductionModelInvocationBridge;

// Package-internal runtime consumer functions; never index-exported.
export interface InternalHiddenProductionInvocation {
  readonly command: InvokeAgentModelInput;
  readonly promptArtifact: PromptArtifactEnvelope;
  readonly proof: ProductionSpecialistInvocationProof;
  readonly bindingHash: `sha256:${string}`;
}

export function lookupHiddenProductionInvocation(
  command: InvokeAgentModelInput
): InternalHiddenProductionInvocation | undefined;
export function claimHiddenProductionInvocation(
  command: InvokeAgentModelInput,
  expected: InternalHiddenProductionInvocation
): InternalHiddenProductionInvocation | undefined;
```

`InternalHiddenProductionInvocation` is exported only from this explicit
internal source module and is absent from the package index. Its fields are not
authority: only exact WeakMap membership and exact lookup-return identity can
be claimed, so a structural copy cannot authorize invocation. The bridge
uses the H-owned private consumed-admission accessor and sole proof minter. The
factory supplies a deferred lexical `invokeAdmittedCommand` closure because
the runner registry is composed before `createAgentRuntime` returns: the
closure rejects `blocked.production-model-runtime-not-ready` until the exact
runtime object is assigned, then delegates only its identity-bound command to
that runtime. No public runtime object is installed directly as the specialist
invoker.

At `createAgentRuntime` construction, derive and freeze a set of local-engine
provider IDs from the already supplied provider descriptors. Invocation uses
that captured set synchronously, without provider-registry lookup, to preserve
the existing unadmitted data-only local-engine branch. Every provider ID not in
that set requires private identity membership before the first await; therefore
an unadmitted public remote command rejects before ledger or provider lookup.

### Task140H.1 — Data-only runtime command and identity admission

**Files**

- Modify `packages/agent/src/runtime.ts`
- Modify `packages/agent/src/production-specialist-invocation-proof.ts`
- Create `packages/agent/src/production-model-invocation-admission.ts`
- Modify `packages/agent/test/runtime.test.ts`
- Create `packages/agent/test/production-specialist-invocation-proof.test.ts`
- Create `packages/agent/test/production-model-invocation-admission.test.ts`
- Read only `packages/agent/src/index.ts`

- [ ] **Step 1: write the causal REDs.** Add tests with these exact titles:
  `rejects legacy prompt and proof keys before any runtime effect`,
  `rejects an unadmitted public remote command before any runtime effect`,
  `permits one data-only unadmitted local-engine command`,
  `admits one exact factory command identity and rejects its spread copy`,
  `validates hidden v2 before claiming mapping or consuming proof`,
  `freezes the exact command before its first await`, and
  `rejects a second use of the admitted command`. Legacy-key, unadmitted-remote,
  copied-command, and reused-command rejection snapshots require ledger read/
  append, provider lookup/invoke, artifact read/write, H, handoff, and terminal
  counters all to remain zero. An admitted command whose current durable facts
  invalidate v2 may read ledger/artifact evidence, but must perform zero ledger
  append, provider invocation, artifact write, H, handoff, or terminal effect;
  lookup must still return the same unclaimed mapping afterward.
  The valid control requires exactly one request append, one provider call,
  one completion append, and one output-artifact write.

- [ ] **Step 2: run the exact RED command.**

```bash
npm test -- packages/agent/test/production-model-invocation-admission.test.ts packages/agent/test/production-specialist-invocation-proof.test.ts packages/agent/test/runtime.test.ts
```

Expected: exit `1`. The new module/test may first fail import resolution; after
adding only the frozen signatures with bodies that throw
`blocked.production-model-invocation-admission-required`, rerun the same
command. It must still exit `1` because the exact valid control cannot invoke,
while current `runtime.invokeModel` still accepts the legacy carrier or reads
the ledger before rejecting an unadmitted public command. A syntax, fixture,
or unrelated test failure is not an accepted RED. If the behavioral REDs pass
before production changes, stop for a contract conflict.

- [ ] **Step 3: implement the minimum authority boundary.** Remove
  `promptArtifact` and `productionInvocationProof` from
  `InvokeAgentModelInput`; add strict same-object own-data validation/freeze;
  capture the package-supplied local-engine provider-ID set at runtime creation;
  add the private WeakMap bridge; move proof minting behind exact
  `ConsumedPromptAdmission`; and make production remote runtime lookup hidden
  identity before its first await, revalidate v2 and exact facts, atomically
  claim the mapping, consume proof, then append the request. Do not modify
  `index.ts`, add a public builder, or add provider/network code.

- [ ] **Step 4: rerun the identical command to GREEN.**

```bash
npm test -- packages/agent/test/production-model-invocation-admission.test.ts packages/agent/test/production-specialist-invocation-proof.test.ts packages/agent/test/runtime.test.ts
```

Expected: exit `0`; all named tests pass. Then run
`! rg -n 'production-model-invocation-admission' packages/agent/src/index.ts && git diff --check`.
Do not typecheck or commit yet: the deliberately removed public fields require
the H.2 kernel, factory, workflow, and smoke caller migration in the same atomic
ABI change.

### Task140H.2 — Factory-held proxy and data-only specialist kernel

**Files**

- Modify `packages/agent/src/specialist-runner-kernel.ts`
- Modify `packages/agent/test/specialist-runner-kernel.test.ts`
- Modify `packages/local-runtime/src/agent-runtime-factory.ts`
- Modify `packages/local-runtime/test/agent-runtime-composition.test.ts`
- Modify `packages/agent/test/evidence-triage-workflow.test.ts`
- Modify `packages/agent/test/prr-negotiation-workflow.test.ts`
- Modify `packages/agent/test/investigation-planner-workflow.test.ts`
- Modify `packages/local-runtime/src/agent-nous-smoke.ts`
- Modify `packages/local-runtime/test/agent-nous-smoke.test.ts`
- Modify signature only `packages/agent/test/task-orchestrator-evidence-triage-live.test.ts`

- [ ] **Step 1: write the causal REDs.** Add exact-title tests:
  `kernel sends only the data-only invocation command`,
  `factory bridge consumes the exact admitted token once`,
  `factory refuses invocation before runtime assignment`,
  `production composition never injects the public runtime as model invoker`,
  and one `direct public runtime invocation remains blocked` control in each
  specialist workflow. Also add `smoke invokes only through the resident
  orchestrator H path`, `smoke report exposes no prompt proof token or
  admission`, and `blocked resident execution performs no provider call`.
  The kernel spy must reject any own key named
  `promptArtifact`, `productionInvocationProof`, `prompt`, `text`, `token`, or
  `admission`. Factory tests require zero provider/ledger/H effects for copied,
  missing, swapped, or reused admission.

- [ ] **Step 2: run the exact RED command.**

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts
```

Expected: exit `1` with the named data-only/factory controls failing because
the current kernel mints and forwards proof plus prompt bytes and the current
factory has no private admitted bridge; the smoke spy also reports the current
direct `runtime.invokeModel({ promptArtifact })` call. Unrelated fixture or type
failures are not accepted RED evidence.

- [ ] **Step 3: implement the minimum proxy composition.** Remove the kernel
  mint/import and prompt-bearing runtime call. Compose one package-internal
  bridge in `agent-runtime-factory.ts`; use a fail-closed deferred runtime
  closure; pass exact consumed admission only through the lexical production
  runner; and give the kernel only a `SpecialistRunnerModelInvoker` that accepts
  the data-only command. Replace the smoke's direct runtime invocation with one
  thin resident orchestrator/H vertical call and return only IDs, hashes,
  context-pack IDs, omission count, and secret-safe diagnostics. Update the
  live test only enough to compile; do not execute it. Test fakes remain
  isolated and cannot register hidden identity with a real runtime.

- [ ] **Step 4: rerun the identical command to GREEN.**

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts
```

Expected: exit `0`, followed by
`npm run typecheck && ! rg -n 'production-model-invocation-admission' packages/agent/src/index.ts && git diff --check && npm run factory:check`.
Commit the combined H.1/H.2 listed files and claim amendment as one atomic ABI
migration, then obtain fresh review before H.3.

### Task140H.3 — Crash recovery and no-duplicate provider/H effects

**Files**

- Modify `packages/agent/src/task-orchestrator-handoff-port.ts`
- Modify `packages/agent/src/task-orchestrator.ts`
- Modify `packages/agent/src/runtime-types.ts`
- Modify `packages/agent/test/task-orchestrator-handoff-port.test.ts`
- Modify `packages/agent/test/task-orchestrator-dispatch.test.ts`
- Modify `packages/agent/test/task-orchestrator-recovery.test.ts`
- Modify `packages/agent/test/task-orchestrator-evidence-triage.test.ts`
- Modify `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`

- [ ] **Step 1: write the causal REDs.** Add exact-title tests:
  `recovers before request with a fresh token and the same invocation id`,
  `requested-only records one nonretryable unknown-outcome failure without replay`,
  `failed invocation never replays without a new approved retry generation`,
  `completed invocation resumes only from durable handoff readback`,
  `terminal orchestration never remints or reinvokes`, and
  `copied consumed admission cannot cross the handoff port`. Each test records
  exact event IDs and asserts provider, H, handoff-write, and terminal counters;
  requested-only may append/read exactly one causally linked orchestration
  failure and must perform zero provider/H calls on every restart.

- [ ] **Step 2: run the exact RED command.**

```bash
npm test -- packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts
```

Expected: exit `1`; specifically, the existing unconditional
`runner-dispatching` return strands pre-request work or the requested-only case
lacks the one nonretryable unknown-outcome event. A pass, unrelated failure, or
provider call is a stop condition.

- [ ] **Step 3: implement the CF-1R6 state matrix.** Consume exact admission in
  the port, read the deterministic invocation stream, branch on no-request /
  requested-only / failed / completed / terminal, append or read one causal
  failure for unknown provider outcome, and resume completion only from exact
  durable derivative/handoff readback. Never infer provider outcome and never
  replay provider or H effects automatically.

- [ ] **Step 4: rerun the identical command to GREEN.**

```bash
npm test -- packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts
```

Expected: exit `0`, followed by
`npm run typecheck && git diff --check && npm run factory:check`. Commit only
the listed files and claim amendment, then obtain fresh review.

### Task140H.4 — Integrated non-live gate

**Files**

- Read only every H.1-H.3 source and test file
- Modify only the final Task140H claim with exact commit and gate evidence

- [ ] **Step 1: rerun the already-green smoke control.**

```bash
npm test -- packages/local-runtime/test/agent-nous-smoke.test.ts
```

Expected: exit `0` with the three H.2 smoke controls. Then run the complete
CF-1R7 Task140H non-live command
exactly as written above. It must exit `0` without selecting
`task-orchestrator-evidence-triage-live.test.ts` or contacting a provider.
Commit only the final claim amendment, then obtain fresh
Task140H code and spec review. Full `npm run verify` and the real Nous gate
remain reserved for their later coordinator-owned acceptance phase.

### CF-1R8 review gate

Fresh reviewers inspect exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD` and must verify every RED
command can fail causally on canonical source, every GREEN command is identical
to its RED command, H.1/H.2 form one explicitly atomic ABI commit, later file
ownership and commit/review boundaries are complete, the final H command
aggregates every new suite, and no live/provider activity is selected. Two
unqualified independent Terra/xhigh approvals are
required before coordinator-only plan integration. Rejection authorizes only
another append-only documentation correction; it never authorizes source.

## CF-1R9 Task133 Executable RED/GREEN And Sole-Lifecycle Correction

**Status:** This section is the sole executable Task133.1-.5 sequence. It
preserves CF-1R6 durable receipt/store semantics and the post-approval binder,
but supersedes every earlier Task133 implementation step, command, standalone
Task133.4 task, and any pre-approval exact-v2 renderer. Source remains frozen
until two fresh full-lineage reviewers approve this combined contract and the
coordinator integrates it.

Task133.1-.3 are three TDD phases inside one atomic discriminated-schema
migration: the new strict type can make transfer/runtime/projection consumers
temporarily uncompilable, so no intermediate typecheck or commit is valid.
After each phase, run its identical focused GREEN command; after Task133.3, run
one typecheck/diff/factory gate, commit the complete .1-.3 file set, and stop
for review. Task133.5 starts only after that reviewed integration and owns its
own commit/review boundary.

Each source phase starts in the same fresh worktree at the current integrated
program head, receives a coordinator message that specifically approves
`superpowers:subagent-driven-development`, writes the listed REDs first, runs
the exact test-only command and records the named causal failure, implements
only the listed files, and reruns the identical command to GREEN.
An unrelated failure, a RED that already passes, or a missing prerequisite is
a stop condition rather than implementation permission.

### Task133.1 — Atomic v1 schema, post-approval binder, and legacy callers

The former Task133.4 is retired as a standalone task. Its production behavior
must not change, so it cannot own an honest post-Task133.1 RED. Its three
compatibility witnesses move into this atomic schema/binder migration, where
they causally fail on the old unversioned artifact and pass with explicit v1.

**Files**

- Modify `packages/agent/src/prompt-artifacts.ts`
- Modify `packages/agent/src/production-specialist-prompts.ts`
- Modify `packages/agent/test/prompt-artifacts.test.ts`
- Modify `packages/agent/test/production-specialist-prompts.test.ts`
- Modify `packages/agent/test/evidence-triage-workflow.test.ts`
- Modify `packages/agent/test/prr-negotiation-workflow.test.ts`
- Modify `packages/agent/test/task-orchestrator-evidence-triage.test.ts`
- Create `docs/agentic/claims/task-133-resident-runtime-prompt-renderer.md`

- [ ] **Step 1: write causal REDs.** Add exact-title tests
  `renders one explicit production binding v1`,
  `binds approved v1 bytes to strict v2 without rendering`,
  `derives every v2 output hash and rejects caller-supplied hashes`,
  `rejects unversioned and hostile production bindings`, and in each migrated
  workflow `legacy deterministic caller remains explicit v1`. The valid
  witness counts one v1 renderer call and zero v2 renderer calls; every
  prohibited-key row rejects before artifact creation or callback activity.

- [ ] **Step 2: run RED.**

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts
```

Expected: exit `1` because current artifacts are unversioned and
`bindApprovedProductionSpecialistPromptV2` does not exist. The deterministic
caller assertions must report missing explicit v1, not a fixture/syntax error.

- [ ] **Step 3: implement minimum schema/binder migration.** Add strict v1 and
  exact v2 discriminants; derive all hashes inside the artifact owner; add the
  byte-preserving post-approval binder; keep existing callers on the one-render
  v1 path; delete or never add `renderExactlyBoundProductionSpecialistPrompt`.

- [ ] **Step 4: rerun identical command to GREEN.**

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts
```

Expected: exit `0`, followed by
`! rg -n 'renderExactlyBoundProductionSpecialistPrompt' packages/agent/src packages/agent/test && git diff --check`.
Do not typecheck or commit yet; continue directly to Task133.2 in the same
atomic migration.

### Task133.2 — Exact approval and provider-transfer derivation

**Files**

- Modify `packages/agent/src/specialist-runner-kernel.ts`
- Modify `packages/agent/src/task-orchestrator-approval.ts`
- Modify `packages/agent/src/adapters/provider-byte-transfer.ts`
- Modify `packages/agent/test/specialist-runner-kernel.test.ts`
- Modify `packages/agent/test/task-orchestrator-approval.test.ts`
- Modify `packages/agent/test/provider-byte-transfer-adapter.test.ts`
- Create `docs/agentic/claims/task-133-2-approval-transfer-binding.md`

- [ ] **Step 1: write causal REDs.** Add exact-title tests
  `accepts v2 only from the exact currently approved v1 bytes`,
  `rejects direct v2 without current v1 approval proof`,
  `rejects swapped source v1 and rerendered text`,
  `rejects stale run provider context and approval facts`, and
  `rejects every v2 hash and lookalike injection before transfer`. Rejection
  counters require zero provider invocation, ledger append, runner dispatch,
  H, store write, handoff, and terminal append. The valid control performs
  validation/derivation only and still performs zero provider invocation.

- [ ] **Step 2: run RED.**

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts
```

Expected: exit `1`; the exact-v2 valid control cannot derive transfer from the
current v1 approval proof, or a direct/swapped v2 reaches current transfer
validation. Only those named behavioral failures are accepted RED evidence.

- [ ] **Step 3: implement minimum consume-time validation.** Reuse canonical
  artifact parsing/hashing and current approval validation; prove exact source
  v1 hash/bytes, task/attempt/run/provider/context/workflow/posture facts, and
  owner-derived hashes before transfer. Add no provider call, duplicate parser,
  public approval minter, boolean authority, or rerender path.

- [ ] **Step 4: rerun identical command to GREEN.**

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts
```

Expected: exit `0`, followed by
`git diff --check`. Do not typecheck or commit yet; continue directly to
Task133.3 in the same atomic migration.

### Task133.3 — Durable variants, prompt-bound receipt, projection, and rebuild

**Files**

- Modify `packages/agent/src/runtime.ts`
- Modify `packages/agent/src/projection.ts`
- Modify `packages/agent/src/projection-types.ts`
- Modify `packages/agent/src/task-orchestrator-types.ts`
- Modify `packages/agent/src/task-orchestrator-projection.ts`
- Modify `packages/ontology/src/contracts.ts`
- Modify `packages/agent/test/runtime.test.ts`
- Modify `packages/agent/test/projection.test.ts`
- Modify `packages/agent/test/task-orchestrator-events.test.ts`
- Modify `packages/agent/test/task-orchestrator-projection.test.ts`
- Modify `packages/ontology/test/agent-contracts.test.ts`
- Modify `packages/workspace-ops/test/projection-rebuild.test.ts`
- Create `docs/agentic/claims/task-133-3-durable-prompt-binding.md`

- [ ] **Step 1: write causal REDs.** Add exact-title tests
  `round trips explicit production binding v1 without defaulting`,
  `round trips strict v2 with source v1 and all owner hashes`,
  `rejects missing unknown or unversioned durable prompt binding`,
  `appends and reads one strict hash-only prompt-bound receipt`,
  `projection preserves the exact receipt without granting authority`, and
  `ledger rebuild reproduces exact v1 v2 and receipt hashes`. The receipt tests
  require approval-event-derived `generatedAt`, exact source/bound hashes,
  receipt hash, run/provider/context/workspace/mount facts, and no bytes/path/
  credential/token/proof/provider output.

- [ ] **Step 2: run RED.**

```bash
npm test -- packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/task-orchestrator-events.test.ts packages/agent/test/task-orchestrator-projection.test.ts packages/ontology/test/agent-contracts.test.ts packages/workspace-ops/test/projection-rebuild.test.ts
```

Expected: exit `1` because current ontology rejects `prompt-bound`, durable
events do not preserve discriminated v1/v2, and no strict binding receipt can
round-trip. Missing-module, fixture-only, or unrelated failures are not causal.

- [ ] **Step 3: implement minimum durable migration.** Extend strict ontology,
  event/runtime mapping, projection types/projector, and rebuild parsing for
  explicit v1/v2 plus the receipt. Recompute receipt hashes on append/readback;
  never default, upgrade, store prompt bytes, or make projection state
  authority.

- [ ] **Step 4: rerun identical command to GREEN.**

```bash
npm test -- packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/task-orchestrator-events.test.ts packages/agent/test/task-orchestrator-projection.test.ts packages/ontology/test/agent-contracts.test.ts packages/workspace-ops/test/projection-rebuild.test.ts
```

Expected: exit `0`, followed by
`npm run typecheck && ! rg -n 'renderExactlyBoundProductionSpecialistPrompt' packages/agent/src packages/agent/test && git diff --check && npm run factory:check`.
Commit the combined Task133.1-.3 listed files and claims as one atomic schema/
approval/durable-event migration, then stop for fresh code and spec review.

### Task133.4 — Retired non-causal lane

There is no Task133.4 source or test commit. Its three deterministic caller
witnesses are owned by Task133.1, where they fail causally on the old
unversioned schema and turn GREEN with explicit v1. The coordinator records
Task133.4 as `retired-into-task133.1`; no worker, branch, claim, or standalone
approval may be created for it.

### Task133.5 — Portable pre-approval v1 render/store/readback

**Files**

- Modify `packages/agent/src/task-orchestrator-types.ts`
- Modify `packages/agent/src/task-orchestrator-context.ts`
- Modify `packages/agent/src/task-orchestrator.ts`
- Modify `packages/agent/test/task-orchestrator-context.test.ts`
- Modify `packages/agent/test/task-orchestrator-evidence-triage.test.ts`
- Modify `packages/local-runtime/src/agent-prompt-artifacts.ts`
- Modify `packages/local-runtime/src/agent-runtime-factory.ts`
- Create `packages/local-runtime/src/mounted-prompt-artifact-store.ts`
- Modify `packages/local-runtime/test/agent-prompt-artifacts.test.ts`
- Create `packages/local-runtime/test/mounted-prompt-artifact-store.test.ts`
- Create `packages/local-runtime/test/agent-runtime-preapproval-prompt.test.ts`
- Create `docs/agentic/claims/task-133-5-preapproval-prompt-store.md`

- [ ] **Step 1: write causal REDs.** Add exact-title tests
  `requires attempt id and generated at before context rendering`,
  `renders v1 once and checkpoints only after exact mounted readback`,
  `constructs resident prompt store only for a verified portable mount`,
  `revalidates workspace root and blob tuple before and after every io`,
  `accepts EEXIST only for byte-identical canonical envelope`,
  `rejects corrupt or hash-mismatched readback without fallback`, and
  `fresh runtime reads the same v1 after restart without rerendering`. Tuple
  replacement tests mutate workspace ID, resolved root, and blob root both
  before I/O and between I/O/post-check and count original/replacement access.
  Every failure requires zero context-ready checkpoint, approval, provider,
  H, handoff, or terminal activity.

- [ ] **Step 2: run RED.**

```bash
npm test -- packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/agent-runtime-preapproval-prompt.test.ts
```

Expected: exit `1` because the mounted store test/module is absent and current
resident prompt storage has in-memory/internal fallback and no remount tuple
checks. After adding only interface skeletons that throw
`blocked.portable-prompt-store-required`, rerun the identical command; it must
still exit `1` on the valid render/store/readback/restart controls. Unrelated
fixture failures are not accepted RED evidence.

- [ ] **Step 3: implement minimum portable v1 path.** Snapshot exact attempt/
  time before await; render v1 once; construct only from verified portable
  mount; remount and exact-key compare the captured tuple before/after every
  asynchronous put/read; use freshly returned blob root; canonical create-only
  bytes with strict EEXIST verification; parse/hash/canonical-byte verify reads;
  return exact readback; append context-ready only afterward; remove every
  resident internal-disk and in-memory fallback.

- [ ] **Step 4: rerun identical command to GREEN.**

```bash
npm test -- packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/agent-runtime-preapproval-prompt.test.ts
```

Expected: exit `0`, followed by
`npm run typecheck && git diff --check && npm run factory:check`. Commit only
the listed files/claim and stop for review.

### CF-1R9 integrated Task133 gate

After reviewed coordinator integration of Task133.1, .2, .3, and .5, run:

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/task-orchestrator-events.test.ts packages/agent/test/task-orchestrator-projection.test.ts packages/ontology/test/agent-contracts.test.ts packages/workspace-ops/test/projection-rebuild.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-context.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/agent-runtime-preapproval-prompt.test.ts && npm run typecheck && ! rg -n 'renderExactlyBoundProductionSpecialistPrompt' packages/agent/src packages/agent/test && git diff --check && npm run factory:check
```

Expected: exit `0`; no live/provider-bearing test is selected. Fresh reviewers
must inspect exact full lineage
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD`, confirm that the claim's
opening names only this latest lifecycle, and return two unqualified
Terra/xhigh approvals before coordinator-only plan integration. Full verify,
provider/network/credential/Nous activity, reset credits, `neo`, source work in
this plan branch, self-integration, and merge remain closed.

## CF-1R10 Complete Task133.5/Task140P/Task140R0 Lifecycle

**Status:** This section supersedes every earlier Task133.5 instruction only
where it permits an implicit specialist render, and supersedes every earlier
Task140P and Task140R0 file list, interface, RED/GREEN step, command, and
conditional ownership statement in full. It preserves CF-1R9's Task133 schema
sequence, CF-1R6 receipt/recovery invariants, and the post-approval binder. A
worker must not consult an older P/R0 implementation section.

### Task133.5 fallback-removal overlay

Add these files to the complete CF-1R9 Task133.5 ownership:

- Modify `packages/agent/src/specialist-runner-kernel.ts`
- Modify `packages/agent/test/specialist-runner-kernel.test.ts`
- Modify `packages/local-runtime/test/agent-prr-context-packs.test.ts`

Add exact-title REDs
`rejects missing mounted context-ready prompt instead of rendering`,
`accepts the exact supplied context-ready v1 without another render`, and
`local prr preparation supplies the stored v1 instead of using kernel fallback`.
The missing-artifact counterfactual records zero renderer, ledger append,
provider, H, store write, handoff, and terminal effects. The valid control
records the one Task133.5 context render/store/readback before kernel entry and
zero renderer calls inside `prepareSpecialistRun`.

Replace CF-1R9 Task133.5's RED and GREEN command with this identical command:

```bash
npm test -- packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/local-runtime/test/agent-prr-context-packs.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/agent-runtime-preapproval-prompt.test.ts
```

Expected RED additionally requires the canonical implicit branch in
`prepareSpecialistRun` to render or accept missing input, and the local PRR
direct caller to depend on that branch. Implement by deleting the
`input.promptArtifact === undefined ? render...` fallback, rejecting a missing
artifact before current-run/provider/ledger effects, and verifying only the v1
artifact supplied from exact Task133.5 mounted readback in production
composition. A structural caller artifact remains non-authoritative and cannot
reach provider transfer without later P/R0/H authority. Expected GREEN is exit
`0`, followed by:

```bash
npm run typecheck && ! rg -n 'renderProductionSpecialistPrompt\(' packages/agent/src/specialist-runner-kernel.ts && ! rg -n 'renderExactlyBoundProductionSpecialistPrompt' packages/agent/src packages/agent/test && git diff --check && npm run factory:check
```

The Task133.5 commit includes all CF-1R9 and overlay files and stops for review.
The integrated CF-1R9 gate additionally includes
`packages/local-runtime/test/agent-prr-context-packs.test.ts` and both negative
`rg` assertions above.

### Task140P — Two-phase receipt admission and recovery dispatch

Task140P starts only after reviewed coordinator integration of Task133.5. It
has one fresh worktree, one commit, and one review. The coordinator message
must specifically approve `superpowers:subagent-driven-development`.

**Files**

- Create `packages/agent/src/task-orchestrator-handoff-port.ts`
- Modify `packages/agent/src/task-orchestrator.ts`
- Modify `packages/agent/test/task-orchestrator-handoff-port.test.ts`
- Modify `packages/agent/test/task-orchestrator-dispatch.test.ts`
- Modify `packages/agent/test/task-orchestrator-approval.test.ts`
- Modify `packages/agent/test/task-orchestrator-recovery.test.ts`
- Create `docs/agentic/claims/task-140-p-private-prompt-admission.md`

The exact structural resolver input is data-only and contains no time:

```ts
interface ResolveApprovedPromptBindingForDispatchInput {
  readonly taskId: string;
  readonly attemptId: string;
  readonly runType: TaskOrchestratorRunType;
  readonly scope: ProductionRunScope;
  readonly approvalEventId: string;
  readonly approvalProof: TaskOrchestratorProviderApprovalProof;
  readonly providerPosture: PromptArtifactProviderPostureV2;
}
```

`generatedAt`, `approvedAt`, `now`, callback, resolver, prompt artifact, v2,
hash override, capability, and lookalike keys are forbidden. The orchestrator
passes the exact `approvalEventId` returned by approval inspection; neither P
nor a caller derives time. R0 alone reads that event and returns a prepared
binding whose diagnostics include the event-derived time.

- [ ] **Step 1: write causal REDs.** Add exact-title tests
  `approval inspection precedes private binding preparation`,
  `rejects generatedAt and every caller time before port activity`,
  `prepare returns one identity-bound private binding`,
  `appends and reads prompt-bound receipt before admission`,
  `rejects copied swapped reused or foreign prepared binding and receipt`,
  `runner-dispatching binds receipt event hash v2 hash and invocation id`, and
  `recovers each pre-request crash with a fresh token and same durable ids`.
  Cover crashes before v2 put, after put/before receipt, after receipt/before
  admission, after admission/before dispatch checkpoint, and after checkpoint/
  before token consumption. Every pre-request recovery uses a fresh ephemeral
  object and never serializes/reconstructs one.

- [ ] **Step 2: run RED.**

```bash
npm test -- packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
```

Expected: exit `1` because the private two-phase port/receipt path is absent,
`generatedAt` is accepted by the stale interface, or a recovery control cannot
mint a fresh token from durable facts. Missing/syntax/unrelated failures are
not accepted RED evidence.

- [ ] **Step 3: implement minimum P lifecycle.** Create private registrar,
  `prepare`, `admit`, and single-use `consume` identity maps. Strictly normalize
  the no-time input before await; call prepare after current approval and before
  runner checkpoint; append/read one prompt-bound receipt from prepared
  diagnostics; admit only exact prepared identity plus exact receipt event;
  append/read deterministic runner checkpoint; and recover through the CF-1R6
  invocation-state matrix. Expose no public resolver constructor, token, v2,
  receipt authority, or route field.

- [ ] **Step 4: rerun identical command to GREEN.**

```bash
npm test -- packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
```

Expected: exit `0`, followed by
`npm run typecheck && git diff --check && npm run factory:check`. Commit only
the listed files/claim and stop for fresh code/spec review.

### Task140R0 — Factory-private durable v2 preparation and restart lookup

R0 starts only after reviewed coordinator integration of P. It has one fresh
worktree, one commit, and one review. The coordinator message must specifically
approve `superpowers:subagent-driven-development`.

**Files**

- Modify `packages/local-runtime/src/agent-runtime-factory.ts`
- Create `packages/local-runtime/test/agent-runtime-composition.test.ts`
- Modify `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`
- Create `docs/agentic/claims/task-140-r0-factory-prompt-binding.md`
- Read-only regression: `packages/local-runtime/src/agent-prompt-artifacts.ts`
- Read-only regression: `packages/local-runtime/src/mounted-prompt-artifact-store.ts`
- Read-only regression: `packages/local-runtime/test/agent-prompt-artifacts.test.ts`
- Read-only regression: `packages/local-runtime/test/mounted-prompt-artifact-store.test.ts`
- Read-only regression: `packages/agent/test/task-orchestrator-handoff-port.test.ts`
- Read-only regression: `packages/agent/test/task-orchestrator-dispatch.test.ts`
- Read-only regression: `packages/agent/test/task-orchestrator-recovery.test.ts`

- [ ] **Step 1: write causal REDs.** In the two writable tests add exact-title
  controls `rereads exact v1 and approval event before binding v2`,
  `derives v2 generatedAt only from approval event occurredAt`,
  `binds and stores v2 with zero renderer calls`,
  `returns only one private prepared binding after exact mounted readback`,
  `fresh factory reads receipt and v2 without in-memory resolver state`, and
  `rejects stale approval context provider workspace mount lock or source`.
  Table-reject structural `generatedAt`, caller v2/artifact/hash, one-field
  task/attempt/run/type/posture/context/workflow/scope swaps, forged approval
  event ID, non-approved event type, and event-time mismatch. Every rejection
  records zero binder, store write, receipt append, token, runner, provider, H,
  handoff, and terminal effects; durable reads needed for validation are allowed.

- [ ] **Step 2: run RED.**

```bash
npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
```

Expected: exit `1` because no factory-private P resolver is registered, the
composition test is absent, or stale inherited code calls the forbidden exact
renderer/accepts caller time. A missing created test is only the first RED;
after adding its complete tests and a registrar skeleton that throws
`blocked.factory-prompt-binding-required`, the identical command must still
exit `1` on valid binding/restart controls.

- [ ] **Step 3: implement minimum R0 resolver.** Register one lexical resolver
  in the factory. On each call: exact-key normalize input; read and validate the
  exact `approvalEventId` as current `agent.tool.approved`; use only its
  `context.occurredAt`; read exact durable v1 by approval/checkpoint hash;
  reconsume approval/current preview; rerun provider and all six live context/
  workspace/mount/policy/source/lock checks; call
  `bindApprovedProductionSpecialistPromptV2` once with zero renderer calls;
  mounted put/read exact v2; then return the port-private prepared identity.
  If a receipt exists, read v2 by its bound hash and verify byte-identical v2,
  approval event time, source v1, and all current facts before returning a new
  prepared identity. Never accept caller time/v2, rerender, append receipt,
  mint admission, or use internal fallback.

- [ ] **Step 4: rerun identical command to GREEN.**

```bash
npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
```

Expected: exit `0`, followed by
`npm run typecheck && ! rg -n 'renderExactlyBoundProductionSpecialistPrompt' packages/local-runtime packages/agent/src packages/agent/test && git diff --check && npm run factory:check`.
Commit only the three writable source/test files and R0 claim; read-only
regressions must remain byte-identical. Stop for fresh code/spec review.

### CF-1R10 review gate

The sole implementation order is Task133.1-.3 atomic -> Task133.5 including
fallback removal -> P -> R0 -> H. Fresh reviewers inspect exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD` and verify no executable
step outside CF-1R9, CF-1R10, and CF-1R8 is needed, caller time is absent, every
P/R0 RED has an identical GREEN, and all final gates exclude live/provider
activity. Two unqualified Terra/xhigh approvals are required before
coordinator-only plan integration. Source/full/live/credential/reset-credit/
`neo`/self-integration/merge remain closed.


## CF-1R11 Nested Authority, Production-Local Admission, And Resident Acceptance

**Status:** This section supersedes CF-1R10 only where P carries a nested full
approval proof, Task133.5 lacks mounted-readback identity, and CF-1R8 permits a
provider-ID-only local exception or leaves live callers outside the resident
path. It also supersedes every earlier review range. All source remains frozen
pending two fresh approvals of exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`.

### Task133.5 opaque mounted-v1 readback authority

Add to Task133.5 ownership:

- Create `packages/agent/src/production-prompt-readback.ts`
- Create `packages/agent/test/production-prompt-readback.test.ts`
- Read only `packages/agent/src/index.ts`; the new module must not be exported

The package-internal module owns a private WeakMap and this hash-only witness:

```ts
export interface MountedProductionPromptReadbackWitness {
  readonly schemaVersion: "agent-mounted-production-prompt-readback.v1";
  readonly inputArtifactHash: `sha256:${string}`;
  readonly workspaceId: string;
  readonly mountInstanceId: string;
}
```

The mounted store imports the internal registrar by explicit source path and
may mint a witness only after canonical-byte/hash validation and the post-I/O
mount tuple check succeed. Its private binding contains the exact parsed v1
envelope and captured workspace/root/blob tuple. The context-ready checkpoint
stores only diagnostics/hash; the factory runner keeps the exact witness in a
lexical closure. `prepareSpecialistRun` accepts that witness instead of public
`promptArtifact`, consumes exact membership once, reparses/recomputes v1, and
requires task/run/context/checkpoint/hash equality. A direct envelope,
structural/copied/forged/reused witness, pre-post mount swap, v2, or readback
from another workspace rejects before ledger append/provider/H/handoff/
terminal effects. The internal registrar/consumer is absent from routes,
results, logs, serialization, and `index.ts`.

Add exact-title REDs
`rejects structurally valid v1 without mounted readback membership`,
`rejects copied swapped and reused mounted readback witness`, and
`consumes one exact post-mount-check v1 witness without rendering`. Replace
Task133.5's CF-1R10 command with:

```bash
npm test -- packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/production-prompt-readback.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/local-runtime/test/agent-prr-context-packs.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/agent-runtime-preapproval-prompt.test.ts
```

Expected RED: exit `1` because the internal witness module is absent and the
kernel accepts a structurally valid direct envelope. After adding signature
skeletons that throw `blocked.mounted-prompt-readback-required`, rerun the
identical command; valid mounted-witness controls must still fail. Expected
GREEN: exit `0`, followed by:

```bash
npm run typecheck && ! rg -n 'production-prompt-readback' packages/agent/src/index.ts && ! rg -n 'renderProductionSpecialistPrompt\(' packages/agent/src/specialist-runner-kernel.ts && ! rg -n 'renderExactlyBoundProductionSpecialistPrompt' packages/agent/src packages/agent/test && git diff --check && npm run factory:check
```

The Task133.5 commit/review boundary includes every CF-1R9/R10/R11 file.

### Task140P hash facts plus opaque approval admission

Add `packages/agent/src/task-orchestrator-approval.ts` to P source ownership.
Approval inspection, after exact current proof validation, creates one opaque
`TaskOrchestratorApprovalAdmission` with hash-only diagnostics and a private
WeakMap binding to the full proof/envelope/current preview. The exact object is
single-use, non-serializable, absent from routes/results, and never reconstructed.

P's resolver call has two separate parameters: strict data-only facts and the
exact opaque admission. Replace CF-1R10's interface with:

```ts
interface ResolveApprovedPromptBindingFacts {
  readonly taskId: string;
  readonly attemptId: string;
  readonly runType: TaskOrchestratorRunType;
  readonly scope: ProductionRunScope;
  readonly approvalEventId: string;
  readonly promptArtifactHash: `sha256:${string}`;
  readonly contextBindingHashes: readonly `sha256:${string}`[];
  readonly providerPostureHash: `sha256:${string}`;
  readonly credentialRefId: string;
}

prepare(
  facts: ResolveApprovedPromptBindingFacts,
  approvalAdmission: TaskOrchestratorApprovalAdmission
): Promise<PreparedPromptBinding>;
```

`approvalProof`, `promptArtifact`, `text`, `currentPreviewInput`, provider
readiness objects, caller time/v2, and all nested/lookalike keys are forbidden
in `facts`. Exact-key validation occurs before await. P verifies diagnostic
equality but does not open the token; it passes exact identity only to the
registered private resolver. R0 consumes membership, retrieves the full proof
privately, rereads mounted v1 by the hash-only fact, and performs CF-1R10 checks.
Recovery reruns approval inspection and receives a fresh admission; no token is
restored.

Add exact-title P REDs
`facts reject nested approval proof prompt artifact text and current preview`,
`copied approval admission cannot prepare binding`, and
`recovery obtains fresh approval admission from current inspection`. Use the
same P RED/GREEN command from CF-1R10. Expected RED includes the current nested
proof reaching the resolver; expected GREEN is exit `0` plus its existing
typecheck/diff/factory gate. P's one commit includes approval source and all
CF-1R10 P files, then stops for review.

### Task140R0 private approval-token consumption

R0's private resolver consumes the exact approval admission once to obtain the
full proof and prompt envelope; it never receives those values structurally.
It compares the envelope hash to hash-only facts, rereads exact mounted v1 by
that hash, and then executes CF-1R10 event-time/currentness/binder/store logic.
Add exact-title R0 REDs
`consumes full approval proof only behind exact opaque admission` and
`rejects structural proof envelope and copied admission before durable read`.
Use the identical R0 RED/GREEN command and gate from CF-1R10. Its file ownership
is unchanged; the full proof remains inside agent-private WeakMap consumption.

### Task140H production-local admission overlay

The local-engine provider-ID set is only an early remote/local classifier. It
is never sufficient authority. Replace the CF-1R7/R8 exception with this exact
rule after the run is read:

```text
requiresProductionPromptAudit(run.runType) => hidden H admission required,
regardless of provider endpoint kind

!requiresProductionPromptAudit(run.runType) && provider is local-engine
  => data-only unadmitted local execution may continue
```

An unadmitted nonlocal command still rejects before ledger/provider lookup.
An unadmitted local command may read the run solely to classify its run type;
if production, it rejects with zero ledger append, provider invocation,
artifact write, H, handoff, or terminal effect. Add exact-title H.1 REDs
`rejects unadmitted production local-engine run after classification` and
`permits unadmitted local-engine only for non-production run type`. Include
them in H.1's identical RED/GREEN runtime/admission command.

### Resident portable specialist acceptance harness

Add to the atomic H.1/H.2 ABI migration ownership:

- Create `packages/local-runtime/src/resident-specialist-acceptance.ts`
- Create `packages/local-runtime/test/resident-specialist-acceptance.test.ts`
- Modify `packages/agent/test/evidence-triage-nous-live.test.ts`
- Modify `packages/agent/test/prr-negotiation-nous-live.test.ts`
- Modify `packages/local-runtime/src/agent-nous-smoke.ts`
- Modify `packages/local-runtime/test/agent-nous-smoke.test.ts`

`runResidentSpecialistAcceptance` is the sole live/smoke entry for
`evidence-triage` and `prr-negotiation`. It requires an explicit portable root,
uses existing `createPortableWorkspace` then `mountPortableWorkspace`, verifies
the exact returned workspace/root/blob tuple, starts the resident task, obtains
Task133.5 mounted v1/witness and context-ready readback, consumes an existing
human approval event through P/R0, and invokes only through H. It has no direct
workflow/runtime model call, internal-storage fallback, or auto-approval API.

The deterministic harness test injects an already approved ledger fixture;
real live tests may create their test-human approval only under the existing
explicit live acceptance switch and later coordinator-authorized live gate.
Normal smoke without current approval returns secret-safe `approval-required`.
Mount creation/failure occurs before approval/provider activity.

Add exact-title REDs
`creates and verifies portable workspace before context-ready v1`,
`blocks no-mount with zero approval and provider effects`,
`requires existing human approval and never auto approves`,
`routes evidence triage through resident P R0 H`, and
`routes prr negotiation through resident P R0 H`. The smoke tests add
`smoke delegates only to portable resident acceptance` and
`smoke blocks mount failure before provider`.

Replace H.2's non-live command with:

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/local-runtime/test/resident-specialist-acceptance.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts
```

Expected RED: current smoke explicit-path/direct runtime and both direct live
workflow shapes lack the resident portable harness; deterministic mounted/
approval controls fail. The live files are compile-only and never selected by
this command. Expected GREEN: exit `0`, followed by:

```bash
npm run typecheck && ! rg -n 'runEvidenceTriageWorkflow|runPrrNegotiationWorkflow|runtime\.invokeModel' packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts && ! rg -n 'production-model-invocation-admission' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

The later live provider gate must run both migrated live files through this
harness on a verified portable workspace. It remains closed now.

### CF-1R11 review gate

The sole full-lineage range is
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`, including the historic
base registry commit. Exactly two fresh independent unqualified Terra/xhigh
approvals permit coordinator-only plan integration. A single approval, timeout,
capacity error, or silence never authorizes integration or source. Reviewers
must confirm mounted-v1 and approval-proof bytes cross only opaque identity
maps, production local engines require H, live/smoke callers use the portable
resident harness, every RED/GREEN is identical, and no non-live gate contacts a
provider. Full/source/live/credential/reset-credit/`neo`/self-integration/merge
remain closed.

## CF-1R12 Fresh Witness Reissue And Complete Aggregate Gates

**Status:** This section supersedes all earlier Task133 integrated commands,
Task140H.4 commands, and live-fixture ownership lists. It preserves CF-1R11
authority design and adds the missing restart and aggregate evidence. Source
remains frozen pending two fresh approvals of
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`.

### Fresh-runtime mounted witness reissuance

Task133.5's mounted store `read` is the sole restart reissuer. After a process
restart, no witness or WeakMap entry exists. The new factory must:

```text
mount and verify exact portable workspace tuple
-> read durable context-ready checkpoint and its v1 hash
-> mounted store read(hash)
-> parse/hash/canonical-byte verification
-> post-I/O remount and exact tuple verification
-> register one new current-process witness
-> pass that exact witness through the lexical runner
-> kernel consumes it once
```

The new witness has the same hash/workspace/mount diagnostics but distinct
object identity. An old-process witness is never serialized/restored; missing
checkpoint/artifact, changed high-water/context, corrupt bytes, tuple drift, or
old/structural identity rejects before runner/provider/H/handoff/terminal
effects.

Add exact-title RED
`fresh runtime rereads context-ready v1 and issues a new consumable witness`.
The test uses a persisted temporary portable workspace and a fresh module/
runtime instance with no prior WeakMap state, proves old and new witness
identity differ, consumes the new witness once, and proves the old/copy cannot
be consumed. Include it in the identical Task133.5 RED/GREEN command from
CF-1R11. If an isolated module graph is needed in-process, use Vitest module
reset plus dynamic import; no test-only production reset API is allowed.

### Third live fixture migration

Add `packages/agent/test/task-orchestrator-evidence-triage-live.test.ts` to the
atomic H.1/H.2 ownership. Replace its direct
`renderProductionSpecialistPrompt` / `prepareSpecialistRun` /
`invokeSpecialistModel` path with `runResidentSpecialistAcceptance` for
`evidence-triage`. It must use the same explicit portable workspace and
test-human approval policy as the other two live fixtures. No live fixture may
receive runtime model methods, prompt artifacts, provider proofs, admission
tokens, or private factory closures.

The three live files remain compile-only during H implementation. The later
coordinator-authorized live gate, and no earlier gate, is:

```bash
npm test -- packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts
```

### Complete integrated Task133 gate

This command replaces every earlier integrated Task133 command:

```bash
npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/task-orchestrator-events.test.ts packages/agent/test/task-orchestrator-projection.test.ts packages/agent/test/production-prompt-readback.test.ts packages/ontology/test/agent-contracts.test.ts packages/workspace-ops/test/projection-rebuild.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-context.test.ts packages/local-runtime/test/agent-prr-context-packs.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/agent-runtime-preapproval-prompt.test.ts && npm run typecheck && ! rg -n 'production-prompt-readback' packages/agent/src/index.ts && ! rg -n 'renderProductionSpecialistPrompt\(' packages/agent/src/specialist-runner-kernel.ts && ! rg -n 'renderExactlyBoundProductionSpecialistPrompt' packages/agent/src packages/agent/test && git diff --check && npm run factory:check
```

Expected: exit `0`, including fresh-runtime witness reissuance. No live or
provider-bearing test is selected.

### Complete Task140H non-live gate

This command replaces CF-1R7 and CF-1R8 H.4 commands and aggregates every
H.1-H.3 plus resident-acceptance suite:

```bash
npm test -- packages/agent/test/production-model-invocation-admission.test.ts packages/agent/test/production-specialist-invocation-proof.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/runtime.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/resident-specialist-acceptance.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts && npm run typecheck && ! rg -n 'runEvidenceTriageWorkflow|runPrrNegotiationWorkflow|prepareSpecialistRun|invokeSpecialistModel|runtime\.invokeModel|renderProductionSpecialistPrompt' packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts && ! rg -n 'production-model-invocation-admission|production-prompt-readback' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

Expected: exit `0`; all three live files are excluded while static checks prove
they have no direct workflow/kernel/model/render bypass. No provider/network/
credential activity is permitted.

### CF-1R12 review gate

Two fresh independent reviewers inspect exact full lineage
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`. Approval requires explicit
confirmation that restart issues a new mounted witness, all three live files
use resident acceptance, and the two complete aggregate commands include every
current suite and non-export/static assertion. Exactly two unqualified
Terra/xhigh approvals permit coordinator-only plan integration. Source/full/
live/credential/reset-credit/`neo`/self-integration/merge remain closed.

## CF-1R13 Explicit Approval Consumer And Smoke Source Gate

**Status:** This section supersedes CF-1R11 only where approval-admission
production/consumption ownership was implicit and CF-1R12 only where its static
gate omitted smoke source. It changes no other architecture. Source remains
frozen pending two fresh approvals of
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`.

### Package-internal approval-admission module

Add to Task140P ownership:

- Create `packages/agent/src/task-orchestrator-approval-admission.ts`
- Create `packages/agent/test/task-orchestrator-approval-admission.test.ts`
- Read only `packages/agent/src/index.ts`; the module must not be exported

The internal module owns the approval WeakMap, token construction, and the sole
consumer:

```ts
export interface TaskOrchestratorApprovalAdmission {
  readonly schemaVersion: "agent-task-orchestrator.approval-admission.v1";
  readonly approvalEventId: string;
  readonly promptArtifactHash: `sha256:${string}`;
  readonly providerPostureHash: `sha256:${string}`;
}

export function createTaskOrchestratorApprovalAdmission(input: {
  readonly approvalEventId: string;
  readonly proof: TaskOrchestratorProviderApprovalProof;
  readonly providerPostureHash: `sha256:${string}`;
}): TaskOrchestratorApprovalAdmission;

export function consumeTaskOrchestratorApprovalAdmission(
  admission: TaskOrchestratorApprovalAdmission,
  expected: ResolveApprovedPromptBindingFacts
): InternalTaskOrchestratorApprovalBinding | undefined;
```

`InternalTaskOrchestratorApprovalBinding` is exported only from this explicit
internal source module and contains the exact full proof/current preview needed
by R0; its structure is not authority. The approval adapter imports the create
function directly and calls it only after current approval inspection. The
local runtime factory imports the consume function and internal binding type by
`../../agent/src/task-orchestrator-approval-admission.js`; it passes the exact
admission from P plus exact hash facts. The module is absent from `index.ts`,
routes, DTOs, logs, and serialization. Consumption compares every diagnostic/
expected fact, deletes the WeakMap entry atomically, and succeeds once.

Add exact-title REDs
`creates admission only after current approval inspection`,
`internal consumer returns full proof only for exact identity and facts`,
`rejects structural copied swapped and reused approval admission`, and
`r0 imports the internal consumer without public index export`.

Task140P replaces its earlier RED and GREEN commands with this identical
command:

```bash
npm test -- packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
```

Expected P RED: exit `1` because the package-internal module is absent, current
approval inspection cannot create an identity-bound admission, or copied/
swapped/reused objects are accepted. After implementing only throwing
signatures, the identical command must remain RED on the valid admission and
consumer controls. Expected P GREEN: exit `0`, followed by:

```bash
npm run typecheck && ! rg -n 'task-orchestrator-approval-admission' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

Task140R0 replaces its earlier RED and GREEN commands with this identical
command:

```bash
npm test -- packages/agent/test/task-orchestrator-approval-admission.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
```

Expected R0 RED: exit `1` because the production factory does not import the
owned package-internal consumer, a copied token reaches the fixture, or the
valid exact admission cannot yield its full private binding once. Expected R0
GREEN: exit `0`, followed by:

```bash
npm run typecheck && ! rg -n 'task-orchestrator-approval-admission' packages/agent/src/index.ts && ! rg -n 'renderExactlyBoundProductionSpecialistPrompt' packages/local-runtime packages/agent/src packages/agent/test && git diff --check && npm run factory:check
```

The P commit owns the new module/test and approval-adapter call. The later R0
commit treats that module/test as read-only, modifies its already assigned
`agent-runtime-factory.ts` and runtime tests, and imports the consumer only by
the explicit internal source path. Both tasks stop for their required fresh
reviews after their exact GREEN gate. R0 receives the full proof only through
exact single-use identity.

### Complete Task140H non-live gate with smoke source inspection

This command replaces the complete CF-1R12 Task140H command. It retains every
H.1-H.3, approval-admission, resident-acceptance, route, recovery, and smoke
suite; excludes all three live tests; and makes every static/non-export
assertion executable in one final gate:

```bash
npm test -- packages/agent/test/production-model-invocation-admission.test.ts packages/agent/test/production-specialist-invocation-proof.test.ts packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/runtime.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/resident-specialist-acceptance.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts && npm run typecheck && ! rg -n 'runEvidenceTriageWorkflow|runPrrNegotiationWorkflow|prepareSpecialistRun|invokeSpecialistModel|runtime\.invokeModel|renderProductionSpecialistPrompt' packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts && rg -n 'runResidentSpecialistAcceptance' packages/local-runtime/src/agent-nous-smoke.ts && ! rg -n 'runtime\.invokeModel|renderProductionSpecialistPrompt|prepareSpecialistRun|invokeSpecialistModel|runEvidenceTriageWorkflow|runPrrNegotiationWorkflow' packages/local-runtime/src/agent-nous-smoke.ts && ! rg -n 'production-model-invocation-admission|production-prompt-readback|task-orchestrator-approval-admission' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

Expected: exit `0`. The smoke test behaviorally proves one injected resident
acceptance call and no alternate execution path. The positive source assertion
proves the production smoke entry delegates to that harness; the negative
assertion proves no direct model/renderer/kernel/workflow path remains. No
provider/network/credential activity is permitted.

### CF-1R13 review gate

Two fresh independent reviewers inspect exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`. Approval requires explicit
confirmation that R0's full proof comes only from the owned internal consumer,
the module is not index-exported, copied/reused tokens fail, and smoke source
both positively delegates and has no bypass. Exactly two unqualified
Terra/xhigh approvals permit coordinator-only plan integration. Source/full/
live/credential/reset-credit/`neo`/self-integration/merge remain closed.

## CF-1R14 Consume-Time Transport, Import Allowlist, And Canonical Handoff Gate

**Status:** This section supersedes CF-1R13's admission-construction API,
P/R0 test ownership and commands, and final H command. It also supersedes any
earlier wording that lets smoke build a prompt directly or leaves the
Task134A/135A preparation boundary implicit. All other latest-overlay
architecture remains current. Source stays frozen pending two fresh approvals
of `0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`.

### Consume-time inspection and exact private transport

The ordinary approval `inspect` remains status-only and never mints an
admission. Add a package-internal `inspectForPromptBinding` operation to the
existing approval adapter. Its input adds one exact-key-normalized
`ResolveApprovedPromptBindingFacts` object. The adapter snapshots and freezes
those facts before its first `await`, reruns the complete current approval and
preview inspection, checks every proof-derived diagnostic against the facts,
and only then calls:

```ts
export function createTaskOrchestratorApprovalAdmission(input: {
  readonly facts: ResolveApprovedPromptBindingFacts;
  readonly proof: TaskOrchestratorProviderApprovalProof;
}): TaskOrchestratorApprovalAdmission;
```

The module-private WeakMap binding contains the normalized full fact record,
the exact proof, and its current-preview input. `consume` first obtains the
binding and deletes the WeakMap entry, then compares every expected field:
task, attempt, run type, scope, approval event ID, prompt hash, ordered context
hashes, provider-posture hash, and credential-reference ID. Thus every consume
attempt burns an exact identity. A mismatch returns `undefined` without proof
exposure, and retrying that same object with corrected facts also fails. A new
admission requires a new consume-time current approval inspection.

All three existing execution paths—newly approved claim, resumed active claim,
and newly reclaimed suspended claim—converge on `dispatchApprovedRunner`.
After exact context-ready readback and before prompt-bound or runner-dispatching
append, that function derives the fact record from the current claim, approved
run, context checkpoint, scope, provider posture, and credential reference;
calls `inspectForPromptBinding`; and passes the returned exact
`approvalAdmission` directly as a private positional argument to Task140P's
`prepare(facts, admission)`. The registered R0 resolver consumes it immediately.
No caller stores it in policy, summary, checkpoint, projection, route result,
DTO, diagnostic, log, or serialized recovery state. Recovery repeats the same
flow and obtains a fresh object; the outer status-only inspection never creates
an abandoned token.

Add exact-title P REDs:

- `status inspection never mints prompt binding admission`
- `binding inspection mints only after current approval and normalized fact capture`
- `normal and resumed dispatch forward one exact admission after context readback`
- `one field mismatch burns exact admission before proof exposure`
- `copied structural swapped and reused admission never reaches resolver`

The P-owned `task-orchestrator-approval-admission.test.ts` tests module
creation/consumption only; it does not assert that the later R0 factory imports
the consumer. Task140P's identical RED and GREEN command is:

```bash
npm test -- packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
```

Expected RED: exit `1` because there is no consume-time binding inspection,
normal/resume dispatch does not carry an exact object, or mismatch does not burn
identity. Throwing signatures do not satisfy the valid controls. Expected
GREEN: exit `0`, followed by:

```bash
npm run typecheck && ! rg -n 'task-orchestrator-approval-admission' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

### R0 import allowlist and canonical preparation binder

Task140R0 additionally creates
`packages/local-runtime/test/task-orchestrator-approval-admission-imports.test.ts`.
That test walks production TypeScript imports and enforces this exact symbol
allowlist:

- the internal module defines both operations;
- only `packages/agent/src/task-orchestrator-approval.ts` imports
  `createTaskOrchestratorApprovalAdmission`;
- only `packages/local-runtime/src/agent-runtime-factory.ts` imports
  `consumeTaskOrchestratorApprovalAdmission`;
- type-only transport may mention `TaskOrchestratorApprovalAdmission` only in
  the internal module, approval adapter, handoff port, orchestrator, and runtime
  factory; and
- no package index, route, DTO, projection, status/summary, logger,
  serializer, or other production source imports the module or symbols.

Add exact-title R0 REDs
`r0 alone imports the internal approval consumer`,
`route dto log and serializer sources cannot import approval admission`, and
`r0 consumes full proof only after exact single use fact match`. These tests
are R0-owned and cannot appear in P's command.

The current program already contains reviewed/coordinator-integrated Task134A
merge `83a301d541e7fec5d0b29e6f2003566c06336158` and Task135A merge
`ac3f91901da0c9b23722a046be73d95746f691da`. Before Task140P starts, its claim
must also list the then-current reviewed/coordinator-integrated full SHAs for
Tasks136, 137, 138, and 139 and prove its base descends from every 132-139 SHA;
those future SHAs may not be replaced by a branch name, placeholder, or
candidate. R0 and H repeat that full prerequisite inventory plus each preceding
Task140 SHA.

R0 imports and captures
`createMountedSpecialistHandoffPreparationBinder` from the reviewed Task135A
module while constructing the factory-private runner closure. Prompt-binding
preparation does not call this handoff binder. After a registered runner later
returns the exact Task134A `UntrustedSpecialistHandoffPreparationV1`, the same
closed runner path invokes this one captured binder, reparses/recomputes its
`MountedSpecialistHandoffPreparationReadbackV1`, and makes only that data-only
readback available to H. No route or caller can supply a binder, store, or
readback; R0 creates no second codec/binder and performs no material/manifest
I/O or terminal append. H later consumes this exact closure and does not create
another binder.

Add exact-title R0 controls
`factory captures reviewed mounted preparation binder without public exposure`,
`registered runner path invokes canonical binder only for exact task134a preparation`,
and `lookalike stale or swapped preparation binder and readback fail before h`.
The valid control records one canonical binder call, canonical data-only
readback, and zero material/manifest/provider/H/terminal effects.

Task140R0's identical RED and GREEN command is:

```bash
npm test -- packages/agent/test/task-orchestrator-approval-admission.test.ts packages/local-runtime/test/task-orchestrator-approval-admission-imports.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/agent-handoff-projection.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
```

Expected RED: exit `1` on the absent sole-consumer import/allowlist, missing
factory-captured binder path, or valid exact admission control. Expected GREEN:
exit `0`, followed by:

```bash
npm run typecheck && ! rg -n 'task-orchestrator-approval-admission' packages/agent/src/index.ts && ! rg -n 'renderExactlyBoundProductionSpecialistPrompt' packages/local-runtime packages/agent/src packages/agent/test && git diff --check && npm run factory:check
```

### Thin smoke and complete H non-live gate

`agent-nous-smoke.ts` becomes a thin CLI adapter over
`runResidentSpecialistAcceptance`. Remove its imports and calls of
`buildLocalRuntimeStatusPromptArtifact`, `createSqlitePrrRuntime`,
`defaultLocalAgentRuntimeFactory`, and every direct runtime model/workflow/
renderer/kernel operation. It may allocate an explicit temporary portable root
and perform provider-settings preflight, but resident acceptance alone creates,
mounts, approves under the explicit acceptance fixture, and executes. No
`.cestus/local/prompt-artifacts` path or internal-disk fallback is reachable.

Add exact-title smoke RED
`smoke delegates once to resident acceptance without status prompt builder or fallback`.
The deterministic test injects one resident-acceptance spy, asserts exactly one
call with the explicit portable root, and asserts zero direct runtime factory,
prompt-builder, provider, and internal-path activity. Mount/approval failure
controls remain fail-closed.

This command replaces every earlier Task140H non-live command:

```bash
npm test -- packages/agent/test/production-model-invocation-admission.test.ts packages/agent/test/production-specialist-invocation-proof.test.ts packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/runtime.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/local-runtime/test/task-orchestrator-approval-admission-imports.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/agent-handoff-projection.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/resident-specialist-acceptance.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts && npm run typecheck && ! rg -n 'runEvidenceTriageWorkflow|runPrrNegotiationWorkflow|prepareSpecialistRun|invokeSpecialistModel|runtime\.invokeModel|renderProductionSpecialistPrompt' packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts && rg -n 'runResidentSpecialistAcceptance' packages/local-runtime/src/agent-nous-smoke.ts && ! rg -n 'runtime\.invokeModel|renderProductionSpecialistPrompt|prepareSpecialistRun|invokeSpecialistModel|runEvidenceTriageWorkflow|runPrrNegotiationWorkflow|buildLocalRuntimeStatusPromptArtifact|createSqlitePrrRuntime|defaultLocalAgentRuntimeFactory|\.cestus/local/prompt-artifacts' packages/local-runtime/src/agent-nous-smoke.ts && ! rg -n 'production-model-invocation-admission|production-prompt-readback|task-orchestrator-approval-admission' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

Expected: exit `0`; the canonical preparation/binder/projection chain is in the
aggregate, smoke delegates only to resident acceptance, all live tests remain
excluded, and no provider/network/credential activity occurs.

### CF-1R14 review gate

Two fresh independent Terra/xhigh reviewers inspect exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`. They must explicitly
confirm P's GREEN has no R0 dependency; normalized facts are captured before
await and mismatch burns identity; all normal/resume paths converge on one
consume-time inspection; imports are exactly allowlisted; future 136-139 SHAs
are hard dispatch prerequisites; R0/H cover and use the reviewed canonical
Task134A/135A preparation boundary; and smoke has no builder/fallback bypass.
Exactly two unqualified approvals permit coordinator-only plan integration.
Source/full/live/credential/reset-credit/`neo`/self-integration/merge remain
closed.

## CF-1R15 Portable Store Producer, Executable Ancestry, And Deep Snapshot Gate

**Status:** This section supersedes CF-1R14 where proof material was not
snapshotted before await, its three dispatch paths shared one RED, Task135A had
no production authority/store producer, prerequisite ancestry was prose-only,
and live-fixture static checks lacked per-file positive assertions. It preserves
all other CF-1R14 ownership and commands only where this section does not
replace them. Source remains frozen pending two fresh approvals of
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`.

### Task135B — portable mounted handoff-store producer

Task135B is a new serialized R prerequisite after reviewed Task135A and before
Tasks137, 138, 140P, 140R0, and 140H. It may implement in parallel with the
Task133.1-.3 atomic migration because their files are disjoint.

**Files:**

- Create `packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts`
- Create `packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`
- Create `docs/agentic/claims/task-135b-portable-mounted-handoff-stores.md`
- Read only `packages/local-runtime/src/mounted-agent-artifact-stores.ts`
- Read only `packages/local-runtime/src/portable-workspace-lifecycle.ts`
- Read only `packages/local-runtime/src/runtime-factory.ts`
- Read only `packages/local-runtime/src/agent-runtime-context-packs.ts`
- Read only `packages/local-runtime/src/agent-runtime-factory.ts`
- Read only `packages/local-runtime/src/index.ts`; no new producer is exported

The non-indexed module owns this sole production constructor:

```ts
interface PortableMountedAgentArtifactStoreProducerInput {
  readonly configSource: ResolvedLocalRuntimeConfig;
  readonly mountedWorkspaceSource: MountedPortableWorkspace;
  readonly authoritySource: MountedPreparationAuthority;
  readonly reverifyAuthority: (
    expected: MountedPreparationAuthority
  ) => Promise<MountedPreparationAuthority>;
}

interface BindPortableMountedAgentHandoffInput {
  readonly taskId: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
  readonly runType: string;
}

interface PortableMountedAgentHandoffBinding {
  readonly schemaVersion: "portable-mounted-agent-handoff-binding.v1";
  readonly preparationBinder: MountedSpecialistHandoffPreparationBinder;
  readonly materialStore: SpecialistHandoffManifestStore;
  readonly manifestStore: SpecialistHandoffManifestStore;
}

export function createPortableMountedAgentArtifactStoreProducer(
  input: PortableMountedAgentArtifactStoreProducerInput
): {
  bind(input: BindPortableMountedAgentHandoffInput):
    Promise<PortableMountedAgentHandoffBinding>;
};
```

The producer accepts only the actual portable `ResolvedLocalRuntimeConfig`,
the exact `LocalRuntimeHandle.mountedWorkspace`, and Task132/137 factory-held
current authority plus its private revalidator. It rejects nonportable storage,
unknown/accessor keys, a structural revalidator, empty or mismatched IDs, and
root/workspace/path/authority divergence before constructing a binding. It
deep-snapshots the portable root, expected workspace ID, full mounted tuple,
and authority source before await; it never accepts a path, store, binder, or
mount ID from a route or task command.

`bind` revalidates authority, remounts through `mountPortableWorkspace`, and
requires exact workspace ID, resolved root, ledger/blob/derivative paths, mount
instance, identity event, policy, and high-water equality. It creates two
distinct path-hiding `SpecialistHandoffManifestStore` wrappers rooted only at
freshly remounted
`derivativeRoot/agent-handoffs/materials` and
`derivativeRoot/agent-handoffs/manifests`, then passes those exact stores and
authority to Task135A's one canonical
`createMountedSpecialistHandoffPreparationBinder`. Immediately before and
after every material/manifest `put` or `get`, each wrapper revalidates authority
and remounts/compares the same complete tuple. It constructs a fresh
`FileBlobStore` only from that operation's freshly returned derivative root,
strips returned paths, and exposes hashes/byte counts only. There is no cwd,
internal-disk, in-memory, shared material/manifest, stale-handle, or outage
fallback. A post-I/O authority loss may leave only an unreferenced
content-addressed orphan; it returns no authoritative receipt and permits no
ledger/H/terminal effect.

Add exact-title REDs:

- `refuses nonportable handle before creating handoff stores`
- `revalidates authority and complete mount tuple before and after every handoff io`
- `creates distinct portable material and manifest stores without exposing paths`
- `rejects root mount authority high water and store role swaps without fallback`
- `fresh process reconstructs stores only from remounted authority and hash readback`
- `post io authority loss returns no receipt or handoff authority`

Task135B's identical RED/GREEN command is:

```bash
npm test -- packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/agent/test/specialist-handoff-preparation.test.ts
```

Expected RED: exit `1` because the producer module is absent; a throwing
skeleton remains RED on the valid portable bind/restart controls. Expected
GREEN: exit `0`, followed by:

```bash
npm run typecheck && ! rg -n 'portable-mounted-agent-artifact-stores' packages/local-runtime/src/index.ts && ! rg -n '\.cestus|process\.cwd|internal.*fallback' packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts && git diff --check && npm run factory:check
```

The claim freezes Task125
`2e5c35ab7bca33df9f1a0c482c496fbb93350086`, Task132A
`7ec1eb6885716ac7324839c578677366fe1bb244`, Task134A merge
`83a301d541e7fec5d0b29e6f2003566c06336158`, Task135A merge
`ac3f91901da0c9b23722a046be73d95746f691da`, exact dispatch base, RED/GREEN,
and explicit coordinator approval of `superpowers:subagent-driven-development`.
Task137's cross-lane gate adds the new producer suite and proves invalidation
blocks its stores; Task138 rebases Task135B before projection; Task140R0 is the
sole later importer. Task135B edits no factory, route, H, ledger, or existing
Task135A source.

### Task135C — strict factory prerequisite manifest checker

Task135C is a disjoint factory-support task that may run in parallel with
Task135B and Task133. It must integrate before Task140P.

**Files:**

- Create `scripts/check-resident-task-prerequisites.mjs`
- Create `scripts/check-resident-task-prerequisites.test.mjs`
- Create `docs/agentic/claims/task-135c-resident-prerequisite-checker.md`

The CLI command is exactly:

```bash
node scripts/check-resident-task-prerequisites.mjs --task <task140p|task140r0|task140h> --phase <preflight|review> --manifest <path>
```

It strict-parses `resident-task140-prerequisites.v1`: exactly one
`dispatchBaseSha`, one task name, and an exact-key map of named 40-character
lowercase prerequisite commit SHAs. P requires CF-1 plus Tasks120-139 including
135B/135C; R0 adds Task140P; H adds Task140P and Task140R0. It rejects missing,
extra, duplicate, abbreviated, symbolic, non-commit, or wrong-task values. For
every entry it requires `git rev-parse <sha>^{commit}` to equal the literal and
`git merge-base --is-ancestor <sha> <dispatchBaseSha>` to exit `0`.
`preflight` additionally requires current `HEAD` to equal `dispatchBaseSha`;
`review` requires the base to be an ancestor of current `HEAD`.

Before each P/R0/H worker starts, the coordinator creates that task's JSON
manifest and claim in the fresh worktree with literal integrated SHAs, runs the
exact `preflight` command while `HEAD` is still the untouched dispatch base,
records its output, and specifically approves subagent-driven development. The
worker may not edit the manifest. The final precommit gate reruns `preflight`;
fresh review reruns `review`. A failed checker blocks dispatch, commit review,
and integration.

Add causal tests using temporary Git repositories for the valid control and
each rejected schema/ref/ancestry/head/task case. Task135C's identical
RED/GREEN command is:

```bash
npm test -- scripts/check-resident-task-prerequisites.test.mjs
```

Expected RED: exit `1` because the checker is absent. Expected GREEN: exit `0`,
followed by `git diff --check && npm run factory:check`. Commit only the three
owned files and stop for fresh review.

### Deep pre-await approval snapshot and three causal dispatch rows

`inspectForPromptBinding` exact-key normalizes and deep-clones one complete
`TaskOrchestratorApprovalAdmissionSnapshot` before its first `await`. The
snapshot includes facts, every proof field, credential reference, provider
readiness, exact prompt envelope/text/manifest/context refs, and complete
current-preview input. Arrays and nested own-data objects are dense, prototype-
safe, accessor-free, recursively frozen copies. Current approval/preview
revalidation and admission minting use only this snapshot, never the caller's
objects after await. Creation receives the already frozen snapshot:

```ts
export function createTaskOrchestratorApprovalAdmission(input: {
  readonly snapshot: TaskOrchestratorApprovalAdmissionSnapshot;
}): TaskOrchestratorApprovalAdmission;
```

Add exact-title RED
`mutation during approval await cannot change facts proof envelope or preview`.
Its table mutates each top-level and nested family while preview rebuilding is
suspended; the operation either validates the original snapshot and mints that
binding or fails closed, but never validates/mints mutated bytes or metadata.

Replace the aggregate dispatch title with three exact P titles:

- `newly approved claim reads context then inspects and forwards one fresh admission`
- `resumed active claim reads context then inspects and forwards one fresh admission`
- `reclaimed suspended claim reads context then inspects and forwards one fresh admission`

Each test observes the exact trace `context.readback -> binding.inspect ->
port.prepare -> r0.consume`, proves a distinct fresh identity, consumes it
once, burns it on a one-field mismatch, and records zero prompt-bound/
runner/provider/H/terminal effects before successful inspection. These titles,
the mutation-during-await test, and all CF-1R14 P tests use CF-1R14's identical
P RED/GREEN command.

### R0 exact producer input and serialized consumption

Task140R0 adds Task135B/135C and future 136-139 literal SHAs to its checked
manifest. Its preflight begins with:

```bash
node scripts/check-resident-task-prerequisites.mjs --task task140r0 --phase preflight --manifest docs/agentic/claims/task-140-r0-prerequisites.json
```

The factory is the sole importer of
`createPortableMountedAgentArtifactStoreProducer`. It supplies only its lexical
`LocalRuntimeHandle` config/mounted workspace and the exact factory-held
Task132/137 authority source/revalidator. Missing Task135B output blocks factory
composition. R0 calls producer `bind` with exact claim/attempt/approved-run/type,
captures the returned Task135A binder plus distinct stores in the private
runner closure, and exposes none publicly. Prompt binding never invokes the
handoff binder. After runner preparation, H consumes that same closure; there
is no caller-supplied store, raw path, fallback, or second binder.

Add exact-title R0 REDs
`factory refuses missing portable mounted handoff store producer`,
`factory binds only current task135b authority and distinct stores`, and
`swapped producer binding blocks before prompt receipt runner and h`.
CF-1R14's R0 command adds
`packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`.
Its GREEN gate begins with the exact preflight above and otherwise remains the
complete CF-1R14 R0 gate. H uses the analogous `task140h` preflight/manifest and
its aggregate adds the Task135B producer suite.

### Per-live-file resident acceptance assertions

Replace the live-file static clause in the complete H gate with all of:

```bash
rg -n 'runResidentSpecialistAcceptance' packages/agent/test/evidence-triage-nous-live.test.ts && rg -n 'runResidentSpecialistAcceptance' packages/agent/test/prr-negotiation-nous-live.test.ts && rg -n 'runResidentSpecialistAcceptance' packages/agent/test/task-orchestrator-evidence-triage-live.test.ts && ! rg -n 'createAgentRuntime|createTaskOrchestrator|createTaskOrchestratorProviderApprovalAdapter|defaultLocalAgentRuntimeFactory|createSqlitePrrRuntime|runEvidenceTriageWorkflow|runPrrNegotiationWorkflow|prepareSpecialistRun|invokeSpecialistModel|runtime\.invokeModel|renderProductionSpecialistPrompt|buildLocalRuntimeStatusPromptArtifact' packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts
```

Each live fixture also has a compile-time/deterministic adapter test proving one
call to resident acceptance with an explicit portable root and no direct
runtime/factory/provider construction. The live tests themselves remain
excluded from all non-live commands. The complete H command otherwise remains
CF-1R14's aggregate with the Task135B suite added; it begins with:

```bash
node scripts/check-resident-task-prerequisites.mjs --task task140h --phase preflight --manifest docs/agentic/claims/task-140-h-prerequisites.json
```

and then runs the aggregate plus the per-file clause above, smoke positive/
negative assertions, private-module non-export checks, diff check, and factory
readiness. No provider/network/credential activity is permitted.

### CF-1R15 implementation order and review gate

After plan integration, Task133.1-.3 atomic, Task135B, and Task135C may start in
parallel. Task133.5 follows Task133.1-.3. Tasks136/139 wait for reviewed Task133
as already specified; Task137/138 wait for reviewed Task135B; Task140P waits for
reviewed/integrated 132-139 plus Task135B/C and a passing manifest preflight;
then R0 and H remain serialized. Every implementation dispatch message must
specifically approve `superpowers:subagent-driven-development`.

Two fresh independent Terra/xhigh reviewers inspect exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`. Approval requires explicit
confirmation that Task135B has one portable producer with actual factory-held
authority, no shadow/fallback store, and exact R0 input; Task135C makes all
future SHA/ancestry gates executable; proof bytes and metadata are snapshotted
before await; all three dispatch call sites have causal rows; and every live
fixture positively uses resident acceptance and forbids direct runtime
construction. Exactly two unqualified approvals permit coordinator-only plan
integration. Source/full/live/credential/reset-credit/`neo`/self-integration/
merge remain closed.

## CF-1R15A Executable Producer And Self-Contained Gate Correction

**Status:** This append-only correction supersedes CF-1R15 only where that
section named a nonexistent local-runtime index, placed a test outside the
Vitest include path, accepted a caller-constructed `MountedPreparationAuthority`,
used an ambiguous prerequisite key inventory, or referred to inherited P/R0/H
commands. All other CF-1R15 requirements remain current. Source remains frozen
pending two fresh independent approvals of
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`.

### Task135B owns authority and store production

Task135B does not read or name `packages/local-runtime/src/index.ts`; that file
does not exist. Replace CF-1R15's producer input with:

```ts
interface PortableMountedAgentArtifactStoreProducerInput {
  readonly configSource: ResolvedLocalRuntimeConfig;
  readonly mountedWorkspaceSource: MountedPortableWorkspace;
  readonly mountedFactsSource: PortableWorkspaceMountedFactsPort;
  readonly workspaceAuthoritySource: WorkspaceAvailabilityAuthority;
}
```

The factory supplies the exact lexical config, mounted workspace, mounted-facts
port, and lifecycle authority that Tasks132/137 compose. No route, command,
specialist, or structural revalidator supplies any of them. On producer
construction, `bind`, and before and after every store operation, Task135B:

1. exact-key deep-snapshots the portable config and mounted workspace;
2. calls the captured authority's `revalidate` with the expected workspace ID;
3. reads the captured mounted-facts port;
4. remounts with `mountPortableWorkspace` from the captured portable root; and
5. requires one identical workspace/root/path, identity-event, mount-instance,
   policy, and high-water tuple across all three current readbacks.

Only after those checks does Task135B construct the Task135A
`MountedPreparationAuthority` itself from the accepted mounted facts
(`sourceHighWaterMark` is the exact `highWaterOrdinal`), construct the two
distinct path-hiding stores from the freshly remounted derivative root, and
construct the canonical binder. A failed/revoked authority, changed facts,
remount mismatch, accessor, structural lookalike, or invalidation during I/O
fails closed. The factory-held authority object and mounted-facts port are
captured by identity and never returned.

Add exact-title REDs:

- `derives task135a authority only from current factory held lifecycle readback`
- `rejects caller constructed authority revalidator and mounted facts lookalikes`
- `allows only agent runtime factory to import portable producer`

The import-boundary test walks every production TypeScript source. It permits
zero importers before R0 and, after R0, exactly one importer:
`packages/local-runtime/src/agent-runtime-factory.ts`. It rejects package-index,
route, DTO, status, serializer, test-helper, and all other production imports.
It therefore remains green both before and after the authorized R0 integration.

Task135B's complete identical RED/GREEN command remains:

```bash
npm test -- packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/agent/test/specialist-handoff-preparation.test.ts
```

Its complete post-GREEN gate is:

```bash
npm run typecheck && ! rg -n 'process\.cwd|\.cestus/local|internal-storage|in-memory-fallback|fallbackRoot' packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts && git diff --check && npm run factory:check
```

The only Task135B source creation remains
`packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts`; no
existing source or package export is edited.

### Task135C test path and exact manifest inventory

Replace the Task135C test file with the Vitest-selected
`packages/local-runtime/test/check-resident-task-prerequisites.test.ts`. Its
complete owned files are exactly that test,
`scripts/check-resident-task-prerequisites.mjs`, and
`docs/agentic/claims/task-135c-resident-prerequisite-checker.md`. Its identical
RED/GREEN command is:

```bash
npm test -- packages/local-runtime/test/check-resident-task-prerequisites.test.ts
```

For `task140p`, the exact prerequisite-map keys are:

```text
cf1, task120, task121, task122, task123, task124, task125, task126, task127,
task128, task129, task130, task132a, task133, task134a, task135a, task135b,
task135c, task136, task137, task138, task139
```

`task140r0` requires that exact set plus `task140p`; `task140h` requires the P
set plus `task140p` and `task140r0`. No Task131, generic range, alias, duplicate,
or extra key is accepted. Each value is a literal lowercase 40-character commit
SHA whose object resolves exactly to itself and is an ancestor of the manifest's
literal `dispatchBaseSha`.

The coordinator creates the manifest and initial claim as uncommitted files in
the fresh task worktree while `HEAD` still equals the dispatch base. The worker
may append evidence to the claim but must never edit the manifest. `preflight`
runs before RED and again with implementation still uncommitted immediately
before commit, so `HEAD === dispatchBaseSha` remains true. After the worker
commit, every fresh reviewer runs `review`, which requires the dispatch base to
be an ancestor of current `HEAD`. Any manifest diff or checker failure rejects
review and integration.

### Task137 cross-lane invalidation gate

Task137's dependency row is superseded to require reviewed/integrated Task135B
in addition to Tasks124, 125, and 132-135A. Add exact-title RED
`authority invalidation blocks portable handoff store io without fallback or receipt`.
Task137's complete cross-lane GREEN command is:

```bash
npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/agent/test/wake-supervisor.test.ts
```

The test uses the real Task135B producer with Task137's factory-held authority,
invalidates that authority during each before/after-I/O boundary, and proves no
receipt, handoff authority, fallback write, provider call, H effect, or terminal
effect. Task138 also rebases the reviewed Task135B integration before starting.

### Self-contained Task140P gate

The coordinator must run this exact preflight before dispatch and as the first
line of the uncommitted precommit gate:

```bash
node scripts/check-resident-task-prerequisites.mjs --task task140p --phase preflight --manifest docs/agentic/claims/task-140-p-prerequisites.json
```

Task140P's complete identical RED/GREEN test command is:

```bash
npm test -- packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
```

Its complete uncommitted post-GREEN gate is:

```bash
node scripts/check-resident-task-prerequisites.mjs --task task140p --phase preflight --manifest docs/agentic/claims/task-140-p-prerequisites.json && npm test -- packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts && npm run typecheck && ! rg -n 'task-orchestrator-approval-admission' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

The three exact newly-approved, resumed-active, and reclaimed-suspended causal
test titles from CF-1R15 are mandatory separate tests in that command; one table
or aggregate assertion does not satisfy them.

### Self-contained Task140R0 gate

The coordinator must run this exact preflight before dispatch and as the first
line of the uncommitted precommit gate:

```bash
node scripts/check-resident-task-prerequisites.mjs --task task140r0 --phase preflight --manifest docs/agentic/claims/task-140-r0-prerequisites.json
```

Task140R0's complete identical RED/GREEN test command is:

```bash
npm test -- packages/agent/test/task-orchestrator-approval-admission.test.ts packages/local-runtime/test/task-orchestrator-approval-admission-imports.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/agent-handoff-projection.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
```

Its complete uncommitted post-GREEN gate is:

```bash
node scripts/check-resident-task-prerequisites.mjs --task task140r0 --phase preflight --manifest docs/agentic/claims/task-140-r0-prerequisites.json && npm test -- packages/agent/test/task-orchestrator-approval-admission.test.ts packages/local-runtime/test/task-orchestrator-approval-admission-imports.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/agent-handoff-projection.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts && npm run typecheck && ! rg -n 'task-orchestrator-approval-admission' packages/agent/src/index.ts && ! rg -n 'renderExactlyBoundProductionSpecialistPrompt' packages/local-runtime packages/agent/src packages/agent/test && git diff --check && npm run factory:check
```

R0's import-boundary suite must additionally enforce that
`agent-runtime-factory.ts` is the sole production importer of both the approval
consumer and Task135B producer, while the two private modules remain absent from
every public route, DTO, serializer, status surface, and package index.

### Self-contained Task140H non-live gate

The coordinator must run this exact preflight before dispatch and as the first
line of the uncommitted precommit gate:

```bash
node scripts/check-resident-task-prerequisites.mjs --task task140h --phase preflight --manifest docs/agentic/claims/task-140-h-prerequisites.json
```

This single command replaces every earlier Task140H non-live command:

```bash
node scripts/check-resident-task-prerequisites.mjs --task task140h --phase preflight --manifest docs/agentic/claims/task-140-h-prerequisites.json && npm test -- packages/agent/test/production-model-invocation-admission.test.ts packages/agent/test/production-specialist-invocation-proof.test.ts packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/runtime.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/local-runtime/test/task-orchestrator-approval-admission-imports.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/agent-handoff-projection.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/resident-specialist-acceptance.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts && npm run typecheck && rg -n 'runResidentSpecialistAcceptance' packages/agent/test/evidence-triage-nous-live.test.ts && rg -n 'runResidentSpecialistAcceptance' packages/agent/test/prr-negotiation-nous-live.test.ts && rg -n 'runResidentSpecialistAcceptance' packages/agent/test/task-orchestrator-evidence-triage-live.test.ts && ! rg -n 'createAgentRuntime|createTaskOrchestrator|createTaskOrchestratorProviderApprovalAdapter|defaultLocalAgentRuntimeFactory|createSqlitePrrRuntime|runEvidenceTriageWorkflow|runPrrNegotiationWorkflow|prepareSpecialistRun|invokeSpecialistModel|runtime\.invokeModel|renderProductionSpecialistPrompt|buildLocalRuntimeStatusPromptArtifact' packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts && rg -n 'runResidentSpecialistAcceptance' packages/local-runtime/src/agent-nous-smoke.ts && ! rg -n 'runtime\.invokeModel|renderProductionSpecialistPrompt|prepareSpecialistRun|invokeSpecialistModel|runEvidenceTriageWorkflow|runPrrNegotiationWorkflow|buildLocalRuntimeStatusPromptArtifact|createSqlitePrrRuntime|defaultLocalAgentRuntimeFactory|\.cestus/local/prompt-artifacts' packages/local-runtime/src/agent-nous-smoke.ts && ! rg -n 'production-model-invocation-admission|production-prompt-readback|task-orchestrator-approval-admission' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

No live test is selected by this command. Positive static checks are separate
for all three live files, and direct runtime/orchestrator/factory/workflow/model
construction is banned in each. No provider, network, credential, Nous, full
verify, reset-credit, `neo`, self-integration, or merge action is authorized.

### CF-1R15A dispatch and review rule

After two fresh unqualified approvals and coordinator-only plan integration,
Task133.1-.3, Task135B, and Task135C may start in parallel. Task137 and Task138
wait for reviewed/integrated Task135B. P waits for every exact manifest
prerequisite; R0 waits for P; H waits for R0. Every implementation dispatch
message must explicitly state that the coordinator approves use of
`superpowers:subagent-driven-development`; a generic approval is insufficient.

## CF-1R16 Opaque Admission Operation, Immutable Dispatch, And Causal Adapter Gate

**Status:** This append-only correction supersedes CF-1R15/15A where Task135B
accepted public structural lifecycle sources, could request a later admission,
or preceded the operation that authorizes its I/O; where dispatch manifests
were uncommitted or mutable; where the private H registrar lacked a causal
sole-import test; and where live-file text search could pass without an actual
resident-acceptance call. All other CF-1R15A commands and CF-1R15 deep-snapshot
requirements remain current only where this section does not replace them.
Source remains frozen pending two fresh approvals of
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`.

### Corrected dependency graph

```text
Task133.1-.3 atomic -------------------------------> Task133.5

Task124 + Task125 + Task132A + Task134A + Task135A
  -> Task137A opaque current-admission operation
  -> Task135B portable mounted handoff stores
  -> Task137B wake runtime assembly and issuer registration
  -> Task138 mounted handoff projection

Task135C immutable prerequisite checker ------------------------------+
Task133.5 + Task136 + Task137B + Task138 + Task139 + all earlier rows -+
  -> Task140P -> Task140R0 -> Task140H -> Task140R1
```

Task137 no longer waits for Task135B as one indivisible task. Task137A is the
only pre-Task135B W slice; Task137B completes the original Task137 deliverable
after Task135B. Task138 waits for reviewed/integrated Task135B and Task137B.
Task140P requires both reviewed Task137 commits. Task135B and Task133 do not run
in parallel: Task137A waits for the already integrated 132-135A base, Task135B
waits for Task137A, and Task137B waits for Task135B. Task135C remains disjoint
and may run while Task133 or Task137A runs.

### Task137A - exact current-admission operation

**Files:**

- Modify `packages/local-runtime/src/portable-workspace-lifecycle.ts`
- Modify `packages/local-runtime/test/portable-workspace-lifecycle.test.ts`
- Create `packages/local-runtime/src/mounted-artifact-authority-operation.ts`
- Create `packages/local-runtime/test/mounted-artifact-authority-operation.test.ts`
- Create `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
- Create `docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md`

Task137A adds a source-path-only Task125 inspector for the exact
`PortableWorkspaceLifecyclePorts` object produced by
`createPortableWorkspaceLifecyclePorts`. The inspector takes only that bundle,
looks up the currently active Task125-issued `WorkspaceAdmissionSnapshot` in a
module-private WeakMap, requires its exact identity/generation/revision and
verified lease, requires no unresolved pending outage/reconciliation, and
returns the exact admission plus a fresh frozen copy of its associated
`PortableWorkspaceMountedFacts`. It does not accept an admission from its
caller and does not revalidate, remount, acquire a lease, append, or issue a new
admission. Task125 records its actual port bundle/current admission in
module-private WeakSets/WeakMaps; a structural copy or caller-authored port
bundle fails before any mounted reader, lease, reconciliation, filesystem, or
store call.

The new non-indexed module owns these internal interfaces:

```ts
export interface MountedArtifactAuthorityOperation {
  readonly schemaVersion: "mounted-artifact-authority-operation.v1";
}

export interface MountedArtifactAuthoritySnapshot {
  readonly schemaVersion: "mounted-artifact-authority-snapshot.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workspaceIdentityEventId: string;
  readonly mountEvidenceId: string;
  readonly authorityEvidenceId: string;
  readonly ledgerStoreEvidenceId: string;
  readonly artifactStoreEvidenceId: string;
  readonly derivativeStoreEvidenceId: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly highWaterMark: string;
  readonly highWaterOrdinal: number;
  readonly admissionGenerationId: string;
}

export function registerMountedArtifactAuthorityIssuerForWakeRuntime(input: {
  readonly wakeRuntime: object;
  readonly lifecyclePorts: PortableWorkspaceLifecyclePorts;
}): void;

export function issueMountedArtifactAuthorityOperationForFactory(
  wakeRuntime: object
): MountedArtifactAuthorityOperation;

export function inspectMountedArtifactAuthorityOperation(
  operation: MountedArtifactAuthorityOperation
): MountedArtifactAuthoritySnapshot;
```

These are source-path exports only and are absent from every package index.
The module stores the exact runtime, exact Task125 bundle, exact active
admission returned at issuance, and operation identity in private WeakMaps.
Registration verifies only the actual Task125 bundle and creates no authority.
Issuance calls Task125's source-path current-admission inspector, blocks when no
complete admission is active, creates one fresh frozen one-field identity, and
snapshots that exact admission/facts pair. Inspection looks up that exact
identity and reruns the same current-admission check against the captured
admission; a copied, spread, serialized, structurally equal, foreign-runtime,
or already burned object fails. Any later Task125 revalidation replaces the
active admission, so the old operation fails even when every workspace tuple
field is unchanged. Every Task125 invalidation reason, including shutdown,
burns the old operation permanently. A new operation can be issued only after
a complete later revalidation; a fresh process uses a separately registered
wake-runtime identity.

Add exact-title REDs:

- `rejects a structural lifecycle bundle before mounted authority activity`
- `old operation cannot revive after identical tuple revalidation`
- `shutdown authority loss and admission mismatch permanently burn operation identity`
- `fresh post recovery admission mints a distinct operation after full readback`
- `copied serialized and foreign runtime operations fail before store io`
- `only wake runtime may register and only agent runtime factory may issue authority operations`
- `only portable mounted store producer may inspect authority operations`

The import test walks every production TypeScript source. The only permitted
registrar importer is `packages/local-runtime/src/wake-supervisor-runtime.ts`;
the only permitted issuer importer is
`packages/local-runtime/src/agent-runtime-factory.ts`; the only permitted
inspection importer is
`packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts`. Before
those later files import the symbols, zero matching importers is valid. Package
indexes, routes, DTOs, status/projector modules, serializers, tests-as-runtime
helpers, and every other production file are forbidden.

Task137A's identical RED/GREEN command is:

```bash
npm test -- packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/agent/test/wake-supervisor.test.ts
```

Expected RED: exit `1` because the operation module and Task125 current-
admission inspector are absent. Expected GREEN: exit `0`, followed by:

```bash
npm run typecheck && test ! -e packages/local-runtime/src/index.ts && ! rg -n 'mounted-artifact-authority-operation' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

Task137A commits only its six owned files and stops for fresh review.

### Task135B - operation-bound portable mounted stores

Replace every earlier Task135B constructor/input with:

```ts
interface PortableMountedAgentArtifactStoreProducerInput {
  readonly configSource: ResolvedLocalRuntimeConfig;
  readonly mountedWorkspaceSource: MountedPortableWorkspace;
}

interface BindPortableMountedAgentHandoffInput {
  readonly authorityOperation: MountedArtifactAuthorityOperation;
  readonly taskId: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
  readonly runType: string;
}

export function createPortableMountedAgentArtifactStoreProducer(
  input: PortableMountedAgentArtifactStoreProducerInput
): {
  bind(input: BindPortableMountedAgentHandoffInput):
    Promise<PortableMountedAgentHandoffBinding>;
};
```

Task135B accepts no mounted-facts port, `WorkspaceAvailabilityAuthority`,
revalidator, lifecycle bundle, callback, inspector, `MountedPreparationAuthority`,
path, store, admission, or admission generation from its caller. On producer
construction it exact-key snapshots the portable config and mounted workspace.
On `bind`, immediately before and after every material/manifest `put` or `get`,
it calls only `inspectMountedArtifactAuthorityOperation` with the same exact
operation identity. It never calls Task125 `revalidate` and therefore can never
replace or revive the captured admission.

Each inspection must equal the original operation snapshot and the freshly
remounted workspace root, workspace ID, canonical ledger/blob/derivative paths,
mount instance, identity/mount/authority/store evidence, policy/lock digests,
and high-water tuple. Only then may Task135B derive Task135A's data-only
`MountedPreparationAuthority`, create distinct path-hiding material/manifest
stores below the remounted derivative root, and call the canonical Task135A
binder. If authority is invalidated during an awaited I/O, the post-I/O
inspection fails. The content-addressed write may remain an unreferenced orphan,
but no store receipt, binder readback, H input, ledger event, or terminal effect
is returned. A fresh later operation creates a fresh binding; the old one never
works again.

Add or replace exact-title REDs:

- `accepts only a task137a opaque authority operation`
- `forged structural authority operation fails before remount and store io`
- `old operation cannot revive after same tuple revalidation`
- `invalidation during material put and get returns no receipt or authority`
- `invalidation during manifest put and get returns no receipt or authority`
- `fresh recovery operation reconstructs distinct stores from full remount readback`
- `rejects root mount evidence policy lock high water and store role swaps without fallback`
- `creates distinct portable material and manifest stores without exposing paths`

Task135B's identical RED/GREEN command is:

```bash
npm test -- packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/agent/test/specialist-handoff-preparation.test.ts
```

Expected RED: exit `1` because the producer is absent. Expected GREEN: exit
`0`, followed by:

```bash
npm run typecheck && ! rg -n 'revalidate|WorkspaceAvailabilityAuthority|PortableWorkspaceMountedFactsPort|MountedPreparationAuthority.*input|process\.cwd|\.cestus/local|internal-storage|in-memory-fallback|fallbackRoot' packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts && git diff --check && npm run factory:check
```

### Task137B - wake runtime registration and actual production path

Task137B owns the original Task137 files and claim after reviewed Task135B:

- Create `packages/local-runtime/src/wake-supervisor-runtime.ts`
- Create `packages/local-runtime/src/mounted-wake-lifecycle-store.ts`
- Create `packages/local-runtime/test/wake-supervisor-runtime.test.ts`
- Create `packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts`
- Create `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts`
- Modify `packages/ontology/src/contracts.ts` only for the already CF-1-frozen
  wake event schemas
- Create `packages/ontology/test/resident-wake-contracts.test.ts`
- Create `docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md`
- Modify only `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`

Its production constructor accepts exactly a `LocalRuntimeHandle`, frozen
`WakeRuntimePort`, validated wake-policy snapshot, actor, clock/timer/watcher,
and safe ID factories. It accepts no mounted-facts reader, availability
authority, lifecycle bundle, lease/reconciliation port, admission, raw ledger,
workspace path, artifact store, or authority callback from its caller. The
non-indexed mounted lifecycle store builds Task125's three input adapters only
from the exact handle's mounted workspace and ledger: it remounts the configured
portable root, reads back the resident identity event, rebuilds current agent
locks from ledger events, hashes the frozen policy and lock snapshot, records
the current ledger ordinal/last-event readback, verifies blob/derivative roots,
and implements the CF-1-frozen lease/lifecycle/reconciliation event readback.
It appends only the CF-1 names in
`resident-agent-full-vision-contract-freeze.md` and validates them through the
ontology contract before append and after `readStream`; it invents no event
type or fallback ledger.

The ontology test requires strict payloads binding workspace, resident,
supervisor epoch, identity/mount/authority evidence, policy/lock digest,
high-water, causation/correlation, lease expiry, transition, and exact
reconciliation readback. The mounted-store test proves process restart rebuilds
all facts from `handle.ledger.readAll()`, an active foreign lease remains
distinct from workspace unavailability, duplicate reconciliation reuses one
exact idempotency record, and any swapped/regressed fact blocks before append.
The runtime import test permits `createWakeSupervisorRuntime` in exactly one
production importer after R0:
`packages/local-runtime/src/agent-runtime-factory.ts`; before R0, zero is valid.
It forbids routes, indexes, DTOs, status/projector modules, and every other
production importer.

`createWakeSupervisorRuntime` constructs the exact Task125 lifecycle bundle
used by its supervisor and registers that exact runtime/bundle through
`registerMountedArtifactAuthorityIssuerForWakeRuntime`. Registration creates no
authority. The factory-only issue call succeeds only after the supervisor's
current admission has survived authority, lease, policy/lock/high-water, and
reconciliation checks; Task125's private current-admission lookup supplies the
exact admission at that instant. The runtime exposes no issuer,
operation, lifecycle port, mounted facts, admission, path, store, or writer on
`WakeSupervisorRuntime` or `SupervisionControlPort`. Stop invalidates Task125
authority before returning and thereby burns every operation for that epoch.

The only production path is:

```text
agent-runtime-factory.ts
  -> createWakeSupervisorRuntime(exact mounted handle and frozen runtime inputs)
  -> issueMountedArtifactAuthorityOperationForFactory(exact wake runtime)
  -> Task135B bind(exact operation and run identity)
  -> Task135A binder plus distinct mounted stores
```

No route, command, public factory input, task result, DTO, or caller callback
can occupy any arrow. Task140R0 later owns the sole factory import and call;
Task137B does not edit the factory. Add exact-title REDs
`wake runtime registers one non public authority issuer after complete admission`,
`stopped runtime cannot issue or inspect an authority operation`, and
`fresh process runtime requires new admission and emits a distinct operation`.

Task137B's complete cross-lane RED/GREEN command is:

```bash
npm test -- packages/ontology/test/resident-wake-contracts.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/agent/test/wake-supervisor.test.ts
```

Expected RED: exit `1` because the runtime module is absent. Expected GREEN:
exit `0`, followed by `npm run typecheck && git diff --check && npm run
factory:check`. Fresh review must prove the path above, same-operation checks
around all I/O, permanent invalidation, no fallback, and no public issuer.

### Task135C - committed immutable dispatch bundles

Replace `resident-task140-prerequisites.v1` and every uncommitted-manifest
instruction with `resident-task-prerequisites.v2`:

```json
{
  "schemaVersion": "resident-task-prerequisites.v2",
  "task": "task140p",
  "sourceBaseSha": "0123456789012345678901234567890123456789",
  "prerequisiteShas": {}
}
```

The exact prerequisite keys remain CF-1R15A's enumerated P/R0/H sets, except
the P set uses distinct `task137a` and `task137b` keys in place of `task137`.
Task135C's CLI is now exactly:

```bash
node scripts/check-resident-task-prerequisites.mjs --task <task140p|task140r0|task140h> --phase <preflight|review> --manifest <path> --claim <path>
```

Before each P/R0/H dispatch, the coordinator creates the manifest and claim on
the literal `sourceBaseSha`, writes one immutable claim block delimited by
`<!-- resident-dispatch-v2:start -->` and
`<!-- resident-dispatch-v2:end -->`, and includes task, source base, manifest
path, lowercase SHA-256 of the exact manifest bytes, and every prerequisite
key/SHA. The coordinator commits only those two files as dispatch commit `M`.
`M^` must equal `sourceBaseSha`; `git diff --name-only M^..M` must equal the
manifest and claim paths; no source/test/script file may be in `M`. The
coordinator runs preflight from clean `HEAD=M` before sending the explicit
subagent-driven-development approval.

`preflight` discovers `M` with `git log -1 --format=%H -- <manifest>`, requires
`HEAD=M`, verifies `M^=sourceBaseSha`, checks the exact two-file diff, reparses
the committed manifest bytes, recomputes the manifest SHA-256, compares the
immutable claim block byte-for-byte with its version at `M`, and proves every
literal prerequisite is a commit ancestor of `sourceBaseSha`. It permits later
worker changes outside the manifest and immutable claim block so the worker can
rerun preflight before committing source.

`review` rediscovers the same `M`, requires `M` to be an ancestor of reviewer
`HEAD`, requires the manifest bytes and immutable claim block at reviewer HEAD
to equal `M`, repeats exact schema/task/hash/ancestry checks, and rejects any
replacement manifest commit, changed source base, symbolic SHA, extra/missing
key, edited immutable block, or source file smuggled into `M`. Workers may only
append evidence after the immutable block.

Add temporary-Git-repository tests for valid coordinator commit, dirty source
after M precommit, valid worker commit review, replaced M, amended manifest,
changed immutable block, wrong parent, extra file in M, nonancestor prerequisite,
symbolic/abbreviated SHA, wrong task, and missing/extra key. The owned files and
RED/GREEN command remain CF-1R15A's corrected Task135C files and command. Its
post-GREEN gate is `git diff --check && npm run factory:check`.

### Task140 private H registrar import boundary

Task140P additionally creates
`packages/local-runtime/test/task-orchestrator-handoff-port-imports.test.ts`.
It walks every production TypeScript source and enforces:

1. only `packages/local-runtime/src/agent-runtime-factory.ts` may import
   `registerTaskOrchestratorHandoffPortForFactory`;
2. only `packages/agent/src/task-orchestrator.ts` may import
   `requireRegisteredTaskOrchestratorHandoffPort` or the resolver interface;
3. neither symbol/module appears in any index, route, DTO, status, projection,
   serializer, logger, UI, provider, workflow, or other production file; and
4. a foreign deep importer, second registrar object, copied registry, and
   structural port cannot populate the exact module-private WeakMap and cause
   any checkpoint, runner, provider, H, ledger, or terminal effect.

Before R0, zero factory registrar imports is valid; after R0, exactly one is
required. The causal bypass RED belongs to
`packages/agent/test/task-orchestrator-handoff-port.test.ts`. Add both suites to
every P/R0/H focused and final command.

Task140R0 is also the sole production composition owner for the Task137B path.
It calls `createWakeSupervisorRuntime` with the exact `LocalRuntimeHandle` and
factory-held policy/runtime inputs, waits for current lifecycle admission,
calls `issueMountedArtifactAuthorityOperationForFactory` with that exact wake
runtime, and passes the returned operation plus exact run identity to Task135B.
Add exact-title R0 REDs `factory derives handoff stores through one task137b
runtime operation`, `factory blocks store binding before current wake admission`,
and `factory restart cannot reuse prior runtime or authority operation`.
Failures record zero remount/store/provider/H/terminal effects beyond the
mounted reads required to establish the block.

### Task140H named live-fixture adapters

Task140H additionally owns:

- Create `packages/agent/test/fixtures/resident-live-acceptance-adapters.ts`
- Create `packages/agent/test/resident-live-acceptance-adapters.test.ts`
- Create `docs/agentic/claims/task-140-h-private-resident-invocation.md`
- Modify `packages/agent/test/evidence-triage-nous-live.test.ts`
- Modify `packages/agent/test/prr-negotiation-nous-live.test.ts`
- Modify `packages/agent/test/task-orchestrator-evidence-triage-live.test.ts`

The fixture module exports exactly one named adapter per live file:
`runEvidenceTriageResidentLiveAcceptance`,
`runPrrNegotiationResidentLiveAcceptance`, and
`runTaskOrchestratorEvidenceTriageResidentLiveAcceptance`. Each adapter accepts
an explicit portable root and a test-injectable resident-acceptance dependency;
its default dependency is only `runResidentSpecialistAcceptance`. The adapter
module imports no direct runtime factory, agent runtime, task orchestrator,
approval adapter, workflow, renderer, provider invoker, or model method.

Each live file deletes all direct runtime/workflow/orchestrator/prompt/model
construction and calls its exact named adapter once. The deterministic test
injects a spy for each row, proves exactly one call with that row's explicit
portable root and run type, and proves zero direct factory/runtime/provider/
workflow/renderer/model calls. It uses no credential, provider, network, or
live test. Exact-title rows are:

- `evidence triage live fixture delegates once through resident acceptance`
- `prr negotiation live fixture delegates once through resident acceptance`
- `orchestrator evidence triage live fixture delegates once through resident acceptance`

The final static gate positively requires each live file's exact adapter import
and call, rejects either other adapter name in that file, and bans
`createAgentRuntime`, `createTaskOrchestrator`,
`createTaskOrchestratorProviderApprovalAdapter`, `defaultLocalAgentRuntimeFactory`,
`createSqlitePrrRuntime`, direct workflow functions, prompt builders/renderers,
`prepareSpecialistRun`, `invokeSpecialistModel`, and `runtime.invokeModel` in
all three live files and in the adapter module.

### Self-contained P/R0/H precommit and review gates

The coordinator/worker precommit commands use `--phase preflight`; every fresh
reviewer uses the corresponding command below with `--phase review`. The claim
argument is mandatory. These review commands are complete and do not inherit a
shell fragment from an earlier overlay.

Task140P fresh-review command:

```bash
node scripts/check-resident-task-prerequisites.mjs --task task140p --phase review --manifest docs/agentic/claims/task-140-p-prerequisites.json --claim docs/agentic/claims/task-140-p-private-prompt-admission.md && npm test -- packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/local-runtime/test/task-orchestrator-handoff-port-imports.test.ts && npm run typecheck && ! rg -n 'task-orchestrator-approval-admission|task-orchestrator-handoff-port' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

Task140R0 fresh-review command:

```bash
node scripts/check-resident-task-prerequisites.mjs --task task140r0 --phase review --manifest docs/agentic/claims/task-140-r0-prerequisites.json --claim docs/agentic/claims/task-140-r0-factory-prompt-binding.md && npm test -- packages/ontology/test/resident-wake-contracts.test.ts packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/local-runtime/test/task-orchestrator-approval-admission-imports.test.ts packages/local-runtime/test/task-orchestrator-handoff-port-imports.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/agent-handoff-projection.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts && npm run typecheck && ! rg -n 'task-orchestrator-approval-admission|task-orchestrator-handoff-port' packages/agent/src/index.ts && ! rg -n 'renderExactlyBoundProductionSpecialistPrompt' packages/local-runtime packages/agent/src packages/agent/test && git diff --check && npm run factory:check
```

Task140H fresh-review command:

```bash
node scripts/check-resident-task-prerequisites.mjs --task task140h --phase review --manifest docs/agentic/claims/task-140-h-prerequisites.json --claim docs/agentic/claims/task-140-h-private-resident-invocation.md && npm test -- packages/ontology/test/resident-wake-contracts.test.ts packages/agent/test/production-model-invocation-admission.test.ts packages/agent/test/production-specialist-invocation-proof.test.ts packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/runtime.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/resident-live-acceptance-adapters.test.ts packages/local-runtime/test/task-orchestrator-approval-admission-imports.test.ts packages/local-runtime/test/task-orchestrator-handoff-port-imports.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/agent-handoff-projection.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/resident-specialist-acceptance.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts && npm run typecheck && rg -n 'runEvidenceTriageResidentLiveAcceptance' packages/agent/test/evidence-triage-nous-live.test.ts && rg -n 'runPrrNegotiationResidentLiveAcceptance' packages/agent/test/prr-negotiation-nous-live.test.ts && rg -n 'runTaskOrchestratorEvidenceTriageResidentLiveAcceptance' packages/agent/test/task-orchestrator-evidence-triage-live.test.ts && ! rg -n 'createAgentRuntime|createTaskOrchestrator|createTaskOrchestratorProviderApprovalAdapter|defaultLocalAgentRuntimeFactory|createSqlitePrrRuntime|runEvidenceTriageWorkflow|runPrrNegotiationWorkflow|prepareSpecialistRun|invokeSpecialistModel|runtime\.invokeModel|renderProductionSpecialistPrompt|buildLocalRuntimeStatusPromptArtifact' packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts packages/agent/test/fixtures/resident-live-acceptance-adapters.ts && rg -n 'runResidentSpecialistAcceptance' packages/agent/test/fixtures/resident-live-acceptance-adapters.ts packages/local-runtime/src/agent-nous-smoke.ts && ! rg -n 'runtime\.invokeModel|renderProductionSpecialistPrompt|prepareSpecialistRun|invokeSpecialistModel|runEvidenceTriageWorkflow|runPrrNegotiationWorkflow|buildLocalRuntimeStatusPromptArtifact|createSqlitePrrRuntime|defaultLocalAgentRuntimeFactory|\.cestus/local/prompt-artifacts' packages/local-runtime/src/agent-nous-smoke.ts && ! rg -n 'production-model-invocation-admission|production-prompt-readback|task-orchestrator-approval-admission|task-orchestrator-handoff-port' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

For the worker's uncommitted post-GREEN precommit gate, replace only
`--phase review` with `--phase preflight`; every other byte of the corresponding
displayed command remains identical. Before tests/source exist, the coordinator
runs only that task's leading checker invocation in `preflight` mode from clean
dispatch commit M. No P/R0/H commit can reach review without the coordinator
checker preflight, the worker's complete uncommitted precommit command, and the
fresh review command shown above.

### CF-1R16 dispatch and review rule

After two fresh unqualified approvals and coordinator-only plan integration,
dispatch Task137A, Task133.1-.3, and Task135C only when their existing
predecessors are present; Task135B waits for reviewed/integrated Task137A;
Task137B waits for reviewed/integrated Task135B; Task138 waits Task137B; P waits
all exact manifest prerequisites; R0 waits P; H waits R0. Every implementation
message must specifically say the coordinator approves use of
`superpowers:subagent-driven-development` for that exact task.

Two fresh independent Terra/xhigh reviewers inspect exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`. Approval requires explicit
confirmation that old operations cannot revive; Task135B accepts no structural
authority and never revalidates; Task137B plus R0 provide the sole production
issuer path; dispatch manifests and immutable claim blocks are committed and
fresh-reviewable; the H registrar has causal import/bypass protection; every
live fixture causally delegates through one named resident adapter; and all
precommit/review commands are self-contained. Exactly two unqualified
approvals permit coordinator-only plan integration. Source/full/live/provider/
credential/reset-credit/`neo`/self-integration/merge remain closed.

## CF-1R17 - factory-captured mounted state and run-bound high-water progression

This overlay supersedes CF-1R16 wherever Task137A registration, Task135B
construction, operation inspection, high-water comparison, Task137B
registration, the R0 production path, or their tests conflict with this
section. Both CF-1R16 reviewers rejected the candidate: a fixed original high-
water tuple cannot survive H's own final-output append, and Task135B still
accepted public config/workspace objects that contain caller-controlled paths.
No source dispatch is permitted until this overlay has two fresh unqualified
approvals.

### Task137A factory-issued mounted-runtime capture

Task137A additionally owns:

- Modify `packages/local-runtime/src/runtime-factory.ts`
- Create `packages/local-runtime/test/runtime-handle-mounted-authority.test.ts`
- Extend `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`

`runtime-factory.ts` records each exact `LocalRuntimeHandle` returned by
`createSqlitePrrRuntime` in a module-private live-state `WeakMap`; `close()`
irreversibly marks that exact handle and every capture derived from it closed.
For a portable mounted
handle it can mint a fresh frozen `FactoryIssuedMountedRuntimeCapture` whose
identity is the only key into a second private `WeakMap` containing the exact
handle, ledger, config, and mounted workspace. A structural handle, spread,
copy, deserialized value, closed handle, non-portable handle, mismatched ledger,
or reused capture fails before filesystem or ledger I/O. The capture and its
inspector are source-path-only, absent from every package index, DTO, route,
status, projection, serializer, logger, or task result, and imported in
production only by `mounted-artifact-authority-operation.ts`.

The Task137A registrar signature is replaced by:

```ts
export function registerMountedArtifactAuthorityIssuerForWakeRuntime(input: {
  readonly wakeRuntime: object;
  readonly lifecyclePorts: PortableWorkspaceLifecyclePorts;
  readonly runtimeHandle: LocalRuntimeHandle;
}): void;
```

Registration verifies the exact Task125 lifecycle bundle, obtains one private
factory-issued mounted-runtime capture from the exact handle, and stores both
under the exact wake-runtime identity. It creates no admission or operation.
Issuance remains factory-only and captures the current Task125 admission plus
that private mounted-runtime capture. No config, mounted workspace, root,
SQLite path, store, ledger, lifecycle port, or capture is exposed on
`MountedArtifactAuthorityOperation` or its public snapshot.

Add exact-title REDs:

- `factory issued mounted runtime capture rejects structural and copied handles before io`
- `closed non portable and mismatched handles cannot register mounted authority`
- `mounted runtime capture is absent from indexes dto logs serializers and results`
- `only mounted authority operation may import factory issued runtime capture`

The complete Task137A RED/GREEN command becomes:

```bash
npm test -- packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/agent/test/wake-supervisor.test.ts
```

Expected GREEN is followed by:

```bash
npm run typecheck && test ! -e packages/local-runtime/src/index.ts && ! rg -n 'mounted-artifact-authority-operation|FactoryIssuedMountedRuntimeCapture' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

### Private one-shot authority cursor

At Task135B `bind`, the operation is consumed into one module-private cursor
bound to the exact `taskId`, `attemptId`, `approvedRunId`, and `runType`. A
second bind, copied operation, old operation, different run tuple, normal/
resume/reclaim competitor, or structural cursor fails before remount, ledger,
or store I/O. The cursor is never returned to the factory, agent package,
caller, route, DTO, projection, status, log, serializer, or terminal result.

The cursor snapshots exact canonical bytes for `runtimeHandle.ledger.readAll()`
and the initial current admission. Before and after every awaited material or
manifest `put`/`get`, and once before returning H/terminal authority, the
private inspector performs all of these checks in order:

1. prove the exact cursor is live, one-shot, and bound to the same run tuple;
2. inspect the exact Task125 lifecycle bundle without requesting revalidation;
3. remount only from the private factory-issued capture and expected workspace
   ID, then compare identity, mount, authority, store roles, policy, locks, and
   canonical roots with the captured handle and current admission;
4. read the exact captured ledger, require the prior accepted event list to be
   an exact byte-for-byte prefix, and reject deletion, replacement, reorder,
   regression, duplicate conflict, or a different ledger object; and
5. pass any suffix through the run-bound progression automaton below before
   advancing the cursor's private accepted high-water.

The progression automaton derives its initial phase from the canonical run and
task streams so an exact idempotent resume can reuse prior events. New suffix
events are permitted only in canonical causal order for the bound run/task:

1. one `agent.specialist-run.step.recorded` final-output event;
2. one matching `agent.specialist-handoff.prepared` event;
3. one matching `agent.specialist-handoff.recorded` event;
4. one matching terminal `agent.specialist-run.completed` or
   `agent.specialist-run.failed` event; and
5. when observed by the final cursor check, the matching
   `agent.task.orchestration.completed` and exact terminal
   `agent.task.status.changed` events.

Every permitted event must use the expected stream, run/task identity,
resident-agent actor, schema, content hashes, prepared/recorded/terminal
causation, and prior event IDs already established by the canonical H kernel.
The only non-H suffixes allowed are the frozen
`agent.wake.supervisor.lease.claimed.v1` and
`agent.wake.supervisor.recovery.verified.v1` events produced by the captured
wake-runtime epoch, and only after the exact current admission incorporates
their high-water and proves unchanged workspace identity, authority, policy,
locks, and no pending outage/reconciliation. Pause, resume-request, paused,
degraded, unrecoverable, trigger, legal/governance lock change, foreign run,
other task, provider/tool, arbitrary wake, or unexplained global events burn
the cursor and require a fresh full admission and retry.

If Task125 still exposes the original admission while an accepted H suffix has
advanced the exact ledger, the cursor may advance only its private accepted
event prefix; it does not mint or revive an admission. If Task125 later exposes
a different current admission, the inspector permits exactly one successor
only when its high-water is strictly greater, equals the already accepted
prefix, and every non-high-water fact and wake-runtime epoch is unchanged. It
then mints a fresh internal cursor identity, transfers the same one-shot run
binding, and permanently burns the predecessor. Identical-tuple revalidation,
same-or-lower high-water, an unaccepted suffix, changed facts, no current
admission, outage, shutdown, or reconciliation burns the cursor without a
successor. Task135B never calls `revalidate`, never asks for a later admission,
and cannot choose a successor.

Add exact-title REDs:

- `canonical material final output manifest projection and terminal advances one authority cursor`
- `exact resumed handoff derives its phase and remains one shot`
- `strictly higher admitted handoff suffix rotates cursor and permanently burns predecessor`
- `identical tuple revalidation cannot rotate or revive authority cursor`
- `unrelated append between material and manifest burns cursor before manifest io`
- `policy lock foreign run and arbitrary wake suffixes return no receipt or terminal authority`
- `rollback replacement and reorder fail before store io without fallback`
- `authority loss during each awaited io returns no receipt handoff or terminal effect`

### Task135B operation-only producer

Delete `PortableMountedAgentArtifactStoreProducerInput` and every constructor or
factory parameter containing `ResolvedLocalRuntimeConfig`,
`MountedPortableWorkspace`, a path, root, ledger, store, lifecycle port,
mounted facts, availability authority, callback, revalidator, admission, or
capture. The sole production signature is:

```ts
export function createPortableMountedAgentArtifactStoreProducer(
  authorityOperation: MountedArtifactAuthorityOperation
): {
  bind(input: BindPortableMountedAgentHandoffInput):
    Promise<PortableMountedAgentHandoffBinding>;
};
```

Only `agent-runtime-factory.ts` may import this producer. Only
`portable-mounted-agent-artifact-stores.ts` may import the private operation
cursor inspector. The producer obtains all mounted paths and the exact ledger
only from that inspector's private factory-issued capture, creates the material
and manifest stores below the inspected derivative root, and never places a
path-bearing value in its returned binding. A copied/swapped config or mounted
workspace is impossible as input; causal tests additionally deep-import and
attempt structural substitution and prove zero remount/store I/O and zero
path leakage through bindings, errors, logs, DTOs, serializers, or snapshots.

`PortableMountedAgentHandoffBinding` additionally carries one non-enumerable,
source-private authority guard into the already private Task140 handoff-port
resolver. It is not part of any public agent/runtime type and cannot be supplied
by a caller. The guard exposes only `beforeEffect(kind)`,
`afterAppend(kind, eventId)`, and `consumeAfterCanonicalHandoff(eventIds)` to
that exact registered resolver. Task140H must bracket every final-output,
prepared, recorded, terminal, orchestration-completed, and task-status append
with the first two operations; a failed post-append check stops before the next
effect. It then calls the consume operation before returning a handoff result.
The final consume proves every returned event ID and causal link against the
captured ledger, burns the cursor on success or failure, and returns only a
frozen data-only consumed receipt with no path, store, ledger, operation, or
cursor. Store `put`/`get` operations remain automatically bracketed inside
Task135B. The private H registrar import/bypass test proves no second resolver,
structural guard, deep importer, or public capability can invoke or replace any
of these operations.

Add exact-title REDs `authority loss after manifest read stops before terminal
append`, `authority loss after committed terminal stops orchestration and task
status`, and `final consumed receipt proves every canonical handoff event and
cannot be reused`.

Task135B's complete RED/GREEN command becomes:

```bash
npm test -- packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts
```

Expected GREEN is followed by:

```bash
npm run typecheck && ! rg -n 'PortableMountedAgentArtifactStoreProducerInput|ResolvedLocalRuntimeConfig|MountedPortableWorkspace|configSource|mountedWorkspaceSource|revalidate|WorkspaceAvailabilityAuthority|PortableWorkspaceMountedFactsPort|process\.cwd|\.cestus/local|internal-storage|in-memory-fallback|fallbackRoot' packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts && git diff --check && npm run factory:check
```

### Task137B and Task140R0 corrected composition

`createWakeSupervisorRuntime` still accepts the exact `LocalRuntimeHandle` and
constructs the exact Task125 lifecycle bundle. Its registration call now passes
that same handle, bundle, and wake-runtime identity. Registration rejects a
structural/copy handle through Task137A's private factory-issued-handle proof.
Stop first invalidates Task125, burns the runtime registration and every cursor,
then closes the handle; restart must create a new handle, capture, runtime,
admission, operation, and cursor.

Task140R0's sole production path is now exactly:

```text
agent-runtime-factory.ts exact lexical LocalRuntimeHandle
  -> createWakeSupervisorRuntime(exact handle)
  -> Task137B registers exact runtime + lifecycle bundle + handle
  -> issueMountedArtifactAuthorityOperationForFactory(exact runtime)
  -> createPortableMountedAgentArtifactStoreProducer(exact opaque operation)
  -> bind(exact task/attempt/approved-run/run-type)
  -> private cursor obtains mounted state; no path-bearing caller input
  -> Task135A binder and canonical H progression
```

Add the full canonical H progression test to Task137B, R0, and H aggregate
commands. Their fresh reviewers must causally prove material write/read,
final-output append, manifest write/read, prepared/recorded projection
readbacks, terminal append, final cursor check, and restart recovery. A failure
at each boundary must leave at most an unreferenced content-addressed orphan and
must return no receipt, handoff binding, terminal authority, orchestration
completion receipt, task completion receipt, or provider/tool effect. If an
append committed before a post-await authority loss, its exact unacknowledged
event may remain append-only recovery evidence; no later sequence effect may
run, and resume must either reuse that exact event through canonical race
recovery or record a safe blocked state. The plan never requires rollback or
deletion of a committed ledger event.

### CF-1R17 dispatch and review rule

The dependency order remains Task137A -> Task135B -> Task137B -> Task138 and
Task140P -> Task140R0 -> Task140H -> Task140R1. Task133.1-.3 and Task135C remain
disjoint where CF-1R16 permits. Every implementation dispatch must explicitly
state that the coordinator approves use of
`superpowers:subagent-driven-development` for that exact task.

Two fresh independent Terra/xhigh reviewers inspect exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`; neither CF-1R16 reviewer
or verdict carries forward. Approval requires explicit proof that Task135B has
only an opaque-operation input; mounted state comes only from an exact factory-
issued handle; the canonical H sequence can advance without accepting an
unrelated append; identical-tuple revalidation and old cursor identities cannot
revive; every awaited I/O has causal invalidation tests; Task137B/R0 own the
sole production path; and all prior immutable-dispatch, private-registrar, live-
adapter, and self-contained command requirements remain executable. Exactly
two unqualified approvals permit coordinator-only plan integration. Source,
full/live/provider/credential/Nous/reset-credit/`neo`/self-integration/merge
remain closed.

## CF-1R18 - R-owned capture, exact task ceilings, and H-private guard

This overlay supersedes CF-1R17's claim pointer, Task137A ownership, Task135B
guard transport, full-progression test ownership, affected-task commands, and
dispatch graph. It preserves CF-1R17's opaque operation, private run-bound
cursor, append-only prefix, allowed H suffix, strict higher-admission rotation,
path hiding, and append-race semantics unless this section narrows them.

### Task117A - coordinator CF-1 ownership amendment

No source task may start from the current freeze because line 25 reserves the
default `runtime-factory.ts` writer to R. The first serialized task is a
coordinator-contract task, not W/R/P/H implementation.

**Exact files:**

- Modify `docs/agentic/resident-agent-full-vision-contract-freeze.md`
- Create `docs/agentic/claims/task-117a-runtime-handle-capture-freeze.md`

Task117A adds exactly two rows to both governed Markdown matrices and to the
independent literal `canonicalRows` oracle in the embedded audit:

- `CF1-R-MOUNTED-CAPTURE`: no new event; source is
  `packages/local-runtime/src/runtime-factory.ts` / R; contract is
  `FactoryIssuedMountedRuntimeCapture.v1`; consumers are Task135D, Task137A,
  Task135B, Task137B, Task140R0, Task140H, and acceptance; provenance is exact
  factory handle identity, mounted workspace, ledger identity, closed state,
  mount/store roots, and source high-water; approval is none; idempotency is
  handle identity plus mount instance; test command is Task135D's focused
  command; prerequisite is Task125, exact `CF1-INTEGRATION-SHA`, and the exact
  reviewed/coordinator-integrated Task117A amendment SHA.
- `W2-135D`: exact files are Task135D's four files below; owner is R; binding is
  `CF1-R-MOUNTED-CAPTURE`; no effect or approval; exact capture identity is its
  key; focused command is Task135D's command; reviewed Task125/135A and
  `CF1-INTEGRATION-SHA` gate it; Task137A must rebase its reviewed merge.

The amendment preserves `R is the only default runtime-factory writer`, adds a
direct counterfactual proving W cannot own either new row, updates the complete
literal row count/order and every ten-cell mutation, and keeps recomputed hash
from acting as the semantic oracle. Its exact GREEN/review command is:

```bash
awk '/^```bash$/{inside=1; block=""; next} inside && /^```$/{if (block ~ /CF-1 full-row canonicalRows audit/) selected=block; inside=0; next} inside{block=block $0 ORS} END{printf "%s", selected}' docs/agentic/resident-agent-full-vision-contract-freeze.md | bash && git diff --check && npm run factory:check
```

Task117A commits exactly its two files and stops for a fresh independent
contract/ownership review. Only after coordinator integration may Task135D be
dispatched. Full verification, source work, providers, credentials, `neo`, and
self-integration remain closed during Task117A.

### Task135D - R-owned factory-issued mounted handle capture

**Exact files:**

- Modify `packages/local-runtime/src/runtime-factory.ts`
- Create `packages/local-runtime/test/runtime-handle-mounted-authority.test.ts`
- Create `packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts`
- Create `docs/agentic/claims/task-135d-runtime-handle-mounted-authority.md`

Task135D implements the CF-1R17 live-state `WeakMap` and
`FactoryIssuedMountedRuntimeCapture` semantics. It deep-snapshots the immutable
portable storage/root/workspace identity at capture, retains the exact ledger
and handle only in private maps, and makes `close()` burn every derived capture
before closing the ledger. Capture and inspection are source-path-only; only
`mounted-artifact-authority-operation.ts` may import them in production.
Task135D does not edit lifecycle, wake, store, H, or agent runtime factory code.
The import test permits zero such importer before Task137A exists and exactly
that one importer afterward; every other production importer always fails.

Exact-title REDs cover structural/spread/deserialized handles, nested config
mutation, nonportable handles, changed ledger/workspace identity, capture copy,
close-before-capture, close-after-capture, reflection/serialization/leakage,
and every forbidden production importer. The exact RED/GREEN/review command is:

```bash
npm test -- packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/local-runtime/test/resident-identity-bootstrap.test.ts && npm run typecheck && test ! -e packages/local-runtime/src/index.ts && git diff --check && npm run factory:check
```

Task135D commits exactly its four files and stops for fresh R ownership,
authority, and import review.

### Task137A exact six-file ceiling

Task137A waits for reviewed/coordinator-integrated Task117A and Task135D. Its
complete and exclusive file set remains exactly:

- Modify `packages/local-runtime/src/portable-workspace-lifecycle.ts`
- Modify `packages/local-runtime/test/portable-workspace-lifecycle.test.ts`
- Create `packages/local-runtime/src/mounted-artifact-authority-operation.ts`
- Create `packages/local-runtime/test/mounted-artifact-authority-operation.test.ts`
- Create `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
- Create `docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md`

It does not edit `runtime-factory.ts` or Task135D tests. Its registrar consumes
Task135D's exact private capture seam, while its own operation/current-admission
behavior remains CF-1R17. Its exact RED/GREEN/review command is:

```bash
npm test -- packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/agent/test/wake-supervisor.test.ts && npm run typecheck && test ! -e packages/local-runtime/src/index.ts && ! rg -n 'mounted-artifact-authority-operation|FactoryIssuedMountedRuntimeCapture' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

The commit ceiling is exactly these six files. A seventh file is an automatic
review rejection.

### Task135B component-only cursor and store boundary

Task135B's complete file and commit ceiling remains exactly its three files:
`packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts`,
`packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`,
and `docs/agentic/claims/task-135b-portable-mounted-handoff-stores.md`.
Task135B still accepts only `MountedArtifactAuthorityOperation` plus exact run
identity and implements CF-1R17's store-I/O checks and run-bound progression
automaton. It does not edit H, task orchestrator, ledger implementations, the H
port, runtime types, or runtime composition. Its source-private producer result
contains two distinct values only for the later lexical factory closure:

1. the frozen data/store `PortableMountedAgentHandoffBinding`; and
2. an opaque `MountedHandoffAuthorityController` identity backed by Task135B
   private maps.

No guard method or function property is placed on the binding or controller.
Source-path controller operations accept the exact opaque identity and are
importable in production only by `agent-runtime-factory.ts`; they perform the
CF-1R17 before/after/final cursor inspections. A structural/copy controller
fails. Task135B component tests drive these operations directly with canonical
event fixtures to prove the automaton and append-race semantics, but they do not
claim Task140H orchestration integration.

Move the three terminal-bracketing RED titles from CF-1R17 to Task140H below.
Task135B owns only component REDs for store I/O, exact H-suffix acceptance,
unrelated suffix rejection, strict successor rotation, one-shot reuse, path
leakage, and no method/property reflection on the binding/controller. Its exact
RED/GREEN/review command is:

```bash
npm test -- packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts && npm run typecheck && ! rg -n 'PortableMountedAgentArtifactStoreProducerInput|ResolvedLocalRuntimeConfig|MountedPortableWorkspace|configSource|mountedWorkspaceSource|revalidate|WorkspaceAvailabilityAuthority|PortableWorkspaceMountedFactsPort|process\.cwd|\.cestus/local|internal-storage|in-memory-fallback|fallbackRoot' packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts && git diff --check && npm run factory:check
```

### Task137B component command

Task137B owns wake assembly, exact-handle registration, admission issuance,
stop/restart invalidation, and its existing files only. It does not own H
bracketing or the full progression test. Its complete command is:

```bash
npm test -- packages/ontology/test/resident-wake-contracts.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/agent/test/wake-supervisor.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

### H-resolver-owned private guard

Task140P's `task-orchestrator-handoff-port.ts` owns two module-private WeakMaps:
one exact runner-registry-to-port registration and one exact frozen resolved-
handoff-binding-to-controller-closure registration. R0's registered factory
resolver returns an internal `{ resolution, controllerClosure }` pair only to
the H-port module. The H-port module stores the closure in its second WeakMap
and returns only `resolution` to task orchestrator. No guard/controller/method/
symbol is placed on the resolution, binding, stores, DTO, result, log,
serializer, projection, runtime input, or public port.

Only `task-orchestrator.ts` may import the H-port's source-path
`beforeRegisteredHandoffEffect`, `afterRegisteredHandoffAppend`, and
`consumeRegisteredHandoffAuthority` operations. Each looks up the closure by
the exact resolution identity. Reflection, own-key enumeration, descriptors,
prototype walking, spread, serialization, copied resolution, structural
closure, second registrar, and foreign/deep import fail before cursor, store,
ledger, H, or terminal activity. The existing H registrar import test extends
its exact allowlist and causal counterfactuals for all three operations.

Task140P's complete command remains:

```bash
node scripts/check-resident-task-prerequisites.mjs --task task140p --phase review --manifest docs/agentic/claims/task-140-p-prerequisites.json --claim docs/agentic/claims/task-140-p-private-prompt-admission.md && npm test -- packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/local-runtime/test/task-orchestrator-handoff-port-imports.test.ts && npm run typecheck && ! rg -n 'task-orchestrator-approval-admission|task-orchestrator-handoff-port' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

Task140R0's complete command is:

```bash
node scripts/check-resident-task-prerequisites.mjs --task task140r0 --phase review --manifest docs/agentic/claims/task-140-r0-prerequisites.json --claim docs/agentic/claims/task-140-r0-factory-prompt-binding.md && npm test -- packages/ontology/test/resident-wake-contracts.test.ts packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/local-runtime/test/task-orchestrator-approval-admission-imports.test.ts packages/local-runtime/test/task-orchestrator-handoff-port-imports.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/agent-handoff-projection.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts && npm run typecheck && ! rg -n 'task-orchestrator-approval-admission|task-orchestrator-handoff-port' packages/agent/src/index.ts && ! rg -n 'renderExactlyBoundProductionSpecialistPrompt' packages/local-runtime packages/agent/src packages/agent/test && git diff --check && npm run factory:check
```

### Task140H-only orchestration integration

Task140H additionally creates
`packages/agent/test/task-orchestrator-mounted-authority.test.ts`. No earlier
task owns or runs this file. This file is added to Task140H's complete owned
file set and commit ceiling; omitting it or changing it in an earlier task is an
automatic rejection. Task140H alone modifies task orchestrator to call
the H-port's private WeakMap-backed before/after operations around every final-
output, prepared, recorded, terminal, orchestration-completed, and task-status
append, then consume the exact authority before returning. The three CF-1R17
terminal-bracketing REDs and the full material -> final-output -> manifest ->
prepared/recorded projection -> terminal/orchestration/status test live in this
file. It also proves exact resume/race recovery, committed-but-unacknowledged
append reuse, reflection/copy/replacement rejection, and no later effect after
failed post-append inspection.

Task140H's complete command is:

```bash
node scripts/check-resident-task-prerequisites.mjs --task task140h --phase review --manifest docs/agentic/claims/task-140-h-prerequisites.json --claim docs/agentic/claims/task-140-h-private-resident-invocation.md && npm test -- packages/ontology/test/resident-wake-contracts.test.ts packages/agent/test/production-model-invocation-admission.test.ts packages/agent/test/production-specialist-invocation-proof.test.ts packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-mounted-authority.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/runtime.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/resident-live-acceptance-adapters.test.ts packages/local-runtime/test/task-orchestrator-approval-admission-imports.test.ts packages/local-runtime/test/task-orchestrator-handoff-port-imports.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/agent-handoff-projection.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/resident-specialist-acceptance.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts && npm run typecheck && rg -n 'runEvidenceTriageResidentLiveAcceptance' packages/agent/test/evidence-triage-nous-live.test.ts && rg -n 'runPrrNegotiationResidentLiveAcceptance' packages/agent/test/prr-negotiation-nous-live.test.ts && rg -n 'runTaskOrchestratorEvidenceTriageResidentLiveAcceptance' packages/agent/test/task-orchestrator-evidence-triage-live.test.ts && ! rg -n 'createAgentRuntime|createTaskOrchestrator|createTaskOrchestratorProviderApprovalAdapter|defaultLocalAgentRuntimeFactory|createSqlitePrrRuntime|runEvidenceTriageWorkflow|runPrrNegotiationWorkflow|prepareSpecialistRun|invokeSpecialistModel|runtime\.invokeModel|renderProductionSpecialistPrompt|buildLocalRuntimeStatusPromptArtifact' packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts packages/agent/test/fixtures/resident-live-acceptance-adapters.ts && rg -n 'runResidentSpecialistAcceptance' packages/agent/test/fixtures/resident-live-acceptance-adapters.ts packages/local-runtime/src/agent-nous-smoke.ts && ! rg -n 'runtime\.invokeModel|renderProductionSpecialistPrompt|prepareSpecialistRun|invokeSpecialistModel|runEvidenceTriageWorkflow|runPrrNegotiationWorkflow|buildLocalRuntimeStatusPromptArtifact|createSqlitePrrRuntime|defaultLocalAgentRuntimeFactory|\.cestus/local/prompt-artifacts' packages/local-runtime/src/agent-nous-smoke.ts && ! rg -n 'production-model-invocation-admission|production-prompt-readback|task-orchestrator-approval-admission|task-orchestrator-handoff-port' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

For P/R0/H worker precommit, replace only `--phase review` with `--phase
preflight`; all other bytes remain identical. The coordinator still runs only
the leading preflight checker from clean dispatch commit M before explicitly
approving `superpowers:subagent-driven-development`.

### CF-1R18 dispatch and review rule

The serialized dependency chain is now:

```text
Task117A coordinator CF-1 amendment
  -> Task135D R-owned factory capture
  -> Task137A W-owned exact admission operation
  -> Task135B R-owned operation/cursor/store components
  -> Task137B W-owned wake registration/runtime
  -> Task138

all exact 132-139 prerequisites -> Task140P -> Task140R0 -> Task140H -> Task140R1
```

Task133.1-.3 and Task135C may run only where their prior disjoint-file rules
permit, but no source lane starts before Task117A review/integration. Every
implementation message must specifically state that the coordinator approves
use of `superpowers:subagent-driven-development` for that exact task.

Two fresh independent Terra/xhigh reviewers inspect exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`. Approval requires explicit
proof of the Task117A integrity revision, R-only factory ownership, exact task
file ceilings, component-before-integration test split, zero callable guard on
any returned object, H-port private WeakMap authority, complete affected-task
commands, and all preserved CF-1R17/R16 safety requirements. Exactly two
unqualified approvals permit coordinator-only plan integration. Source,
full/live/provider/credential/Nous/reset-credit/`neo`/self-integration/merge
remain closed.

## CF-1R19 Fail-Closed Dispatch And File-Ceiling Enforcement

**Status:** This append-only correction supersedes CF-1R18 only where its
immutable prerequisite inventory omitted Task117A/Task135D, its Task117A audit
extractor could select no block and still succeed, and its Task137A six-file
ceiling lacked a machine-enforced changed-path equality gate. Every other
CF-1R18 ownership, lifecycle, authority, component/integration split, command,
and restriction remains current. Source remains frozen pending two fresh
independent approvals of `0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`.

### Exact immutable prerequisite inventory

Task135C's exact `task140p` prerequisite-map keys are now:

```text
cf1, task117a, task120, task121, task122, task123, task124, task125, task126,
task127, task128, task129, task130, task132a, task133, task134a, task135a,
task135b, task135c, task135d, task136, task137a, task137b, task138, task139
```

`task140r0` requires that exact set plus `task140p`; `task140h` requires the P
set plus `task140p` and `task140r0`. The checker rejects missing, duplicate,
aliased, generic-range, symbolic, abbreviated, or extra keys. The Task135C test
must include separate exact-title cases `rejects task140p without task117a`,
`rejects task140p without task135d`, `rejects task140r0 without task117a or
task135d`, and `rejects task140h without task117a or task135d`, in addition to
all previously required v2 manifest, immutable-claim, exact-SHA, ancestry,
parent, task, and dispatch-bundle cases. Its owned files and complete commands
remain CF-1R18/CF-1R16.

Every P/R0/H manifest records the exact reviewed/coordinator-integrated
Task117A and Task135D commit SHAs. `sourceBaseSha` must descend from both. A
manifest generated before either integration is invalid and cannot be repaired
by changing its bytes or immutable claim block.

### Fail-closed Task117A oracle extraction

Task117A's exact GREEN/review command is replaced by this command:

```bash
audit_tmp="$(mktemp)" && trap 'rm -f "$audit_tmp"' EXIT && awk '/^```bash$/{inside=1; block=""; next} inside && /^```$/{if (block ~ /CF-1 full-row canonicalRows audit/) {matches++; selected=block} inside=0; next} inside{block=block $0 ORS} END{if (matches != 1 || selected == "") exit 41; printf "%s", selected}' docs/agentic/resident-agent-full-vision-contract-freeze.md > "$audit_tmp" && test -s "$audit_tmp" && bash "$audit_tmp" && git diff --check && npm run factory:check
```

The extractor must select exactly one nonempty bash block containing the
canonical audit marker. Zero matches, duplicate matches, an empty selection,
or malformed extracted shell exits nonzero before `factory:check`. Task117A's
review repeats this exact command from its committed candidate.

### Machine-enforced Task137A six-file ceiling

The Task137A claim must contain exactly one coordinator/worker-visible immutable
line of this form, written before any test or source edit and committed alone
on the clean dispatch base:

```text
<!-- task-137a-dispatch-base-sha: 0123456789012345678901234567890123456789 -->
```

The literal value is the exact lowercase 40-character dispatch-base commit,
not a branch, tag, abbreviation, placeholder, or later commit. The claim-add
commit's parent must equal that value, and that commit may add only
`docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md`.
Review requires the final claim's marker to equal the marker at that original
claim-add commit.

Task137A's focused RED command is:

```bash
npm test -- packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/agent/test/wake-supervisor.test.ts
```

After GREEN and during every fresh review, Task137A runs this complete gate:

```bash
task137a_claim='docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md' && task137a_base_lines="$(sed -n 's/^<!-- task-137a-dispatch-base-sha: \([0-9a-f]\{40\}\) -->$/\1/p' "$task137a_claim")" && test "$(printf '%s\n' "$task137a_base_lines" | sed '/^$/d' | wc -l)" -eq 1 && task137a_base="$task137a_base_lines" && test "$(git rev-parse "${task137a_base}^{commit}")" = "$task137a_base" && task137a_claim_commit="$(git log --diff-filter=A --format=%H -- "$task137a_claim" | tail -n 1)" && test -n "$task137a_claim_commit" && test "$(git rev-parse "${task137a_claim_commit}^")" = "$task137a_base" && test "$(git diff --name-only "${task137a_claim_commit}^..${task137a_claim_commit}")" = "$task137a_claim" && test "$(git show "${task137a_claim_commit}:${task137a_claim}" | sed -n 's/^<!-- task-137a-dispatch-base-sha: \([0-9a-f]\{40\}\) -->$/\1/p')" = "$task137a_base" && task137a_actual="$( { git diff --name-only "${task137a_base}..HEAD"; git diff --name-only; git diff --name-only --cached; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u)" && task137a_expected="$(printf '%s\n' docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md packages/local-runtime/src/mounted-artifact-authority-operation.ts packages/local-runtime/src/portable-workspace-lifecycle.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts | LC_ALL=C sort -u)" && test "$task137a_actual" = "$task137a_expected" && npm test -- packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/agent/test/wake-supervisor.test.ts && npm run typecheck && test ! -e packages/local-runtime/src/index.ts && ! rg -n 'mounted-artifact-authority-operation|FactoryIssuedMountedRuntimeCapture' packages/agent/src/index.ts && git diff --check && npm run factory:check
```

The tracked task lineage plus staged, unstaged, and untracked work must equal
the same six paths byte-for-byte after sorting. A seventh path, an omitted path,
a rewritten dispatch marker, a non-claim file in the claim commit, or a base
that is not the claim commit's exact parent rejects before tests can authorize
review or integration.

### CF-1R19 dispatch and review rule

The CF-1R18 serialized dependency chain is unchanged. No source lane starts
before reviewed/coordinator-integrated Task117A. Every P/R0/H dispatch waits for
and names reviewed/coordinator-integrated Task117A and Task135D in its immutable
manifest. Every implementation message must specifically state that the
coordinator approves use of `superpowers:subagent-driven-development` for that
exact task.

Two fresh independent Terra/xhigh reviewers inspect exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`. Approval requires explicit
proof of the exact prerequisite sets, fail-closed single-oracle extraction, and
Task137A lineage-wide six-path equality gate in addition to every preserved
CF-1R18 requirement. Exactly two unqualified approvals permit coordinator-only
plan integration. Source, full/live/provider/credential/Nous/reset-credit/
`neo`/self-integration/merge remain closed.

## CF-1R20 - Authenticated oracle and complete Git lineage gates

This overlay supersedes CF-1R19 only for Task117A audit authentication,
Task135C dispatch-commit discovery, and Task137A changed-path accounting. Every
CF-1R18/CF-1R19 ownership, authority, prerequisite, command, and restriction
that is not explicitly replaced below remains current.

### Task117A coordinator-pinned audit bytes

Task117A remains coordinator-only and docs-only. Before changing the checked-out
freeze, the coordinator prepares the exact intended post-amendment freeze in a
temporary directory outside the repository, extracts exactly one nonempty bash
block containing `CF-1 full-row canonicalRows audit`, runs that block against
the temporary candidate, and computes SHA-256 over the exact extracted bytes.
From a clean literal `sourceBaseSha`, the coordinator then creates the Task117A
claim with exactly one immutable block:

```text
<!-- task-117a-dispatch-v2:start -->
sourceBaseSha=0123456789012345678901234567890123456789
auditSha256=0123456789012345678901234567890123456789012345678901234567890123
<!-- task-117a-dispatch-v2:end -->
```

The coordinator commits only the new claim as the claim-add commit. Its parent
must be the literal `sourceBaseSha`. Only after that commit may the coordinator
write the already validated temporary freeze bytes into the checked-out freeze
and append evidence outside the immutable claim block. The claim-add commit is
found as the one and only original add of the claim with rename detection and
Git replacement objects disabled; a latest-touch lookup is forbidden.

Task117A GREEN and every fresh review run this exact gate from the candidate:

```bash
set -euo pipefail
task117a_claim='docs/agentic/claims/task-117a-runtime-handle-capture-freeze.md'
task117a_freeze='docs/agentic/resident-agent-full-vision-contract-freeze.md'
task117a_tmp="$(mktemp -d)"
trap 'rm -rf "$task117a_tmp"' EXIT
extract_task117a_claim() {
  awk '/^<!-- task-117a-dispatch-v2:start -->$/ { starts++; inside=1 } inside { print } /^<!-- task-117a-dispatch-v2:end -->$/ { ends++; inside=0 } END { if (starts != 1 || ends != 1 || inside) exit 42 }'
}
extract_task117a_audit() {
  awk '/^```bash$/ { inside=1; block=""; next } inside && /^```$/ { if (block ~ /CF-1 full-row canonicalRows audit/) { matches++; selected=block } inside=0; next } inside { block=block $0 ORS } END { if (matches != 1 || selected == "") exit 43; printf "%s", selected }'
}
extract_task117a_claim < "$task117a_claim" > "$task117a_tmp/claim"
task117a_source_lines="$(sed -n 's/^sourceBaseSha=\([0-9a-f]\{40\}\)$/\1/p' "$task117a_tmp/claim")"
task117a_audit_sha_lines="$(sed -n 's/^auditSha256=\([0-9a-f]\{64\}\)$/\1/p' "$task117a_tmp/claim")"
test "$(printf '%s\n' "$task117a_source_lines" | sed '/^$/d' | wc -l)" -eq 1
test "$(printf '%s\n' "$task117a_audit_sha_lines" | sed '/^$/d' | wc -l)" -eq 1
task117a_source="$task117a_source_lines"
task117a_audit_sha="$task117a_audit_sha_lines"
test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-parse "${task117a_source}^{commit}")" = "$task117a_source"
mapfile -t task117a_claim_commits < <(GIT_NO_REPLACE_OBJECTS=1 git log --no-renames --diff-filter=A --format=%H -- "$task117a_claim")
test "${#task117a_claim_commits[@]}" -eq 1
task117a_claim_commit="${task117a_claim_commits[0]}"
test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-parse "${task117a_claim_commit}^")" = "$task117a_source"
test "$(GIT_NO_REPLACE_OBJECTS=1 git diff-tree --root --no-commit-id --name-status -r --no-renames "$task117a_claim_commit")" = "$(printf 'A\t%s' "$task117a_claim")"
GIT_NO_REPLACE_OBJECTS=1 git show "${task117a_claim_commit}:${task117a_claim}" | extract_task117a_claim > "$task117a_tmp/claim-at-add"
cmp -s "$task117a_tmp/claim" "$task117a_tmp/claim-at-add"
test -z "$(GIT_NO_REPLACE_OBJECTS=1 git rev-list --min-parents=2 "${task117a_source}..HEAD")"
task117a_actual="$( { while read -r commit; do GIT_NO_REPLACE_OBJECTS=1 git diff-tree --no-commit-id --name-only -r --no-renames "$commit"; done < <(GIT_NO_REPLACE_OBJECTS=1 git rev-list --reverse "${task117a_source}..HEAD"); GIT_NO_REPLACE_OBJECTS=1 git diff --name-only --no-renames; GIT_NO_REPLACE_OBJECTS=1 git diff --cached --name-only --no-renames; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u )"
task117a_expected="$(printf '%s\n' "$task117a_claim" "$task117a_freeze" | LC_ALL=C sort -u)"
test "$task117a_actual" = "$task117a_expected"
extract_task117a_audit < "$task117a_freeze" > "$task117a_tmp/audit"
test -s "$task117a_tmp/audit"
test "$(sha256sum "$task117a_tmp/audit" | awk '{print $1}')" = "$task117a_audit_sha"
bash "$task117a_tmp/audit"
git diff --check
npm run factory:check
```

The claim's digest is therefore fixed before the freeze changes and cannot be
updated with a substituted marker-bearing no-op. The exact lineage union must
equal only the claim and freeze paths. Tests/review include no-op replacement,
comment-only marker replacement, changed digest, changed immutable block,
duplicate add, delete/re-add, merge commit, rename, extra/reverted intermediate
path, and replacement-object counterfactuals.

### Task135C unique original dispatch add

Task135C no longer discovers `M` with `git log -1`. Given the literal manifest
and claim paths from the CLI, both `preflight` and `review` must:

1. set `GIT_NO_REPLACE_OBJECTS=1` for every revision, ancestry, show, log,
   diff, and tree operation;
2. run `git log --no-renames --diff-filter=A --format=%H -- <manifest>` and
   require exactly one result in `HEAD` ancestry;
3. require the claim to have exactly the same one original-add commit;
4. parse `sourceBaseSha` and all prerequisite facts from the manifest and
   immutable claim bytes stored at that unique `M`, not from mutable HEAD bytes;
5. require `M^=sourceBaseSha`, no merge in `sourceBaseSha..HEAD`, and exact
   `A <manifest>` plus `A <claim>` name-status entries in `M`; and
6. compare current/HEAD manifest bytes and the current/HEAD immutable claim
   block to their exact bytes at `M` before any task command runs.

A later touch, replacement two-file commit, delete/re-add, rename, merge,
replacement object, edited manifest, or edited immutable block cannot redefine
`M`. Add exact-title temporary-repository tests for each bypass, including a
later valid-looking replacement bundle whose parent contains source work. The
Task135C owned files and full command remain CF-1R18/CF-1R19, with these cases
added to its focused suite.

### Task137A every-commit six-path ceiling

Task137A replaces CF-1R19's net-diff ceiling. The claim-add commit is the one
and only original add of its claim, discovered with `--no-renames`, and every
Git object operation sets `GIT_NO_REPLACE_OBJECTS=1`. The branch segment from
the literal dispatch base through reviewer HEAD must contain no merge commit.
Review enumerates every individual commit in `base..HEAD` with
`git diff-tree --no-renames`; committed edits that are reverted later therefore
remain visible. Staged and unstaged diffs also use `--no-renames`.

Before forming the six-path union, the gate requires this command to produce no
output:

```bash
git ls-files --others --ignored --exclude-standard -- packages scripts docs/agentic/claims
```

Thus an ignored production, test, script, or claim-path file is an immediate
failure rather than an invisible input. Standard untracked files remain part of
the repository-wide union. Task137A's CF-1R19 complete gate is replaced by:

```bash
set -euo pipefail
task137a_claim='docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md'
task137a_base_lines="$(sed -n 's/^<!-- task-137a-dispatch-base-sha: \([0-9a-f]\{40\}\) -->$/\1/p' "$task137a_claim")"
test "$(printf '%s\n' "$task137a_base_lines" | sed '/^$/d' | wc -l)" -eq 1
task137a_base="$task137a_base_lines"
test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-parse "${task137a_base}^{commit}")" = "$task137a_base"
mapfile -t task137a_claim_commits < <(GIT_NO_REPLACE_OBJECTS=1 git log --no-renames --diff-filter=A --format=%H -- "$task137a_claim")
test "${#task137a_claim_commits[@]}" -eq 1
task137a_claim_commit="${task137a_claim_commits[0]}"
test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-parse "${task137a_claim_commit}^")" = "$task137a_base"
test "$(GIT_NO_REPLACE_OBJECTS=1 git diff-tree --root --no-commit-id --name-status -r --no-renames "$task137a_claim_commit")" = "$(printf 'A\t%s' "$task137a_claim")"
test "$(GIT_NO_REPLACE_OBJECTS=1 git show "${task137a_claim_commit}:${task137a_claim}" | sed -n 's/^<!-- task-137a-dispatch-base-sha: \([0-9a-f]\{40\}\) -->$/\1/p')" = "$task137a_base"
test -z "$(GIT_NO_REPLACE_OBJECTS=1 git rev-list --min-parents=2 "${task137a_base}..HEAD")"
task137a_ignored="$(git ls-files --others --ignored --exclude-standard -- packages scripts docs/agentic/claims)"
test -z "$task137a_ignored"
task137a_actual="$( { while read -r commit; do GIT_NO_REPLACE_OBJECTS=1 git diff-tree --no-commit-id --name-only -r --no-renames "$commit"; done < <(GIT_NO_REPLACE_OBJECTS=1 git rev-list --reverse "${task137a_base}..HEAD"); GIT_NO_REPLACE_OBJECTS=1 git diff --name-only --no-renames; GIT_NO_REPLACE_OBJECTS=1 git diff --cached --name-only --no-renames; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u )"
task137a_expected="$(printf '%s\n' docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md packages/local-runtime/src/mounted-artifact-authority-operation.ts packages/local-runtime/src/portable-workspace-lifecycle.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts | LC_ALL=C sort -u)"
test "$task137a_actual" = "$task137a_expected"
npm test -- packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/agent/test/wake-supervisor.test.ts
npm run typecheck
test ! -e packages/local-runtime/src/index.ts
! rg -n 'mounted-artifact-authority-operation|FactoryIssuedMountedRuntimeCapture' packages/agent/src/index.ts
git diff --check
npm run factory:check
```

Exact negative cases cover an out-of-scope path added then reverted in a later
commit, source-to-allowed rename, allowed-to-source rename, ignored source/test
file, duplicate claim add, delete/re-add, merge commit, replacement object,
staged extra, unstaged extra, standard untracked extra, and clean exact-six
review.

### CF-1R20 dispatch and review rule

The serialized dependency graph and exact prerequisite inventories remain
CF-1R18/CF-1R19. No source lane starts before reviewed and coordinator-
integrated Task117A. Every implementation message must specifically state that
the coordinator approves use of `superpowers:subagent-driven-development` for
that exact task.

Two fresh independent Terra/xhigh reviewers inspect exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`. They must run or inspect
the authenticated Task117A gate and its no-op counterfactual, Task135C's unique-
add replacement-bundle cases, and Task137A's every-commit/rename/ignored-file
counterfactuals in addition to every preserved CF-1R18/CF-1R19 requirement.
Exactly two unqualified approvals permit coordinator-only plan integration.
Source, full/live/provider/credential/Nous/reset-credit/`neo`/self-integration/
merge remain closed.

### CF-1R23 post-command material (incorporated below)

This terminal overlay supersedes CF-1R22 only for the complete Task117A and
Task137A commands. Every other CF-1R18 through CF-1R22 contract, including the
physical-checkout guard and exact P/R0/H commands, remains current.

### Complete Task117A command

Before dispatch, the coordinator replaces the one literal
`COORDINATOR_ATTESTATION_SHA` token with the lowercase 40-character SHA of the
sibling program-registry attestation commit. Worker and both reviewers run
these exact materialized bytes:

```bash
set -euo pipefail
git_authority_repo_root="$(pwd -P)"
assert_git_authority_context() {
  local -a v
  mapfile -t v < <(compgen -v | LC_ALL=C awk '/^GIT_/ { print }')
  if test "${#v[@]}" -eq 1; then
    test "${v[0]}" = GIT_PAGER || return 70
    test "$GIT_PAGER" = cat || return 70
    unset GIT_PAGER
  elif test "${#v[@]}" -ne 0; then
    return 70
  fi
  test "$(git rev-parse --is-inside-work-tree)" = "true"
  test "$(git rev-parse --show-toplevel)" = "$git_authority_repo_root"
}
assert_git_authority_context
task117a_claim='docs/agentic/claims/task-117a-runtime-handle-capture-freeze.md'
task117a_freeze='docs/agentic/resident-agent-full-vision-contract-freeze.md'
task117a_registry='docs/agentic/resident-agent-full-vision-program-registry.md'
task117a_attestation='COORDINATOR_ATTESTATION_SHA'
task117a_tmp="$(mktemp -d)"
trap 'rm -rf "$task117a_tmp"' EXIT
printf '%s\n' "$task117a_attestation" | grep -Eq '^[0-9a-f]{40}$'
extract_task117a_claim() {
  awk '/^<!-- task-117a-dispatch-v3:start -->$/ { starts++; inside=1 } inside { print } /^<!-- task-117a-dispatch-v3:end -->$/ { ends++; inside=0 } END { if (starts != 1 || ends != 1 || inside) exit 42 }'
}
extract_task117a_audit() {
  awk '/^```bash$/ { inside=1; block=""; next } inside && /^```$/ { if (block ~ /CF-1 full-row canonicalRows audit/) { matches++; selected=block } inside=0; next } inside { block=block $0 ORS } END { if (matches != 1 || selected == "") exit 43; printf "%s", selected }'
}
extract_task117a_claim < "$task117a_claim" > "$task117a_tmp/claim"
task117a_source="$(sed -n 's/^sourceBaseSha=\([0-9a-f]\{40\}\)$/\1/p' "$task117a_tmp/claim")"
task117a_freeze_sha="$(sed -n 's/^freezeSha256=\([0-9a-f]\{64\}\)$/\1/p' "$task117a_tmp/claim")"
task117a_audit_sha="$(sed -n 's/^auditSha256=\([0-9a-f]\{64\}\)$/\1/p' "$task117a_tmp/claim")"
test "$(grep -Ec '^sourceBaseSha=[0-9a-f]{40}$' "$task117a_tmp/claim")" -eq 1
test "$(grep -Ec '^freezeSha256=[0-9a-f]{64}$' "$task117a_tmp/claim")" -eq 1
test "$(grep -Ec '^auditSha256=[0-9a-f]{64}$' "$task117a_tmp/claim")" -eq 1
assert_task117a_authority_state() {
  assert_git_authority_context
  test ! -s "$(git rev-parse --git-path info/grafts)"
  test ! -s "$(git rev-parse --git-path shallow)"
  test -z "$(git ls-files -v | sed -n '/^[a-zS] /p')"
  test -z "$(git ls-files --others --ignored --exclude-standard -- packages scripts docs/agentic/claims)"
  test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-parse "${task117a_source}^{commit}")" = "$task117a_source"
  mapfile -t task117a_claim_commits < <(GIT_NO_REPLACE_OBJECTS=1 git log --no-renames --diff-filter=A --format=%H -- "$task117a_claim")
  test "${#task117a_claim_commits[@]}" -eq 1
  task117a_claim_commit="${task117a_claim_commits[0]}"
  test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-parse "${task117a_claim_commit}^")" = "$task117a_source"
  test "$(GIT_NO_REPLACE_OBJECTS=1 git diff-tree --root --no-commit-id --name-status -r --no-renames "$task117a_claim_commit")" = "$(printf 'A\t%s' "$task117a_claim")"
  GIT_NO_REPLACE_OBJECTS=1 git show "${task117a_claim_commit}:${task117a_claim}" | extract_task117a_claim > "$task117a_tmp/claim-at-add"
  extract_task117a_claim < "$task117a_claim" > "$task117a_tmp/claim-current"
  cmp -s "$task117a_tmp/claim-current" "$task117a_tmp/claim-at-add"
  test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-list --parents -n 1 "$task117a_attestation" | awk '{print NF}')" -eq 2
  test "$(GIT_NO_REPLACE_OBJECTS=1 git diff-tree --no-commit-id --name-only -r --no-renames "$task117a_attestation")" = "$task117a_registry"
  task117a_claim_blob_sha="$(GIT_NO_REPLACE_OBJECTS=1 git show "${task117a_claim_commit}:${task117a_claim}" | sha256sum | awk '{print $1}')"
  task117a_attestation_start="<!-- resident-dispatch-attestation-v1:start task117a ${task117a_claim_commit} -->"
  task117a_attestation_end="<!-- resident-dispatch-attestation-v1:end task117a ${task117a_claim_commit} -->"
  GIT_NO_REPLACE_OBJECTS=1 git show "${task117a_attestation}:${task117a_registry}" | awk -v start="$task117a_attestation_start" -v end="$task117a_attestation_end" '$0 == start { matches++; inside=1 } inside { print } $0 == end { inside=0 } END { if (matches != 1 || inside) exit 44 }' > "$task117a_tmp/attestation"
  printf '%s\n' "$task117a_attestation_start" 'task=task117a' "dispatchCommitSha=$task117a_claim_commit" "sourceBaseSha=$task117a_source" 'manifestPath=none' 'manifestSha256=none' "claimPath=$task117a_claim" "claimSha256=$task117a_claim_blob_sha" "freezePath=$task117a_freeze" "intendedFreezeSha256=$task117a_freeze_sha" "auditSha256=$task117a_audit_sha" "$task117a_attestation_end" > "$task117a_tmp/expected-attestation"
  cmp -s "$task117a_tmp/attestation" "$task117a_tmp/expected-attestation"
  test -z "$(GIT_NO_REPLACE_OBJECTS=1 git rev-list --min-parents=2 "${task117a_source}..HEAD")"
  task117a_actual="$( { while read -r commit; do GIT_NO_REPLACE_OBJECTS=1 git diff-tree --no-commit-id --name-only -r --no-renames "$commit"; done < <(GIT_NO_REPLACE_OBJECTS=1 git rev-list --reverse "${task117a_source}..HEAD"); GIT_NO_REPLACE_OBJECTS=1 git diff --name-only --no-renames; GIT_NO_REPLACE_OBJECTS=1 git diff --cached --name-only --no-renames; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u )"
  task117a_expected="$(printf '%s\n' "$task117a_claim" "$task117a_freeze" | LC_ALL=C sort -u)"
  test "$task117a_actual" = "$task117a_expected"
  test "$(sha256sum "$task117a_freeze" | awk '{print $1}')" = "$task117a_freeze_sha"
  extract_task117a_audit < "$task117a_freeze" > "$task117a_tmp/audit-current"
  test -s "$task117a_tmp/audit-current"
  test "$(sha256sum "$task117a_tmp/audit-current" | awk '{print $1}')" = "$task117a_audit_sha"
  git diff --check
}
assert_task117a_authority_state
cp "$task117a_tmp/audit-current" "$task117a_tmp/audit-to-run"
bash "$task117a_tmp/audit-to-run"
npm run factory:check
assert_task117a_authority_state
```

The final assertion is the command's last operation. Its temporary-repository
suite covers audit-created mutations to the freeze, immutable claim block,
allowed paths, and a third committed, staged, unstaged, ignored, or standard
untracked path in addition to every CF-1R20 through CF-1R22 case.

### Complete Task137A command

This replaces every older Task137A command in full:

```bash
set -euo pipefail
git_authority_repo_root="$(pwd -P)"
assert_git_authority_context() {
  local -a v
  mapfile -t v < <(compgen -v | LC_ALL=C awk '/^GIT_/ { print }')
  if test "${#v[@]}" -eq 1; then
    test "${v[0]}" = GIT_PAGER || return 70
    test "$GIT_PAGER" = cat || return 70
    unset GIT_PAGER
  elif test "${#v[@]}" -ne 0; then
    return 70
  fi
  test "$(git rev-parse --is-inside-work-tree)" = "true"
  test "$(git rev-parse --show-toplevel)" = "$git_authority_repo_root"
}
assert_git_authority_context
task137a_claim='docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md'
task137a_base_lines="$(sed -n 's/^<!-- task-137a-dispatch-base-sha: \([0-9a-f]\{40\}\) -->$/\1/p' "$task137a_claim")"
test "$(printf '%s\n' "$task137a_base_lines" | sed '/^$/d' | wc -l)" -eq 1
task137a_base="$task137a_base_lines"
assert_task137a_authority_state() {
  assert_git_authority_context
  test ! -s "$(git rev-parse --git-path info/grafts)"
  test ! -s "$(git rev-parse --git-path shallow)"
  test -z "$(git ls-files -v | sed -n '/^[a-zS] /p')"
  test -z "$(git ls-files --others --ignored --exclude-standard -- packages scripts docs/agentic/claims)"
  test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-parse "${task137a_base}^{commit}")" = "$task137a_base"
  mapfile -t task137a_claim_commits < <(GIT_NO_REPLACE_OBJECTS=1 git log --no-renames --diff-filter=A --format=%H -- "$task137a_claim")
  test "${#task137a_claim_commits[@]}" -eq 1
  task137a_claim_commit="${task137a_claim_commits[0]}"
  test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-parse "${task137a_claim_commit}^")" = "$task137a_base"
  test "$(GIT_NO_REPLACE_OBJECTS=1 git diff-tree --root --no-commit-id --name-status -r --no-renames "$task137a_claim_commit")" = "$(printf 'A\t%s' "$task137a_claim")"
  test "$(GIT_NO_REPLACE_OBJECTS=1 git show "${task137a_claim_commit}:${task137a_claim}" | sed -n 's/^<!-- task-137a-dispatch-base-sha: \([0-9a-f]\{40\}\) -->$/\1/p')" = "$task137a_base"
  test -z "$(GIT_NO_REPLACE_OBJECTS=1 git rev-list --min-parents=2 "${task137a_base}..HEAD")"
  task137a_actual="$( { while read -r commit; do GIT_NO_REPLACE_OBJECTS=1 git diff-tree --no-commit-id --name-only -r --no-renames "$commit"; done < <(GIT_NO_REPLACE_OBJECTS=1 git rev-list --reverse "${task137a_base}..HEAD"); GIT_NO_REPLACE_OBJECTS=1 git diff --name-only --no-renames; GIT_NO_REPLACE_OBJECTS=1 git diff --cached --name-only --no-renames; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u )"
  task137a_expected="$(printf '%s\n' docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md packages/local-runtime/src/mounted-artifact-authority-operation.ts packages/local-runtime/src/portable-workspace-lifecycle.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts | LC_ALL=C sort -u)"
  test "$task137a_actual" = "$task137a_expected"
  git diff --check
}
assert_task137a_authority_state
npm test -- packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/agent/test/wake-supervisor.test.ts
npm run typecheck
test ! -e packages/local-runtime/src/index.ts
! rg -n 'mounted-artifact-authority-operation|FactoryIssuedMountedRuntimeCapture' packages/agent/src/index.ts
npm run factory:check
assert_task137a_authority_state
```

The final assertion is the command's last operation. Its temporary-repository
suite covers a seventh committed, staged, unstaged, ignored, or standard
untracked path created by each focused/readiness command, plus every previous
rename, revert, merge, replacement, hidden-index, graft, shallow, environment,
and clean-six-path case.

### CF-1R23 dispatch and review rule

The serialized dependency graph, exact prerequisite inventories, file
ownership, sibling-attestation trust model, Git-environment checks, and exact
P/R0/H commands remain CF-1R18 through CF-1R22. Every implementation message
pins the task's exact coordinator attestation SHA and specifically states that
the coordinator approves use of `superpowers:subagent-driven-development` for
that exact task. No source lane starts before reviewed and coordinator-
integrated Task117A.

Two fresh independent Terra/xhigh reviewers inspect exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`. They reproduce the exact
post-audit freeze mutation and post-test seventh-path counterfactuals and prove
both fail at the final assertion, then recheck every preserved authority and
materializability requirement. Exactly two unqualified approvals permit
coordinator-only plan integration. Source, full/live/provider/credential/Nous/
reset-credit/`neo`/self-integration/merge remain closed.

### CF-1R22 physical-checkout material (incorporated below)

This terminal overlay supersedes CF-1R21 only for Git environment binding,
Task137A's complete command, and the exact Task140P/R0/H prerequisite-checker
invocations. Every other CF-1R18 through CF-1R21 contract remains current.

### Physical checkout and Git environment authority

Task117A, Task137A, and every Task135C checker invocation reject every
preexisting shell variable whose name begins with `GIT_`, with one exact
execution-harness exception: a lone `GIT_PAGER=cat` is accepted and immediately
unset before the first Git operation. No additional or differently valued
variable is allowed. This prevents `GIT_WORK_TREE`,
`GIT_INDEX_FILE`, `GIT_DIR`, `GIT_COMMON_DIR`, object alternates, config
injection, namespace, shallow-file, and future Git environment controls from
redirecting an authority check. Each shell gate records `pwd -P`, requires Git
to report that exact physical path as its top level, and repeats both checks
after its focused command before authorization.

Task135C performs the equivalent check in Node before parsing arguments or
spawning Git: `Object.keys(process.env).filter((key) => key.startsWith("GIT_"))`
must be empty after accepting and deleting only a lone `GIT_PAGER=cat`;
`realpathSync(process.cwd())` must equal the real path of the
literal `git rev-parse --show-toplevel` result. Only after those checks does
the checker create its private child-process environment with
`GIT_NO_REPLACE_OBJECTS=1`. Its focused tests cover `GIT_WORK_TREE`,
`GIT_INDEX_FILE`, `GIT_DIR`, `GIT_CONFIG_COUNT`, and an otherwise unknown
`GIT_CESTUS_TEST`; each fails before any manifest, claim, or revision read.

The exact reusable shell assertion in every complete command below is:

```bash
assert_git_authority_context() {
  local -a git_authority_variables
  mapfile -t git_authority_variables < <(compgen -v | LC_ALL=C awk '/^GIT_/ { print }')
  if test "${#git_authority_variables[@]}" -eq 1; then
    test "${git_authority_variables[0]}" = "GIT_PAGER" || return 70
    test "$GIT_PAGER" = "cat" || return 70
    unset GIT_PAGER
  elif test "${#git_authority_variables[@]}" -ne 0; then
    return 70
  fi
  test "$(git rev-parse --is-inside-work-tree)" = "true"
  test "$(git rev-parse --show-toplevel)" = "$git_authority_repo_root"
}
```

### Complete Task117A command

This replaces the CF-1R21 Task117A command in full. Before dispatch, the
coordinator replaces the one literal `COORDINATOR_ATTESTATION_SHA` token with
the lowercase 40-character SHA of the sibling program-registry attestation
commit. Worker and both reviewers run these exact materialized bytes:

```bash
set -euo pipefail
git_authority_repo_root="$(pwd -P)"
assert_git_authority_context() {
  local -a git_authority_variables
  mapfile -t git_authority_variables < <(compgen -v | LC_ALL=C awk '/^GIT_/ { print }')
  if test "${#git_authority_variables[@]}" -eq 1; then
    test "${git_authority_variables[0]}" = "GIT_PAGER" || return 70
    test "$GIT_PAGER" = "cat" || return 70
    unset GIT_PAGER
  elif test "${#git_authority_variables[@]}" -ne 0; then
    return 70
  fi
  test "$(git rev-parse --is-inside-work-tree)" = "true"
  test "$(git rev-parse --show-toplevel)" = "$git_authority_repo_root"
}
assert_git_authority_context
task117a_claim='docs/agentic/claims/task-117a-runtime-handle-capture-freeze.md'
task117a_freeze='docs/agentic/resident-agent-full-vision-contract-freeze.md'
task117a_registry='docs/agentic/resident-agent-full-vision-program-registry.md'
task117a_attestation='COORDINATOR_ATTESTATION_SHA'
task117a_tmp="$(mktemp -d)"
trap 'rm -rf "$task117a_tmp"' EXIT
printf '%s\n' "$task117a_attestation" | grep -Eq '^[0-9a-f]{40}$'
test ! -s "$(git rev-parse --git-path info/grafts)"
test ! -s "$(git rev-parse --git-path shallow)"
test -z "$(git ls-files -v | sed -n '/^[a-zS] /p')"
test -z "$(git ls-files --others --ignored --exclude-standard -- packages scripts docs/agentic/claims)"
extract_task117a_claim() {
  awk '/^<!-- task-117a-dispatch-v3:start -->$/ { starts++; inside=1 } inside { print } /^<!-- task-117a-dispatch-v3:end -->$/ { ends++; inside=0 } END { if (starts != 1 || ends != 1 || inside) exit 42 }'
}
extract_task117a_audit() {
  awk '/^```bash$/ { inside=1; block=""; next } inside && /^```$/ { if (block ~ /CF-1 full-row canonicalRows audit/) { matches++; selected=block } inside=0; next } inside { block=block $0 ORS } END { if (matches != 1 || selected == "") exit 43; printf "%s", selected }'
}
extract_task117a_claim < "$task117a_claim" > "$task117a_tmp/claim"
task117a_source="$(sed -n 's/^sourceBaseSha=\([0-9a-f]\{40\}\)$/\1/p' "$task117a_tmp/claim")"
task117a_freeze_sha="$(sed -n 's/^freezeSha256=\([0-9a-f]\{64\}\)$/\1/p' "$task117a_tmp/claim")"
task117a_audit_sha="$(sed -n 's/^auditSha256=\([0-9a-f]\{64\}\)$/\1/p' "$task117a_tmp/claim")"
test "$(grep -Ec '^sourceBaseSha=[0-9a-f]{40}$' "$task117a_tmp/claim")" -eq 1
test "$(grep -Ec '^freezeSha256=[0-9a-f]{64}$' "$task117a_tmp/claim")" -eq 1
test "$(grep -Ec '^auditSha256=[0-9a-f]{64}$' "$task117a_tmp/claim")" -eq 1
test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-parse "${task117a_source}^{commit}")" = "$task117a_source"
mapfile -t task117a_claim_commits < <(GIT_NO_REPLACE_OBJECTS=1 git log --no-renames --diff-filter=A --format=%H -- "$task117a_claim")
test "${#task117a_claim_commits[@]}" -eq 1
task117a_claim_commit="${task117a_claim_commits[0]}"
test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-parse "${task117a_claim_commit}^")" = "$task117a_source"
test "$(GIT_NO_REPLACE_OBJECTS=1 git diff-tree --root --no-commit-id --name-status -r --no-renames "$task117a_claim_commit")" = "$(printf 'A\t%s' "$task117a_claim")"
GIT_NO_REPLACE_OBJECTS=1 git show "${task117a_claim_commit}:${task117a_claim}" | extract_task117a_claim > "$task117a_tmp/claim-at-add"
cmp -s "$task117a_tmp/claim" "$task117a_tmp/claim-at-add"
test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-list --parents -n 1 "$task117a_attestation" | awk '{print NF}')" -eq 2
test "$(GIT_NO_REPLACE_OBJECTS=1 git diff-tree --no-commit-id --name-only -r --no-renames "$task117a_attestation")" = "$task117a_registry"
task117a_claim_blob_sha="$(GIT_NO_REPLACE_OBJECTS=1 git show "${task117a_claim_commit}:${task117a_claim}" | sha256sum | awk '{print $1}')"
task117a_attestation_start="<!-- resident-dispatch-attestation-v1:start task117a ${task117a_claim_commit} -->"
task117a_attestation_end="<!-- resident-dispatch-attestation-v1:end task117a ${task117a_claim_commit} -->"
GIT_NO_REPLACE_OBJECTS=1 git show "${task117a_attestation}:${task117a_registry}" | awk -v start="$task117a_attestation_start" -v end="$task117a_attestation_end" '$0 == start { matches++; inside=1 } inside { print } $0 == end { inside=0 } END { if (matches != 1 || inside) exit 44 }' > "$task117a_tmp/attestation"
printf '%s\n' "$task117a_attestation_start" 'task=task117a' "dispatchCommitSha=$task117a_claim_commit" "sourceBaseSha=$task117a_source" 'manifestPath=none' 'manifestSha256=none' "claimPath=$task117a_claim" "claimSha256=$task117a_claim_blob_sha" "freezePath=$task117a_freeze" "intendedFreezeSha256=$task117a_freeze_sha" "auditSha256=$task117a_audit_sha" "$task117a_attestation_end" > "$task117a_tmp/expected-attestation"
cmp -s "$task117a_tmp/attestation" "$task117a_tmp/expected-attestation"
test -z "$(GIT_NO_REPLACE_OBJECTS=1 git rev-list --min-parents=2 "${task117a_source}..HEAD")"
task117a_actual="$( { while read -r commit; do GIT_NO_REPLACE_OBJECTS=1 git diff-tree --no-commit-id --name-only -r --no-renames "$commit"; done < <(GIT_NO_REPLACE_OBJECTS=1 git rev-list --reverse "${task117a_source}..HEAD"); GIT_NO_REPLACE_OBJECTS=1 git diff --name-only --no-renames; GIT_NO_REPLACE_OBJECTS=1 git diff --cached --name-only --no-renames; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u )"
task117a_expected="$(printf '%s\n' "$task117a_claim" "$task117a_freeze" | LC_ALL=C sort -u)"
test "$task117a_actual" = "$task117a_expected"
test "$(sha256sum "$task117a_freeze" | awk '{print $1}')" = "$task117a_freeze_sha"
extract_task117a_audit < "$task117a_freeze" > "$task117a_tmp/audit"
test -s "$task117a_tmp/audit"
test "$(sha256sum "$task117a_tmp/audit" | awk '{print $1}')" = "$task117a_audit_sha"
bash "$task117a_tmp/audit"
assert_git_authority_context
test ! -s "$(git rev-parse --git-path info/grafts)"
test ! -s "$(git rev-parse --git-path shallow)"
test -z "$(git ls-files -v | sed -n '/^[a-zS] /p')"
test -z "$(git ls-files --others --ignored --exclude-standard -- packages scripts docs/agentic/claims)"
git diff --check
npm run factory:check
```

## CF-1R21 - Whole-freeze, dispatch-attestation, and hidden-index authority

This terminal overlay supersedes CF-1R20 only for Task117A freeze hashing and
worktree visibility, coordinator dispatch authentication, Task135C attestation,
Task137A worktree visibility, and Task135B's exact producer-result type. Every
other CF-1R18 through CF-1R20 contract remains current.

### Whole-freeze Task117A commitment

The Task117A immutable dispatch block is now exactly:

```text
<!-- task-117a-dispatch-v3:start -->
sourceBaseSha=0123456789012345678901234567890123456789
freezeSha256=0123456789012345678901234567890123456789012345678901234567890123
auditSha256=0123456789012345678901234567890123456789012345678901234567890123
<!-- task-117a-dispatch-v3:end -->
```

Before the claim-add commit, the coordinator prepares the complete exact
post-amendment freeze outside the repository, runs its one authenticated audit
block against that temporary root, and computes both SHA-256 values. The claim-
add commit pins both values before any checked-out freeze byte changes. GREEN
and review compare the complete checked-out freeze bytes and the exact
extracted audit bytes to those distinct values before executing the audit. A
change to the non-production boundary, ownership prose, matrix, audit, or any
other freeze byte therefore fails even if the audit would otherwise pass.

### Coordinator dispatch attestation

Git author and committer strings are never authority. After creating Task117A's
claim-add commit `M`, or a Task135C P/R0/H two-file dispatch commit `M`, the
coordinator appends one exact attestation block to the canonical program
registry and commits that registry-only change as `C`:

```text
<!-- resident-dispatch-attestation-v1:start TASK M -->
task=TASK
dispatchCommitSha=M
sourceBaseSha=SOURCE_BASE
manifestPath=MANIFEST_PATH_OR_NONE
manifestSha256=MANIFEST_SHA256_OR_NONE
claimPath=CLAIM_PATH
claimSha256=CLAIM_SHA256
freezePath=FREEZE_PATH_OR_NONE
intendedFreezeSha256=FREEZE_SHA256_OR_NONE
auditSha256=AUDIT_SHA256_OR_NONE
<!-- resident-dispatch-attestation-v1:end TASK M -->
```

`C` is not chosen by a worker or rediscovered from mutable task state. The
coordinator's dispatch message pins its literal lowercase 40-character SHA,
and the fresh review prompt repeats that same SHA and the byte-identical gate.
The task-specific command materializes `COORDINATOR_ATTESTATION_SHA` with that
literal value before dispatch; an environment variable, branch, tag, symbolic
ref, abbreviation, Git author, or worker-provided value is forbidden.

The gate verifies `C` as a one-parent commit whose changed-path set is exactly
`docs/agentic/resident-agent-full-vision-program-registry.md`, extracts exactly
one block whose start/end markers name the exact task and `M`, and compares all
fields to the original bytes at `M`. Task117A additionally compares both pinned
freeze/audit hashes. Task135C compares manifest and claim hashes, source base,
task, and the complete prerequisite map represented by the manifest. The
literal externally issued `C` is the trust root; commit identity metadata is
not. Review rejects a missing, substituted, worker-chosen, symbolic, duplicate,
or field-mismatched attestation.

Task135C's CLI therefore becomes:

```bash
node scripts/check-resident-task-prerequisites.mjs --task TASK --phase PHASE --manifest MANIFEST_PATH --claim CLAIM_PATH --coordinator-attestation COORDINATOR_ATTESTATION_SHA
```

Every complete P/R0/H command must include its exact coordinator-issued `C` in
that argument in both worker and review messages. Add temporary-repository
tests for a valid external attestation and forged author, worker-created C,
wrong C, symbolic C, non-registry C, merge C, duplicate block, wrong M, wrong
hash, wrong source base, wrong task, and changed prerequisite manifest.

### Hidden Git-state rejection

Before any Task117A, Task135C, or Task137A revision/ancestry/path check, the
gate requires no graft or shallow-history override:

```bash
test ! -s "$(git rev-parse --git-path info/grafts)"
test ! -s "$(git rev-parse --git-path shallow)"
```

Task117A and Task137A additionally reject every tracked index entry marked
assume-unchanged or skip-worktree and every ignored authority-path file:

```bash
test -z "$(git ls-files -v | sed -n '/^[a-zS] /p')"
test -z "$(git ls-files --others --ignored --exclude-standard -- packages scripts docs/agentic/claims)"
```

These checks run before the committed/staged/unstaged/untracked union and again
after the focused tests, before `git diff --check`. A hidden tracked edit,
sparse/skip-worktree path, ignored source/test/script/claim file, graft, shallow
boundary, or replacement ref cannot disappear from review. Exact counterfactual
tests use `git update-index --assume-unchanged`, `git update-index
--skip-worktree`, ignored authority files, `info/grafts`, and a shallow file;
each must fail before an audit, test, or factory gate can authorize the task.

Task117A's CF-1R20 gate is otherwise unchanged, except it:

1. parses exactly one `sourceBaseSha`, `freezeSha256`, and `auditSha256` from
   the v3 immutable block;
2. validates the exact coordinator attestation `C` and its Task117A block;
3. runs the hidden-state checks above before and after its audit;
4. requires `sha256sum "$task117a_freeze"` to equal `freezeSha256`; and
5. still requires the every-commit union to equal exactly the claim and freeze
   paths and the extracted audit hash to equal `auditSha256`.

The complete Task117A gate is this template. Before dispatch, the coordinator
replaces the one literal `COORDINATOR_ATTESTATION_SHA` token with `C`; the
worker and both reviewers run that byte-identical materialized command:

```bash
set -euo pipefail
task117a_claim='docs/agentic/claims/task-117a-runtime-handle-capture-freeze.md'
task117a_freeze='docs/agentic/resident-agent-full-vision-contract-freeze.md'
task117a_registry='docs/agentic/resident-agent-full-vision-program-registry.md'
task117a_attestation='COORDINATOR_ATTESTATION_SHA'
task117a_tmp="$(mktemp -d)"
trap 'rm -rf "$task117a_tmp"' EXIT
printf '%s\n' "$task117a_attestation" | grep -Eq '^[0-9a-f]{40}$'
test ! -s "$(git rev-parse --git-path info/grafts)"
test ! -s "$(git rev-parse --git-path shallow)"
test -z "$(git ls-files -v | sed -n '/^[a-zS] /p')"
test -z "$(git ls-files --others --ignored --exclude-standard -- packages scripts docs/agentic/claims)"
extract_task117a_claim() {
  awk '/^<!-- task-117a-dispatch-v3:start -->$/ { starts++; inside=1 } inside { print } /^<!-- task-117a-dispatch-v3:end -->$/ { ends++; inside=0 } END { if (starts != 1 || ends != 1 || inside) exit 42 }'
}
extract_task117a_audit() {
  awk '/^```bash$/ { inside=1; block=""; next } inside && /^```$/ { if (block ~ /CF-1 full-row canonicalRows audit/) { matches++; selected=block } inside=0; next } inside { block=block $0 ORS } END { if (matches != 1 || selected == "") exit 43; printf "%s", selected }'
}
extract_task117a_claim < "$task117a_claim" > "$task117a_tmp/claim"
task117a_source="$(sed -n 's/^sourceBaseSha=\([0-9a-f]\{40\}\)$/\1/p' "$task117a_tmp/claim")"
task117a_freeze_sha="$(sed -n 's/^freezeSha256=\([0-9a-f]\{64\}\)$/\1/p' "$task117a_tmp/claim")"
task117a_audit_sha="$(sed -n 's/^auditSha256=\([0-9a-f]\{64\}\)$/\1/p' "$task117a_tmp/claim")"
test "$(grep -Ec '^sourceBaseSha=[0-9a-f]{40}$' "$task117a_tmp/claim")" -eq 1
test "$(grep -Ec '^freezeSha256=[0-9a-f]{64}$' "$task117a_tmp/claim")" -eq 1
test "$(grep -Ec '^auditSha256=[0-9a-f]{64}$' "$task117a_tmp/claim")" -eq 1
test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-parse "${task117a_source}^{commit}")" = "$task117a_source"
mapfile -t task117a_claim_commits < <(GIT_NO_REPLACE_OBJECTS=1 git log --no-renames --diff-filter=A --format=%H -- "$task117a_claim")
test "${#task117a_claim_commits[@]}" -eq 1
task117a_claim_commit="${task117a_claim_commits[0]}"
test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-parse "${task117a_claim_commit}^")" = "$task117a_source"
test "$(GIT_NO_REPLACE_OBJECTS=1 git diff-tree --root --no-commit-id --name-status -r --no-renames "$task117a_claim_commit")" = "$(printf 'A\t%s' "$task117a_claim")"
GIT_NO_REPLACE_OBJECTS=1 git show "${task117a_claim_commit}:${task117a_claim}" | extract_task117a_claim > "$task117a_tmp/claim-at-add"
cmp -s "$task117a_tmp/claim" "$task117a_tmp/claim-at-add"
test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-list --parents -n 1 "$task117a_attestation" | awk '{print NF}')" -eq 2
test "$(GIT_NO_REPLACE_OBJECTS=1 git diff-tree --no-commit-id --name-only -r --no-renames "$task117a_attestation")" = "$task117a_registry"
task117a_claim_blob_sha="$(GIT_NO_REPLACE_OBJECTS=1 git show "${task117a_claim_commit}:${task117a_claim}" | sha256sum | awk '{print $1}')"
task117a_attestation_start="<!-- resident-dispatch-attestation-v1:start task117a ${task117a_claim_commit} -->"
task117a_attestation_end="<!-- resident-dispatch-attestation-v1:end task117a ${task117a_claim_commit} -->"
GIT_NO_REPLACE_OBJECTS=1 git show "${task117a_attestation}:${task117a_registry}" | awk -v start="$task117a_attestation_start" -v end="$task117a_attestation_end" '$0 == start { matches++; inside=1 } inside { print } $0 == end { inside=0 } END { if (matches != 1 || inside) exit 44 }' > "$task117a_tmp/attestation"
printf '%s\n' "$task117a_attestation_start" 'task=task117a' "dispatchCommitSha=$task117a_claim_commit" "sourceBaseSha=$task117a_source" 'manifestPath=none' 'manifestSha256=none' "claimPath=$task117a_claim" "claimSha256=$task117a_claim_blob_sha" "freezePath=$task117a_freeze" "intendedFreezeSha256=$task117a_freeze_sha" "auditSha256=$task117a_audit_sha" "$task117a_attestation_end" > "$task117a_tmp/expected-attestation"
cmp -s "$task117a_tmp/attestation" "$task117a_tmp/expected-attestation"
test -z "$(GIT_NO_REPLACE_OBJECTS=1 git rev-list --min-parents=2 "${task117a_source}..HEAD")"
task117a_actual="$( { while read -r commit; do GIT_NO_REPLACE_OBJECTS=1 git diff-tree --no-commit-id --name-only -r --no-renames "$commit"; done < <(GIT_NO_REPLACE_OBJECTS=1 git rev-list --reverse "${task117a_source}..HEAD"); GIT_NO_REPLACE_OBJECTS=1 git diff --name-only --no-renames; GIT_NO_REPLACE_OBJECTS=1 git diff --cached --name-only --no-renames; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u )"
task117a_expected="$(printf '%s\n' "$task117a_claim" "$task117a_freeze" | LC_ALL=C sort -u)"
test "$task117a_actual" = "$task117a_expected"
test "$(sha256sum "$task117a_freeze" | awk '{print $1}')" = "$task117a_freeze_sha"
extract_task117a_audit < "$task117a_freeze" > "$task117a_tmp/audit"
test -s "$task117a_tmp/audit"
test "$(sha256sum "$task117a_tmp/audit" | awk '{print $1}')" = "$task117a_audit_sha"
bash "$task117a_tmp/audit"
test -z "$(git ls-files -v | sed -n '/^[a-zS] /p')"
test -z "$(git ls-files --others --ignored --exclude-standard -- packages scripts docs/agentic/claims)"
git diff --check
npm run factory:check
```

Task137A's CF-1R20 complete command is otherwise unchanged, with the same
before/after hidden-state checks added. Task135C applies graft/shallow,
replacement-object, unique-original-add, exact attestation, manifest/claim
worktree-byte, schema, exact-key, and ancestry checks before any P/R0/H command.

### Exact Task135B private producer result

CF-1R18 replaces CF-1R16's obsolete binding-only `bind()` return. The exact
source-private types in
`packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts` are:

```ts
declare const mountedHandoffAuthorityControllerBrand: unique symbol;

export type MountedHandoffAuthorityController = Readonly<{
  readonly [mountedHandoffAuthorityControllerBrand]: true;
}>;

export interface FactoryPortableMountedAgentHandoffProducerResultV1 {
  readonly schemaVersion: "factory-portable-mounted-agent-handoff-result.v1";
  readonly binding: PortableMountedAgentHandoffBinding;
  readonly controller: MountedHandoffAuthorityController;
}

export function createPortableMountedAgentArtifactStoreProducer(
  authorityOperation: MountedArtifactAuthorityOperation
): {
  bind(input: BindPortableMountedAgentHandoffInput):
    Promise<FactoryPortableMountedAgentHandoffProducerResultV1>;
};
```

The unique brand is not exported. The opaque frozen controller has no own
callable property, method, path, store, ledger, authority fact, or serializable
state; exact identity is accepted only by Task135B's module-private WeakMap.
The result is consumed only inside the lexical local runtime factory and is
never a runtime/agent DTO, binding field, route value, projection, log, or
public export. `PortableMountedAgentHandoffBinding` remains data/store-only and
contains no controller or guard.

Only `agent-runtime-factory.ts` may import the producer result, opaque
controller, or source-private controller operations. It captures the exact
controller in `MountedHandoffAuthorityControllerClosureV1`, whose callables are
transferred only through R0's internal resolver pair into the H-port module's
private WeakMap. The closure/result/controller is never returned to task
orchestrator or any caller. Task140H reaches it only through the named H-port
before/after/consume operations. Exact import and reflection tests reject a
binding-attached controller, callable result/controller property, structural
or copied controller, second importer, second registrar, serializer/log leak,
or any unnamed transfer channel.

### CF-1R21 dispatch and review rule

The serialized dependency graph and exact prerequisite inventories remain
CF-1R18/CF-1R19. Every implementation message must pin the exact coordinator
attestation SHA and specifically state that the coordinator approves use of
`superpowers:subagent-driven-development` for that exact task. No source lane
starts before reviewed and coordinator-integrated Task117A.

Two fresh independent Terra/xhigh reviewers inspect exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`. Approval requires explicit
proof of whole-freeze plus audit hashing, literal external attestation binding,
hidden-index/ignored/graft/shallow rejection, the exact Task135B producer-result
and private transfer path, and every preserved CF-1R18 through CF-1R20 gate.
Exactly two unqualified approvals permit coordinator-only plan integration.
Source, full/live/provider/credential/Nous/reset-credit/`neo`/self-integration/
merge remain closed.

## CF-1R22 - Physical-checkout binding and final executable commands

This terminal section incorporates the complete CF-1R22 physical-checkout
contract and Task117A command above, then supplies the remaining final commands.
Together those CF-1R22 sections supersede CF-1R21 only for Git environment
binding, Task137A's complete command, and the exact Task140P/R0/H prerequisite-
checker invocations. Every other CF-1R18 through CF-1R21 contract remains
current.

### Complete Task137A command

This replaces every older Task137A command in full:

```bash
set -euo pipefail
git_authority_repo_root="$(pwd -P)"
assert_git_authority_context() {
  local -a git_authority_variables
  mapfile -t git_authority_variables < <(compgen -v | LC_ALL=C awk '/^GIT_/ { print }')
  if test "${#git_authority_variables[@]}" -eq 1; then
    test "${git_authority_variables[0]}" = "GIT_PAGER" || return 70
    test "$GIT_PAGER" = "cat" || return 70
    unset GIT_PAGER
  elif test "${#git_authority_variables[@]}" -ne 0; then
    return 70
  fi
  test "$(git rev-parse --is-inside-work-tree)" = "true"
  test "$(git rev-parse --show-toplevel)" = "$git_authority_repo_root"
}
assert_git_authority_context
task137a_claim='docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md'
task137a_base_lines="$(sed -n 's/^<!-- task-137a-dispatch-base-sha: \([0-9a-f]\{40\}\) -->$/\1/p' "$task137a_claim")"
test "$(printf '%s\n' "$task137a_base_lines" | sed '/^$/d' | wc -l)" -eq 1
task137a_base="$task137a_base_lines"
test ! -s "$(git rev-parse --git-path info/grafts)"
test ! -s "$(git rev-parse --git-path shallow)"
test -z "$(git ls-files -v | sed -n '/^[a-zS] /p')"
test -z "$(git ls-files --others --ignored --exclude-standard -- packages scripts docs/agentic/claims)"
test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-parse "${task137a_base}^{commit}")" = "$task137a_base"
mapfile -t task137a_claim_commits < <(GIT_NO_REPLACE_OBJECTS=1 git log --no-renames --diff-filter=A --format=%H -- "$task137a_claim")
test "${#task137a_claim_commits[@]}" -eq 1
task137a_claim_commit="${task137a_claim_commits[0]}"
test "$(GIT_NO_REPLACE_OBJECTS=1 git rev-parse "${task137a_claim_commit}^")" = "$task137a_base"
test "$(GIT_NO_REPLACE_OBJECTS=1 git diff-tree --root --no-commit-id --name-status -r --no-renames "$task137a_claim_commit")" = "$(printf 'A\t%s' "$task137a_claim")"
test "$(GIT_NO_REPLACE_OBJECTS=1 git show "${task137a_claim_commit}:${task137a_claim}" | sed -n 's/^<!-- task-137a-dispatch-base-sha: \([0-9a-f]\{40\}\) -->$/\1/p')" = "$task137a_base"
test -z "$(GIT_NO_REPLACE_OBJECTS=1 git rev-list --min-parents=2 "${task137a_base}..HEAD")"
task137a_actual="$( { while read -r commit; do GIT_NO_REPLACE_OBJECTS=1 git diff-tree --no-commit-id --name-only -r --no-renames "$commit"; done < <(GIT_NO_REPLACE_OBJECTS=1 git rev-list --reverse "${task137a_base}..HEAD"); GIT_NO_REPLACE_OBJECTS=1 git diff --name-only --no-renames; GIT_NO_REPLACE_OBJECTS=1 git diff --cached --name-only --no-renames; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u )"
task137a_expected="$(printf '%s\n' docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md packages/local-runtime/src/mounted-artifact-authority-operation.ts packages/local-runtime/src/portable-workspace-lifecycle.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts | LC_ALL=C sort -u)"
test "$task137a_actual" = "$task137a_expected"
npm test -- packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/agent/test/wake-supervisor.test.ts
npm run typecheck
test ! -e packages/local-runtime/src/index.ts
! rg -n 'mounted-artifact-authority-operation|FactoryIssuedMountedRuntimeCapture' packages/agent/src/index.ts
assert_git_authority_context
test ! -s "$(git rev-parse --git-path info/grafts)"
test ! -s "$(git rev-parse --git-path shallow)"
test -z "$(git ls-files -v | sed -n '/^[a-zS] /p')"
test -z "$(git ls-files --others --ignored --exclude-standard -- packages scripts docs/agentic/claims)"
git diff --check
npm run factory:check
```

Its temporary-repository suite includes clean physical-checkout execution and
alternate worktree/index/config/Git-directory counterfactuals in addition to
every CF-1R20/CF-1R21 hidden-state and lineage case.

### Exact P/R0/H preflight invocations

Before each dispatch, the coordinator replaces
`COORDINATOR_ATTESTATION_SHA` with the literal lowercase SHA of that task's
sibling program-registry attestation commit and runs only the applicable block
from a clean physical task checkout. These are the complete preflight commands;
preflight no longer derives from a phase substitution in a review command.

```bash
set -euo pipefail
git_authority_repo_root="$(pwd -P)"
assert_git_authority_context() { local -a v; mapfile -t v < <(compgen -v | LC_ALL=C awk '/^GIT_/ { print }'); if test "${#v[@]}" -eq 1; then test "${v[0]}" = GIT_PAGER || return 70; test "$GIT_PAGER" = cat || return 70; unset GIT_PAGER; elif test "${#v[@]}" -ne 0; then return 70; fi; test "$(git rev-parse --is-inside-work-tree)" = "true"; test "$(git rev-parse --show-toplevel)" = "$git_authority_repo_root"; }
assert_git_authority_context
node scripts/check-resident-task-prerequisites.mjs --task task140p --phase preflight --manifest docs/agentic/claims/task-140-p-prerequisites.json --claim docs/agentic/claims/task-140-p-private-prompt-admission.md --coordinator-attestation COORDINATOR_ATTESTATION_SHA
assert_git_authority_context
```

```bash
set -euo pipefail
git_authority_repo_root="$(pwd -P)"
assert_git_authority_context() { local -a v; mapfile -t v < <(compgen -v | LC_ALL=C awk '/^GIT_/ { print }'); if test "${#v[@]}" -eq 1; then test "${v[0]}" = GIT_PAGER || return 70; test "$GIT_PAGER" = cat || return 70; unset GIT_PAGER; elif test "${#v[@]}" -ne 0; then return 70; fi; test "$(git rev-parse --is-inside-work-tree)" = "true"; test "$(git rev-parse --show-toplevel)" = "$git_authority_repo_root"; }
assert_git_authority_context
node scripts/check-resident-task-prerequisites.mjs --task task140r0 --phase preflight --manifest docs/agentic/claims/task-140-r0-prerequisites.json --claim docs/agentic/claims/task-140-r0-factory-prompt-binding.md --coordinator-attestation COORDINATOR_ATTESTATION_SHA
assert_git_authority_context
```

```bash
set -euo pipefail
git_authority_repo_root="$(pwd -P)"
assert_git_authority_context() { local -a v; mapfile -t v < <(compgen -v | LC_ALL=C awk '/^GIT_/ { print }'); if test "${#v[@]}" -eq 1; then test "${v[0]}" = GIT_PAGER || return 70; test "$GIT_PAGER" = cat || return 70; unset GIT_PAGER; elif test "${#v[@]}" -ne 0; then return 70; fi; test "$(git rev-parse --is-inside-work-tree)" = "true"; test "$(git rev-parse --show-toplevel)" = "$git_authority_repo_root"; }
assert_git_authority_context
node scripts/check-resident-task-prerequisites.mjs --task task140h --phase preflight --manifest docs/agentic/claims/task-140-h-prerequisites.json --claim docs/agentic/claims/task-140-h-private-resident-invocation.md --coordinator-attestation COORDINATOR_ATTESTATION_SHA
assert_git_authority_context
```

### Exact P/R0/H review commands

Worker GREEN and both fresh reviewers run the applicable complete materialized
command below. The leading checker uses `--phase review`; no token or argument
may be omitted, read from the environment, or reconstructed from older prose.

```bash
set -euo pipefail
git_authority_repo_root="$(pwd -P)"
assert_git_authority_context() { local -a v; mapfile -t v < <(compgen -v | LC_ALL=C awk '/^GIT_/ { print }'); if test "${#v[@]}" -eq 1; then test "${v[0]}" = GIT_PAGER || return 70; test "$GIT_PAGER" = cat || return 70; unset GIT_PAGER; elif test "${#v[@]}" -ne 0; then return 70; fi; test "$(git rev-parse --is-inside-work-tree)" = "true"; test "$(git rev-parse --show-toplevel)" = "$git_authority_repo_root"; }
assert_git_authority_context
node scripts/check-resident-task-prerequisites.mjs --task task140p --phase review --manifest docs/agentic/claims/task-140-p-prerequisites.json --claim docs/agentic/claims/task-140-p-private-prompt-admission.md --coordinator-attestation COORDINATOR_ATTESTATION_SHA
npm test -- packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/local-runtime/test/task-orchestrator-handoff-port-imports.test.ts
npm run typecheck
! rg -n 'task-orchestrator-approval-admission|task-orchestrator-handoff-port' packages/agent/src/index.ts
assert_git_authority_context
git diff --check
npm run factory:check
```

```bash
set -euo pipefail
git_authority_repo_root="$(pwd -P)"
assert_git_authority_context() { local -a v; mapfile -t v < <(compgen -v | LC_ALL=C awk '/^GIT_/ { print }'); if test "${#v[@]}" -eq 1; then test "${v[0]}" = GIT_PAGER || return 70; test "$GIT_PAGER" = cat || return 70; unset GIT_PAGER; elif test "${#v[@]}" -ne 0; then return 70; fi; test "$(git rev-parse --is-inside-work-tree)" = "true"; test "$(git rev-parse --show-toplevel)" = "$git_authority_repo_root"; }
assert_git_authority_context
node scripts/check-resident-task-prerequisites.mjs --task task140r0 --phase review --manifest docs/agentic/claims/task-140-r0-prerequisites.json --claim docs/agentic/claims/task-140-r0-factory-prompt-binding.md --coordinator-attestation COORDINATOR_ATTESTATION_SHA
npm test -- packages/ontology/test/resident-wake-contracts.test.ts packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/local-runtime/test/task-orchestrator-approval-admission-imports.test.ts packages/local-runtime/test/task-orchestrator-handoff-port-imports.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/mounted-prompt-artifact-store.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/agent-handoff-projection.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts
npm run typecheck
! rg -n 'task-orchestrator-approval-admission|task-orchestrator-handoff-port' packages/agent/src/index.ts
! rg -n 'renderExactlyBoundProductionSpecialistPrompt' packages/local-runtime packages/agent/src packages/agent/test
assert_git_authority_context
git diff --check
npm run factory:check
```

```bash
set -euo pipefail
git_authority_repo_root="$(pwd -P)"
assert_git_authority_context() { local -a v; mapfile -t v < <(compgen -v | LC_ALL=C awk '/^GIT_/ { print }'); if test "${#v[@]}" -eq 1; then test "${v[0]}" = GIT_PAGER || return 70; test "$GIT_PAGER" = cat || return 70; unset GIT_PAGER; elif test "${#v[@]}" -ne 0; then return 70; fi; test "$(git rev-parse --is-inside-work-tree)" = "true"; test "$(git rev-parse --show-toplevel)" = "$git_authority_repo_root"; }
assert_git_authority_context
node scripts/check-resident-task-prerequisites.mjs --task task140h --phase review --manifest docs/agentic/claims/task-140-h-prerequisites.json --claim docs/agentic/claims/task-140-h-private-resident-invocation.md --coordinator-attestation COORDINATOR_ATTESTATION_SHA
npm test -- packages/ontology/test/resident-wake-contracts.test.ts packages/agent/test/production-model-invocation-admission.test.ts packages/agent/test/production-specialist-invocation-proof.test.ts packages/agent/test/task-orchestrator-approval-admission.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-mounted-authority.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/runtime.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/resident-live-acceptance-adapters.test.ts packages/local-runtime/test/task-orchestrator-approval-admission-imports.test.ts packages/local-runtime/test/task-orchestrator-handoff-port-imports.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/agent-handoff-projection.test.ts packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/local-runtime/test/resident-specialist-acceptance.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts
npm run typecheck
rg -n 'runEvidenceTriageResidentLiveAcceptance' packages/agent/test/evidence-triage-nous-live.test.ts
rg -n 'runPrrNegotiationResidentLiveAcceptance' packages/agent/test/prr-negotiation-nous-live.test.ts
rg -n 'runTaskOrchestratorEvidenceTriageResidentLiveAcceptance' packages/agent/test/task-orchestrator-evidence-triage-live.test.ts
! rg -n 'createAgentRuntime|createTaskOrchestrator|createTaskOrchestratorProviderApprovalAdapter|defaultLocalAgentRuntimeFactory|createSqlitePrrRuntime|runEvidenceTriageWorkflow|runPrrNegotiationWorkflow|prepareSpecialistRun|invokeSpecialistModel|runtime\.invokeModel|renderProductionSpecialistPrompt|buildLocalRuntimeStatusPromptArtifact' packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts packages/agent/test/fixtures/resident-live-acceptance-adapters.ts
rg -n 'runResidentSpecialistAcceptance' packages/agent/test/fixtures/resident-live-acceptance-adapters.ts packages/local-runtime/src/agent-nous-smoke.ts
! rg -n 'runtime\.invokeModel|renderProductionSpecialistPrompt|prepareSpecialistRun|invokeSpecialistModel|runEvidenceTriageWorkflow|runPrrNegotiationWorkflow|buildLocalRuntimeStatusPromptArtifact|createSqlitePrrRuntime|defaultLocalAgentRuntimeFactory|\.cestus/local/prompt-artifacts' packages/local-runtime/src/agent-nous-smoke.ts
! rg -n 'production-model-invocation-admission|production-prompt-readback|task-orchestrator-approval-admission|task-orchestrator-handoff-port' packages/agent/src/index.ts
assert_git_authority_context
git diff --check
npm run factory:check
```

### CF-1R22 dispatch and review rule

The serialized dependency graph, immutable prerequisite maps, file ownership,
and sibling-attestation trust model remain CF-1R18 through CF-1R21. Every
implementation message pins the task's exact coordinator attestation SHA and
specifically states that the coordinator approves use of
`superpowers:subagent-driven-development` for that exact task. No source lane
starts before reviewed and coordinator-integrated Task117A.

Two fresh independent Terra/xhigh reviewers inspect exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`. They reproduce the
alternate-worktree/index bypass and prove it fails, run the complete Task137A
command in clean and hidden-state fixtures, and verify every exact P/R0/H
preflight/review command contains and validates the literal attestation SHA.
Exactly two unqualified approvals permit coordinator-only plan integration.
Source, full/live/provider/credential/Nous/reset-credit/`neo`/self-integration/
merge remain closed.

## CF-1R23 - Final post-command authority revalidation

This terminal section incorporates the complete CF-1R23 post-command material,
Task117A command, Task137A command, and dispatch/review rule above. Together
those CF-1R23 sections supersede CF-1R22 only for the complete Task117A and
Task137A commands. Every other CF-1R18 through CF-1R22 contract, including the
physical-checkout guard, sibling-attestation model, and exact P/R0/H commands,
remains current.

Two fresh independent Terra/xhigh reviewers inspect exact range
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`. They reproduce the exact
post-audit freeze mutation and post-test seventh-path counterfactuals and prove
both fail at the final assertion, then recheck every preserved authority and
materializability requirement. Exactly two unqualified approvals permit
coordinator-only plan integration. Source, full/live/provider/credential/Nous/
reset-credit/`neo`/self-integration/merge remain closed.
