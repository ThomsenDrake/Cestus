# Task133 pure-renderer plan-amendment claim

- Status: ready-for-review pending the recorded documentation gate.
- Coordinator-owned recovery after final delegated-author bound; only this
  plan and claim are changed in
  `codex/task-133-pure-renderer-plan-amendment` from exact
  `0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8`.

## Source-backed reconciliation

- `packages/local-runtime/src/agent-runtime-context-packs.ts` keeps
  `MountedWorkspaceRuntimeAuthority`, `VerifyMountedContextForRunInput`, and
  `VerifiedContextBindingSet` unexported; its membership evidence is private.
  `packages/local-runtime/src/agent-runtime-factory.ts` retains the lexical
  factory verifier for Task140R0. A Task133 public verifier callback or mirror
  would reopen the retired authority route.
- `packages/agent/src/prompt-artifacts.ts` owns artifact/envelope/audit DTOs
  and `buildPromptArtifact`/`parsePromptArtifactEnvelope`, but production
  bindings require private resolved packs and the input lacks exact
  task/attempt/approved-run/provider-posture binding. It is therefore reused
  only for envelopes, not used as a Task133 authorization input.
- The amendment names the required new data-only owner
  `packages/local-runtime/src/agent-runtime-prompt-render-input.ts`, exact
  fields, `normalizePureAgentPromptRenderInput`, and
  `hashPureAgentPromptRenderInput`, plus pure renderer export
  `renderPureAgentPrompt`. Its tests and Task140R0 composition paths are exact
  in the amended plan; no conditional file ownership remains.

## Validation and closure

- Documentation validation required and observed before commit:
  `git diff --check && npm run factory:check`.
- Full verification, provider/network/credential/Nous actions, reset-credit
  redemption, `neo`, source implementation, self-review, self-integration,
  and merge are closed. A fresh independent Terra/xhigh defects-first plan
  review is required before any Task133 implementation redispatch.

## First review and forward repair

Fresh review of `0481c1e0..38c2456f` returned **NEEDS-CHANGES**: untyped
`templateData`, circular caller-supplied posture hashing, no canonical text
renderer, conditional duplicate Task140R0 artifact formation, and an unfrozen
dispatch base. The first amendment remains preserved as rejected history.

The forward repair removes that local renderer in full. It extends the one
existing agent-owned `renderProductionSpecialistPrompt` and prompt-artifact
production binding with exact run/provider data and non-circular computed
hashes; names the exact five-file Task133 scope and fail-fast commands; freezes
the Task120/126-130/132A ancestry gate; and gives Task140R0 one private,
single-render composition path with causal direct-artifact and swapped-field
zero-effect tests. No implementation is authorized until this repaired range
receives a new fresh independent approval.
