# Task136 Evidence-Bound Release Closure Design

**Date:** 2026-07-16
**Status:** Coordinator correction pending fresh review
**Authority:** `RV-1-E-570` in
`docs/agentic/resident-agent-full-vision-program-registry.md`

## Purpose

`task136-release-graph.v1` correctly freezes 28 cards, their prerequisites,
owned paths, transfers, and commands. The approved bounded-assurance design
also requires each mutable registry release to bind its card to a candidate,
two exact-revision approvals, integration, prerequisite releases, and owned
blob identities. The current repository checker does not enforce that
requirement: it counts headings only. Twenty-eight placeholder headings would
therefore unlock Task139 without proving any release.

This correction implements the existing evidence requirement with one finite,
machine-readable registry schema. It does not change the 28-card graph,
composition grammar, mutation corpora, commands, runtime behavior, or task
ownership.

## Considered Approaches

### 1. Strict JSON records plus Git verification - selected

Each existing `Task136 dispatch release v4` heading owns one strict JSON block.
The checker parses the blocks, validates exact fields and topology, verifies
commit and blob evidence with Git, and then executes the frozen command cards.
This is deterministic, agent-legible, and does not infer state from prose.

### 2. Continue counting headings - rejected

This is finite but proves no candidate, review, integration, prerequisite, or
blob fact. It contradicts the approved Task136 design.

### 3. Infer releases from historical registry prose - rejected

The registry contains long append-only history with superseded candidates and
reviews. Heuristic prose inference would be ambiguous and would recreate the
open-ended acceptance problem the bounded reset removed.

## Record Contract

The record schema ID is `task136-dispatch-release.v4`. Each record appears
exactly once and in release-graph order:

````markdown
## Task136 dispatch release v4: Task126

```json
{
  "schemaVersion": "task136-dispatch-release.v4",
  "cardId": "Task126",
  "candidateSha": "0123456789abcdef0123456789abcdef01234567",
  "reviews": [
    {
      "threadId": "019f0000-0000-7000-8000-000000000001",
      "candidateSha": "0123456789abcdef0123456789abcdef01234567",
      "verdict": "APPROVED"
    },
    {
      "threadId": "019f0000-0000-7000-8000-000000000002",
      "candidateSha": "0123456789abcdef0123456789abcdef01234567",
      "verdict": "APPROVED"
    }
  ],
  "integrationSha": "89abcdef0123456789abcdef0123456789abcdef",
  "releaseEventId": "task136-release-v4-Task126",
  "prerequisites": [],
  "ownedPathBlobs": [
    {
      "path": "docs/agentic/claims/task-126-resident-full-vision-byok-provider.md",
      "disposition": "owned",
      "blobSha": "fedcba9876543210fedcba9876543210fedcba98"
    }
  ]
}
```
````

Objects are strict plain JSON with exactly the shown keys. Arrays preserve the
static card order. `candidateSha`, `integrationSha`, and `blobSha` are full
40-character lowercase SHA-1 values because this repository uses Git SHA-1.
Review thread IDs are distinct Codex task IDs. Both reviews bind the exact
candidate and use the literal verdict `APPROVED`.

Each prerequisite entry has exactly:

```json
{
  "cardId": "Task126",
  "integrationSha": "89abcdef0123456789abcdef0123456789abcdef",
  "releaseEventId": "task136-release-v4-Task126"
}
```

The prerequisite list must equal the static card's `prerequisiteIds` in order
and copy the already parsed prerequisite record's integration and release
identities exactly.

## Repository Verification

Repository mode performs these stages in order and fails before command
execution when record closure is incomplete:

1. Require a clean checkout and a non-symlinked dependency directory.
2. Parse exactly 28 release headings and their immediately following JSON
   blocks. Reject duplicates, unknown cards, missing blocks, extra keys,
   malformed values, and order drift.
3. Require the parsed card IDs to equal `task136-release-graph.v1` order.
4. Verify each candidate and integration commit exists. Require every
   integration commit to be an ancestor of current `HEAD`.
5. Require each prerequisite integration to be an ancestor of the consumer
   candidate and require the prerequisite record to precede the consumer.
6. Resolve every static owned path at both candidate and integration commits.
   Both Git blob IDs must equal the record. For an `owned` path, current HEAD
   must still equal the record. A `transferred` path is checked at candidate
   and integration only; its target card becomes the current owner.
7. Execute each frozen card command in graph order through `execFileSync`
   argument arrays. The only accepted command grammar is
   `npm test -- <one-or-more repository test paths>` with no shell syntax,
   options, interpolation, or caller-supplied command text.
8. Recheck clean checkout and dependency topology after all commands.

Successful repository mode retains the four existing contract markers and
adds exactly:

```text
TASK136_REPOSITORY_RELEASE_CLOSURE_OK records=28 commands=28
```

The checker never writes release records. It reads the append-only registry,
Git object database, current checkout, and deterministic tests only.

## Release Production

Release records are coordinator-owned evidence, not implementation-worker
self-attestation. Four read-only audit lanes may inspect disjoint graph
families in parallel: provider, mounted-runtime/wake, durable-handoff, and
bounded-loop. Each audit returns candidate, two review task IDs, integration,
prerequisite releases, path blobs, and command evidence or an exact missing
fact. The coordinator appends records only in graph order and only for fully
proven cards.

A present file or passing test alone is insufficient. Missing candidate,
review, integration, ancestry, or blob evidence keeps that card unreleased and
identifies the next implementation task. No record may be synthesized merely
to satisfy the count.

## Safety And Scope

- Append-only ledger, provenance, projection rebuildability, human approval,
  mounted-workspace currentness, and portable-storage invariants are unchanged.
- No provider, credential, external service, portable ontology, or live Nous
  operation is used by this verifier.
- No full verification, push, reset credit, Task139 dispatch, or `neo` action
  is authorized by this design.
- A future schema change requires a new schema ID and coordinator-approved
  contract revision. Reviewers may not expand v4 during candidate review.

## Acceptance

The correction is complete when a causal test proves 28 heading-only records
fail, a strict 28-record fixture passes, every frozen malformed-record category
fails, Git ancestry/blob/transfer checks are exercised, command execution is
argument-array-only, two fresh reviewers approve the exact candidate, and the
candidate integrates into the program branch. Release population begins only
after that integration.
