# Cestus Agent Contract

Treat the approved product specification, current Git branch, and verification
output as durable task state.

## Current Factory Authority

Read, in order:

1. the approved executable specification;
2. `docs/agentic/software-factory.md`;
3. `.agents/skills/cestus-software-factory/SKILL.md`;
4. only instructions and source relevant to the allowed scope.

The approved Cestus specification is product and design authority.
`$sol-advisor:orchestration` is the preferred coordinator and role router; it
does not create extra Cestus plans, missions, claims, registries, amendments,
or lifecycle records. Factory V1/V2 material is history only, not task input,
approval, ownership authority, or a default verification requirement.

## Role Routing

- Primary Sol / High owns architecture interpretation, primary verification,
  acceptance, and integration decisions.
- Terra / High is the sole native implementation lane.
- A fresh Sol verdict replaces generic independent-review flow at a
  commitment boundary: red work, consequential architecture, migration,
  public API, or genuinely wide change.
- Luna task lane is never used unless explicitly requested.

## Work Rules

- Start from one approved executable specification; use
  `docs/agentic/executable-spec-template.md` for a new slice.
- Use one task-scoped branch or worktree. The diff is the candidate and Git
  history is the archive.
- Reproduce or write a failing test before product behavior changes;
  documentation and behavior-neutral maintenance use focused validation.
- Preserve green, yellow, and red risk lanes. Run targeted checks during work
  and integration verification once at the integration boundary.
- At most two focused repair attempts address failed checks or findings. A
  correction receives any fresh Sol verdict required by its boundary without
  expanding that implementation-repair maximum.
- Green and yellow work bounded by the specification needs no further human
  approval. Escalate only a red action or a genuine new product, scope,
  safety, credential, irreversible, data-loss, or external-behavior decision.
- Report only commits, changed files, check results, review findings,
  integration status, or genuine exceptions; do not report polling, waiting,
  unchanged state, heartbeats, or command-by-command activity.

## Product Safety Invariants

Never weaken Cestus's append-only product ledger, evidence provenance,
projection rebuildability, consume-time approval validation, secret safety,
human PRR-send gates, legal escalation locks, destructive-operation
safeguards, fail-closed boundaries, or no-fallback-write behavior.

Development coordination is not part of the product ledger. Ordinary product
work creates no factory claims, amendments, registry entries, or lifecycle
events.
