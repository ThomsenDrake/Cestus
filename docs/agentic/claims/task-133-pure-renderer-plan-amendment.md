# Task133 discriminated-binding and Task140R0 plan-repair claim

- Status: forward-repaired candidate pending the documentation gate and a fresh
  independent defects-first plan review. The fresh review of full lineage
  `0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..d91f28a3f6434490246daaa97e399a905c902761`
  returned `NEEDS-CHANGES` on two P1 plan defects; this child repair addresses
  both without authorizing implementation.
- Coordinator-owned forward repair on
  `codex/task-133-pure-renderer-plan-amendment`, resumed from clean candidate
  `d91f28a3f6434490246daaa97e399a905c902761`; the full amendment lineage begins
  at `0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8`. Only this claim and the active
  recovery plan are changed by this documentation task.

## Current Executable Contract

The current contract is the appended `CF-1R5 Task133 Discriminated Binding
Migration And Exact Renderer Amendment` in
`docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`.
Its corrected `Task140R0 V2-Only Composition Replacement` is the sole future
R0 execution overlay. Together they are the current executable contract.
Earlier local-only, five-file, and incomplete R0 prose remains rejected Git
history and must not be used as implementation instructions.

- `packages/agent/src/prompt-artifacts.ts` is the canonical data owner. It
  must expose an explicit legacy production-binding v1 and strict exact v2;
  v2 requires all exact-run/posture fields and canonical computed hashes.
  Unversioned bindings and caller-supplied derived hashes are invalid.
- `packages/agent/src/production-specialist-prompts.ts` retains
  `renderProductionSpecialistPrompt` as the deliberate v1 route for current
  callers and adds `renderExactlyBoundProductionSpecialistPrompt` as the v2
  route. Both use the same canonical text renderer once and the existing
  artifact builder once.
- `packages/agent/src/adapters/provider-byte-transfer.ts`, runtime event
  mapping, agent projection, ontology contract parsing, and workspace rebuild
  tests must strictly preserve both variants and the v2 hashes. No compatibility
  default, local artifact upgrade, duplicated hash algorithm, or public
  authority is permitted.
- The local runtime factory's verifier, mounted-context types, registrations,
  and capabilities remain private and out of Task133 scope. Task140R0 is the
  sole future v2 consumer after its existing private prerequisites; it rejects
  legacy and direct artifacts before any effect.
- Task140R0 modifies its factory and route test, creates the previously absent
  `packages/local-runtime/test/agent-runtime-composition.test.ts`, and creates
  its claim. Its actual RED/GREEN steps and focused command now cover a valid
  captured v2 control; legacy-v1 and direct-v2 artifacts; caller binding and
  derived-hash injection; every one-field exact-run, provider-posture, and six
  context swap; and zero renderer/provider/ledger/runner/H/store/terminal
  activity for every rejection.

## Frozen Prerequisites And Scope

Before implementation, the coordinator records a clean base descending from
Task120 `49c3490a262162bd1d7146994390a2a6b5052394`, Task126
`2e7a8a011ada9828f2978129ddc9f47719c33655`, Task127
`93a93844a18343a3d49933a4bf9fb92190224aa5`, Task128
`ba43f007c371229ca5ad96844f4b3bc08584702b`, Task129
`d362d1a73f45b947bcd6e1c7915c9e7fd9f96d3a`, Task130
`78f456263a9af1d010df494684ea2d0906134eb4`, and Task132A
`7ec1eb6885716ac7324839c578677366fe1bb244`. The implementation claim must
also record the integrated amendment SHA, exact program base, all frozen files,
the causal RED evidence, and the required explicit coordinator approval and
invocation of `superpowers:subagent-driven-development`.

The exhaustive migration file list, every current renderer call site, exact
RED/GREEN/final non-full commands, and coordinator-only integration gate are
frozen in that appended amendment. Full verification, provider/network/
credential/Nous activity, reset-credit redemption, `neo`, source
implementation in this worktree, self-review, self-integration, and merge are
closed.

## Documentation Validation And Handoff

Run only:

```bash
git diff --check && npm run factory:check
```

The fresh full-lineage review range is
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD`, where `HEAD` is the clean
child documentation repair commit. The reviewer must inspect the complete
range, including the preserved rejected amendments and this superseding
contract. Stop after a fresh independent Terra/xhigh review; only the
coordinator may integrate an approved amendment or explicitly approve and
invoke `superpowers:subagent-driven-development` for later implementation.
