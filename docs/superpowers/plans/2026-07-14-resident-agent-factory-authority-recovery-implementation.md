# Resident Agent Factory Authority Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the Task132/134/135/140 cycle while keeping verified context
registrations, runner preparation, mounted stores, and terminal H readback in
their actual source-of-truth owners.

**Architecture:** The default factory remains blocked until it has actual
registrar or store inputs. Task132 first captures real package-registrar facts
inside a factory-held context closure. Task134 next normalizes a runner result
as an explicitly untrusted, nonterminal preparation input; Task135 validates
mounted material/manifest preparation; the later H-owned orchestrator/factory
integration alone performs prepare, bind, readback, and terminal completion.

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
| Runtime-composition Task140 factory-only writer | Task140H owns the H/orchestrator commit first; Task140R owns the subsequent factory wiring commit. The final reviewer reads both commits as one range. |
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
from `packages/agent/src/index.ts` or accepted by a public runtime input. The
map value is a closure that rechecks task/attempt/approved-run/hash and returns
only the factory-captured material store, manifest store, and reparsed material
candidate. A shaped dispatch result, structural port, stores, material,
readback, or H capability cannot populate this map. Missing, swapped, stale,
or mismatched lookup fails before H prepare or a terminal append. Task140R
alone installs this closure after every prerequisite is integrated.

## Dependency Graph

```text
Task132A registrar attestation ──> Task133
           │
           └─> Task134A canonical-codec + nonterminal preparation ──> Task135A mounted stores
                                                        │
Task133 + Task135A + original 136–139 prerequisites ──┴─> Task140H terminal integration
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
**Produces:** a factory-held context-attestation closure that can create a
verified context capability only from the actual registry it captured. Each
producer module keeps its existing `WeakMap` private and exports only a
read-only registry lookup; no producer exports a record/mint operation. The
factory calls all three lookups against its own captured registry, and the
context capability repeats those lookups rather than accepting identity text or
a registrar tuple. Default composition blocked on a missing lookup is correct.

- [ ] **Step 1: Write causal RED tests.**

  Add table cases that call the public context surface with a swapped producer,
  registration, or parser identity and assert rejection before `build` runs.
  Add positive fixtures built through real PRR (`prr-request`), operational
  (no manifest), and investigative (plural high-water) registrars. The direct
  factory call with a structural registrar tuple must reject before builder
  activity.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/local-runtime/test/agent-runtime-context-packs.test.ts packages/local-runtime/test/agent-runtime-context-attestation.test.ts packages/agent/test/context-packs.test.ts` and record the expected identity/constructor failures.

- [ ] **Step 3: Implement the minimal registrar readback and closure.**

  Add one read-only accessor in each producer module over its existing private
  `WeakMap`; it returns no writable registry callback and returns `undefined`
  for a manually registered or foreign registry. The factory captures only
  accessors' immutable snapshots for its own registry. The context capability
  calls the same accessors on that captured registry and compares descriptor,
  parser, producer, and registration identity before resolution. The focused
  test uses actual `registerPrrContextPackBuilders`,
  `registerOperationalContextPackBuilders`, and
  `registerInvestigativeContextPacks` calls; the factory test asserts the
  default empty registry blocks. Do not equate producer to source projection or
  accept an identity tuple/callback from callers.

- [ ] **Step 4: Run GREEN and exact gate.**

  `npm test -- packages/local-runtime/test/agent-runtime-context-packs.test.ts packages/local-runtime/test/agent-runtime-context-attestation.test.ts packages/agent/test/context-packs.test.ts && npm run typecheck && git diff --check && npm run factory:check`

- [ ] **Step 5: Commit and fresh review.**

  Commit only the listed files and Task132A claim, then request a fresh
  Terra/xhigh review. Coordinator integration unblocks Task133 and the
  serialized Task134A factory writer.

## Task 134A: Factory-Closed Normalized Handoff Preparation

**Files:**

- Create from the preserved Task134 recovery base:
  `packages/local-runtime/src/agent-runtime-specialist-runners.ts`
- Create from the preserved Task134 recovery base:
  `packages/local-runtime/test/agent-runtime-specialist-runners.test.ts`
- Create: `packages/local-runtime/test/agent-runtime-runner-preparation.test.ts`
- Create: `packages/agent/src/specialist-handoff-preparation.ts`
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
`UntrustedSpecialistHandoffPreparationV1` data. It has no executable
capability constructor: before Task140R the default factory keeps its existing
blocked runner registry, and Task135A consumes/revalidates data rather than a
factory capability. It produces no recorded/terminal success.

- [ ] **Step 1: Write causal RED tests.**

  In the agent codec test, prove a local parser/hash divergence, a mismatched
  preparation/readback hash, and accessor/prototype/symbol/sparse shaped input
  reject. In the runner tests, prove a caller-supplied
  authority/store/registration/provenance/readiness/H tuple rejects before
  delegate/H activity; mutable input cannot cross an await; and a delegate
  event-shaped/durable-looking response is classified as preparation only,
  never a durable or terminal result.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/agent/test/specialist-handoff-preparation.test.ts packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/local-runtime/test/agent-runtime-runner-preparation.test.ts packages/agent/test/specialist-runner-kernel.test.ts` and record codec, structural-constructor, and terminal-claim failures.

- [ ] **Step 3: Implement the minimal nonterminal boundary.**

  First implement the agent-owned canonical parser/normalizer/hash functions
  and export them through `packages/agent/src/index.ts`; they must be pure and
  have no H or store import. The runner then normalizes once before await and
  returns only that parsed `UntrustedSpecialistHandoffPreparationV1`, with no
  H readback, recorded, manifest object, lifecycle, store, authority, or
  terminal assertion. Delete/refuse any public production-capability
  constructor or closed tuple path. The default factory remains blocked; the
  only future executable closure is Task140R's private composition after
  Task135A.

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

**Consumes:** a parsed-but-untrusted Task134A preparation input. **Produces:**
the canonical `MountedSpecialistHandoffPreparationReadbackV1` after exact
mounted material then manifest preparation for later H sequencing. These files
do not exist on the program branch, so this task creates them rather than
silently assuming they landed. It never appends H recorded, terminal, or
task-status completion itself and does not receive an H capability.

- [ ] **Step 1: Write causal RED tests.**

  Prove forged/nonterminal delegate preparation, codec parser/hash divergence,
  material-after-manifest, manifest-before-material, mismatched authority, and
  a terminal-looking substitute all reject before a store or H activity.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/agent/test/specialist-handoff-projection.test.ts` and record the missing preparation/readback failure.

- [ ] **Step 3: Implement mounted preparation readback only.**

  Parse the Task134A input only with the agent-owned codec, recheck mounted
  authority plus task/attempt/run, and create canonical data-only material- and
  manifest-store binding hashes. Do **not** put material, create a manifest,
  append H, or claim a material/manifest artifact hash: Task140H alone does
  those terminal-sequence operations through its private factory lookup.
  Return preparation evidence, not completion; no temporary/local/fallback
  copy or local parser/hash implementation is permitted.

- [ ] **Step 4: Run GREEN and exact gate.**

  `npm test -- packages/agent/test/specialist-handoff-preparation.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/agent/test/specialist-handoff-projection.test.ts && npm run typecheck && git diff --check && npm run factory:check`

- [ ] **Step 5: Commit and fresh review.**

  Commit only the listed files and Task135A claim. Coordinator integration
  records the SHA for Task140H; it never marks a handoff terminal.

**Frozen rebase gate:** Task135A begins only after reviewed/coordinator-
integrated Task134A and a base descendant of CF-1 integration
`48c9cbcdcf723bcc74868f782bc2375bae565ae6`, Task121
`1a92a2c2e41a6f15282307c6a29deb196a2e3fb5`, Task122
`9839fbf8c9010425f8585a4eb5edd8879c738eba`, Task123
`87f5d940a4476fdcb0040c4554d5a7a2172d0c4b`, and Task125
`2e5c35ab7bca33df9f1a0c482c496fbb93350086`. Its claim records all full SHAs,
Task134A integration SHA, and exact program-base SHA.

## Task 140H: H-Owned Exact H Finalization

**Files:**

- Modify: `packages/agent/src/task-orchestrator.ts`
- Create: `packages/agent/src/task-orchestrator-handoff-port.ts`
- Modify: `packages/agent/src/runtime.ts`
- Modify: `packages/agent/src/runtime-types.ts`
- Modify: `packages/agent/test/task-orchestrator-dispatch.test.ts`
- Modify supporting H tests only as required by removal of public runtime
  injection: `packages/agent/test/task-orchestrator-recovery.test.ts`,
  `packages/agent/test/task-orchestrator-evidence-triage.test.ts`, and
  `packages/agent/test/task-orchestrator-evidence-triage-live.test.ts`
- Create: `packages/agent/test/task-orchestrator-handoff-port.test.ts`
- Claim: new Task140H claim.

**Prerequisites:** reviewed/coordinator-integrated Task132A, Task133, Task134A,
Task135A, Task136–139, and their recorded rebases. Its claim enumerates every
accepted full 40-character SHA for 132 through 139 and proves its base descends
from CF-1 integration `48c9cbcdcf723bcc74868f782bc2375bae565ae6`; a candidate
SHA or “original prerequisites” is insufficient.

- [ ] **Step 1: Write causal RED tests.**

  Prove preparation cannot be terminal without the exact registry-keyed
  factory port plus orchestrator-owned H prepare/bind/readback; a structural
  port, supplied H capability, swapped material candidate/store binding/
  authority/readback, or delegate/H echo rejects before terminal/status append.
  Prove public `handoffCapability` is no longer forwarded or used—even a
  throwing or echoing object cannot affect H—and a runner without `WeakMap`
  registration fails closed. Only the valid registered port may produce the
  ordered material -> manifest -> readback -> terminal sequence.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts packages/agent/test/specialist-runner-kernel.test.ts` and record missing-port and public-injection failures.

- [ ] **Step 3: Implement exact orchestration.**

  Import the agent-owned preparation codec; do not create a task-orchestrator
  parser/hash/shape. Reparse its material candidate and Task135A's data-only
  store-binding readback, recompute every hash, and use only the `WeakMap`-
  registered factory port to relookup real stores. Have task-orchestrator then
  execute H prepare/bind/readback and terminal/task-status sequencing. Remove
  functional use of public structural `handoffCapability` injection from
  runtime creation and H sequence; it can remain inert only until Task140R
  removes it from local factory composition. Require exact mounted
  authority/task/attempt/run/material/manifest binding at every step. This is
  the only commit that changes H sequencing.

- [ ] **Step 4: Run GREEN and exact gate.**

  `npm test -- packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts packages/agent/test/specialist-runner-kernel.test.ts && npm run typecheck && git diff --check && npm run factory:check`

- [ ] **Step 5: Commit and fresh review.**

  Commit only the listed files and Task140H claim. H review approves this
  commit before the serialized R wiring claim starts.

## Task 140R: R-Owned Factory Wiring

**Files:**

- Modify: `packages/local-runtime/src/agent-runtime-factory.ts`
- Modify: `packages/local-runtime/test/agent-runtime-composition.test.ts`
- Modify: `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`
- Claim: new Task140R claim.

**Prerequisites:** reviewed/coordinator-integrated Task140H plus every Task140H
prerequisite. Its claim repeats the exact 132–139 full SHAs, Task140H SHA, and
CF-1 integration `48c9cbcdcf723bcc74868f782bc2375bae565ae6`. This is the sole
executable-capability mint: its private closure captures reviewed Task134A
normalization and Task135A store binding, then registers the H-owned `WeakMap`
execution closure against the exact runner registry. It removes obsolete local
factory `handoffCapability` injection. It accepts no public structural tuple
and remains blocked on any missing captured collaborator.

- [ ] **Step 1: Write causal RED tests.**

  Prove a public tuple/lookalike cannot construct or register the closure;
  forged preparation/store/H readback and caller-supplied `handoffCapability`
  block before terminal action; and the actual captured closure delegates
  terminal sequencing only to Task140H.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts` and record the missing private wiring failure.

- [ ] **Step 3: Implement private wiring only.**

  Construct the closure inside the factory from reviewed collaborators, bind it
  through the H-owned non-indexed `WeakMap` registration seam, and expose only
  the existing narrow orchestration route. Remove old local
  `handoffCapability` construction; do not duplicate H prepare/bind/readback
  or accept caller capability arguments.

- [ ] **Step 4: Run GREEN and exact gate.**

  `npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/task-orchestrator-handoff-port.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts && npm run typecheck && git diff --check && npm run factory:check`

- [ ] **Step 5: Commit and complete-range review.**

  Commit only the listed files and Task140R claim. A reviewer distinct from
  both authors reads the complete Task140H base through Task140R head and
  approves the H/R interaction before coordinator-only integration.

## Review And Dispatch Order

The coordinator first obtains a fresh plan review for this amendment. It then
dispatches Task132A; after review/integration, Task133 and serialized Task134A
may start. Task135A starts only after Task134A integration. Task140H remains
blocked until Task133, Task135A, and all original 136–139 prerequisites are
reviewed/integrated; Task140R follows reviewed Task140H. Each rejected
candidate is repaired forward with a fresh review; no child self-integrates.
