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

## Repair R2: Dispatch Conformance and Semantic-Audit Recovery

- Repair worker and branch: `/root/task109_runtime_plan_repair_2` on
  `codex/task-109-resident-full-vision-w0-runtime-plan-repair-2`, based on
  `048d43b00df1de0d71f2eab1a6b994abd77c06d1`.
- Scoped authorization: the coordinator authorized only Task 109
  dispatch-conformance and semantic-audit repair against Lane R specification
  `05e85392367964a3869a55832703f504dd0fe3da` and governing plan
  `0b5726ec975bdc0aae97e540472ef3be4379b358`. The wave stop is one verified
  repair commit and fresh re-review. It explicitly authorizes
  `superpowers:subagent-driven-development`, documentation RED/GREEN as TDD,
  fresh review, and verification-before-completion; it forbids Tasks 132–140,
  CF-1 implementation, production work, provider invocation, and a merge into
  `neo` or an integration branch.
- Status: in-progress.
- Root cause: R1's audit limited searches to Markdown sections, but still used
  independent token-presence assertions. It could accept prose that mentioned
  the Task 135 readback nouns without proving their ordered chain, Task 134's
  authority/store/H closure without proving it was factory-derived, or Task
  140's W/U names without proving accessor-only injection. It also left
  `ProductionMountedRunnerHandoffBinding.dispatch` narrower than the existing
  public `TaskOrchestratorRunnerDispatchInput` contract and did not reject a
  caller-supplied store attempt.
- Required recovery: preserve the public orchestrator dispatch shape exactly;
  bind validated registration, mounted stores, authority tuple, and H handoff
  only in the factory-composed closure; add section-local, ordered, and
  counterfactual documentation evidence. No shared production contract changes
  in this documentation-only task.
- RED: before this repair, the new section-local semantic audit exited 1 with
  `RED: missing CF-1 public TaskOrchestratorRunnerDispatchInput conformance`.
- GREEN, full verification, self-review, and review evidence are recorded only
  after this repair's fresh commands complete. This append-only record
  supersedes no historical claim evidence while it remains in progress.

### R2 Documentation RED/GREEN Audit

The RED command above used this audit before the plan change and failed at the
new CF-1 public-dispatch requirement. After the repair, the exact command
below exited 0 with `GREEN: Task 109 semantic section-local audit passed (8
actual-clause counterfactuals rejected).` It extracts named sections and the
specific Task 134, 135, and 140 test fences; it does not let another section's
prose satisfy a local requirement. Each in-memory mutation deletes or replaces
the clause that establishes the stated relationship, then must make the audit
fail.

```bash
node --input-type=module <<'NODE'
import fs from "node:fs";

const plan = fs.readFileSync(
  "docs/superpowers/plans/2026-07-12-resident-agent-runtime-composition-implementation.md",
  "utf8"
);
const section = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`missing section boundary: ${start} -> ${end}`);
  return source.slice(from, to);
};
const codeFenceContaining = (source, needle) => {
  const needleAt = source.indexOf(needle);
  const start = source.lastIndexOf("```ts", needleAt);
  const end = source.indexOf("```", needleAt);
  if (needleAt < 0 || start < 0 || end < 0) throw new Error(`missing code fence for ${needle}`);
  return source.slice(start, end + 3);
};
const normalize = (source) => source.replace(/\s+/g, " ");
const requireMatch = (source, expression, label) => {
  if (!expression.test(source)) throw new Error(`missing ${label}`);
};
const requireOrdered = (source, phrases, label) => {
  let cursor = 0;
  for (const phrase of phrases) {
    const next = source.indexOf(phrase, cursor);
    if (next < 0) throw new Error(`missing ${label}: ${phrase}`);
    cursor = next + phrase.length;
  }
};
const replaceSection = (source, start, end, mutate) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`cannot mutate section: ${start}`);
  return source.slice(0, from) + mutate(source.slice(from, to)) + source.slice(to);
};
const audit = (source) => {
  const contracts = section(source, "## CF-1 Consumed Contracts", "## File Ownership and Merge Order");
  const task134 = section(source, "## Task 134:", "## Task 135:");
  const task135 = section(source, "## Task 135:", "## Task 140:");
  const task140 = section(source, "## Task 140:", "## Failure, Rollback, and Real Nous Gate");
  const task134ClosureTest = codeFenceContaining(task134, "accepts authority, mounted stores, and H handoff only");
  const task135ConformanceTest = codeFenceContaining(task135, "keeps the public orchestrator dispatch shape");
  const task140ReadinessTest = codeFenceContaining(task140, "injects the same readiness accessor into W");

  requireMatch(contracts, /interface ProductionMountedRunnerHandoffBinding[\s\S]*?dispatch\(input: TaskOrchestratorRunnerDispatchInput\): Promise<TaskOrchestratorRunnerDispatchResult \| void>;/, "CF-1 public TaskOrchestratorRunnerDispatchInput conformance");
  requireOrdered(normalize(contracts), [
    'ProductionMountedRunnerHandoffBinding.dispatch` is the production `TaskOrchestratorRunnerRegistry["dispatch"]` implementation.',
    "TaskOrchestratorRunnerDispatchInput`: `taskId`, `runType`, `attemptId`, and `approvedRunId`.",
    "It takes no caller-supplied workspace authority, mounted store, runner registration, material/manifest receipt, H handoff capability"
  ], "CF-1 exact public dispatch scope");
  requireMatch(task134, /factory-composed\s+mounted closure[\s\S]*?MountedWorkspaceRuntimeAuthority[\s\S]*?MountedAgentArtifactStores[\s\S]*?TaskOrchestratorHandoffCapability/, "Task 134 authority/store/H closure rule");
  requireMatch(task134ClosureTest, /const closure = verifiedMountedRunnerHandoffClosure\([\s\S]*?authority,[\s\S]*?artifactStores,[\s\S]*?handoffCapability[\s\S]*?verifiedDispatchFromFactory[\s\S]*?publicDispatch: orchestratorDispatchInput\(\)[\s\S]*?expect\(dispatchVerified\)\.toHaveBeenCalledWith[\s\S]*?authority,[\s\S]*?artifactStores,[\s\S]*?handoffCapability/, "Task 134 closure identity test");
  requireMatch(task134ClosureTest, /verifiedDispatchWithCallerStores[\s\S]*?runner-registration-invalid[\s\S]*?toHaveBeenCalledTimes\(1\)/, "Task 134 caller-store rejection before delegate reuse");
  requireOrdered(normalize(task135), ["derivative readback", "material readback", "manifest readback bound to the verified material hash", "H ledger/lifecycle readback", "original workspace/mount tuple"], "Task 135 exact durable readback chain");
  requireMatch(task135ConformanceTest, /const publicDispatch:\s*TaskOrchestratorRunnerRegistry\["dispatch"\]\s*=\s*binding\.dispatch\.bind\s*\(binding\);[\s\S]*?const dispatchInput: TaskOrchestratorRunnerDispatchInput[\s\S]*?await publicDispatch\(dispatchInput\);[\s\S]*?publicDispatch: dispatchInput,[\s\S]*?authority,[\s\S]*?artifactStores,[\s\S]*?handoffCapability/, "Task 135 typed public dispatch and sealed closure test");
  requireMatch(task135ConformanceTest, /const callerAttempt = \{ \.\.\.dispatchInput, artifactStores: forgedStores \};[\s\S]*?publicDispatch\(callerAttempt as unknown as TaskOrchestratorRunnerDispatchInput\)[\s\S]*?runner-registration-invalid/, "Task 135 caller-supplied store rejection test");
  requireMatch(task140ReadinessTest, /runtimeReadiness:\s*composition\.readiness\s*[,\n}][\s\S]*?wakeRuntime\.runtimeReadiness\)\.toBe\(composition\.readiness\)[\s\S]*?ProductionRuntimeReadinessRouteDto[\s\S]*?toProductionRuntimeReadinessRouteDto\(composition\.readiness\.getReadiness\(\)\)[\s\S]*?not\.toHaveProperty\("prompt"\)[\s\S]*?not\.toHaveProperty\("secret"\)[\s\S]*?not\.toHaveProperty\("path"\)[\s\S]*?not\.toHaveProperty\("rawError"\)/, "Task 140 W/U accessor-only readiness injection test");
};
const counterfactuals = [
  ["public dispatch replaced with unconstrained input", (source) => source.replace("dispatch(input: TaskOrchestratorRunnerDispatchInput): Promise<TaskOrchestratorRunnerDispatchResult | void>;", "dispatch(input: unknown): Promise<TaskOrchestratorRunnerDispatchResult | void>;")],
  ["Task 134 closure loses mounted stores", (source) => replaceSection(source, "## Task 134:", "## Task 135:", (body) => body.replaceAll("MountedAgentArtifactStores", "RemovedMountedStores"))],
  ["Task 134 caller-store rejection removed", (source) => replaceSection(source, "## Task 134:", "## Task 135:", (body) => body.replace("verifiedDispatchWithCallerStores", "removedCallerStoreCounterfactual"))],
  ["Task 135 skips manifest readback", (source) => replaceSection(source, "## Task 135:", "## Task 140:", (body) => body.replace(/manifest\s+readback bound to the verified material\s+hash/g, "manifest receipt"))],
  ["Task 135 dispatch is no longer typed", (source) => replaceSection(source, "## Task 135:", "## Task 140:", (body) => body.replace('const publicDispatch: TaskOrchestratorRunnerRegistry["dispatch"] = binding.dispatch.bind(binding);', "const publicDispatch = (...args: unknown[]) => binding.dispatch(args[0]);"))],
  ["Task 135 forwards caller store", (source) => replaceSection(source, "## Task 135:", "## Task 140:", (body) => body.replace("const callerAttempt = { ...dispatchInput, artifactStores: forgedStores };", "const callerAttempt = { ...dispatchInput, ignored: forgedStores };"))],
  ["Task 140 injects a snapshot into W", (source) => replaceSection(source, "## Task 140:", "## Failure, Rollback, and Real Nous Gate", (body) => body.replace("runtimeReadiness: composition.readiness", "runtimeReadiness: composition.readiness.getReadiness()"))],
  ["Task 140 gives U raw readiness rather than accessor output", (source) => replaceSection(source, "## Task 140:", "## Failure, Rollback, and Real Nous Gate", (body) => body.replace("toProductionRuntimeReadinessRouteDto(composition.readiness.getReadiness())", "toProductionRuntimeReadinessRouteDto(rawCompositionInput)"))]
];
try {
  audit(plan);
  for (const [label, mutate] of counterfactuals) {
    let rejected = false;
    try { audit(mutate(plan)); } catch { rejected = true; }
    if (!rejected) throw new Error(`counterfactual accepted: ${label}`);
  }
  console.log(`GREEN: Task 109 semantic section-local audit passed (${counterfactuals.length} actual-clause counterfactuals rejected).`);
} catch (error) {
  console.error(`RED: ${error.message}`);
  process.exitCode = 1;
}
NODE
```

- GREEN audit evidence: pending final replay of the embedded command after the
  claim append, followed by `git diff --check`, `npm run factory:check`, and
  `npm run verify`.

### R2 Verification and Self-Review

- GREEN audit: the embedded command above exited 0 and rejected all eight
  actual-clause counterfactuals: unconstrained public dispatch, missing Task
  134 mounted stores, missing Task 134 caller-store rejection, skipped Task
  135 manifest readback, untyped Task 135 dispatch, forwarded caller store,
  W snapshot injection, and U raw-readiness projection.
- Documentation gates: `git diff --check` exited 0 with no output and
  `npm run factory:check` exited 0 with `factory-readiness passed`.
- Verification environment recovery: the first full verifier stopped before
  typecheck with `tsc: command not found`. Investigation found no
  `node_modules` directory or local `tsc`, while the tracked lockfile was
  present and `npm ci --dry-run --ignore-scripts` exited 0. `npm ci` restored
  only lockfile-pinned local dependencies; `git status` continued to list only
  this claim and the owned Lane R plan.
- Full verification: a fresh `NODE_NO_WARNINGS=1 npm run verify` reached
  `typecheck passed` and launched the deterministic Vitest suite. The completed
  same-invocation process then ran `npm run ui:build` and
  `npm run factory:check`, whose npm logs record exit 0 at
  `2026-07-13T01_18_54_782Z` and `2026-07-13T01_18_55_451Z`. The verifier's
  `&&` script sequence reaches those commands only after `npm test` passes;
  the final factory log records `factory-readiness passed`.
- Scope and interface self-review: the public binding now consumes the existing
  `TaskOrchestratorRunnerDispatchInput`/registry directly; it does not create a
  shadow shared type. Its closure is explicit and factory-derived, while Task
  135 proves ordered durable readback and caller-store rejection. Task 140
  proves W receives the same readiness capability and U only the safe DTO
  projection from its accessor.
- Ownership self-review: Task 135 remains R-owned and composes existing H
  handoff capability without changing its schema; Task 140 remains the sole
  default-factory editor; W and U remain consumers; P, L, and A ownership is
  unchanged. No provider call, production file, CF-1 contract file, registry,
  or integration branch was changed.
- Repair status: ready for fresh independent Task 109 plan re-review. This
  append-only R2 record supersedes R1 only for the public-dispatch,
  closure-binding, semantic-audit, and verification evidence; all historical
  Task 109 entries remain intact.

## Recovery R3: Actual-Caller Factory-Closed Tuple Audit

- Recovery worker and branch: `/root/task109_runtime_plan_recovery` on
  `codex/task-109-resident-full-vision-w0-runtime-plan-recovery`, based on
  `df8d5103d8f5e1ced773d1e5ca376224e326c6e0`.
- Exact approved lane specification:
  `docs/superpowers/specs/2026-07-12-resident-agent-runtime-composition-design.md`
  at `05e85392367964a3869a55832703f504dd0fe3da`.
- Exact governing implementation plan:
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md`
  at `0b5726ec975bdc0aae97e540472ef3be4379b358`.
- Allowed task range: Task 109 append-only documentation-only call-path
  recovery. The wave stop is one verified recovery commit and a separately
  fresh re-review. Tasks 132–140, CF-1 implementation, production/provider
  work, child dispatch, and every merge are forbidden.
- Scoped authorization: the coordinator explicitly authorizes
  `superpowers:subagent-driven-development`, documentation RED/GREEN as TDD,
  fresh review, and verification-before-completion under the user-confirmed
  GPT-5.6 Terra / Extra High configuration. This worker may not merge into
  `neo` or an integration branch.
- Root cause checkpoint: R2's section-local audit proved a direct binding
  invocation but not the actual public caller at
  `packages/agent/src/task-orchestrator.ts`:
  `dispatchVerifiedTaskRunner`. The direct positive fixture could therefore
  pass without proving that the caller's verified approval/context gate creates
  the exact four-field registry input, preserves the factory-closed tuple
  downstream, or keeps forged/unregistered/swapped inputs out before activity.
  This recovery changes only plan/claim evidence; it introduces no production
  type, shared-contract, provider, or CF-1 ownership change.
- Required recovery outcome: Tasks 134, 135, and 140 each invoke the real
  `dispatchVerifiedTaskRunner` caller in a focused planned test. The Task 135
  and Task 140 path proves frozen registration provenance, authority workspace
  and mount identity, mounted derivative/material/manifest readbacks, and H
  handoff downstream. A direct forged-store registry input, an unregistered
  runner, and a swapped mounted tuple stop before further activity. W receives
  the same readiness capability and U projects only its accessor result.
- RED: before this recovery, the focused audit below exited 1 with
  `RED: missing Task 134 actual dispatchVerifiedTaskRunner caller test` because
  the plan's Task 134/135/140 tests called binding helpers directly instead of
  the exported public caller.

### R3 Documentation RED/GREEN Audit

The following audit extracts the exact Task 134, Task 135, Task 140, and W/U
test blocks. It evaluates anchored clauses inside those blocks; no document
global token can satisfy a local contract. Each in-memory counterfactual
deletes or changes the actual tuple comparison, registration provenance,
verified caller binding, readback chain, forged/swap rejection, actual caller,
W capability injection, or U accessor-only projection and must fail.

```bash
node --input-type=module <<'NODE'
import fs from "node:fs";

const plan = fs.readFileSync(
  "docs/superpowers/plans/2026-07-12-resident-agent-runtime-composition-implementation.md",
  "utf8"
);
const section = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`missing section boundary: ${start} -> ${end}`);
  return source.slice(from, to);
};
const fence = (source, needle) => {
  const at = source.indexOf(needle);
  const from = source.lastIndexOf("```ts", at);
  const to = source.indexOf("```", at);
  if (at < 0 || from < 0 || to < 0) throw new Error(`missing test fence: ${needle}`);
  return source.slice(from, to + 3);
};
const requireText = (source, text, label) => {
  if (!source.includes(text)) throw new Error(`missing ${label}: ${text}`);
};
const requireMatch = (source, expression, label) => {
  if (!expression.test(source)) throw new Error(`missing ${label}`);
};
const replaceSection = (source, start, end, mutate) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`cannot mutate section: ${start}`);
  return source.slice(0, from) + mutate(source.slice(from, to)) + source.slice(to);
};
const assertActualCaller = (body, title, label) => {
  const test = fence(body, title);
  requireMatch(
    test,
    /await dispatchVerifiedTaskRunner\(\{[\s\S]*?registry:[\s\S]*?verifiedProviderApproval: true,[\s\S]*?verifiedContextBindings: true,[\s\S]*?\.\.\.(caller|dispatchInput)/,
    `${label} exported caller invocation`
  );
  return test;
};
const audit = (source) => {
  const task134 = section(source, "## Task 134:", "## Task 135:");
  const task135 = section(source, "## Task 135:", "## Task 140:");
  const task140 = section(source, "## Task 140:", "## Failure, Rollback, and Real Nous Gate");
  const actual134 = assertActualCaller(task134, "invokes dispatchVerifiedTaskRunner through the Task 134 factory-closed registry", "Task 134");
  const actual135 = assertActualCaller(task135, "uses dispatchVerifiedTaskRunner to preserve the factory-closed mounted tuple", "Task 135");
  const actual140 = assertActualCaller(task140, "invokes dispatchVerifiedTaskRunner through composition with the same frozen tuple", "Task 140");
  const readiness = fence(task140, "injects the same readiness accessor into W");

  for (const [text, label] of [
    ["expect(verifiedDispatch.authority).toBe(authority);", "Task 134 authority identity comparison"],
    ["expect(verifiedDispatch.authority.mountInstanceId).toBe(\"mount_runtime\");", "Task 134 mount comparison"],
    ["expect(verifiedDispatch.artifactStores).toBe(artifactStores);", "Task 134 mounted-store identity comparison"],
    ["expect(verifiedDispatch.registrationProvenance).toBe(frozenRegistrationProvenance);", "Task 134 frozen registration provenance comparison"],
    ["expect(verifiedDispatch.handoffCapability).toBe(handoffCapability);", "Task 134 H handoff identity comparison"],
    ["registry.dispatch({ ...caller, artifactStores: forgedStores }", "Task 134 direct forged-store rejection"],
    ["unregisteredRunnerRegistration()", "Task 134 unregistered-runner counterfactual"],
    ["expect(readbackTrace).toEqual([\"derivative-readback\", \"material-readback\", \"manifest-readback\"]);", "Task 134 mounted readback trace"],
    ["expect(handoffCapability.readback).toHaveBeenCalledTimes(1);", "Task 134 H readback"]
  ]) requireText(actual134, text, label);

  for (const [text, label] of [
    ["registry: { dispatch: publicDispatch },\n    verifiedProviderApproval: true,\n    verifiedContextBindings: true,", "Task 135 verified public binding"],
    ["registration: frozenRegistration,", "Task 135 frozen registration binding"],
    ["registrationProvenance: frozenRegistrationProvenance,", "Task 135 frozen registration provenance binding"],
    ["expect(readbackTrace).toEqual([\"derivative-readback\", \"material-readback\", \"manifest-readback\"]);", "Task 135 mounted readback trace"],
    ["expect(handoffCapability.readback).toHaveBeenCalledTimes(1);", "Task 135 H readback"],
    ["const callerAttempt = { ...dispatchInput, artifactStores: forgedStores };", "Task 135 direct forged-store rejection"],
    ["unregisteredRunnerBinding().dispatch", "Task 135 unregistered-runner rejection"],
    ["swappedMountedStores({ workspaceId: \"ws_runtime\", mountInstanceId: \"mount_swapped\" })", "Task 135 swapped mounted tuple rejection"]
  ]) requireText(actual135, text, label);

  for (const [text, label] of [
    ["registry: composition.runtimeCapabilities.runnerRegistry", "Task 140 composed registry"],
    ["authority: input.mountedAuthority,", "Task 140 authority binding"],
    ["artifactStores: input.artifactStores,", "Task 140 mounted-store binding"],
    ["registration: frozenRunnerRegistration(),", "Task 140 frozen registration binding"],
    ["registrationProvenance: frozenRunnerRegistrationProvenance(),", "Task 140 registration provenance binding"],
    ["handoffCapability: input.handoffCapability", "Task 140 H handoff binding"],
    ["expect(input.mountedAuthority.mountInstanceId).toBe(\"mount_runtime\");", "Task 140 mount comparison"],
    ["expect(readbackTrace).toEqual([\"derivative-readback\", \"material-readback\", \"manifest-readback\"]);", "Task 140 mounted readback trace"],
    ["expect(input.handoffCapability.readback).toHaveBeenCalledTimes(1);", "Task 140 H readback"],
    ["composition.runtimeCapabilities.runnerRegistry.dispatch({ ...caller, artifactStores: forgedStores }", "Task 140 direct forged-store rejection"],
    ["unregisteredProductionRunners()", "Task 140 unregistered-runner rejection"],
    ["swappedMountedStores({ workspaceId: \"ws_runtime\", mountInstanceId: \"mount_swapped\" })", "Task 140 swapped mounted tuple rejection"]
  ]) requireText(actual140, text, label);
  for (const [text, label] of [
    ["runtimeReadiness: composition.readiness\n", "W capability injection"],
    ["expect(wakeRuntime.runtimeReadiness).toBe(composition.readiness);", "W injected capability identity"],
    ["toProductionRuntimeReadinessRouteDto(composition.readiness.getReadiness())", "U accessor-only route projection"],
    ["expect(routeDto).not.toHaveProperty(\"prompt\");", "U safe DTO prompt exclusion"],
    ["expect(routeDto).not.toHaveProperty(\"rawError\");", "U safe DTO error exclusion"]
  ]) requireText(readiness, text, label);
};
const counterfactuals = [
  ["Task 134 authority tuple comparison", (s) => replaceSection(s, "## Task 134:", "## Task 135:", (b) => b.replace("expect(verifiedDispatch.authority).toBe(authority);", "expect(verifiedDispatch.authority).toBeUndefined();"))],
  ["Task 134 registration provenance", (s) => replaceSection(s, "## Task 134:", "## Task 135:", (b) => b.replace("expect(verifiedDispatch.registrationProvenance).toBe(frozenRegistrationProvenance);", "expect(verifiedDispatch.registrationProvenance).toBeUndefined();"))],
  ["Task 134 real caller", (s) => replaceSection(s, "## Task 134:", "## Task 135:", (b) => b.replace("dispatchVerifiedTaskRunner({", "removedActualCaller({"))],
  ["Task 135 verified caller binding", (s) => replaceSection(s, "## Task 135:", "## Task 140:", (b) => b.replace("registry: { dispatch: publicDispatch },\n    verifiedProviderApproval: true,\n    verifiedContextBindings: true,", "registry: { dispatch: publicDispatch },\n    verifiedProviderApproval: true,\n    verifiedContextBindings: false,"))],
  ["Task 135 mounted readback trace", (s) => replaceSection(s, "## Task 135:", "## Task 140:", (b) => b.replace("\"derivative-readback\", \"material-readback\", \"manifest-readback\"", "\"derivative-readback\""))],
  ["Task 135 forged store rejection", (s) => replaceSection(s, "## Task 135:", "## Task 140:", (b) => b.replace("const callerAttempt = { ...dispatchInput, artifactStores: forgedStores };", "const callerAttempt = dispatchInput;"))],
  ["Task 135 swapped tuple rejection", (s) => replaceSection(s, "## Task 135:", "## Task 140:", (b) => b.replace("mountInstanceId: \"mount_swapped\"", "mountInstanceId: \"mount_runtime\""))],
  ["Task 140 real caller", (s) => replaceSection(s, "## Task 140:", "## Failure, Rollback, and Real Nous Gate", (b) => b.replace("dispatchVerifiedTaskRunner({", "removedActualCaller({"))],
  ["Task 140 registration provenance", (s) => replaceSection(s, "## Task 140:", "## Failure, Rollback, and Real Nous Gate", (b) => b.replace("registrationProvenance: frozenRunnerRegistrationProvenance(),", "registrationProvenance: undefined,"))],
  ["Task 140 W injection", (s) => replaceSection(s, "## Task 140:", "## Failure, Rollback, and Real Nous Gate", (b) => b.replace("runtimeReadiness: composition.readiness\n", "runtimeReadiness: composition.readiness.getReadiness()\n"))],
  ["Task 140 U accessor-only projection", (s) => replaceSection(s, "## Task 140:", "## Failure, Rollback, and Real Nous Gate", (b) => b.replace("toProductionRuntimeReadinessRouteDto(composition.readiness.getReadiness())", "toProductionRuntimeReadinessRouteDto(rawCompositionInput)"))]
];
try {
  audit(plan);
  for (const [label, mutate] of counterfactuals) {
    let rejected = false;
    try { audit(mutate(plan)); } catch { rejected = true; }
    if (!rejected) throw new Error(`counterfactual accepted: ${label}`);
  }
  console.log(`GREEN: Task 109 actual-caller factory-closed audit passed (${counterfactuals.length} anchored counterfactuals rejected).`);
} catch (error) {
  console.error(`RED: ${error.message}`);
  process.exitCode = 1;
}
NODE
```

- GREEN audit, full verification, self-review, and fresh-review evidence are
  appended below only after their corresponding commands complete. This R3
  entry supersedes no historical record while it is in progress.

### R3 Verification and Self-Review

- GREEN audit: the exact embedded command above exited 0 with `GREEN: Task 109
  actual-caller factory-closed audit passed (11 anchored counterfactuals
  rejected).` It rejected deletion or replacement of the Task 134 authority
  comparison, registration provenance, or real caller; the Task 135 verified
  caller, mounted-readback, forged-store, or swapped-tuple proof; and the Task
  140 real caller, registration provenance, W injection, or U accessor-only
  proof.
- Documentation gates: `git diff --check` exited 0 with no output and
  `npm run factory:check` exited 0 with `factory-readiness passed`.
- Verification environment checkpoint: the first `NODE_NO_WARNINGS=1 npm run
  verify` stopped before typecheck with `tsc: command not found`. The tracked
  lockfile existed while both `node_modules` and `node_modules/.bin/tsc` were
  absent; `npm ci --dry-run --ignore-scripts` accepted the pinned graph. The
  coordinator-approved dependency restoration `npm ci` changed no tracked
  file, and the fresh verifier then completed.
- Full verification: `NODE_NO_WARNINGS=1 npm run verify` exited 0 with
  `typecheck passed`; 189 test files passed with 3 skipped; 2,228 tests passed
  with 5 skipped; Vite built successfully (only its existing chunk-size
  advisory); and `factory-readiness passed`.
- Scope self-review: `git diff --name-only` lists only this append-only claim
  and the owned Lane R implementation plan. No source, test, shared contract,
  spec, registry, provider, or integration file changed.
- Interface and ownership self-review: the plan consumes the existing
  `TaskOrchestratorRunnerDispatchInput` and real
  `dispatchVerifiedTaskRunner` caller without changing either shared contract.
  CF-1 remains the sole shared-type freeze owner; Task 135 retains the
  R-owned factory closure; Task 140 remains the sole default-factory editor;
  H owns durable-handoff meaning; W receives the capability object only; and U
  owns the safe route DTO parser/projection. The new tests keep real Nous
  coordinator-only, preserve no-fallback and rollback gates, and do not
  authorize a provider call.
- Recovery status: ready for one fresh independent Task 109 plan re-review.
  This completion record supersedes R2 only for the actual-public-caller and
  factory-closed-tuple audit gap; every historical Task 109 claim record
  remains immutable evidence.
