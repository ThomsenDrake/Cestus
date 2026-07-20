# Cestus Software Factory Calibration Implementation Plan

> **For agentic workers:** Use the approved task-scoped workflow and preserve the two-commit history described below.

**Goal:** Establish one compact, machine-validated authority for calibrated Cestus software-factory mission mechanics.

**Architecture:** A versioned JSON source describes the current bounded calibration mission. A dependency-free Node checker validates the source, derives deterministic status, and is called by factory readiness. Instructions remain concise pointers to the source.

**Tech Stack:** JSON, Node.js built-in test runner, Node.js built-in crypto and filesystem modules, Markdown.

## Global Constraints

- The branch starts at `ff62dc7e4524da25606ed9bdbea5efb0b5c778a5` and retains inherited history.
- Only the nine paths authorized for this calibration may change.
- `task136-bounded-assurance-v4.json` is frozen referenced authority and its 29-card graph is never duplicated.
- The contract records `candidate` state after GREEN; no registry event, integration, release, merge, or self-review occurs here.
- Production/checker files remain absent in RED, then appear only in GREEN.

### Task 1: Causal Mission-Contract RED

**Files:**
- Create: `docs/superpowers/specs/2026-07-20-cestus-software-factory-calibration-design.md`
- Create: `docs/superpowers/plans/2026-07-20-cestus-software-factory-calibration-implementation.md`
- Create: `scripts/check-software-factory-mission-state.test.mjs`

- [x] Add a Node test that invokes the intended checker with its canonical JSON source and asserts the derived calibrated mission summary.
- [x] Run `node --test scripts/check-software-factory-mission-state.test.mjs` and confirm its failure is the absent checker/source capability.
- [x] Commit only these RED files with `test(factory): add calibrated mission-state contract red`.

### Task 2: Minimal Mission-Contract GREEN

**Files:**
- Create: `docs/agentic/contracts/software-factory-mission-state.v1.json`
- Create: `scripts/check-software-factory-mission-state.mjs`
- Modify: `AGENTS.md`
- Modify: `.agents/skills/cestus-software-factory/SKILL.md`
- Modify: `docs/agentic/software-factory.md`
- Modify: `scripts/check-agent-readiness.mjs`

- [ ] Add the single source with feature IDs, prerequisites, milestones, ownership, exact allowed paths, candidate status, assertions, commands, baseline SHA, release-evidence references, and calibrated risk rules.
- [ ] Add a deterministic checker and make factory readiness run it.
- [ ] Align the compact instructions with the source without restating active mission facts.
- [ ] Confirm the targeted test passes, then run the skill validator, factory check, full verification, whitespace check, and dependency checks.
- [ ] Commit the minimal GREEN change with `feat(factory): calibrate mission-state authority`.

## Handoff

Run one fresh automated review after GREEN. Report the two commit IDs, exact nine-path scope, all command evidence, any inherited before/after verification differential, and the next lifecycle action: a fresh reviewer may advance candidate work through the canonical process.
