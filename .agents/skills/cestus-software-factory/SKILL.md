---
name: cestus-software-factory
description: Execute one approved Cestus product specification through isolated implementation, automated verification, independent review, and risk-calibrated integration.
---

# Cestus Software Factory

Use this playbook for Cestus implementation, review, and branch finishing. The
authoritative contract is `docs/agentic/software-factory.md`; this skill keeps
the normal path compact.

## Input

Start from one approved executable specification. It must state desired
behavior, observable acceptance examples, allowed scope, relevant context
entry points, risk lane, targeted and integration verification, and genuine
escalation conditions. If any required field is absent, resolve it from direct
user authority or existing product contracts; ask only when the missing choice
would change product scope, safety, irreversible behavior, credentials, data
loss, or an external effect.

## Assemble Bounded Context

Read:

- `AGENTS.md` and `docs/agentic/software-factory.md`;
- the approved specification;
- nested instructions inside the allowed scope;
- the named source, contract, test, and dependency entry points;
- exact verification commands from the specification.

Do not load historical claims, amendments, freezes, registries, acceptance
matrices, old mission selectors, readiness logs, unrelated plans, or unrelated
worktrees into an ordinary worker context.

## Execute The Line

1. Verify the integration branch, configured remote, clean task base, and risk
   lane. Use one isolated task branch or worktree.
2. Reproduce the requested behavior or add the failing test before behavior
   edits. For documentation or behavior-neutral work, record the focused
   validation instead.
3. Implement the smallest complete slice within the allowed paths.
4. Run targeted tests, types, lint, build, or contract checks. Self-correct
   routine failures, with at most two focused repair attempts.
5. Treat the branch diff as the candidate. Obtain one fresh independent agent
   review for yellow work and whenever production code changes. Green
   documentation/tests-only work may skip review unless its specification
   requires one.
6. Repair material findings within the same bound, then rerun affected checks.
7. Put the candidate against the latest integration tip and run the specified
   integration verification once. Compare known baseline debt; do not accept a
   new failure as pre-existing.
8. Integrate qualifying green or yellow work with normal history-preserving Git
   operations, push only the configured remote, and observe CI. Escalate the
   exact exceptional action for red work.

## Risk Lanes

- Green: documentation, tests, mechanical refactors, dependency-neutral
  maintenance, isolated well-tested defects, and behavior-neutral cleanup.
- Yellow: ordinary product/UI/domain behavior, non-destructive APIs,
  reversible internal schema additions, and bounded cross-package changes.
- Red: credentials, secrets, auth or trust boundaries, destructive or
  irreversible migrations, production routes, external effects, PRR sends,
  legal actions, publication/releases, data-loss risk, or a new product/scope
  decision.

Agents may prepare and verify red work, but the exact irreversible or
exceptional action stays human-gated.

## Product Invariants

Preserve append-only product ledger semantics, provenance, replayable
projections, consume-time approval validation, secret safety, human PRR-send
and legal gates, destructive-operation safeguards, fail-closed boundaries, and
no fallback writes. These are product contracts; do not mirror them into a
development lifecycle ledger.

## Verification

Use task-specific commands during implementation. At integration, use the
specification's broader command; the repository default is:

```bash
npm run verify
```

When this skill changes, also run:

```bash
uv run --with pyyaml python /home/drake/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/cestus-software-factory
```

The final handoff names the specification, branch, commit, changed files,
review decision, exact checks and results, known baseline failures, integration
status, and any genuine exception. Git holds execution truth; ordinary work
creates no claim, amendment, registry, or factory lifecycle event.
