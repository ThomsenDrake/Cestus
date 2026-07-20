# Cestus Software Factory Calibration Implementation Plan

> **For agentic workers:** Use the approved task-scoped workflow and preserve the two-commit history described below.

**Goal:** Establish one compact, machine-validated authority for calibrated Cestus software-factory mission mechanics.

**Architecture:** A versioned JSON source describes the current bounded calibration mission. A dependency-free Node checker validates the source, derives deterministic status, and is called by factory readiness. Instructions remain concise pointers to the source.

**Tech Stack:** JSON, Node.js built-in test runner, Node.js built-in crypto and filesystem modules, Markdown.

## Global Constraints

- The branch starts at `ff62dc7e4524da25606ed9bdbea5efb0b5c778a5` and retains inherited history.
- Only the nine paths authorized for this calibration may change.
- `task136-bounded-assurance-v4.json` is frozen referenced authority and its 29-card graph is never duplicated.
- The contract records `candidate` state and a null accepted-integration SHA after GREEN; no registry event, integration, release, merge, or self-review occurs here.
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

- [x] Add the single source with feature IDs, prerequisites, milestones, ownership, exact allowed paths, candidate status, assertions, commands, integration state, release-evidence references, and calibrated risk rules.
- [x] Add a deterministic checker and make factory readiness run it.
- [x] Align the compact instructions with the source without restating active mission facts.
- [x] Confirm the targeted test passes, then run the skill validator, factory check, full verification, whitespace check, and dependency checks.
- [x] Commit the minimal GREEN change with `feat(factory): calibrate mission-state authority`.

## Handoff

Run one fresh automated review after GREEN. Report the two commit IDs, exact nine-path scope, all command evidence, any inherited before/after verification differential, and the next lifecycle action: a fresh reviewer may advance candidate work through the canonical process.

## Recovery Checkpoint: Executability Admission

The committed `f90f5698ee5018788e44447c051e854acdef286e` checker accepted a syntactically valid but nonexistent integration SHA, tolerated weakened risk and milestone rules, and did not prove milestone membership in both directions. These are fail-open authority defects in the calibration contract, not product decisions. The recovery preserves the original base, RED, and GREEN commits and uses one additional RED/GREEN pair.

### Recovery RED

- [x] Add counterfactual tests for unresolved integration commits, exact risk-level policy, SFC-M1 validation, bidirectional milestone membership, and frozen V4 unfinished-card precedence.
- [x] Confirm the original four tests pass while the added counterfactuals fail against `f90f5698`.
- [x] Commit the tests and this checkpoint before changing the checker, source, or operating instructions.

### Recovery GREEN

- [x] Resolve integration SHAs as Git commit objects and require the exact calibrated policy schema.
- [x] Enforce SFC-M1's Level 2 architecture/executability pair and bidirectional membership.
- [x] Pin frozen V4 precedence for unfinished cards and remove unqualified legacy Level 1 mandates from current instructions.
- [ ] Run the required committed-byte gates and record the inherited record-25 verification differential.

## Recovery Checkpoint: Immutable Calibration Envelope

The committed `7dd0b00d7ca7438c1f9b6d4155cec15b42cab349` checker validates selected schema rules but does not seal the remaining approved calibration interface. Counterfactual fixtures can therefore weaken invariants, registry policy, topology, scope, feature risk, or prerequisites while still satisfying the local structural checks. The recovery adds one source-derived immutable-envelope fingerprint after normalizing only lifecycle status and accepted-integration SHA fields, so normal lifecycle transitions remain valid while the frozen calibration facts fail closed.

### Recovery RED

- [x] Add bounded counterfactuals for invariant, registry-policy, topology, scope, risk, and prerequisite weakening, plus a reachable-commit lifecycle-positive case.
- [x] Confirm the original thirteen tests pass, the lifecycle-positive case passes, and the six new weakening counterfactuals fail before checker changes.
- [x] Commit this test-only checkpoint before changing the checker.

### Recovery GREEN

- [ ] Compare the source-derived immutable normalized-envelope fingerprint in the checker without duplicating calibration facts.
- [ ] Run the required committed-byte gates and record the inherited record-25 verification differential.
