---
name: cestus-software-factory
description: Run Cestus development through the repo-local autonomous software-factory workflow. Use for any Cestus brainstorming, spec writing, implementation planning, code changes, review, child-thread dispatch, task claim, verification, or branch finishing work.
---

# Cestus Software Factory

## Overview

Cestus is built by autonomous coding agents using durable repo state. This skill compresses the recurring Cestus factory prompt into one reusable playbook for OpenAI Codex, Claude Code, Opencode, and future Cestus-native agents.

Use this skill as the first Cestus-specific context after the agent reads `AGENTS.md`. OpenAI Codex discovers repo-local skills from `.agents/skills`; if another runtime does not auto-discover repo skills, manually read this file before planning or editing.

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

## Operating Lessons

Recent completed Cestus slices exposed a few recurring failure modes. Treat these as standing factory rules:

- Ambiguous git state is a stop-and-audit moment. If a reset, soft reset, staged repair, detached worktree, or missing commit is observed, inspect `git status`, `git log`, and the relevant claim before editing. Preserve intended work with forward commits; do not rewrite history again unless the user explicitly asks.
- Stale reviewers are not passive blockers. If a review has no visible verdict or worktree movement after bounded monitor intervals, close and restart the reviewer or perform an inline review using the Cestus review contract. Do not wait silently.
- Secret safety applies to every structured boundary, not just payload values. Review DTO keys, IDs, command names, no-value flags, raw argv, diagnostics, custom serializers, boxed values, array accessors, prototypes, and provider health objects for leakage or getter-triggered surprises.
- Public package boundaries must be at least as strict as runtime wrappers. Exported builders, DTO projectors, preview builders, provider readiness helpers, and tool gateways need direct negative tests for missing, stale, swapped, forged, or mismatched inputs.
- Event accounting and provenance must bind exact artifacts. Include diagnostic events in returned event IDs, bind imported evidence IDs to reviewed content hashes, and reject stale or swapped source bytes before blob writes.
- Legacy import is artifact bootstrap, not old ontology import. Old-Cestus files, metadata, notes, and graph-like exports enter the new workspace as evidence first; legacy-derived structure can only inform evidence-tied `assertion.proposed` events after explicit staging approval and exact report, candidate-set, evidence, source, and content-hash binding.
- Resident agent work keeps Cestus as orchestrator. There is one resident agent identity; specialist runs are task modes, and OpenAI, xAI, BYOK, local models, subscriptions, harnesses, API keys, and credential refs remain provider backends only.
- Prompt artifacts are the provider boundary. Remote model calls must receive audited prompt text through durable prompt artifact envelopes or typed `inputText`; do not reintroduce hash-to-text resolver callbacks, placeholder prompts, raw prompt logging, or ledger storage of production prompt text.
- Live provider checks are first-class acceptance when provider behavior matters. Use real approved providers for integration confidence, but keep standard deterministic tests credential-free and make live smoke output safe: provider/model IDs, hashes, event IDs, counts, categories, and markers only.
- Approval validity must be rechecked when consumed, not only when appended. Require independent human actor, approval class, exact preview hash, causation/provenance, current locks, current source hashes, and stale-state checks before any runtime resumes a gated effect.
- Tool gateways and execution loops stay separate. Gateways append and validate requests/decisions/results; schedulers and domain services execute after matching approval. Cockpits show review queues and safe explanations, not hidden command launchers.
- UI surfaces are cockpit views over domain/runtime contracts. React should render browser-safe DTOs and safe next commands; workspace validation, ingestion approval gates, legacy staging rules, PRR sends, legal escalation locks, provider byte transfer, accepted graph review, and portable storage truth stay in domain packages and local runtime.
- Secret-safety assertions must match the boundary under test. Do not apply raw low-level secret predicates to whole public DTOs that legitimately contain schema terms such as provider health or auth labels; test actual values, errors, diagnostics, logs, previews, and unsafe material instead.
- Merge dependent cockpit or bridge slices last. Branches that aggregate workspace, ingestion, legacy import, PRR, and runtime status should land after the domain/runtime slices they observe, then run cross-boundary targeted suites before full verification.
- Name compatibility boundaries explicitly. Keep old/provisional parsers, canonical portable parsers, UI DTO adapters, and runtime providers separate and tested; do not alias an older compatibility parser to a newer canonical contract just to make a merge compile.
- Treat shared readiness history as append-only coordination state. When multiple slices append to `docs/agentic/software-factory.md`, preserve all readiness evidence and prefer additive section merges; if the file becomes noisy, move future detailed evidence into per-slice claim/readiness files and keep the factory document as an index.
- Treat `.superpowers/sdd` as scratch execution state. Do not merge transient SDD planning files into durable repo memory unless a human explicitly promotes them into a spec, plan, claim, readiness note, or commit summary.
- Archive or clean up child threads only after their final answer, branch ancestry, clean worktree, and verification evidence agree. Leave newly approved implementation lanes unarchived if they are the next active work.

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
uv run --with pyyaml python /home/drake/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/cestus-software-factory
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

Use the project-local skill `.agents/skills/cestus-software-factory/SKILL.md`.
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

Cestus adopts a practical blend of Steipete-style tight context loops and Factory-style mission execution, but the harness is OpenAI Codex:

- Keep durable instructions in repo files, not one-off chat memory.
- Scope work so a fresh agent can hold the whole task in context.
- Make validation contracts before implementation when possible.
- Use fresh reviewers because implementers are biased toward their own changes.
- Prefer scriptable local commands, logs, and tests over manual claims.
- Record proof artifacts in commits, claim files, specs, plans, or final handoffs.
