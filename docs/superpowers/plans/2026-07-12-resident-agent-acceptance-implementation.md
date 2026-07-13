# Resident Agent Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` only after the coordinator sends an
> exact scoped implementation authorization naming the approved Lane A design,
> this reviewed plan commit, the CF-1 SHA, the allowed acceptance-task range,
> and the wave stop. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove one production-composed Cestus resident uses an authoritative
mounted workspace, survives restart safely, fails closed at every cross-lane
boundary, and exposes only secret-safe runtime truth without turning Lane A
into a producer or provider owner.

**Architecture:** Lane A supplies isolated deterministic fixtures and
integration tests after CF-1 assigns their exact paths and frozen interfaces.
Those tests invoke merged production boundaries rather than substitutes, record
only a secret-safe evidence envelope, and route every producer defect to its
exclusive owner. A coordinator alone performs the real Nous and served-checkout
gates; their evidence is safe, truthful, and cannot replace deterministic
coverage.

**Tech Stack:** TypeScript (strict), Vitest, Zod contracts frozen by CF-1,
SQLite-backed mounted portable-workspace stores, local-runtime child processes,
React/Vite runtime DTO parsing, and coordinator-controlled Nous/tailnet gates.

## Global Constraints

- Approved Lane A design:
  `docs/superpowers/specs/2026-07-12-resident-agent-acceptance-design.md@eda08b6ca64ea48e405cc5ed83213630f8769d94`.
- Governing umbrella design:
  `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@c7dc10b9dd351fc76df083df8f2222252ba73d89`.
- Governing program plan:
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`.
- `agent_default` is the sole resident identity. Provider, model, subscription,
  credential reference, harness, browser, and fixture remain backends or test
  tools and never become storage, approval, or resident authority.
- The mounted workspace identity, generation, canonical ledger, artifact,
  derivative, and handoff stores, policy, and active locks are authoritative.
  A disconnect, identity mismatch, stale high-water mark, swapped store,
  changed policy, or changed lock permits no internal fallback write.
- Ledger facts are append-only and projections rebuild from ledger events plus
  exact mounted artifacts. A return value, cached DTO, artifact existence,
  provider success, or adjacent task status is not completion evidence.
- Every public input is normalized to a plain own-data snapshot before an
  append, mounted write, provider call, or `await`. Accessors, symbols,
  sparse/custom arrays, prototype values, raw secret material, and raw provider
  content fail before a durable or external effect.
- Deterministic tests are credential-free. Lane A neither provisions nor reads
  credentials and does not invoke a provider. Only the coordinator may run the
  approved real Nous command after its independent approval and mounted
  authority preconditions are satisfied.
- Lane A owns integration and failure-injection tests only. It never patches
  R/H/W/L/T/P/U production code, shared contracts, the default runtime factory,
  shared provider configuration, runtime routes, or cockpit presentation.
- CF-1 is the only authority that confirms test paths, fixture imports, event
  names, DTO versions, capability signatures, compatibility rules, owners,
  consumers, and rebase SHAs. A missing or conflicting CF-1 assignment blocks
  the affected acceptance task and returns a defect to the coordinator.
- Each executable task needs a committed claim, a focused RED command, a
  minimal owned test/fixture change, focused GREEN, `git diff --check`,
  `npm run factory:check`, `npm run verify`, fresh independent review, and a
  coordinator merge gate. No child self-merges into `neo`.

## CF-1 Dispatch Gate And File Ownership

This plan reserves acceptance-only paths; it does not create them during Task
116 or claim that their names are frozen. CF-1 must either assign each listed
path exactly or append a compatible replacement record that preserves the
named responsibility, interface, test command, and evidence shape. A producer
file is never an acceptable replacement.

| Acceptance concern | Candidate A-owned path after CF-1 | Exclusive responsibility | Producer boundary consumed |
| --- | --- | --- | --- |
| Mounted fixture and safe evidence helpers | `packages/local-runtime/test/fixtures/resident-acceptance-fixture.ts` | Disposable mounted root, fresh-process launcher, fallback observer, injector, safe evidence assertion, cleanup | R/H/W/L frozen runtime ports |
| A-01 restart | `packages/local-runtime/test/resident-acceptance-mounted-restart.test.ts` | Mounted-only restart and durable readback assertions | R/H/W/L |
| A-02 disconnect/reconnect | `packages/local-runtime/test/resident-acceptance-disconnect-reconnect.test.ts` | Boundary injection and zero fallback-write assertions | W/R/H |
| A-03 and A-04 | `packages/agent/test/resident-acceptance-nous-and-legacy.test.ts` | Credential-free Nous posture and evidence-first proposal acceptance | P/R/L/H |
| A-05 and A-06 | `packages/agent/test/resident-acceptance-trigger-and-planning.test.ts` | Trigger-to-draft and bounded advisory handoff integration | T/L/H/P |
| A-07 and A-08 | `packages/agent/test/resident-acceptance-provider-feasibility.test.ts` | Provider-parity and official feasibility integration | P |
| A-09 | `packages/ui/test/resident-acceptance-cockpit-tailnet.test.tsx` | Production DTO parser, supported control, browser-closed, served-checkout checks | U/W/R/H |
| A-10 | `packages/agent/test/resident-acceptance-adversarial.test.ts` | Cross-lane approval/provenance/budget/secret/crash failures | L/W/H/P/R/U |
| Evidence report fixture | `packages/agent/test/fixtures/resident-acceptance-evidence.ts` | Safe envelope validation and redaction assertions; never a second ledger | CF-1 evidence vocabulary |

The fixture may observe non-mounted writer calls but must not provide a storage
implementation, cache authority, compatibility store, synthetic handoff, or
success DTO. A test that cannot invoke the production boundary through its
frozen interface is blocked and assigned to the boundary owner rather than
replacing that boundary with an in-memory fake.

## Required CF-1 Interfaces And Fixture Shape

CF-1 must publish compatible names for the following semantic ports before an
A task starts. The candidate names below belong only to the A-owned fixtures;
they do not redefine producer interfaces.

```ts
type AcceptanceId =
  | "A-01" | "A-02" | "A-03" | "A-04" | "A-05"
  | "A-06" | "A-07" | "A-08" | "A-09" | "A-10";

interface MountedAuthorityAnchor {
  readonly workspaceIdentityHash: `sha256:${string}`;
  readonly mountGeneration: string;
  readonly ledgerHighWaterHash: `sha256:${string}`;
  readonly policyHash: `sha256:${string}`;
  readonly activeLocksHash: `sha256:${string}`;
  readonly mountedStoreHash: `sha256:${string}`;
}

interface ResidentAcceptanceEvidence {
  readonly acceptanceId: AcceptanceId;
  readonly verdict: "pass" | "blocked" | "failed";
  readonly executionClass: "deterministic" | "coordinator-live" | "served-checkout";
  readonly residentAgentId: "agent_default";
  readonly authority: MountedAuthorityAnchor;
  readonly taskId?: string;
  readonly attemptId?: string;
  readonly runId?: string;
  readonly eventIds: readonly string[];
  readonly artifactHashes: readonly `sha256:${string}`[];
  readonly counts: Readonly<Record<string, number>>;
  readonly categories: readonly string[];
  readonly safeMarkers: readonly string[];
  readonly servedCommit?: string;
}

interface MountedAcceptanceFixture {
  readonly authority: MountedAuthorityAnchor;
  startProductionRuntime(): Promise<void>;
  stopAndDiscardProcess(): Promise<void>;
  startFreshProductionRuntimeFromMountedDisk(): Promise<void>;
  inject(boundary: AcceptanceInjectionBoundary): Promise<void>;
  readEvidence(acceptanceId: AcceptanceId): Promise<ResidentAcceptanceEvidence>;
  fallbackWrites(): readonly { readonly category: string }[];
  cleanup(): Promise<void>;
}

type AcceptanceInjectionBoundary =
  | "before-claim" | "before-provider-transfer" | "before-tool-execution"
  | "before-derivative-write" | "before-material-write"
  | "before-manifest-write" | "before-handoff-recorded" | "before-resume"
  | "after-final-output" | "after-material" | "after-manifest"
  | "after-prepared" | "after-recorded" | "before-claim-checkpoint";
```

`readEvidence` reads the CF-1-approved safe report/projection only after the
production path supplies its mounted ledger/artifact readback. It cannot invent
event IDs, artifact hashes, counts, a lifecycle state, or a completion verdict.
The fixture fails if it sees a key or value containing prompt/source/output
bytes, credential references, endpoints, headers, command text, mount paths,
raw errors, or getter-backed values.

## Acceptance Case Contract Map

These local rows are the executable documentation contract audited below. Each
row specifies the exact cross-lane behavior that the future focused test must
prove; it is not a heading-only checklist.

| Local marker | Direct local requirement |
| --- | --- |
| A116-A01-MOUNTED-RESTART | A-01 starts work through the production task entry boundary and writes only through the selected mounted ledger, artifact, derivative, and handoff authorities. |
| A116-A01-FRESH-PROCESS | A-01 terminates the original runtime, discards all in-process objects, and makes a fresh child process reconstruct task, claim, context, plan/observation, handoff lifecycle, and terminal-or-resumable posture from mounted disk. |
| A116-A01-NO-FALLBACK | A-01 wraps every non-mounted ledger, projection, artifact, derivative, handoff, cache, and temporary-file writer in an observer sentinel and requires zero fallback writes. |
| A116-A01-REJECT-SYNTHETIC | A-01 rejects an in-memory continuation, orphaned bytes, caller-supplied result, copied cross-run status, and unbound legacy handoff as completion evidence. |
| A116-A02-INJECT-BOUNDARIES | A-02 injects mount loss or identity mismatch before claim, provider transfer, tool execution, derivative, material, manifest, recorded-handoff, and resume boundaries. |
| A116-A02-REVERIFY | A-02 permits normal recovery only after same workspace identity, ledger high-water, mounted store, policy, and active locks are reverified; changed identity, high-water, store, policy, or lock remains blocked/resumable. |
| A116-A02-RELEASE-NO-CACHE | A-02 proves active claims are released or checkpointed append-only when writable, provider/tool activity stops, cached authority cannot resume, and the fallback sentinel remains zero. |
| A116-A03-DETERMINISTIC-CREDENTIAL-FREE | A-03 deterministic coverage uses a production selection that rejects fake credentials and proves denied, stale, missing, or unapproved transfer has no provider call or fallback backend. |
| A116-A03-COORDINATOR-NOUS | A-03 reserves `npm run agent:nous:smoke` to a coordinator-controlled environment with verified mounted authority, exact resident/task/attempt/run, policy, locks, context/source hashes, and independently rechecked byte-transfer approval. |
| A116-A03-SAFE-LIVE-OUTPUT | A-03 permits live output only fixed markers, Nous provider/model IDs, capability/prompt/input/output/manifest hashes, safe event IDs, context-pack IDs, bounded counts, categories, and durable-readback marker. |
| A116-A03-HONEST-BLOCK | A-03 records outage, unavailable OS binding, denied/stale approval, mount loss, budget exhaustion, or failed readback as safe blocked/unavailable/resumable evidence without alternate provider, credential, or false pass. |
| A116-A04-EVIDENCE-FIRST | A-04 proves legacy input stays evidence-first with exact source/content hash and mounted artifact bindings before any proposal is emitted. |
| A116-A04-PROPOSAL-ONLY | A-04 proves ontology-bootstrap output remains proposal-only and a handoff cannot create accepted ontology truth, synthetic readiness, or an unbound completion. |
| A116-A05-TRIGGER-IDEMPOTENT | A-05 proves a PRR deadline/stalling trigger appends one provenance-bound task request for a dedupe key, honors cooldown, budget, and source high-water, and never prompts or performs a domain effect. |
| A116-A05-DRAFT-NO-SEND | A-05 proves the resulting PRR artifact is a reviewed local draft with exact H readback and no send, follow-up, escalation, publication, export, or provider fallback. |
| A116-A06-BOUNDED-ADVISORY | A-06 proves investigation planning and contradiction discovery bind plans, observations, source/context, tool allowlist, approval state, and all ceilings while outputs remain advisory and cannot mutate accepted graph truth. |
| A116-A06-REPLAN-READBACK | A-06 proves budget exhaustion, stale approval, mount loss, or crash ends in the exact bounded terminal/resumable state and requires replayable H handoff readback rather than return-value completion. |
| A116-A07-PARITY-NO-SECRET | A-07 proves BYOK and local-model capabilities expose the frozen readiness/feasibility contract using secret-free references, credential-free deterministic tests, and no implicit provider/model/credential fallback. |
| A116-A08-OFFICIAL-ONLY | A-08 proves Codex and xAI acceptance uses an official supported flow or durable safe unavailable feasibility evidence, never subscription-token extraction, browser scraping, or fabricated availability. |
| A116-HANDOFF-PROVENANCE | A-01/A-03/A-04/A-05/A-06 require exact mounted derivative/output readback, material readback, final-output ledger binding, manifest readback, prepared and recorded handoff replay/readback, then causally compatible run/task transition. |
| A116-HANDOFF-CROSS-RUN | A-10 rejects missing, corrupt, swapped, stale, sequence-conflicted, terminal-before-recorded, historical-unbound, and cross-run artifact/DTO facts without choosing substitute bytes or a different run. |
| A116-APPROVAL-RACE | A-10 rejects forged/self, expired, revoked, stale, cross-run/provider, preview/context/source/policy/lock/mount-changed approvals before provider transfer or any external effect. |
| A116-BOUNDARY-SAFETY | A-10 rejects accessor, prototype, symbol, sparse-array, secret-shaped key/value, and raw-provider-text inputs before append/write/call and reports only a fixed safe category. |
| A116-A09-PRODUCTION-DTO | A-09 feeds the U parser a production-shaped runtime route payload whose task/run/claim, mount, provider readiness, plan/observation, trigger, and handoff facts remain associated; stale, forged, absent, secret-bearing, and cross-run values reject or mark unavailable. |
| A116-A09-BROWSER-CLOSED | A-09 closes the browser and proves the W-owned supervisor remains independently running, paused, or resumable through subsequent safe runtime projection/readback rather than browser state. |
| A116-A09-SERVED-TAILNET | A-09 rebuilds the exact served commit, records that SHA, inspects desktop/mobile/tailnet route behavior, proves supported control semantics and workspace-unavailable visibility, and rejects stale builds, parser fallback, secret/mount leakage, or a browser-hosted resident. |
| A116-EVIDENCE-SECRET-SAFE | Every A case asserts safe evidence keys and values contain only opaque IDs, hashes, bounded counts, fixed categories/markers, and permitted served SHA; a leak fails before retaining the unsafe subject. |
| A116-CF1-REBASE-OWNER | Every A task waits for CF-1 plus named producer merges, rebases to recorded SHAs before review, and sends a defect with acceptance ID, command, safe anchors, and owner instead of changing producer code. |
| A116-ROLLBACK-REVIEW | Every A task records reversible test-only rollback, removes only disposable fixture roots during cleanup, stops after two focused verifier failures for coordinator root-cause recovery, and requires a fresh reviewer before integration. |

## Section-Local Documentation Audit

Run this exact audit from the repository root before committing Task 116. It
extracts only the contract map above, validates every direct safety row, then
deletes both the marker and its semantic clause for each row. It therefore
rejects 58 direct local counterfactual mutations rather than treating section
headings or incidental wording elsewhere in this plan as evidence.

```bash
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const path = "docs/superpowers/plans/2026-07-12-resident-agent-acceptance-implementation.md";
const text = readFileSync(path, "utf8");
const startHeading = "## Acceptance Case Contract Map";
const endHeading = "## Section-Local Documentation Audit";
const start = text.indexOf(startHeading);
const end = text.indexOf(endHeading);
if (start < 0 || end < 0 || end <= start) throw new Error("acceptance contract map is not extractable");
const section = text.slice(start, end);
const required = new Map([
  ["A116-A01-MOUNTED-RESTART", "writes only through the selected mounted ledger, artifact, derivative, and handoff authorities"],
  ["A116-A01-FRESH-PROCESS", "fresh child process reconstruct task, claim, context, plan/observation, handoff lifecycle, and terminal-or-resumable posture from mounted disk"],
  ["A116-A01-NO-FALLBACK", "requires zero fallback writes"],
  ["A116-A01-REJECT-SYNTHETIC", "rejects an in-memory continuation, orphaned bytes, caller-supplied result, copied cross-run status, and unbound legacy handoff"],
  ["A116-A02-INJECT-BOUNDARIES", "before claim, provider transfer, tool execution, derivative, material, manifest, recorded-handoff, and resume boundaries"],
  ["A116-A02-REVERIFY", "same workspace identity, ledger high-water, mounted store, policy, and active locks are reverified"],
  ["A116-A02-RELEASE-NO-CACHE", "cached authority cannot resume, and the fallback sentinel remains zero"],
  ["A116-A03-DETERMINISTIC-CREDENTIAL-FREE", "denied, stale, missing, or unapproved transfer has no provider call or fallback backend"],
  ["A116-A03-COORDINATOR-NOUS", "reserves `npm run agent:nous:smoke` to a coordinator-controlled environment"],
  ["A116-A03-SAFE-LIVE-OUTPUT", "permits live output only fixed markers, Nous provider/model IDs"],
  ["A116-A03-HONEST-BLOCK", "without alternate provider, credential, or false pass"],
  ["A116-A04-EVIDENCE-FIRST", "stays evidence-first with exact source/content hash and mounted artifact bindings"],
  ["A116-A04-PROPOSAL-ONLY", "cannot create accepted ontology truth, synthetic readiness, or an unbound completion"],
  ["A116-A05-TRIGGER-IDEMPOTENT", "honors cooldown, budget, and source high-water, and never prompts or performs a domain effect"],
  ["A116-A05-DRAFT-NO-SEND", "no send, follow-up, escalation, publication, export, or provider fallback"],
  ["A116-A06-BOUNDED-ADVISORY", "outputs remain advisory and cannot mutate accepted graph truth"],
  ["A116-A06-REPLAN-READBACK", "requires replayable H handoff readback rather than return-value completion"],
  ["A116-A07-PARITY-NO-SECRET", "no implicit provider/model/credential fallback"],
  ["A116-A08-OFFICIAL-ONLY", "never subscription-token extraction, browser scraping, or fabricated availability"],
  ["A116-HANDOFF-PROVENANCE", "prepared and recorded handoff replay/readback, then causally compatible run/task transition"],
  ["A116-HANDOFF-CROSS-RUN", "without choosing substitute bytes or a different run"],
  ["A116-APPROVAL-RACE", "before provider transfer or any external effect"],
  ["A116-BOUNDARY-SAFETY", "reports only a fixed safe category"],
  ["A116-A09-PRODUCTION-DTO", "stale, forged, absent, secret-bearing, and cross-run values reject or mark unavailable"],
  ["A116-A09-BROWSER-CLOSED", "rather than browser state"],
  ["A116-A09-SERVED-TAILNET", "rejects stale builds, parser fallback, secret/mount leakage, or a browser-hosted resident"],
  ["A116-EVIDENCE-SECRET-SAFE", "a leak fails before retaining the unsafe subject"],
  ["A116-CF1-REBASE-OWNER", "instead of changing producer code"],
  ["A116-ROLLBACK-REVIEW", "requires a fresh reviewer before integration"]
]);
const validate = (candidate) => [...required].filter(([marker, clause]) =>
  !candidate.includes(marker) || !candidate.includes(clause)
);
const missing = validate(section);
if (missing.length > 0) {
  console.error(`RED: Task 116 contract map misses ${missing.length} local control(s): ${missing.map(([marker]) => marker).join(", ")}`);
  process.exit(1);
}
let mutations = 0;
for (const [marker, clause] of required) {
  for (const needle of [marker, clause]) {
    const mutated = section.replace(needle, `removed-${mutations}`);
    if (validate(mutated).length === 0) throw new Error(`counterfactual escaped: ${marker} / ${needle}`);
    mutations += 1;
  }
}
console.log(`GREEN: Task 116 section-local acceptance-plan audit passed (${mutations} direct local counterfactual mutations rejected).`);
NODE
```

## Deterministic Fixture Sequence

### Task A-FIXTURE: Create the mounted acceptance fixture after CF-1

**Files:**
- Create: `packages/local-runtime/test/fixtures/resident-acceptance-fixture.ts`
- Create: `packages/agent/test/fixtures/resident-acceptance-evidence.ts`

**Consumes:** CF-1's mounted-authority, runtime-launch, handoff-readback,
safe-runtime-projection, and error-category interfaces plus the merged R/H/W/L
producer commits recorded in the registry.

**Produces:** a disposable mounted-root fixture, one fresh-process launcher,
an observer-only fallback sentinel, a boundary injector, safe evidence parser,
and cleanup which deletes only the fixture root after assertions finish.

- [ ] **Step 1: Write the failing fixture tests**

```ts
it("rejects a fixture that can write a non-mounted fallback", async () => {
  const fixture = await createMountedAcceptanceFixture();
  await expect(fixture.assertNoFallbackWrites()).resolves.toBeUndefined();
  await fixture.recordObservedFallbackWriteForTest("internal-cache");
  await expect(fixture.assertNoFallbackWrites()).rejects.toMatchObject({
    category: "fallback-write-detected"
  });
});

it("rejects secret-bearing evidence keys and values before retention", () => {
  expect(() => assertSafeAcceptanceEvidence({ acceptanceId: "A-01", endpoint: "unsafe" }))
    .toThrow("secret-safety-rejection");
});
```

- [ ] **Step 2: Run the RED command**

Run: `npm test -- packages/local-runtime/test/fixtures/resident-acceptance-fixture.ts packages/agent/test/fixtures/resident-acceptance-evidence.ts`

Expected: FAIL because the fixture and safe-evidence validator do not exist.

- [ ] **Step 3: Implement only test fixture helpers**

Implement the exact `MountedAcceptanceFixture` semantics above. The fallback
observer records categories only, never values or paths. Its child-process
helper receives the mounted authority selected by the production runtime, drops
all process objects before relaunch, and never creates an alternate store.

- [ ] **Step 4: Run the GREEN command**

Run: `npm test -- packages/local-runtime/test/fixtures/resident-acceptance-fixture.ts packages/agent/test/fixtures/resident-acceptance-evidence.ts`

Expected: PASS; a deliberate observer event fails closed, and unsafe evidence
is rejected before retention.

- [ ] **Step 5: Commit and request review**

Commit only the two CF-1-assigned fixture files and their Task 116 claim
update. A fresh reviewer verifies that fixture helpers cannot become a second
ledger, fallback store, synthetic handoff, or secret recorder.

## Acceptance Matrix Implementation Tasks

### Task A-01: Mounted workspace restart and reconstruction

**Files:**
- Create: `packages/local-runtime/test/resident-acceptance-mounted-restart.test.ts`
- Modify: only the A-owned fixture files assigned by CF-1 when a focused
  fixture capability is missing.

**Consumes:** production task entry, R composed runtime, H `HandoffReadback`,
W mounted authority, L bounded advisory state, and A fixture helpers.

**Produces:** deterministic proof that restart reconstructs only mounted,
authoritative state and completion requires durable handoff readback.

- [ ] **Step 1: Write the failing test**

```ts
it("A-01 reconstructs a recorded mounted handoff after a fresh process with zero fallback writes", async () => {
  const fixture = await createMountedAcceptanceFixture();
  await fixture.startProductionRuntime();
  const before = await fixture.createAndRunBoundedAdvisoryTask("agent_default");
  await fixture.stopAndDiscardProcess();
  await fixture.startFreshProductionRuntimeFromMountedDisk();
  const after = await fixture.readRestartedReadback(before.taskId, before.runId);

  expect(after.handoff).toMatchObject({ lifecycle: "recorded", taskId: before.taskId, runId: before.runId });
  expect(after.authority).toEqual(before.authority);
  await fixture.assertNoFallbackWrites();
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- packages/local-runtime/test/resident-acceptance-mounted-restart.test.ts`

Expected: FAIL until the frozen production composition exposes mounted restart
and exact readback. If the interface is absent, stop and route the defect to
R/H/W/L through the coordinator.

- [ ] **Step 3: Add only the acceptance assertion and fixture adaptation**

Add success, memory-only continuation, orphaned bytes, caller-result,
cross-run-status, unbound-handoff, and each fallback-writer sentinel cases.
Do not edit production stores or handoff lifecycle code.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- packages/local-runtime/test/resident-acceptance-mounted-restart.test.ts`

Expected: PASS; each success anchor is reread from mounted storage after a
fresh process, and every synthetic completion candidate is nonterminal.

- [ ] **Step 5: Commit and review**

Commit the A-01 test plus allowed fixture edits. Fresh review checks that all
restart proof uses real disk-backed mounted stores and not retained objects.

### Task A-02: Disconnect, identity mismatch, and reconnect

**Files:**
- Create: `packages/local-runtime/test/resident-acceptance-disconnect-reconnect.test.ts`
- Modify: only CF-1-assigned A fixture files.

**Consumes:** W disconnect/reverify and claim recovery, R composition, H
stores/readback, and the A boundary injector.

**Produces:** deterministic no-fallback evidence at each durable boundary and
recovery only after authoritative revalidation.

- [ ] **Step 1: Write the failing table-driven test**

```ts
it.each(["before-claim", "before-provider-transfer", "before-tool-execution", "before-derivative-write", "before-material-write", "before-manifest-write", "before-handoff-recorded", "before-resume"])(
  "A-02 fails closed at %s without fallback persistence", async (boundary) => {
    const fixture = await createMountedAcceptanceFixture();
    await fixture.inject(boundary);
    const result = await fixture.runProductionRecoveryAttempt();
    expect(result).toMatchObject({ category: "workspace-unavailable", resumable: true });
    expect(result.providerCalls).toBe(0);
    await fixture.assertNoFallbackWrites();
  }
);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- packages/local-runtime/test/resident-acceptance-disconnect-reconnect.test.ts`

Expected: FAIL before the merged W/R/H behavior exposes every frozen boundary.

- [ ] **Step 3: Add acceptance cases**

Add same-identity reconnect success plus identity swap, stale high-water,
swapped store, changed policy, and changed locks rejection. Assert append-only
claim release/checkpoint only when mounted storage remains writable.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- packages/local-runtime/test/resident-acceptance-disconnect-reconnect.test.ts`

Expected: PASS; no cached authority resumes work and every injected path has
zero fallback-writer observations.

- [ ] **Step 5: Commit and review**

Commit A-02-only test/fixture changes and request a fresh W/R/H-focused review.

### Task A-03 and A-04: Nous posture and evidence-first legacy proposal

**Files:**
- Create: `packages/agent/test/resident-acceptance-nous-and-legacy.test.ts`
- Modify: only CF-1-assigned A fixture/evidence files.

**Consumes:** P selection/readiness, R prompt/context composition, L bounded
policy, H handoff readback, and legacy/ontology-bootstrap producers.

**Produces:** credential-free proof of real-Nous preconditions plus
evidence-first, proposal-only legacy acceptance.

- [ ] **Step 1: Write failing deterministic tests**

```ts
it("A-03 rejects unapproved, stale, or missing Nous transfer before network I/O", async () => {
  const result = await runProductionNousPreflight({ approval: "stale" });
  expect(result).toMatchObject({ category: "approval-unavailable", providerCalls: 0 });
});

it("A-04 preserves evidence-first provenance and rejects accepted-graph completion", async () => {
  const result = await runLegacyBootstrapAcceptance();
  expect(result.proposal.sourceHash).toMatch(/^sha256:/);
  expect(result).not.toMatchObject({ acceptedGraphMutation: true, taskLifecycle: "task-completed" });
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- packages/agent/test/resident-acceptance-nous-and-legacy.test.ts`

Expected: FAIL before the required preflight/readback behavior exists.

- [ ] **Step 3: Implement deterministic acceptance coverage only**

Cover exact run binding, mounted authority, policy/locks/source/context hashes,
typed OS-secret reference posture, independent preview recheck, budget ceilings,
safe blocked categories, source/content artifact binding, proposal-only
handoff, and cross-run/stale artifacts. No provider command runs in this task.

- [ ] **Step 4: Run GREEN and preserve the coordinator gate**

Run: `npm test -- packages/agent/test/resident-acceptance-nous-and-legacy.test.ts`

Expected: PASS credential-free. Record the coordinator-only `npm run
agent:nous:smoke` procedure: verify mounted authority and approval first; emit
only the permitted safe fields; treat any outage as an honest blocked result.

- [ ] **Step 5: Commit and review**

Fresh P/R/L/H review confirms deterministic tests do not smuggle a credential,
provider fake, prompt/source content, or live invocation into the suite.

### Task A-05 and A-06: Trigger-to-draft and bounded advisory work

**Files:**
- Create: `packages/agent/test/resident-acceptance-trigger-and-planning.test.ts`

**Consumes:** T dedupe/high-water, L policy/loop, H handoffs, P posture, and
the frozen PRR/investigation/contradiction producer paths.

**Produces:** cross-lane proof of one trigger request, reviewed draft-only PRR
work, bounded advisory planning, contradiction discovery, and durable readback.

- [ ] **Step 1: Write failing tests**

```ts
it("A-05 records one cooldown-bound trigger request and only a reviewed local PRR draft", async () => {
  const [first, second] = await evaluateSameTriggerTwice();
  expect(first.taskRequestId).toBe(second.taskRequestId);
  expect(first.effects).toEqual(["local-draft"]);
  expect(first.sendCount).toBe(0);
});

it("A-06 stops at policy ceilings and reads back advisory planning and contradiction handoffs", async () => {
  const result = await runBoundedPlanningAndContradictionAcceptance();
  expect(result).toMatchObject({ graphMutationCount: 0, handoffLifecycle: "recorded" });
  expect(result.counters.toolSteps).toBeLessThanOrEqual(result.policy.maxToolSteps);
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- packages/agent/test/resident-acceptance-trigger-and-planning.test.ts`

Expected: FAIL while trigger/draft or bounded-handoff integration lacks a
frozen producer path.

- [ ] **Step 3: Add the acceptance matrix**

Assert dedupe, cooldown, budget, high-water, no-prompt/no-effect trigger
posture; PRR no-send; tool/version allowlists; plan/observation source/context
binding; stale approval/mount/crash/budget terminal-or-resumable outcomes; and
exact H durable readback.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- packages/agent/test/resident-acceptance-trigger-and-planning.test.ts`

Expected: PASS with no accepted graph mutation, external effect, or substitute
provider selection.

- [ ] **Step 5: Commit and review**

Fresh T/L/H/P review verifies that Lane A asserts outcomes but changes no
trigger, loop, provider, or handoff producer logic.

### Task A-07 and A-08: Provider parity and official feasibility

**Files:**
- Create: `packages/agent/test/resident-acceptance-provider-feasibility.test.ts`

**Consumes:** P BYOK, OS secret-store, local-model, Codex, and xAI frozen
contracts and existing focused P tests.

**Produces:** credential-free cross-adapter parity and official-flow-only
feasibility evidence.

- [ ] **Step 1: Write failing tests**

```ts
it("A-07 projects BYOK and local-model readiness through the same secret-safe contract", async () => {
  const [byok, local] = await readProviderReadinessPair();
  expect(byok.contractVersion).toBe(local.contractVersion);
  expect(JSON.stringify([byok, local])).not.toMatch(/credential|endpoint|secret/i);
});

it("A-08 reports unavailable official subscriptions without token extraction or fallback", async () => {
  const result = await assessOfficialSubscriptionFeasibility("xai");
  expect(result).toMatchObject({ verdict: "unavailable", tokenExtractionAttempts: 0, fallbackSelections: 0 });
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- packages/agent/test/resident-acceptance-provider-feasibility.test.ts`

Expected: FAIL until CF-1-pinned P readiness/feasibility projections are
available to acceptance.

- [ ] **Step 3: Add acceptance checks**

Assert secret-free references, strict capability/ref/model equality, no
implicit backend substitution, approved local compatibility posture, and
official Codex/xAI success-or-safe-unavailable behavior. Do not access an OS
secret facility or attempt a subscription flow from deterministic tests.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- packages/agent/test/resident-acceptance-provider-feasibility.test.ts`

Expected: PASS without credentials, endpoints, token text, or network I/O.

- [ ] **Step 5: Commit and review**

Fresh P review checks that a provider limitation remains visible and is not
silently converted into a Nous, BYOK, local-model, or credential fallback.

### Task A-09: Production DTO, browser-closed, and served-checkout evidence

**Files:**
- Create: `packages/ui/test/resident-acceptance-cockpit-tailnet.test.tsx`

**Consumes:** U route/parser/presentation, W supervision, R/H projection, and
the served-checkout procedure approved by CF-1.

**Produces:** deterministic production-shaped DTO tests and a coordinator-only
served desktop/mobile/tailnet checklist.

- [ ] **Step 1: Write failing parser and browser-closed tests**

```tsx
it("A-09 rejects a stale cross-run production-shaped runtime DTO", () => {
  expect(() => parseResidentRuntimeStatus(productionPayload({ runId: "other-run" })))
    .toThrow("runtime-status-unavailable");
});

it("A-09 keeps supervision observable after the browser closes", async () => {
  await closeCockpitBrowser();
  const status = await readProductionSupervisionStatus();
  expect(["running", "paused", "resumable"]).toContain(status.lifecycle);
  expect(status.source).toBe("runtime-projection");
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- packages/ui/test/resident-acceptance-cockpit-tailnet.test.tsx`

Expected: FAIL before the production DTO and supervision route contracts merge.

- [ ] **Step 3: Add deterministic and served-checkout assertions**

Validate full route DTO parity, supported pause/resume/retry/cancel command
labels, absent/forged/secret/cross-run rejection, no browser canonical state,
and workspace-unavailable visibility. The coordinator procedure rebuilds the
exact served SHA, inspects desktop/mobile/tailnet routes, records only safe
DTO observations and served SHA, and blocks on stale build, route absence, or
parser fallback.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- packages/ui/test/resident-acceptance-cockpit-tailnet.test.tsx`

Expected: PASS deterministic coverage; tailnet remains coordinator-only and
cannot be declared passed by a source checkout or development server.

- [ ] **Step 5: Commit and review**

Fresh U/W/R/H review confirms React remains observer/controller, controls map
to real supported commands, and no source/artifact/provider/mount secret leaks
through the test payload.

### Task A-10: Cross-lane adversarial failures

**Files:**
- Create: `packages/agent/test/resident-acceptance-adversarial.test.ts`

**Consumes:** all merged producer contracts, A fixtures, and the focused
producer suites named in the program matrix.

**Produces:** the integration-only failure matrix that no focused lane can
prove alone and defect reports directed to the responsible owner.

- [ ] **Step 1: Write the failing matrix**

```ts
it.each([
  ["forged-approval", "approval-unavailable"],
  ["stale-source", "provenance-mismatch"],
  ["duplicate-claim", "claim-conflict"],
  ["budget-exhaustion", "budget-exhausted"],
  ["crash-after-manifest", "handoff-pending"],
  ["secret-bearing-dto", "secret-safety-rejection"],
  ["cross-run-handoff", "provenance-mismatch"]
])("A-10 fails closed for %s", async (injection, category) => {
  const result = await runIntegratedFailureInjection(injection);
  expect(result).toMatchObject({ category, externalEffects: 0, acceptedGraphMutations: 0 });
  expect(result.taskLifecycle).not.toBe("task-completed");
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- packages/agent/test/resident-acceptance-adversarial.test.ts`

Expected: FAIL until every tested production boundary is merged and its safe
failure/readback contract is available.

- [ ] **Step 3: Add cross-boundary checks only**

Add mount before/after-await authority changes, approval races, provider
capability/ref changes, all budget ceilings, corrupt/missing/swapped manifests,
sequence conflicts, hostile objects, secret keys/values, raw provider text,
cross-run browser DTOs, and fresh-process replay where state survives a crash.
For each, require one safe category, no prohibited effect, and exact durable
anchors. Return any producer defect with ID, command, safe evidence, owner,
and merged SHA.

- [ ] **Step 4: Run GREEN and cross-lane commands**

Run:

```bash
npm test -- packages/agent/test/resident-acceptance-adversarial.test.ts
npm test -- packages/agent/test/plan-observation-projection.test.ts packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/specialist-handoff-projection.test.ts
```

Expected: PASS; failures are safe blocked/failed/resumable states, never
fabricated success, fallback persistence, alternative provider selection, or
accepted graph change.

- [ ] **Step 5: Commit and review**

Fresh cross-lane review leads with defects, coverage gaps, ownership drift, and
unsafe evidence. Lane A commits only acceptance tests/fixtures and never a
producer repair.

## Coordinator-Only Live and Served-Checkout Gates

These gates are not executable by a Task 116 implementation child. After all
deterministic A tasks are reviewed, merged, and rerun from their recorded
rebased SHAs, the coordinator performs the following in its controlled
environment.

1. Verify the current mounted workspace identity/generation, mounted ledger and
   stores, high-water, policy, locks, exact `agent_default` task/attempt/run,
   selected Nous provider/model/capability, typed OS-secret reference, prompt
   artifact/input binding, sources/context hashes, budgets, and independent
   byte-transfer approval. A mismatch stops before network I/O.
2. Run `npm run agent:nous:smoke` only then. Preserve safe markers, provider
   and model IDs, allowed hashes, event IDs, context-pack IDs, counts,
   categories, and durable-readback marker. Do not persist or report prompt,
   source, output, credential, ref value, endpoint, header, raw response,
   command text, stack trace, or raw error.
3. Rebuild the exact checkout to be served, record its commit SHA, and inspect
   the served tailnet route at desktop and mobile sizes. Confirm production DTO
   parity, supported control effects, browser-closed supervision,
   workspace-unavailable visibility, and no secret/mount leakage. A different
   SHA, stale build, unavailable route, or parser fallback is a blocked gate.
4. Append only safe live/deployment evidence to the coordinator-owned
   acceptance matrix and registry. An outage, unavailable credential binding,
   approval denial, mount loss, or failed readback is an honest blocked or
   resumable verdict, never a deterministic pass or substitute backend.

## Review, Rebase, Rollback, and Defect Routing

- Before each acceptance implementation task, the coordinator records CF-1 and
  required producer SHAs, rebases the A worktree to them, reruns the named
  producer cross-lane command, and records the rebase. A stale worktree is not
  reviewed or merged.
- A fresh reviewer checks only the A diff against this plan, the A design,
  CF-1, producer contracts, and the program matrix. The reviewer starts with
  defects, missing failure cases, unsafe evidence, synthetic fixture behavior,
  scope drift, and missing verification.
- A test failure reports acceptance ID, safe category, exact command, opaque
  durable anchors, producer owner, and relevant merged SHA. Lane A does not
  hide the defect by weakening the assertion or changing producer code.
- Rollback removes only unmerged A-owned test/fixture commits or disposable
  mounted fixture roots. It never deletes a ledger event, material, manifest,
  production artifact, registry record, or prior acceptance evidence; a
  correction is append-only.
- After two focused verifier failures, preserve the exact command/output
  category, stop the child, and return it to the coordinator's root-cause
  checkpoint. A new scoped repair may use a fresh author/reviewer or a
  materially different counterfactual, but does not broaden Lane A ownership.

## Final Acceptance Sequencing

1. CF-1 merges and records test paths/interfaces/owners; required Wave 1--3
   producer commits merge and the A worktree rebases.
2. Implement and independently review the fixture, then A-01 through A-10 in
   dependency order: A-01/A-02; A-03/A-04; A-05/A-06; A-07/A-08; A-09; A-10.
3. Run each focused credential-free command, corresponding producer suite,
   `git diff --check`, `npm run factory:check`, and `npm run verify` before its
   task commit. Record only actual command results.
4. Rerun affected acceptance cases after every accepted producer repair and
   after every contract-changing rebase.
5. The coordinator performs real Nous and served-checkout/tailnet gates only
   after deterministic matrix evidence is complete. Wave 5 release integration
   records safe verdicts, served SHA, outstanding official-provider limitation,
   clean worktrees, review evidence, and merge state.

## Plan Self-Review Checklist

- [ ] A-01 through A-10 each have an owner boundary, deterministic fixture or
  command, direct failure cases, safe evidence, review, and defect route.
- [ ] Mounted restart/reconstruction/no-fallback, disconnect/reverify, durable
  handoff/provenance readback, approval races, secret safety, browser/tailnet,
  and coordinator-only Nous gates remain fail-closed and testable.
- [ ] Deterministic tests remain credential-free and Lane A neither invokes a
  provider nor creates a replacement store, runtime, DTO, or shared contract.
- [ ] Candidate test paths await CF-1 confirmation; a conflict blocks dispatch
  instead of silently moving ownership into a producer lane.
- [ ] Every task names a RED command, focused GREEN command, review boundary,
  rollback, rebase requirement, and no-`neo` integration rule.
- [ ] The section-local audit rejects every marker and semantic-clause removal,
  not merely a section heading deletion.

## Task 116 Stop Point

Task 116 ends after this plan and its append-only claim receive a fresh
independent review and a coordinator lane-plan approval record. It authorizes
neither CF-1, A-FIXTURE, A-01 through A-10 implementation, a live provider,
browser/tailnet inspection, child dispatch, production work, integration, nor
a merge into `neo`.
