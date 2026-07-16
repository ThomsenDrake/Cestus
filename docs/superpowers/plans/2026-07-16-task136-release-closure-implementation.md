# Task136 Evidence-Bound Release Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` only after an implementation prompt
> explicitly approves it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Task136's heading-count release check with strict registry,
Git, and command evidence before any remaining program task is released.

**Architecture:** A finite JSON parser validates one record per frozen graph
card. A separate repository verifier checks commits, prerequisites, path blobs,
transfers, and frozen command cards without shell evaluation. Coordinator-owned
audit lanes then populate only evidence-complete records in graph order.

**Tech Stack:** Node.js ESM, `node:test`, JSON, Git CLI with argument arrays,
Vitest commands from `task136-release-graph.v1`, Markdown registry records.

## Global Constraints

- Governing design:
  `docs/superpowers/specs/2026-07-16-task136-release-closure-design.md`.
- Preserve all Cestus invariants and the existing 28-card graph/corpora.
- Never infer a release from file presence, a passing command, or historical
  prose alone.
- Never evaluate registry or contract text as code.
- Never merge or push to `neo` without explicit user authorization.
- Implementation prompts must explicitly approve task-scoped
  `superpowers:subagent-driven-development` when relevant.

## Ownership

| Task | Sole writer | Files |
| --- | --- | --- |
| 1 | Verifier implementer | `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`; `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`; `docs/agentic/claims/task-136-release-closure-verifier.md` |
| 2 | Coordinator | Append-only `docs/agentic/resident-agent-full-vision-program-registry.md` only |
| 3A | Read-only auditors | No files |
| 3B | Coordinator | Append-only `docs/agentic/resident-agent-full-vision-program-registry.md` only |

### Task 1: Implement Strict Release Closure

**Branch:** `codex/task136-release-closure-verifier`

**Files:**
- Modify: `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`
- Modify: `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`
- Create: `docs/agentic/claims/task-136-release-closure-verifier.md`

**Interfaces:**
- Consumes: `task136-release-graph.v1` and registry schema
  `task136-dispatch-release.v4`.
- Produces: strict release parser, Git evidence verifier, frozen command runner,
  and marker
  `TASK136_REPOSITORY_RELEASE_CLOSURE_OK records=28 commands=28`.

- [ ] **Step 1: Claim the three paths**

Record exact program base, design/plan SHAs, explicit implementation approval,
and the unchanged 28-card contract hash in the claim.

- [ ] **Step 2: Add the causal RED test**

Add a test that supplies exactly 28 valid-looking headings with no JSON blocks
and asserts repository record parsing fails with:

```text
release record JSON missing for Task126
```

Add a strict valid-record fixture and one mutation for each frozen category:
unknown key, missing key, duplicate card, card order, bad SHA, duplicate review,
review candidate mismatch, non-APPROVED verdict, prerequisite ID mismatch,
prerequisite release mismatch, missing path, disposition mismatch, blob
mismatch, integration not ancestral, prerequisite not ancestral, dirty checkout,
dependency symlink, unsafe command, and command failure.

- [ ] **Step 3: Run RED**

```bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
```

Expected: the heading-only test fails because current repository mode accepts
the count without requiring JSON evidence.

- [ ] **Step 4: Implement the strict parser and verifier**

Use `JSON.parse`, exact own-key arrays, full SHA checks, and
`execFileSync("git", args)` / `execFileSync("npm", args)` only. Export pure
record parsing for fixtures and keep real Git/command execution in the
repository adapter. Reject before running commands until all 28 records pass
structural and Git evidence checks.

- [ ] **Step 5: Run identical GREEN**

```bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
```

Expected: all prior four tests plus the finite release-record suite pass.

- [ ] **Step 6: Run candidate verification**

```bash
node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode contract
if repository_output="$(node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode repository 2>&1)"; then
  echo "repository mode unexpectedly passed before release population" >&2
  exit 1
fi
printf '%s\n' "$repository_output" | grep -F \
  'repository release closure incomplete: expected 28 records, found 0'
git diff --check
npm run factory:check
npm run verify
test -z "$(git status --porcelain --untracked-files=no)"
test ! -L node_modules
```

Contract mode must emit the unchanged 28/1/20/28/1/15 markers. The explicit
repository-mode command must exit nonzero with the exact zero-record closure
message until coordinator-owned release records exist.

- [ ] **Step 7: Commit and stop for coordinator admission**

```bash
git add scripts/resident-agent/assurance/task136-bounded-assurance.mjs \
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs \
  docs/agentic/claims/task-136-release-closure-verifier.md
git commit -m "test: bind task136 release closure evidence"
```

Report exact SHA, changed paths, RED/GREEN evidence, marker output, full verify,
and expected repository-mode failure. Do not review, integrate, push, populate
records, dispatch Task139, or touch `neo`.

### Task 2: Review And Integrate The Verifier

**Owner:** Coordinator; reviewers are read-only.

- [ ] **Step 1: Coordinator admission**

Bind exact candidate SHA and three-path scope. Rerun Task 1 Step 6 and verify
repository mode rejects the current heading-free registry before any command
card executes.

- [ ] **Step 2: Two fresh exact-revision reviews**

Architecture reviewer verifies evidence binding, topology, transfer semantics,
and absence of prose inference. Executability reviewer verifies strict JSON,
all frozen mutations, argument-array commands, time bounds, markers, and exact
failure ordering. Review work does not authorize subagent-driven development.

- [ ] **Step 3: Integrate into the program branch**

After two unqualified approvals, cherry-pick the exact verifier candidate,
rerun admission, append candidate/reviewer/integration evidence, and commit.
Do not merge or push to `neo`.

### Task 3: Audit And Populate Releases

**Owner:** Read-only auditors produce handoffs; the coordinator alone appends
and commits registry records.

- [ ] **Step 1: Dispatch four parallel evidence audits**

Audit the provider, mounted-runtime/wake, durable-handoff, and bounded-loop
families. Each auditor returns one row per assigned card with exact candidate,
two review tasks, integration, prerequisites, blobs, command result, and either
`PROVEN` or one finite missing fact. Auditors do not write registry records.

- [ ] **Step 2: Append proven records in graph order**

For each `PROVEN` card, independently verify the audit row, rerun its frozen
command, calculate Git blob IDs, append one strict v4 record, and commit the
registry. Stop at the first unreleased prerequisite on each dependency chain.

- [ ] **Step 3: Run repository mode**

```bash
node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode repository
```

If fewer than 28 cards are proven, record exact missing cards and dispatch only
the earliest dependency-ready implementation tasks under their existing
approved plans. If all 28 pass, record the closure marker and resume Task139 or
the next graph successor named by the program registry.

## Review And Stop Conditions

- A malformed record, missing historical review, ambiguous candidate,
  non-ancestral integration, changed owned blob, unavailable dependency,
  verifier failure after two focused repairs, or schema conflict stops that
  card and returns it to the coordinator.
- No auditor or implementer may self-release a card.
- No external service, provider credential, portable ontology mutation, push,
  or `neo` action is authorized by this plan.
