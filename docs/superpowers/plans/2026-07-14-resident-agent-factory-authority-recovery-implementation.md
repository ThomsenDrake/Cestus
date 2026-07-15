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

`UntrustedSpecialistHandoffPreparationV1` is a normalized data input, not a
capability, authority, receipt, or mint token. It contains only task, attempt,
approved run, run type, safe final-output/material intent, and a deterministic
preparation hash. It has no authority, store, registration, provenance, H,
recorded, manifest, lifecycle, or terminal field. Anyone can present a shaped
value, so Task135A and Task140H must parse and rebind it independently; only
the private Task140R factory closure may connect a reviewed runner normalizer,
Task135A stores, and Task140H orchestration. This is the sole mint/consume
path for executable runtime capability, and it does not exist before Task140R.

## Dependency Graph

```text
Task132A registrar attestation ──> Task133
           │
           └─> Task134A nonterminal preparation ──> Task135A mounted stores
                                                        │
Task133 + Task135A + original 136–139 prerequisites ──┴─> Task140H terminal integration
```

## Task 132A: Factory-Held Registrar Attestation

**Files:**

- Modify: `packages/local-runtime/src/agent-runtime-factory.ts`
- Modify: `packages/local-runtime/src/agent-runtime-context-packs.ts`
- Modify: `packages/local-runtime/test/agent-runtime-context-packs.test.ts`
- Create: `packages/local-runtime/test/agent-runtime-context-attestation.test.ts`
- Modify only if needed to expose existing private registrar evidence:
  `packages/agent/src/prr-context-packs.ts`,
  `packages/agent/src/operational-context-packs.ts`, and
  `packages/agent/src/investigative-context-packs.ts`
- Claim: new Task132A recovery claim.

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

- Modify: `packages/local-runtime/src/agent-runtime-specialist-runners.ts`
- Modify: `packages/local-runtime/test/agent-runtime-specialist-runners.test.ts`
- Create: `packages/local-runtime/test/agent-runtime-runner-preparation.test.ts`
- Claim: new Task134A recovery claim.

**Consumes:** Task132A's reviewed factory closure as a rebase prerequisite and
the existing public four-field runner dispatch request. **Produces:** only the
normalized `UntrustedSpecialistHandoffPreparationV1` data input described
above. It has no executable capability constructor: before Task140R the
default factory keeps its existing blocked runner registry, and Task135A
consumes/revalidates data rather than a factory capability. It produces no
recorded/terminal success.

- [ ] **Step 1: Write causal RED tests.**

  Prove a caller-supplied authority/store/registration/provenance/readiness/H
  tuple rejects before delegate/H activity; mutable input cannot cross an
  await; and a delegate event-shaped/durable-looking response is classified as
  preparation only, never a durable or terminal result.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/local-runtime/test/agent-runtime-runner-preparation.test.ts packages/agent/test/specialist-runner-kernel.test.ts` and record structural-constructor and terminal-claim failures.

- [ ] **Step 3: Implement the minimal nonterminal boundary.**

  Normalize once before await; return only
  `UntrustedSpecialistHandoffPreparationV1` with no H readback, recorded,
  manifest, lifecycle, store, authority, or terminal assertion. Delete/refuse
  any public production-capability constructor or closed tuple path. The
  default factory remains blocked; the only future executable closure is
  Task140R's private composition after Task135A.

- [ ] **Step 4: Run GREEN and exact gate.**

  `npm test -- packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/local-runtime/test/agent-runtime-runner-preparation.test.ts packages/agent/test/specialist-runner-kernel.test.ts && npm run typecheck && git diff --check && npm run factory:check`

- [ ] **Step 5: Commit and fresh review.**

  Commit only the listed files and Task134A claim. Coordinator integration
  unblocks Task135A; it does not authorize H finalization.

## Task 135A: Mounted Preparation Stores

**Files:**

- Modify: `packages/local-runtime/src/mounted-agent-artifact-stores.ts`
- Modify: `packages/local-runtime/test/mounted-agent-artifact-stores.test.ts`
- Claim: new Task135A recovery claim.

**Consumes:** a parsed-but-untrusted Task134A preparation input. **Produces:**
exact mounted material and manifest preparation readbacks for later H
sequencing; it never appends H recorded, terminal, or task-status completion
itself and does not receive an H capability.

- [ ] **Step 1: Write causal RED tests.**

  Prove forged/nonterminal delegate preparation, material-after-manifest,
  manifest-before-material, mismatched authority, and a terminal-looking
  substitute all reject before a store or H activity.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/agent/test/specialist-handoff-projection.test.ts` and record the missing preparation/readback failure.

- [ ] **Step 3: Implement mounted preparation readback only.**

  Bind material then manifest to mounted authority, task/attempt/run and the
  frozen preparation candidate. Return preparation evidence, not completion;
  no temporary/local/fallback copy is permitted.

- [ ] **Step 4: Run GREEN and exact gate.**

  `npm test -- packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/agent/test/specialist-handoff-projection.test.ts && npm run typecheck && git diff --check && npm run factory:check`

- [ ] **Step 5: Commit and fresh review.**

  Commit only the listed files and Task135A claim. Coordinator integration
  records the SHA for Task140H; it never marks a handoff terminal.

## Task 140H: H-Owned Exact H Finalization

**Files:**

- Modify: `packages/agent/src/task-orchestrator.ts`
- Modify: `packages/agent/test/task-orchestrator-dispatch.test.ts`
- Claim: new Task140H claim.

**Prerequisites:** reviewed/coordinator-integrated Task132A, Task133, Task134A,
Task135A, Task136–139, and their recorded rebases.

- [ ] **Step 1: Write causal RED tests.**

  Prove preparation cannot be terminal without orchestrator-owned H
  prepare/bind/readback, that swapped material/manifest/authority/readback
  rejects before terminal/status append, and that a delegate/H echo cannot
  produce completion. Assert the orchestrator performs the sole ordered H
  sequence and the factory composes, but does not invent, its inputs.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/specialist-runner-kernel.test.ts` and record the absent exact-finalization path.

- [ ] **Step 3: Implement exact orchestration.**

  Consume Task135A preparation readback, have task-orchestrator execute H
  prepare/bind/readback and terminal/task-status sequencing, and require the
  exact mounted authority/task/attempt/run/material/manifest binding at every
  step. It is the only commit that changes H sequencing.

- [ ] **Step 4: Run GREEN and exact gate.**

  `npm test -- packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/specialist-runner-kernel.test.ts && npm run typecheck && git diff --check && npm run factory:check`

- [ ] **Step 5: Commit and fresh review.**

  Commit only the listed files and Task140H claim. H review approves this
  commit before the serialized R wiring claim starts.

## Task 140R: R-Owned Factory Wiring

**Files:**

- Modify: `packages/local-runtime/src/agent-runtime-factory.ts`
- Modify: `packages/local-runtime/test/agent-runtime-composition.test.ts`
- Claim: new Task140R claim.

**Prerequisites:** reviewed/coordinator-integrated Task140H plus every Task140H
prerequisite. This is the sole executable-capability mint: its private closure
connects reviewed Task134A normalization, Task135A preparation stores, and
Task140H orchestration. It accepts no public structural tuple and remains
blocked on any missing captured collaborator.

- [ ] **Step 1: Write causal RED tests.**

  Prove a public tuple/lookalike cannot construct the closure; forged
  preparation/store/H readback blocks before terminal action; and the actual
  closure delegates terminal sequencing only to Task140H.

- [ ] **Step 2: Run focused RED.**

  Run `npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts` and record the missing private wiring failure.

- [ ] **Step 3: Implement private wiring only.**

  Construct the closure inside the factory from reviewed collaborators and
  expose only the existing narrow orchestration route. Do not duplicate H
  prepare/bind/readback or accept caller capability arguments.

- [ ] **Step 4: Run GREEN and exact gate.**

  `npm test -- packages/local-runtime/test/agent-runtime-composition.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts && npm run typecheck && git diff --check && npm run factory:check`

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
