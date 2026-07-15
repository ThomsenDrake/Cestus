# Task133 authority-split plan-amendment claim

- Status: documentation-only candidate pending the documentation gate and two
  fresh independent defects-first plan reviews. It authorizes no source/test
  implementation, provider, credential, network, Nous, reset-credit, full
  verification, `neo`, rebase, merge, push, or coordinator integration.
- Owner: the sole docs-only Task133 plan-repair author on
  `codex/task133-authority-split-plan-amendment`.
- Base: `dcb863e2bf258205308cdb35955f10ef71fdc501`, the append-only RV-1-E-365
  authority-source record. The later watchdog-registry dispatch record is
  `e872dda04644c055b88ce4b84de37012e7a054d8`; it changes only the registry and
  confirms this docs-only assignment.
- Changed files: exactly this claim and
  `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`.

## Decision

Task133.1-.3 remains one atomic 28-path discriminated V1/V2 schema, binder,
approval-boundary, event, ontology, projection, and rebuild migration. It
preserves owner-derived hashes and binds V2 to byte-identical approved V1 text
without a second render. It cannot independently accept actual V2 provider
transfer: the only complete current tuple in its scope is caller-supplied
proof/exact-run data, which is non-authoritative.

Task133.2 therefore validates only pure V1/V2 artifact invariants and returns
`authority-resolution-required` for a structurally valid V2. It has no success
case that authorizes a transfer. This blocked result has zero provider,
readiness, adapter, ledger, runner, tool, store, handoff, and terminal effects.
It neither accepts nor creates a structural authority tuple.

Task133.3 owns strict hash-only `prompt-bound` receipt representation,
projection, and replay. Its projection retains the latest valid receipt
separately from the latest checkpoint, so a later `runner-dispatching`
checkpoint does not erase it. Projection is an audit/read model, not authority.

Task140P and factory-private Task140R0 are the first valid V2
transfer-admission path. P contributes an opaque one-use private admission
after current orchestrator readbacks; R0 consumes it and independently resolves
task/attempt/approved-run, workspace/mount, workflow/policy, provider
capabilities/selection-policy, and canonical readiness from captured sources.
P alone remains blocked. P appends/reads the receipt and marks private
admission; R0 neither appends receipts nor reimplements the binder, renderer,
hashing, V1 store, or projector. Task140H alone later consumes the admission
for provider/H effects.

## Exact future ownership

- Task133.1-.3 retains the exact 28 paths named in CF-1R27 and commits them
  once after all three focused GREEN phases and the atomic typecheck/static/
  diff/factory gate.
- Task140P owns only its listed private admission/orchestrator/approval-port
  files and focused tests. Task140R0 starts after P integration and owns only
  its listed factory/composition/route/import-test files. H and R1 remain after
  R0. No concurrent worker edits a predecessor-owned file.
- Each later implementation message explicitly authorizes
  `superpowers:subagent-driven-development`, TDD,
  `verification-before-completion`, one fresh independent review, and
  coordinator-only integration for the named task.

## Validation and review handoff

Run only:

```bash
git diff --check && npm run factory:check
```

Candidate-specific review range:
`dcb863e2bf258205308cdb35955f10ef71fdc501..HEAD`.

Full-lineage review range:
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8^..HEAD`.

The two reviewers must independently check that Task133 cannot accept a
structural proof/exact-run as transfer authority, every blocked row is zero
effect, receipt retention survives runner dispatch and ledger replay, P/R0
sources are independently current and private, binder/renderer/receipt roles
are not duplicated, and the stated commands and serialized merge order are
complete. Only two unqualified approvals permit coordinator-only plan
integration; rejection requires another append-only documentation correction.

## Forward repair after fresh plan review — 2026-07-15

The rejected-but-preserved candidate is
`8b36829ab23019b9e3d8595d24bac2b09bc40496`. Its fresh authority/security
review verdict was **APPROVED**. Its separate factory-plan review verdict was
**NEEDS-CHANGES**, for three bounded plan defects: Task140P's GREEN depended on
an R0-owned resolver, the atomic Task133 phase omitted a required Task133.1
rerun between 133.2 and 133.3, and the candidate-specific review formula
incorrectly included the parent of the frozen base.

CF-1R28 is the forward repair. It preserves the rejected candidate and the
approved authority boundary, while requiring that Task140P prove only opaque
admission creation/validation, the absence of factory-private authority, and
zero provider, ledger-write, tool, runner, store, handoff, or terminal
transfer effects. P's own tests neither import, instantiate, fake, nor depend
on the Task140R0 factory resolver. After reviewed P integration, Task140R0
alone supplies the complete private independently-current authority and owns
the first valid end-to-end V2 provider-transfer admission control; it does not
duplicate Task133 renderer, binder, or receipt ownership.

The correction also requires the exact complete Task133.1 suite to pass after
Task133.2 and before Task133.3 begins, without breaking the one-commit atomic
Task133.1-.3 phase. Every active candidate-specific review reference is exactly
`dcb863e2bf258205308cdb35955f10ef71fdc501..HEAD`, never a parent-inclusive
form. Two new independent reviews—authority/security and factory-plan—must
review the repaired candidate. Each future implementation authorization must
explicitly approve `superpowers:subagent-driven-development` where subagents
are relevant, TDD, verification-before-completion, fresh independent review,
and coordinator-only integration.
