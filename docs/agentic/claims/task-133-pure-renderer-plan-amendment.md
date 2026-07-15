# Task133 discriminated-binding plan-amendment claim

- Status: ready-for-review pending the documentation gate and a fresh
  independent defects-first plan review.
- Coordinator-owned forward repair on
  `codex/task-133-pure-renderer-plan-amendment`, rooted at exact base
  `ffc2dc81c189af3163ec7b573b4f6f4767660de7`. Only this claim and the active
  recovery plan are changed by this documentation task.

## Current Executable Contract

The current contract is the appended `CF-1R5 Task133 Discriminated Binding
Migration And Exact Renderer Amendment` in
`docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`.
It is the sole Task133 dispatch authority. Earlier local-only and five-file
amendments are rejected Git history and must not be used as implementation
instructions.

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

The fresh review range is
`ffc2dc81c189af3163ec7b573b4f6f4767660de7..HEAD`, where `HEAD` is this
single clean documentation commit. Stop after a fresh independent Terra/xhigh
review; only the coordinator may integrate an approved amendment or dispatch
the later Task133 implementation.
