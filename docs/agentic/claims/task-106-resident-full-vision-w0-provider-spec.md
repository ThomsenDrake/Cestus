# Task 106 Claim: Resident Full-Vision Wave 0A Provider and Credentials Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@811458d2094dc166b10b9255d1829eae73f2d08e`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@68fe8e87c9e6cd05e8e711fa9afd3e8e3c6cfaab`
- Task and lane: Task 106 / P / Wave 0A
- Status: claimed
- Branch: `codex/task-106-resident-full-vision-w0-provider-spec`
- Worktree: `/home/drake/.codex/worktrees/task-106-resident-full-vision-w0-provider-spec`
- Base commit: `52bc6b6dc81373d6026e7465becde75bd1c6448e`
- Claimed at: `2026-07-12T20:47:29Z`
- Host configuration: GPT-5.6 Terra / Extra High, user-confirmed for this task

## Authorization and Scope

The coordinator-issued scoped authorization under the Standing Coordinator
Delegation authorizes Task 106 only: a Lane P Wave 0A specification, its
documentation RED/GREEN evidence, fresh review, and verification-before-
completion. It authorizes use of
`superpowers:subagent-driven-development` where relevant and documentation
test-driven development. It does not authorize Task 114 or later, a Lane P
implementation plan, production code, tests, runtime, UI, registry, shared
contract, provider configuration, or a merge into `neo`.

Owned files:

- `docs/superpowers/specs/2026-07-12-resident-agent-provider-credentials-design.md`
- `docs/agentic/claims/task-106-resident-full-vision-w0-provider-spec.md`

Every other tracked file is forbidden.

## Required Evidence and Stop Point

- Documentation RED: record a reproducible coverage audit that fails while
  the required provider and credential architecture is absent.
- Documentation GREEN: run the same audit after writing the specification,
  then run `git diff --check` and `npm run factory:check`.
- Full verification: run `npm run verify` before the task documentation
  commit.
- Fresh review: required after the scoped documentation commit; this author
  does not self-approve.
- Stop: one committed Lane P specification and claim, then wait for fresh
  review and written coordinator P-spec approval. Do not create Task 114,
  dispatch a worker, or start implementation planning.

## Governing Invariants

- Cestus retains the one resident identity `agent_default`; providers,
  harnesses, subscriptions, credentials, and local models are backends only.
- Preserve append-only ledger semantics, exact provenance, rebuildable
  projections, independently governed approval consumption, mounted-workspace
  authority, and durable handoff readback.
- Keep secrets outside the portable workspace; durable portable state contains
  typed secret-free references only. No internal fallback ledger, projection,
  artifact, derivative, or secret store may be used when the mounted workspace
  is unavailable or fails identity verification.
- Remote prompt or evidence-byte transfer is approved against the exact
  audited boundary and revalidated independently at consumption. Provider
  adapters cannot self-approve or broaden provider, credential, budget,
  approval, or data-transfer policy.
- Diagnostics, readiness DTOs, prompts, claims, live evidence, and provider
  feasibility records remain secret-safe. Unofficial token, cookie, browser
  storage, CLI-auth-store, or session extraction is forbidden.
- Deterministic tests remain credential-free. Real approved Nous is the
  required live-provider reference gate where provider behavior is accepted.
- Newsroom/team scope, multi-user authorization, shared hosting, and
  autonomous external effects remain out of scope.

## Replacement Author Handoff and Execution Record

This append-only record supersedes the original author only for current Task
106 execution. The claim metadata, original branch/worktree, original
claim-only commit `6fb76fb1969fc074066ea5f5fbeb4e101bb3ced5`, and all text
above remain historical evidence and are not rewritten.

- Recorded at: `2026-07-12T21:01:51Z`
- Replacement branch and worktree:
  `codex/task-106-resident-full-vision-w0-provider-spec-recovery` /
  `/home/drake/.codex/worktrees/task-106-resident-full-vision-w0-provider-spec-recovery`
- Replacement base: `6fb76fb1969fc074066ea5f5fbeb4e101bb3ced5`
- Original worktree disposition: preserved without mutation; no original
  specification or uncommitted work was used as task evidence.
- Current status: `in-progress` (replacement documentation-only work order).
- Coordinator handoff basis: `RV-0-P-002` supersedes `RV-0-P-001` only for
  assignment/status and requires this forward-only handoff before the owned
  specification changes.
- Host configuration: GPT-5.6 Terra / Extra High, user-confirmed for this
  replacement; no fallback was selected.

### Documentation RED

The following reproducible audit was run before the specification existed:

```bash
node --input-type=module - <<'NODE'
import { existsSync, readFileSync } from 'node:fs';
const path = 'docs/superpowers/specs/2026-07-12-resident-agent-provider-credentials-design.md';
const required = [
  '## Scope, Ownership, And Non-Canonical Boundaries',
  '## Resident Identity And Mounted-Workspace Authority',
  '## Provider Policy And Readiness',
  '## Credential References And OS Secret Resolution',
  '## Provider Capability Contracts',
  '## Audited Prompt And Provider-Byte Boundary',
  '## Provider-Specific Feasibility',
  '## Diagnostics, Provenance, And Durable Handoffs',
  '## Acceptance And Verification',
  '## Deferred Decisions And Stop Conditions',
  'BYOK',
  'OS secret',
  'local model',
  'Nous',
  'Codex',
  'xAI',
  'agent_default',
  'no fallback',
  'independent human approval',
  'credential-free',
  'real approved Nous',
  'unofficial token'
];
if (!existsSync(path)) {
  console.error(`RED provider-spec coverage audit: ${path} is absent; ${required.length} required assertions are untestable.`);
  process.exit(1);
}
const text = readFileSync(path, 'utf8');
const missing = required.filter((needle) => !text.includes(needle));
if (missing.length > 0) {
  console.error(`RED provider-spec coverage audit: missing ${missing.length} assertion(s): ${missing.join(' | ')}`);
  process.exit(1);
}
console.log(`GREEN provider-spec coverage audit: ${required.length} required assertions present.`);
NODE
```

Observed result: exit `1` with `RED provider-spec coverage audit:
docs/superpowers/specs/2026-07-12-resident-agent-provider-credentials-design.md
is absent; 22 required assertions are untestable.` This failure is the
expected absence-of-architecture control, not a verifier failure.

### Documentation GREEN

The same coverage audit exited `0` and printed `GREEN provider-spec coverage
audit: 22 required assertions present.` after the Lane P specification was
written. `git diff --check && npm run factory:check` then exited `0`; the
factory command printed `factory-readiness passed` and the whitespace check
printed no output.

The first full-verification attempt was blocked before typechecking because
this isolated recovery worktree did not yet have lockfile dependencies:
`sh: line 1: tsc: command not found`. The replacement restored only the
lockfile-defined ignored dependency tree with `npm ci --ignore-scripts`, which
exited `0` and changed no tracked file. The final `npm run verify` rerun then
exited `0`, observed through the replacement's `cestus106_verify_pass` exit
sentinel after the full script completed. Because the verify script chains its
gates, this proves its typecheck, deterministic tests, UI build, and factory
readiness all completed successfully. No live provider was invoked.

### Replacement Completion Handoff

- Status: `ready-for-review`; this forward-only status supersedes the
  replacement record's earlier `in-progress` status and does not self-approve.
- Scoped task commit contents: only this claim and
  `docs/superpowers/specs/2026-07-12-resident-agent-provider-credentials-design.md`.
- Live-provider gate: `not-applicable` to this specification-only task. The
  specification defines, but does not run, later real approved Nous acceptance.
- Review verdict: `pending` a fresh independent Task 106 specification review.
- Merge readiness: `not-ready`; Task 106 cannot begin Task 114, implement
  provider code, provision a credential, invoke a provider, or merge into
  `neo`.
- Stop point: wait for fresh review and written coordinator Lane P
  specification approval.

## Coordinator Review, Lane Approval, and Integration

- Recorded at: `2026-07-12T21:29:31Z`.
- Fresh review: independent reviewer `/root/review_task106_spec` approved
  replacement commit `285657a7879cdc47e321152c2bc5feb0ebe6088f` after checking
  the exact two-file scope, provider/credential policy, official-only
  feasibility, prompt boundary, secret safety, and verification evidence. The
  session used the user-confirmed GPT-5.6 Terra / Extra High configuration.
- Coordinator lane decision: under the Standing Coordinator Delegation at
  governing spec `811458d2094dc166b10b9255d1829eae73f2d08e`, Lane P's written
  specification is approved. This does not authorize Task 114, provider
  invocation, credential provisioning, or production work; the Wave 0A
  lane-spec stop remains in force.
- Integration: coordinator branch
  `codex/resident-agent-full-vision-program-plan` merged the reviewed recovery
  branch with merge commit `541718453155158ffe2189e9b53bf10416970de1`. No
  rebase was required because the recovery branch began from the preserved
  claim-only commit and merged without conflict. No merge into `neo` occurred.
- Coordinator verification: `git diff --check`, `npm run factory:check`, and
  `NODE_NO_WARNINGS=1 npm run verify` all exited 0 on the integrated checkout;
  the full verifier reported typecheck passed, 189 test files passed with 3
  skipped, 2,228 tests passed with 5 skipped, a successful Vite build with the
  existing chunk-size warning, and factory-readiness passed.
- Current status: `merged`. Archive remains coordinator-administered until the
  original/replacement author and reviewer handoffs, clean worktrees, branch
  ancestry, and durable registry evidence are all reconciled.
