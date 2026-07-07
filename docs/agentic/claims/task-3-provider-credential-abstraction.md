# Task 3 Claim: Provider And Credential Abstraction

Plan: `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`
Task: Task 3: Provider And Credential Abstraction
Worker: Codex GPT-5
Branch: `codex/cestus-resident-agent-foundation`
Worktree: `/home/drake/.codex/worktrees/6fc5/Cestus`
Claimed-at: 2026-07-07T16:06:59Z
Status: in-progress

Owned files:
- `packages/agent/src/provider.ts`
- `packages/agent/src/secret-safety.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/provider.test.ts`
- `docs/agentic/claims/task-3-provider-credential-abstraction.md`

Targeted commands:
- `npm test -- packages/agent/test/provider.test.ts`
- `npm test -- packages/agent/test/provider.test.ts packages/agent/test/projection.test.ts`
- `npm run verify`

Invariant notes:
- Preserve provider/backend separation: model providers are execution backends and must not become resident agent identities.
- Preserve secret safety: credential references may serialize IDs, provider IDs, kinds, and safe labels only; raw credentials, bearer tokens, OAuth material, private keys, passwords, environment variable names, and raw provider errors must not enter tracked code paths, DTOs, docs, diagnostics, or browser output.
- Preserve append-only ledger semantics and projection rebuildability: this task introduces contracts and fake execution only; it must not add hidden mutable agent state or write accepted ontology truth.
- Preserve human gates: this task must not add provider byte transfer, PRR send, legal escalation, export, repair, or accepted graph-review execution paths.
- Preserve portable workspace compatibility: fake provider behavior must be deterministic, local-only, network-free, environment-credential-free, and suitable for standard verification without live services.
