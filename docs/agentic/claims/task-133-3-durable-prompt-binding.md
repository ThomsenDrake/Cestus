# Task133.3 Claim: Durable Prompt Binding And Hash-Only Receipt

- Plan: `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`, terminal CF-1R27/R28, integrated at `03c74856e45ca16779e1af2338a4ed4c63cc02e2`.
- Authority: registry authorizations `6651b139e74e5c71b7b0f499e3b2a44cb61798ce` and `68f68c47cc1ef49188c4210e7035ccb9b9c66c35`; coordinator records RV-1-E-385/E-386, RV-1-E-398 at `bf6837e7b435296f6196d39d8dd1ca59e6662d67`, and RV-1-E-403.
- Worker and branch: `/root` / `codex/task-133-atomic-prompt-binding-review-recovery-2`.
- Source base: `197c3ca528e9b666c02b9b87695bf900efa195b1`.
- Status: `recovery/verified`, awaiting fresh coordinator review and integration as the sole atomic Task133.1-.3 amendment over the stated source base.
- SDD history: the coordinator explicitly authorized `superpowers:subagent-driven-development`; this recovery was executed directly, with no internal implementer or self-integration.

## Evidence

## RV-1-E-403 Coordinator Typecheck Receipt-Material Recovery

The first type-only repair constrained the identity override table, but the
coordinator's next compiler run still reported TS2345 at line 151. The remaining
root cause was separate: `receiptMaterial` had been destructured from the
schema-derived `KnowledgeEvent` receipt, whose hash fields are statically plain
`string` even when the runtime event is canonical. Spreading that material into
the strict fixture therefore lost the `sha256:${string}` receipt contract.

The test now derives material through a local helper whose input and return are
respectively `TaskOrchestratorPromptBindingReceiptV1` and its exact
`Omit<..., "schemaVersion" | "receiptHash">`; the source is the test-local
canonical fixture, not the schema-derived event. The typed `Partial<Pick<...>>`
identity override table remains in place. This is test-only, uses no casts or
non-null assertions, and leaves production validation unchanged. The exact
Task133.3 suite passed 6 files / 141 tests and local `npm run typecheck` exited
0 after the repair; final committed-candidate gates remain required.

## RV-1-E-403 Coordinator Typecheck Fixture Recovery

After all 350 focused tests passed, coordinator-independent `npm run typecheck`
reported TS2345 at `task-orchestrator-projection.test.ts:147`: TypeScript had
inferred the heterogeneous `identityCases` array as a widening union, causing
the spread into the strict receipt fixture to lose its exact field context.
The repair constrains that test-only collection to
`readonly Partial<Pick<TaskOrchestratorPromptBindingReceiptV1,
"taskId" | "attemptId" | "runId">>[]`. It adds no cast, does not weaken the
receipt fixture or production types, and cannot alter runtime validation.

The exact Task133.3 focused suite passed 6 files / 141 tests and local
`npm run typecheck` exited 0 after the constraint. The coordinator's reported
compiler failure is recorded as the causal RED for this test-only recovery;
the final committed-candidate gates remain required before review.

## RV-1-E-403 Non-Minting Receipt Boundary Recovery

The proposed structural checkpoint-owner builder remained caller-constructible
and therefore could not be a production authority boundary. Task133 has no
unforgeable receipt-minting owner, so the recovery removes every production
receipt constructor/export rather than publishing another generic API.

The revised causal RED ran the exact Task133.3 command and exited 1 with the
new absence witness failing only because
`buildTaskOrchestratorPromptBindingReceiptForCheckpoint` was still exported
(140 tests passed; 141 total). The GREEN passed 6 files / 141 tests after the
constructor was removed. Its governed tests build fixtures locally from strict
canonical receipt material and the canonical receipt hash; no shared
production fixture seam was added.

The durable counterfactuals mutate a valid receipt's `taskId`, `attemptId`, or
`runId`, recompute `receiptHash`, retain the target checkpoint identity, and
prove rejection at canonical event parsing, direct projection, and real
append-only ledger replay/rebuild. Direct strict-receipt negatives additionally
reject an unknown receipt key and missing or v0 `schemaVersion` under an
otherwise valid checkpoint. Canonical validation, projection, and rebuild
remain the only enforcement boundaries; no Task140P/R0 admission authority is
introduced here.

## RV-1-E-398 Receipt Identity Transplant Recovery

The prior receipt material and canonical hash omitted `taskId`, `attemptId`,
and `runId`, allowing a hash-valid receipt to be moved to another prompt-bound
checkpoint and projected with that checkpoint's identity. This repair makes
all three fields immutable required receipt material, includes them in the
strict canonical schema and hash, and compares them exactly with the enclosing
checkpoint in both ontology validation and projection. The receipt reference
projects its validated task/attempt/run identity instead of stamping enclosing
values onto unbound material.

The causal RED exited 1 with exactly three boundary failures and 137 passing
tests: canonical event parsing accepted the task/attempt/run swaps, direct
projection retained them, and a real `InMemoryEventLedger` rebuild projected
them. The final exact Task133.3 GREEN passed 6 files / 140 tests. Each of the
three swapped identity cases is rejected before projection, and the ledger
rebuild proves no rejected receipt is retained. The boundary remains
hash-only, non-authoritative, and distinct from Task133.2's pure blocked
transfer result and Task140P/R0 authority ownership.

## RV-1-E-392 Typecheck Recovery

The coordinator also found optional fixture receipt dereferences in the durable
projection tests. The retained-receipt witnesses now explicitly require a
`prompt-bound` checkpoint with a present receipt before reading its hash. This
is an assertion of fixture presence, not a non-null assertion or a weakened
projection check. The exact Task133.3 suite passed 6 files / 137 tests after
the change.

The Task133.3 causal RED exited 1 with exactly three missing durable-projection
failures (134 passing tests): no retained receipt on the original prompt-bound
projection, none after runner-dispatching, and none after an actual ledger
rebuild. Its exact focused GREEN passed 6 files / 137 tests.

Checkpoint projection now separates `latestCheckpoint` from
`latestPromptBindingReceipt`. A valid prompt-bound receipt remains a compact
hash/event/attempt/run audit reference after later checkpoints, while the
latest checkpoint correctly becomes `runner-dispatching`. Receipt parsing still
recomputes the canonical hash and accepts a receipt only on a `prompt-bound`
checkpoint; malformed, forged, or other-checkpoint receipts are rejected. The
ledger replay witness appends real task events, projects them, and rebuilds the
same durable receipt without prompt bytes, tokens, credentials, proof, provider
output, or provider-transfer authority.
