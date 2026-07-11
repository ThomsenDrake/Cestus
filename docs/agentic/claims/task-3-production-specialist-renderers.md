# Task 3: Deterministic Production Renderers

- Plan: `.superpowers/sdd/task-3-brief.md`
- Task: Task 3: Deterministic Production Renderers
- Worker: Codex
- Branch: `codex/production-specialist-prompt-template-registry-spec`
- Worktree: `/home/drake/.codex/worktrees/cde7/Cestus`
- Claimed at: 2026-07-11T00:00:00Z
- Status: ready-for-review

## Owned Files

- `packages/agent/src/production-specialist-prompts.ts`
- `packages/agent/src/prompt-artifacts.ts`
- `packages/agent/src/context-packs.ts`
- `packages/agent/src/investigative-context-packs.ts`
- `packages/agent/src/operational-context-packs.ts`
- `packages/agent/src/prr-context-packs.ts`
- `packages/agent/test/production-specialist-prompts.test.ts`
- `packages/agent/test/prompt-artifacts.test.ts`
- `packages/agent/test/context-packs.test.ts`
- `packages/agent/test/prr-negotiation-workflow.test.ts` (supporting verifier fixture for stricter production transfer gate)
- `docs/agentic/claims/task-3-production-specialist-renderers.md`

## Evidence

- Claim created before Task 3 test or renderer changes.
- RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed as expected because renderer exports are absent.
- Audit RED: the targeted suite reported 2 expected failures for task-bound scope applicability and registered output/authority instructions.
- GREEN: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` passed with 1 test file and 48 tests.
- Verify: `npm run verify` passed typecheck, 178 test files with 3 skipped, 2004 tests with 3 skipped, the UI production build, and factory readiness.
- Boundary review: deterministic tests are credential-free; durable evidence records no production prompt text or resolved payload content.
- Review-fix RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` produced the expected 2 failures when generic payload serialization transferred unregistered fields.
- Review-fix GREEN: the same targeted command passed all 50 tests after registered per-pack field renderers excluded unregistered fields while retaining allowed sentinel fields.
- Review-fix verify: `npm run verify` passed after the renderer change. Registered payload rendering is bounded, ordered, labelled with pack identity and content hash, and excludes fields outside its package-owned allowlists.
- Authoritative-shape review fix: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` passed with 1 file and 50 tests after replacing synthetic/general rendering with registered per-pack field renderers.
- Authoritative-shape verify: `npm run verify` passed; prompt text and payload values are not recorded in this claim.
- Renderer-policy review-fix RED: the targeted prompt renderer suite failed as expected because the synthetic memory item field registration omitted an authoritative summary field; 50 other tests passed.
- Renderer-policy review-fix GREEN: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` passed with 1 test file and 51 tests. The registered policy material is now the source for renderer field collections and per-pack renderer definitions, including authoritative memory fields.
- Renderer-policy review-fix verify: `npm run verify` completed successfully. Durable evidence records no production prompt text or resolved payload content.
- Renderer/artifact review-fix RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/prompt-artifacts.test.ts` produced the expected three failures for unbound canonical renderer material, discarded persisted production payload envelopes, and ignored persisted payload tampering. Existing coverage passed; no prompt text or payload values are recorded here.
- Renderer/artifact review-fix GREEN: the same targeted command passed 2 files and 71 tests. Renderer hashes now bind canonical section grammar, registered renderer paths/labels, field rules, redaction behavior, and limits; all registered renderer-pack fixtures reject invalid payload shapes in their registry parser before rendering.
- Durable artifact review-fix: serialized production envelopes retain locally re-verified context payload envelopes after parse, reject tampered persisted payload bytes, and audit DTOs remain payload-free.
- Final verify: `npm run verify` passed typecheck, 178 test files with 3 skipped, 2010 tests with 3 skipped, the UI production build, and factory readiness (exit code 0). Status remains `ready-for-review`.
- Authoritative rehydration review-fix RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/context-packs.test.ts` produced the expected 4 failures; 1 test file and 116 tests passed.
- Authoritative rehydration review-fix GREEN: the same targeted command passed 3 test files and 121 tests.
- Authoritative rehydration review-fix verify: `npm run verify` passed typecheck and completed successfully. Status remains `ready-for-review`.
- Boundary review-fix RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/context-packs.test.ts` produced the expected 5 boundary failures for missing parser identity metadata, renderer-material byte rendering, foreign parser identity acceptance, malformed production scope acceptance, and generic production-shaped provider transfer. Existing coverage reported 121 passing tests.
- Boundary review-fix GREEN: the same targeted command passed 3 test files and 126 tests. Production transfer now requires production renderer verification, canonical parser identity matching, strict task/PRR scope shape, and renderer-material-bound provider bytes.
- PRR verifier repair: `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts` passed 1 test file and 12 tests after the PRR workflow fixture stopped fabricating a production prompt artifact and exercised the registered PRR renderer path.
- Boundary + PRR regression: `npm test -- packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/prr-negotiation-workflow.test.ts` passed 4 test files and 138 tests.
- Latest full verify: `npm run verify` passed typecheck, 178 test files with 3 skipped, 2017 tests with 3 skipped, UI production build, and factory readiness. Durable evidence records no production prompt text or resolved payload content.
- Review-blocker RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/prompt-artifacts.test.ts` produced the expected 4 failures for generic production-shaped transfer, parser-identity-only acceptance, renderer-material byte divergence, and associated-PRR scope binding. No prompt text or resolved payload values are recorded.
- Review-blocker GREEN: `npm test -- packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/prr-negotiation-workflow.test.ts` passed 4 test files and 141 tests. Coverage binds provider transfer to renderer-issued verification, production context eligibility to registry-owned parser authority, provider bytes to material field/path grammar, and associated PRRs to both ref and payload scope.
- Review-blocker verify: `npm run verify` completed successfully with typecheck passing. The test path is deterministic and credential-free; this claim contains no production prompt text, provider response text, or resolved payload values.
