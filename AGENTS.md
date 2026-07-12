# Cestus Agent Contract

This repository is designed for autonomous AI coding agents. Treat repo files as durable shared state.

## Project Skill

Use the project-local Codex skill at `.agents/skills/cestus-software-factory/SKILL.md` for Cestus brainstorming, planning, implementation, review, child-thread dispatch, and branch finishing work. Codex discovers repo skills from `.agents/skills`; agents that do not auto-discover project skills must read that file manually before planning or editing.

## Required Reading

Before editing, read:

1. `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
2. `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
3. `docs/agentic/software-factory.md`

## Work Rules

- Use a task-scoped branch or worktree.
- Change only files listed by the current task unless a verifier requires a small supporting edit.
- Write failing tests before production code.
- Run the exact targeted command in the task.
- Run `npm run verify` before committing.
- Commit after each completed task.
- Do not weaken append-only ledger semantics, provenance requirements, or projection rebuildability.
- Stop child-task execution and escalate to the assigned coordinator on data-loss
  risk, schema conflict, unavailable dependency, or repeated verifier failure.
  Repeated failure is a coordinator recovery checkpoint, not automatically a
  user prompt. The coordinator changes tactics, replaces stale agents, and
  continues within the approved contract; human escalation is reserved for a
  required product, scope, safety, data-loss, credential, or external-behavior
  decision.

## Review Rules

Reviewer agents lead with defects, missing tests, and spec drift. A change is complete only when the tests, typecheck, and factory readiness check pass.
