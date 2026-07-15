# Task 134 Recovery Claim: Exact H Readback And Production Closure

- Task and gate: Task 134 recovery / Wave 2 / CF1-R-RUNNERS.
- Coordinator authorization: RV-1-E-188 from clean program head
  `1b1e7d01500161a4745ac1e551df9dd992b1bce1`.
- Preserved candidate history: `435602f3` and `b5d07b93`; neither is
  integration-ready.
- Status: claimed for one fresh Terra/xhigh recovery author, pending its
  in-progress append.

## Exclusive Scope

The recovery may edit only the existing Task134 claim,
`packages/local-runtime/src/agent-runtime-specialist-runners.ts`,
`packages/local-runtime/test/agent-runtime-specialist-runners.test.ts`, and
this append-only recovery claim. The existing
`packages/agent/test/specialist-runner-kernel.test.ts` is verification-only.
No H/W/P/shared-schema/gateway/factory/orchestrator/UI/provider/credential or
`neo` file is authorized.

## Accepted Root Cause And Required Investigation

The original candidate and bounded repair are exhausted. The fresh author must
first add causal RED coverage for a delegate-provided fabricated durable
handoff/readback and for a direct structural factory-closed tuple. A delegate
returning an event-shaped object, or H echoing that same delegate object, is
not durable proof. The public capability must not accept caller-supplied
authority, store, registration, provenance, readiness, or H tuples through a
structural construction path.

The author must trace the actual construction and readback data flow before
fixing. If this exact three-file boundary cannot create a runtime-enforced,
non-forgeable production closure without a shadow contract or public
structural capability, it must make no speculative production patch and return
a source-backed composition-boundary report to the coordinator. That report is
a successful recovery checkpoint, not permission to weaken the contract.

## Verification And Stop Conditions

Use `superpowers:subagent-driven-development`, systematic debugging,
test-driven development, and verification-before-completion. For any source
candidate, record RED/GREEN evidence and run exactly:

```bash
npm test -- packages/local-runtime/test/agent-runtime-specialist-runners.test.ts packages/agent/test/specialist-runner-kernel.test.ts && npm run typecheck && git diff --check && npm run factory:check
```

The chain must exit `0`; do not use newline-separated verifier gates. Stop for
a fresh independent Terra/xhigh review. Full verification is **CLOSED** (`npm
run verify` is forbidden); no provider/network/credential/Nous action,
self-review, self-integration, merge, or `neo` action is authorized. Usage is
`usedPercent=13` / 87% remaining; reset credits remain untouched, DRAIN begins
at <=10% remaining, and HARD PAUSE at <=7%.
