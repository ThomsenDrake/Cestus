# Task 101 Claim: Resident Full-Vision Wave 0 Runtime Composition Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md` at `811458d2094dc166b10b9255d1829eae73f2d08e`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md` at `68fe8e87c9e6cd05e8e711fa9afd3e8e3c6cfaab`
- Task: Task 101 / Lane R — Runtime Composition specification
- Worker: Codex Task 101 runtime-composition specification author
- Task thread: `019f56d2-eb3b-7293-b7b9-bf0329f604b9`
- Branch: `codex/task-101-resident-full-vision-w0-runtime-spec`
- Worktree: `/home/drake/.codex/worktrees/6bb5/Cestus`
- Base commit: `bb41ee02d7061f838917d378bccf17a6a6ad9e80`
- Claimed at: `2026-07-12T19:54:56Z`
- Model configuration: GPT-5.6 Terra / Extra High, assigned and confirmed by the coordinator and user
- Status: ready-for-review

## Ownership

- Create: `docs/superpowers/specs/2026-07-12-resident-agent-runtime-composition-design.md`
- Create: `docs/agentic/claims/task-101-resident-full-vision-w0-runtime-spec.md`

Every other tracked repository file is forbidden, including production, test,
runtime, UI, provider, shared-contract, implementation-plan, program-control,
registry, and acceptance-matrix files. Only Lane R may later own
`packages/local-runtime/src/agent-runtime-factory.ts` and its
`createProductionAgentRuntimeCapabilities(...)` composition boundary.

## Authorization And Stop Conditions

The coordinator-issued scoped authorization permits only Task 101 using
`superpowers:subagent-driven-development` where relevant, documentation
RED/GREEN, fresh task review, and verification-before-completion. It requires
the governing documents above, prohibits any merge into `neo`, and stops after
one committed Lane R specification for a fresh coordinator review and written
R-spec approval. It does not authorize Task 109, an implementation plan,
production or test code, a worker dispatch, a contract-freeze change, or a
merge.

Stop and escalate for data-loss or fallback-storage risk, schema, vocabulary,
or ownership conflict, unavailable required dependency, unavailable assigned
model configuration, or repeated verifier failure.

## Required Evidence

- Documentation RED: a focused audit fails while the required R specification
  is absent or lacks the required mounted-context, prompt, provider-policy,
  runner, store, readiness, failure, provenance, ownership, dependency, and
  acceptance coverage.
- Documentation GREEN: the focused audit, `git diff --check`, and
  `npm run factory:check` pass after the specification is complete.
- Full verification: `npm run verify` passes before the specification commit.
- Completion: commit only this claim and the owned specification, then stop for
  a fresh coordinator review and written R-spec approval.

## Documentation RED/GREEN Evidence

- RED: a focused `node --input-type=module` audit of
  `docs/superpowers/specs/2026-07-12-resident-agent-runtime-composition-design.md`
  exited 1 before the specification existed. It reported all ten required
  design families as absent: mounted context, prompt, provider-policy, runner,
  mounted stores, readiness, failures, provenance, handoffs, and acceptance.
- GREEN: the same focused audit exited 0 after the specification was written
  and confirmed all required headings plus one-resident, exclusive-factory,
  no-fallback, durable-readback, secret-safe, contract-freeze, and review-stop
  bindings. It also rejected unfinished markers and an unauthorized Task 109
  reference.
- `git diff --check` exited 0 with no output and `npm run factory:check`
  exited 0 with `factory-readiness passed` after the GREEN audit.
- The first full verifier run stopped at the isolated-worktree dependency gate
  with `tsc: command not found`. `npm ci` restored lockfile-pinned dependencies
  without tracked-file changes. The fresh `npm run verify` then completed after
  reporting `typecheck passed`; it ran the deterministic test, UI-build, and
  factory-readiness stages defined by the verified script.

## Specification Self-Review

- Coverage: the specification defines authoritative mounted context, exact
  prompt binding, provider feasibility/readiness, specialist runners, mounted
  derivative and handoff stores, readiness, and a stable composition-failure
  vocabulary.
- Invariants: one resident identity, trusted mounted authority, append-only
  ledger semantics, provenance, no fallback write path, secret-safe provider
  boundary, and terminal handoff readback are explicit requirements.
- Ownership: only Lane R may later own the default runtime factory; the
  document assigns provider configuration to P, handoff contracts to H,
  lifecycle behavior to W, bounded policy to L, browser consumption to U, and
  acceptance to A.
- Freeze discipline: proposed interfaces are explicitly non-canonical until
  CF-1 resolves versions, parser/schema compatibility, and any shared
  vocabulary or ownership conflict.
- Stop disposition: fresh coordinator R-spec review and written lane approval
  remain required. This author does not self-approve, create an implementation
  plan, dispatch a worker, or merge into `neo`.

## Review Repair 1 — Invocation Readiness And Handoff Store Typing

The coordinator-authorized repair scope is limited to the two confirmed Lane R
review findings: structural readiness was conflated with provider invocation
readiness, and material/manifest persistence was conflated under one manifest
store type. The repair preserves H as the handoff-contract owner and R as
compositor/consumer. The supplied original reviewer task ID was not retrievable
through the task reader, so this repair relies only on the two confirmed
findings reproduced in the scoped coordinator authorization.

### Focused Documentation RED

Exact command form:

```bash
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const text = readFileSync("docs/superpowers/specs/2026-07-12-resident-agent-runtime-composition-design.md", "utf8");
const failures = [];
if (!/structuralStatus:/.test(text) || !/providerInvocation:/.test(text) || !/ready-to-invoke/.test(text)) failures.push("readiness does not separate structural and provider-invocation state");
if (!/safeReason:/.test(text) || !/requirements:/.test(text) || !/executable:/.test(text)) failures.push("provider invocation state lacks safe reason, requirements, or derived executable relation");
if (/handoffMaterialStore: SpecialistHandoffManifestStore/.test(text) || /handoffManifestStore: SpecialistHandoffManifestStore/.test(text)) failures.push("material and manifest persistence still share SpecialistHandoffManifestStore");
if (!/MountedHandoffMaterialStore/.test(text) || !/MountedHandoffManifestStore/.test(text)) failures.push("distinct material and manifest store capability names are absent");
if (!/material-before-manifest/.test(text) || !/manifest-before-recorded/.test(text)) failures.push("handoff persistence ordering assertions are absent");
if (failures.length === 0) process.exitCode = 2;
else { console.error(`RED: ${failures.join("; ")}`); process.exitCode = 1; }
NODE
```

Observed result: exit 1 with all five assertions failing: no structural versus
invocation state, no safe reason/requirements/executable relation, conflated
`SpecialistHandoffManifestStore` material/manifest fields, no distinct store
capabilities, and no material-before-manifest/manifest-before-recorded proof.

### Focused Documentation GREEN

Exact command form:

```bash
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const text = readFileSync("docs/superpowers/specs/2026-07-12-resident-agent-runtime-composition-design.md", "utf8");
const required = [
  /structuralStatus: "ready" \| "not-ready" \| "blocked" \| "unavailable"/,
  /providerInvocation: ProviderInvocationReadiness/,
  /"ready-to-invoke"/,
  /"waiting-for-human-approval"/,
  /readonly safeReason: string/,
  /readonly requirements: ProviderInvocationRequirements/,
  /executable is true only when structuralStatus is ready[\s\S]*providerInvocation\.state is ready-to-invoke/,
  /waiting-for-human-approval"` is explicitly\nnon-executable/,
  /rejects every state except\n`ready-to-invoke`/,
  /interface MountedHandoffMaterialStore/,
  /interface MountedHandoffManifestStore/,
  /writeMaterial\(/,
  /writeManifest\(/,
  /interface MountedHandoffMaterialReceipt/,
  /interface MountedHandoffManifestReceipt/,
  /material-before-manifest proof/,
  /manifest-before-recorded proof/,
  /manifest readback binds the prior verified material hash/,
  /Lane H remains\nthe owner of material\/manifest\/handoff contracts/
];
const conflated = ["handoffMaterialStore: SpecialistHandoffManifestStore", "handoffManifestStore: SpecialistHandoffManifestStore"].filter((value) => text.includes(value));
if (required.some((pattern) => !pattern.test(text)) || conflated.length) process.exitCode = 1;
else console.log("GREEN: readiness is structurally and invocation distinct; handoff material/manifest persistence is type-distinct and order-verified");
NODE
```

Observed result: exit 0 with the printed GREEN result. The assertions prove
that structural `ready` is not an invocation grant; a human-approval wait is
non-executable; consumer dispatch requires `ready-to-invoke`; material and
manifest use distinct typed operations and hashes; and material-before-manifest
plus manifest-before-recorded are explicit verified ordering conditions.

### Repair Invariants

- `structuralStatus: "ready"` means only that mounted non-provider composition
  is sound. It is never a provider-call or runner-dispatch grant.
- `executable` is derived only when structural status is ready and the complete
  provider-invocation state is `ready-to-invoke` with current satisfied
  feasibility, approval, budget, and lock requirements.
- A `waiting-for-human-approval`, unavailable, or blocked provider state is
  non-executable and cannot be consumed as an execution capability.
- Material and manifest persistence have distinct capability types, operations,
  receipts, hashes, and exact readbacks. A verified material readback is
  required before manifest persistence, and a verified manifest readback that
  binds that material hash is required before the recorded event.

### Repair Gate

`git diff --check` exited 0 with no output and `npm run factory:check` exited
0 with `factory-readiness passed` after the focused GREEN command. The fresh
`npm run verify` completed after the repair documentation audit and factory
gate. The final verifier is rerun after this ready-for-review evidence update
and before the forward-only repair commit.
