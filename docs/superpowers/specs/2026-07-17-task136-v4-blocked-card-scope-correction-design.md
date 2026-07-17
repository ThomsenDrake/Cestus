# Task136 V4 Blocked-Card Scope Correction Design

**Date:** 2026-07-17

**Status:** Approved by the sole program owner through the explicit
“Authorize A and B” decision. This document is the bounded interpretation of
that authorization; it does not reopen Wave 0, add a release card, change a
safety invariant, or authorize an additional repair beyond the three packets
named here.

## Purpose

The strict Task136 V4 repository prefix is valid and released through record
13. Three later cards cannot safely advance under their current executable
scope:

1. `CF1-HR` cannot produce the frozen authority-bound Handoff V2 ABI from its
   five original paths.
2. `G136-SC` cannot close every caller-structural completion route while the
   legacy execution-loop pair remains outside the card.
3. `Task126-R` has a reproduced import-policy P1 after its automatic repair
   ceiling, even though the required correction is test-policy-only.

This amendment changes the executable ownership description only for the two
unreleased V4 cards, updates the assurance fingerprint and tests, and grants
one finite exceptional Task126-R packet. V1, V2, V3, existing strict records,
release order, prerequisites, provider behavior, and production BYOK behavior
remain unchanged.

## Considered Approaches

### Recommended: in-place V4 correction for unreleased cards

Update the existing V4 contract's exact paths and commands for `CF1-HR` and
`G136-SC`, pin the corrected contract in the assurance checker, and prove that
the already released 13-record prefix remains byte-identical and valid. This
keeps one 29-card release graph and makes the executable contract tell the
truth about the safety work required by the frozen designs.

### Rejected: introduce V5 or new bridge cards

A new contract generation or new release cards would change the frozen
29-card graph merely to describe unreleased work. It would also create another
serial recovery generation. The authorized correction is narrower.

### Rejected: retain compatibility completion or unbound handoff paths

Letting a raw caller result complete a tool, treating resident bookkeeping as
domain authority, treating Handoff V1 as current, or accepting a caller-made
authority object would preserve the reproduced P1s. Compatibility is allowed
only as replayable, non-executable legacy state.

## Immutable Evidence

The correction must preserve these contract bytes exactly:

| Artifact | SHA-256 |
| --- | --- |
| `docs/agentic/contracts/task136-bounded-assurance-v1.json` | `d33864d9964a355067b7be86c78951d3df184a80b80765da3f51aab66e903fed` |
| `docs/agentic/contracts/task136-bounded-assurance-v2.json` | `c23a390cc3e4a3395c018a8532e0fa84b23a880782805f7cbcc463d9e8162ba4` |
| `docs/agentic/contracts/task136-bounded-assurance-v3.json` | `8934dbaf8246d295eba5ce825169ac08bb98f0e1b6b75a977657000cb46a1bbb` |

The raw JSON bytes of strict records 1-13 remain unchanged. Their candidate,
integration, review, prerequisite, release-event, and blob evidence remain
authoritative. The graph still contains exactly 29 cards in the existing order
and retains every existing prerequisite and transfer disposition except for
the added owned paths on the two unreleased cards below.

## Corrected CF1-HR Boundary

`CF1-HR` owns exactly these paths, in this order:

1. `packages/agent/src/specialist-runner-kernel.ts`
2. `packages/agent/test/specialist-runner-kernel.test.ts`
3. `packages/agent/src/specialist-handoff-projection.ts`
4. `packages/agent/test/specialist-handoff-projection.test.ts`
5. `packages/agent/src/specialist-handoff-manifest.ts`
6. `packages/agent/test/specialist-handoff-manifest.test.ts`
7. `packages/agent/src/specialist-handoff-authority.ts`
8. `packages/agent/test/specialist-handoff-authority.test.ts`
9. `packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts`
10. `packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`
11. `packages/ontology/src/contracts.ts`
12. `packages/ontology/test/agent-contracts.test.ts`
13. `packages/ontology/test/agent-resident-loop-contracts.test.ts`
14. `docs/agentic/claims/cf1-h-task136-complete-handoff-readback-projection.md`

Its exact card command is:

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/ontology/test/agent-contracts.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts
```

### Versioned manifest and event semantics

- `agent-specialist-handoff-manifest.v1` and its parser remain byte- and
  behavior-compatible historical contracts.
- A strict `agent-specialist-handoff-manifest.v2` is an additive V1 superset
  with the exact seven-field `authorityBinding` from the frozen durable
  handoff design.
- The existing prepared and recorded event names accept a strict legacy V1
  payload or a strict V2 payload. V2 carries
  `manifestSchemaVersion: "agent-specialist-handoff-manifest.v2"` and the exact
  same `authorityBinding` as the manifest. Event registry guidance advances
  to the V2 contract without making V1 history unparsable.
- The H-owned projection may classify verified V1 history only as
  `legacy-unbound`. It exposes no executable, resume, approval, send,
  `terminal-consistent`, or `task-completed` state from V1.
- A V2 `verified` readback requires canonical manifest bytes, exact hashes,
  matching prepared/recorded payloads, current authority revalidation,
  terminal and task-status evidence, and the complete frozen
  `HandoffReadback.v1` surface.

### Capability-derived mounted authority

The agent layer introduces a non-indexed, process-local branded handoff
authority witness. Structural or copied witnesses fail WeakMap membership.
The portable mounted-store producer issues the witness from its already
authenticated controller state and supplies a before/after revalidation
closure. The kernel consumes that witness; it never accepts a raw
`HandoffAuthorityBinding` from a caller.

The portable producer derives the exact binding as follows:

- `workspaceIdentityHash`: canonical SHA-256 of schema
  `mounted-handoff-workspace-identity.v1`, `workspaceId`, and
  `workspaceIdentityEventId`.
- `mountGeneration`: the captured `admissionGenerationId`.
- `ledgerStoreIdentity`: the captured `ledgerStoreEvidenceId`.
- `artifactStoreIdentity`: the captured `artifactStoreEvidenceId`.
- `ledgerHighWaterEventId`: the captured current `highWaterMark`, which must be
  a canonical event ID.
- `policyHash`: the captured `policyDigest`.
- `activeLocksHash`: the captured `lockStateDigest`.

Issuance and every revalidation fail closed if the controller is forged,
consumed, stale, remounted, superseded, externally advanced outside the exact
handoff sequence, or no longer matches the captured store, identity, policy,
lock, and high-water tuple. No root path, device detail, credential, provider
body, or source bytes enter the binding.

The existing V1 recording API remains available solely for legacy callers.
CF1 adds a separate authority-bound recording path; it does not silently turn
V1 calls into V2 or permit a compatibility fallback. Later release cards may
adopt the V2 path only when they possess the factory-issued witness.

## Corrected G136-SC Boundary

`G136-SC` owns exactly these paths, in this order:

1. `packages/agent/src/tool-gateway.ts`
2. `packages/agent/src/scheduler.ts`
3. `packages/agent/src/resident-loop-scheduler-completion.ts`
4. `packages/agent/src/execution-loop.ts`
5. `packages/agent/test/tool-gateway.test.ts`
6. `packages/agent/test/scheduler.test.ts`
7. `packages/agent/test/resident-loop-scheduler-completion.test.ts`
8. `packages/agent/test/execution-loop.test.ts`
9. `packages/agent/test/domain-execution-dispatcher.test.ts`
10. `docs/agentic/claims/task-136-scheduler-completion-adapter.md`
11. `packages/agent/test/resident-loop-scheduler-completion-imports.test.ts`
   with its existing transferred disposition to `G136-R`.

Its exact card command is:

```bash
npm test -- packages/agent/test/tool-gateway.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/resident-loop-scheduler-completion.test.ts packages/agent/test/execution-loop.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts
```

The correction has these exact semantics:

- No public gateway method may append `agent.tool.completed` from a caller's
  structural `AgentToolResult`. The only completion append consumes opaque
  evidence issued after durable reread by the completion adapter.
- A result locator refers to independently appended domain result events. The
  adapter rereads the exact events and current request stream before and after
  validation and binds request, run, tool/version, approved preview, execution
  claim, ordering, event/artifact IDs, read-model changes, and summary.
- Gateway lifecycle events and resident plan/observation/tool-step/result
  bookkeeping are never domain-result authority. A descriptor cannot append a
  bookkeeping record and then use that record to authorize its own completion.
- Missing, pre-claim, duplicate, swapped, cross-request, cross-run, stale,
  terminal, unreadable, or mismatched locators fail closed with no completion
  append. Concurrent terminalization also fails closed.
- The legacy fake execution loop claims execution and uses the same opaque
  completion path. Its executor must have independently appended the exact
  durable domain result it returns; invented event IDs no longer complete.
- The transferred import-policy test continues to prove there is no second
  completion append route before `G136-R` assumes its ownership.

No new generic result event is invented by this card. Existing domain events
remain authoritative, and the adapter verifies their durable locator and
causal/request/run relationship instead of treating an event-shaped service
return as truth.

## Exceptional Task126-R Boundary

The Task126-R V4 path list and command do not change. The exceptional packet
may modify only:

- `packages/agent/test/byok-provider-imports.test.ts`
- `docs/agentic/claims/task-126-resident-full-vision-w1-byok-provider.md`

It replaces global name-based alias collection with binding-aware lexical
value analysis. The finite value domain distinguishes static strings,
standard ambient `require`, standard ambient `module`, official
`node:module`/`createRequire` factories, and unrelated values. It propagates
through const aliases, object destructuring (including computed `"require"`),
property/element access, transparent TypeScript wrappers, comma expressions,
and results of official `createRequire`.

Ambient `require` and `module` are standard only when unshadowed. Imported or
locally declared lookalikes, parameters, custom objects, and `createRequire`
from any non-`node:module` source remain unrelated. Direct, aliased,
destructured, computed, comma-indirect, and official-createRequire access to
the private module fails closed. No production BYOK type, export, runtime,
provider, secret, network, or credential behavior changes.

This authorization permits exactly one additional causal RED commit, one
minimal GREEN commit, and one final concurrent read-only review pair. It does
not reset the earlier repair count or authorize any later automatic repair.

## Assurance Correction

The V4 amendment owner changes only:

- `docs/agentic/contracts/task136-bounded-assurance-v4.json`
- `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`
- `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`
- `docs/agentic/claims/task-136-v4-blocked-card-scope-correction.md`

The tests first fail against the old CF1/G136 path and command sets. The GREEN
updates the two cards, the corrected V4 assurance fingerprint, and one-fact
mutants for every added/missing/reordered path and command projection. It also
proves:

- V1-V3 hashes are exact;
- all 29 card IDs and prerequisites are unchanged;
- raw release records 1-13 are byte-identical;
- repository mode emits exactly
  `TASK136_REPOSITORY_PREFIX_OK records=13 commands=13`, then fails closed with
  `repository release closure incomplete: expected 29 records, found 13`;
- released candidate/integration/current blobs still match their records;
- only unreleased CF1-HR and G136-SC ownership changed.

The previous V4 fingerprint and pretty-JSON hash remain historical facts in
the earlier design. The correction claim records the new values rather than
rewriting the earlier design or registry events.

## Finite Execution and Review

After the assurance amendment is reviewed and integrated:

- the preserved CF1 claim commit receives one causal RED and one minimal
  GREEN, then one concurrent architecture/executability pair; at most one
  consolidated repair and one final pair remain available;
- the preserved G136 claim/RED/GREEN history receives its one consolidated
  RED/GREEN repair, then its final concurrent pair; no further automatic
  repair follows;
- the preserved Task126 history receives the one authorized exceptional
  RED/GREEN packet, then its final concurrent pair; no further automatic
  repair follows.

Every implementation and review child uses GPT-5.6 Terra with xhigh reasoning.
Every implementation dispatch includes the exact standing authorization
sentence. Reviewers are read-only; SDD/TDD is neither relevant nor authorized
for reviewers. Only the coordinator edits the program registry, integrates
candidates, and appends strict release records in order.

## Verification and Stop Conditions

Each candidate runs its exact card command, a named cross-boundary command,
`npm run typecheck`, `npm run verify`, `git diff --check`,
`npm run factory:check`, clean tracked/untracked checks, and real non-symlinked
local dependency checks. The assurance amendment additionally runs contract
and repository modes.

Stop a child on data-loss risk, schema conflict outside the corrected paths,
unavailable dependency, credential or external-service need, or repeated
verifier failure. A reproduced final-pair P0/P1 is recorded as a durable
blocked card; P2, style, hypothetical hardening, and unreproduced concerns are
backlog. No reset, rebase, amend, squash, history rewrite, push, or `neo`
mutation is permitted.
