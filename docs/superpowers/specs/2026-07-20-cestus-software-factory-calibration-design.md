# Cestus Software Factory Calibration Design

Date: 2026-07-20

## Decision

Replace the factory's default high-assurance routine with a calibrated three-level operating model. The active mechanics, ownership, eligibility, and release evidence live only in `docs/agentic/contracts/software-factory-mission-state.v1.json`. Human-facing instructions link to that source rather than restating live card facts.

## Authority And Scope

The mission source references `task136-bounded-assurance-v4.json` by path, card count, and digest as frozen authority. It does not copy, migrate, or extend that graph. The calibration is limited to its nine owned files and cannot alter product behavior, program registry records, release graphs, compatibility records, or paused work.

## Operating Levels

Level 1 is for low-risk interactive documentation, mechanical cleanup, and bounded behavior-neutral refactors. It uses concise scope, relevant inspection, focused validation, atomic commits, and one fresh automated review only when production code changes.

Level 2 is for normal bounded features and bug fixes. It uses one owner, compact durable status, test or exact reproduction before behavior edits, focused cross-boundary gates, atomic commits, one fresh review, and milestone integration. The source enumerates the cases that require dual review and the narrow cases that justify a permanent RED commit.

Level 3 is for mission and assurance work. It requires a collaborative plan, finite behavioral contract, meaningful milestones, fresh bounded workers, externalized shared state, fresh scrutiny, black-box running-flow validation, targeted fixes, and full, live, and release gates at milestones and releases.

The source also defines the sole registry lifecycle, proportional validation, one coordinator layer, calibrated worktree/model rules, and the invariant gates for append-only provenance, rebuildable projections, human approvals, legal controls, fail-closed authority, secret safety, and no fallback writes.

## Machine Validation

`scripts/check-software-factory-mission-state.mjs` reads only the mission source and reports deterministic feature order, prerequisite eligibility, ownership conflicts, milestone coverage, counts, a SHA-256 fingerprint, and a compact status summary. It also confirms the frozen V4 reference has not changed. `scripts/check-agent-readiness.mjs` invokes it as part of factory readiness.

## Acceptance

The targeted Node test proves the contract, summary, ordering, eligibility, ownership rejection, and Level 3 validator requirements. The factory and full verification gates remain required before handoff. The machine state remains `candidate` after the GREEN commit so a fresh reviewer and the assigned coordinator retain the next lifecycle action.
