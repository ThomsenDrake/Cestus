# Task 109 Claim: Resident Full-Vision Wave 0 Runtime-Composition Implementation Plan

- Approved Lane R specification: `docs/superpowers/specs/2026-07-12-resident-agent-runtime-composition-design.md` at `05e85392367964a3869a55832703f504dd0fe3da`
- Governing implementation plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md` at `0b5726ec975bdc0aae97e540472ef3be4379b358`
- Task: Task 109 / Lane R — runtime-composition implementation plan
- Worker: Codex Task 109 runtime-composition implementation-plan author
- Task thread: `/root/task109_runtime_plan`
- Branch: `codex/task-109-resident-full-vision-w0-runtime-plan`
- Worktree: `/home/drake/.codex/worktrees/task-109-resident-full-vision-w0-runtime-plan`
- Base commit: `2d26a51f46c679c43ab519e21d0118e948289909`
- Claimed at: `2026-07-13T00:16:43Z`
- Model configuration: GPT-5.6 Terra / Extra High, user-confirmed; reported GPT-5 satisfies this configuration under the coordinator's standing direction
- Status: ready-for-review

## Ownership

- Create: `docs/superpowers/plans/2026-07-12-resident-agent-runtime-composition-implementation.md`
- Create: `docs/agentic/claims/task-109-resident-full-vision-w0-runtime-plan.md`

Every other tracked repository file is forbidden, including production, test,
runtime, UI, provider, shared-contract, specification, template,
acceptance-matrix, and registry files. The plan must reserve
`packages/local-runtime/src/agent-runtime-factory.ts` and its default
production composition boundary exclusively for Lane R without authorizing any
production edit in this task.

## Authorization And Stop Conditions

The coordinator-issued scoped authorization names the approved Lane R
specification and governing implementation plan above and permits Task 109
only. It explicitly authorizes `superpowers:subagent-driven-development`,
documentation RED/GREEN as TDD, fresh review, and
verification-before-completion. The wave stop is one verified plan-and-claim
commit followed by fresh plan review and coordinator lane-plan approval.

This task does not authorize Task 118 or later production work, CF-1,
provider invocation, child dispatch, a shared-contract change, a merge into
any integration branch, or a merge into `neo`.

Stop and return structured evidence to the coordinator for a data-loss or
fallback-storage risk, a shared schema or file-owner conflict, unavailable
dependency, or repeated verifier failure. A repair-count limit is a
coordinator recovery checkpoint, not permission for a user gate.

## Required Evidence

- Documentation RED: the focused plan audit must fail while the Lane R plan is
  absent or lacks the file map, factory ownership, mounted context, exact
  prompt/provider posture, runner, distinct mounted stores, readiness,
  TDD snippets, rebase/review gates, live-Nous posture, rollback, and
  acceptance mapping.
- Documentation GREEN: the same audit, `git diff --check`, and
  `npm run factory:check` must pass after the plan is complete.
- Full verification: `npm run verify` must pass before the documentation
  commit.
- Completion: commit only this claim and the owned plan, then stop for a fresh
  Task 109 plan review and coordinator lane-plan approval. The author must not
  self-approve or merge.

## Documentation RED/GREEN Evidence

- RED: the focused `node --input-type=module` plan audit exited 1 while the
  plan was absent, printing `RED:
  docs/superpowers/plans/2026-07-12-resident-agent-runtime-composition-implementation.md
  is absent; all 15 Lane R plan obligations are unproven.`
- Root-cause checkpoint: the first post-write audit correctly reported missing
  `runtime readiness`. Its required pattern was the exact implementation-plan
  heading, while the document said `Derived Runtime Readiness`. The plan's
  coverage was present under Task 140 but the proof label was not exact; the
  one-line heading correction was verified by the same fail-fast audit.
- GREEN: the focused audit then exited 0 and printed `GREEN: Lane R plan audit
  passed (15 obligations; no placeholder markers).` It confirms exact R-owned
  files, sole factory ownership, mounted context, prompt/provider posture,
  runner, distinct stores, readiness, TDD sequence, review/rebase, Nous,
  rollback, and acceptance coverage.
- `git diff --check` exited 0 with no output and `npm run factory:check` exited
  0 with `factory-readiness passed` after the GREEN audit.
- Full verification: the first run stopped before typecheck with `tsc: command
  not found`. Root-cause evidence showed `node_modules` and
  `node_modules/.bin/tsc` absent while the tracked `package-lock.json` was
  present and `npm ci --dry-run --ignore-scripts` exited 0. `npm ci` restored
  the lockfile-pinned local dependencies without tracked-file changes. The
  rerun `NODE_NO_WARNINGS=1 npm run verify` exited 0: typecheck passed; 189
  test files passed with 3 skipped; 2,228 tests passed with 5 skipped; Vite
  built with its existing chunk-size warning; and factory-readiness passed.

## Plan Self-Review

- Coverage: Tasks 132–135 and 140 map every Lane R design obligation to exact
  production/test files, deterministic RED/GREEN proof, review gates, and a
  later acceptance result.
- Interfaces: the only shared type names are identified as CF-1 consumed
  contracts; the plan does not select their shared modules or redefine their
  ownership. Component function signatures are consistent from producer task
  through factory composition.
- Ownership and merge safety: four independent adapter tasks use disjoint
  files after named dependencies; Task 140 is the only factory editor and
  cannot start before 132–139 are reviewed and integrated.
- Scope: no production code, CF-1 change, provider call, dispatch, self-review
  approval, integration-branch merge, or merge into `neo` is authorized by
  this planning task.

## Repair R1: Section-Local Composition, Readiness, And Audit Recovery

- Repair worker and branch: `/root/task109_runtime_plan_repair` on
  `codex/task-109-resident-full-vision-w0-runtime-plan-repair`, based on
  `0ac9a37e1251567b8a8818ade4245a03e314bc5f`.
- Scoped authorization: the coordinator authorized only Task 109
  runtime-wiring and audit-strengthening repair against Lane R spec
  `05e85392367964a3869a55832703f504dd0fe3da` and governing plan
  `0b5726ec975bdc0aae97e540472ef3be4379b358`. The wave stop is one verified
  repair commit and fresh re-review. It explicitly authorizes
  `superpowers:subagent-driven-development`, documentation RED/GREEN as TDD,
  fresh review, and verification-before-completion; it forbids Tasks 132–140,
  CF-1 implementation, production work, provider invocation, and a merge into
  `neo` or an integration branch.
- Root cause: the historical audit searched the complete Markdown document, so
  unrelated prose could satisfy a requirement. It neither required a typed
  Task 135 store-to-runner-to-H bridge nor proved that Task 140's internal
  `projectProductionRuntimeReadiness` was exposed to W/U through a safe,
  consumed capability. Its inequality-only test could also pass while a new
  empty registry or another fallback constructor was used.
- Repair scope: the plan now freezes the R-owned
  `ProductionMountedRunnerHandoffBinding` and
  `ProductionRuntimeReadinessCapability` at CF-1, binds the exact Task 135
  mounted stores to Task 134 dispatch and H handoff, rejects store/authority
  mismatch and generic runner-returned stores, and makes Task 140 expose a
  consumed safe readiness accessor plus U's safe DTO boundary. It preserves H,
  W, P, L, U, and A ownership; no production contract is changed by this
  documentation-only repair.

### R1 Documentation RED/GREEN Audit

The following self-contained audit scopes every assertion to the relevant
section before it evaluates the counterfactuals. It was first run against
`0ac9a37e` and exited 1 with `RED: missing typed mounted runner/handoff
binding: interface ProductionMountedRunnerHandoffBinding`. After this repair,
the same command exits 0 with `GREEN: Task 109 section-local runtime
composition audit passed (direct section-local assertions; 14 counterfactuals
rejected).`

```bash
node --input-type=module <<'NODE'
import fs from "node:fs";

const plan = fs.readFileSync(
  "docs/superpowers/plans/2026-07-12-resident-agent-runtime-composition-implementation.md",
  "utf8"
);
const section = (source, start, end) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`missing section boundary: ${start} -> ${end}`);
  return source.slice(a, b);
};
const requireText = (source, text, label) => {
  if (!source.includes(text)) throw new Error(`missing ${label}: ${text}`);
};
const audit = (source) => {
  const global = section(source, "## Global Constraints", "## CF-1 Consumed Contracts");
  const contracts = section(source, "## CF-1 Consumed Contracts", "## File Ownership and Merge Order");
  const task132 = section(source, "## Task 132:", "## Task 133:");
  const task133 = section(source, "## Task 133:", "## Task 134:");
  const task134 = section(source, "## Task 134:", "## Task 135:");
  const task135 = section(source, "## Task 135:", "## Task 140:");
  const task140 = section(source, "## Task 140:", "## Failure, Rollback, and Real Nous Gate");
  const nous = section(source, "## Failure, Rollback, and Real Nous Gate", "## Acceptance Mapping and Self-Review");
  requireText(contracts, "interface ProductionMountedRunnerHandoffBinding", "typed mounted runner/handoff binding");
  requireText(contracts, "interface ProductionRuntimeReadinessCapability", "CF-1 readiness capability");
  requireText(contracts, "getReadiness(): ProductionRuntimeReadiness;", "safe readiness accessor");
  requireText(contracts, "ProductionRuntimeReadinessRouteDto", "safe readiness DTO boundary");
  for (const [text, label] of [
    ["createProductionMountedRunnerHandoffBinding", "Task 135 binding factory"],
    ["readonly artifactStores: MountedAgentArtifactStores;", "Task 135 mounted stores input"],
    ["readonly runnerCapability: ProductionSpecialistRunnerCapability;", "Task 135 runner input"],
    ["readonly handoffCapability: TaskOrchestratorHandoffCapability;", "Task 135 H handoff input"],
    ["workspace-identity-mismatch", "Task 135 fail-closed identity mismatch"],
    ["generic runner-returned store", "Task 135 generic-store fallback prohibition"]
  ]) requireText(task135, text, label);
  for (const [text, label] of [
    ["createProductionAgentRuntimeComposition", "Task 140 exposed composition"],
    ["readiness: ProductionRuntimeReadinessCapability", "Task 140 readiness output"],
    ["WakeSupervisorRuntime", "W readiness consumer"],
    ["ProductionRuntimeReadinessRouteDto", "U safe DTO consumer"],
    ["projectProductionRuntimeReadiness", "internal readiness projector"],
    ["getReadiness", "consumed readiness accessor"],
    ["fallbackConstructors", "fallback-constructor test seam"],
    ["toBe(input.contextCapability.registry)", "supplied collaborator identity proof"],
    ["not.toHaveBeenCalled", "fallback constructor proof"],
    ["It never constructs SQLite, memory,\ntemporary-file, alternate-workspace, no-op renderer, or no-op runner fallback\ncapabilities.", "factory no-fallback boundary"]
  ]) requireText(task140, text, label);
  requireText(global, "Only Lane R may change `packages/local-runtime/src/agent-runtime-factory.ts`.", "factory-only ownership");
  for (const [name, body] of [["132", task132], ["133", task133], ["134", task134], ["135", task135], ["140", task140]]) {
    requireText(body, "**Step 2: Run the focused RED command.**", `Task ${name} RED gate`);
    requireText(body, "Expected: FAIL", `Task ${name} RED expectation`);
    requireText(body, "**Step 4: Run the focused GREEN command.**", `Task ${name} GREEN gate`);
    requireText(body, "Expected: PASS", `Task ${name} GREEN expectation`);
  }
  requireText(nous, "coordinator may run", "coordinator-only Nous authority");
  requireText(nous, "only when P policy selects approved Nous", "Nous prerequisite");
  requireText(nous, "npm run agent:nous:smoke", "Nous gate command");
};
const counterfactuals = [
  ["binding factory", (s) => s.replaceAll("createProductionMountedRunnerHandoffBinding", "removedBinding")],
  ["mounted-store input", (s) => s.replaceAll("readonly artifactStores: MountedAgentArtifactStores;", "")],
  ["runner input", (s) => s.replaceAll("readonly runnerCapability: ProductionSpecialistRunnerCapability;", "")],
  ["H handoff input", (s) => s.replaceAll("readonly handoffCapability: TaskOrchestratorHandoffCapability;", "")],
  ["generic runner-store fallback", (s) => s.replaceAll("generic runner-returned store", "removed runner store")],
  ["readiness output", (s) => s.replaceAll("readiness: ProductionRuntimeReadinessCapability", "readiness: never")],
  ["readiness accessor", (s) => s.replaceAll("getReadiness", "removedReadinessAccessor")],
  ["W consumer", (s) => s.replaceAll("WakeSupervisorRuntime", "RemovedSupervisor")],
  ["U safe DTO", (s) => s.replaceAll("ProductionRuntimeReadinessRouteDto", "RemovedReadinessRouteDto")],
  ["factory-only owner", (s) => s.replaceAll("Only Lane R may change `packages/local-runtime/src/agent-runtime-factory.ts`.", "Any lane may change the factory.")],
  ["RED gates", (s) => s.replaceAll("**Step 2: Run the focused RED command.**", "**Step 2: Removed RED command.**")],
  ["GREEN gates", (s) => s.replaceAll("**Step 4: Run the focused GREEN command.**", "**Step 4: Removed GREEN command.**")],
  ["Nous coordinator gate", (s) => s.replaceAll("the coordinator may run", "any child may run")],
  ["factory fallback", (s) => s.replace("It never constructs SQLite, memory,\ntemporary-file, alternate-workspace, no-op renderer, or no-op runner fallback\ncapabilities.", "It may construct a fallback capability.")]
];
try {
  audit(plan);
  for (const [label, mutate] of counterfactuals) {
    let rejected = false;
    try { audit(mutate(plan)); } catch { rejected = true; }
    if (!rejected) throw new Error(`counterfactual accepted: ${label}`);
  }
  console.log(`GREEN: Task 109 section-local runtime composition audit passed (direct section-local assertions; ${counterfactuals.length} counterfactuals rejected).`);
} catch (error) {
  console.error(`RED: ${error.message}`);
  process.exitCode = 1;
}
NODE
```

- Additional R1 GREEN evidence is pending the final `git diff --check`,
  `npm run factory:check`, and `npm run verify` gates recorded below this
  append-only repair record. This repairer cannot self-approve or merge.

### R1 Verification And Self-Review

- GREEN audit: the embedded command above exited 0 and rejected all 14
  section-local counterfactuals, including removal of the typed mounted binding,
  mounted-store/runner/H inputs, the generic runner-store fallback, readiness
  output/accessor or W/U consumer, factory-only ownership, every relevant RED
  or GREEN gate, the coordinator-only Nous gate, and the no-fallback boundary.
- `git diff --check` exited 0 with no output. `npm run factory:check` exited 0
  with `factory-readiness passed`.
- Verification environment recovery: the first `NODE_NO_WARNINGS=1 npm run
  verify` stopped before typecheck with `tsc: command not found`. The checked
  lockfile was present, `node_modules/.bin/tsc` was absent, and `npm ci
  --dry-run --ignore-scripts` exited 0, proving an unprovisioned isolated
  worktree rather than a plan defect. `npm ci` restored only lockfile-pinned
  dependencies without tracked-file changes. The rerun
  `NODE_NO_WARNINGS=1 npm run verify` exited 0 after typecheck, the
  deterministic test/build verifier, and factory readiness.
- Scope and ownership self-review: the only changed tracked files are this
  append-only claim and the Lane R plan. The plan keeps Task 135's binding in
  R's owned module, keeps Task 140 as the sole factory editor, names CF-1
  rather than changing a shared type, and preserves H material/manifest,
  W lifecycle, P configuration, L policy, U route implementation, and A
  acceptance ownership.
- Interface and safety self-review: the exact workspace/mount/authority tuple
  is checked before runner/H activity; all receipt readbacks remain mounted and
  typed; a runner result cannot supply a replacement store; the readiness
  accessor exposes only safe fields; W and U consume the accessor/DTO rather
  than a reconstruction; and every new positive composition proof is identity
  or equivalence based with fallback constructors explicitly uncalled.
- Repair status: ready for a fresh independent Task 109 plan re-review. This
  record supersedes only the historical loose-audit and incomplete
  runtime-wiring evidence; it preserves all earlier claim entries verbatim.
