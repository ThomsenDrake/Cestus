# Task136 Record-29 Producer Reconciliation Design

**Date:** 2026-07-22

**Status:** Approach 1 remains program-owner approved. RV-1-E-954 authorizes
this exact forward written correction after preserving and rejecting exact
candidate `eb36b46edb19ff68fe3738093702b0a49f0eede2`. This descendant requires
a completely new fresh independent architecture and executability review pair
before coordinator approval, history-preserving integration, or any further
Task136 RED or source change.

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
had no recordable W transition. Revision
`75da663651c90cf41eee208dba36e21028b75aa2` closed that set but failed a
completely fresh review pair because caller-supplied dispatcher registrations
could still self-attest implementation provenance, claimed recovery could not
construct an exact durable result without risking reexecution, and the
released task orchestrator could race W by generically releasing and
reclaiming the new resident checkpoint. Revisions
`29826501dbad3650969cb3a45d1c4c933258489f` and
`7ebf3097b3362e1c16ac6466004a608b6385098c` then preserved that architecture
but failed fresh executability scrutiny: the first invented an unavailable
orchestrator summary reason and left domain-evidence causation undefined; the
second specified a loader forbidden by released repository policy, exposed no
cycle-safe non-barrel runtime API or pre-request preview operation, omitted
the automatic adapter/T120 bridge and unknown-result mapping, and did not
freeze mounted-ledger identity. RV-1-E-934 and the reviewed design at
`d475edd5cafd57a6f7db6c26aeeecb48bd9459cd` corrected that construction
without adding a producer seam or product path: 22 transferred paths, five
exact baseline-adopted paths, and the historical 30-path Task136 card. The
RV-1-E-1017 forward amendment below adopts the legacy-staging source/test
pair, yielding seven baseline adoptions and the current 32-path card. Rejected Task12
checkpoint `b54281b06ef420189ec0b1ffd82caa5d8bf4c2eb` then proved one remaining
written ABI gap: the design named an executable human-approved stage but no
same-process operation could advance the exact still-live human-request brand
through a later independent durable decision, and its dispatcher oracle proved
only forged-permit rejection rather than legitimate positive admissibility for
catalog ordinals 2 through 7 and 9 through 10. RV-1-E-952 froze the missing
same-instance transition and real adapter-specific positive evidence without
adding a path, seam, export, resolver, or callback. Exact descendant
`eb36b46edb19ff68fe3738093702b0a49f0eede2` preserved those corrections and
passed its fresh architecture review, but its different fresh executability
review rejected it with one P1: the PRR and export/report factory variants
still supplied one singular family context even though each of those families
constructs two ordinal-specific adapters with different trusted bindings.
RV-1-E-954 freezes the smallest correction: exact `initialContext` and
`followUpContext` inputs for ordinals 2 and 3, and exact `exportContext` and
`reportContext` inputs for ordinals 5 and 6. The strict frontier and all 29
card IDs/order remain unchanged.

## Decision And Authority

Task136 remains the twenty-ninth and final card in the frozen V4 release graph.
The approved correction transfers a finite set of released producer paths
directly to Task136, preserves the exact 29 card IDs and order, and preserves
the raw strict release records for cards 1 through 28 byte-for-byte.

The governing repository evidence is:

- original six-seam authority `RV-1-E-931` at
  `752a021ee7299b028ec6b05750471cf0962732ce`, seven-seam amendment
  `RV-1-E-932` at `6b2812683479c90f93e370b30baa9a76315b0d65`, and
  four-path interlock addendum `RV-1-E-933` at exact design base
  `fea8a7d267170d4a5216b7eb4aa64865dd18a3e4`;
- zero-path loader/ABI addendum `RV-1-E-934` at exact revised-design base
  `1512cd7d76156842febf9fe1ca955bf2c05c22e2`;
- fresh-decision ABI correction authority `RV-1-E-952`, preserving rejected
  Task12 checkpoint `b54281b06ef420189ec0b1ffd82caa5d8bf4c2eb`,
  forward-merged at
  `ea739b5140b00b9c4660267e89c36e8614b853b3`;
- dual-context dispatcher correction authority `RV-1-E-954`, preserving
  rejected exact candidate
  `eb36b46edb19ff68fe3738093702b0a49f0eede2`, forward-merged at
  `1c6b0866949761e56fce21411e83038b8a992365`;
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
8. The released task orchestrator treats an expired same-claim resident-loop
   checkpoint as an ordinary stale claim. It can append a competing generic
   release and generation-plus-one claim before W has durably completed
   checkpoint, resident suspension, resumable result, and resident release.

Task136 is forbidden from repairing those gaps locally. The correction must
change the producer-owned bytes under exact V4 ownership transfer and make
Task136 their final current owner only at strict record 29.

## Considered Approaches

### Approach 1: finite direct-source transfer to Task136

Keep the graph at 29 cards, preserve records 1-28, declare exact historical
compatibility for seven released source cards, move current ownership of only
the causally changed released paths to Task136, and adopt five previously
unowned paths from exact candidate/integration/current baselines at record 29:
the dispatcher source plus the four task-orchestrator interlock paths.

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

Exactly 22 released source/test paths transfer to Task136, and five previously
unowned paths are adopted from exact baselines. Source claims stay unchanged.
Existing source commands stay unchanged except Task136's command appends the
transferred dispatcher test and the two adopted task-orchestrator tests. Each
released source appends `Task136` to `transferToIds` after every current
target.

| Source card | Exact paths transferred to Task136 |
| --- | --- |
| T120-R | `packages/agent/src/plan-observation-contracts.ts`; `packages/agent/src/plan-observation-projection.ts`; `packages/agent/test/plan-observation-contracts.test.ts`; `packages/agent/test/plan-observation-projection.test.ts` |
| C136-P | `packages/agent/src/resident-plan-candidate-provider.ts`; `packages/agent/test/resident-plan-candidate-provider.test.ts` |
| G136-SC | `packages/agent/test/domain-execution-dispatcher.test.ts` |
| G136-R | `packages/agent/src/resident-loop-tool-gateway.ts`; `packages/agent/test/resident-loop-tool-gateway.test.ts`; `packages/agent/test/resident-loop-scheduler-completion-imports.test.ts` |
| Task137B-W | `packages/local-runtime/src/wake-supervisor-runtime.ts`; `packages/local-runtime/src/mounted-wake-lifecycle-store.ts`; `packages/local-runtime/test/wake-supervisor-runtime.test.ts`; `packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts`; `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts` |
| CF1-HR | `packages/agent/src/specialist-handoff-projection.ts`; `packages/agent/test/specialist-handoff-projection.test.ts`; `packages/ontology/src/contracts.ts`; `packages/ontology/test/agent-resident-loop-contracts.test.ts` |
| Task136-FC-Ports | `packages/local-runtime/src/resident-loop-factory-ports.ts`; `packages/local-runtime/test/resident-loop-factory-ports.test.ts`; `packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts` |

`packages/agent/src/domain-execution-dispatcher.ts` is the dispatcher-source
baseline adoption from G136-SC. V4 did not list it in any released card, so the
correction must not invent historical ownership. The checker instead proves
its exact blob
`96b0ade273696b9ffcf497119f1943f128821a58` at G136-SC candidate
`70814c1259871c5458a3578fae8a5c8281540377`, G136-SC integration
`253150b2ab5f2271d2b04a5b8fc5b82b7bf757a5`, and pre-record-29 current HEAD.
After record 29 it is an ordinary Task136-owned candidate/integration blob.

These four task-orchestrator paths are the remaining baseline adoptions, in
this exact order:

```text
packages/agent/src/task-orchestrator.ts
packages/agent/test/task-orchestrator-claims.test.ts
packages/agent/src/task-orchestrator-projection.ts
packages/agent/test/task-orchestrator-projection.test.ts
```

They are byte-identical at W1 candidate
`bd3b8ed3e287a6a598dfb246524e36ca2a345438`, W1 integration
`75de81f110b4f405f9ec064104bc2c2b4f79e223`, and pre-record-29 current HEAD,
with blobs, in the same order:

```text
72b11352c8a3c79237404257d676c1ef27fef5db
12d68f0b407f8b6f867a232c496b63b064e489bb
e4656da434f0ba48d670be085ba503dd7c51588b
6e9062b5c8e1a679612cf09dcb664dfe3bbeb9e7
```

No released V4 card owns them. The correction therefore does not invent W1
ownership, add W1 as a prerequisite, create a W1 compatibility entry, or
change a raw record. After record 29 they are ordinary Task136-owned
candidate/integration blobs.

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
task-orchestrator projection types, every producer claim, and every Task138-H
path. The wake runtime and mounted store already retain the authenticated
mounted store, facts, lifecycle admission, and reconciliation ports needed to
issue W. The public portable lifecycle remains an unchanged dependency and
cross-boundary regression gate.

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

Task136 owns exactly 32 paths in this order at record 29:

```text
packages/agent/src/bounded-agent-loop.ts
packages/agent/test/bounded-agent-loop.test.ts
packages/agent/src/plan-observation-contracts.ts
packages/agent/src/plan-observation-projection.ts
packages/agent/test/plan-observation-contracts.test.ts
packages/agent/test/plan-observation-projection.test.ts
packages/agent/src/resident-plan-candidate-provider.ts
packages/agent/test/resident-plan-candidate-provider.test.ts
packages/agent/src/adapters/legacy-staging.ts
packages/agent/test/legacy-staging-adapter.test.ts
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
packages/agent/src/task-orchestrator.ts
packages/agent/test/task-orchestrator-claims.test.ts
packages/agent/src/task-orchestrator-projection.ts
packages/agent/test/task-orchestrator-projection.test.ts
docs/agentic/claims/task-136-resident-full-vision-bounded-loop.md
```

Its exact card command is:

```text
npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts packages/agent/test/resident-plan-candidate-provider.test.ts packages/agent/test/legacy-staging-adapter.test.ts packages/agent/test/resident-loop-tool-gateway.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts packages/local-runtime/test/resident-loop-factory-ports.test.ts packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/task-orchestrator-claims.test.ts packages/agent/test/task-orchestrator-projection.test.ts
```

The canonical newline-delimited path-list SHA-256 is
`8fc076b8b7f3c23f513381fd771bf26ee81ad967c28b741bdb1c766d52554a41`.
The order above is the only source for contract order, release-record
`ownedPathBlobs` order, candidate/integration blob comparison, and every
path-list hash. The historical thirty-path hash is not current authority.

### RV-1-E-1017 secret-safe ordinal-10 binding amendment

The legacy-staging adapter source/test pair is adopted as Task136 baseline
authority, not transferred from another release-graph card. Before record 29,
both paths must equal their exact bytes at candidate
`3be15212776ab3c96e66bf0bade4630960c362eb`, published integration
`dc05c43c4b9a592d0396acd034bfc32e177fd09a`, and current HEAD. Their frozen
blobs are source `99fbafda3844435109bc249b015b111b9258c210` and test
`de7cef3123a15fb82891943dc51005165c8c9fcd`.

`AgentDomainPreview` exposes one additional ordered field only:

```ts
readonly selectedCandidateBindingHashes: readonly `sha256:${string}`[];
```

It never exposes raw candidate predicate or object values. For each exact
current selected candidate, in selected-candidate order, the adapter computes:

```text
sha256(
  utf8("legacy-selected-candidate-binding.v1\n") ||
  utf8(stableJson({
    candidateId,
    evidenceId,
    evidenceContentHash,
    predicate,
    object,
    confidence,
    subjectRef: {
      present: Object.hasOwn(candidate, "subjectRef"),
      value: Object.hasOwn(candidate, "subjectRef")
        ? candidate.subjectRef
        : null
    }
  }))
)
```

The canonical JSON object has exactly the seven displayed top-level fields;
the version domain is the literal prefix, and `subjectRef` always has exactly
`present` then `value`. Absence is distinct from a present empty or other
valid scalar value. Predicate, independent scalar object, confidence, and
subject reference remain inside the hash preimage and never enter the
preview. Candidate ID, evidence ID, and evidence content hash remain in their
released preview fields and are also covered by this non-substitutable
binding.

The adapter derives the ordered hashes from the authoritative current
candidate objects, includes the exact array in `normalizedInputHash`, and
returns it in the preview. The existing complete preview hash therefore binds
the array a second time. It must not accept caller-supplied hashes or compute
them from fixture-only fields.

After ordinal-10 execution, the dispatcher independently reconstructs each
preimage from the exact ordered `assertion.proposed` payload and its uniquely
matched `evidence.ingested` event. It compares the recomputed ordered hashes
to the approved current preview before issuing the attestation. It retains
exact assertion/evidence IDs, review state, causation, event order,
currentness, exact result, private branding, and at-most-once checks. In
particular, `payload.object` is the candidate's independent scalar object and
is never substituted with `candidateId`.

Recovery performs the same independent recomputation from the durable
proposal and evidence events before terminalizing a receipt. It also retains
the complete branch-specific evidence table, receipt hash, request/approval/
claim chronology, mounted preview, currentness, and at-most-once rules. The
receipt is not its own oracle, no report-store port is added, and no runtime
route or fallback write is introduced.

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

The canonical V2 planned-step schema adds required `toolRequestId` and
`executionCapabilityHash` fields. They are durable plan identity, not optional
gateway output. The canonical V2 tool-step `gatewayReadbacks` field replaces
its released always-human shape with this strict resident union:

```ts
type ResidentLoopV2GatewayReadbacks =
  | {
      readonly authorizationKind: "automatic-policy";
      readonly stage: "requested";
      readonly requestEventId: string;
    }
  | {
      readonly authorizationKind: "human-approval";
      readonly stage: "requested";
      readonly requestEventId: string;
    }
  | {
      readonly authorizationKind: "automatic-policy";
      readonly stage: "claimed";
      readonly requestEventId: string;
      readonly executionClaimEventId: string;
    }
  | {
      readonly authorizationKind: "human-approval";
      readonly stage: "claimed";
      readonly requestEventId: string;
      readonly decisionEventId: string;
      readonly approvedBy: string;
      readonly approvedPreviewHash: `sha256:${string}`;
      readonly executionClaimEventId: string;
    }
  | {
      readonly authorizationKind: "automatic-policy";
      readonly stage: "completed";
      readonly requestEventId: string;
      readonly executionClaimEventId: string;
      readonly outcomeReceiptEventId: string;
      readonly resultEventId: string;
    }
  | {
      readonly authorizationKind: "human-approval";
      readonly stage: "completed";
      readonly requestEventId: string;
      readonly decisionEventId: string;
      readonly approvedBy: string;
      readonly approvedPreviewHash: `sha256:${string}`;
      readonly executionClaimEventId: string;
      readonly outcomeReceiptEventId: string;
      readonly resultEventId: string;
    }
  | {
      readonly authorizationKind: "human-approval";
      readonly stage: "denied";
      readonly requestEventId: string;
      readonly denialEventId: string;
    }
  | {
      readonly authorizationKind: "automatic-policy";
      readonly stage: "failed";
      readonly failurePhase: "pre-claim";
      readonly requestEventId: string;
      readonly resultEventId: string;
    }
  | {
      readonly authorizationKind: "human-approval";
      readonly stage: "failed";
      readonly failurePhase: "pre-approval";
      readonly requestEventId: string;
      readonly resultEventId: string;
    }
  | {
      readonly authorizationKind: "human-approval";
      readonly stage: "failed";
      readonly failurePhase: "post-approval-pre-claim";
      readonly requestEventId: string;
      readonly decisionEventId: string;
      readonly approvedBy: string;
      readonly approvedPreviewHash: `sha256:${string}`;
      readonly resultEventId: string;
    }
  | {
      readonly authorizationKind: "automatic-policy";
      readonly stage: "failed";
      readonly failurePhase: "post-claim";
      readonly requestEventId: string;
      readonly executionClaimEventId: string;
      readonly outcomeReceiptEventId: string;
      readonly resultEventId: string;
    }
  | {
      readonly authorizationKind: "human-approval";
      readonly stage: "failed";
      readonly failurePhase: "post-claim";
      readonly requestEventId: string;
      readonly decisionEventId: string;
      readonly approvedBy: string;
      readonly approvedPreviewHash: `sha256:${string}`;
      readonly executionClaimEventId: string;
      readonly outcomeReceiptEventId: string;
      readonly resultEventId: string;
    };
```

Automatic branches structurally forbid decision, approver, and
approved-preview fields. Human `requested` also forbids them because approval
does not yet exist. T120 does not persist the transient `human-approved` stage
as a tool step: it records human `requested` while awaiting approval, then
`claimed`, `completed`, or `failed` after G's next durable transition. Tool
step state maps exactly as follows: `requested` accepts only stage
`requested`; `suspended` accepts human `requested` for approval waiting or
either `claimed` branch for `effect-outcome-unknown`; `executed` accepts only
`completed`; `denied` accepts only human `denied`; and `failed` accepts only a
matching failed branch. A decision ID is never fabricated for automatic
policy, and a compatibility-only adapter field is never a T120 readback.

The V2 store provides `appendPlan`, `appendObservation`,
`appendToolStep`, `appendSuspension`, and `appendResult`; exact event-ID reads
for every type; and `readReplay` for one exact task/attempt/run stream. Every
append normalizes hostile input before I/O, parses the canonical V2 payload,
rereads current stream/global state, performs one append with exact
concurrency preconditions, rereads the assigned event ID, compares canonical
bytes, validates the whole resulting prefix, and returns only the durable
reread. Exact idempotent retry returns the original event; a changed stable key
conflicts. `appendPlan` additionally proves every bound `toolRequestId` is
globally unused across durable plans and resident gateway streams under that
same global concurrency precondition.

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
    }
  | {
      readonly authorizationKind: "effect-outcome-unknown-automatic";
      readonly orchestrationCheckpointEventId: string;
      readonly logicalLocator: ResidentLoopGatewayLogicalLocatorV2;
      readonly requestEventId: string;
      readonly executionClaimEventId: string;
      readonly executionCapabilityHash: `sha256:${string}`;
      readonly resumptionDeadlineAt: string;
      readonly nextSafeAction: string;
    }
  | {
      readonly authorizationKind: "effect-outcome-unknown-human";
      readonly orchestrationCheckpointEventId: string;
      readonly logicalLocator: ResidentLoopGatewayLogicalLocatorV2;
      readonly requestEventId: string;
      readonly decisionEventId: string;
      readonly approvedBy: string;
      readonly approvedPreviewHash: `sha256:${string}`;
      readonly executionClaimEventId: string;
      readonly executionCapabilityHash: `sha256:${string}`;
      readonly resumptionDeadlineAt: string;
      readonly nextSafeAction: string;
    };
```

Only `suspensionCategory: "approval-required"` may use
`awaiting-human-approval`, and it requires the exact already durable request
but forbids `decisionEventId`, execution claim, completion, and approver. The
V2 suspension category enum adds exactly `effect-outcome-unknown`; that
category requires one of the two exact unknown
branches. Its automatic branch forbids every decision/approver field; its
human branch requires the exact durable decision, approver, and approved
preview hash. Both bind the exact request, permanent claim, locator, and
capability hash and forbid a completed/failed gateway terminal. The four
ordinary non-approval categories require `not-applicable` and forbid every
gateway ID. Automatic-policy execution never fabricates a suspension decision.
A later human decision for an approval wait is a post-checkpoint recovery fact,
not a field retroactively inserted into the immutable suspension.

The same ontology correction adds `effect-outcome-unknown` to the general V2
result-category enum and to the `resumable` permitted-category list. It is
valid only when the immediately preceding suspension has that same category,
the resume anchor matches that suspension, and the tool-step readback is the
exact automatic or human `claimed` branch above with no receipt or terminal.
It is invalid for `completed` or `failed`, cannot alias
`approval-required`, and is the exact category W uses for the corresponding
`R-resumable`.

The ontology also adds one orchestration checkpoint kind,
`resident-loop-suspension`, and one release reason,
`resident-loop-suspended`. The checkpoint carries a strict
`residentLoopSuspension` instruction containing the task/attempt/run,
resident, plan-record and final-observation event IDs, suspension category,
branch-appropriate request ID, deadline, next safe action, exact current
orchestration claim/generation, and deterministic suspension/result semantic
keys. For `effect-outcome-unknown` it also carries the complete exact gateway
binding above. No other checkpoint kind may carry that instruction.

The adopted `task-orchestrator.ts` recognizes a same-claim
`resident-loop-suspension` checkpoint as durable W ownership and supersession
only when it follows the claim, its event causation names that claim, and its
task, attempt, retry generation, lease-claim generation, and strict instruction
all equal the claim/run binding. In all three competing paths the active tick
skips generic handling, the cancellation race does not append a generic
release, and stale recovery does not append `stale-recovered` or a
generation-plus-one claim. `task-orchestrator-types.ts` remains outside this
card and its public summary union stays byte-for-byte unchanged: active,
cancellation, and stale interlock hits each append one existing
`TaskOrchestratorSkipSummary` with `reason: "not-claimable"`. That summary
reason means only that generic orchestration cannot act; it is not the
resident-specific diagnostic. The adopted
`task-orchestrator-projection.ts` recognizes this checkpoint before its
expired-lease branch and derives the existing `blocked` state with generic
`recoverable: false`, exact
`diagnosticReason: "resident-loop-suspension-owned-by-w"`, and the exact
checkpoint retained. Its existing diagnostic field is already `string`, so
`projection-types.ts` also stays unchanged. Only W may append or recover the
resident suffix and its exact resident release.

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
`ResidentReplanCandidateV2` own-data values whose proposed plan is the
canonical V2 payload except that each unbound planned step omits exactly
G-owned `toolRequestId` and `executionCapabilityHash`. Its provider-posture
and policy-constraint bindings are exact.
`parseResidentUntrustedPlanCandidate(input: unknown)` is the sole structural
boundary. Task136 reparses every returned candidate, compares its complete
posture, policy, tool/model, source/context, budget, authority, and causation
facts to current R/P/W readbacks, and only then calls T120. A C value never
grants permission or authority.

After that complete reparse, Task136 passes the exact plan identity, revision,
and ordered unbound steps to G's `preparePlannedStepBindings`. G already holds
the exact dispatcher capability and R/W-prebound trusted safe-ID closure; it
returns one frozen binding per exact ordinal with a new stable tool-request ID
and the current capability hash. Neither capability escapes. Task136 may merge
only those two fields into the corresponding unchanged unbound step, then
parses the complete canonical V2 plan before T120 append. Missing, extra,
reordered, duplicate, caller-replaced, or cross-step bindings fail closed. On
restart Task136 never regenerates them: the exact T120 plan reread is
authoritative.

C is stateless across candidates. `createReplanCandidate` accepts copied,
frozen canonical `priorPlan`, `priorPlanReadback`, and
`replanObservationReadback` values supplied from the current T120 replay and
validates the new candidate solely against those exact values. It has no
process-local `latest` prerequisite. On both same-process and process-restart
paths Task136 rereads that prior plan and observation from T120 before calling
C, reparses C's untrusted result afterward, and rejects any difference. A
fresh C instance therefore has no authority to invent history and can replan
from ledger state without an in-memory recovery cache.

### G136-SC and G: package-owned execution and durable at-most-once recovery

The transferred dispatcher source, not R, W, G, a structural caller, or the
legacy scheduler, is the resident executor trust boundary. It adds one frozen
resident-only default API:

```ts
interface ResidentDomainExecutionApiV1 {
  createPackageOwnedResidentDomainExecutionCapability(
    input: ResidentDomainFactoryBindingsV1
  ): Promise<OpaqueResidentDomainExecutionCapability>;
  bindPackageOwnedResidentDomainExecutionPort(input: {
    readonly capability: OpaqueResidentDomainExecutionCapability;
    readonly mountedLedger: EventLedger;
    readonly workspaceId: string;
    readonly residentAgentId: string;
    readonly taskId: string;
  }): OpaqueResidentDomainExecutionPort;
}

const residentDomainExecutionApi: ResidentDomainExecutionApiV1;
export default residentDomainExecutionApi;
```

The default object is the module's only new resident runtime export. Existing
named legacy dispatcher exports remain byte-compatible. JavaScript
`export *` does not forward a default export, so the unchanged agent barrel
does not expose either resident operation. W and the bounded tests import the
default directly from `domain-execution-dispatcher.js`; no named resident
issuer, binder, or resolver exists for the barrel to re-export.

`ResidentDomainFactoryBindingsV1` is a closed discriminated union with exactly
six variants: provider-byte-transfer, PRR-correspondence,
accepted-graph-review, export-report, destructive-repair, and legacy-staging.
Provider-byte-transfer, accepted-graph-review, and legacy-staging retain one
existing package adapter context because each exact selected pair or singleton
legitimately shares that binding. PRR-correspondence and export-report require
two exact ordinal-specific contexts. Destructive-repair retains its two
already separate contexts. No variant accepts any other context, adapter
object, descriptor, executor function, factory function, implementation name,
implementation revision, identity string, or lookup callback. Hostile
accessors, inherited keys, extra keys, proxies, sparse arrays, and post-call
mutation fail before a constructor or I/O runs.

```ts
type ResidentLegacyStagingContextV1 =
  CreateLegacyStagingAdapterInput & {
    readonly ledger: EventLedger;
    readonly residentAgentId: string;
  };

type ResidentDomainFactoryBindingsV1 = {
  readonly workspaceId: string;
  readonly residentAgentId: string;
  readonly taskId: string;
} & (
  | {
      readonly kind: "provider-byte-transfer";
      readonly context: ProviderByteTransferAdapterContext;
    }
  | {
      readonly kind: "prr-correspondence";
      readonly initialContext: PrrCorrespondenceAdapterContext;
      readonly followUpContext: PrrCorrespondenceAdapterContext;
    }
  | {
      readonly kind: "accepted-graph-review";
      readonly context: AcceptedGraphReviewAdapterContext;
    }
  | {
      readonly kind: "export-report";
      readonly exportContext: ExportReportAdapterContext;
      readonly reportContext: ExportReportAdapterContext;
    }
  | {
      readonly kind: "destructive-repair";
      readonly projectionContext: WorkspaceProjectionRebuildAdapterContext;
      readonly canonicalRepairContext: BlockedCanonicalRepairAdapterContext;
    }
  | {
      readonly kind: "legacy-staging";
      readonly context: ResidentLegacyStagingContextV1;
    }
);
```

Every selected context must contain a present validated `EventLedger`.
`initialContext` and `followUpContext` must reference the same exact ledger
object; `exportContext` and `reportContext` must reference the same exact
ledger object; and both destructive-repair contexts must continue to reference
the same exact ledger object. Each context is validated independently, and
every resident/task identity it carries must equal the union's exact
`residentAgentId`/`taskId`. The union's one exact `workspaceId` plus those
matching resident/task values forms the retained workspace/resident/task tuple
for both contexts in either paired family. The top-level workspace identity is
retained for later W comparison and is not caller authority.

The dispatcher uses literal static imports for the exact descriptors and these
eleven existing package constructors:

```text
createProviderByteTransferAdapter
createProviderParseExecutionAdapter
createPrrInitialSendExecutionAdapter
createPrrFollowUpExecutionAdapter
createAcceptedGraphAssertionReviewAdapter
createExportGenerationAdapter
createReportGenerationAdapter
createWorkspaceProjectionRebuildAdapter
createBlockedCanonicalRepairAdapter
createLegacyStagingApprovalAdapter
createLegacyStagingExecutionAdapter
```

Ordinals zero and one statically import from
`./adapters/provider-byte-transfer.js`; two and three from
`./adapters/prr-correspondence.js`; four from
`./adapters/accepted-graph-review.js`; five and six from
`./adapters/export-report.js`; seven and eight from
`./adapters/destructive-repair.js`; and nine and ten from
`./adapters/legacy-staging.js`. No module path or export name is caller data.

Their exact dispatcher-source-owned `implementationRevision` literals are,
respectively, `provider-byte-transfer.adapter.v1`,
`provider-parse-execution.adapter.v1`,
`prr-initial-send-execution.adapter.v1`,
`prr-follow-up-execution.adapter.v1`,
`accepted-graph-assertion-review.adapter.v1`,
`export-generation.adapter.v1`, `report-generation.adapter.v1`,
`workspace-projection-rebuild.adapter.v1`,
`blocked-canonical-repair.adapter.v1`,
`legacy-staging-approval.adapter.v1`, and
`legacy-staging-execution.adapter.v1`. Those adapter modules runtime-import the
released dispatcher failure helper, so ESM evaluation order is normative: no
module-level catalog constant, default-object initializer, hash initializer,
or other top-level code may read an imported adapter descriptor or
constructor. The frozen default object references dispatcher-local function
declarations only. The factory assembles and validates the exact ordered
catalog inside
`createPackageOwnedResidentDomainExecutionCapability`, after module
evaluation has completed. Neither the imported modules nor callers provide
the revisions. No dynamic import, computed loader, `require`, evaluator, or
loader-policy exemption is permitted.

The dispatcher independently validates every supplied context and instantiates
exactly the one or two catalog ordinals named by the selected union variant.
For PRR it passes `initialContext` unchanged to
`createPrrInitialSendExecutionAdapter` and `followUpContext` unchanged to
`createPrrFollowUpExecutionAdapter`. For export/report it passes
`exportContext` unchanged to `createExportGenerationAdapter` and
`reportContext` unchanged to `createReportGenerationAdapter`. It never
derives, spreads, copies-and-rewrites, substitutes, swaps, or cross-uses one
context to construct the other ordinal. Provider and legacy continue to pass
their singular context unchanged to both exact constructors;
destructive-repair continues to pass its two already separate contexts to
their respective constructors.

The dispatcher validates each constructed adapter through
`createAgentDomainToolRegistry`, requires its imported canonical descriptor to
equal the catalog entry, copies and freezes the resolved functions, binding
identities, exact workspace/resident/task tuple, and validated binding-ledger
identities in a module-private WeakMap, and returns only an opaque capability.

During W's one-shot composition,
`bindPackageOwnedResidentDomainExecutionPort` accepts only that exact WeakMap
member and requires every retained ledger identity to be `===` W's freshly
authenticated mounted ledger. It also requires the retained
workspace/resident/task tuple to equal W's mounted/current task tuple before
returning an opaque port. Missing or foreign ledgers, different destructive
context ledgers, substituted identities, and cross-task capabilities fail
before preview, constructor I/O, request append, or effect.

The private port never exposes `buildCurrentPreview`, `executeApproved`, an
adapter, or a raw function. It provides exactly two branded operations to the
prebound G closure:

1. `rebuildPackageOwnedCurrentPreview` selects the exact retained catalog
   entry from the locator, calls its package adapter's current-preview
   operation, copies and reparses the returned preview, source events,
   artifact hashes, provenance, locks, and freshness checks, and returns only
   that frozen own-data result. G revalidates W before and after the await and
   uses this exact result to append the request.
2. `invokeAndAttest` accepts an opaque fresh-execution permit, not a claim ID.
   G's module-private WeakMap issues the permit only in the same call frame in
   which `executeFreshAuthorized` appends and rereads the permanent claim. The
   permit binds the exact port, locator, request/decision branch, claim event,
   catalog ordinal, current-preview result, and canonical resident invocation
   input.

The cross-module permit check is concrete and has no caller-supplied callback.
`resident-loop-tool-gateway.ts` default-exports one frozen package-private
permit-consumer object whose initializer references only its module-local
function declaration. The unchanged wildcard agent barrel does not re-export
that default. The dispatcher is the sole production direct importer. When the
port receives `invokeAndAttest(permit, residentInvocationInput)`, its
dispatcher-local implementation calls that exact consumer with the permit,
the exact opaque port object, and the canonical input. The consumer requires
the permit to be a live member of G's private WeakMap, requires every bound
byte and the port identity to match, deletes it before returning the frozen
claim binding, and rejects a second use. W merely passes the opaque dispatcher
port into G's import-gated named constructor during its one-shot composition;
neither the permit issuer, consumer, permit, nor raw port crosses the returned
R/loop boundary. A capability plus a caller-supplied or reread claim ID can
never invoke.

The resident claim ID is not added to or forwarded through the unchanged
`AgentApprovedToolExecutionInput` adapter ABI.

Human invocation maps the exact approved G branch into the released adapter
DTO: `approvedBy` and `approvedPreviewHash` come only from its durable
human-approved readback. Automatic invocation is allowed only for catalog
ordinal 10, `legacy.staging.execute`, whose canonical descriptor has
`requiredApprovalClass: "none"` and whose released `executeApproved` ignores
the DTO parameter. For that ordinal alone the wrapper constructs one frozen,
non-durable compatibility DTO with `approvalClass: "none"`,
`previewHash` and legacy `approvedPreviewHash` both equal to the exact current
request preview hash, and legacy `approvedBy` equal to the fixed internal
label `resident-automatic-policy`. The label is not a human actor or approval.
The wrapper rejects this bridge for every other ordinal. The compatibility
label and legacy-only `approvedPreviewHash` never enter a resident event, T120
automatic readback, outcome envelope, or canonical resident invocation
preimage.

Immediately before invocation the wrapper snapshots the exact validated
binding ledger. If the package adapter returns in the same call frame, the
wrapper copies the result, rereads that ledger, applies the catalog-specific
admissibility table below, and returns a WeakMap-branded in-memory
`ResidentDomainInvocationAttestationV1`. The attestation binds the execution
claim ID, capability hash, catalog ordinal, implementation revision, exact
resident-invocation hash, exact copied result, pre/post ledger fingerprints,
and exactly one evidence mode:
`new-ledger-events`, `idempotent-existing-ledger-events`, or
`nonledger-projection-artifacts`. It cannot be serialized, supplied by G, or
reconstructed after restart. A thrown exception, process loss, malformed
result, failed ledger reread, or inadmissible result yields no attestation and
therefore no outcome receipt.

```ts
interface ResidentDomainInvocationAttestationV1 {
  readonly schemaVersion: "resident-domain-invocation-attestation.v1";
  readonly executionClaimEventId: string;
  readonly executionCapabilityHash: `sha256:${string}`;
  readonly catalogOrdinal: number;
  readonly implementationRevision: string;
  readonly residentInvocationInputHash: `sha256:${string}`;
  readonly evidenceMode:
    | "new-ledger-events"
    | "idempotent-existing-ledger-events"
    | "nonledger-projection-artifacts";
  readonly preInvocationLedgerFingerprint: `sha256:${string}`;
  readonly postInvocationLedgerFingerprint: `sha256:${string}`;
  readonly result: AgentDomainExecutionResult;
}
```

`residentInvocationInputHash` is the lower-case SHA-256, under the design's
canonical-JSON rules, of the complete claim-bound resident invocation input
before translation to the released adapter DTO. Its automatic branch contains
`authorizationKind: "automatic-policy"` and no decision, approver, or
approved-preview field; its human branch contains the exact durable approval
tuple. Each ledger fingerprint is the same hash over the complete validated
`readAll()` event array in ledger order; it is not an event count or
caller-supplied cursor.

The exact success-admissibility table is:

| Catalog ordinal | Required successful evidence |
| --- | --- |
| 0, 1 | No successful result is admissible; both released provider execution adapters are fail-closed while their domain service is unavailable. |
| 2 | Exactly one `prr.request.sent` event. |
| 3 | Exactly one `prr.followup.sent` event. |
| 4 | Exactly one `assertion.accepted` event. |
| 5 | Exactly one `export.generated` event. |
| 6 | Exactly one `report.generated` event. |
| 7 | Exactly zero event IDs, no ledger change, one or more artifact hashes exactly equal in order to the approved preview's projection-artifact outputs, and exactly one `workspace-projection-artifacts` read-model change over those outputs. |
| 8 | No successful result is admissible; blocked canonical repair must throw its released data-loss-risk failure. |
| 9 | Exactly one `legacy.ontology.staging.approved` event. |
| 10 | One or more `assertion.proposed` events in the exact selected-candidate order. |

For every event-backed row, returned event IDs are nonempty and unique, every
event is reread with the table's exact type and catalog-bound
context/input/payload identity, and the full set is either wholly new or wholly
preexisting. `new-ledger-events` requires every returned ID to be absent before
invocation and the exact after-minus-before event set to equal the returned
set. `idempotent-existing-ledger-events` requires every returned event and
canonical byte to exist before invocation and no event to be added during the
call. A mixed, partial, reordered, extra, foreign, generic-agent, or otherwise
ambiguous set fails closed. Ordinal 7 alone may use
`nonledger-projection-artifacts`; its approved preview and package-owned
adapter already bind the exact expendable outputs, and the wrapper rejects an
empty/mismatched output set or any ledger change.

For this frozen adapter ABI, the RV-1-E-933 phrase “claim-caused domain
evidence” has this exact operational meaning: the fresh permanent claim causes
one package-owned dispatcher invocation and the wrapper attests that
invocation's admissible domain outcome to that claim. Existing domain event
causation remains domain-specific and is never required to equal the resident
execution-claim ID. In the idempotent-existing mode, the claim causes the
package-owned observation and attestation of the already matching outcome, not
the original domain event. No adapter source, descriptor, scheduler type, or
execution DTO changes.

The safe
`executionCapabilityHash` uses exact ABI literal
`resident-domain-execution-dispatcher.v1`. Its preimage is UTF-8 canonical
JSON, with recursively lexicographically ordered object keys, preserved array
order, and no trailing LF, for `{ abiVersion, entries }`; every entry contains
only its ordinal, imported canonical descriptor, and source-owned
implementation revision. The hash is lower-case SHA-256 with the `sha256:`
prefix. It never uses function stringification, a caller identity, or
process-local object identity. A fresh process with the same package catalog
reproduces the hash but gets a new WeakMap member. A changed import,
descriptor, revision, order, duplicate, missing entry, fabricated capability,
or capability for the wrong selected family fails closed.

The released `createAgentDomainExecutionDispatcher({ adapters })` remains
byte-compatible for existing callers. Its structural registrations can never
issue an `OpaqueResidentDomainExecutionCapability`, enter the resident
WeakMap, satisfy the resident binder, or contribute to the resident
capability hash. The package-owned default API is the only issuer and binder.
R's trusted bootstrap input and direct bounded tests are the only record-29
consumers of a returned capability. Import-policy tests require W's exact
direct dispatcher-default import for binding, the dispatcher's exact direct
gateway-default import for permit consumption, direct test imports for
construction, absence of both default resident APIs from
`packages/agent/src/index.ts`, and no named, namespace, star, alternate, or
dynamic resident import/re-export. The released Task137 authority-policy
source and test remain unchanged.

Before T120 appends the plan, G prepares and returns the stable tool step
identity and hash that C/T120 bind. The exact logical locator is:

```ts
interface ResidentLoopGatewayLogicalLocatorV2 {
  readonly workspaceId: string;
  readonly residentAgentId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly planId: string;
  readonly planRevision: number;
  readonly stepOrdinal: number;
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly executionCapabilityHash: `sha256:${string}`;
}
```

The trusted safe-ID capability creates `toolRequestId`; callers cannot replace
it after plan admission. The locator contains no ledger-assigned event ID.
After restart the exact T120 plan reread, not caller memory, is authoritative.
G derives the resident gateway stream as
`agent_resident_domain_${digest}`, where `digest` is the lower-case hexadecimal
SHA-256 of the complete locator under the canonical JSON rules above. It
discovers assigned event IDs only by validating the complete durable prefix.

G uses these resident-only ontology events, isolated from the unchanged
generic scheduler stream:

```text
agent.resident-domain.requested.v1
agent.resident-domain.human-approved.v1
agent.resident-domain.execution-claimed.v1
agent.resident-domain.outcome-observed.v1
agent.resident-domain.completed.v1
agent.resident-domain.denied.v1
agent.resident-domain.failed.v1
```

The issued stages are exactly `requested`, `human-approved`, `claimed`,
`completed`, `denied`, and `failed`. Every issued value is WeakMap branded.
The automatic and human branches are structurally disjoint at every stage:
automatic requested/claimed/completed/failed values use
`authorizationKind: "automatic-policy"` and forbid decision, approver, and
approved-preview fields; human requested values use
`authorizationKind: "human-approval"`, human-approved and later human values
require the exact `decisionEventId`, `approvedBy`, and
`approvedPreviewHash`, and human denial terminates from requested without a
claim. No combined branch has an optional `decisionEventId`.

The import-gated internal G object has exactly these frozen operations:

```text
preparePlannedStepBindings
requestFreshAuthorized(locator)
readFreshHumanDecision(requested: OpaqueFreshHumanRequestedStage)
executeFreshAuthorized
rereadAndIssueFromLedger
```

Its internal constructor composition accepts only the authenticated ledger
and `now`, the opaque package-owned resident execution port, W-private
before-effect and after-effect currentness closures, and the trusted
tool-request-ID closure. The constructor accepts no raw adapter, executor,
claim, attestation, decision, provider, lookup, fallback, public resolver, or
caller-replaceable callback. It is non-barrel and import-gated to W. G's
default export remains only the frozen package-private permit consumer, the
dispatcher remains that default's sole production direct importer, and there
is no public or named permit issuer, decision resolver, or raw execution
callback.

`requestFreshAuthorized(locator)` first rebuilds the package-owned current
preview and revalidates W before and after that await, then appends and rereads
the exact automatic or human resident request. Automatic request issuance is
permitted only for catalog ordinal 10; every other executable ordinal requires
the human branch. The returned request is branded to that exact live G
instance and transition.

`readFreshHumanDecision(requested: OpaqueFreshHumanRequestedStage)` accepts
only the exact unconsumed same-instance human-request brand. It revalidates W,
rereads exactly one later independent durable human approval caused by that
request and bound to its exact preview and unexpired deadline, revalidates W
again, consumes the requested-to-approved transition, and returns a distinct
same-instance `human-approved` brand. The independent actor/path appends the
decision; G never appends or synthesizes it and only performs the exact durable
reread. The method accepts no locator, raw decision, callback, decision or
request ID, approval DTO, or caller-supplied permit.
Reusing the request, supplying a copied or foreign-instance brand, or observing
zero, multiple, stale, self, denied, revoked, mismatched-preview, or expired
decisions fails closed without a claim or effect.

Request append/reread binds the exact plan, locator, current preview and hash,
policy allowlist, side-effect/output/approval classes, source/context/artifact
provenance, authority, budgets, and capability hash. Human approval requires
one independent, non-self, current, unexpired decision whose approved preview
hash exactly matches the request. Automatic policy forbids an approval event.
Exactly one permanent execution claim may exist for a locator. Lease or
process expiry never authorizes another claim or another effect.

Event causation is exact: request names the durable plan record; human approval
and denial name the request; an automatic claim names the request; a human
claim names the approval; the outcome receipt names the claim; completed or
post-claim failed names the receipt; and proven pre-claim failed names the
request. Correlation, locator, and capability hash remain identical across the
whole prefix.

`executeFreshAuthorized` accepts only a fresh same-instance automatic
`requested` brand for ordinal 10 or the fresh same-instance human
`human-approved` brand returned by `readFreshHumanDecision`. It consumes that
transition, revalidates W currentness, appends and rereads the permanent claim,
then creates a non-serializable, in-memory, one-shot execution permit bound to
that exact claim and privately resolved catalog entry. Only that permit can
call the dispatcher's private
`invokeAndAttest(permit, residentInvocationInput)` operation; the claim ID is
read from the consumed permit rather than accepted as a separate string.

After the dispatcher returns its branded invocation attestation, G verifies
its exact claim, capability, catalog ordinal, implementation revision,
resident-invocation hash, copied result, ledger fingerprints, and evidence
mode; copies and normalizes the result once more; and appends/rereads
`agent.resident-domain.outcome-observed.v1`. That auxiliary durable receipt
binds the locator, request and claim IDs, authorization branch, capability
hash, catalog ordinal, implementation revision, evidence mode,
`residentInvocationInputHash`, normalized outcome disposition, pre/post
ledger fingerprints, exact ordered domain event IDs, artifact hashes,
read-model changes, result summary, and a canonical envelope hash computed
with the same canonical-JSON/SHA-256 rules above. G rejects a structural or
replayed attestation, a table-incompatible outcome, foreign or ambiguous
evidence, or any byte mismatch. Empty event IDs are valid only for ordinal
7's exact nonledger projection-artifact branch; empty overall outcome
evidence is never valid. Only after rereading the receipt may G
append/reread `completed` or a post-claim `failed` terminal.

`denied` is pre-claim and human-only. A pre-claim `failed` terminal is allowed
only with durable proof that execution did not start. A post-claim `failed`
terminal requires the outcome receipt and a proven failed disposition. A
thrown exception after claim is never sufficient evidence of nonexecution or
failure disposition. A claimed prefix without an exact receipt is permanently
sealed as `effect-outcome-unknown`; G cannot append completed/failed from
guesswork and cannot retry the original effect. W records a suspension whose
category is `effect-outcome-unknown` and whose exact binding includes the
request, claim, capability hash, locator, and, on the human branch, decision,
approver, and approved-preview hash. That branch is never represented as
`not-applicable`.

`rereadAndIssueFromLedger(locator)` accepts exactly one valid prefix with no
duplicate, gap, foreign event, changed canonical bytes, or second terminal.
It can reissue request, human-approved, claimed, completed, denied, or failed
readbacks, but every brand it returns is recovery/reread-only and
nonexecutable, including a reread automatic request or human-approved stage.
It never issues or recreates an execution permit and can never be passed to
`readFreshHumanDecision` or `executeFreshAuthorized`. A receipt after a crash
permits terminal finalization without an effect; a claim without a receipt
yields only `effect-outcome-unknown`.
Each issued readback maps only to the same authorization/stage branch in
`ResidentLoopV2GatewayReadbacks`: completed supplies its exact claim, receipt,
and terminal IDs; human denied supplies only its request and denial IDs;
pre/post-claim failure supplies the matching strict failure phase; and unknown
supplies the exact automatic or human `claimed` branch. Automatic readbacks
never fabricate a decision, approver, or approved-preview field. The original
`toolRequestId` stays permanently burned. Recovery may reconcile, observe, or
replan but never reexecute it. These guarantees are deliberately at-most-once,
not exactly-once.

### W: opaque mounted authority and resume

The authenticated wake runtime and mounted wake store jointly issue a
WeakMap-backed, non-serializable currentness token. W records its private store
state in a WeakMap at construction. After unchanged Core has started and bound
authority, R calls the non-barrel, import-gated, one-shot
`bindResidentLoopCapabilitiesForFactory(wakeRuntime, binding,
domainExecution)`
lookup. That lookup accepts only the exact issued wake-runtime identity plus
the Core/P/H binding and an opaque capability issued by the G136-SC domain
dispatcher. The mounted store privately constructs T120 from its authenticated
ledger, directly invokes the dispatcher default API's one-shot binder with
that ledger and the exact mounted workspace/current resident/task tuple, and
constructs prebound G with the returned opaque resident port plus W-private
reverify-before/after-effect closures. Binding fails unless every retained
adapter ledger is the same object as T120/W's authenticated ledger and every
retained identity matches. W also wraps the existing trusted
`createSafeId("reconciliation")` closure already held by the wake runtime in a
G-only WeakMap capability. Each planned-step request ID is
`toolreq_${sha256(canonical plan/ordinal binding plus fresh safe entropy)}`;
G validates the exact prefix and proves no T120 plan or resident gateway
stream already uses it before returning the binding. The entropy, closure, and
capability never escape. This dependency is local-runtime W to agent G; no
agent source imports local-runtime. The registrar returns only the issued
T120, prebound G, W, and exact-hash H-reader capabilities. Core needs no change
and R never injects T120, a ledger, a raw executor, or an event-reader into W.
G receives append authority and the opaque package-owned preview/invocation
port only inside W's one-shot construction; neither R nor a loop caller
receives the ledger, raw mounted store, runtime handle, mounted path,
dispatcher default API, resident port, resolved adapter, permit issuer or
consumer, safe-ID closure, or replaceable callback.

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

`ExactResidentLoopSuspensionLocator` is a copied, frozen own-data tuple of
exact task ID, attempt ID, run ID, and deterministic orchestration checkpoint
semantic key. It contains no ledger-assigned event ID and no candidate
instruction. Once state 1 exists, the exact reread checkpoint and its strict
`residentLoopSuspension` instruction are the sole durable source of every
canonical byte needed for states 2 through 4.

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

`suspendAndRelease` parses and copies the trusted current candidate and
consumes either a current token or the suspension-only capability. It is the
only API that may handle state 0 and create the orchestration checkpoint.
After that exact checkpoint is durable, it and `recoverSuspensionPrefix`
implement one monotone prefix state machine keyed by the exact locator:

0. with no `resident-loop-suspension` orchestration checkpoint, append and
   reread that checkpoint;
1. with only that checkpoint, use T120 to append and reread resident
   suspension `S`, whose payload names the checkpoint but contains no future
   resident event ID;
2. with the checkpoint and `S`, use T120 to append and reread `R-resumable`,
   whose resume anchor names `S.id` and repeats its deadline and next safe
   action; when `S.suspensionCategory` is `effect-outcome-unknown`, the result
   category is also exactly `effect-outcome-unknown`;
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
`recoverSuspensionPrefix` accepts only already durable states 1 through 4 and
may complete only the missing bookkeeping suffix through release using the
freshly authenticated supervisor/store, including when the prior claim lease
is stale. If the exact checkpoint is absent, it fails closed; it never creates
one from an empty or caller-provided instruction and can never perform or
reperform a tool effect. The release is durable before either API returns
success.

Every suspension category uses the new `resident-loop-suspension` checkpoint
kind and `resident-loop-suspended` release reason. The strict suspension
instruction carries the category, exact task/attempt/run/request identity,
deadline, next safe action, claim generation, and semantic keys. For
`approval-required` it also binds the existing exact gateway request without
a future decision ID. For `effect-outcome-unknown` it carries the exact
automatic or human request/claim/capability/locator branch frozen above; the
human branch also carries the exact approval tuple. Only the four ordinary
categories omit gateway IDs. W never reuses the task orchestrator's existing
`approval-wait` or `blocked` checkpoint kinds. The adopted task-orchestrator
interlock makes the same-claim resident checkpoint W-owned in active,
cancellation, stale-recovery, and projection paths, so no generic release or
reclaim can race `S` and `R-resumable`.

`reclaimAndReverify` rereads the exact suspension prefix and release. For an
approval-required suspension it additionally rereads the exact request and
requires exactly one later independent human decision caused by that request
and recorded before the deadline. For `effect-outcome-unknown` it rereads the
exact permanent claim, requires no receipt or terminal, reissues only G's
non-executable claimed state, and preserves the burned tool-request ID; for
the four ordinary categories it requires the absence of checkpoint gateway
IDs. It then validates the complete binding and budget, appends/rereads a
fresh orchestration claim, and issues a new current token. Task136 uses G's
logical-locator method to discover and reissue the exact staged readback and
appends a causally linked recovery observation. Unknown-outcome recovery may
reconcile, observe, and replan with a new tool request but never continue or
reexecute the burned request. If the task is now canceled or otherwise
ineligible, W may still finish the exact suspension suffix and resident
release, but `reclaimAndReverify` returns no token and appends no claim.

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
revisions, dispatcher ABI, and stable `executionCapabilityHash`. It is not a
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
currentness closures; W's direct default dispatcher import binds the opaque
resident port only after exact ledger/identity comparison and never returns
the port or retained adapters to R. W then returns the issued T120/G/W/H
capabilities. R constructs stateless C and the internal H projection port
locally, then invokes the
agent-owned, non-barrel `createResidentBoundedAgentLoopFromIssuedCapabilities`
issuer from `bounded-agent-loop.ts`. Import-policy tests allow that issuer only
from R; allow W to import only the named G constructor plus the dispatcher
default API; allow only the dispatcher to direct-import G's default
permit-consumer API; allow the dispatcher default API's construction method
only in direct bounded tests and its binder only from W; require no resident
runtime name on the unchanged agent barrel; and forbid every alternate
static/dynamic loader, named/namespace/barrel re-export,
agent-to-local-runtime import, raw adapter/function transfer, or alternate
capability mint. The issuer
freeze-brands the exact R-supplied capability identities once; there is no
exported generic constructor or structural port-bag parameter, and every
issued capability verifies its own WeakMap membership on use. The return value
is only
`{ metadata, loop, stop }`; `loop` exposes `advance` and `resume`, and `stop`
closes the retained composition. No public mint, raw handle, witness, store,
ledger, reader, adapter, executor descriptor/function, provider body, or
caller-replaceable structural port bag is exported.

Record 29 deliberately does not install this entrypoint into
`defaultLocalAgentRuntimeFactory`, HTTP routes, operator status, or any other
running default path. No current production file imports FC-Ports, those paths
are outside RV-1-E-934 and the V4 graph, and the governing Task136 plan forbids
route/default-factory edits. The card's executability gate therefore means the
exported composition entrypoint runs end-to-end against the real mounted
fixture; it does not mean runtime activation. Any default/runtime call site is
a later owner-authorized Wave task, never an implicit record-29 edit or claim.
Import-policy tests permit the new direct imports only at the exact
dispatcher/G/W/R/H owners named above.

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
- dispatcher bindings containing an adapter, descriptor, executor/factory
  function, identity/revision string, wrong context variant, or structural
  impostor; changed/missing/reordered/duplicate catalog entries; descriptor/
  implementation-revision drift; function-stringification provenance; a
  legacy caller-registered dispatcher minting or satisfying a resident
  capability; missing/optional/foreign per-ordinal contexts or retained
  ledgers; unequal PRR, export/report, or destructive paired ledgers; a
  workspace/resident/task mismatch between either paired context and the
  union; derivation, spread/copy-rewrite, substitution, swapping, or cross-use
  of `initialContext`/`followUpContext` or
  `exportContext`/`reportContext`; any dynamic/computed loader,
  `require`, evaluator, loader exemption, or module-initialization read of a
  statically imported adapter value; a barrel-first/adapter-first import that
  triggers TDZ or changes descriptors; a named/namespace/barrel resident
  export or either default resident API appearing on
  `packages/agent/src/index.ts`; any gateway permit-consumer importer other
  than the dispatcher; and any raw issuer/binder/consumer/port/adapter/function
  outside the exact direct dispatcher/W/G/R import chain;
- dispatcher current-preview reconstruction with the wrong capability,
  locator, catalog entry, task identity, preview, source events, artifacts,
  provenance, locks, or freshness facts; preview mutation or raw adapter
  escape; request append before preview readback or W post-await revalidation;
  port binding before exact mounted-ledger identity; a capability plus claim
  string invoking without the G-issued fresh permit; a permit bound to another
  port, claim, locator, branch, ordinal, preview, or canonical invocation
  input; a reread/replayed/copied permit; and invocation before atomic
  one-shot permit consumption;
- G a fabricated, swapped, stale, ABI-mismatched, implementation-mismatched,
  or hash-mismatched dispatcher capability; forged/self/stale/expired/denied/
  revoked/duplicate approval; `none` masquerading as human approval; a human
  stage missing `decisionEventId`, `approvedBy`, or `approvedPreviewHash`; an
  automatic stage carrying any of those fields or an approval event; request/
  claim causation drift; changed preview; reused authorization; duplicate
  permanent claim; claim-expiry reexecution; or a terminal stream;
- G construction with anything beyond the authenticated ledger/clock, opaque
  resident port, W-private before/after-effect currentness closures, and
  trusted tool-request-ID closure; a public or named permit issuer, decision
  resolver, raw callback, or a default export wider than the dispatcher-only
  permit consumer; a copied, replayed, recovery-issued, consumed, or
  foreign-instance human-request/human-approved brand; zero, multiple, stale,
  self, denied, revoked, preview-mismatched, or expired decisions; decision
  read without W revalidation; automatic issuance for any ordinal other than
  10; or any recovery/reread brand acquiring execution authority;
- the ordinal-10 automatic compatibility bridge used for any other ordinal,
  used with an approval class other than `none`, carrying a preview mismatch,
  accepting a caller actor label, or leaking its internal label/legacy
  approved-preview field into a resident event, T120 readback, outcome
  envelope, or resident invocation hash; a human invocation whose adapter DTO
  does not derive both approval fields from the exact durable decision;
- T120 automatic readbacks carrying any decision, approver, or approved
  preview; human requested carrying a future decision; claimed/completed/
  denied/failed stage fields missing or crossing authorization branches;
  a state/stage mismatch; automatic denial; a post-claim failure without
  claim/receipt/result IDs; or a compatibility field substituted for durable
  gateway evidence;
- G invalid `requested -> human-approved -> claimed ->
  outcome-observed -> completed` transitions, automatic flow that does not go
  directly from requested to claimed, denied/failed evidence fabricated as
  completed, a logical locator containing a caller-assigned ledger ID or
  missing workspace/resident/plan/step identity, zero/multiple assigned-ID
  discovery, wrong tool/version/capability hash, duplicate gateway reissuance,
  and a reconstructed claimed state that obtains an execution permit;
- dispatcher invocation attestation with a wrong claim, capability, ordinal,
  implementation revision, ledger fingerprint, evidence mode, or copied
  result; any successful return for catalog ordinal 0, 1, or 8; wrong
  event type/count/order/context; duplicate, mixed-new-and-existing, partial,
  extra, foreign, generic-agent, or changed domain events; a supposedly new
  event present before invocation; an idempotent-existing result with any
  newly appended event; ordinal 7 carrying an event ID, an empty/mismatched
  projection-artifact set, a wrong read-model change, or any ledger advance;
  and any adapter/source/DTO widening used to inject the resident claim;
- executable positive package-owned fixtures for each exact catalog ordinal
  2 through 7 and 9 through 10. Ordinals 2 and 3 use independently built real
  `initialContext` and `followUpContext` values, and ordinals 5 and 6 use
  independently built real `exportContext` and `reportContext` values; the
  paired contexts share only their required exact ledger identity and matching
  workspace/resident/task tuple and each is passed unchanged to its static
  constructor. All selected contexts use real adapter-specific services rather
  than construction-only throwers. Ordinals 2 through 6 and 9 through 10 each
  prove both wholly `new-ledger-events` and wholly
  `idempotent-existing-ledger-events` evidence; ordinal 7 alone proves exact
  `nonledger-projection-artifacts` with zero ledger delta; and ordinals 0, 1,
  and 8 prove that no successful attestation, receipt, or terminal can exist.
  Forged-permit rejection, one family context rewritten for another ordinal,
  and construction-only fixtures are necessary negatives but are never
  sufficient positive admissibility evidence;
- G a structural/replayed invocation attestation, empty overall evidence,
  ordinal-7 empty events treated as an event-backed result, changed normalized
  result or envelope hash, or completion without the exact outcome receipt; a
  pre-claim failure without durable not-started proof; a post-claim failure
  without a proven receipt disposition; an exception treated as proof;
  receipt recovery that invokes the effect; claimed-without-receipt recovery
  that appends a guessed terminal; reuse of the burned tool request; and any
  crash reexecution;
- W structural/copied/stale tokens or suspension capabilities, foreign or
  missing checkpoints/releases, wrong claim generation, expired deadline,
  cross-run anchor, unrecognized ledger advance, resident self-ID in a
  suspension payload, an old `approval-wait`/`blocked` checkpoint substituted
  for `resident-loop-suspension`, approval suspension with a future decision,
  an ordinary non-approval suspension with a gateway ID, an unknown-outcome
  suspension missing request/claim/capability/locator or its exact human
  approval tuple, cursor-store substitution, exact-hash artifact
  miss/ambiguity, and any path or directory enumeration;
- W crash/restart after each of checkpoint, `S`, `R-resumable`, and release;
  duplicate semantic keys or canonical-byte conflict; skipped prefix state;
  recovery from absent state 0; untrusted recovery instruction; duplicate
  append; premature release; return-before-release; effect during recovery; a
  `recordable-stale` capability used for planning/request/effect/continuation;
  recordable-stale issuance without the same freshly authenticated
  mount/ledger/store; and an `unavailable` result that claims durable evidence;
- `effect-outcome-unknown` absent from the suspension enum, result enum, or
  resumable mapping; used as completed/failed/approval-required; a claimed
  tool-step readback with a receipt/terminal; a suspension/result category
  mismatch; or an `R-resumable` anchor that differs from the exact unknown
  suspension;
- task-orchestrator active handling, cancellation, stale recovery, and
  projection each attempting a generic release or generation-plus-one reclaim
  after a same-claim `resident-loop-suspension`; recognition after the
  expired-lease branch; dropped checkpoint evidence; generic recoverable
  projection state; any interlock tick summary reason other than the existing
  `not-claimable`; a projection diagnostic other than
  `resident-loop-suspension-owned-by-w`; an attempted
  `task-orchestrator-types.ts` or projection-types widening; and any
  nonresident checkpoint accidentally receiving the interlock. GREEN controls
  prove ordinary active/cancelled/stale claims and existing checkpoint kinds
  retain released behavior;
- H caller-supplied events/readers, cross-run/authority mismatch, non-completed
  state, selected-readback mismatch, missing terminal evidence, and any
  Task138 DTO widening;
- R hostile or mutable bootstrap data, non-factory handles, stale/foreign
  provider or handoff authorities, fabricated/swapped/stale dispatcher
  capabilities, dispatcher hash or implementation-revision drift, G
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

The forward assurance amendment changes exactly nine files:

```text
docs/superpowers/specs/2026-07-22-task136-record29-producer-reconciliation-design.md
docs/superpowers/plans/2026-07-23-task136-record29-producer-reconciliation-implementation.md
docs/agentic/claims/task-136-resident-full-vision-bounded-loop.md
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
The baseline validator requires the adopted legacy-staging source and test
blobs `99fbafda3844435109bc249b015b111b9258c210` and
`de7cef3123a15fb82891943dc51005165c8c9fcd` at common candidate
`3be15212776ab3c96e66bf0bade4630960c362eb`, published integration
`dc05c43c4b9a592d0396acd034bfc32e177fd09a`, and pre-record-29 HEAD.
It also requires the dispatcher source blob
`96b0ade273696b9ffcf497119f1943f128821a58` at the G136-SC candidate,
G136-SC integration, and pre-record-29 HEAD; it does not invent historical
G136-SC ownership for that previously unowned source. The same finite baseline
validator requires the four task-orchestrator blobs, in exact Task136 order,
`72b11352c8a3c79237404257d676c1ef27fef5db`,
`12d68f0b407f8b6f867a232c496b63b064e489bb`,
`e4656da434f0ba48d670be085ba503dd7c51588b`, and
`6e9062b5c8e1a679612cf09dcb664dfe3bbeb9e7` at W1 candidate
`bd3b8ed3e287a6a598dfb246524e36ca2a345438`, W1 integration
`75de81f110b4f405f9ec064104bc2c2b4f79e223`, and pre-record-29 HEAD. It
does not invent W1 ownership, a prerequisite, a transfer target, or a
compatibility entry. The checker adds no generic, inferred, or transitive
transfer or adoption facility.

With the exact contract ordering in this design, two-space JSON serialization
and one final LF produce:

```text
V4 JSON SHA-256:
3adbf85ccc071667df73809f44b0e1451b66fdd81dfc6021afafcc4feec20930

V4 assurance fingerprint:
da850dfd3068efda96b96e9a274777e3b97e2922017c16be8ea703b09e7cd1ec

Mission immutable-envelope fingerprint after pin synchronization:
sha256:1fcbb344a125ae874ea174022f051486267f0f7afa75e743bdb8fab24632d5ab

Mission source fingerprint after pin synchronization:
sha256:5b5b6b71dc5d0f4b96954ac00d3e7b8a4ccb7c31465eabac149b7f312f39028b
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
   prerequisites, 32-path Task136 scope, 17-test command, eleven compatibility
   entries, seven exact baseline adoptions, record-29 migration, and raw pins.
   Apply the smallest GREEN contract/checker change, then synchronize the two
   mission pins. Preserve each commit separately.
3. Run assurance 20/20, all four exact contract markers, factory readiness,
   repository strict 28/28 followed only by expected incomplete-29 closure,
   typecheck, exact scope/diff/ancestry/dependency/clean gates, and obtain a
   fresh independent architecture/executability review pair on one exact
   nine-file amendment candidate. Integrate only after both approve.
4. Forward-merge that approved program authority into the existing clean
   Task136 lineage at `72e1ee6624c582218995e3e075e2303998811834` without
   reset, rebase, amend, reconstruction, or discarded history.
5. Commit claim-only recovery evidence. Commit one permanent product RED that
   adds the exact producer and Task136 negative tests before source GREEN.
   Apply only the 14 product source files required by those tests. The final
   Task136 product candidate has exactly the 32-path card scope above. The RED
   must exercise `createResidentBoundedAgentLoopFactory` with the real mounted
   fixture and must not add a default runtime or route call site.
6. Run the exact 17-test card command, the original focused and cross-boundary
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
  source or task-orchestrator path that differs from its exact candidate/
  integration baseline fails source currentness;
- after record 29, Task136 owns and matches all 32 blobs, all 29 commands pass,
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

## RV-1-E-1109 Current Exact-Identity 33-Path Amendment

This true-EOF section is the current design authority. It supersedes only the
current 32-path mechanics above; every earlier design revision, candidate,
review, pin, RED, GREEN, release, and strict-record hash remains immutable
historical evidence for its exact commit. The strict release graph remains
exactly 29 cards and the product frontier remains 28 of 29.

Transfer exactly
`packages/local-runtime/src/resident-loop-factory-composition.ts` from
`Task136-FC-Core` to `Task136`. `Task136-FC-Core.transferToIds` is exactly
`["Task136"]`; only that source has current disposition `transferred`. The
two FC-Core tests and
`docs/agentic/claims/task-136-factory-authority-composition.md` remain current
`owned`, retain their original command, and never migrate to Task136.
Historical strict record 19 retains `owned` for all four FC-Core paths.

The immutable record-19 evidence is:

```text
candidate c6efd58a3e385d0097b4df9f73703a75b145e660
integration 7a7a650e7db97c1aad63447e3669e66ddf3dc7fe
composition source blob 8e69a7ac55f16a9d3e1c2646c985ffc6539fe064
raw record SHA-256 5e78c42b3753cd3ce086ab45862479f2e5569fdaae1fc683528a67101630b920
compact canonical record SHA-256 ff24eb56771db9a1a7ea015783a9b83c17f246d5e0215364b7fecb547c92c0c1
```

Task136 has exactly ten direct prerequisites. Insert `Task136-FC-Core`
immediately before `Task136-FC-Ports` while preserving all other prerequisite
order. Task136 has exactly 33 ordered paths: 15 sources, 17 tests, and one
product claim. Insert the composition source at one-based position 23,
immediately after
`packages/ontology/test/agent-resident-loop-contracts.test.ts` and before
`packages/local-runtime/src/resident-loop-factory-ports.ts`. Every other path
retains its relative order. The canonical newline-delimited 33-path SHA-256 is
`4cca816c5004bf922d47a44bc8e9216a7f4d1e00a030f20b34d59fb0cd1e442e`.
The Task136 card command remains the exact existing 17-test command.

Release compatibility is exactly twelve entries. Insert
`Task136-FC-Core` immediately before `Task136-FC-Ports`, with only the
composition source and historical disposition `owned`; its compact hash still
binds the complete four-path raw record. Before record 29, source currentness
remains bound to the FC-Core record's exact candidate, integration, and
current-HEAD blob. At record 29, only the composition source migrates to the
Task136 candidate, integration, and current HEAD. The FC-Core tests and claim
remain FC-Core-owned.

The mandatory Task136 cross-boundary control grows from 35 to exactly 37 tests
by adding, unchanged:

```text
npm test -- packages/local-runtime/test/resident-loop-factory-composition.test.ts packages/local-runtime/test/resident-loop-factory-composition-imports.test.ts
```

The exact-identity repair uses a private non-barrel one-shot issuer seam at
the actual Core composition allocation and issuance point. Composition
privately registers or brands the exact completed frozen authority readback
against the exact issued wake-runtime identity before returning. W accepts
only the original outer, provider, handoff, and authority-binding allocations
and rejects any copy or substitution before mounted-store I/O. The seam is
not caller-visible and exposes no copyable brand, callback, report-store port,
barrel export, fallback, activation, route, provider, credential, or network
authority. Structural equality, first-seen state, timing, allocation order,
call-stack inspection, source-text inspection, hidden globals, and
process-local rendezvous are forbidden substitutes for package-owned identity.

The synchronized current pins are:

```text
V4 JSON SHA-256:
96b6104617103b85916df22b46168781c58b4465b729369f3e7179cf0a89b8e5
V4 assurance fingerprint:
f73e9d7090dfdd388b18c2b13ca207f3cfa11697fe4473026e0b09492d083df4
Mission immutable-envelope fingerprint:
sha256:82e666a86d2b3ccd0ceafd634975d0a7459d3fe7600d27cc8345dd0f531fbc1e
Mission source fingerprint:
sha256:799af83764d6c098f3b1a97d6d30fc3b9b13f32f7c57204d92383fab371179ac
```

The amendment changes only the nine authority paths named by RV-1-E-1109 and
changes no package/product byte. After completely fresh independent design and
executability approval plus history-preserving integration, a separate
append-only event may authorize the already approved 42-failure Task14 GREEN
in exactly the composition source, wake-supervisor source, and mounted-store
source.

## RV-1-E-1181 Current Private Lexical-Capability Amendment

This true-EOF section supersedes only Task14's public readback-registrar
mechanism above. Every 33-path ownership rule, prerequisite, compatibility
entry, raw release pin, historical candidate/review/integration fact, and
record-29 gate remains unchanged.

### Feasibility boundary

An exported wake constructor plus an exported later registrar cannot prove a
composition-only caller. A direct caller controls and retains every constructor
argument and receives the exact runtime. If legitimate composition can derive a
registrar issuer from those public inputs or outputs, the direct caller can
derive or retain the same value. A deterministic public registrar therefore
cannot accept the composition trace and reject the equivalent direct trace
without a private lexical capability or a forbidden contextual heuristic.

Normalization, cloning, or branding inside the public constructor does not
repair this boundary. A hidden value cannot be supplied later by composition;
an exposed value is equally available to the direct caller. Static import
policy may prove repository ownership but cannot substitute for runtime
unforgeability.

### Approved module topology

`packages/local-runtime/src/wake-supervisor-runtime.ts` owns both wake-runtime
state and the complete legitimate composition issuance flow.

- Exported `createWakeSupervisorRuntime(input)` remains the generic public wake
  constructor. It returns a runtime whose private state has no factory
  registrar capability and can never acquire a factory readback.
- A nonexported factory-only issuance function creates the exact wake runtime
  plus a one-shot `registerReadback(readback)` closure. Both are consumed only
  by `createResidentLoopFactoryComposition` in the same module.
- The registrar closure captures its exact wake-runtime state lexically. It
  checks accepted-start readiness and unused state before inspecting the
  proposed readback, freezes no caller object, and stores only the exact
  completed outer/provider/handoff/authority-binding allocations.
- The closure is never exported, re-exported, returned from the public
  composition object, installed on a public object, passed to caller code, or
  represented by a caller-visible brand or structural field.
- Exported `bindResidentLoopCapabilitiesForFactory` remains the downstream
  consumer. It rejects a generic runtime before reading the proposed binding
  or authenticated ledger because that runtime has no registered factory
  binding.
- Exported `registerResidentLoopFactoryAuthorityReadback` is removed.

`packages/local-runtime/src/resident-loop-factory-composition.ts` becomes only
the compatibility facade for the existing safe composition API. To preserve
the frozen released FC-Core import-policy contract, it uses exactly six static,
named, unaliased, causally used imports: the wake result type; handoff types;
mounted-provider types; one distinctly named safe composition-builder value
from the wake module; wake runtime/input types in a separate type import; and
the local runtime-handle type.

The facade locally declares the existing composition input, bind-input,
readback, and composition interfaces. Its only value implementation is the
existing exported `createResidentLoopFactoryComposition(rawInput)` wrapper,
which immediately calls the safe wake-module builder and returns its safe
composition object. It uses no export-list syntax and contains no issuer,
registrar, wake construction, bind implementation, mutable state, provider
operation, route, activation, or fallback.

The distinctly named safe wake-module builder is callable behavior, not an
authority capability. It accepts only the same untrusted `rawInput`, performs
the complete co-located composition flow, and never accepts or returns the
private registrar. Static policy permits exactly the one facade import and
wrapper call; it forbids every alternate production importer, alias, re-export,
or caller.

The safe public composition behavior is unchanged: normalize one caller input;
create and start one exact wake runtime; authenticate provider and handoff
authority; construct one completed frozen readback; register it through the
nonescaping lexical closure; return it; and allow one later exact downstream
binding. Repeated bind, copied outer/nested allocations, generic runtimes,
wrong runtimes, stale authority, and substitutions reject before mounted-store
effects.

### Test and static-policy contract

The corrected runtime oracle must prove:

1. the wake module has no exported
   `registerResidentLoopFactoryAuthorityReadback`;
2. a directly created generic runtime reaches accepted start but
   `bindResidentLoopCapabilitiesForFactory` rejects an accessor-backed
   proposed readback with zero accessor and authenticated-ledger reads;
3. legitimate composition creates, registers, returns, and consumes its exact
   one-shot binding; and
4. copied, wrong-runtime, repeated, stale, and other existing hostile controls
   retain their fail-closed outcomes.

The corrected TypeScript AST/symbol-resolution oracle must prove:

- the old registrar has zero declarations in the exported module surface,
  zero imports, and zero callers;
- the factory-only issuance function and registrar closure are nonexported,
  remain in `wake-supervisor-runtime.ts`, and cannot escape through the
  already committed direct, aliased, destructured, callable, conditional,
  logical, await, spread, default, and comma-expression cases;
- the safe builder has exactly one production importer and one wrapper call in
  the narrow compatibility facade, while the existing public composition
  function and interfaces remain local facade declarations;
- the facade has exactly six static named unaliased imports, one wrapper value
  implementation, no export-list syntax, and no cycle; and
- no barrel, namespace, dynamic-loader, alternate-source, optional-call,
  spread-call, copied-construction, or alternate-caller path gains the private
  capability.

No new unrelated alias fixture is added. The mounted lifecycle store and its
test remain byte-frozen unless a separately approved causal RED proves a
change necessary.

### Scope and gates

The test-first correction changes only the existing runtime and import-policy
tests. It preserves 96 focused tests and must begin as
**96 = 94 passed + two Task14 failures**. The exact Task136 card is
**383 = 374 passed + nine failed** and the exact 37-file cross-boundary result
is **1,042 = 1,033 passed + nine failed**; the other seven failures are the
preserved Task15-through-16 REDs.

After independent RED approval, append-only recording, and history-preserving
integration, a separate GREEN may change only
`packages/local-runtime/src/wake-supervisor-runtime.ts` and
`packages/local-runtime/src/resident-loop-factory-composition.ts`. GREEN is
exact **96/96**, card **383 = 376 passed + seven failed**, and cross-boundary
**1,042 = 1,035 passed + seven failed**.

The amendment adds no path and retains the exact 33-path ceiling. It adds no
provider, route, activation behavior, default runtime, fallback write,
structural/first-seen/timing/allocation-order heuristic, call-stack or
source-text inspection, hidden global mutable authority, process-local
rendezvous, dependency, credential, network call, or external effect.
Task14 and Task136 remain `implementing`; the strict product frontier remains
28 of 29 until every later committed gate exists.
