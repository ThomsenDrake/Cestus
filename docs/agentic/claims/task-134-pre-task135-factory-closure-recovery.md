# Task 134 Pre-Task135 Recovery Claim: Factory-Owned Closure

- Task and gate: Task134 CF-1R3 recovery / Wave 2 R closure prerequisite for
  Task135.
- Coordinator authorization: CF-1R3 and RV-1-E-190.
- Rejected preserved history: `435602f3`, `b5d07b93`; neither is a merge base
  or integration-ready implementation.
- Status: conditionally authorized. No author may start before fresh review and
  coordinator-only integration of Task132 recovery `70f70375` and recording of
  that exact integration SHA in this claim.

## Exclusive Scope

The one fresh Terra/xhigh author owns only:

- `packages/local-runtime/src/agent-runtime-factory.ts` (sole temporary
  CF-1R3 writer);
- `packages/local-runtime/src/agent-runtime-specialist-runners.ts`;
- `packages/local-runtime/test/agent-runtime-specialist-runners.test.ts`;
- new `packages/local-runtime/test/agent-runtime-factory-specialist-closure.test.ts`;
- this append-only claim.

`packages/agent/test/specialist-runner-kernel.test.ts` is verification-only.
Task135 stores/tests, Task140's `agent-runtime-composition.test.ts`, H/W/P/L,
shared schema, provider, credential, route, UI, and `neo` files are forbidden.

## Required Recovery Contract

The factory, not a public Task134 constructor, must privately bind the mounted
authority, actual H capability/readback, registration, and delegate before it
exposes the narrow `ProductionSpecialistRunnerCapability` dispatch surface.
Missing unmerged Task135 stores must remain fail-closed. A public caller must
not supply any structural authority/store/registration/provenance/readiness/H
tuple or opaque lookalike. A delegate-provided event-shaped result and an H
echo of that object are not durable proof; success requires factory-owned exact
H readback bound to the approved task/attempt/run and mounted authority.

Use `superpowers:subagent-driven-development`, systematic debugging,
test-driven development, and verification-before-completion. First write/run
causal RED tests for structural forgery and forged delegate/H echo. After GREEN
and before one forward commit, run exactly:

```bash
npm test -- packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/local-runtime/test/agent-runtime-factory-specialist-closure.test.ts packages/agent/test/specialist-runner-kernel.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

This one fail-fast `&&` chain must exit `0`; never use newline-separated gate
commands. Full verification is **CLOSED** (`npm run verify` forbidden). Stop
for fresh independent Terra/xhigh review; no self-review, self-integration,
merge, provider/network/credential/Nous action, or `neo` action is authorized.
