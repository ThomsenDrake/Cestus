# Task136/Task137 Bounded Assurance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` when the coordinator explicitly
> approves it for the assigned implementation task. Review and design work do
> not authorize subagent-driven development. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Replace the open-ended Task136/Task137 recovery loop with finite,
versioned assurance contracts, deterministic gates, and two exact-revision
reviews per candidate.

**Architecture:** One Task136 lane owns its bounded graph/corpus contract and
checker. A separate Task137 policy lane replaces the general value-flow test
with a coarse production policy and finite import grammar. A third lane owns a
committed terminal-gate script and its control-flow regression. The lanes have
no overlapping writers and integrate into the program branch only after two
unqualified reviews each.

**Tech Stack:** TypeScript 5.9 compiler API, Node.js 26 ESM and test runner,
Bash, Vitest, JSON, Markdown, Git.

## Global Constraints

- Governing design:
  `docs/superpowers/specs/2026-07-16-task136-task137-bounded-assurance-design.md`.
- Mutable recovery lineage lives only in
  `docs/agentic/resident-agent-full-vision-program-registry.md`.
- Contract versions are exactly
  `task136-composition-grammar.v1`,
  `task136-composition-corpus.v1`, `task136-release-graph.v1`,
  `task137-authority-import-grammar.v1`,
  `task137-authority-import-corpus.v1`, and
  `task137-terminal-gate.v2`.
- No task may merge, push, run `npm run verify`, use external services, use
  credentials, resume Task139, or touch `neo`.
- Implementation prompts must say: "Task-scoped use of
  `superpowers:subagent-driven-development` is explicitly APPROVED when
  relevant, with one production writer."
- Review prompts must say: "Subagent-driven development is not authorized for
  this read-only review."
- Reviewers may block only an in-grammar failure or an ineffective explicit
  prohibition. Other findings are proposed hardening for a later contract
  version.
- Existing candidate branches
  `4776f12689133b0eea855e6c39347306bebd68bc`,
  `cfb82c6dd940ae6ba0339b8b2b8637bcc472aea2`, and
  `5701c863210f1892186e944beda8a4059388b26c` remain preserved evidence and are
  not accepted integration bases. Lane B reconstructs the exact six-path tree
  state from `cfb82c6d...` onto the current program branch before applying the
  bounded policy; no historical recovery commit is merged directly.

## Parallel Topology

After this plan is dual-approved, start these lanes together:

```text
Lane A: Task 1 -> Task 2 -> Task 6 review/integration
Lane B: Task 3 -> Task 7 review/integration
Lane C: Task 4 -> Task 5 review/integration
```

Lane A is internally sequential because its checker consumes its contract.
Lanes B and C are independent. Only the coordinator edits the program registry
during integration. Task139 stays blocked until Tasks 5, 6, and 7 are all
integrated and their release records are valid.

## File Ownership

| Task | Sole owned files |
| --- | --- |
| 1 | `docs/agentic/contracts/task136-bounded-assurance-v1.json`; `docs/agentic/claims/task-136-interface-reconciliation.md`; `docs/superpowers/plans/2026-07-12-resident-agent-bounded-loop-implementation.md`; `docs/superpowers/plans/2026-07-12-resident-agent-provider-credentials-implementation.md` |
| 2 | `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`; `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` |
| 3 | `packages/local-runtime/test/support/task137-authority-boundary-policy.ts`; `docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md`; `packages/local-runtime/src/mounted-artifact-authority-operation.ts`; `packages/local-runtime/src/portable-workspace-lifecycle.ts`; `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`; `packages/local-runtime/test/mounted-artifact-authority-operation.test.ts`; `packages/local-runtime/test/portable-workspace-lifecycle.test.ts` |
| 4 | `scripts/resident-agent/assurance/task137-terminal-gate.sh`; `scripts/resident-agent/assurance/task137-terminal-gate.test.mjs`; `docs/agentic/claims/task-137-terminal-gate-v2.md`; `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md` |
| 5-7 | Coordinator-only append to `docs/agentic/resident-agent-full-vision-program-registry.md`; no reviewer writes |

---

### Task 1: Normalize Task136 Authority And Freeze The V1 Contract

**Branch:** `codex/task136-bounded-assurance-v1`

**Files:**
- Create: `docs/agentic/contracts/task136-bounded-assurance-v1.json`
- Modify: `docs/agentic/claims/task-136-interface-reconciliation.md`
- Modify: `docs/superpowers/plans/2026-07-12-resident-agent-bounded-loop-implementation.md`
- Modify: `docs/superpowers/plans/2026-07-12-resident-agent-provider-credentials-implementation.md`

**Interfaces:**
- Consumes: registry authority `RV-1-E-545` and the 28 active-v4 card
  definitions preserved at candidate `4776f12689133b0eea855e6c39347306bebd68bc`.
- Produces: `Task136BoundedAssuranceContractV1`, the sole static input to Task
  2's checker.

- [ ] **Step 1: Create the task claim and record in-progress state**

Append a bounded-v1 section to the existing Task136 claim. It must name this
plan, branch, four owned files, `RV-1-E-545`, and status `in-progress`. It must
not copy a recovery number, rejected SHA, or reviewer session.

- [ ] **Step 2: Run the causal RED contract command**

Run this exact command before creating the JSON contract or bounded plan
sections:

```bash
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const contractPath = "docs/agentic/contracts/task136-bounded-assurance-v1.json";
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const ids = contract.releaseGraph.cards.map((card) => card.id);
const expected = [
  "Task126","Task127","Task128","Task129","Task130","Task135D","Task137A",
  "Task135B","T120-R","Task137B-W","W1-123-H-SHARED-SCHEMA",
  "W1-133.5-PREAPPROVAL-PROMPT-STORE","CF1-HR","Task126-R","Task133",
  "Task139-P1","Task139-PM","Task136-FC-Core","Task139-P2",
  "Task136-FC-Ports","G136-SC","G136-R","C136-P","Task121","Task122",
  "W1-123-BOOTSTRAP-HANDOFF","Task138-H","Task136"
];
if (contract.schemaVersion !== "task136-bounded-assurance.v1") throw new Error("schema version");
if (contract.releaseGraph.version !== "task136-release-graph.v1") throw new Error("graph version");
if (JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error("card order");
if (contract.compositionGrammar.version !== "task136-composition-grammar.v1") throw new Error("grammar version");
if (contract.compositionCorpus.version !== "task136-composition-corpus.v1") throw new Error("corpus version");
if (contract.compositionCorpus.accepted.length !== 1 || contract.compositionCorpus.rejected.length !== 20) throw new Error("corpus count");
for (const path of [
  "docs/agentic/claims/task-136-interface-reconciliation.md",
  "docs/superpowers/plans/2026-07-12-resident-agent-bounded-loop-implementation.md",
  "docs/superpowers/plans/2026-07-12-resident-agent-provider-credentials-implementation.md"
]) {
  const text = readFileSync(path, "utf8");
  const marker = "<!-- TASK136-BOUNDED-ASSURANCE-V1-BEGIN -->";
  const start = text.lastIndexOf(marker);
  if (start < 0) throw new Error(`missing bounded marker: ${path}`);
  const active = text.slice(start);
  if (/Recovery-[0-9]+|019f[0-9a-f-]{20,}|rejected candidate/i.test(active)) throw new Error(`mutable lineage copied: ${path}`);
  if (!active.includes("docs/agentic/resident-agent-full-vision-program-registry.md") || !active.includes("RV-1-E-545")) throw new Error(`authority pointer: ${path}`);
}
console.log("TASK136_CONTRACT_OK cards=28 green=1 red=20");
NODE
```

Expected RED: nonzero exit with `ENOENT` for
`task136-bounded-assurance-v1.json`.

- [ ] **Step 3: Create the frozen contract**

Create strict JSON with this top-level shape:

```ts
interface Task136BoundedAssuranceContractV1 {
  readonly schemaVersion: "task136-bounded-assurance.v1";
  readonly authority: {
    readonly registryPath: "docs/agentic/resident-agent-full-vision-program-registry.md";
    readonly resetEvent: "RV-1-E-545";
  };
  readonly releaseGraph: {
    readonly version: "task136-release-graph.v1";
    readonly cards: readonly Task136ReleaseCardV1[];
  };
  readonly compositionGrammar: {
    readonly version: "task136-composition-grammar.v1";
    readonly templates: readonly ["types","factory","adapter","registry","composition"];
  };
  readonly compositionCorpus: {
    readonly version: "task136-composition-corpus.v1";
    readonly accepted: readonly [Task136MutationCaseV1];
    readonly rejected: readonly Task136MutationCaseV1[];
  };
}
```

Copy the exact 28 card IDs, dependency order, owned/transferred paths, and
literal commands from the active-v4 checker at `4776f126...`; do not copy its
mutable lineage prose. Freeze exactly the 20 rejected category IDs from the
design in design order, using lowercase kebab-case IDs.

- [ ] **Step 4: Append stable bounded sections**

In the claim and both plans, append
`<!-- TASK136-BOUNDED-ASSURANCE-V1-BEGIN -->`. State that the registry is the
lineage authority, name the three contract versions, point to the JSON file,
and replace executable Markdown bodies with these commands:

```bash
node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode contract
node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode repository
```

Historical sections remain unchanged and explicitly non-dispatchable.

- [ ] **Step 5: Run the identical GREEN command**

Run the exact Step 2 command. Expected output:

```text
TASK136_CONTRACT_OK cards=28 green=1 red=20
```

- [ ] **Step 6: Verify and commit**

```bash
git diff --check
npm run factory:check
git add docs/agentic/contracts/task136-bounded-assurance-v1.json \
  docs/agentic/claims/task-136-interface-reconciliation.md \
  docs/superpowers/plans/2026-07-12-resident-agent-bounded-loop-implementation.md \
  docs/superpowers/plans/2026-07-12-resident-agent-provider-credentials-implementation.md
git commit -m "docs: freeze task136 bounded assurance contract"
```

### Task 2: Implement The Finite Task136 Checker

**Branch:** Continue `codex/task136-bounded-assurance-v1` after Task 1.

**Files:**
- Create: `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`
- Create: `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`

**Interfaces:**
- Consumes: `Task136BoundedAssuranceContractV1` from Task 1.
- Produces: `loadContract`, `verifyStaticGraph`, `runCompositionCorpus`,
  `verifyCommandCards`, `runAbiCorpus`, and the four required markers.

- [ ] **Step 1: Write the failing Node tests**

The test file imports the six interfaces above and has four tests:

```js
test("verifies the 28-card topological graph and exact commands", ...);
test("accepts one generated composition and rejects the frozen 20 mutations", ...);
test("reports exactly 28 command cards", ...);
test("accepts one ABI fixture and rejects the frozen 15 ABI mutations", ...);
```

Each mutation changes one manifest fact. Tests assert the exact category ID and
never inject arbitrary TypeScript source.

- [ ] **Step 2: Run the causal RED command**

```bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
```

Expected RED: `ERR_MODULE_NOT_FOUND` for
`task136-bounded-assurance.mjs`.

- [ ] **Step 3: Implement the checker**

Use `JSON.parse`, explicit own-property/type checks, Kahn topological
validation, `execFileSync` with argument arrays, and a fixed template map. No
`eval`, `Function`, shell interpolation, arbitrary source template, or dynamic
module loading is permitted. `--mode contract` validates static data;
`--mode repository` additionally reads registry release records and fails
closed when the required release closure is incomplete.

Successful contract mode emits exactly:

```text
TASK136_RELEASE_GRAPH_OK records=28
TASK136_COMPOSITION_CORPUS_OK green=1 red=20
TASK136_COMMAND_CARDS_OK cards=28
TASK136_ABI_CORPUS_OK green=1 red=15
```

- [ ] **Step 4: Run the identical GREEN command**

```bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
```

Expected: four passing tests.

- [ ] **Step 5: Run the candidate command**

```bash
output="$(node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode contract)"
test "$(printf '%s\n' "$output" | grep -c '^TASK136_RELEASE_GRAPH_OK records=28$')" -eq 1
test "$(printf '%s\n' "$output" | grep -c '^TASK136_COMPOSITION_CORPUS_OK green=1 red=20$')" -eq 1
test "$(printf '%s\n' "$output" | grep -c '^TASK136_COMMAND_CARDS_OK cards=28$')" -eq 1
test "$(printf '%s\n' "$output" | grep -c '^TASK136_ABI_CORPUS_OK green=1 red=15$')" -eq 1
git diff --check
npm run factory:check
```

- [ ] **Step 6: Commit**

```bash
git add scripts/resident-agent/assurance/task136-bounded-assurance.mjs \
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
git commit -m "test: add finite task136 assurance gate"
```

### Task 3: Replace Task137 Value-Flow Analysis With A Finite Policy

**Branch:** `codex/task137-authority-boundary-v1`

**Files:**
- Create: `packages/local-runtime/test/support/task137-authority-boundary-policy.ts`
- Create from preserved candidate tree: `packages/local-runtime/src/mounted-artifact-authority-operation.ts`
- Modify from preserved candidate tree: `packages/local-runtime/src/portable-workspace-lifecycle.ts`
- Modify: `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
- Create from preserved candidate tree: `packages/local-runtime/test/mounted-artifact-authority-operation.test.ts`
- Modify from preserved candidate tree: `packages/local-runtime/test/portable-workspace-lifecycle.test.ts`
- Modify: `docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md`

**Interfaces:**
- Produces:

```ts
export interface Task137PolicyViolation {
  readonly category: string;
  readonly path: string;
  readonly detail: string;
}
export const task137GrammarVersion: "task137-authority-import-grammar.v1";
export const task137CorpusVersion: "task137-authority-import-corpus.v1";
export function inspectTask137AuthorityBoundary(root: string): readonly Task137PolicyViolation[];
```

- [ ] **Step 1: Reconstruct the preserved six-path Task137 baseline**

From a clean branch at the current program revision, restore exactly these six
paths from `cfb82c6dd940ae6ba0339b8b2b8637bcc472aea2`:

```bash
git restore --source=cfb82c6dd940ae6ba0339b8b2b8637bcc472aea2 -- \
  docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md \
  packages/local-runtime/src/mounted-artifact-authority-operation.ts \
  packages/local-runtime/src/portable-workspace-lifecycle.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation.test.ts \
  packages/local-runtime/test/portable-workspace-lifecycle.test.ts
git diff --check
git add docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md \
  packages/local-runtime/src/mounted-artifact-authority-operation.ts \
  packages/local-runtime/src/portable-workspace-lifecycle.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation.test.ts \
  packages/local-runtime/test/portable-workspace-lifecycle.test.ts
git commit -m "chore: reconstruct task137 authority baseline"
```

Verify the committed blobs for all six paths equal the preserved candidate
blobs. This commit reconstructs evidence; it does not carry prior review or
approval.

- [ ] **Step 2: Add the finite corpus tests first**

Replace reviewer-generated mutation tests with a table containing exactly eight
allowed fixtures and 20 rejected fixtures from the design. Assert category,
path, deterministic ordering, repository completion under 10 seconds, each
fixture under two seconds, and marker:

```text
TASK137_POLICY_CORPUS_OK allowed=8 rejected=20
```

- [ ] **Step 3: Run the causal RED command**

```bash
npm test -- packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/agent/test/wake-supervisor.test.ts
```

Expected RED: module not found for
`test/support/task137-authority-boundary-policy.js`.

- [ ] **Step 4: Implement the coarse policy**

Walk only production TypeScript under `packages/**/src`. Parse each file once
with the TypeScript compiler API. Reject direct loader syntax, direct
`eval(...)`/`globalThis.eval(...)` calls, and direct `Function(...)`,
`new Function(...)`, or `globalThis.Function(...)` invocation; allow the
existing harmless `Function` type annotation. Do not construct binding,
assignment, alias, closure, or evaluator-flow state. Permit only the two exact
dynamic-import exemptions and the five direct, unaliased named-import roles
from the design. Inspect root and package manifests for protected exports and
inspect barrels for protected re-exports.

- [ ] **Step 5: Remove the general analyzer**

Delete alias/evaluator/reassignment/bind tracking and arbitrary reviewer
fixture generation from the existing test. Keep mounted-workspace currentness,
lifecycle, provenance, role, and package/export assertions that fit the frozen
categories. Append the contract versions and `RV-1-E-545` pointer to the claim.

- [ ] **Step 6: Run the identical GREEN command**

Run the exact Step 3 command. Expected: six files pass and the policy test
prints the exact corpus marker.

- [ ] **Step 7: Verify and commit**

```bash
npm run typecheck
git diff --check
npm run factory:check
git add packages/local-runtime/test/support/task137-authority-boundary-policy.ts \
  packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts \
  docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md
git commit -m "test: bound task137 authority policy"
```

### Task 4: Add The Materialized Task137 Terminal Gate

**Branch:** `codex/task137-terminal-gate-v2`

**Files:**
- Create: `scripts/resident-agent/assurance/task137-terminal-gate.sh`
- Create: `scripts/resident-agent/assurance/task137-terminal-gate.test.mjs`
- Create: `docs/agentic/claims/task-137-terminal-gate-v2.md`
- Modify: `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`

**Interfaces:**
- Produces: executable `task137-terminal-gate.v2` with six ordered stage
  markers and one terminal marker.

- [ ] **Step 1: Write the failing control-flow regression**

The Node test creates an isolated PATH with command doubles for `npm`, `node`,
`git`, and `rg`. It proves an old script executed through standard input exits
after its test double and omits the terminal marker. It then executes the new
script by pathname with stdin `/dev/null` and expects exactly:

```js
[
  "TASK137_GATE_STAGE_OK tests",
  "TASK137_GATE_STAGE_OK typecheck",
  "TASK137_GATE_STAGE_OK source-policy",
  "TASK137_GATE_STAGE_OK package-boundary",
  "TASK137_GATE_STAGE_OK factory-readiness",
  "TASK137_GATE_STAGE_OK checkout",
  "TASK137_GATE_COMPLETE stages=6"
]
```

- [ ] **Step 2: Run the causal RED command**

```bash
node --test scripts/resident-agent/assurance/task137-terminal-gate.test.mjs
```

Expected RED: missing `task137-terminal-gate.sh` or missing completion marker.

- [ ] **Step 3: Implement the committed gate script**

Use `#!/usr/bin/env bash` and `set -euo pipefail`; resolve the repository root
from the script pathname; execute every child with `</dev/null`; emit a stage
marker only after that stage succeeds. The stages are:

1. The exact six-file Task137 focused Vitest command from Task 3.
2. `npm run typecheck`.
3. The Task137 import-policy test and exact corpus marker assertion.
4. `test ! -e packages/local-runtime/src/index.ts` plus the protected barrel
   and package-export checks.
5. `npm run factory:check`.
6. `git diff --check`, empty `git status --porcelain`, and
   `test ! -L node_modules`.

Emit `TASK137_GATE_COMPLETE stages=6` only after stage 6.

- [ ] **Step 4: Replace the Markdown gate**

Append a bounded-v2 section to the recovery plan that names only this command:

```bash
timeout 600 bash scripts/resident-agent/assurance/task137-terminal-gate.sh </dev/null
```

The new claim records the failed standard-input evidence revision
`5701c863210f1892186e944beda8a4059388b26c`, the v2 contract, owned files, RED
receipt, and GREEN marker contract. It does not claim the evidence-only branch
was approved.

- [ ] **Step 5: Run the identical GREEN command**

```bash
node --test scripts/resident-agent/assurance/task137-terminal-gate.test.mjs
```

Expected: old form fails the completion assertion and the committed script
double reaches all seven markers.

- [ ] **Step 6: Verify and commit**

```bash
chmod +x scripts/resident-agent/assurance/task137-terminal-gate.sh
git diff --check
npm run factory:check
git add scripts/resident-agent/assurance/task137-terminal-gate.sh \
  scripts/resident-agent/assurance/task137-terminal-gate.test.mjs \
  docs/agentic/claims/task-137-terminal-gate-v2.md \
  docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md
git commit -m "test: materialize task137 terminal gate"
```

### Task 5: Admit, Review, And Integrate The Gate Candidate

**Owner:** Coordinator; reviewers are read-only.

- [ ] **Step 1: Run coordinator admission**

```bash
candidate="$(git rev-parse HEAD)"
test -z "$(git status --porcelain)"
test ! -L node_modules
node --test scripts/resident-agent/assurance/task137-terminal-gate.test.mjs
if ! output="$(timeout 600 bash scripts/resident-agent/assurance/task137-terminal-gate.sh </dev/null)"; then
  echo "Task137 terminal gate exited nonzero" >&2
  exit 1
fi
markers="$(printf '%s\n' "$output" | grep '^TASK137_GATE_')"
expected="$(printf '%s\n' \
  'TASK137_GATE_STAGE_OK tests' \
  'TASK137_GATE_STAGE_OK typecheck' \
  'TASK137_GATE_STAGE_OK source-policy' \
  'TASK137_GATE_STAGE_OK package-boundary' \
  'TASK137_GATE_STAGE_OK factory-readiness' \
  'TASK137_GATE_STAGE_OK checkout' \
  'TASK137_GATE_COMPLETE stages=6')"
test "$markers" = "$expected"
git diff --check "${candidate}^" "$candidate"
npm run factory:check
```

- [ ] **Step 2: Dispatch two exact-revision reviews**

Architecture reviewer checks invariant preservation and committed-script
authority. Command reviewer executes the regression and real gate, verifies
seven markers, finite scope, clean checkout, and no standard-input dependence.
Both prompts bind `candidate` and state that out-of-model findings are proposed
hardening, not blockers.

- [ ] **Step 3: Integrate after dual approval**

Cherry-pick the exact candidate onto the program branch, rerun Step 1 there,
append the candidate SHA, both reviewer task IDs/verdicts, integration SHA, and
gate markers to the registry, then commit the registry append. Do not push.

### Task 6: Admit, Review, And Integrate The Task136 Candidate

**Owner:** Coordinator; reviewers are read-only.

- [ ] **Step 1: Run coordinator admission**

```bash
candidate="$(git rev-parse HEAD)"
test -z "$(git status --porcelain)"
test ! -L node_modules
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
output="$(node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode contract)"
test "$(printf '%s\n' "$output" | grep -c '^TASK136_RELEASE_GRAPH_OK records=28$')" -eq 1
test "$(printf '%s\n' "$output" | grep -c '^TASK136_COMPOSITION_CORPUS_OK green=1 red=20$')" -eq 1
test "$(printf '%s\n' "$output" | grep -c '^TASK136_COMMAND_CARDS_OK cards=28$')" -eq 1
test "$(printf '%s\n' "$output" | grep -c '^TASK136_ABI_CORPUS_OK green=1 red=15$')" -eq 1
git diff --check
npm run factory:check
```

- [ ] **Step 2: Dispatch two exact-revision reviews**

Architecture reviewer verifies one lineage authority, topological ownership,
transfers, and invariant preservation. Command reviewer executes all frozen
corpora, verifies exact counts and termination, and confirms active sections
contain no mutable lineage. Neither may add a blocking mutation outside v1.

- [ ] **Step 3: Integrate after dual approval**

Cherry-pick both Lane A commits in order onto the program branch, rerun Step 1,
append exact candidate/review/integration/release evidence to the registry, and
commit the append. Task139 remains blocked.

### Task 7: Admit, Review, And Integrate The Task137 Policy Candidate

**Owner:** Coordinator; reviewers are read-only.

- [ ] **Step 1: Rebase after gate integration**

Rebase or reconstruct Lane B from the program branch containing Task 5. The
three owned paths do not overlap the gate files. Commit one clean exact
candidate after rerunning Task 3 GREEN and verification commands.

- [ ] **Step 2: Run coordinator admission**

```bash
candidate="$(git rev-parse HEAD)"
test -z "$(git status --porcelain)"
test ! -L node_modules
npm test -- packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/runtime-handle-mounted-authority.test.ts packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts packages/agent/test/wake-supervisor.test.ts
npm run typecheck
if ! output="$(timeout 600 bash scripts/resident-agent/assurance/task137-terminal-gate.sh </dev/null)"; then
  echo "Task137 terminal gate exited nonzero" >&2
  exit 1
fi
printf '%s\n' "$output"
markers="$(printf '%s\n' "$output" | grep '^TASK137_GATE_')"
expected="$(printf '%s\n' \
  'TASK137_GATE_STAGE_OK tests' \
  'TASK137_GATE_STAGE_OK typecheck' \
  'TASK137_GATE_STAGE_OK source-policy' \
  'TASK137_GATE_STAGE_OK package-boundary' \
  'TASK137_GATE_STAGE_OK factory-readiness' \
  'TASK137_GATE_STAGE_OK checkout' \
  'TASK137_GATE_COMPLETE stages=6')"
test "$markers" = "$expected"
git diff --check
npm run factory:check
```

- [ ] **Step 3: Dispatch two exact-revision reviews**

Architecture reviewer verifies the five static roles, mounted-workspace and
lifecycle invariants, and package/export boundary. Command reviewer verifies
eight allowed, 20 rejected, two exact dynamic-import exemptions, time bounds,
the real terminal gate, and removal of general value-flow analysis. Both bind
the exact SHA and use the frozen-review rule.

- [ ] **Step 4: Integrate after dual approval and evaluate Task139**

Cherry-pick the exact candidate onto the program branch, rerun Step 2, append
the candidate/reviewer/integration evidence to the registry, and commit. Then
run Task136 repository mode. Resume Task139 only if the program registry has a
valid Task136 release record and records both Task137 gate and policy
integrations. Otherwise record the missing finite prerequisite and keep Task139
blocked without starting another Recovery-N loop.

## Reviewer Prompts

Each of the two reset reviewers receives this scope before implementation:

```text
Review the exact design and implementation plan at the assigned program SHA.
Subagent-driven development is not authorized for this read-only review.
Run git diff --check and npm run factory:check. Verify architecture/invariants
or executability/finite-scope as assigned. Review only the frozen contract
categories. Record anything outside the frozen model as proposed hardening;
do not make it a blocker without proving an explicit prohibition ineffective.
Return exactly APPROVED or NEEDS-CHANGES with file/line evidence.
```

Both must return unqualified `APPROVED` before Tasks 1-4 start.

## Completion Evidence

The reset is complete only when the registry contains:

- The dual-approved design/plan revision and two reviewer task IDs.
- Gate candidate, two exact-revision approvals, seven markers, and integration
  SHA.
- Task136 candidate, two exact-revision approvals, four exact count markers,
  and integration SHA.
- Task137 policy candidate, two exact-revision approvals, `allowed=8`,
  `rejected=20`, the real gate markers, and integration SHA.
- A deterministic Task139 release decision based on the recorded prerequisites.

No full verification, external-service gate, push, or `neo` action is part of
this reset plan.
