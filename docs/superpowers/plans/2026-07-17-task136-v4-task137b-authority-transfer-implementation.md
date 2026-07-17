# Task136 V4 Task137B Authority Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development and
> superpowers:test-driven-development for the explicitly approved task-scoped
> implementation dispatches below. Steps use checkbox (- [ ]) syntax for
> tracking.

**Goal:** Admit the finite Task136 v4 ownership amendment, preserve the full
Task137B eight-commit evidence chain, and repair the two reproduced authority
defects inside the exact fourteen-path Task137B ceiling.

**Architecture:** V4 is a versioned assurance contract and checker amendment
with two hard-coded historical compatibility branches. It has no new card and
no reusable transfer abstraction. After the V4 checker becomes the integration
base, the Task137B worker replays the preserved eight commits, then adds one
causal RED and one GREEN. Coordinator dual review replaces another user
approval stop before full-chain integration and record 11.

**Tech Stack:** Node.js ESM and node:test, JSON, TypeScript, Vitest, Bash,
Git, and the existing Task137 terminal gate.

## Global Constraints

- Governing design:
  docs/superpowers/specs/2026-07-17-task136-v4-task137b-authority-transfer-design.md.
- Preserve the byte-for-byte V1, V2, V3 contracts and the first ten release
  records; check their exact SHA-256 values from the design.
- Preserve all 29 cards and their order. Task137B-W is record 11 and has,
  in order, Task135B, T120-R, Task137A, and Task129-MFA as direct
  prerequisites.
- Transfer only four exact paths: portable-workspace-lifecycle.ts and its test
  from Task137A, plus mounted-artifact-authority-operation.ts and its test from
  Task129-MFA. Do not make a general transfer mechanism.
- Task137B-W owns exactly fourteen paths. The expanded card command must cover
  all seven owned test paths. Existing terminal-gate tests already cover the
  two moved prerequisite tests and must not change.
- Preserve append-only ledger evidence, strict durable readback, monotonic
  invalidation, no fallback store, and one current supervisor per workspace.
- `wake-supervisor-runtime.ts` keeps
  `registerMountedArtifactAuthorityIssuerForWakeRuntime` as its sole import
  from `mounted-artifact-authority-operation.ts`; no standalone
  authentication seam is permitted. Advance the Task137 authority import
  grammar and corpus together to v3 while retaining exactly eight allowed
  fixtures, twenty rejected fixtures, and one
  `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker. Keep the wake
  runtime's existing fixture/import unchanged and add only
  `mounted-wake-lifecycle-store.ts` as the authorized capability type and
  inspector consumer in the existing allowed-fixture structure.
- No registry, source, or claim edit occurs in this documentation task. During
  later implementation only the coordinator writes the registry.
- Do not run npm run verify. Use targeted tests, typecheck, diff check,
  factory check, terminal gate, clean checkout, and non-symlinked dependency
  checks. Do not use network, providers, credentials, external services, push,
  rebase, reset, neo, or a full verifier.
- Implementation dispatches are approved for task-scoped SDD/TDD with one
  production writer. Reviewers are read-only and do not use SDD/TDD.
- Stop with structured evidence on data-loss risk, schema conflict, unavailable
  dependency, scope mismatch, or two failed focused repairs. The coordinator
  recovers under this approved contract without a routine user approval loop.

## Exact File Ownership

| Task | Owned files |
| --- | --- |
| 1 | docs/agentic/contracts/task136-bounded-assurance-v4.json; scripts/resident-agent/assurance/task136-bounded-assurance.mjs; scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs; docs/agentic/claims/task-136-v4-task137b-authority-transfer.md |
| 3-4 | packages/local-runtime/src/portable-workspace-lifecycle.ts; packages/local-runtime/test/portable-workspace-lifecycle.test.ts; packages/local-runtime/src/mounted-artifact-authority-operation.ts; packages/local-runtime/test/mounted-artifact-authority-operation.test.ts; packages/local-runtime/src/wake-supervisor-runtime.ts; packages/local-runtime/src/mounted-wake-lifecycle-store.ts; packages/local-runtime/test/wake-supervisor-runtime.test.ts; packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts; packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts; packages/local-runtime/test/support/task137-authority-boundary-policy.ts; packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts; packages/ontology/src/contracts.ts; packages/ontology/test/resident-wake-contracts.test.ts; docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md |
| 2, 5 | Coordinator integration and append-only registry evidence only; reviewers write no files. |

The Task137B list is ordered and exhaustive. A cumulative diff from the V4
integration base contains every listed Task137B path and no other path.

## Exact Commands And Count Preflight

The V4 focused command is:

~~~bash
npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/ontology/test/resident-wake-contracts.test.ts
~~~

The V4 cross-lane command is:

~~~bash
npm test -- packages/ontology/test/resident-wake-contracts.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/agent/test/wake-supervisor.test.ts
~~~

The preserved tip gives this exact derivation before the new RED:

~~~text
old focused: 5 files / 39 tests
portable lifecycle prerequisite: 11 tests
mounted authority prerequisite: 17 tests
expanded focused baseline: 39 + 11 + 17 = 67 tests
cross-lane baseline: 9 files / 123 tests
new v4 causal cases: 7 tests
focused GREEN: 67 + 7 = 74 tests
cross-lane GREEN: 123 + 7 = 130 tests
~~~

The RED adds exactly the seven cases named in Task 4 and changes no existing
test count. Focused and cross-lane GREEN each print exactly one
TASK137_POLICY_CORPUS_OK allowed=8 rejected=20 marker from the pinned
`task137-authority-import-grammar.v3` and
`task137-authority-import-corpus.v3` policy.

---

### Task 1: Freeze And Test The V4 Assurance Contract

**Branch/worktree:** codex/task136-v4-task137b-authority-transfer in an
isolated task worktree.

**Files:**
- Create: docs/agentic/contracts/task136-bounded-assurance-v4.json
- Create: docs/agentic/claims/task-136-v4-task137b-authority-transfer.md
- Modify: scripts/resident-agent/assurance/task136-bounded-assurance.mjs
- Modify: scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs

**Interfaces:**
- Consumes: immutable V1/V2/V3 JSON contracts, the first ten release records,
  and the V3 finite checker API.
- Produces: V4 loadContract, verifyStaticGraph,
  verifyTask136ReleasePrefix, and runTask136RepositoryAdmission behavior that
  allows an eleven-record prefix only after record 11 exists.

- [ ] **Step 1: Claim the four-file assurance slice**

Create a claim with status in-progress, this plan and design, branch/worktree,
the four owned files, V1/V2/V3 byte pins, and the approved SDD/TDD wording.
Commit it alone:

~~~bash
git add docs/agentic/claims/task-136-v4-task137b-authority-transfer.md
git commit -m "chore: claim task136 v4 authority transfer"
~~~

- [ ] **Step 2: Write V4 checker tests before production changes**

Add node:test assertions for the exact V4 schema, graph, compatibility version,
fingerprint 31123be5bec8cafed581c23efd5c5fcbea5780f662216e725f90b20eb268d2db,
all 29 ordered cards, Task137B-W's four direct prerequisites, its fourteen
owned paths, and its exact seven-suite command.

Add one-fact mutation cases that reject a 30th/reordered card; V1/V2/V3 or
first-ten byte drift; either compatibility hash drift; an extra/missing
compatibility tuple or path; a Task137A mapping other than the exact four
paths to Task129-MFA and two paths to Task137B-W; a Task129-MFA target other
than Task137B-W; a missing direct Task137A prerequisite; a source HEAD
migration before record 11; and a stale/non-blob candidate, integration, or
final-head blob.

- [ ] **Step 3: Run the causal RED**

~~~bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
~~~

Expected: failure opening
docs/agentic/contracts/task136-bounded-assurance-v4.json. No V3 contract or
registry record changes are permitted.

- [ ] **Step 4: Create the finite V4 JSON contract**

Copy V3 exactly and make only this delta:

~~~json
{
  "schemaVersion": "task136-bounded-assurance.v4",
  "releaseCompatibility": {
    "version": "task136-release-compatibility.v2",
    "historicalRecords": [
      {
        "cardId": "Task137A",
        "canonicalJsonSha256": "ac3ac479d5b1e41db4ae15cea88b746f86bbc31f6af3ea74a6120834dc2c2198"
      },
      {
        "cardId": "Task129-MFA",
        "canonicalJsonSha256": "23cb98725d67ada15c0e2913816f82407c171912564423e669cf73995aaead76"
      }
    ]
  },
  "releaseGraph": { "version": "task136-release-graph.v4" }
}
~~~

Task137A changes only portable-workspace-lifecycle.ts and its test from owned
to transferred, retains its four existing Task129-MFA paths, and sets
transferToIds to Task129-MFA then Task137B-W. Task129-MFA changes only
mounted-artifact-authority-operation.ts and its test from owned to transferred.
Task137B-W prepends the four migrated paths to its existing ten, uses the
four exact prerequisites, and uses the focused command above. The two
compatibility path lists are exactly the two Task137A paths and five
Task129-MFA paths from the design, all historically owned.

Verify the reproducible pretty JSON bytes:

~~~bash
test "$(sha256sum docs/agentic/contracts/task136-bounded-assurance-v4.json | cut -d ' ' -f 1)" = "bb02ba569157f9c57205e423040e3eb6e8cc7b2c95ed0ef968fd4c9afefc6e9e"
~~~

- [ ] **Step 5: Implement only the two fixed compatibility branches**

Set the default contract path to V4 and pin the V4 fingerprint. The checker
has only these source-specific rules:

~~~text
Task137A:
  four pre-existing authority/policy paths -> Task129-MFA
  portable lifecycle source/test -> Task137B-W
Task129-MFA:
  contracts.ts, mounted authority source/test, import-policy test, policy source
  -> Task137B-W
all other sources:
  existing single-target V3 behavior
~~~

Reject every other multi-target source. Always compare historic source
candidate and integration blobs to historic records. Before record 11, also
require source HEAD equality. Once a parsed Task137B-W record exists, skip
source HEAD equality only for the four migrated paths and require record 11
candidate, integration, and HEAD equality for every one of its fourteen owned
paths. Keep npm execution as execFileSync with argument arrays.

- [ ] **Step 6: Run GREEN and bounded admission**

~~~bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode contract
git diff --check
npm run factory:check
test ! -L node_modules
test -x node_modules/.bin/vitest
~~~

Expected contract markers, exactly once:

~~~text
TASK136_RELEASE_GRAPH_OK records=29
TASK136_COMPOSITION_CORPUS_OK green=1 red=20
TASK136_COMMAND_CARDS_OK cards=29
TASK136_ABI_CORPUS_OK green=1 red=15
~~~

Repository mode on this clean candidate emits the ordered ten-record prefix,
then fails closed with expected 29 records, found 10.

- [ ] **Step 7: Commit the assurance implementation**

~~~bash
git add docs/agentic/contracts/task136-bounded-assurance-v4.json \
  scripts/resident-agent/assurance/task136-bounded-assurance.mjs \
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs \
  docs/agentic/claims/task-136-v4-task137b-authority-transfer.md
git commit -m "feat: migrate task136 assurance contract to v4"
~~~

### Task 2: Review And Integrate The V4 Assurance Base

**Owner:** Coordinator. Reviewers are read-only.

- [ ] **Step 1: Run two fresh reviews on the exact assurance candidate**

The architecture reviewer checks all immutable byte pins, raw first-ten pins,
the four direct paths, both fixed source branches, historical dispositions,
and record-11-only current-head migration. The executability reviewer reruns
node:test, contract markers, the expected 10/10 prefix failure, diff check,
factory check, clean checkout, and non-symlinked dependency checks. Neither
may introduce a generic transfer facility.

- [ ] **Step 2: Integrate only after two literal APPROVED verdicts**

Integrate the reviewed V4 commits with forward commits or ordered
cherry-picks. Record the clean resulting SHA as V4_INTEGRATION_BASE. Do not
append record 11 yet. At this base, Task137B-W remains the next executable
card and repository admission remains the 10/10 prefix followed by the
expected 29-record closure failure.

### Task 3: Replay The Preserved Task137B Evidence Onto V4

**Branch/worktree:** a fresh task-scoped worktree from V4_INTEGRATION_BASE.

**Files:** only the fourteen Task137B paths in Exact File Ownership.

**Interfaces:**
- Consumes: V4 assurance integration, released first-ten prerequisites, and
  the candidate tip 9986cdaa036e2fe39eef2f97833a56ae787c7bf7.
- Produces: the original eight commits reproduced in order before a new V4
  causal RED/GREEN pair.

- [ ] **Step 1: Establish the clean V4 preflight**

~~~bash
V4_INTEGRATION_BASE="$(git rev-parse HEAD)"
git diff --check
test -z "$(git status --porcelain --untracked-files=all)"
test ! -L node_modules
test -x node_modules/.bin/vitest
~~~

Run repository mode with set +e. It must emit exactly
TASK136_REPOSITORY_PREFIX_OK records=10 commands=10, return nonzero, and end
with repository release closure incomplete: expected 29 records, found 10.

- [ ] **Step 2: Replay all eight preserved commits in order**

~~~bash
git cherry-pick -x 0fcaad54c77fdfd25e0849103f4a6e5b6ed447fa
git cherry-pick -x 87b050d5e67ccd157ad0a67cc345adbfc84ed843
git cherry-pick -x b91fab82bfc42143b9a3fab1ce77188457fc4f45
git cherry-pick -x 91a62d4f8900c927021bbeb04fb84db93ec3eeb5
git cherry-pick -x bc8d36e6e4f217f6eadeb433ef791794e5a80259
git cherry-pick -x 0ba85b7cb26cb7a0f347968a0c80fa86b35529b3
git cherry-pick -x 60b8ca649c30d6532b5b1fc6457856e03215e17d
git cherry-pick -x 9986cdaa036e2fe39eef2f97833a56ae787c7bf7
~~~

Do not squash, reorder, rebase, or reset. A conflict is a coordinator recovery
checkpoint: preserve evidence and return it instead of changing the chain.

- [ ] **Step 3: Prove the preserved-chain baseline**

The focused command passes exactly 7 files / 67 tests. The cross-lane command
passes exactly 9 files / 123 tests. Each emits one policy marker. Then run:

~~~bash
npm run typecheck
timeout 600 bash scripts/resident-agent/assurance/task137-terminal-gate.sh </dev/null
git diff --check
npm run factory:check
~~~

The gate emits its six ordered stage lines and
TASK137_GATE_COMPLETE stages=6. Verify that the cumulative diff from
V4_INTEGRATION_BASE contains exactly the original ten Task137B paths before
the four direct transfers are exercised.

### Task 4: Add The V4 Causal RED And Fourteen-Path GREEN

**Branch/worktree:** continue the Task 3 worktree.

**Files:** exactly the fourteen Task137B paths in Exact File Ownership.

**Interfaces:**
- Consumes: preserved Task137B runtime/store, factory capture and inspection,
  portable lifecycle ports, and the existing mounted-artifact authority
  registrar.
- Produces: a registrar-issued opaque wake capability, a mounted store that
  accepts only that capability, and a two-phase registration that never
  reintroduces a raw-handle bind path.

**Execution:** One production worker performs this task-scoped RED/GREEN
sequence. The standing authorization explicitly preserves task-scoped
subagent-driven development and test-driven development for that worker; it
does not require a second implementation worker.

- [ ] **Step 1: Append the V4 amendment to the preserved claim**

Keep the original eight-commit evidence verbatim. Append a V4 section naming
V4_INTEGRATION_BASE, the four transferred paths, the fourteen-path ceiling,
the 67 + 7 = 74 and 123 + 7 = 130 derivation, and the approved SDD/TDD
authorization. It records that only a new causal RED/GREEN follows the
preserved chain.

- [ ] **Step 2: Write exactly seven causal RED cases**

Add exactly one test case for each row and retain every existing case count.

| Case | Required assertion |
| --- | --- |
| 1 | The registrar `authenticate` phase receives the raw handle identity, immediately runs factory capture and inspection, and rejects a forged structural runtime handle before any raw handle property read, lifecycle callback, store construction, ledger read, ledger append, or I/O. |
| 2 | The registrar `bind` phase accepts only the exact capability returned by `authenticate`, plus final wake-runtime identity and lifecycle ports after store/lifecycle construction; it rejects a raw handle or copied/structural/forged/stale capability before effects. |
| 3 | Lease acquisition captures one normalized finite ISO instant, uses the sole positive 300000 ms duration, and rejects zero, negative, non-finite, malformed, or over-ceiling duration before append. |
| 4 | Consumption compares durable expiry with a freshly normalized instant and burns authority without timer help before provider, tool, artifact, lifecycle, or ledger effect. |
| 5 | `createWakeSupervisorRuntime` normalizes only the outer DTO to retrieve raw-handle identity, invokes registrar `authenticate` first, never reads raw-handle properties, and thereafter obtains mount/identity/ledger state only through the authenticated capability and store. |
| 6 | `createMountedWakeLifecycleStore` accepts only the opaque capability and ordinary non-authority values; its one dedicated inspector rejects copied/structural/forged/stale capabilities before returning private captured state, and forged or expired capability paths produce zero provider, tool, artifact, lifecycle, and ledger effects. |
| 7 | Shutdown, authority loss, admission mismatch, capture mismatch, ledger regression, expiry, and successor acquisition invalidate monotonically; successful append returns only after exact global and stream reread; no fallback store exists and one workspace has one current supervisor. |

Use transferred portable-lifecycle and mounted-authority tests for their own
boundaries, wake/store tests for runtime/durable effects, and the import-policy
test for the only two authorized authority seams: the wake runtime retains its
existing registrar import, and the mounted store alone imports the capability
type plus the dedicated inspector. Pin the policy grammar/corpus at v3, keep
all seven wake schemas, retain the 8/20 corpus, and emit one marker.

- [ ] **Step 3: Run and commit the causal RED**

Run the focused command. Expected: 7 files / 74 tests, exit 1, exactly the
seven new authority failures, and exactly one policy marker. Commit only RED
tests and claim evidence inside the fourteen paths:

~~~bash
git add packages/local-runtime/test/portable-workspace-lifecycle.test.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation.test.ts \
  packages/local-runtime/test/wake-supervisor-runtime.test.ts \
  packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts \
  packages/local-runtime/test/support/task137-authority-boundary-policy.ts \
  docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md
git commit -m "test(task137b): reproduce v4 authority transfer defects"
~~~

- [ ] **Step 4: Implement the minimum opaque capability boundary**

In `mounted-artifact-authority-operation.ts`, keep
`registerMountedArtifactAuthorityIssuerForWakeRuntime` as the only registrar
and make it a two-phase discriminated seam. Its `authenticate` phase receives
the raw handle identity and immediately calls factory capture and inspection
before any handle member read, lifecycle callback, store construction, ledger
read/append, or I/O. It stores the private captured state in a `WeakMap` keyed
by the capability it returns. Its `bind` phase receives that exact capability,
the final wake-runtime identity, and lifecycle ports after store/lifecycle
construction; it completes the existing registration and has no raw-handle
field.

~~~ts
export interface FactoryAuthenticatedMountedWakeCapability {
  readonly schemaVersion: "factory-authenticated-mounted-wake-capability.v1";
}

export function registerMountedArtifactAuthorityIssuerForWakeRuntime(input: {
  readonly phase: "authenticate";
  readonly runtimeHandle: unknown;
}): FactoryAuthenticatedMountedWakeCapability;

export function registerMountedArtifactAuthorityIssuerForWakeRuntime(input: {
  readonly phase: "bind";
  readonly capability: FactoryAuthenticatedMountedWakeCapability;
  readonly wakeRuntime: object;
  readonly lifecyclePorts: PortableWorkspaceLifecyclePorts;
}): void;

interface FactoryAuthenticatedMountedWakeCapturedState {
  // Module-private captured factory state; never exported or capability-owned.
}

export function inspectFactoryAuthenticatedMountedWakeCapabilityForMountedWakeLifecycleStore(
  capability: FactoryAuthenticatedMountedWakeCapability
): FactoryAuthenticatedMountedWakeCapturedState;
~~~

The public capability exposes no handle, ledger, paths, callbacks, lifecycle
ports, or storage constructor. The dedicated inspector is the only
capability-to-captured-state seam: it reads the registrar `WeakMap`, rejects
copied, structural, forged, and stale values, and returns private captured
state only to `mounted-wake-lifecycle-store.ts`.

`createWakeSupervisorRuntime` normalizes only the outer DTO enough to retrieve
the raw-handle identity, calls registrar `authenticate` first, and does not
read raw-handle properties. It subsequently obtains mount, identity, and
ledger state only through the authenticated capability and mounted store, then
calls registrar `bind` after store/lifecycle construction.
`createMountedWakeLifecycleStore` accepts only the opaque capability and
ordinary non-authority values; it has no raw-handle overload or fallback route.

Advance the Task137 policy source/test to
`task137-authority-import-grammar.v3` and
`task137-authority-import-corpus.v3`. Preserve the existing wake-runtime
allowed fixture as the exact value import
`registerMountedArtifactAuthorityIssuerForWakeRuntime`, with no type import or
additional named authority import. Add only the existing allowed-fixture entry
for `mounted-wake-lifecycle-store.ts`: it may value-import
`inspectFactoryAuthenticatedMountedWakeCapabilityForMountedWakeLifecycleStore`
and type-import `FactoryAuthenticatedMountedWakeCapability`. Every other
protected-module import remains rejected; the corpus remains exactly eight
allowed and twenty rejected fixtures with one marker.

Capture one normalized claimedAt instant, derive leaseExpiresAt once as
new Date(Date.parse(claimedAt) + 300000).toISOString(), persist it, read it
back exactly, and compare it to a newly normalized time at every consumption.
Expiry and successor acquisition burn old stores, admissions, operations, and
ports permanently. Every invalidation advances a monotonic revision before it
returns; each append proves exact stream and global readback before success.

- [ ] **Step 5: Run GREEN and exact admission**

Run focused and cross-lane commands. Expected: exactly 7 files / 74 tests and
9 files / 130 tests, respectively, each with one policy marker. Then run:

~~~bash
npm run typecheck
git diff --check
npm run factory:check
test ! -L node_modules
test -x node_modules/.bin/vitest
~~~

The terminal gate runs in the next step only after committing GREEN because it
deliberately rejects an uncommitted checkout.

- [ ] **Step 6: Commit GREEN and prove scope**

~~~bash
git add packages/local-runtime/src/portable-workspace-lifecycle.ts \
  packages/local-runtime/test/portable-workspace-lifecycle.test.ts \
  packages/local-runtime/src/mounted-artifact-authority-operation.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation.test.ts \
  packages/local-runtime/src/wake-supervisor-runtime.ts \
  packages/local-runtime/src/mounted-wake-lifecycle-store.ts \
  packages/local-runtime/test/wake-supervisor-runtime.test.ts \
  packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts \
  packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts \
  packages/local-runtime/test/support/task137-authority-boundary-policy.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts \
  packages/ontology/src/contracts.ts \
  packages/ontology/test/resident-wake-contracts.test.ts \
  docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md
git commit -m "fix(task137b): enforce factory-authenticated wake authority"
timeout 600 bash scripts/resident-agent/assurance/task137-terminal-gate.sh </dev/null
test -z "$(git status --porcelain --untracked-files=all)"
git diff --name-only "$V4_INTEGRATION_BASE" HEAD | sort
~~~

Expected: only the fourteen ordered paths in Exact File Ownership, no
untracked files, and a claim receipt for the 74/130 GREEN commands. Do not run
repository assurance mode before release record 11: that record is the
boundary that permits current HEAD ownership to move.

### Task 5: Fresh Reviews, Full-Chain Integration, And Record 11

**Owner:** Coordinator. Reviewers are read-only; only the coordinator appends
the registry after integration.

- [ ] **Step 1: Obtain two fresh exact-candidate reviews**

The architecture/invariant review checks authentication ordering, opaque store
boundary, one-instant finite lease, consumption-time expiry, permanent
staleness, monotonic invalidation, durable readback, no fallback, single
supervisor, fourteen-path ownership, and append-only historical evidence. The
executability/adversarial review reproduces committed RED, 74-test focused
GREEN, 130-test cross-lane GREEN, typecheck, terminal markers, exact scope,
factory readiness, clean checkout, and non-symlinked dependencies. Both return
literal unqualified APPROVED.

- [ ] **Step 2: Integrate all ten commits in order**

After both approvals, integrate the eight preserved commits followed by the
new RED and GREEN from V4_INTEGRATION_BASE. Do not squash, drop an historical
RED, rebase, or reset. Record the final integration commit as
TASK137B_V4_INTEGRATION_SHA. The reviewed candidate and integration must each
descend from V4_INTEGRATION_BASE and each include all four released
prerequisite integrations; their fourteen owned-path blobs must be identical.

- [ ] **Step 3: Append and commit strict record 11**

Set candidateSha to the reviewed GREEN SHA and integrationSha to
TASK137B_V4_INTEGRATION_SHA. Each fresh review record uses its exact reviewer
UUID and the candidate SHA. Set releaseEventId to
task136-release-v4-Task137B-W. Copy prerequisite integration/release pairs
from the first ten records in this order:

~~~text
Task135B
T120-R
Task137A
Task129-MFA
~~~

For each of fourteen ordered paths, use the candidate blob SHA and prove
candidate, integration, and current HEAD blobs are identical. Every record-11
disposition is owned. Commit the registry-only release append, then run
repository mode on the clean checkout. Expected output is:

~~~text
TASK136_REPOSITORY_PREFIX_OK records=11 commands=11
repository release closure incomplete: expected 29 records, found 11
~~~

- [ ] **Step 4: Append the E678/E679 timestamp correction**

Only after the clean 11/11 checkpoint, append RV-1-E-680. It leaves the
original Recorded at lines in RV-1-E-678 and RV-1-E-679 untouched and records
corrected causal display times 2026-07-17T03:50:00Z and
2026-07-17T04:05:00Z. It states that this is not a release record, does not
alter the first eleven release blocks, and leaves W1-123-H-SHARED-SCHEMA as
the next graph card. Commit this append-only correction, rerun clean
repository admission, and retain the same 11/11 prefix and incomplete-29
result.

No full verification, Task139 work, network action, provider call, credential
access, external service, push, rebase, reset, registry rewrite, or neo
operation is permitted in this sequence.
