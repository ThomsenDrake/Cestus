# Task 4 Claim: Tool Gateway And Permission Policy

Plan: `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`
Task: Task 4: Tool Gateway And Permission Policy
Worker: Codex GPT-5
Branch: `codex/cestus-resident-agent-foundation`
Worktree: `/home/drake/.codex/worktrees/6fc5/Cestus`
Claimed-at: 2026-07-07T16:31:23Z
Status: ready-for-review

Owned files:
- `packages/agent/src/permission-policy.ts`
- `packages/agent/src/tool-gateway.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/tool-gateway.test.ts`
- `docs/agentic/claims/task-4-tool-gateway-permission-policy.md`

Targeted commands:
- `npm test -- packages/agent/test/tool-gateway.test.ts`
- `npm test -- packages/agent/test/tool-gateway.test.ts packages/agent/test/projection.test.ts packages/ontology/test/agent-contracts.test.ts`
- `npm run verify`

Command evidence:
- Red: `npm test -- packages/agent/test/tool-gateway.test.ts` failed before implementation with `Cannot find module '../src/tool-gateway.js'` from `packages/agent/test/tool-gateway.test.ts`.
- Green: `npm test -- packages/agent/test/tool-gateway.test.ts` passed with 1 test file and 7 tests passing.
- Targeted: `npm test -- packages/agent/test/tool-gateway.test.ts packages/agent/test/projection.test.ts packages/ontology/test/agent-contracts.test.ts` passed with 3 test files and 33 tests passing.
- Verify: `npm run verify` passed with typecheck passed, 108 test files and 1003 tests passing, UI build succeeded, and factory-readiness passed.

Invariant notes:
- Preserve append-only ledger semantics: the gateway may append agent tool lifecycle events only and must not execute PRR sends, provider parses, exports, repairs, projection rebuilds, or accepted ontology review paths.
- Preserve provenance and projection rebuildability: every request, approval, denial, completion, and failure must be replayable from ledger events and tied to the stable tool request stream.
- Preserve human gates: provider byte transfer, external message sends, legal escalation, export/publication, destructive repair, and ledger review remain approval-gated; agent actors must not approve their own requests.
- Preserve exact approval binding: human approvals must bind the exact preview hash, and stale, denied, or failed requests must fail closed.
- Preserve secret safety: failure messages, denial rationales, and repair actions must be secret-safe before entering ledger events.
- Preserve portable workspace compatibility: gateway behavior must stay deterministic, local-only, and independent of live providers, credentials, network access, or runtime services.

Self-review notes:
- Gateway methods append only `agent.tool.*` events to the provided ledger; no provider, PRR, legal, export, projection rebuild, repair, or accepted graph service is called.
- The gateway API accepts review previews, but committed request events use the existing ontology contract fields: `previewHash`, `scope`, `estimatedEffect`, source events, and artifact hashes.
- Human approval is required for gated completion, agent actors cannot approve, stale preview hashes are rejected, and denied or failed requests fail closed before a completion event can append.
- Read-only, local-derivative, and ledger-proposal actions default to `none`; all riskier side-effect classes map to the task-specified approval classes.
- Failure messages, denial rationales, approval rationales, read-model changes, result summaries, and failure repair actions are checked with `assertAgentSecretSafeText`.
