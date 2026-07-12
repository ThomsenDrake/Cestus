# Resident Task Orchestrator Task 1 Claim

## Status

complete-coordinator-commit-pending

## Task

- Plan: `docs/superpowers/plans/2026-07-10-resident-task-orchestrator-implementation.md`
- Task: Task 1, Event Contracts And Deterministic Stream Helpers
- Claimed at: 2026-07-12T03:11:49Z
- Worker: Codex Wave 5 resident task orchestrator lane
- Branch: `codex/resident-task-orchestrator-design`
- Worktree: `/home/drake/.codex/worktrees/eb36/Cestus`

## Scope

Owned files for this task:

- `docs/agentic/claims/resident-task-orchestrator-task-1.md`
- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/agent-contracts.test.ts`
- `packages/agent/src/task-orchestrator-events.ts`
- `packages/agent/src/task-orchestrator-types.ts`
- `packages/agent/test/task-orchestrator-events.test.ts`
- `packages/agent/src/index.ts`

No production source files have been edited before this claim.

## Implementation Base

- Current implementation base from `git rev-parse HEAD`: `1894fe6ad6aec2be0c9c19e54e75ae3dfd2ee7a3`
- Merge base with `neo`: `0fbe8db7571123ba7335119b093d423fb0b653d5`

## Required Reading

Read before claim:

- `.agents/skills/cestus-software-factory/SKILL.md`
- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
- `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
- `docs/superpowers/specs/2026-07-10-resident-task-orchestrator-design.md`
- `docs/superpowers/plans/2026-07-10-resident-task-orchestrator-implementation.md`
- `docs/superpowers/specs/2026-07-10-resident-lifecycle-bootstrap-design.md`
- `docs/superpowers/specs/2026-07-10-durable-specialist-handoff-production-design.md`
- `docs/superpowers/specs/2026-07-10-prr-jurisdiction-context-packs-design.md`

Active plan scan found no genuine conflict with landed Wave 4 contracts. The implementation must consume the landed callable `ContextPackPayloadResolver`, positional `assertResolvedContextPacksForExecution(refs, resolvedPacks)`, production prompt rendering/applicability functions, and orchestrator-owned adapters over the landed approval and durable-handoff contracts.

## Prerequisite Implementation Commits

The semantic preflight was run against executable source files and passing tests, not design/spec ancestry alone.

- Lifecycle bootstrap:
  - `packages/agent/src/identity-bootstrap.ts`: `1f77b54203c6003715d2b4750e8c2d31a686eae5` `fix: block unverified resident identity readiness`
  - `packages/agent/src/runtime-types.ts`: `c1b52f27029b6119e0c0a512a8ba2c8d10e9016f` `feat: bootstrap resident identity on workspace open`
  - `packages/local-runtime/src/runtime-factory.ts`: `c1b52f27029b6119e0c0a512a8ba2c8d10e9016f` `feat: bootstrap resident identity on workspace open`
- Operational resolved context:
  - `packages/agent/src/context-packs.ts`: `61f1678ccebf503c59d0a85a2508fb75522d84cc` `fix: harden production specialist final boundaries`
  - `packages/agent/src/operational-context-packs.ts`: `026fc83e3d60bd455ef5c2be128fbc1250627e8b` `fix: harden production prompt authority`
  - `packages/agent/test/fixtures/resolved-context-pack-sentinel.ts`: `7ee217fe557ac5c69dfb81d91549394615315fbe` `feat: resolve context pack payload envelopes`
- Investigative packs:
  - `packages/agent/src/investigative-context-packs.ts`: `026fc83e3d60bd455ef5c2be128fbc1250627e8b` `fix: harden production prompt authority`
- Production prompts/output contracts:
  - `packages/agent/src/production-specialist-prompts.ts`: `0ae4455be90f8373c793340cbb2430efebac9d05` `fix: close production specialist final review gaps`
  - `packages/agent/src/production-specialist-output-contracts.ts`: `61f1678ccebf503c59d0a85a2508fb75522d84cc` `fix: harden production specialist final boundaries`
- Durable handoff:
  - `packages/agent/src/specialist-handoff-manifest.ts`: `8f6f1e1036d5b7840d9fe3290376e38d049ada56` `feat: add durable handoff runner material lifecycle`
  - `packages/agent/src/specialist-handoff-projection.ts`: `8f6f1e1036d5b7840d9fe3290376e38d049ada56` `feat: add durable handoff runner material lifecycle`
- PRR packs:
  - `packages/agent/src/prr-context-packs.ts`: `026fc83e3d60bd455ef5c2be128fbc1250627e8b` `fix: harden production prompt authority`
  - `packages/local-runtime/src/agent-prr-context-packs.ts`: `4f09a8cb075d669e0a1958742fe4e6e21b439c90` `fix: close local runtime prr context pack review gaps`

## Prerequisite Preflight Commands

Exact command output was captured in `/tmp/cestus-task-orchestrator-preflight-wave5`. The claim records each command, pass/fail summary, line count, and SHA-256 digest for the captured output.

### Lifecycle Bootstrap

```bash
rg -n "defaultResidentAgentId|defaultResidentIdentityStreamId|ensureDefaultResidentIdentity|ResidentIdentityLifecycleDto|identityLifecycle|residentIdentity\.ready" packages/agent/src packages/local-runtime/src packages/agent/test packages/local-runtime/test
```

Output: 146 lines, `sha256:a117bc162df27601704364c7bb7a82bb3541018fa1b6577a31688172e24e4546`.

```bash
npm test -- packages/agent/test/identity-bootstrap.test.ts packages/agent/test/runtime.test.ts packages/local-runtime/test/resident-identity-bootstrap.test.ts packages/local-runtime/test/agent-http-routes.test.ts
```

Output: `Test Files  4 passed (4)`, `Tests  73 passed (73)`, `sha256:654e39dfe5eabad7f303a677accd813ec323622fd76ce5eb31c749954f66e00b`.

### Operational Resolved Context

```bash
rg -n "VerifiedResolvedContextPack|assertResolvedContextPacksForExecution|buildResolvedContextPack|verifyResolvedContextPack|buildResolved\(|workspace-runtime-status\.v1|task-run-history\.v1|agent-memory-summary\.v1|resolved-context-pack-sentinel" packages/agent/src packages/agent/test
```

Output: 593 lines, `sha256:beb675a2c2e7a0229c77640afeab5f95efdc81cce82560f91dd90d2d4732bdf6`.

```bash
npm test -- packages/agent/test/context-packs.test.ts packages/agent/test/operational-context-packs.test.ts packages/agent/test/memory.test.ts packages/agent/test/specialist-readiness.test.ts
```

Output: `Test Files  4 passed (4)`, `Tests  139 passed (139)`, `sha256:3e65c62900b21aed9d2968e049e813fbda9e0e3960668fd751e252ee0e8a5f2f`.

### Investigative Context

```bash
rg -n "buildEvidenceSummaryContextPack|buildAcceptedGraphProjectionContextPack|buildGovernanceLocksContextPack|evidence-summary\.v1|accepted-graph-projection\.v1|governance-locks\.v1|registerInvestigativeContextPacks" packages/agent/src packages/agent/test
```

Output: 336 lines, `sha256:35a77c1b462fb028912e37df9756882f619aeb92db397ba9ad591d11db94fd92`.

```bash
npm test -- packages/agent/test/investigative-context-packs.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/prompt-artifacts.test.ts
```

Output: `Test Files  4 passed (4)`, `Tests  159 passed (159)`, `sha256:1537561beb150ef03581d1943cf5c9e84d2f682f35c62d010c4c53dcf6b457d9`.

### Prompt Applicability And Rendering

```bash
rg -n "renderProductionSpecialistPrompt|verifyProductionSpecialistPromptArtifact|ProductionContextRequirement|when-scope-associated-prr|no-associated-prr|promptText\(" packages/agent/src packages/agent/test
```

Output: 148 lines, `sha256:8c9cbe8704fd6d94c387cbb6cb5dac50c7d9d9b02e47cdf0198970923277a1a2`.

```bash
npm test -- packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/specialist-workflows.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts
```

Output: `Test Files  6 passed (6)`, `Tests  181 passed (181)`, `sha256:2939863e7a359dbf3c2bab5f2e4dcf77ba2b689f36f78850c904d64289683b94`.

### Durable Handoff

```bash
rg -n "specialist-handoff\.prepared|specialist-handoff\.recorded|handoff-pending|buildSpecialistHandoffManifest|verifySpecialistHandoffManifest|buildSpecialistHandoffProjection|final-output|readback" packages/ontology/src packages/agent/src packages/agent/test
```

Output: 243 lines, `sha256:76617004c559c2caccd72c8c4198917b0b6bf7ee273f1da9adc8c28cb9735ad4`.

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts
```

Output: `Test Files  4 passed (4)`, `Tests  146 passed (146)`, `sha256:67f12ac021b9d726abd97c20c585110039403fd70b90520e64ffd18c1f54028c`.

### PRR Packs

```bash
rg -n "prr-read-model\.v1|jurisdiction-pack-summary\.v1|buildPrrReadModelContextPack|buildJurisdictionPackSummaryContextPack|registerPrrContextPacks" packages/agent/src packages/local-runtime/src packages/agent/test packages/local-runtime/test
```

Output: 185 lines, `sha256:d7a5a9f364cc6b1ea6f0ba43c09d3c3f362f64eaa7a50577debf9c6b0a588ace`.

```bash
npm test -- packages/agent/test/prr-context-packs.test.ts packages/local-runtime/test/agent-prr-context-packs.test.ts packages/agent/test/specialist-readiness.test.ts
```

Output: `Test Files  3 passed (3)`, `Tests  58 passed (58)`, `sha256:0ae3879c9eb2ff06307b3bfbdc40e3a076d65d5519147befa318b642b895cb50`.

## Applicability Notes

- The first vertical is non-PRR evidence triage. `prr-read-model.v1` and `jurisdiction-pack-summary.v1` are conditional and green in preflight, but non-PRR evidence triage must record them as inapplicable instead of blocking.
- Timeline and contradiction packs are not part of the landed investigative prerequisite batch. They remain explicit blockers only for specialist modes whose registered workflow descriptor marks them applicable.
- Live Nous acceptance remains mandatory for Task 9 and cannot be satisfied by deterministic local providers.
- No offline fake provider may impersonate the live remote-provider gate.

## Task 1 RED Evidence

Command:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/task-orchestrator-events.test.ts
```

Result: expected RED.

Observed:

```text
Test Files  2 failed (2)
Tests  5 failed | 55 passed (60)
packages/agent/test/task-orchestrator-events.test.ts: Cannot find module '../src/task-orchestrator-events.js'
packages/ontology/test/agent-contracts.test.ts: 5 orchestration contract tests failed because validateKnowledgeEvent(...).success was false for the new event families.
```

## Task 1 GREEN Evidence

Targeted command:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/task-orchestrator-events.test.ts
```

Result:

```text
Test Files  2 passed (2)
Tests  66 passed (66)
```

Controller review-prep tightening added a type/test anchor for the full derived projection-state vocabulary from the approved design (`queued`, context readiness states, prompt readiness, approval wait, handoff pending, terminal and blocked states) while keeping those labels separate from append-only event payloads.

Additional verification:

```bash
npm run typecheck
```

Result:

```text
typecheck passed
```

```bash
git diff --check
```

Result: no output.

Full verification command:

```bash
npm run verify
```

Result: blocked by managed-sandbox verifier failures after `typecheck passed`.

Observed failure summary:

```text
Test Files  3 failed | 177 passed | 3 skipped (183)
Tests  19 failed | 2095 passed | 3 skipped (2117)
packages/local-runtime/test/server.test.ts: listen EPERM on 127.0.0.1 and 0.0.0.0
packages/workspace-ops/test/cli.test.ts: tsx IPC listen EPERM on /tmp/tsx-1000/*.pipe
packages/local-runtime/test/workspace-readiness-smoke.test.ts: JSON parse failure after the executable wrapper produced no stdout
```

Factory readiness command:

```bash
npm run factory:check
```

Result: blocked by managed-sandbox Git spawn failure in `scripts/check-agent-readiness.mjs` while running `git ls-files`.

Observed failure summary:

```text
Error: spawnSync git EPERM
at trackedTextFiles (scripts/check-agent-readiness.mjs:163:10)
```

Concern: full `npm run verify` and `npm run factory:check` need an unrestricted coordinator rerun because this linked-worktree sandbox blocks local listen sockets, tsx IPC pipes, and Node-spawned Git. Targeted Task 1 tests, TypeScript typecheck, and whitespace verification pass in this sandbox.

## Task 1 Review Repair Evidence

Fresh review found two Important issues:

- Approval-wait checkpoints were too permissive and could omit exact resume-proof bindings.
- Orchestration completion could name one handoff recorded event at top level and a different handoff recorded event in verified readback.

RED command after adding review regression tests:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/task-orchestrator-events.test.ts
```

Observed:

```text
Test Files  1 failed | 1 passed (2)
Tests  3 failed | 63 passed (66)
```

The failures proved the schema still accepted missing approval-suspended checkpoint references and mismatched completion handoff readback, and rejected the newly required source/input binding fields before implementation.

Repair:

- Approval-wait checkpoints now require run ID, non-empty tool request IDs, approval metadata, provider posture, non-empty context bindings, non-empty source event IDs, non-empty input artifact hashes, prompt artifact hash, and lock snapshot.
- `approval-suspended` releases now require `checkpointEventId`.
- Orchestration completion now requires `handoffReadback.handoffRecordedEventId` to match the top-level `handoffRecordedEventId`.
- Contract guidance now names source/input artifact bindings and exact approval-wait metadata.

GREEN after repair:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/task-orchestrator-events.test.ts
```

Result:

```text
Test Files  2 passed (2)
Tests  66 passed (66)
```

Additional verification after repair:

```bash
npm run typecheck
```

Result:

```text
typecheck passed
```

```bash
git diff --check
```

Result: no output.

## Task 1 Review Decision

Fresh re-review after repair: approved.

Review result:

```text
Findings: none.
```

Reviewer confirmed:

- The prior approval-wait exact resume-proof finding is resolved.
- The prior mismatched handoff readback finding is resolved.
- Scope remains limited to Task 1-owned files.
- Focused tests and whitespace check pass.

Commit status: not committed in this sandbox because `git add` fails with read-only linked-worktree Git metadata at `/home/drake/Projects/Cestus/.git/worktrees/Cestus6/index.lock`. Coordinator commit boundary is base `1894fe6ad6aec2be0c9c19e54e75ae3dfd2ee7a3` plus the reviewed Task 1 scoped diff.

## Stop Conditions Carried Forward

Stop on schema conflict, data-loss risk, unavailable prerequisite/provider, unsafe authority/effect path, missing durable recovery semantics, self-approval, synthetic provider proof, synthetic handoff, payload leakage into durable/public surfaces, or repeated verifier failure after systematic debugging and one focused repair.
