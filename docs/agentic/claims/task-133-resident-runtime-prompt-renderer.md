# Task133.1 Claim: Discriminated v1 Artifact And Post-Approval v2 Binder

- Plan: `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`, terminal CF-1R27/R28, integrated at `03c74856e45ca16779e1af2338a4ed4c63cc02e2`.
- Authority: registry authorization `6651b139e74e5c71b7b0f499e3b2a44cb61798ce`; coordinator records RV-1-E-385/E-386.
- Worker and branch: `/root` / `codex/task-133-atomic-prompt-binding-review-recovery-2`.
- Source base: `197c3ca528e9b666c02b9b87695bf900efa195b1`.
- Status: `recovery/verified` in the one atomic Task133.1-.3 replacement commit.
- SDD history: the coordinator explicitly authorized `superpowers:subagent-driven-development`; this recovery was executed directly, with no internal implementer or self-integration.

## Required Prerequisites

- CF1 integration: `a321955d84eb700722e08eaa835ddb076fda62b2`.
- Reviewed Task117A: `2ad417356afc00b26ff00fa763977e2469463d72`.
- Task117A external sibling attestation C: `1cde7adb1a3b9fb1621b75410c203eec631a45ba`.
- Task120: `49c3490a262162bd1d7146994390a2a6b5052394`.
- Task125: `2e5c35ab7bca33df9f1a0c482c496fbb93350086`.
- Task126: `2e7a8a011ada9828f2978129ddc9f47719c33655`.
- Task127: `93a93844a18343a3d49933a4bf9fb92190224aa5`.
- Task128: `ba43f007c371229ca5ad96844f4b3bc08584702b`.
- Task129: `d362d1a73f45b947bcd6e1c7915c9e7fd9f96d3a`.
- Task130: `78f456263a9af1d010df494684ea2d0906134eb4`.
- Task132A: `7ec1eb6885716ac7324839c578677366fe1bb244`.
- Task134A: `83a301d541e7fec5d0b29e6f2003566c06336158`.
- Task135A: `ac3f91901da0c9b23722a046be73d95746f691da`.

## Evidence

The causal Task133.1 RED exited 1 with seven exact failures covering strict
v1, the post-approval v2 binder, owner-derived hashes, hostile/unversioned
input, and explicit-v1 legacy workflow callers. The exact focused GREEN passed
5 files / 131 tests. CF-1R28 required this suite to be rerun immediately after
Task133.2 GREEN and before any Task133.3 work; that rerun passed 5 files / 131
tests.

The artifact contract remains discriminated: v2 construction preserves the
approved v1 bytes and uses no renderer, caller-owned output hash, or raw
production prompt rendering. `renderExactlyBoundProductionSpecialistPrompt`
remains absent from agent source and tests.

## Task133 V4 strict production-renderer claim

- Status: `claimed` → `implementing`.
- Owner model/reasoning: GPT-5.6 Terra / xhigh.
- Branch/worktree: `codex/task133-runtime-prompt-renderer` /
  `/home/drake/.codex/worktrees/task133-runtime-prompt-renderer/Cestus`.
- Exact source base: `e481e23a08ff6d381b93d4dda3b553b1990e2bc3`, a
  registry-only descendant of strict record-15
  `986c2a43b018e72acf1104e84853826b06b1abdd`.
- V4 card authority: Task133 release-graph card 16 in
  `docs/agentic/contracts/task136-bounded-assurance-v4.json`; prerequisites
  Task126-R, Task127, Task128, Task129, and Task130 are released.
- Exclusive paths:
  - `packages/local-runtime/src/agent-runtime-prompt-renderer.ts`
  - `packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts`
  - `docs/agentic/claims/task-133-resident-runtime-prompt-renderer.md`
- Ordered commits: claim only; causal RED test only; minimum GREEN only. No
  repair, factory change, registry/spec/plan/contract edit, integration,
  provider call, credential use, network use, or history rewrite is allowed.
- The renderer must consume canonical prompt-artifact/registered-renderer
  authorities, bind one approved run, canonical provider posture, and verified
  context hashes, fail closed before rendering on missing/stale/mismatched or
  forged inputs, and never log or expose prompt bytes.
- Focused command:
  `npm test -- packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts`.
  Cross-boundary command adds `packages/agent/test/prompt-artifacts.test.ts`.
  Final gates: typecheck, inherited-baseline differential full verify,
  diff-check, factory check, V4 contract, exact prefix-15/incomplete-29
  assurance, exact three-path audit, clean state, and real local dependency
  checks.
- Stop for data loss, contract/schema/file-owner conflict, missing canonical
  authority, unavailable dependency, credential/external behavior choice,
  safety-invariant conflict, or repeated verifier failure.

### Causal RED evidence

- `npm test -- packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts`
  exited `1`: one suite failed before test execution because
  `../src/agent-runtime-prompt-renderer.js` is absent. The test imports only
  existing canonical agent prompt-artifact, specialist-renderer, and verified
  context-pack authorities and names the required strict V4 adapter surface.

### GREEN candidate evidence

- Status: `implementing` → `green-candidate`; final admission is intentionally
  rerun only from the committed GREEN bytes.
- The minimal adapter verifies the registered V1 prompt identity, canonicalizes
  the exact run and ready provider posture through the existing prompt-artifact
  authority, and delegates hash-bound V2 construction to the existing binder.
  It does not render a new V1 prompt, invoke a provider, log prompt content, or
  mint any reader/capability/context authority.
- Focused GREEN: `npm test --
  packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts` passed
  `1` file / `3` tests. Cross-boundary GREEN: the focused test plus
  `packages/agent/test/prompt-artifacts.test.ts` passed `2` files / `29`
  tests.
- The adversarial cases retain forged V1 source/context, stale verified
  context, wrong run type, unavailable posture, and outer/nested
  accessor/symbol/extra-key rejection. Each fails with the generic
  `prompt-binding-invalid` boundary without exposing the sentinel prompt text.
