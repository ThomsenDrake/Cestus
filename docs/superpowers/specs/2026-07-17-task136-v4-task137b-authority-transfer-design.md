# Task136 V4 Task137B Authority Transfer Design

**Date:** 2026-07-17

**Status:** Approved bounded amendment. The standing authorization permits the
task-scoped SDD and TDD in the companion plan. Fresh dual review is the only
approval gate before integration.

## Purpose

Task137B-W's preserved candidate
9986cdaa036e2fe39eef2f97833a56ae787c7bf7 closed its prior bounded repair
rounds, but RV-1-E-679 reproduced two P1 authority defects:

1. The exported mounted wake store accepts a structural LocalRuntimeHandle and
   the wake runtime reads handle-owned state before factory authentication.
2. A lease records expiry with a second now() call at acquisition, so a
   zero-duration lease permits overlapping current epochs.

V4 repairs those defects without a new card or a reusable transfer language.
It transfers exactly four released paths directly to Task137B-W, expands the
card from ten paths to fourteen, and preserves the prior evidence chain. No
provider behavior, external service, release-card order, or wake schema beyond
the already approved seven canonical lifecycle events changes.

## Rejected Alternatives

### New authority-bridge card

This would violate the frozen 29-card graph and add an unnecessary release
cycle. Rejected.

### General ownership-transfer facility

An arbitrary source-to-target mapping would broaden the assurance language.
V4 hard-codes only the two sources and their exact path groups. Rejected.

### Structural-store construction or timer-only expiry

Checking a structural handle after construction permits untrusted reads and
I/O. Timer-only expiry gives a stale capability grace between ticks. Both
contradict factory capture and currentness. Rejected.

## Immutable Evidence

V4 copies V3 into a new contract file. These files remain byte-for-byte
unchanged:

| Artifact | SHA-256 |
| --- | --- |
| docs/agentic/contracts/task136-bounded-assurance-v1.json | d33864d9964a355067b7be86c78951d3df184a80b80765da3f51aab66e903fed |
| docs/agentic/contracts/task136-bounded-assurance-v2.json | c23a390cc3e4a3395c018a8532e0fa84b23a880782805f7cbcc463d9e8162ba4 |
| docs/agentic/contracts/task136-bounded-assurance-v3.json | 8934dbaf8246d295eba5ce825169ac08bb98f0e1b6b75a977657000cb46a1bbb |

The first ten strict task136-dispatch-release.v4 fenced JSON blocks remain
byte-for-byte unchanged. The V4 checker separately pins their raw fenced JSON
bytes by card ID:

| Position | Card | Raw JSON SHA-256 |
| --- | --- | --- |
| 1 | Task126 | 1b1fc2171278866b38f6aa96889b822f22ab2abd34f460b304fe7fc2c3a0b58d |
| 2 | Task127 | 18199ad9bfdcf3582ad13f6637bfbcc72949f1407271fa6c325612abcd226951 |
| 3 | Task128 | fe29c10c5dbe3d8c1596f20db7b95b62df8dd98d379ade09d2ed85822ce51d92 |
| 4 | Task135D | 749f6a7ec9f66fd8228426e07e3d5b9dbc1a6f0e57d7a804ad69515f48ffc9f9 |
| 5 | Task137A | 5a3b2f9a897b5d458742df7a3d403f0e3fe6e3459aba75e93d825d385ec4be32 |
| 6 | Task129-MFA | 64048b14448b66f224d254753a7ecbd210e1654602759248e5de89663295f017 |
| 7 | Task129 | 987b4b18667508b7e4bd500be50b121d41b019bb011da8ae64ef4996ce62e01e |
| 8 | Task130 | 16328e8381eb9a55f7a8c3f3f155a4c40d44f4c0da1abe745c850193522171d8 |
| 9 | Task135B | 5fffad565a1523aecb0a0afd280b8b9936fc2a48dbe1c0b268f946634732e9e0 |
| 10 | T120-R | f220cb62ab803c938e4e97c538f55e24628bbf46d6e06060cb0169c1adbf2cdb |

The existing strict parser still validates canonical JSON, candidate,
integration, reviews, prerequisite identities, and blobs. The byte pins add a
separate guard against historical whitespace, key-order, or text mutation.

## V4 Ownership Topology

V4 has exactly 29 cards in V1/V2/V3 order. Task137B-W remains card 11. No
card is added, removed, reordered, or renamed. All commands stay byte-for-byte
V3 commands except Task137B-W's expanded command.

The only new direct transfers are:

| Source | Target | Exact paths changing to transferred |
| --- | --- | --- |
| Task137A | Task137B-W | packages/local-runtime/src/portable-workspace-lifecycle.ts; packages/local-runtime/test/portable-workspace-lifecycle.test.ts |
| Task129-MFA | Task137B-W | packages/local-runtime/src/mounted-artifact-authority-operation.ts; packages/local-runtime/test/mounted-artifact-authority-operation.test.ts |

Task137A keeps its existing transfer of four authority/policy paths to
Task129-MFA. Its transferToIds becomes exactly:

~~~json
["Task129-MFA", "Task137B-W"]
~~~

The V4 checker has one source-specific branch for Task137A. It compares the
four original paths to Task129-MFA and the two lifecycle paths to Task137B-W.
It does not infer target selection from array order or accept any other
multi-target source.

Task129-MFA continues to transfer only to Task137B-W. Its V3 transfers of
contracts.ts, the policy source, and the import-policy test remain; the
mounted authority source and unit test join that finite set.

Task137B-W's prerequisite IDs become exactly:

~~~json
["Task135B", "T120-R", "Task137A", "Task129-MFA"]
~~~

The direct Task137A edge is required even though Task129-MFA depends on it.
Transitive ancestry does not authorize modification of a released lifecycle
path.

## Historical Compatibility

The V4 contract uses task136-release-compatibility.v2. It declares exactly
these two historical records in this order, with no extra tuple. Every listed
historical disposition is owned:

~~~json
[
  {
    "cardId": "Task137A",
    "canonicalJsonSha256": "ac3ac479d5b1e41db4ae15cea88b746f86bbc31f6af3ea74a6120834dc2c2198",
    "pathDispositions": [
      {
        "path": "packages/local-runtime/src/portable-workspace-lifecycle.ts",
        "recordDisposition": "owned"
      },
      {
        "path": "packages/local-runtime/test/portable-workspace-lifecycle.test.ts",
        "recordDisposition": "owned"
      }
    ]
  },
  {
    "cardId": "Task129-MFA",
    "canonicalJsonSha256": "23cb98725d67ada15c0e2913816f82407c171912564423e669cf73995aaead76",
    "pathDispositions": [
      {
        "path": "packages/ontology/src/contracts.ts",
        "recordDisposition": "owned"
      },
      {
        "path": "packages/local-runtime/src/mounted-artifact-authority-operation.ts",
        "recordDisposition": "owned"
      },
      {
        "path": "packages/local-runtime/test/mounted-artifact-authority-operation.test.ts",
        "recordDisposition": "owned"
      },
      {
        "path": "packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts",
        "recordDisposition": "owned"
      },
      {
        "path": "packages/local-runtime/test/support/task137-authority-boundary-policy.ts",
        "recordDisposition": "owned"
      }
    ]
  }
]
~~~

Each canonical hash binds the complete record. Candidate, review, prerequisite,
integration, release-event, blob, or field-order mutation fails closed. For
these seven declarations only, the original record remains owned while the V4
static graph treats the path as transferred. Every undeclared disposition
mismatch fails.

Candidate and integration blobs for source records remain checked against their
historic records. Current-head equality moves only after record 11: source
records skip it for transferred paths, and Task137B-W record 11 must own and
match all fourteen final current-head paths. Append-only evidence stays intact
while current ownership changes only at the release boundary.

## V4 Checker Pins

The V4 contract is an exact V3 copy with only the finite ownership delta in
this design. Its checker constants are fixed before implementation:

| Pin | Exact value |
| --- | --- |
| contract schema | `task136-bounded-assurance.v4` |
| graph version | `task136-release-graph.v4` |
| compatibility version | `task136-release-compatibility.v2` |
| Task137A historical canonical JSON | `ac3ac479d5b1e41db4ae15cea88b746f86bbc31f6af3ea74a6120834dc2c2198` |
| Task129-MFA historical canonical JSON | `23cb98725d67ada15c0e2913816f82407c171912564423e669cf73995aaead76` |
| assurance fingerprint | `31123be5bec8cafed581c23efd5c5fcbea5780f662216e725f90b20eb268d2db` |
| reproducible pretty JSON SHA-256 | `bb02ba569157f9c57205e423040e3eb6e8cc7b2c95ed0ef968fd4c9afefc6e9e` |

The pretty JSON reference is the UTF-8 V4 contract serialized with two-space
indentation and one terminal newline. The runtime checker relies on the
assurance fingerprint rather than a self-hash. It admits only these markers:

```text
TASK136_RELEASE_GRAPH_OK records=29
TASK136_COMPOSITION_CORPUS_OK green=1 red=20
TASK136_COMMAND_CARDS_OK cards=29
TASK136_ABI_CORPUS_OK green=1 red=15
TASK136_REPOSITORY_PREFIX_OK records=11 commands=11
```

The first four appear exactly once in contract mode. The fifth appears exactly
once only after record 11 is committed; repository mode then fails closed with
`repository release closure incomplete: expected 29 records, found 11`.

## Task137B-W Ceiling And Command

Task137B-W owns exactly these fourteen paths in this order:

1. packages/local-runtime/src/portable-workspace-lifecycle.ts
2. packages/local-runtime/test/portable-workspace-lifecycle.test.ts
3. packages/local-runtime/src/mounted-artifact-authority-operation.ts
4. packages/local-runtime/test/mounted-artifact-authority-operation.test.ts
5. packages/local-runtime/src/wake-supervisor-runtime.ts
6. packages/local-runtime/src/mounted-wake-lifecycle-store.ts
7. packages/local-runtime/test/wake-supervisor-runtime.test.ts
8. packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts
9. packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts
10. packages/local-runtime/test/support/task137-authority-boundary-policy.ts
11. packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts
12. packages/ontology/src/contracts.ts
13. packages/ontology/test/resident-wake-contracts.test.ts
14. docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md

The Task137B-W command is exactly:

~~~bash
npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/ontology/test/resident-wake-contracts.test.ts
~~~

It is the exact test-path projection of the fourteen paths, so it covers both
newly transferred tests. The unchanged terminal gate also invokes both
transferred tests before its six stage markers.

## Required Authority Semantics

1. Factory authentication runs before any runtime-handle read, lifecycle
   callback, store construction, ledger read, ledger append, or other I/O.
2. The exported mounted store requires an opaque branded authenticated
   capability. It never accepts a LocalRuntimeHandle, raw ledger, path,
   mounted workspace, callback, or storage constructor.
3. Acquisition captures one normalized finite ISO instant. The only duration
   is a positive five-minute constant, 300000 milliseconds; expiry is that
   instant plus the constant. Invalid, zero, negative, non-finite, or
   over-ceiling duration fails before append.
4. Every consumption checks durable lease expiry against a newly normalized
   instant. Expiry burns authority before provider, tool, artifact, lifecycle,
   or ledger effect. No timer provides authority or grace.
5. A second epoch is blocked while any lease is current and allowed after
   durable expiry. Every first-epoch store, admission, operation, and port is
   permanently stale after expiry or successor acquisition; matching
   revalidation never revives it.
6. Invalidation is monotonic for shutdown, authority loss, admission mismatch,
   capture mismatch, ledger regression, and expiry. There is no fallback store
   or raw-handle route.
7. A successful append returns only after exact durable global and stream
   readback. Forged or expired state produces zero provider, tool, artifact,
   lifecycle, and ledger effects. One workspace has at most one current
   supervisor.

## Failure And Review Model

The V4 checker rejects V1/V2/V3 or first-ten byte drift, any extra
compatibility record/path/source/target, a wrong direct prerequisite, a
Task137A mapping change, an old-record hash mismatch, a missing/non-blob/stale
final owner, a command failure, and a prefix marker emitted before all
evidence.

The implementation tests reject pre-authentication reads/callbacks/I/O,
structural capabilities, zero or malformed leases, concurrent current epochs,
post-expiry effects, stale revival, fabricated readback, and fallback paths.

Two fresh reviewers inspect one exact candidate. The architecture/invariant
reviewer checks factory capture, opaque capability, lease/currentness,
monotonic invalidation, ownership, append-only evidence, and final-head blobs.
The executability/adversarial reviewer reproduces causal RED, focused and
cross-lane GREEN counts, typecheck, terminal markers, exact scope, factory
readiness, and ordered prefix evidence.

## Release Sequence

After dual approval, the coordinator integrates the complete preserved chain
and V4 repair, appends record 11, and verifies:

~~~text
TASK136_REPOSITORY_PREFIX_OK records=11 commands=11
repository release closure incomplete: expected 29 records, found 11
~~~

Only after that checkpoint, append RV-1-E-680. It leaves the original
Recorded at lines untouched and records corrected causal display times of
2026-07-17T03:50:00Z for RV-1-E-678 and 2026-07-17T04:05:00Z for RV-1-E-679.
It is not a release record and cannot alter the 11-record prefix. The next
card is W1-123-H-SHARED-SCHEMA.

Full verification, providers, network, credentials, external services, push,
reset, rebase, Task139, and every neo action remain closed.
