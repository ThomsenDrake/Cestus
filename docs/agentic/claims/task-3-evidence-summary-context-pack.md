# Task 3: Evidence Summary Context Pack

- Plan: `.superpowers/sdd/task-3-brief.md`
- Task: `Task 3: Evidence Summary Builder`
- Worker: Codex
- Branch: `codex/investigative-context-packs-design`
- Worktree: `/home/drake/.codex/worktrees/18b9/Cestus`
- Claimed at: `2026-07-10T00:00:00Z`
- Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-3-evidence-summary-context-pack.md`
- `packages/agent/src/investigative-context-packs.ts`
- `packages/agent/test/investigative-context-packs.test.ts`

## Scope

Implement only the provider-safe `buildEvidenceSummaryContextPack` and its strict payload parser. Do not implement accepted graph, governance locks, registration, package exports, or readiness evidence.

## Review Fixes

- Bound injected policy, ontology-core, and pack-version metadata into canonical payload bytes and ref provenance.
- Reject rows whose ingestion event is absent from the selected evidence ref provenance.
- Strictly validate complete evidence-summary v1 payload structure, including nested rows, manifests, omissions, staleness inputs, and fixed-shape records.
- Canonicalize manifest, item, omission, sample, staleness, and provenance ordering before resolved-pack hashing.
- Trim optional parse and removed-governance detail into bounded `budget-row-omitted` aggregates before failing mandatory-over-budget payloads.
- Canonicalize occurrence IDs, parse jobs, and governance tags before hashing and optional-detail trimming so reader ordering cannot alter payload hashes or omission samples.
