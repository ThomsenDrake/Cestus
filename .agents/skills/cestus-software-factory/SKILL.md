---
name: cestus-software-factory
description: Execute one approved Cestus specification through bounded implementation, verification, commitment-boundary review, and integration.
---

# Cestus Software Factory

The authoritative contract is `docs/agentic/software-factory.md`. This compact
playbook applies it without adding a process layer.

## Input

Start from one approved executable specification. It states desired behavior,
observable acceptance examples, allowed scope, relevant entry points, risk
lane, targeted and integration verification, and genuine escalation conditions.
Resolve a missing field from direct user authority or current product contracts;
ask only when the choice changes product scope, safety, credentials, data loss,
irreversible behavior, or an external effect.

The specification already has product and design authority. Do not add generic
brainstorming, design reapproval, implementation planning, program management,
or a swarm unless escalation requires a new product decision.

## Assemble Bounded Context

Read only:

- `AGENTS.md`, the factory contract, and this skill;
- the approved specification;
- instructions inside its allowed scope;
- named source, contracts, nearby tests, and dependencies; and
- the exact verification commands, base commit, and candidate diff.

Do not load historical factory artifacts, retired plans, or unrelated worktrees
without a concrete dependency. Git history is the archive.

## Execute The Line

1. Confirm the integration branch, remote, isolated task branch, base, and risk
   lane. Do not inspect unrelated parked worktrees.
2. Before product behavior changes, write a failing test or exact reproduction.
   Documentation and behavior-neutral maintenance record focused validation.
3. Terra / High is the sole native implementation lane. Change only allowed
   files, run focused checks, and present the diff with evidence.
4. Use at most two focused repair attempts for concrete failed checks or
   findings. A correction can get the fresh Sol verdict its boundary requires
   without increasing that two-focused-repair maximum.
5. `$sol-advisor:orchestration` is the preferred coordinator and role router.
   Primary Sol / High owns architecture interpretation, primary verification,
   acceptance, and integration. Luna task lane is never used unless explicitly
   requested.
6. A fresh Sol verdict replaces generic independent review only at a commitment
   boundary: red work, consequential architecture, migration, public API, or
   genuinely wide change.
7. At integration, primary Sol / High runs the specification's broad
   verification once against the latest integration tip, compares any baseline,
   and integrates qualifying green/yellow work with normal Git history. Do not
   push, merge, or observe CI unless the approved specification authorizes it.

## Risk Lanes

- Green: documentation, tests, mechanical refactors, dependency-neutral
  maintenance, isolated well-tested defects, and behavior-neutral cleanup.
- Yellow: ordinary product/UI/domain behavior, non-destructive APIs,
  reversible internal schema additions, and bounded cross-package changes.
- Red: credentials, secrets, trust boundaries, destructive or irreversible
  migrations, production routes, external effects, PRR sends, legal actions,
  publication/releases, data-loss risk, or a new product/scope decision.

Red actions stay human-gated. Green and yellow work bounded by a specification
needs no further human approval.

## Product Invariants

Preserve append-only ledger semantics, provenance, rebuildable projections,
consume-time approval validation, secret safety, human PRR-send and legal
gates, destructive-operation safeguards, fail-closed boundaries, and no
fallback writes. Never turn development coordination into a product ledger.

## Verification And Reporting

Run task-specific focused checks during implementation. At integration, use the
specification's broader command; the repository default is:

```bash
npm run verify
```

When this skill changes, run:

```bash
uv run --with pyyaml python /home/drake/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/cestus-software-factory
```

Report only commits, changed files, check results, fresh Sol verdict findings,
integration status, or genuine exceptions. Create no Cestus plans, missions,
claims, registries, amendments, or lifecycle records; do not report polling,
waiting, unchanged state, heartbeats, retries, or individual commands.
