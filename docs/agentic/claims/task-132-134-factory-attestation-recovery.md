# Task 132/134 CF-1R4 Claim: Factory Composition Authority

- Task and gate: pre-Task133/135 R composition-authority foundation.
- Coordinator authorization: CF-1R4 / RV-1-E-191.
- Preserved unintegrated candidates: Task132 `70f70375`; Task134 `435602f3`
  and `b5d07b93`. They may be assembled only in an isolated recovery branch.
- Status: claimed for one fresh Terra/xhigh author, distinct from all previous
  Task132/134 authors and reviewers.

## Exclusive Scope

- `packages/local-runtime/src/agent-runtime-factory.ts` (sole CF-1R4 writer);
- `packages/local-runtime/src/agent-runtime-context-packs.ts` and its focused
  test;
- `packages/local-runtime/src/agent-runtime-specialist-runners.ts` and its
  focused test;
- new `packages/local-runtime/test/agent-runtime-factory-attestation.test.ts`;
- this append-only claim.

The agent context-pack and specialist-runner kernel tests are verification-
only. Package-owned registrars, Task135 stores, Task140 composition test, H/W/
P/L/shared contracts, provider/credential/route/UI, and `neo` files are
forbidden.

## Required Contract And Proof

The factory must retain actual registry/registrar/parser evidence, mounted
authority, and H capability inside a closure and expose only narrow verified
context/runner capabilities. Public input must not mint or pass structural
producer/registration/parser/authority/store/provenance/H tuples or lookalikes.
The default factory stays fail-closed if real attestation is unavailable.

First write/run causal REDs proving: swapped producer/registration/parser
identity blocks before builder activity while real PRR/operational/
investigative families still work; direct structural closure construction
blocks before any activity; and a delegate-supplied handoff/readback plus H
echo cannot establish durable success. No local identity map, synthetic brand,
caller callback, or shadow contract is permitted.

Use `superpowers:subagent-driven-development`, TDD, systematic debugging, and
verification-before-completion. Before one forward commit run exactly:

```bash
npm test -- packages/local-runtime/test/agent-runtime-context-packs.test.ts packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/local-runtime/test/agent-runtime-factory-attestation.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/specialist-runner-kernel.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

This single fail-fast `&&` chain must exit `0`. Full verification is **CLOSED**
(`npm run verify` forbidden). Stop for fresh independent Terra/xhigh review;
no self-review, self-integration, merge, provider/network/credential/Nous, or
`neo` action is authorized.
