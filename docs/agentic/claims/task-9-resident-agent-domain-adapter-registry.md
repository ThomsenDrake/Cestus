# Task Claim: Resident Agent Domain Adapter Registry Readiness

- Plan: `docs/superpowers/plans/2026-07-09-resident-agent-domain-execution-adapters-implementation.md`
- Task: Task 9, Adapter Registry Readiness And Cross-Family Verification
- Branch: `codex/resident-agent-domain-adapters-plan`
- Worktree: `/home/drake/.codex/worktrees/7018/Cestus`
- Worker: Codex with bounded Superpowers subagents
- Claimed at: 2026-07-09T23:00:00Z
- Base commit: `01b8e75 feat: add destructive repair execution adapters`
- Status: completed

## Scope

Add one scheduler-consumable, descriptor-only resident-agent domain adapter
registry covering provider byte transfer, PRR correspondence, accepted graph
review, export/report, destructive repair, and legacy staging. Record complete
AI-legible readiness metadata without constructing dependency-heavy executable
adapters, then verify every family and the shared dispatcher together.

## Files

- Create: `packages/agent/src/domain-execution-adapter-registry.ts`
- Create: `packages/agent/test/domain-execution-adapter-registry.test.ts`
- Modify: `packages/agent/src/adapters/destructive-repair.ts`
- Modify: `packages/agent/src/adapters/legacy-staging.ts`
- Modify: `packages/agent/test/legacy-staging-adapter.test.ts`
- Modify: `packages/agent/src/index.ts`
- Modify: `docs/agentic/software-factory.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/superpowers/plans/2026-07-09-resident-agent-domain-execution-adapters-implementation.md`
- Create: `docs/agentic/claims/task-9-resident-agent-domain-adapter-registry.md`

The dedicated registry module is the smallest supporting source file needed to
keep pure descriptor discovery separate from executable adapter construction.

## Invariants

- Registry discovery imports only frozen descriptors and named pure
  preview/current-preview function references; it never constructs an adapter
  or calls a provider, PRR transport, ontology service, governance service,
  workspace filesystem, or legacy runtime.
- Every `toolId@toolVersion` is unique and resolves to exactly one family and
  one authoritative domain target.
- Each registration names preview/current-preview builders, stale and lock
  checks, provenance requirements, idempotency fields, result mapper, safe
  failure categories, target service, and forbidden effects.
- Forbidden effects cannot describe the registration's own intended effect.
- Existing append-only, provenance, accepted-graph, PRR/legal, provider,
  export, destructive-repair, and legacy staging gates remain unchanged.

## Verification

- RED/GREEN: `npm test -- packages/agent/test/domain-execution-adapter-registry.test.ts`
- Review repair RED/GREEN:
  `npx vitest run packages/agent/test/domain-execution-adapter-registry.test.ts packages/agent/test/legacy-staging-adapter.test.ts`
- Cross-family target: the exact eight-file command from Task 9 Step 2.
- Final gates: `npm run typecheck`, `npm run ui:build`,
  `npm run factory:check`, `npm run verify`, and whitespace checks.

Recorded final-code evidence before the closing review verdict:

```text
Review repair RED: Test Files 2 failed; Tests 2 failed | 15 passed
Review repair GREEN: Test Files 2 passed; Tests 17 passed
Non-default resident identity RED: Test Files 1 failed; Tests 1 failed | 13 skipped

Cross-family: Test Files 8 passed; Tests 88 passed
Typecheck: passed
Vite build: passed with the existing chunk-size warning

Canonical metadata repair RED: Test Files 1 failed; Tests no tests
Canonical metadata repair GREEN: Test Files 2 passed; Tests 13 passed

npm run verify
typecheck passed
Test Files 3 failed | 151 passed | 1 skipped (155)
Tests 19 failed | 1546 passed | 1 skipped (1566)

npm run factory:check
blocked at spawnSync git EPERM after git ls-files returned output
```

All full-suite failures are the managed sandbox's local-listener and `tsx` IPC
pipe `EPERM` restrictions. The exact adapter target is green.

Coordinator verification: unrestricted `npm run verify` passed with 154
passed / 1 skipped test files and 1565 passed / 1 skipped tests, followed by
the Vite production build and factory readiness check.

## Review

The closing repair-delta review is **APPROVED** with no remaining Critical or
Important findings. It verified that legacy staging preserves non-default
resident-agent identity while rebuilding and enforcing locks, and that
`workspace.canonical-repair.record` names the exact exported fail-closed
current-preview path rather than the projection-rebuild path.

## Stop Conditions

- Stop before constructing unsafe adapters or adding domain dependencies to
  descriptor discovery.
- Stop before memory, specialist, approval cockpit, or runtime integration.
- Stop on duplicate tool keys, incomplete metadata, unsafe failure categories,
  domain ownership drift, forbidden-effect conflicts, or verifier failure
  after two focused repair attempts.
- Leave the complete Task 9 diff uncommitted for coordinator verification
  because Git metadata is read-only here.

## RV-1-E-802 historical completion-fixture maintenance causal RED

- Authorization: `RV-1-E-802` authorizes this forward-only maintenance in
  Task9's existing historical ownership only. The task branch
  `codex/task9-completion-fixture-maintenance` starts clean from exact program
  commit `d30084254d7a1bd9393912ae60982dc08bf4f01a`; it does not merge or carry
  the separate G136 implementation lineage.
- The exact causal failure is reproduced read-only at released G136 candidate
  `44f2dcd2075805106786ece7a77633395b8a87fc` in
  `/home/drake/.codex/worktrees/7837/Cestus`, whose private scheduler
  completion adapter has removed public `gateway.completeTool`.
- `npm test -- packages/agent/test/legacy-staging-adapter.test.ts` exits `1`:
  **1 failed / 13 passed (14)**. Its sole failure is
  `TypeError: gateway.completeTool is not a function` at
  `packages/agent/test/legacy-staging-adapter.test.ts:348:19` in
  `maps assertion.proposed event IDs into agent.tool.completed without old
  ontology import`.
- `./node_modules/.bin/tsc --noEmit --pretty false` exits `2` with the sole
  compiler failure `TS2339`: property `completeTool` does not exist on the
  public gateway return type at the same line.
- The program-base fixture remains intentionally pre-integration compatible
  (**1 file / 14 tests passing**), which is why the causal reproduction is
  read-only against the released G136 candidate. No test or production bytes
  changed before this claim-only RED. The only authorized GREEN changes this
  fixture and this claim: it must execute the legacy adapter through the
  released scheduler path, preserving request, run, preview, execution-claim,
  and durable result provenance without restoring, exposing, casting, or
  type-laundering `completeTool`.
