# Resident Agent Durable Handoffs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` only after the coordinator sends an
> explicit implementation-authorization message naming the approved Lane H
> specification, this approved plan, allowed task range, wave stop, model
> configuration, and no-self-merge rule. Steps use checkbox (`- [ ]`) syntax
> for tracking.

**Goal:** Make PRR negotiation, investigation planning, and ontology bootstrap
produce authority-bound, restart-rebuildable, browser-safe durable handoffs
without fallback persistence or an approval/effect bypass.

**Architecture:** Task 119 introduces the authority-bound v2 manifest,
append/readback projection, and closed diagnostic contract while retaining
strict historical v1 replay. Tasks 121–123 migrate the three workflow adapters
to that frozen helper. Task 138 adapts only verified, mounted-store readback to
the local runtime route; U's already-planned browser task consumes its exact
DTO through a strict parser. CF-1 assigns the definitive shared-event ownership
and may revise this plan only with a new approved contract-freeze revision.

**Tech Stack:** TypeScript, Zod, Vitest, the append-only ontology ledger,
capability-injected mounted artifact storage, local runtime, and credential-free
test doubles.

## Global Constraints

- The approved design is
  `docs/superpowers/specs/2026-07-12-resident-agent-durable-handoffs-design.md@5a80480c93920a37df45bd606ea12e0fe57e1e2d`.
- This plan is a Wave 0B artifact, not permission to implement. It requires
  written lane-plan approval, CF-1, a coordinator-issued scoped authorization,
  a fresh review, targeted GREEN evidence, `git diff --check`,
  `npm run factory:check`, and `npm run verify` before each implementation task
  completes. No child merges into `neo`.
- Preserve append-only ledger history. Corrections and migrations append causally
  linked events; v1 bytes, events, manifests, and projections are never edited
  or silently reinterpreted as v2.
- `agent_default` is the only resident identity. PRR negotiation,
  investigation-planner, and ontology-bootstrap are typed run modes, not
  identities.
- The mounted workspace identity, ledger, artifact store, policy hash, and
  active-lock hash are authoritative. Missing, stale, swapped, or
  identity-mismatched authority permits no ledger/artifact/derivative/manifest/
  diagnostic fallback write, copy, provider call, or completion projection.
- Normalize plain own-data inputs before a blob write, append, provider call, or
  `await`; freeze the normalized snapshot; reject accessors, symbols, sparse or
  custom arrays, unexpected prototypes, secrets, raw prompts, provider bodies,
  paths, commands, headers, and credentials.
- PRR stays draft-only: no send, follow-up, legal escalation, approval
  consumption, publication/export, provider byte transfer, accepted graph
  mutation, or self-approval is introduced by any handoff task.
- Deterministic tests are credential-free. Only the coordinator may run later
  real-Nous acceptance, and records only provider/model IDs, hashes, event IDs,
  counts, categories, and handoff readback markers.

## Required Reading And Task Claim

Before any implementation child claims a row, read `AGENTS.md`,
`.agents/skills/cestus-software-factory/SKILL.md`,
`docs/agentic/software-factory.md`, the ontology design and implementation
plan, the approved Lane H design, this plan, the CF-1 contract freeze, and
every existing handoff claim. The child appends its claim first, records the
actual RED output, and changes status to `in-progress` before production edits.

## File Ownership And Interfaces

| Task | Exclusive production files | Exclusive tests | Consumes / produces |
| --- | --- | --- | --- |
| 119 | `packages/ontology/src/contracts.ts`; `packages/agent/src/specialist-handoff-manifest.ts`; `packages/agent/src/specialist-handoff-projection.ts`; `packages/agent/src/specialist-handoffs.ts` | `packages/ontology/test/agent-contracts.test.ts`; `packages/agent/test/specialist-handoff-manifest.test.ts`; `packages/agent/test/specialist-handoff-projection.test.ts`; `packages/agent/test/specialist-handoffs.test.ts` | Produces versioned v2 manifest/event/readback/DTO contracts. L reviews event and terminal-policy compatibility at CF-1. |
| 121 | `packages/agent/src/prr-negotiation-workflow.ts` | `packages/agent/test/prr-negotiation-workflow.test.ts` | Consumes Task 119; produces only a reviewable PRR draft handoff. |
| 122 | `packages/agent/src/investigation-planner-workflow.ts` | `packages/agent/test/investigation-planner-workflow.test.ts` | Consumes Task 119; produces only advisory plan/evidence-gap handoff. |
| 123 | `packages/agent/src/ontology-bootstrap-workflow.ts` | `packages/agent/test/ontology-bootstrap-workflow.test.ts` | Consumes Task 119; produces only evidence-first proposal bundle handoff. |
| 138 | `packages/local-runtime/src/agent-handoff-projection.ts` | `packages/local-runtime/test/agent-handoff-projection.test.ts` | Consumes Tasks 119, 121–123, and R Task 135's verified mounted store; produces server-side `ResidentHandoffDto` for U Task 131. |

Task 131 exclusively owns the browser parser and its files
`packages/ui/src/agent/resident-runtime-types.ts`,
`packages/ui/src/agent/resident-runtime-adapter.ts`, and
`packages/ui/test/resident-runtime-adapter.test.ts`. It must parse the
production-shaped `ResidentHandoffDto` below; Task 119/138 do not touch UI
files. Task 135 exclusively composes `MountedHandoffStore`; H consumes it as an
opaque capability and never discovers mounts or substitutes local storage.

The CF-1 dispatch matrix must reserve the files in the table exactly. If another
lane has already changed any proposed event field, manifest field, lifecycle
literal, or DTO property, stop that task, record a contract conflict, and
return to a new CF-1 revision rather than resolving it in a workflow branch.

```ts
export interface HandoffAuthorityBinding {
  readonly workspaceIdentityHash: `sha256:${string}`;
  readonly mountGeneration: string;
  readonly ledgerStoreIdentity: string;
  readonly artifactStoreIdentity: string;
  readonly ledgerHighWaterEventId: string;
  readonly policyHash: `sha256:${string}`;
  readonly activeLocksHash: `sha256:${string}`;
}

export interface MountedHandoffStore {
  readonly storeKind: "mounted-handoff-store.v1";
  assertAuthority(binding: HandoffAuthorityBinding): Promise<void>;
  writeCanonical(input: {
    readonly binding: HandoffAuthorityBinding;
    readonly bytes: Uint8Array;
    readonly expectedHash: `sha256:${string}`;
    readonly mediaType: "application/vnd.cestus.specialist-handoff+json";
  }): Promise<{ readonly artifactHash: `sha256:${string}` }>;
  readExact(input: {
    readonly binding: HandoffAuthorityBinding;
    readonly artifactHash: `sha256:${string}`;
  }): Promise<Uint8Array>;
}

export interface HandoffReadback {
  readonly outcome: "verified" | "resumable" | "legacy-unbound" | "unavailable" | "inconsistent";
  readonly runId: string;
  readonly taskId?: string;
  readonly handoffId?: string;
  readonly manifestSchemaVersion?: "agent-specialist-handoff-manifest.v1" | "agent-specialist-handoff-manifest.v2";
  readonly manifestHash?: `sha256:${string}`;
  readonly finalOutputStepId?: string;
  readonly finalOutputEventId?: string;
  readonly preparedEventId?: string;
  readonly recordedEventId?: string;
  readonly terminalRunEventId?: string;
  readonly taskStatusEventId?: string;
  readonly authorityBinding?: HandoffAuthorityBinding;
  readonly diagnostics: readonly HandoffDiagnosticDto[];
}

export interface ResidentHandoffDto {
  readonly schemaVersion: "resident-handoff.v1";
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: "prr-negotiation" | "investigation-planner" | "ontology-bootstrap";
  readonly handoffId?: string;
  readonly revision?: number;
  readonly lifecycle: HandoffLifecycle;
  readonly provenance?: ResidentHandoffProvenanceDto;
  readonly artifactRefs: readonly SafeHandoffArtifactRef[];
  readonly diagnostics: readonly HandoffDiagnosticDto[];
}
```

`HandoffLifecycle`, `HandoffDiagnosticDto`, `ResidentHandoffProvenanceDto`, and
`SafeHandoffArtifactRef` retain the exact closed literals and safe-only fields
from the approved design. `provenance` is emitted only for verified v2
readback. A v1 result is `legacy-unbound`, non-executable, and omits
provenance; an unavailable or inconsistent result also omits it.

## Task 119: Authority-Bound Manifest, Readback, And Projection

**Dependencies:** CF-1 is merged; the worker worktree is rebased to its SHA;
L has approved the exact event/terminal-policy contract. It does not start from
this plan alone.

**Files:** exactly Task 119's files in the ownership table plus
`docs/agentic/claims/task-119-resident-full-vision-handoff-core.md`.

**Interfaces:** Add a discriminated v2 manifest preserving every v1 field and
adding only `authorityBinding`. The strict v1 parser must retain its existing
acceptance/rejection behavior. Event payloads contain the v2 schema literal and
exact binding but remain compact refs; they never contain manifest bytes,
prompts, evidence/provider bodies, paths, command lines, or secret material.

- [ ] **Step 1: Write RED contract and projection tests.**

```ts
it("rejects a v2 recorded handoff when its mounted binding differs", async () => {
  const projection = await buildSpecialistHandoffProjection({
    events: authoritySwappedRecordedEvents(), manifestReader: mountedReader()
  });
  expect(projection.selectedReadback.outcome).toBe("inconsistent");
  expect(projection.selectedReadback.diagnostics).toContainEqual(
    expect.objectContaining({ category: "mount-identity-mismatch" })
  );
});

it("keeps v1 historical and non-executable", async () => {
  const projection = await buildSpecialistHandoffProjection({
    events: legacyV1RecordedEvents(), manifestReader: mountedReader()
  });
  expect(projection.selectedReadback.outcome).toBe("legacy-unbound");
  expect(projection.selectedHandoffDto?.provenance).toBeUndefined();
});
```

Run:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-handoffs.test.ts
```

Expected RED: the new v2 parser/readback or closed diagnostic assertion fails.

- [ ] **Step 2: Implement the smallest contract-first change.** Normalize and
freeze input before append/write/await; call `assertAuthority` before and after
every mounted await; hash and exact-read every canonical byte sequence; replay
events rather than scanning blobs. Produce `task-completed` only when a verified
v2 recorded handoff, causally subsequent compatible terminal event, and linked
same-task completed status event all agree. Exact idempotent replay reuses the
event and `verifiedAt`; conflicting sequence state stays non-executable.

- [ ] **Step 3: Run GREEN and adversarial cases.**

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-handoffs.test.ts
```

Expected GREEN: v2 restart, missing/swapped/corrupt material, stale/swapped
sources, duplicate run/cross-run DTO, terminal-before-recorded, exact-versus-
conflicting sequence, hostile object, secret-shaped input, legacy v1, and all
waiting/blocked/failed mappings pass without completion synthesis.

- [ ] **Step 4: Verify, commit, and obtain fresh review.** Run `git diff --check`,
`npm run factory:check`, and `npm run verify`; record outputs in the claim;
commit only claimed files; request an independent spec-and-code review. A defect
that changes a shared literal returns to CF-1 rather than being patched by a
consumer.

## Task 121: PRR Negotiation Draft Handoff Migration

**Dependencies:** approved/reviewed Task 119, a rebase to its integration SHA,
and no unresolved PRR send/approval contract change.

**Files:** exactly Task 121's ownership-table files plus
`docs/agentic/claims/task-121-resident-full-vision-prr-handoff.md`.

**Produces:**

```ts
export async function runPrrNegotiationWorkflow(
  input: RunPrrNegotiationWorkflowInput
): Promise<RunPrrNegotiationWorkflowResult>;
```

Its successful advisory branch invokes the frozen handoff helper with the
request/correspondence, jurisdiction/context, draft artifact, approval preview,
source event IDs, context/prompt refs, and verified authority binding. It emits
only `ready-for-review` or a correctly mapped blocked/resumable/failed result;
it neither sends nor consumes approval.

- [ ] **Step 1: RED.**

```ts
it("records a read-back draft but never sends a PRR", async () => {
  const result = await runPrrNegotiationWorkflow(authorizedDraftInput());
  expect(result.handoff.lifecycle).toBe("handoff-recorded");
  expect(result.sent).toBeUndefined();
  expect(readbackEvents()).not.toContainEqual(expect.objectContaining({ type: "prr.sent" }));
});
```

Run `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts`.
Expected RED: no authority-bound durable readback or no-send assertion exists.

- [ ] **Step 2: GREEN.** Wire only the frozen helper; on missing/mismatched
authority, stale request/correspondence/context, or manifest failure return a
safe resumable/blocked failure and append no fallback data. Re-run the command
until all named tests pass, then run the three standard verification commands,
commit, and request fresh review.

## Task 122: Investigation Planner Handoff Migration

**Dependencies:** approved/reviewed Task 119 and a rebase to its integration
SHA. It shares no source/test file with Task 121 or 123.

**Files:** exactly Task 122's ownership-table files plus
`docs/agentic/claims/task-122-resident-full-vision-investigation-handoff.md`.

**Produces:**

```ts
export async function runInvestigationPlannerWorkflow(
  input: RunInvestigationPlannerWorkflowInput
): Promise<RunInvestigationPlannerWorkflowResult>;
```

It binds the investigation, evidence/context packs, advisory plan/task/draft
artifacts, source and related events, prompt artifact, and verified authority.
No accepted graph mutation, PRR send, hidden tool execution, or provider call
is added.

- [ ] **Step 1: RED.**

```ts
it("rejects stale evidence before recording the advisory plan handoff", async () => {
  const result = await runInvestigationPlannerWorkflow(staleEvidenceInput());
  expect(result.handoff.lifecycle).not.toBe("handoff-recorded");
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ category: "source-stale" }));
});
```

Run `npm test -- packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts`.
Expected RED: stale binding can reach the existing handoff path or lacks the
safe diagnostic.

- [ ] **Step 2: GREEN.** Use the frozen helper and exact readback only; write
the safe advisory outcome after all artifacts, source/related IDs, and authority
agree. Run the focused command, `git diff --check`, `npm run factory:check`, and
`npm run verify`; commit claimed files and request fresh review.

## Task 123: Ontology Bootstrap Proposal Handoff Migration

**Dependencies:** approved/reviewed Task 119 and a rebase to its integration
SHA. It does not alter `packages/ontology-bootstrap` or accepted ontology
contracts.

**Files:** exactly Task 123's ownership-table files plus
`docs/agentic/claims/task-123-resident-full-vision-bootstrap-handoff.md`.

**Produces:**

```ts
export async function runOntologyBootstrapResidentWorkflow(
  input: RunOntologyBootstrapResidentWorkflowInput
): Promise<RunOntologyBootstrapResidentWorkflowResult>;
```

The persisted result binds the legacy staging report, candidate set, evidence
IDs/content hashes, source events, review artifact, context/prompt refs, and
authority. It is proposal-only and can never assert accepted ontology truth.

- [ ] **Step 1: RED.**

```ts
it("requires staging and evidence hashes before a proposal handoff records", async () => {
  const result = await runOntologyBootstrapResidentWorkflow(missingEvidenceHashInput());
  expect(result.handoff.lifecycle).not.toBe("handoff-recorded");
  expect(result.acceptedAssertions).toBeUndefined();
});
```

Run `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts`.
Expected RED: missing content-hash binding is accepted or the proposal-only
guard is absent.

- [ ] **Step 2: GREEN.** Record an evidence-first review bundle only after
exact mounted/ledger readback; map failures safely and preserve append-only
recovery. Run the focused command and standard verification commands; commit
claimed files and request fresh review.

## Task 138: Mounted Runtime Projection And Strict Browser Boundary

**Dependencies:** approved/reviewed Tasks 121–123; R Task 135's mounted store
is merged; worktree rebased to all four integration SHAs. It must not create a
local replacement store.

**Files:** exactly Task 138's ownership-table files plus
`docs/agentic/claims/task-138-resident-full-vision-handoff-runtime-projection.md`.

**Produces:**

```ts
export interface CreateAgentHandoffProjectionInput {
  readonly events: readonly KnowledgeEvent[];
  readonly mountedStore: MountedHandoffStore;
  readonly authorityBinding: HandoffAuthorityBinding;
}

export async function buildResidentHandoffDto(
  input: CreateAgentHandoffProjectionInput
): Promise<ResidentHandoffDto>;
```

The local-runtime adapter obtains exact mounted bytes through R's capability,
verifies the binding and ledger replay, then projects only safe DTO fields. It
returns a fail-closed `unavailable`/`inconsistent` DTO with bounded diagnostics
on mount, parser, artifact, source, or cross-run failures. It exposes no store,
manifest bytes, raw artifacts, server registry, paths, raw prompts, model text,
credentials, headers, provider payloads, or stack traces.

- [ ] **Step 1: RED.**

```ts
it("returns no provenance or executable action for swapped mounted bytes", async () => {
  const dto = await buildResidentHandoffDto(swappedMountedStoreInput());
  expect(dto.lifecycle).toBe("inconsistent");
  expect(dto.provenance).toBeUndefined();
  expect(dto.nextSafeActions).toEqual(expect.arrayContaining([
    expect.objectContaining({ effect: "none" })
  ]));
});
```

Run `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts packages/agent/test/specialist-handoff-projection.test.ts`.
Expected RED: adapter is absent or synthesizes provenance/action from unverified
state.

- [ ] **Step 2: GREEN.** Implement only the capability-injected adapter and
production-shaped DTO projection. Then U Task 131 writes its own strict Zod
parser test: reject absent/forged/cross-run/stale `provenance`, non-plain values,
unknown keys, unsafe diagnostic strings, and any server-only field. It accepts
only verified v2 provenance, safe hashes/IDs/categories, and `effect: "none"`.
H does not modify U's files.

- [ ] **Step 3: Verify and review.** Re-run the focused command, then
`git diff --check`, `npm run factory:check`, and `npm run verify`; record
outputs, commit only claimed files, and obtain fresh review before allowing U
to consume the route DTO.

## Deterministic Failure Injection Matrix

| Case | Owner/test phase | Required result |
| --- | --- | --- |
| Restart after recorded | 119 projection; 138 adapter | Exact manifest hash/event IDs and safe v2 provenance replay. |
| Crash after final output or prepared | 119 | `output-persisted` or `handoff-pending`; idempotent recovery, never terminal success. |
| Missing/swapped/corrupt manifest or artifact | 119/138 | `inconsistent` plus safe hash-bound category; no alternate bytes/store. |
| Stale/swapped source/context/output ref | 119 and each 121–123 migration | Safe provenance category before a terminal append or new material write. |
| Disconnect/remount/identity-store swap | 119/138 with R fake capability | `unavailable` or mount category; no append, provider call, artifact write, or copy. |
| Historical v1 | 119 and U 131 parser | `legacy-unbound`, no provenance or executable action. |
| Duplicate run/cross-run DTO | 119/138/U 131 | Closed rejection; never arbitrary selection or partial parse. |
| Exact versus conflicting append race | 119 | Exact reuse only; conflict remains non-executable. |
| Terminal before recorded | 119 | `terminal-before-readback`, never success. |
| Waiting/blocked/failed | 119 and workflow migrations | Correct resumable/terminal mapping; never `task-completed` for waiting/blocked. |
| Hostile object or secret-shaped value | 119/138/U 131 | Boundary rejection; no retained value in event, DTO, log, fixture, or diagnostic. |

## Merge, Rebase, Review, And Live Gates

1. CF-1 freezes the event literals, v2 manifest shape, lifecycle values, DTO
fields, ownership table, and Task 119 assignment. Only then can the coordinator
issue implementation authorization.
2. Integrate reviewed Task 119 before dispatching 121–123. Rebase each child to
the Task 119 integration SHA and re-run its named focused command before review.
3. Tasks 121–123 can execute in parallel because their only production/test
files are exclusive. They do not change shared contracts; a needed change
returns to a new CF-1 revision.
4. Integrate 121–123, then R Task 135. Rebase Task 138 to all four SHAs and
run its cross-boundary command before review. U Task 131 starts only after 138
is integrated and rebased to that exact route shape.
5. Every task uses two fresh review lenses: specification/invariant review and
code-quality/verification review. The coordinator verifies scope, ancestry,
claim command evidence, review verdict, and clean worktree before integration.
6. No task invokes a provider. After integrated deterministic acceptance, the
coordinator alone may run `npm run agent:nous:smoke` in an approved environment
for the selected workflow. A safe artifact records only provider/model IDs,
hashes, event IDs, counts, categories, and handoff readback marker; unavailable
provider behavior remains safe/resumable and never selects a fallback backend.

## Rollback And Stop Conditions

Rollback is forward-only: append a causally linked v2 supersession or repair
event, retain prior manifest/events/projection history, rebuild from ledger, and
leave v1 immutable. Never delete/rewrite blobs, events, task status, or
projections to conceal a failed handoff. Stop and return to the coordinator on
schema/ownership conflict, ledger/artifact readback disagreement, demand for
blob scanning, stale/swapped authority/provenance, unsafe diagnostic, data-loss
risk, unavailable mount, credential request, provider behavior change, or two
focused verifier failures. Under the standing delegation, the coordinator
records a root-cause checkpoint, changes tactics or worker, and continues;
human escalation is only for a required product/scope/safety/data-loss/official
credential/external-behavior decision.

## Acceptance Mapping And Plan Self-Review

| Approved Lane H requirement | Implementing task/evidence |
| --- | --- |
| PRR, investigation, bootstrap migration | 121, 122, 123 focused RED/GREEN tests; reviewable-only outcomes. |
| Mounted authority, append/readback, restart projection | 119 manifest/projection tests and 138 mounted adapter test. |
| Strict browser-safe DTO parser | 138 production DTO plus U 131 strict parser/rejection tests; no UI ownership overlap. |
| Secret-safe diagnostics | 119/138 hostile-value tests and safe-only DTO shape. |
| Corruption/failure injection | deterministic matrix plus Task 119/138 focused commands. |
| No fallback storage or approval/effect bypass | all H tests; R Task 135 capability integration; no-send/no-acceptance assertions. |
| Real-Nous posture | coordinator-only post-integration `npm run agent:nous:smoke`; deterministic suites credential-free. |
| Merge/rebase and rollback | ordered gates above; append-only supersession/rebuild only. |

Self-review performed before commit: the plan assigns every Lane H requirement,
uses the approved interface names and literals, leaves CF-1 ownership decisions
explicitly frozen before work, gives each production task exclusive files and
commands, contains no placeholder, and does not authorize production work.
