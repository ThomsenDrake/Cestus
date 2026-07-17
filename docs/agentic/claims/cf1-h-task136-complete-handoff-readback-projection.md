# CF1-HR Complete Handoff Readback / Projection Claim

- Status transition: `claimed` -> `implementing`
- Card: `CF1-HR`, strict V4 release card 14
- Worker: Codex `gpt-5.6-terra` / `xhigh`
- Branch: `codex/cf1-handoff-readback`
- Worktree: `/home/drake/.codex/worktrees/00c5/Cestus`
- Exact base: `9c5f6229e86de8578a3d0b34f47769753be80ba2`
- Governing V4 authority: `docs/agentic/contracts/task136-bounded-assurance-v4.json`
- Governing final integrated loop authority: `docs/superpowers/plans/2026-07-12-resident-agent-bounded-loop-implementation.md`

## Scope And Disposition

1. `packages/agent/src/specialist-runner-kernel.ts` — owned
2. `packages/agent/test/specialist-runner-kernel.test.ts` — owned
3. `packages/agent/src/specialist-handoff-projection.ts` — owned
4. `packages/agent/test/specialist-handoff-projection.test.ts` — owned
5. `docs/agentic/claims/cf1-h-task136-complete-handoff-readback-projection.md` — owned

This card produces the single H-owned complete authoritative handoff
readback/parser/producer contract that Task136 must consume verbatim. It reads
only authoritative durable ledger evidence, content-addressed manifest
readback, and current approved mounted authority. It preserves the strict V2
handoff ABI, append-only ledger semantics, provenance, projection
rebuildability, and one resident identity. It does not mint or expose W's
private capability; create a shadow authority, compatibility parser, shared
schema, mount/factory owner, or generic executor; accept caller structural
authority; append a fallback write; or expose provider/tool bytes or secret
material.

## Released Prerequisites

- Strict record 11: `Task137B-W`, release event
  `task136-release-v4-Task137B-W`, integration
  `9e680b44c4284456eebaad79c00fabda5c2bd4ea` (`RV-1-E-681`).
- Strict record 12: `W1-123-H-SHARED-SCHEMA`, release event
  `task136-release-v4-W1-123-H-SHARED-SCHEMA`, integration
  `0b5185f0d0dd276164ec70d5db150f5f6ccb3a79` (`RV-1-E-684`).
- Strict record 13: `W1-133.5-PREAPPROVAL-PROMPT-STORE`, release event
  `task136-release-v4-W1-133.5-PREAPPROVAL-PROMPT-STORE`, integration
  `75de81f110b4f405f9ec064104bc2c2b4f79e223` (`RV-1-E-685`).

## Required Evidence

1. Causal RED, committed before production changes:

   ```bash
   npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts
   ```

2. Minimum GREEN, then the same card command.

3. Cross-boundary command:

   ```bash
   npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoffs.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts
   ```

4. Final gates from committed bytes:

   ```bash
   npm run typecheck
   npm run verify
   git diff --check
   npm run factory:check
   ```

## Stop Rules

Stop and return structured evidence for a schema or file-owner conflict,
data-loss or safety risk, unavailable offline dependency, external behavior or
credential decision, or repeated verifier failure. Do not use the network,
providers, credentials, live services, push, integration, registry/spec/plan
edits, `neo`, rebase, reset, amend, discard, rewrite, or self-merge. Review
and integration remain outside this bounded implementation claim.

## Task 3 Corrected-Scope Continuation

- Status: `implementing` (one repair remains after this finite GREEN packet).
- Worker: Codex `gpt-5.6-terra` / `xhigh`.
- Corrected exact base: `0255ac2f8927851fb28220ac05a9b5acddfdcab3` on
  `codex/cf1-handoff-readback`; preserved claim commit:
  `56bbb10b745b742a86b7f63b878aadc105efee0c`.
- Exact prerequisites, in order:
  `W1-123-H-SHARED-SCHEMA`, `W1-133.5-PREAPPROVAL-PROMPT-STORE`,
  `Task137B-W`, `Task135B`, `Task129-MFA`.
- Task-scoped subagent-driven development and test-driven development are explicitly approved for this task.

### Corrected Owned Paths And Dispositions

1. `packages/agent/src/specialist-runner-kernel.ts` — owned
2. `packages/agent/test/specialist-runner-kernel.test.ts` — owned
3. `packages/agent/src/specialist-handoff-projection.ts` — owned
4. `packages/agent/test/specialist-handoff-projection.test.ts` — owned
5. `packages/agent/src/specialist-handoff-manifest.ts` — owned
6. `packages/agent/test/specialist-handoff-manifest.test.ts` — owned
7. `packages/agent/src/specialist-handoff-authority.ts` — owned
8. `packages/agent/test/specialist-handoff-authority.test.ts` — owned
9. `packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts` —
   direct source transfer from `Task135B`
10. `packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`
    — direct source transfer from `Task135B`
11. `packages/ontology/src/contracts.ts` — direct source transfer from
    `Task137B-W`
12. `packages/ontology/test/agent-contracts.test.ts` — direct source transfer
    from `Task129-MFA`
13. `packages/ontology/test/agent-resident-loop-contracts.test.ts` — owned
14. `docs/agentic/claims/cf1-h-task136-complete-handoff-readback-projection.md`
    — owned

These are finite direct source mappings only. Current-HEAD source remains
authoritative until strict record 14. No generic, multi-target, transitive, or
compatibility transfer is authorized.

### Corrected Commands

Focused RED/GREEN command:

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/ontology/test/agent-contracts.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts
```

Cross-boundary command:

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/ontology/test/agent-contracts.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts packages/agent/test/specialist-handoffs.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts
```

The final finite packet also requires `npm run typecheck`, `npm run verify`,
`git diff --check`, `npm run factory:check`, the exact changed-path audit, a
clean tracked/untracked state, and real top-level dependency checks. The
record-13 inherited baseline is 12 files / 69 tests; final verification will
differentiate inherited evidence from this packet.
