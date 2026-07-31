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

- Select the active authority through `docs/agentic/contracts/software-factory-active-mission.v1.json`. Factory readiness hash-authenticates the selector and selected checker, which preserves the integrated calibration predecessor and names the sole active mission source; use the calibration's Level 1, 2, or 3 mechanics together with registry-authenticated ownership, eligibility, milestone, and gate facts from that active source.
- Use a task-scoped branch or worktree.
- Change only files listed by the current task unless a verifier requires a small supporting edit.
- Use a failing test or exact reproduction before behavior edits; Level 1 documentation and behavior-neutral work use focused validation.
- Run the source-mandated targeted validation and the risk-proportionate gates before committing.
- Use atomic commits; permanent RED commits are reserved for the source-defined Level 2 cases.
- Record registry events only for `claimed`, `implementing`, `candidate`, `reviewing`, `approved`, `integrated`, and `released` transitions.
- Do not weaken append-only ledger semantics, provenance requirements, or projection rebuildability.
- Stop child-task execution and escalate to the assigned coordinator on data-loss
  risk, schema conflict, unavailable dependency, or repeated verifier failure.
  Repeated failure is a coordinator recovery checkpoint, not automatically a
  user prompt. The coordinator changes tactics, replaces stale agents, and
  continues within the approved contract; human escalation is reserved for a
  required product, scope, safety, data-loss, credential, or external-behavior
  decision.

## Review Rules

Reviewer agents lead with defects, missing tests, and spec drift. Use one fresh review for Level 2, the source-defined dual-review cases, and the Level 3 fresh scrutiny plus black-box milestone gates. Preserve human PRR-send and legal gates, fail-closed authority, secret safety, and no fallback writes.
