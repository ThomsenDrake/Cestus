# Final Review Claim: Provider/Auth Fail-Closed Fixes

Plan: `docs/superpowers/plans/2026-07-07-resident-agent-provider-auth-implementation.md`

Task: Final review repair for resident agent provider/auth policy gaps

Worker identity: Codex provider/auth implementation lane

Branch: `codex/resident-agent-provider-auth-design`

Worktree: `/home/drake/.codex/worktrees/8f27/Cestus`

Claimed at: `2026-07-08T00:00:22Z`

Status: `in-progress`

Review findings to repair:

- Expired credential references must fail closed as `credential-expired` even when the secret-store binding reports healthy.
- Remote prompt-only providers must still require human byte-transfer approval for sensitive evidence prompts when remote transfer is allowed.

Owned files:

- `packages/agent/src/provider-readiness.ts`
- `packages/agent/test/provider-readiness.test.ts`
- `packages/agent/src/provider-selection.ts`
- `packages/agent/test/provider-selection.test.ts`

Verification plan:

- `npm test -- packages/agent/test/provider-readiness.test.ts packages/agent/test/provider-selection.test.ts`
- `npm test -- packages/agent/test/credential-reference.test.ts packages/agent/test/provider-registry.test.ts packages/agent/test/provider-readiness.test.ts packages/agent/test/provider-selection.test.ts packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/ui/test/agent-provider-setup-cards.test.ts`
- `npm run verify`
- `git diff --check`
- `npm run factory:check`

Notes:

- No live provider calls, real credentials, external services, setup flows, or byte transfer are in scope.
- Do not store API keys, OAuth tokens, secret-shaped diagnostics, provider responses, or prompt bytes in the ledger, portable workspace, tracked docs, diagnostics, model prompts, or agent memory.
