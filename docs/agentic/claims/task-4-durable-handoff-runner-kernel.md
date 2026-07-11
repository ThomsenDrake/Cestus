# Task 4 Durable Specialist Handoff Runner Kernel Claim

Status: claimed
Branch: codex/durable-specialist-handoffs-core
Worktree: /home/drake/.codex/worktrees/1542/Cestus
Claimed At: 2026-07-11T22:28:08Z
Claim Base: 128d0273

Plan: docs/superpowers/plans/2026-07-10-durable-specialist-handoff-production-implementation.md
Spec: docs/superpowers/specs/2026-07-10-durable-specialist-handoff-production-design.md

Scope:
- packages/agent/src/specialist-runner-kernel.ts
- packages/agent/test/specialist-runner-kernel.test.ts
- packages/agent/src/index.ts
- docs/agentic/claims/task-4-durable-handoff-runner-kernel.md

Post-Wave-3 Preflight:
- Branch is fast-forwarded to Wave 3 merge tip 128d0273.
- Wave 3 production prompt/output migration is present in `specialist-runner-kernel.ts`: `prepareSpecialistRun`, `invokeSpecialistModel`, production prompt registration/render/verification, invocation proof minting, provider byte-transfer approval checks, resolved-context verification, strict provider output validation consumers, and derivative artifact persistence remain intact.
- Final-output step fields and `agent.specialist-handoff.prepared` / `agent.specialist-handoff.recorded` contracts are already present and routed to `agent_run_${runId}`.
- `EventLedger.append` supports `expectedNextSequence`, and the concrete ledgers enforce it.
- Current specialist descriptors expose provider-output and handoff schema IDs, not a separate final-output-step schema field. Task 4 will keep lifecycle helpers explicit about the supplied final-output `stepSchemaId` and will not edit prompt-template, context-pack builder, lifecycle-bootstrap, or orchestrator files.
- Current derivative artifact store exposes `put`; Task 4 handoff manifest storage requires `put` and `get` through a separate manifest store interface so readback can verify content-addressed bytes without changing Wave 3 prompt artifact contracts.

RED:
- Command: `npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts`
- Expected failure: lifecycle helpers and last-sequence helper do not exist or do not yet enforce durable final-output -> prepared -> recorded/readback -> terminal order.

GREEN:
- Command: `npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts`
- Expected pass: all named lifecycle and projection tests pass.

Verification:
- Command: `npm run verify`
- Status: pending

Review:
- Spec review: pending
- Code review: pending
