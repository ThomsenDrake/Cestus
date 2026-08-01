# Cestus Agent Contract

This repository is built by autonomous coding agents. Treat the approved
product specification, the current Git branch, and verification output as the
durable task state.

## Current Factory Authority

Read these before changing Cestus:

1. The approved executable specification for the product slice.
2. `docs/agentic/software-factory.md`, the sole operating contract for moving
   that specification through implementation, review, and integration.
3. `.agents/skills/cestus-software-factory/SKILL.md`, the concise execution
   playbook.
4. Only the repository instructions and source files relevant to the allowed
   scope in the specification.

The pre-cutover mission selectors, claims, amendments, freezes, registries,
acceptance matrices, readiness logs, and Factory V2 branches are historical
records. They are not task inputs, approval gates, ownership authorities, or
default verification requirements.

An approved Cestus executable specification already carries product and design
authority. Do not add generic brainstorming, design-reapproval,
implementation-plan, program-management, or swarm workflows before executing
it. Use such a workflow only when the specification cannot be completed
without a genuinely new product decision covered by the escalation rules
below. This repository contract takes precedence over generic workflow skills.

## Work Rules

- Start from one approved executable specification. Use
  `docs/agentic/executable-spec-template.md` for new product slices.
- Work in one task-scoped branch or worktree. The branch owns the candidate;
  the diff is the handoff.
- Use one implementation agent and, when required by the risk lane, one fresh
  independent reviewer. Do not create a swarm for an ordinary slice.
- Write a failing test or exact reproduction before product behavior changes.
  Documentation and behavior-neutral maintenance use focused validation.
- Run targeted checks while implementing and broader verification once at the
  integration boundary, unless the specification identifies a higher-risk
  check.
- Make no more than two focused repair attempts before returning an exception
  to the coordinator.
- Green and yellow work already bounded by an approved specification needs no
  further human approval. Escalate only the exact red-lane action or a genuine
  new product, scope, safety, credential, irreversible, data-loss, or external
  behavior decision.

## Product Safety Invariants

Never weaken Cestus's append-only product ledger, evidence provenance,
projection rebuildability, consume-time approval validation, secret safety,
human PRR-send gates, legal escalation locks, destructive-operation
safeguards, fail-closed boundaries, or no-fallback-write behavior.

Development coordination is not part of the product ledger. Ordinary product
work creates no factory claims, amendments, registry entries, or lifecycle
events.
