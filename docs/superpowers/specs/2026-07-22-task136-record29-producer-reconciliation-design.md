# Task136 Record-29 Producer Reconciliation Design

**Date:** 2026-07-22

**Status:** Approach 1 is program-owner approved. This exact written revision
requires program-owner review before implementation planning or any assurance,
mission-state, product, or Task136 RED change.

## Decision And Authority

Task136 remains the twenty-ninth and final card in the frozen V4 release graph.
The approved correction transfers a finite set of released producer paths
directly to Task136, preserves the exact 29 card IDs and order, and preserves
the raw strict release records for cards 1 through 28 byte-for-byte.

The governing repository evidence is:

- program authority `RV-1-E-931` at exact design base
  `752a021ee7299b028ec6b05750471cf0962732ce`;
- the clean, history-preserving Task136 checkpoint
  `72e1ee6624c582218995e3e075e2303998811834`;
- strict record-28 integration
  `12d23a69047d58e14dd04c4f89daf3f8a528e8aa` and registry release
  authority `30e4dbc705a9ad8325b2cf11a26c1e444b430fb7`;
- integrated record-28 assurance
  `8e958445e3a3b3d40396df82883153790362868d`;
- published `neo` milestone
  `dc05c43c4b9a592d0396acd034bfc32e177fd09a`.

The strict product frontier is 28 of 29. This design is not a product release,
does not approve a Task136 candidate, and does not start Wave 3.

## Root Cause

The clean pre-RED audit proved that Task136's original three-path ceiling
cannot implement the frozen bounded loop without inventing local adapters or
shadow schemas:

1. T120-R exposes only V1 plan and observation writes, not the canonical V2
   five-event append/readback and replay store required by Task136.
2. C136-P returns normalized but structurally broad records instead of one
   typed, explicitly untrusted V2 plan-candidate boundary.
3. G136-R accepts a caller-supplied execution callback, uses a string approval
   class, and cannot provide the required prebound single-use execution and
   approval capability.
4. Task137B-W does not issue the opaque suspend, release, reclaim, and
   post-await revalidation port required for a ledger-only resume.
5. CF1-HR's V2 sequence validator requires a suspension before every result,
   even though completed and failed results are terminal rather than resumable.
   Its full H projection also has no mounted, R-only read port.
6. Task136-FC-Ports returns only a data summary and does not compose the real
   T120/C/G/W/H capabilities into a production bounded loop.

Task136 is forbidden from repairing those gaps locally. The correction must
change the producer-owned bytes under exact V4 ownership transfer and make
Task136 their final current owner only at strict record 29.

## Considered Approaches

### Approach 1: finite direct-source transfer to Task136

Keep the graph at 29 cards, preserve records 1-28, declare exact historical
compatibility for the six released source cards, and move current ownership of
only the causally changed source/test paths to Task136 at record 29.

This is the selected and approved approach. It uses the existing V4 transfer
mechanism, retains source candidate and integration blob proof, and makes the
final repository state mechanically rebuildable.

### Approach 2: add a V5 card or new producer-repair cards

This would change the frozen card count/order and insert a release between
record 28 and Task136. It is unnecessary because every missing seam has a
known released owner and a finite path set. Rejected.

### Approach 3: add Task136-local compatibility adapters

This would let Task136 reinterpret V1 data, accept structural ports, invent a
successful suspension, or reconstruct H state. It would violate the original
owner boundaries and weaken restart rebuildability. Rejected.

## Exact V4 Ownership Transfer

Exactly 21 released source/test paths transfer to Task136. Source claims stay
unchanged. Existing source commands stay unchanged. Each source appends
`Task136` to `transferToIds` after every current target.

| Source card | Exact paths transferred to Task136 |
| --- | --- |
| T120-R | `packages/agent/src/plan-observation-contracts.ts`; `packages/agent/src/plan-observation-projection.ts`; `packages/agent/test/plan-observation-contracts.test.ts`; `packages/agent/test/plan-observation-projection.test.ts` |
| C136-P | `packages/agent/src/resident-plan-candidate-provider.ts`; `packages/agent/test/resident-plan-candidate-provider.test.ts` |
| G136-R | `packages/agent/src/resident-loop-tool-gateway.ts`; `packages/agent/test/resident-loop-tool-gateway.test.ts`; `packages/agent/test/resident-loop-scheduler-completion-imports.test.ts` |
| Task137B-W | `packages/local-runtime/src/wake-supervisor-runtime.ts`; `packages/local-runtime/src/mounted-wake-lifecycle-store.ts`; `packages/local-runtime/test/wake-supervisor-runtime.test.ts`; `packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts`; `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts` |
| CF1-HR | `packages/agent/src/specialist-handoff-projection.ts`; `packages/agent/test/specialist-handoff-projection.test.ts`; `packages/ontology/src/contracts.ts`; `packages/ontology/test/agent-resident-loop-contracts.test.ts` |
| Task136-FC-Ports | `packages/local-runtime/src/resident-loop-factory-ports.ts`; `packages/local-runtime/test/resident-loop-factory-ports.test.ts`; `packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts` |

The exact resulting target arrays are:

```json
{
  "T120-R": ["Task136"],
  "C136-P": ["Task136"],
  "G136-R": ["Task136"],
  "Task137B-W": ["CF1-HR", "Task139-PM", "Task136"],
  "CF1-HR": ["Task122", "W1-123-BOOTSTRAP-HANDOFF", "Task136"],
  "Task136-FC-Ports": ["Task136"]
}
```

The following tempting paths remain byte-for-byte unchanged and do not
transfer: the portable-workspace lifecycle pair, mounted-artifact authority
pair and policy, `runtime-handle-mounted-authority-imports.test.ts`, FC-Core,
every producer claim, and every Task138-H path. The wake runtime and mounted
store already retain the authenticated mounted store, facts, lifecycle
admission, and reconciliation ports needed to issue W. The public portable
lifecycle remains an unchanged dependency and cross-boundary regression gate.

## Exact Task136 Card

Task136 gains one direct prerequisite because transitive Task138-H ancestry
does not authorize CF1-HR source modification:

```json
[
  "T120-R",
  "Task136-FC-Ports",
  "Task139-P2",
  "C136-P",
  "G136-R",
  "Task137B-W",
  "Task138-H",
  "CF1-HR"
]
```

Task136 owns exactly 24 paths in this order at record 29:

```text
packages/agent/src/bounded-agent-loop.ts
packages/agent/test/bounded-agent-loop.test.ts
packages/agent/src/plan-observation-contracts.ts
packages/agent/src/plan-observation-projection.ts
packages/agent/test/plan-observation-contracts.test.ts
packages/agent/test/plan-observation-projection.test.ts
packages/agent/src/resident-plan-candidate-provider.ts
packages/agent/test/resident-plan-candidate-provider.test.ts
packages/agent/src/resident-loop-tool-gateway.ts
packages/agent/test/resident-loop-tool-gateway.test.ts
packages/agent/test/resident-loop-scheduler-completion-imports.test.ts
packages/local-runtime/src/wake-supervisor-runtime.ts
packages/local-runtime/src/mounted-wake-lifecycle-store.ts
packages/local-runtime/test/wake-supervisor-runtime.test.ts
packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts
packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts
packages/agent/src/specialist-handoff-projection.ts
packages/agent/test/specialist-handoff-projection.test.ts
packages/ontology/src/contracts.ts
packages/ontology/test/agent-resident-loop-contracts.test.ts
packages/local-runtime/src/resident-loop-factory-ports.ts
packages/local-runtime/test/resident-loop-factory-ports.test.ts
packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts
docs/agentic/claims/task-136-resident-full-vision-bounded-loop.md
```

Its exact card command is:

```text
npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts packages/agent/test/resident-plan-candidate-provider.test.ts packages/agent/test/resident-loop-tool-gateway.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts packages/local-runtime/test/resident-loop-factory-ports.test.ts packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts
```

## Historical Compatibility And Immutable Release Evidence

`releaseCompatibility.version` remains
`task136-release-compatibility.v2`. Its entries are exact, source ordered, and
limited to these ten records:

| Order | Card | Canonical JSON SHA-256 | Newly appended historical-owned paths |
| --- | --- | --- | --- |
| 1 | Task137A | `ac3ac479d5b1e41db4ae15cea88b746f86bbc31f6af3ea74a6120834dc2c2198` | none |
| 2 | Task129-MFA | `23cb98725d67ada15c0e2913816f82407c171912564423e669cf73995aaead76` | none |
| 3 | Task135B | `73d8e28bdc56dbecf924a45a14c4caf8bb0864c89a4db98e1114f62f83d53409` | none |
| 4 | T120-R | `bb2e2bcdd90d1036f0e0ad16719dcc99405ec3170691f115641649dc59b56830` | its four transferred paths in source order |
| 5 | Task137B-W | `833ca5cc5aa191fdf9f98c692255133afaaf73b541b36275cab7ed04ef601e29` | its five transferred paths after its existing four entries |
| 6 | CF1-HR | `d55028e1bd036051f5ec2c9d496267623ff2748e54713d3881a198667ac62f12` | handoff projection pair, then ontology pair, after its existing four entries |
| 7 | Task136-FC-Ports | `d860a7ea14900431a361e95604d49efa6dbf824d8ccc85a06f27fe277698bc0d` | its three transferred paths |
| 8 | G136-R | `ba3fb8927ec24348f405db53cd6cf200481cb979ca6ce4cbe1216b5ce635d9b8` | its three transferred paths |
| 9 | C136-P | `2c8da3d4b61fb472232211be2bd8b994140e044b13fb1cc977e86a6171d4575a` | its two transferred paths |
| 10 | Task122 | `729d23c6c84c6ea33567a4b669c9ad960e830cf601a0d9ec5638308d3a360c0c` | none |

Every declared historical disposition is exactly `owned`. The original
candidate and integration blobs remain mandatory. For the new transfer groups,
the source record blob pins are:

```text
T120-R
  549c7a830252dca6fa11bd27566dc762680e9872
  d9f2f32575f69e71bf4461f1b20e95185136ac2e
  9bfd1b204e80790e88fb10ff96ca3816a9a2fea1
  cd4cbf84b9f578822d8c197e0bce4217e18d34d9
Task137B-W
  2ec8fd3584125dc6a6d0b5f44a068758285ce9ca
  5e4ff153b12c1c16cd76327db2e3081dbd0a29f8
  da6d3c00a7acc29312fe004a1a9d12d76f5edc59
  6fa011acf2c559b95f06b2ece63744f12c03c47a
  2f66aa242b3e944a9d6661d976509cbbfca53a3c
CF1-HR
  311120f59e9d40628c4d091f958f3ba2bf2ff53d
  4b512655dcd2d52875f82959d24817226bbd3b61
  a80d216da75e73ce1ffec52626822d3670ffa846
  e91d1848b389a03f03ce841458de3c8543b85035
Task136-FC-Ports
  f60b07537d0efa98ca9934ac3bcf5e79af246a6e
  e448dad8f57f9c87957ffb1b4a2d99cb24dffc51
  2dd1161d2a168d13d3fc8add6f7f82b201800538
G136-R
  1d4ceaed0cc5efe4640a7e135eedf8f2c07dc8fe
  86d3d4cfa0af753c10fa1324e91f956dc8f9c68d
  7c46ff3556cb82d05bb3f38334bb1084e9a82d22
C136-P
  ed5c8d9f98b9c433099045f2ad2112b2ecdab74e
  ceb68bd9b257c96c2970ab258fed969ef25f6e7d
```

Before record 29, current-HEAD equality remains at each released source. Once
the Task136 product paths change, repository mode must fail on a source-current
blob until strict record 29 exists. At record 29, current-HEAD equality moves
to Task136 for exactly these paths. No compatibility tuple relaxes candidate,
integration, review, prerequisite, release-event, object-type, or source-blob
proof.

The checker and its tests expand `rawPrefixPins` from 17 to all exact raw
records 1-28. The immutable values are listed in Appendix A.

## Producer ABI

### T120: canonical V2 store and replay

T120 keeps its V1 API for released callers but does not reinterpret it as V2.
Task136 consumes only aliases derived from the ontology's canonical event
types:

```ts
type ResidentPlanEventV2 =
  KnowledgeEventOf<"agent.resident-plan.recorded.v2">;
type ResidentObservationEventV2 =
  KnowledgeEventOf<"agent.resident-observation.recorded.v2">;
type ResidentToolStepEventV2 =
  KnowledgeEventOf<"agent.resident-tool-step.recorded.v2">;
type ResidentSuspensionEventV2 =
  KnowledgeEventOf<"agent.resident-loop.suspended.v2">;
type ResidentResultEventV2 =
  KnowledgeEventOf<"agent.resident-loop.result.recorded.v2">;
```

The V2 store provides `appendPlan`, `appendObservation`, `appendToolStep`,
`appendSuspension`, and `appendResult`; exact event-ID reads for every type;
and `readReplay` for one exact task/attempt/run stream. Every append normalizes
hostile input before I/O, parses the canonical V2 payload, rereads current
stream/global state, performs one append with exact concurrency preconditions,
rereads the assigned event ID, compares canonical bytes, validates the whole
resulting prefix, and returns only the durable reread. Exact idempotent retry
returns the original event; a changed stable key conflicts.

The projection rebuilds plans, observations, tool steps, suspensions, results,
budgets, and segment state only from validated ledger events. It performs no
artifact scan, fallback write, or in-memory recovery.

### CF1 ontology: segmented replay, not synthetic suspension

The current blanket sequence rule is replaced with a prefix-safe segmented
grammar:

```text
P0 X* (O S R-resumable O-recovery X*)* O R-terminal?
```

`X` is a causally valid observation, tool step, or replan. A resumable result
requires exactly one immediately preceding suspension with the same checkpoint,
deadline, and next-safe-action anchor. It closes an execution segment, not the
whole run. Continuation requires W reclaim/reverification and a causally linked
recovery observation.

A completed or failed result requires its exact final observation and is the
last event. It has no suspension and no resume anchor. Completed requires the
full H readback; failed forbids H and a resume anchor. A dangling suspension or
missing result is an incomplete recoverable prefix, never success. Nothing may
follow a terminal result. Earlier genuine resumable segments may precede the
later terminal result. Causation is checked per edge rather than by blanket
equality with the initial plan.

The exact durable terminal proof is the T120 result-event reread returned by
`appendResult`; no additional orchestration terminal schema is invented.

### C: typed but untrusted candidates

C returns frozen `ResidentInitialPlanCandidateV2` and
`ResidentReplanCandidateV2` own-data values whose plan is the canonical V2 plan
payload and whose provider-posture and policy-constraint bindings are exact.
`parseResidentUntrustedPlanCandidate(input: unknown)` is the sole structural
boundary. Task136 reparses every returned candidate, compares its complete
posture, policy, tool/model, source/context, budget, authority, and causation
facts to current R/P/W readbacks, and only then calls T120. A C value never
grants permission or authority.

### G: prebound single-use execution and approval

R supplies G's exact dispatcher/executor capability at construction. The
production execution surface is:

```ts
executeApprovedAndReadback(
  readback: IssuedResidentLoopGatewayReadbackV2
): Promise<IssuedResidentLoopGatewayReadbackV2>;
```

It accepts no caller execution callback. G appends and rereads one execution
claim bound to the exact request, decision, preview, tool/version, plan,
policy, authority, and W currentness token before invoking the prebound
executor. One authorization permits at most one claim. After a crash following
claim, G may recover completion only from already durable domain evidence and
must never invoke the executor again.

For an approval class other than `none`, G requires exactly one independent
human approval and consumes it once. For `none`, the exact policy-approved
request plus its single-use durable execution claim is the automatic
authorization. G never fabricates a human approval. Denial, revocation,
expiry, plan or preview drift, an existing claim, or terminal stream state
burns the execution path before effect.

### W: opaque mounted authority and resume

The authenticated wake runtime and mounted wake store jointly issue a
WeakMap-backed, non-serializable currentness token. R injects the canonical
T120 store during W construction; no caller receives the ledger, store, raw
runtime handle, mounted path, issuer, or callback.

```ts
interface ResidentLoopMountedAuthorityPort {
  reverifyAfterAwait(
    token: OpaqueResidentLoopCurrentnessToken
  ): Promise<OpaqueResidentLoopCurrentnessToken | undefined>;

  suspendAndRelease(
    input: unknown,
    token: OpaqueResidentLoopCurrentnessToken
  ): Promise<OpaqueReleasedCheckpointReadback | undefined>;

  reclaimAndReverify(
    anchor: unknown
  ): Promise<OpaqueResidentLoopCurrentnessToken | undefined>;
}
```

`reverifyAfterAwait` burns the prior token and returns a new token only when
the workspace, resident, task/attempt/run, mount, ledger/artifact stores,
policy, locks, claim generation, and exact permitted causal ledger advance all
match. The immutable event payload's authority remains the admitted source
snapshot; the opaque token separately tracks mutable current stream/global
high water so Task136 cannot stale itself merely by making an expected append.

`suspendAndRelease` parses the candidate, uses T120 to append/reread the exact
suspension, and appends/rereads the orchestration checkpoint/release facts
before releasing the claim. `reclaimAndReverify` rereads the suspension,
resumable result, release, request/decision, deadline, complete binding, and
budget before appending/rereading a fresh claim and issuing a new token.

If mounted authority is lost before a durable result can be appended and read
back, Task136 returns a distinct safe non-durable envelope:

```ts
interface ResidentLoopUnavailableV1 {
  readonly schemaVersion: "resident-loop-unavailable.v1";
  readonly outcome: "unavailable";
  readonly category: "workspace-unavailable";
  readonly durable: false;
  readonly allowedActions: readonly ["remount", "resume"];
  readonly safeDiagnosticId: string;
}
```

It does not pretend that a canonical failed or resumable result exists.

### H: internal full-readback port

H adds a non-barrel, R-only builder around its existing complete projection:

```ts
interface InternalSpecialistHandoffProjectionPort {
  readFull(
    input: ExactResidentLoopIdentityAndAuthority
  ): Promise<SpecialistHandoffProjection | undefined>;
}
```

R prebinds the authoritative ledger and mounted manifest readers. Task136
cannot supply events or readers. Completion requires
`projection.state === "task-completed"`, its `selectedReadback` to be the exact
full `SpecialistHandoffReadback`, exact task/run/authority, recorded/terminal/
task-status event IDs, manifest provenance, and safe diagnostics.

Task138's `agent-handoff-projection.ts`, tests, claim, `ResidentHandoffDto.v1`,
and browser `lifecycle` field remain byte-for-byte unchanged. Task136 never
uses that narrow DTO and never reconstructs H from it.

### R and Task136: sole production composition

`resident-loop-factory-ports.ts` remains the R-owned seam but gains a named
production constructor. It authenticates the factory runtime through existing
Core composition, validates the existing P and H authority, constructs T120,
C, prebound G, opaque W, and internal H, freeze-brands their exact bundle, and
constructs Task136. It returns only the bounded-loop API plus safe metadata.

The current data summary may remain as a read-only property for existing
callers, but it cannot be the production execution boundary. No public mint,
raw handle, witness, store, ledger, executor, provider body, or caller-
replaceable structural port bag is exported. Import-policy tests permit the
new direct imports only at R and the existing W/H source owners.

Task136 receives one R-issued bundle. It performs bounded planning,
observation, tool execution, replanning, approval suspension, and same-stream
resume. It calls W after every await before append, effect, or continuation;
counts all ten budgets from T120 replay; admits only a strict C subset of the
current policy; executes only through G; and reports completed only from the
exact H projection/readback. It has no fallback store, local write, artifact
scan, raw provider, raw tool, authority issuer, graph mutation, or external
effect path.

## Negative-Test Ceiling

The permanent RED matrix covers at least:

- hostile accessors, proxies, symbols, inherited fields, unsafe prototypes,
  sparse/custom arrays, mutation after call, unknown keys, and unsafe text
  before I/O;
- every workspace/resident/task/attempt/run/descriptor/policy/authority/
  source/context/correlation/plan/revision/readback mismatch;
- all ten budget transitions, hard maxima, immutable consumption across
  replan, ordering, idempotency, concurrency, and reread-byte conflicts;
- C widening of tool/version, side effect, approval, provider/model posture,
  sources, contexts, automatic/output class, or budget;
- G caller or swapped executors, forged/self/stale/expired/denied/revoked/
  duplicate approval, `none` masquerading as human approval, changed preview,
  reused authorization, duplicate claim, terminal stream, and crash
  re-execution;
- W structural/copied/stale tokens, foreign or missing checkpoints/releases,
  wrong claim generation, expired deadline, cross-run anchor, remount/store/
  policy/lock drift, and unrecognized ledger advance;
- H caller-supplied events/readers, cross-run/authority mismatch, non-completed
  state, selected-readback mismatch, missing terminal evidence, and any
  Task138 DTO widening;
- terminal without a synthetic suspension as GREEN, genuine repeated resume
  segments as GREEN, and fake terminal suspension, resumable without
  suspension, event after terminal, dangling readback, or cross-segment
  causation as RED;
- zero provider, gateway executor, approval, ledger, fallback, local-write, or
  projection-substitute effect on every fail-closed path.

## Assurance And Mission-State Migration

The authority correction changes exactly six files:

```text
docs/agentic/contracts/task136-bounded-assurance-v4.json
scripts/resident-agent/assurance/task136-bounded-assurance.mjs
scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
docs/agentic/claims/task-136-v4-task137b-authority-transfer.md
docs/agentic/contracts/software-factory-mission-state.v1.json
scripts/check-software-factory-mission-state.mjs
```

The mission-state test is not causally changed. The checker adds only six
source-specific transfer groups, exact source/target scope and command
validators, the ten-entry compatibility constant, source-specific historical
target/current-head migration branches, the 28 raw pins, and new exact
fingerprints. It adds no generic, inferred, or transitive transfer facility.

With the exact contract ordering in this design, two-space JSON serialization
and one final LF produce:

```text
V4 JSON SHA-256:
a076d5d5fc57b5ff2333fb75daf3b6e9a1ca4ea013e271183b8809c5673601dd

V4 assurance fingerprint:
bfd8c2297cb6ed853c625060e03f86a44ba7281322107cabe5426382bd272258

Mission immutable-envelope fingerprint after pin synchronization:
sha256:1fefb449b6bf2102251ad3f525b8312c7a81f07eaf1e452d1a0f1c2bb912dcaf
```

The mission JSON changes only `mission.frozenAuthority.sha256`; card count
remains 29 and unfinished-card precedence remains authoritative. The mission
checker changes only `expectedImmutableEnvelopeFingerprint` for this pin sync.

## Implementation And Commit Sequence

After this exact written design is approved, a separate implementation plan
must freeze commands, owners, worktrees, commits, and review packets. The
minimum history-preserving sequence is:

1. Append a registry implementation authorization that cites the exact design
   and plan commits. It must state: “Task-scoped subagent-driven development
   and test-driven development are explicitly approved for this task.”
2. In the existing V4-assurance lineage, forward-merge current program
   authority. Commit a claim-only checkpoint, then a permanent causal RED that
   fails only for the absent six source mappings, direct CF1-HR prerequisite,
   24-path Task136 scope, 13-test command, compatibility entries, record-29
   migration, and raw pins. Apply the smallest GREEN contract/checker change,
   then synchronize the two mission pins. Preserve each commit separately.
3. Run assurance 20/20, all four exact contract markers, factory readiness,
   repository strict 28/28 followed only by expected incomplete-29 closure,
   typecheck, exact scope/diff/ancestry/dependency/clean gates, and obtain a
   fresh independent architecture/executability review pair on one exact
   six-file candidate. Integrate only after both approve.
4. Forward-merge that approved program authority into the existing clean
   Task136 lineage at `72e1ee6624c582218995e3e075e2303998811834` without
   reset, rebase, amend, reconstruction, or discarded history.
5. Commit claim-only recovery evidence. Commit one permanent product RED that
   adds the exact producer and Task136 negative tests before source GREEN.
   Apply only the 10 product source files required by those tests. The final
   Task136 product candidate has exactly the 24-path card scope above.
6. Run the exact 13-test card command, the original focused and cross-boundary
   Task136/Task120/execution-loop/portable-workspace/Task138 suites, standalone
   typecheck, factory readiness, assurance 20/20, all contract markers,
   repository-prefix behavior, diff/scope/ancestry/dependency/clean checks,
   and a fresh full-verification differential.
7. Admit one exact clean candidate SHA. Obtain a completely fresh independent
   architecture/executability review pair; no reviewer of changed assurance
   or product bytes may approve a later changed candidate.
8. After both reviews approve and all integrated gates pass, merge the complete
   preserved candidate lineage into the program branch, append strict release
   record 29, and verify all 29 commands and complete repository closure.
9. Perform the calibrated record-29 V4 assurance transition only after product
   release. Its causal RED/GREEN is limited to the V4 assurance claim and test:
   advance current record-28 cardinality/marker/call-count assertions to 29,
   preserve the historical W1 `.slice(0, 26)` and all contract/checker/product
   bytes, then obtain a new fresh dual review. This is assurance-only, not a
   second product release.
10. Merge the completed record-29 milestone into `neo`, push `origin/neo`, and
    verify exact local, tracking-ref, and remote-advertised SHA equality before
    starting Wave 3.

No commit is squashed, amended, rebased, force-pushed, cherry-picked as
reconstruction, reset, or discarded.

## Admission Gates

The correction is complete only when all of the following hold:

- V4 still emits exactly
  `TASK136_RELEASE_GRAPH_OK records=29`,
  `TASK136_COMPOSITION_CORPUS_OK green=1 red=20`,
  `TASK136_COMMAND_CARDS_OK cards=29`, and
  `TASK136_ABI_CORPUS_OK green=1 red=15`;
- records 1-28 match the exact raw pins and the graph retains all 29 IDs/order;
- before record 29, clean unchanged product bytes pass strict 28/28 prefix and
  stop only at incomplete 29, while changed transferred bytes fail source
  currentness;
- after record 29, Task136 owns and matches all 24 blobs, all 29 commands pass,
  every exact prerequisite integration is ancestral, and closure is complete;
- focused, cross-boundary, typecheck, factory, V4, marker, repository, diff,
  scope, ancestry, dependency, clean-state, and full-verification differential
  evidence is fresh from committed bytes;
- the exact assurance and product candidates each receive their required fresh
  independent architecture/executability approvals;
- Task138-H and the browser DTO are byte-identical to strict release 28;
- no provider, credential, network, external-system, fallback write, pull
  request, or Wave-3 action occurs before its later authority.

## Appendix A: Exact Raw Strict Release Pins 1-28

```text
Task126 1b1fc2171278866b38f6aa96889b822f22ab2abd34f460b304fe7fc2c3a0b58d
Task127 18199ad9bfdcf3582ad13f6637bfbcc72949f1407271fa6c325612abcd226951
Task128 fe29c10c5dbe3d8c1596f20db7b95b62df8dd98d379ade09d2ed85822ce51d92
Task135D 749f6a7ec9f66fd8228426e07e3d5b9dbc1a6f0e57d7a804ad69515f48ffc9f9
Task137A 5a3b2f9a897b5d458742df7a3d403f0e3fe6e3459aba75e93d825d385ec4be32
Task129-MFA 64048b14448b66f224d254753a7ecbd210e1654602759248e5de89663295f017
Task129 987b4b18667508b7e4bd500be50b121d41b019bb011da8ae64ef4996ce62e01e
Task130 16328e8381eb9a55f7a8c3f3f155a4c40d44f4c0da1abe745c850193522171d8
Task135B 5fffad565a1523aecb0a0afd280b8b9936fc2a48dbe1c0b268f946634732e9e0
T120-R f220cb62ab803c938e4e97c538f55e24628bbf46d6e06060cb0169c1adbf2cdb
Task137B-W 26f33ac286836459e723edd5ad2d4e34202bccd3f1a92e5533be30e7d881c9b7
W1-123-H-SHARED-SCHEMA 9bb5838f7782eaeb327280040a514119f8c0ba1fd76dee6268ead6013ac8f292
W1-133.5-PREAPPROVAL-PROMPT-STORE 119f9aea548038d600edadbca60e2bb8f92f08aacdaf081c0f6dadc928438070
CF1-HR 8491645c21cdd6ca54e5701318a0f9febb794c5fc1f032beaca05c8acd960351
Task126-R f27c06337227fcc4584d199a804226276cb1d63eca0dfbca410490324a11ef3f
Task133 3abba468fd3fe80a3b1f1e08367ddbd8fb3b30884f08876c911deed774fe1bd4
Task139-P1 9b268556a169bf270e0995d2b50ab137c65fe9341e91ddbcd9454c087279218d
Task139-PM 134a3ff59bfb24b9bb1e5988580e85e931aa37eb098a77fe37ce05e9d217c80e
Task136-FC-Core 5e78c42b3753cd3ce086ab45862479f2e5569fdaae1fc683528a67101630b920
Task139-P2 7428d8f4ddd3e7784b73068002b42d3af09f085e44906b6869c8826bf00d682b
Task136-FC-Ports 831ef45fc0d1552b0086590418a3b31aa45515ccf1a0b80a9370484f4fc144f7
G136-SC 1576cf80cb9cc2184a12f60db44abda79e7d3b0f375f10310b1e88fe28812574
G136-R 2a5833071698f58716feff1bf3b0ca53b5b14e715421b1df8519884975c3d912
C136-P 55bb88a30a323c616a103df04151b04f5852e91681794f79394e976671cee480
Task121 26f0509d73393012d8c4cb93c0453e8ac7676b466133fb0031983f70fe3cd405
Task122 b607b582e227f558d1340b3b9f098f90e356db9f343109ec6a4e37276624171a
W1-123-BOOTSTRAP-HANDOFF a8ed548c473fca9e7f4016a001032d151c204be2347db43d1ff77b386fd5cd9d
Task138-H 186ebee9d0364a6a6f93fb1d6adcb80970c63a49352a1c26b598c0323a444fc8
```
