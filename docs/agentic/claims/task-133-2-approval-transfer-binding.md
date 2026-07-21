# Task133.2 Claim: Exact Approval And Provider-Transfer Binding

- Plan: `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`, terminal CF-1R27/R28, integrated at `03c74856e45ca16779e1af2338a4ed4c63cc02e2`.
- Authority: registry authorizations `6651b139e74e5c71b7b0f499e3b2a44cb61798ce` and `68f68c47cc1ef49188c4210e7035ccb9b9c66c35`; coordinator records RV-1-E-385/E-386 and RV-1-E-403.
- Worker and branch: `/root` / `codex/task-133-atomic-prompt-binding-review-recovery-2`.
- Source base: `197c3ca528e9b666c02b9b87695bf900efa195b1`.
- Status: `recovery/verified`, awaiting fresh coordinator review and integration as the sole atomic Task133.1-.3 amendment over the stated source base.
- SDD history: the coordinator explicitly authorized `superpowers:subagent-driven-development`; this recovery was executed directly, with no internal implementer or self-integration.

## Evidence

## RV-1-E-403 Production Receipt-Mint Boundary Clarification

The coordinator rejected a structural checkpoint-owner wrapper because a
caller could still construct it. Task133 has no authoritative production
receipt-minting owner; Task140P/R0 owns first successful production admission.
Accordingly, this atomic recovery removes every production prompt-binding
receipt constructor/export. The Task133.2 pure blocked v2 transfer boundary is
unchanged: no caller proof, exact-run tuple, provider/readiness material, or
receipt can supply factory authority, and all blocked/rejected paths remain
zero-effect. Governed durable tests create only test-local, canonical-hash
fixtures; they add no shared production helper seam.

## RV-1-E-392 Typecheck Recovery

Coordinator-independent typecheck rejected candidate
`1fc698286edfda2a67bf4ed18e79fc708a9e22f0`: the broad
`PromptArtifactManifest` boundary declares `inputArtifactHash` as `string`,
while the frozen Task133 blocked result promises canonical SHA-256 hash types.
The repair validates both source and bound hashes with a runtime type predicate
before returning them as the frozen boundary result; it uses no type cast and
does not alter authority or effect semantics. The exact Task133.2 suite passed
3 files / 78 tests and `npm run typecheck` passed after the repair.

The Task133.2 causal RED exited 1 with seven expected API/authority-boundary
failures (71 passing tests). Its exact focused GREEN passed 3 files / 78 tests.
The new witnesses prove that a structurally valid v2 binding is blocked without
factory authority; caller proof and exact-run material cannot become transfer
authority; and mutations across every independently current authority family
remain zero effect.

`assertApprovedV1ToV2ArtifactInvariants` is a pure structural/byte-identity
check. `blockV2ProviderTransferUntilFactoryAuthority` returns only the frozen
`authority-resolution-required` boundary result. The selected v2 path returns
that boundary before provider, ledger, tool, runner, store, handoff, or terminal
activity. It does not add a proof, exact-run, provider, readiness, callback,
resolver, or factory-authority carrier. CF-1R27 reserves authoritative v2
transfer resolution for the later factory authority task.
