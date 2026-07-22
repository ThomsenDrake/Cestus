# Task136 Record-29 Producer Reconciliation Design

**Date:** 2026-07-22

**Status:** Approach 1 is program-owner approved. This exact written revision
requires program-owner review before implementation planning or any assurance,
mission-state, product, or Task136 RED change.

**Revision note:** the first committed written revision at
`7bafcef52aefa096112d6b2d6928ce4ae4c89b4b` failed independent design review
because it did not freeze R's trusted construction boundary or the durable
decision representation for approval class `none`. Its correction at
`e41a1504b7a0a2438770f567e5b08672ba0ed4f2` then failed fresh architecture and
executability review because generic completion is private, the existing
executor ABI requires a human approver, the portable H cursor rejects later
V2 events, and W/T120 construction order was not frozen. Revision
`819d3b066ea6757d6a25163906b8803517b6480b` closed those four findings but
failed a new review pair because its construction crossed package ownership,
W did not append the resumable result before release, the checkpoint payload
required a ledger-assigned self ID and irrelevant gateway decisions, and G/C
had no ledger-only process-restart rehydration ABI. Revision
`40d507d549ea5127e9f2597fa8d150c8a4c3d904` closed those findings but failed
fresh architecture and executability review because its four-write suspension
protocol could not recover partial durable prefixes and reused an
auto-released checkpoint kind, raw executor functions remained caller-minted,
G's staged readback and locator producer were incomplete, and authority-stale
had no recordable W transition. RV-1-E-932 and this descendant correct those
findings with a seven-seam finite design: 22 transferred paths, one exact
baseline-adopted source, and a 26-path Task136 card. The strict frontier and
all 29 card IDs/order remain unchanged.

## Decision And Authority

Task136 remains the twenty-ninth and final card in the frozen V4 release graph.
The approved correction transfers a finite set of released producer paths
directly to Task136, preserves the exact 29 card IDs and order, and preserves
the raw strict release records for cards 1 through 28 byte-for-byte.

The governing repository evidence is:

- original six-seam authority `RV-1-E-931` at
  `752a021ee7299b028ec6b05750471cf0962732ce` and superseding seven-seam
  amendment `RV-1-E-932` at exact design base
  `6b2812683479c90f93e370b30baa9a76315b0d65`;
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
7. G136-SC's domain dispatcher privately retains the registered adapters, but
   G136-R/R/W have no opaque dispatcher-issued capability. Branding raw
   caller-supplied executor functions cannot prove implementation provenance
   or a stable restart identity.

Task136 is forbidden from repairing those gaps locally. The correction must
change the producer-owned bytes under exact V4 ownership transfer and make
Task136 their final current owner only at strict record 29.

## Considered Approaches

### Approach 1: finite direct-source transfer to Task136

Keep the graph at 29 cards, preserve records 1-28, declare exact historical
compatibility for seven released source cards, move current ownership of only
the causally changed released paths to Task136, and adopt the one previously
unowned dispatcher source from an exact candidate/integration/current baseline
at record 29.

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

## Exact V4 Ownership Transfer And Baseline Adoption

Exactly 22 released source/test paths transfer to Task136, and one previously
unowned source is adopted from an exact baseline. Source claims stay
unchanged. Existing source commands stay unchanged except Task136's command
appends the transferred dispatcher test. Each released source appends
`Task136` to `transferToIds` after every current target.

| Source card | Exact paths transferred to Task136 |
| --- | --- |
| T120-R | `packages/agent/src/plan-observation-contracts.ts`; `packages/agent/src/plan-observation-projection.ts`; `packages/agent/test/plan-observation-contracts.test.ts`; `packages/agent/test/plan-observation-projection.test.ts` |
| C136-P | `packages/agent/src/resident-plan-candidate-provider.ts`; `packages/agent/test/resident-plan-candidate-provider.test.ts` |
| G136-SC | `packages/agent/test/domain-execution-dispatcher.test.ts` |
| G136-R | `packages/agent/src/resident-loop-tool-gateway.ts`; `packages/agent/test/resident-loop-tool-gateway.test.ts`; `packages/agent/test/resident-loop-scheduler-completion-imports.test.ts` |
| Task137B-W | `packages/local-runtime/src/wake-supervisor-runtime.ts`; `packages/local-runtime/src/mounted-wake-lifecycle-store.ts`; `packages/local-runtime/test/wake-supervisor-runtime.test.ts`; `packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts`; `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts` |
| CF1-HR | `packages/agent/src/specialist-handoff-projection.ts`; `packages/agent/test/specialist-handoff-projection.test.ts`; `packages/ontology/src/contracts.ts`; `packages/ontology/test/agent-resident-loop-contracts.test.ts` |
| Task136-FC-Ports | `packages/local-runtime/src/resident-loop-factory-ports.ts`; `packages/local-runtime/test/resident-loop-factory-ports.test.ts`; `packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts` |

`packages/agent/src/domain-execution-dispatcher.ts` is the sole baseline
adoption. V4 did not list it in any released card, so the correction must not
invent historical ownership. The checker instead proves its exact blob
`96b0ade273696b9ffcf497119f1943f128821a58` at G136-SC candidate
`70814c1259871c5458a3578fae8a5c8281540377`, G136-SC integration
`253150b2ab5f2271d2b04a5b8fc5b82b7bf757a5`, and pre-record-29 current HEAD.
After record 29 it is an ordinary Task136-owned candidate/integration blob.

The exact resulting target arrays are:

```json
{
  "T120-R": ["Task136"],
  "C136-P": ["Task136"],
  "G136-SC": ["G136-R", "Task136"],
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

Task136 gains two direct prerequisites: transitive Task138-H ancestry does not
authorize CF1-HR source modification, and G136-SC is the released provenance
source for the dispatcher test and exact adopted-source baseline:

```json
[
  "T120-R",
  "Task136-FC-Ports",
  "Task139-P2",
  "C136-P",
  "G136-R",
  "Task137B-W",
  "Task138-H",
  "CF1-HR",
  "G136-SC"
]
```

Task136 owns exactly 26 paths in this order at record 29:

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
packages/agent/src/domain-execution-dispatcher.ts
packages/agent/test/domain-execution-dispatcher.test.ts
docs/agentic/claims/task-136-resident-full-vision-bounded-loop.md
```

Its exact card command is:

```text
npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts packages/agent/test/resident-plan-candidate-provider.test.ts packages/agent/test/resident-loop-tool-gateway.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts packages/local-runtime/test/resident-loop-factory-ports.test.ts packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts packages/agent/test/domain-execution-dispatcher.test.ts
```

## Historical Compatibility And Immutable Release Evidence

`releaseCompatibility.version` remains
`task136-release-compatibility.v2`. Its entries are exact, source ordered, and
limited to these eleven records:

| Order | Card | Canonical JSON SHA-256 | Newly appended historical-owned paths |
| --- | --- | --- | --- |
| 1 | Task137A | `ac3ac479d5b1e41db4ae15cea88b746f86bbc31f6af3ea74a6120834dc2c2198` | none |
| 2 | Task129-MFA | `23cb98725d67ada15c0e2913816f82407c171912564423e669cf73995aaead76` | none |
| 3 | Task135B | `73d8e28bdc56dbecf924a45a14c4caf8bb0864c89a4db98e1114f62f83d53409` | none |
| 4 | T120-R | `bb2e2bcdd90d1036f0e0ad16719dcc99405ec3170691f115641649dc59b56830` | its four transferred paths in source order |
| 5 | Task137B-W | `833ca5cc5aa191fdf9f98c692255133afaaf73b541b36275cab7ed04ef601e29` | its five transferred paths after its existing four entries |
| 6 | CF1-HR | `d55028e1bd036051f5ec2c9d496267623ff2748e54713d3881a198667ac62f12` | handoff projection pair, then ontology pair, after its existing four entries |
| 7 | Task136-FC-Ports | `d860a7ea14900431a361e95604d49efa6dbf824d8ccc85a06f27fe277698bc0d` | its three transferred paths |
| 8 | G136-SC | `b7ec22083b3b8be5140b3a40b09dfa4e34c2e86f01fe15c3cc3453d16c77d0b0` | its dispatcher test only |
| 9 | G136-R | `ba3fb8927ec24348f405db53cd6cf200481cb979ca6ce4cbe1216b5ce635d9b8` | its three transferred paths |
| 10 | C136-P | `2c8da3d4b61fb472232211be2bd8b994140e044b13fb1cc977e86a6171d4575a` | its two transferred paths |
| 11 | Task122 | `729d23c6c84c6ea33567a4b669c9ad960e830cf601a0d9ec5638308d3a360c0c` | none |

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
G136-SC
  bd9df733d7ab8f915269624168524ac48bc64621
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

The resident suspension payload does not contain its own future event ID.
The ledger-assigned ID of the durably reread
`agent.resident-loop.suspended.v2` event is the resident checkpoint ID. Its
checkpoint payload instead contains the already durable
`orchestrationCheckpointEventId`, deadline, next safe action, and this strict
category-dependent authorization union:

```ts
type ResidentLoopV2SuspensionCheckpoint =
  | {
      readonly authorizationKind: "awaiting-human-approval";
      readonly orchestrationCheckpointEventId: string;
      readonly requestEventId: string;
      readonly resumptionDeadlineAt: string;
      readonly nextSafeAction: string;
    }
  | {
      readonly authorizationKind: "not-applicable";
      readonly orchestrationCheckpointEventId: string;
      readonly resumptionDeadlineAt: string;
      readonly nextSafeAction: string;
    };
```

Only `suspensionCategory: "approval-required"` may use
`awaiting-human-approval`, and it requires the exact already durable request
but forbids `decisionEventId`, execution claim, completion, and approver. The
four non-approval suspension categories require `not-applicable` and forbid
every gateway ID. Automatic-policy execution never fabricates a suspension
decision. A later human decision is a post-checkpoint recovery fact, not a
field retroactively inserted into the immutable suspension.

The ontology also adds one orchestration checkpoint kind,
`resident-loop-suspension`, and one release reason,
`resident-loop-suspended`. The checkpoint carries a strict
`residentLoopSuspension` instruction containing the task/attempt/run,
resident, plan-record and final-observation event IDs, suspension category,
branch-appropriate request ID, deadline, next safe action, exact current
orchestration claim/generation, and deterministic suspension/result semantic
keys. No other checkpoint kind may carry that instruction. The existing task
orchestrator's approval-wait recovery ignores this new kind and therefore
cannot race W by releasing it. Only W may append or recover its exact suffix.

The immediately following resumable result's
`resumeAnchor.checkpointEventId` equals the reread suspension event ID; its
deadline and next safe action equal the suspension payload. Replay also
requires the suspension's `orchestrationCheckpointEventId` to name the exact
prior same-attempt `resident-loop-suspension` orchestration checkpoint and its
instruction to reconstruct the same canonical bytes. This removes the
impossible pre-append self-reference, makes the first durable prefix
self-sufficient after restart, and preserves an exact resident/orchestration
cross-stream chain.

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

C is stateless across candidates. `createReplanCandidate` accepts copied,
frozen canonical `priorPlan`, `priorPlanReadback`, and
`replanObservationReadback` values supplied from the current T120 replay and
validates the new candidate solely against those exact values. It has no
process-local `latest` prerequisite. On both same-process and process-restart
paths Task136 rereads that prior plan and observation from T120 before calling
C, reparses C's untrusted result afterward, and rejects any difference. A
fresh C instance therefore has no authority to invent history and can replan
from ledger state without an in-memory recovery cache.

### G136-SC and G: opaque dispatcher execution and staged readbacks

The domain dispatcher, not R or a loop caller, is the executor trust boundary.
After its existing `createAgentDomainToolRegistry` validation, the transferred
dispatcher source copies and freezes the exact registered adapters, binds each
known tool/version to its package-owned dispatcher implementation identity,
and issues one non-serializable
`OpaqueResidentDomainExecutionCapability`. A module-private WeakMap retains
the preview/execution functions and canonical descriptors; the public opaque
value exposes no function, adapter, descriptor array, lookup callback, or mint.
The issuer and inspector are non-barrel and import-gated. R may receive only
the issued opaque value, and W may pass it only to G's named constructor.

The capability carries an inspectable safe `executionCapabilityHash` computed
from the canonical ordered descriptor registry, package-owned implementation
identity for every key, and dispatcher ABI version. Caller-provided identity
strings are forbidden. A fresh dispatcher built from the same authoritative
registry reproduces the hash but receives a new WeakMap identity; changed,
missing, reordered, duplicate, unknown, or structurally forged adapters do
not. The exact hash is bound into every V2 planned tool step and rechecked
against the current opaque capability before request, claim, effect,
completion, and restart reissuance. The planned step also carries its stable
`toolRequestId`, so the logical stream address exists before any gateway
append.

G never accepts raw executor functions. W constructs G with the authenticated
ledger, its private currentness verifier, and the dispatcher-issued opaque
capability. G privately resolves the exact descriptor/function pair through
the dispatcher inspector once, freezes it, and exposes this closed branded
state machine:

```ts
type IssuedResidentLoopGatewayReadbackV2 =
  | {
      readonly stage: "requested";
      readonly authorizationKind: "automatic-policy" | "human-approval";
      readonly logicalLocator: ResidentLoopGatewayLogicalLocatorV2;
      readonly requestEventId: string;
      readonly executionCapabilityHash: `sha256:${string}`;
    }
  | {
      readonly stage: "human-approved";
      readonly authorizationKind: "human-approval";
      readonly logicalLocator: ResidentLoopGatewayLogicalLocatorV2;
      readonly requestEventId: string;
      readonly decisionEventId: string;
      readonly approvedBy: string;
      readonly executionCapabilityHash: `sha256:${string}`;
    }
  | {
      readonly stage: "claimed";
      readonly authorizationKind: "automatic-policy" | "human-approval";
      readonly logicalLocator: ResidentLoopGatewayLogicalLocatorV2;
      readonly requestEventId: string;
      readonly decisionEventId?: string;
      readonly executionClaimEventId: string;
      readonly executionCapabilityHash: `sha256:${string}`;
    }
  | {
      readonly stage: "completed";
      readonly authorizationKind: "automatic-policy" | "human-approval";
      readonly logicalLocator: ResidentLoopGatewayLogicalLocatorV2;
      readonly requestEventId: string;
      readonly decisionEventId?: string;
      readonly executionClaimEventId: string;
      readonly resultEventId: string;
      readonly executionCapabilityHash: `sha256:${string}`;
    };
```

The logical locator is copied from the durable plan/readback and contains only
task/attempt/run, canonical plan semantic key and revision, step ordinal,
stable tool-request ID, tool/version, and execution-capability hash. It
contains no ledger-assigned ID and no caller-supplied function. G's
`rereadAndIssueFromLedger(locator)` derives the exact tool stream from that
tuple, discovers the exact plan record and assigned request/decision/claim/
result IDs, requires one valid prefix with no duplicate, gap, foreign event,
or later terminal, and issues the corresponding fresh process-local stage.
Thus request-only, decision-only, claim-only, completion, and approval-resume
recovery all have a durable caller path even if the previous branded object
vanished.

`executeAuthorizedAndReadback` accepts only an issued automatic `requested`
stage or human `human-approved` stage. It appends/rereads one claim before
effect, invokes only the privately resolved dispatcher function, and returns
only `completed`. `claimed` is recovery-only: G may complete it solely from
already durable, uniquely claim-caused domain evidence and never invokes the
executor again. A request-only automatic prefix may claim and execute once
only after complete revalidation proves no claim exists. Human execution
requires exactly one independent approval; automatic execution forbids every
approval/decision and uses a request-caused claim. Both inputs bind the exact
plan, policy, allowlist, preview, source/context/artifact provenance,
capability hash, authority, and W currentness. The human branch alone carries
`approvedBy` and `approvedPreviewHash`.

Only the `completed` stage maps into the ontology's V2
`gatewayReadbacks`; it is the same human/automatic discriminated union as
above with `stage`, `executionCapabilityHash`, and all exact completed IDs.
Requested, human-approved, and claimed stages remain G capabilities and
durable gateway events; they are never mislabeled as a completed resident
tool step. Denied or failed execution produces the corresponding durable
gateway event plus exact T120 observation/result semantics, never a fabricated
completed readback.

The unchanged generic gateway's human-only claim and inaccessible structural
`completeTool` remain private. Human completion continues through the existing
scheduler-completion evidence adapter. Automatic completion uses G's private
`appendAutomaticCompletionAndReadback` route: it copies the executor result,
rereads nonempty unique claim-caused domain evidence, rejects agent/foreign/
pre-claim/unproven events, rechecks plan, preview, policy, authority,
capability hash and W currentness, appends with stream/global concurrency,
rereads exact canonical bytes, and revalidates before returning. Import-policy
tests forbid raw descriptors/functions, `.completeTool(...)`, a structural
completion callback, capability mint/inspection outside the dispatcher/G/W/R
chain, or exposure of any resolved adapter.

### W: opaque mounted authority and resume

The authenticated wake runtime and mounted wake store jointly issue a
WeakMap-backed, non-serializable currentness token. W records its private store
state in a WeakMap at construction. After unchanged Core has started and bound
authority, R calls the non-barrel, import-gated, one-shot
`bindResidentLoopCapabilitiesForFactory(wakeRuntime, binding,
domainExecution)`
lookup. That lookup accepts only the exact issued wake-runtime identity plus
the Core/P/H binding and an opaque capability issued by the G136-SC domain
dispatcher. The mounted
store privately constructs T120 from its authenticated ledger and constructs
prebound G with that same ledger, the opaque dispatcher capability, and W-private
reverify-before/after-effect closures. This dependency is local-runtime W to
agent G; no agent source imports local-runtime. The registrar returns only the
issued T120, prebound G, W, and exact-hash H-reader capabilities. Core needs no
change and R never injects T120, a ledger, a raw executor, or an event-reader
into W. G receives append authority and may resolve the dispatcher capability
only inside W's one-shot construction; neither R nor a loop caller receives
the ledger, raw mounted store, runtime handle, mounted path, dispatcher issuer
or inspector, resolved adapter, or replaceable callback.

```ts
interface ResidentLoopMountedAuthorityPort {
  reverifyAfterAwait(
    token: OpaqueResidentLoopCurrentnessToken
  ): Promise<
    | {
        readonly kind: "current";
        readonly token: OpaqueResidentLoopCurrentnessToken;
      }
    | {
        readonly kind: "recordable-stale";
        readonly capability: OpaqueResidentLoopSuspensionOnlyCapability;
      }
    | { readonly kind: "unavailable" }
  >;

  suspendAndRelease(
    input: unknown,
    authority:
      | OpaqueResidentLoopCurrentnessToken
      | OpaqueResidentLoopSuspensionOnlyCapability
  ): Promise<OpaqueReleasedCheckpointReadback | ResidentLoopUnavailableV1>;

  recoverSuspensionPrefix(
    locator: ExactResidentLoopSuspensionLocator
  ): Promise<OpaqueReleasedCheckpointReadback | ResidentLoopUnavailableV1>;

  reclaimAndReverify(
    anchor: unknown
  ): Promise<OpaqueResidentLoopCurrentnessToken | undefined>;
}
```

`reverifyAfterAwait` always consumes the prior token. It returns `current` only
when the workspace, resident, task/attempt/run, mount, ledger/artifact stores,
policy, locks, claim generation, source/context authority, and exact permitted
causal ledger advance all match. The immutable event payload's authority
remains the admitted source snapshot; the opaque token separately tracks
mutable current stream/global high water so Task136 cannot stale itself merely
by making an expected append.

`recordable-stale` is reachable only when the same mounted workspace, ledger,
and lifecycle store have been freshly authenticated but authority, policy,
lock, source, or context currentness changed across the await. Its opaque,
single-use capability authorizes only the durable suspension bookkeeping
below. It cannot plan, request approval, claim or execute a tool, append an
observation, continue a segment, or obtain a current token. If the mount,
ledger, or lifecycle store cannot be authenticated, W returns `unavailable`;
no durable event is claimed.

`suspendAndRelease` parses and copies the candidate and consumes either a
current token or the suspension-only capability. It and
`recoverSuspensionPrefix` implement one exact monotone prefix state machine,
keyed by task/attempt/run and deterministic semantic keys:

0. with no `resident-loop-suspension` orchestration checkpoint, append and
   reread that checkpoint;
1. with only that checkpoint, use T120 to append and reread resident
   suspension `S`, whose payload names the checkpoint but contains no future
   resident event ID;
2. with the checkpoint and `S`, use T120 to append and reread `R-resumable`,
   whose resume anchor names `S.id` and repeats its deadline and next safe
   action;
3. with the checkpoint, `S`, and `R-resumable`, append and reread the
   orchestration release naming the checkpoint with reason
   `resident-loop-suspended`, then relinquish the claim;
4. with all four events, return the exact existing released readback without
   appending anything.

Each state transition performs exact read-or-reuse under fresh stream and
global concurrency checks. A semantic-key match with different canonical
bytes, any extra/missing causal edge, or more than one matching event fails
closed. W never appends a later state before rereading the exact earlier
prefix, never duplicates a durable prefix, and never releases before the
resident `S -> R-resumable` pair is durable. After a crash or fresh process,
`recoverSuspensionPrefix` may complete only the missing bookkeeping suffix
through release using the freshly authenticated supervisor/store, including
when the prior claim lease is stale; it can never perform or reperform a tool
effect. The release is durable before either API returns success.

Every suspension category uses the new `resident-loop-suspension` checkpoint
kind and `resident-loop-suspended` release reason. The strict suspension
instruction carries the category, exact task/attempt/run/request identity,
deadline, next safe action, claim generation, and semantic keys. For
`approval-required` it also binds the existing exact gateway request without
a future decision ID; every other category omits gateway IDs. W never reuses
the task orchestrator's existing `approval-wait` or `blocked` checkpoint
kinds, so that orchestrator cannot auto-release the resident prefix before
`S` and `R-resumable` are durable.

`reclaimAndReverify` rereads the exact suspension prefix and release. For an
approval-required suspension it additionally rereads the exact request and
requires exactly one later independent human decision caused by that request
and recorded before the deadline; for every other category it requires the
absence of checkpoint gateway IDs. It then validates the complete binding and
budget, appends/rereads a fresh orchestration claim, and issues a new current
token. Task136 uses G's logical-locator method to discover and reissue any
needed staged gateway readback and appends a causally linked recovery
observation before continuing the segment.

The H artifact capability does not retain or call the portable handoff
binding's cursor-bound stores: that cursor recognizes the released specialist
sequence and would correctly reject later V2 loop events. Instead W derives
the two fixed mounted handoff material/manifest stores from its already
authenticated mounted workspace. A read accepts one exact content hash, checks
mounted identity/policy/locks/high-water before and after, performs direct
content-addressed lookup in exactly those two stores, requires exactly one
matching byte value, verifies its hash, and returns a copy. It never enumerates
a directory, accepts a path, falls back to another root, or writes. The
portable binding/controller preflight and Core's one-shot witness consumption
still prove the expected H task/run and artifact-store authority; W's reader
must match that authority before H can use it.

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

### R and Task136: sole concrete composition boundary

`resident-loop-factory-ports.ts` remains the R-owned seam. Its existing
`createResidentLoopFactoryPorts` data projection remains byte-compatible. A
separate named async `createResidentBoundedAgentLoopFactory` is the only
concrete composition entrypoint released by record 29.

That entrypoint has one exact trusted-bootstrap input and no structural port
bag:

```ts
interface CreateResidentBoundedAgentLoopFactoryInput {
  readonly runtimeHandle: ResidentLoopFactoryCompositionInput["runtimeHandle"];
  readonly actor: WakeSupervisorRuntimeInput["actor"];
  readonly supervisorEpoch: string;
  readonly policy: ResidentLoopFactoryCompositionInput["policy"];
  readonly now: () => string;
  readonly nowMonotonicMs: () => number;
  readonly createSafeId: ResidentLoopFactoryCompositionInput["createSafeId"];
  readonly providerAuthority: MountedProviderAuthority;
  readonly handoff: FactoryPortableMountedAgentHandoffProducerResultV1;
  readonly handoffLifecycle: {
    readonly taskId: string;
    readonly attemptId: string;
    readonly runId: string;
    readonly runType: AgentSpecialistRunType;
    readonly retryGeneration: number;
  };
  readonly providerPosture: ResidentLoopProviderPosture;
  readonly domainExecution: OpaqueResidentDomainExecutionCapability;
}
```

This is a local factory trust boundary, not a loop-request boundary. The
factory bootstrap caller may provide only the released factory-issued handle,
opaque mounted provider authority, the exact factory portable-mounted H
producer result plus its lifecycle tuple, current P posture, clocks/ID factory,
and the opaque capability returned by the package-owned G136-SC domain
dispatcher construction. The capability is an exact WeakMap member bound to
the dispatcher-owned copied descriptor registry, adapter implementation
identities, dispatcher ABI, and stable `executionCapabilityHash`. It is not a
structural descriptor bag, contains no executable field, and cannot be minted
from caller-chosen tool/version/identity strings. The real-mounted integration
tests prove rejection of fabricated, proxied, swapped, stale, hash-mismatched,
or post-construction-substituted capabilities. No later `advance` or `resume`
caller supplies any bootstrap capability.

R immediately constructs unchanged Core from the handle, starts it, binds the
provider authority and `handoff.binding.authorityWitness`, compares Core and P
readbacks, and thereafter retains the handle/witness only inside Core/W-owned
closures. Before Core consumes the witness, R calls the unchanged
`preflightPortableMountedAgentHandoffBinding` with the exact binding,
controller, and supplied lifecycle tuple; it then requires Core's consumed H
readback and P to equal that same tuple. R retains the authenticated binding
and controller only as provenance; it never uses their cursor-bound stores as
the post-loop H reader.

R invokes W's one-shot private registrar only after those comparisons and
passes the exact opaque dispatcher capability into that registrar. W
constructs prebound G while it alone holds the authenticated ledger and W
currentness closures; the dispatcher module's non-barrel inspector resolves
the retained adapters only for that construction and never returns them to R.
W then returns the issued T120/G/W/H capabilities. R constructs stateless C
and the internal H projection port locally, then invokes the
agent-owned, non-barrel `createResidentBoundedAgentLoopFromIssuedCapabilities`
issuer from `bounded-agent-loop.ts`. Import-policy tests allow that issuer only
from R; allow W to import only the named G constructor and the dispatcher
capability inspector; allow the opaque dispatcher issuer only in the
G136-SC-owned dispatcher module; and forbid every agent-to-local-runtime
import, barrel export, raw adapter/function transfer, or alternate capability
mint. The issuer freeze-brands the exact R-supplied identities once; there is
no exported generic constructor or structural port-bag parameter, and every
issued capability verifies its own WeakMap membership on use. The return value is only
`{ metadata, loop, stop }`; `loop` exposes `advance` and `resume`, and `stop`
closes the retained composition. No public mint, raw handle, witness, store,
ledger, reader, adapter, executor descriptor/function, provider body, or
caller-replaceable structural port bag is exported.

Record 29 deliberately does not install this entrypoint into
`defaultLocalAgentRuntimeFactory`, HTTP routes, operator status, or any other
running default path. No current production file imports FC-Ports, those paths
are outside RV-1-E-932 and the V4 graph, and the governing Task136 plan forbids
route/default-factory edits. The card's executability gate therefore means the
exported composition entrypoint runs end-to-end against the real mounted
fixture; it does not mean runtime activation. Any default/runtime call site is
a later owner-authorized Wave task, never an implicit record-29 edit or claim.
Import-policy tests permit the new direct imports only at R and the existing
W/H source owners.

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
- G a fabricated, swapped, stale, ABI-mismatched, implementation-mismatched,
  or hash-mismatched dispatcher capability; any raw adapter, descriptor,
  function, issuer, or inspector outside the dispatcher/G/W/R chain; forged/
  self/stale/expired/denied/revoked/duplicate approval; `none` masquerading as
  human approval; a human request without `decisionEventId`; an automatic
  request with `decisionEventId` or an approval event; request/claim causation
  drift; completion not caused by the exact claim; changed preview; reused
  authorization; duplicate claim; or a terminal stream;
- G invalid `requested -> human-approved -> claimed -> completed` stage
  transitions, automatic flow that does not go directly from requested to
  claimed, denied/failed evidence fabricated as completed, a logical locator
  containing caller-assigned ledger IDs, zero/multiple assigned-ID discovery,
  wrong tool/version/capability hash, duplicate gateway reissuance, claimed
  recovery that attempts execution, and crash re-execution;
- W structural/copied/stale tokens or suspension capabilities, foreign or
  missing checkpoints/releases, wrong claim generation, expired deadline,
  cross-run anchor, unrecognized ledger advance, resident self-ID in a
  suspension payload, an old `approval-wait`/`blocked` checkpoint substituted
  for `resident-loop-suspension`, approval suspension with a future decision,
  non-approval suspension with any gateway ID, cursor-store substitution,
  exact-hash artifact miss/ambiguity, and any path or directory enumeration;
- W crash/restart after each of checkpoint, `S`, `R-resumable`, and release;
  duplicate semantic keys or canonical-byte conflict; skipped prefix state;
  duplicate append; premature release; return-before-release; task
  orchestrator auto-release; effect during recovery; a `recordable-stale`
  capability used for planning/request/effect/continuation; recordable-stale
  issuance without the same freshly authenticated mount/ledger/store; and an
  `unavailable` result that claims durable evidence;
- H caller-supplied events/readers, cross-run/authority mismatch, non-completed
  state, selected-readback mismatch, missing terminal evidence, and any
  Task138 DTO widening;
- R hostile or mutable bootstrap data, non-factory handles, stale/foreign
  provider or handoff authorities, fabricated/swapped/stale dispatcher
  capabilities, dispatcher hash or implementation-identity drift, G
  constructed outside W, agent-to-local-runtime imports, barrel capability
  exports, capability escape, structural port substitution, and any claim that
  the record-29 library entrypoint is installed in a default runtime or route;
- a fresh-process resume with G readback reissuance and stateless C replan as
  GREEN, and any dependence on a prior WeakSet/WeakMap-issued G object or C
  `latest` cache as RED;
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

The mission-state test is not causally changed. The checker adds only seven
source-specific seam groups: six released-source transfer groups plus the
G136-SC dispatcher-test transfer and dispatcher-source baseline-adoption
validator. It also adds exact source/target scope and command validators, the
eleven-entry compatibility constant, source-specific historical target/
current-head migration branches, the 28 raw pins, and new exact fingerprints.
The baseline validator requires the dispatcher source blob
`96b0ade273696b9ffcf497119f1943f128821a58` at the G136-SC candidate,
G136-SC integration, and pre-record-29 HEAD; it does not invent historical
G136-SC ownership for that previously unowned source. The checker adds no
generic, inferred, or transitive transfer facility.

With the exact contract ordering in this design, two-space JSON serialization
and one final LF produce:

```text
V4 JSON SHA-256:
6085471123099150a4c0ead9a1315f0db2353432ea639cc274c31c60bd6d4c4f

V4 assurance fingerprint:
14f5e3118d478fdb8b76ae1627350942706a4a87b428b048c2e13249981904e4

Mission immutable-envelope fingerprint after pin synchronization:
sha256:f919da5f8543811786b94bb6821a4102fdf4d81713fda68c2972a208c389df20
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
   fails only for the absent seven seam mappings, direct CF1-HR and G136-SC
   prerequisites, 26-path Task136 scope, 14-test command, eleven compatibility
   entries, dispatcher-source baseline adoption, record-29 migration, and raw
   pins. Apply the smallest GREEN contract/checker change, then synchronize
   the two mission pins. Preserve each commit separately.
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
   Apply only the 11 product source files required by those tests. The final
   Task136 product candidate has exactly the 26-path card scope above. The RED
   must exercise `createResidentBoundedAgentLoopFactory` with the real mounted
   fixture and must not add a default runtime or route call site.
6. Run the exact 14-test card command, the original focused and cross-boundary
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
  stop only at incomplete 29, while changed transferred bytes or a dispatcher
  source that differs from the exact G136-SC candidate/integration baseline
  fail source currentness;
- after record 29, Task136 owns and matches all 26 blobs, all 29 commands pass,
  every exact prerequisite integration is ancestral, and closure is complete;
- focused, cross-boundary, typecheck, factory, V4, marker, repository, diff,
  scope, ancestry, dependency, clean-state, and full-verification differential
  evidence is fresh from committed bytes;
- the concrete record-29 composition entrypoint executes against the real
  mounted fixture, while the repository contains no claimed or accidental
  default runtime/route activation;
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
