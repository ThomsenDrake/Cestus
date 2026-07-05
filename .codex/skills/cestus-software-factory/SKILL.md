---
name: cestus-software-factory
description: Run Cestus development through the repo-local autonomous software-factory workflow. Use for any Cestus brainstorming, spec writing, implementation planning, code changes, review, child-thread dispatch, task claim, verification, or branch finishing work.
---

# Cestus Software Factory

## Overview

Cestus is built by autonomous coding agents using durable repo state. This skill compresses the recurring Cestus factory prompt into one reusable playbook for Codex, Claude Code, Opencode, Factory Droid, and future Cestus-native agents.

Use this skill as the first Cestus-specific context after the agent reads `AGENTS.md`. If another runtime does not auto-discover `.codex/skills`, manually read this file before planning or editing.

## Required Reading

Before editing source, tests, scripts, docs, or factory instructions, read:

1. `AGENTS.md`
2. `docs/agentic/software-factory.md`
3. `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
4. `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
5. The active feature spec and plan for the current slice.
6. Any existing `docs/agentic/claims/*.md` files for the task area.

For design-only or planning-only work, still read `AGENTS.md`, this skill, `docs/agentic/software-factory.md`, and the relevant existing specs/plans.

## Non-Negotiable Invariants

Never weaken these Cestus contracts:

- The ledger is append-only. Corrections, reversals, supersessions, migrations, and review changes are new events.
- Projections are rebuildable from ledger events and must not become hidden sources of truth.
- Assertions, claims, PRR lifecycle state, and investigative conclusions require provenance.
- Accepted graph state must remain traceable to evidence or explicit reasoning events.
- PRR send actions, legal escalation, and irreversible external actions require human approval gates.
- Diagnostics must be structured, inspectable, and secret-safe.
- Local-first solo mode must preserve a path to small newsroom/nonprofit team mode.
- AI-legibility matters: contracts, tests, specs, and handoffs must be readable by generic coding agents.

Stop and escalate on data-loss risk, schema conflict, unavailable dependency, credential need, external-service dependency, verifier failure after two focused repair attempts, or any task that would bypass those invariants.

## Workflow Decision

- Brainstorming or new product behavior: explore context, ask clarifying questions, propose approaches, present a design, and wait for approval before writing files.
- Implementation planning: write a plan with measurable tasks, owned files, exact targeted commands, acceptance criteria, rollback/escalation conditions, and review gates.
- Implementation: run one task at a time through claim, failing test, targeted failure, production change, targeted pass, full verify, commit, and review.
- Review: lead with defects, missing tests, spec drift, invariant violations, and verification gaps. Summaries come after findings.
- Child thread dispatch: include only the current slice, this skill path, active branch, required docs, owned files, exact commands, and stop conditions.

## Task Execution Contract

For each implementation task:

1. Use a task-scoped branch or isolated worktree.
2. Claim one task in `docs/agentic/claims/task-<number>-<short-slug>.md` and commit the claim.
3. Change status to `in-progress` before editing task files.
4. Read every file named by the task.
5. Write the failing test or failing contract first.
6. Run the exact targeted command and record the expected failure.
7. Implement the smallest scoped change.
8. Run the targeted passing command.
9. Run `npm run verify`.
10. Commit only the files in scope plus any recorded claim/readiness evidence.
11. Hand off to spec review, then code-quality review, before starting the next dependent task.

If a task is documentation-only, replace red/green code tests with the relevant validation command, usually `npm run factory:check`, `git diff --check`, and skill validation when a skill changes.

## Standard Commands

Use task-specific commands from the active plan first. Common gates:

```bash
npm run factory:check
npm run verify
```

When this skill changes, also run:

```bash
uv run --with pyyaml python /home/drake/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/cestus-software-factory
```

## Review Contract

Reviewers inspect the diff against the active spec, plan, tests, and Cestus invariants. They should answer:

- Does the change stay within the allowed files and task scope?
- Did a failing test or equivalent validation exist before the fix?
- Do targeted verification and `npm run verify` pass?
- Are append-only, provenance, replayability, send-gate, and escalation-lock semantics preserved?
- Would a fresh generic coding agent understand the resulting contracts, files, and handoff?

Only approve when defects, missing tests, spec drift, and verification gaps are absent or explicitly non-blocking.

## Child Thread Prompt Skeleton

Use this when spawning a new Cestus child thread:

```text
You are in a new Codex worktree thread for Cestus, starting from branch `neo`.

Use the project-local skill `.codex/skills/cestus-software-factory/SKILL.md`.
Follow `AGENTS.md` and `docs/agentic/software-factory.md`.

Task: <one concrete slice>

Required context:
- <active spec>
- <active plan>
- <relevant source/test files>

Operating style:
- Spec first if the design is not approved.
- Plan first if implementation tasks are not approved.
- During implementation, use a task-scoped branch/worktree, durable claims, failing tests first, exact targeted commands, `npm run verify`, commits per task, and review gates.
- Preserve append-only ledger semantics, provenance, projection rebuildability, human-approved send gates, legal escalation locks, and AI-legible contracts.
- Stop on data-loss risk, schema conflict, unavailable dependency, credential need, external-service dependency, or repeated verifier failure.

Begin by reading the required context and reporting the first clarifying question or first task checkpoint.
```

## Factory Principles

Cestus adopts a practical blend of Steipete-style tight context loops and Factory-style mission execution:

- Keep durable instructions in repo files, not one-off chat memory.
- Scope work so a fresh agent can hold the whole task in context.
- Make validation contracts before implementation when possible.
- Use fresh reviewers because implementers are biased toward their own changes.
- Prefer scriptable local commands, logs, and tests over manual claims.
- Record proof artifacts in commits, claim files, specs, plans, or final handoffs.
