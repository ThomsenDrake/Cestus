# Task136 V4 Blocked-Card Scope Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` and
> `superpowers:test-driven-development` for each implementation task below.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the executable V4 scope for CF1-HR and G136-SC, perform the
one authorized exceptional Task126-R repair, and return all three cards to the
strict ordered release path without changing prior evidence or safety
semantics.

**Architecture:** A four-file assurance amendment makes the V4 contract match
the approved unreleased-card ownership. After that reviewed base is integrated,
the preserved CF1 and G136 branches advance with forward commits only. The
Task126 analyzer repair is independent and may run concurrently, but final
review occurs only after its branch includes the reviewed assurance base.

**Tech Stack:** TypeScript, Vitest, Node.js ESM and `node:test`, JSON, Bash,
Git, the append-only event ledger, and existing Task136 assurance tooling.

## Global Constraints

- Governing design:
  `docs/superpowers/specs/2026-07-17-task136-v4-blocked-card-scope-correction-design.md`.
- Preserve V1, V2, and V3 at their exact design hashes. Preserve raw strict
  release records 1-13 byte-for-byte and retain the exact 29-card order and
  every prerequisite.
- Only the two unreleased V4 cards `CF1-HR` and `G136-SC` gain paths or command
  tests. `Task126-R` retains its current V4 scope and production bytes.
- Preserve append-only ledger semantics, exact provenance, projection
  rebuildability, one resident identity, no fallback writes, PRR send gates,
  legal locks, and proposal-only ontology mutation.
- Handoff V1 remains strict replayable history and is never executable current
  authority. Handoff V2 consumes a factory-derived branded witness and never a
  caller structural authority binding.
- No public or compatibility gateway route may append tool completion from a
  structural result. Resident bookkeeping is not domain-result authority.
- Every implementation and review child uses `gpt-5.6-terra` with `xhigh`
  reasoning. Reviewers are read-only; SDD/TDD is not relevant or authorized
  for reviewers.
- Every implementation dispatch must include exactly:
  “Task-scoped subagent-driven development and test-driven development are explicitly approved for this task.”
- Only the coordinator edits the program registry, integrates candidates, and
  appends strict release records. Children never merge themselves, push, or
  touch `neo`.
- Preserve every inherited claim, RED, GREEN, and repair commit. Do not reset,
  rebase, amend, squash, discard, reorder, or rewrite history.
- Stop for data-loss risk, schema conflict outside the authorized paths,
  unavailable dependency, credential/external-service need, or repeated
  verifier failure. P2/style/hypothetical findings are backlog. Obey each
  card's remaining repair ceiling exactly.

## File Map

| Task | Responsibility | Exact files |
| --- | --- | --- |
| 1 | V4 executable scope and assurance pins | `docs/agentic/contracts/task136-bounded-assurance-v4.json`; `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`; `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`; `docs/agentic/claims/task-136-v4-blocked-card-scope-correction.md` |
| 2 | Exceptional Task126 lexical binding analysis | `packages/agent/test/byok-provider-imports.test.ts`; `docs/agentic/claims/task-126-resident-full-vision-w1-byok-provider.md` |
| 3 | Authority-bound complete handoff readback | the exact 14 CF1 paths in the governing design |
| 4 | Domain-result-authoritative scheduler completion | the exact 11 G136 paths in the governing design |
| 5 | Reviews, integration, records 14-16 | coordinator registry/integration state only; reviewers write no files |

---

### Task 1: Amend and pin the executable V4 scope

**Branch/worktree:** A new isolated worktree from program commit
`a5c192842bbedb4dc7801bedf8908c025dc33dfb`, on branch
`codex/task136-v4-blocked-card-scope-correction`.

**Interfaces:**

- Consumes: the immutable V1-V3 contracts, current V4, raw release records
  1-13, and the existing checker exports.
- Produces: the same V4 schema/graph versions with corrected CF1/G136 paths,
  commands, assurance fingerprint, mutants, and a verified 13-record prefix.

- [ ] **Step 1: Claim the four-file assurance amendment**

  Create the claim with `claimed -> implementing`, exact base, exact files,
  design/plan paths, immutable hashes, no-registry/no-neo rules, model/reasoning,
  and the required implementation authorization sentence. Commit only the
  claim:

  ```bash
  git add docs/agentic/claims/task-136-v4-blocked-card-scope-correction.md
  git commit -m "chore: claim task136 v4 blocked-card scope correction"
  ```

- [ ] **Step 2: Write the assurance RED before changing contract/checker code**

  In `task136-bounded-assurance.test.mjs`, define the exact CF1 and G136 arrays
  from the design and assert them against the contract. Add one-fact mutants
  for missing, extra, reordered, wrong-disposition, and command-omitted paths.
  Add immutable-prefix assertions equivalent to:

  ```js
  assert.deepEqual(contract.releaseGraph.cards.map(({ id }) => id), expectedIds);
  assert.equal(sha256(readFileSync(v1Path)), immutableV1Hash);
  assert.equal(sha256(readFileSync(v2Path)), immutableV2Hash);
  assert.equal(sha256(readFileSync(v3Path)), immutableV3Hash);
  assert.deepEqual(rawReleaseRecordHashes.slice(0, 13), expectedRawRecordHashes);
  ```

  Commit the test-only RED after observing failure against the old CF1 path
  list:

  ```bash
  node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
  git add scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs docs/agentic/claims/task-136-v4-blocked-card-scope-correction.md
  git commit -m "test: require corrected v4 blocked-card ownership"
  ```

- [ ] **Step 3: Apply the minimal contract and checker GREEN**

  Replace only the two card path/command values described by the design. Keep
  card IDs, order, prerequisites, transfer targets, all other cards, schema
  version, graph version, composition grammar/corpus, ABI corpus, and release
  compatibility unchanged. Recompute the existing canonical assurance
  fingerprint using the checker's own projection and pin that one value in
  `task136-bounded-assurance.mjs`.

  Extend the checker mutants only enough to prove both exact path arrays and
  exact test-command projections. Do not introduce a generic scope amendment,
  transfer language, new card, new contract generation, or compatibility
  exception.

- [ ] **Step 4: Verify the assurance candidate**

  ```bash
  node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
  node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode contract
  node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode repository
  git diff --check
  npm run factory:check
  npm run verify
  test ! -L node_modules
  test -x node_modules/.bin/vitest
  test -z "$(git status --porcelain)"
  ```

  Contract mode must emit each existing static marker exactly once. Repository
  mode must emit exactly:

  ```text
  TASK136_REPOSITORY_PREFIX_OK records=13 commands=13
  repository release closure incomplete: expected 29 records, found 13
  ```

  The closure message is the expected nonzero terminal result; any earlier
  error is a failure.

- [ ] **Step 5: Commit the GREEN and report exact pins**

  Append the final fingerprint, pretty-JSON SHA-256, commands, test results,
  and clean state to the claim, then commit:

  ```bash
  git add docs/agentic/contracts/task136-bounded-assurance-v4.json \
    scripts/resident-agent/assurance/task136-bounded-assurance.mjs \
    scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs \
    docs/agentic/claims/task-136-v4-blocked-card-scope-correction.md
  git commit -m "feat: correct task136 v4 blocked-card scope"
  ```

  Return `DONE`, the three ordered commits, exact hashes, and verification
  evidence. Do not edit the registry or integrate.

### Task 2: Perform the one exceptional Task126-R repair

**Branch/worktree:** Preserve branch `codex/task126-r-reader-boundary` and all
five commits through `4f39cfb2bc3064c07a6ebc3f10bc45dc748d7624` in
`/home/drake/.codex/worktrees/ee6e/Cestus`.

**Interfaces:**

- Consumes: the current AST inventory and policy fixtures in
  `byok-provider-imports.test.ts`.
- Produces: binding-aware lexical evaluation used only by the import-policy
  test; no production or export change.

- [ ] **Step 1: Record the explicit ceiling exception**

  Append the authorization, exact two-file ceiling, model/reasoning, no further
  repair rule, and `blocked -> implementing-exception` transition to the
  existing claim. Do not alter prior evidence.

- [ ] **Step 2: Add and observe the causal RED**

  Add positive violation fixtures for all of:

  ```ts
  const { require: loader } = module; loader("./byok-provider.js");
  const { ["require"]: loader } = module; loader("./byok-provider.js");
  createRequire(import.meta.url)("./byok-provider.js");
  const load = createRequire(import.meta.url); load("./byok-provider.js");
  (0, require)("./byok-provider.js");
  ```

  Add negative fixtures for shadowed parameter/local/import bindings of
  `require`, `module`, and `createRequire`; destructuring from a custom object;
  and `createRequire` imported from a non-`node:module` package. Run and commit
  the failing fixtures before changing the analyzer:

  ```bash
  npm test -- packages/agent/test/byok-provider.test.ts packages/agent/test/byok-provider-imports.test.ts
  git add packages/agent/test/byok-provider-imports.test.ts docs/agentic/claims/task-126-resident-full-vision-w1-byok-provider.md
  git commit -m "test: expose task126-r lexical loader bindings"
  ```

- [ ] **Step 3: Implement the minimal binding-aware GREEN**

  Replace the global identifier-name alias map with lexical-scope bindings and
  a finite value domain equivalent to:

  ```ts
  type StaticValue =
    | { readonly kind: "string"; readonly value: string }
    | { readonly kind: "standard-require" }
    | { readonly kind: "standard-module" }
    | { readonly kind: "node-module-namespace" }
    | { readonly kind: "create-require-factory" }
    | { readonly kind: "unrelated" }
    | { readonly kind: "unknown" };
  ```

  Resolve identifiers by their actual TypeScript symbol/declaration and
  containing lexical scope. Propagate only immutable const bindings, exact
  object destructuring, property/element access, transparent wrappers, and the
  rightmost comma operand. Treat the result of the official `node:module`
  `createRequire` factory as `standard-require`. Ambient `require`/`module`
  are standard only when the checker resolves no shadowing declaration.

  The existing fail-closed unresolved-standard-loader behavior remains. An
  unrelated or shadowed loader remains allowed. Do not modify source files or
  relax any existing violation.

- [ ] **Step 4: Verify and commit the exceptional GREEN**

  ```bash
  npm test -- packages/agent/test/byok-provider.test.ts packages/agent/test/byok-provider-imports.test.ts
  npm test -- packages/agent/test/byok-provider.test.ts packages/agent/test/byok-provider-imports.test.ts packages/agent/test/openai-compatible-provider.test.ts packages/agent/test/provider-readiness.test.ts
  npm run typecheck
  npm run verify
  git diff --check
  npm run factory:check
  test ! -L node_modules
  test -x node_modules/.bin/vitest
  test -z "$(git status --porcelain)"
  ```

  Append exact evidence to the claim and commit only the two authorized files:

  ```bash
  git add packages/agent/test/byok-provider-imports.test.ts docs/agentic/claims/task-126-resident-full-vision-w1-byok-provider.md
  git commit -m "fix: bind task126-r loader analysis to lexical scope"
  ```

  Before final review, wait until CF1-HR is strict record 14, then merge that
  current program base forward with a normal merge commit; never rebase. Rerun
  every gate from the resulting exact candidate. Return `DONE` with ordered
  history and evidence.

### Task 3: Implement the authority-bound CF1-HR contract

**Branch/worktree:** Preserve claim commit
`56bbb10b745b742a86b7f63b878aadc105efee0c` on
`codex/cf1-handoff-readback` in `/home/drake/.codex/worktrees/00c5/Cestus`.
Merge the reviewed assurance integration base forward before the RED.

**Interfaces:**

- Consumes: the frozen durable handoff design, the Task119 V2
  `HandoffReadback.v1` schema, and the authenticated portable mounted-store
  controller.
- Produces: strict manifest V1/V2 family, strict prepared/recorded V1/V2
  payloads, a process-local authority witness, authority-bound recording, and
  complete replayable V2 projection.

- [ ] **Step 1: Update the preserved claim for the corrected 14-path scope**

  Record the exact new base, all 14 paths, exact focused/cross commands,
  `implementing`, the remaining one-repair ceiling, model/reasoning, and the
  required implementation authorization sentence.

- [ ] **Step 2: Write one causal RED across the owned tests**

  Add failing tests for:

  - strict V2 manifest construction, canonical hashing, round-trip, exact
    seven-field binding, V1 rejection by V2, and V1 immutable replay;
  - structural/copied/consumed/stale/remounted authority witnesses;
  - exact portable snapshot-to-binding derivation and before/after currentness;
  - V2 prepared/recorded payload parsing and binding mismatch rejection;
  - complete V2 projection/readback and V1 `legacy-unbound` non-executability;
  - missing/swapped/cross-run/cross-task/stale manifest, event, terminal,
    task-status, source, artifact, and authority evidence;
  - Task119 completed-result acceptance of the exact CF1 readback and rejection
    of any reduced or mismatched view.

  The wished-for authority surface is:

  ```ts
  export interface HandoffAuthorityBinding {
    readonly workspaceIdentityHash: `sha256:${string}`;
    readonly mountGeneration: string;
    readonly ledgerStoreIdentity: string;
    readonly artifactStoreIdentity: string;
    readonly ledgerHighWaterEventId: string;
    readonly policyHash: `sha256:${string}`;
    readonly activeLocksHash: `sha256:${string}`;
  }

  export interface MountedSpecialistHandoffAuthorityWitness {
    readonly schemaVersion: "agent-mounted-specialist-handoff-authority.v1";
  }
  ```

  Commit only claim/tests after the exact focused command fails for missing V2
  behavior:

  ```bash
  npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/ontology/test/agent-contracts.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts
  git add packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/ontology/test/agent-contracts.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts docs/agentic/claims/cf1-h-task136-complete-handoff-readback-projection.md
  git commit -m "test: require authority-bound complete handoff readback"
  ```

- [ ] **Step 3: Implement the minimal V2 path without changing V1 behavior**

  Add a separate authority-bound record function whose input contains the
  branded witness, not a binding object. The witness module owns a WeakMap;
  consumption returns a frozen binding plus `revalidateCurrent`. The portable
  producer issues the witness from its controller snapshot using the exact
  design derivation.

  Build V2 only after witness consumption and revalidate before and after
  manifest store writes/reads, prepared append/readback, recorded
  append/readback, terminal readback, and final projection. Carry one identical
  binding through manifest and both event payloads. Keep the old V1 function
  and parser strict and separate.

  The projection's discriminant is the manifest schema and exact event payload
  family. It never upgrades V1 by inference. A complete V2 result returns every
  field of the frozen Task119 HandoffReadback; any incomplete chain returns a
  safe unavailable/inconsistent result without a write.

- [ ] **Step 4: Verify and commit CF1 GREEN**

  Run the focused command above, then:

  ```bash
  npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/ontology/test/agent-contracts.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts packages/agent/test/specialist-handoffs.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts
  npm run typecheck
  npm run verify
  git diff --check
  npm run factory:check
  test ! -L node_modules
  test -x node_modules/.bin/vitest
  test -z "$(git status --porcelain)"
  ```

  Append exact counts and evidence to the claim. Commit exactly the 14 paths:

  ```bash
  git add packages/agent/src/specialist-runner-kernel.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/src/specialist-handoff-projection.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/src/specialist-handoff-manifest.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/src/specialist-handoff-authority.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/ontology/src/contracts.ts packages/ontology/test/agent-contracts.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts docs/agentic/claims/cf1-h-task136-complete-handoff-readback-projection.md
  git commit -m "feat: record complete authority-bound handoff readback"
  ```

### Task 4: Apply the single G136-SC consolidated repair

**Branch/worktree:** Preserve `57a1f863`, `c119be76`, and `80c20c81` on
`codex/g136-scheduler-completion-adapter` in
`/home/drake/.codex/worktrees/7837/Cestus`. Merge the reviewed assurance base
forward before the repair RED.

**Interfaces:**

- Consumes: current gateway request/approval/claim streams and independently
  appended domain event locators returned by approved descriptors.
- Produces: opaque completion evidence accepted by the sole gateway append
  path; no caller-structural completion API remains.

- [ ] **Step 1: Update the claim and write the consolidated repair RED**

  Record the corrected 11 paths, exact commands, accepted review findings,
  `blocked -> implementing-repair`, exhausted-after-this-packet rule,
  model/reasoning, and required implementation authorization sentence.

  Add counterfactual tests for direct public structural completion; descriptor
  self-minted resident step; missing/pre-claim/duplicate/swapped/cross-request/
  cross-run/stale/unreadable result locator; artifact/read-model mismatch;
  concurrent terminal append; and one valid independently appended domain
  result. Convert fake-loop and domain-dispatcher positive fixtures to append
  the exact durable result before returning its locator.

  Run the corrected focused command and commit only the test/claim RED:

  ```bash
  npm test -- packages/agent/test/tool-gateway.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/resident-loop-scheduler-completion.test.ts packages/agent/test/execution-loop.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts
  git add packages/agent/test/tool-gateway.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/resident-loop-scheduler-completion.test.ts packages/agent/test/execution-loop.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts docs/agentic/claims/task-136-scheduler-completion-adapter.md
  git commit -m "test: require independent scheduler domain result authority"
  ```

- [ ] **Step 2: Implement the minimal completion GREEN**

  Make structural `completeTool` inaccessible outside the gateway closure.
  The exposed scheduler method accepts only evidence present in the completion
  adapter's WeakSet. The adapter normalizes the returned locator, rereads its
  exact events, rejects gateway/resident-bookkeeping event families, validates
  causal/request/run/tool/preview/claim/order/result equality, rereads current
  request state, and freezes opaque evidence.

  Route scheduler and fake execution loop through that adapter after a durable
  execution claim. No descriptor helper appends an attestation or bookkeeping
  record on behalf of the domain result. Failure uses the existing safe failed
  terminal path and never appends completion.

- [ ] **Step 3: Verify and commit the G136 GREEN**

  Run the focused command above, then:

  ```bash
  npm test -- packages/agent/test/tool-gateway.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/resident-loop-scheduler-completion.test.ts packages/agent/test/execution-loop.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts packages/agent/test/scheduler-types.test.ts packages/agent/test/projection.test.ts packages/agent/test/domain-execution-descriptors.test.ts
  npm run typecheck
  npm run verify
  git diff --check
  npm run factory:check
  test ! -L node_modules
  test -x node_modules/.bin/vitest
  test -z "$(git status --porcelain)"
  ```

  Append exact evidence and commit exactly the corrected card paths. Return
  `DONE` with the full preserved history. This consumes G136's only repair;
  no later automatic fix is allowed.

### Task 5: Review, integrate, and release in strict order

**Owner:** Sole coordinator. Reviewers are read-only.

- [ ] **Step 1: Review and integrate the assurance amendment**

  Dispatch exactly one concurrent Terra/xhigh pair against its exact candidate:
  architecture/invariants and executability/adversarial. Architecture checks
  immutable contracts/records, exact card paths, no generic transfer/scope
  language, and unchanged prerequisites. Executability runs the assurance
  test, contract markers, expected 13-record repository prefix/closure failure,
  full verify, diff, factory, dependency, and clean-state gates. At most one
  consolidated assurance repair and one final pair are allowed.

- [ ] **Step 2: Review, integrate, and release CF1-HR as record 14**

  Architecture checks V1 immutability, strict V2 ABI, branded capability
  membership/currentness, exact binding propagation, no fallback, complete
  readback, and non-executable legacy replay. Executability reproduces all
  focused/cross/final gates and adversarial mismatches. One consolidated repair
  and one final pair remain only if the first pair reproduces a P0/P1.

  After approval, integrate all CF1 commits, reproduce the gates from
  integrated bytes, append strict record 14, and require the exact 14-record
  repository prefix followed by the expected 29-record closure failure.

- [ ] **Step 3: Review, integrate, and release Task126-R as record 15**

  First merge the record-14 program base forward into the exceptional Task126
  branch and rerun every gate. Dispatch exactly one final concurrent
  Terra/xhigh architecture/executability pair. Require a literal APPROVED or a
  reproduced P0/P1 with exact fixture. No further automatic repair follows
  this pair. After approval, integrate all preserved history, rerun gates,
  append strict record 15, and require the exact 15-record prefix/closure
  result.

- [ ] **Step 4: Advance records 16-21 before reviewing G136-SC**

  Compute and execute each prerequisite-satisfied card under the standing
  finite-factory rules. Implementations with disjoint ownership may run ahead,
  but each review is bound to the then-current program base and each release is
  appended only in contract order.

- [ ] **Step 5: Review G136-SC at the current record-21 base**

  Merge the current record-21 program base forward into the preserved G136
  branch, rerun all gates, and only then dispatch its final concurrent pair.
  Architecture checks the sole opaque completion append and independent domain
  authority. Executability reproduces every direct/self-mint/swapped/concurrent
  counterfactual and the positive durable domain case. No further automatic
  repair follows this pair. After approval, integrate, rerun from integrated
  bytes, and append strict record 22.

- [ ] **Step 6: Preserve strict integration order for every candidate**

  Integrate all preserved commits with ordered cherry-picks or forward merges,
  never history rewriting. Strict order is:

  1. `CF1-HR` as record 14;
  2. `Task126-R` as record 15;
  3. `Task133` as record 16.

  `G136-SC` may be implemented early but is not reviewed until its current
  record-21 base exists. After every integration, rerun the card/cross/
  typecheck/verify/diff/factory/dependency/clean gates from integrated bytes.
  Append the exact strict record only after all gates pass, then require the
  ordered repository prefix marker followed by the expected 29-record closure
  failure.

- [ ] **Step 7: Continue automatically through the remaining graph**

  After each strict release, compute all prerequisite-satisfied disjoint cards
  from the corrected contract, dispatch every eligible implementation in
  parallel under finite-factory rules, and integrate only in contract order.
  After record 29, continue through the governing Wave 3-5 plans and Task153
  release acceptance. Never touch `neo`; finish on the program integration
  branch with the exact releasable SHA and complete served-checkout evidence.
