# Task 123 Ontology Bootstrap Canonical Handoff Recovery Claim

Plan: `docs/superpowers/plans/2026-07-12-resident-agent-durable-handoffs-implementation.md`
Frozen authority: W1-123 canonical staged-report reader recovery
Task: resume the rejected ontology-bootstrap handoff slice only on the public ingestion reader
Worker: Relay A coordinator-owned bounded recovery
Base: `e7a1d5b6`
Status: `ready-for-review`

## Exclusive Files

- `packages/agent/src/ontology-bootstrap-workflow.ts`
- `packages/agent/test/ontology-bootstrap-workflow.test.ts`
- `packages/local-runtime/src/agent-ontology-bootstrap-routes.ts`
- `packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`
- this claim

## Boundary

- The workflow reads the report only through public
  `readCanonicalStagedLegacyReport`; caller-provided report bytes are not used
  as bootstrap material.
- The route derives the exact generated-report event from the mounted ledger
  and supplies the mounted derivative capability.
- A successful run persists and rereads the exact final-output -> prepared ->
  recorded -> terminal lifecycle via the shared handoff kernel. Forged staged
  report identity fails before bootstrap effects.
- Rejected `404ac711` was inspected only as read-only conceptual evidence; it
  was not cherry-picked, merged, or copied wholesale. No full verifier,
  self-integration, reviewer dispatch, or `neo` change is authorized here.

## RED/GREEN Evidence

- Initial focused RED:
  `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts -t 'fails closed before bootstrap effects for a forged canonical report-event binding|binds the exact final-output to prepared, recorded, and terminal lifecycle chain'`
  exited `1`: forged report-event input returned `ok: true`, and the lifecycle
  contained only the dossier step.
- Focused GREEN:
  `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`
  exited `0` with 2 files and 13 tests passing. The retained counterfactuals
  prove fail-closed forged event binding, exact actor/correlation/event-type/
  causation chain, and ordered terminal readback.
- `npm run typecheck`, `git diff --check`, and `npm run factory:check` exited
  `0`. The temporary untracked dependency symlink used to execute focused
  gates was removed before this claim/candidate is committed.

## Three-P1 Canonical-Authority Follow-up

- Fresh defects-first review rejected the prior candidate because the exported
  workflow still accepted omitted canonical identity and caller report bytes,
  run start provenance did not bind the exact generated-report event plus both
  report hashes, and production lifecycle readback did not enforce exact
  final-output -> prepared -> recorded -> terminal correlations.
- RED was observed in
  `packages/agent/test/ontology-bootstrap-workflow.test.ts`: omitted reader
  identity returned `ok: true`; a run with a different source event and only a
  candidate-set hash returned `ok: true`; and a faulting ledger that changed
  the terminal correlation returned `ok: true`.
- GREEN makes `stagedReport`, `reportEventId`, and the derivative store
  mandatory public workflow inputs. The workflow reads bytes only through the
  ingestion-owned canonical reader, validates the run's exact source event and
  both canonical report/candidate hashes before effects, persists every
  successful path through the durable handoff kernel, and rereads exact actor,
  correlation, event-type, causation, and order bindings. The route starts or
  reuses only a run with the same canonical provenance.
- Latest non-full verification: `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`
  exited `0` (3 files, 50 tests); `npm run typecheck`, `git diff --check`, and
  `npm run factory:check` exited `0`. No candidate full verifier, integration,
  self-integration, or `neo` change is authorized. The temporary untracked
  `node_modules` symlink must be removed before the sealed candidate commit.

## Exact-Provenance and Replay Follow-up

- A second fresh defects-first review rejected `5744a67a` because provenance
  used subset membership and a later-clock replay rebuilt conflicting handoff
  material. The repair adds causal RED coverage for an otherwise-correct run
  containing an extra source event or artifact hash, the route reuse predicate
  under the same condition, and a completed run replayed with a later `now()`.
- The initial focused RED command exited `1`: extra provenance was accepted
  and the later-clock replay returned `external-effect-failed`. Green requires
  exact duplicate-free source and artifact sets in both workflow and route,
  while all review/dossier/context-pack material is derived from the durable
  run-start timestamp rather than retry time.
- Latest non-full verification: `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`
  exited `0` (3 files, 52 tests); `npm run typecheck`, `git diff --check`, and
  `npm run factory:check` exited `0`. No candidate full verifier,
  self-integration, integration, or `neo` change is authorized; this sealed
  follow-up requires a fresh independent defects-first review.

## V4 Card 27 — W1-123-BOOTSTRAP-HANDOFF Ownership And Status

- Status transition: `claimed -> implementing` under strict record 26
  (`RV-1-E-871`); base authority is clean program HEAD
  `3fd03d675f58f69cc974396aa23257f060cbfcf3`.
- Sole bounded implementation owner: Codex `gpt-5.6-terra` / `xhigh`, on
  `codex/w1-123-bootstrap-handoff-v4`. Released prerequisites are exactly
  `CF1-HR`, `Task121`, and `Task122`.
- This V4 packet owns only `packages/agent/src/ontology-bootstrap-workflow.ts`,
  `packages/agent/test/ontology-bootstrap-workflow.test.ts`,
  `packages/local-runtime/src/agent-ontology-bootstrap-routes.ts`,
  `packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`, and
  this claim. It consumes the mounted V2 authority/readback lifecycle and
  Task122 cursor semantics without changing shared contracts, stores,
  authority producers, providers, registry, assurance, or accepted ontology
  truth.
- Required sequence: preserve a claim-only commit, then a causal RED commit
  that proves the missing production authority composition plus a fail-closed
  mounted-authority counterfactual, followed by the minimum scoped GREEN and
  exact V4 gates. No subagent, self-review, integration, release record, push,
  provider, credential, network, external, PRR, legal, or `neo` action is
  authorized.

### Causal RED — Missing Mounted V2 Composition

- Before production edits, the exact V4 command
  `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`
  exited `1`: **2 files / 19 tests**, **2 failed / 17 passed**.
- New causal counterfactual: an otherwise exact canonical report/run with
  `handoffAuthorityWitness: undefined` returned `ok: true` and wrote bootstrap
  material instead of failing before effects. The retained mounted production
  launch independently returned HTTP `500` where its public contract requires
  `200`.
- Root cause: the workflow still calls the legacy
  `recordSpecialistHandoff`/`finalizeSpecialistRunAfterHandoff` path and has no
  V2 witness input. The production route supplies an ordinary derivative store
  but no current factory-issued mounted authority/readback lifecycle. The
  GREEN must consume only the released opaque mounted binding, retain exact
  cursor/prelude semantics, and map unavailable, stale, or swapped capability
  state to bounded no-material diagnostics.

### V4 Green Boundary — Approval Suspension And Factory Entry

- The released Task121 precedent resolves the approval branch without changing
  a V2 terminal result back to waiting: mounted authority is required before
  work; an outstanding approval request returns the existing
  `waiting-for-approval` handoff with no final-output, prepared, recorded,
  terminal, orchestration-completed, or completed-task effect; only an
  approval-free path may consume the V2 terminal lifecycle.
- The upstream default-factory
  `blocked.factory-context-attestation-required` occurs before this card's
  route boundary: `handleAgentHttpRoute` constructs
  `defaultLocalAgentRuntimeFactory` before it invokes
  `handleAgentOntologyBootstrapRoute`. It is the intended later Task140
  predecessor boundary, not a Task123 defect.
- The route's existing `agentRuntimeFactory` HTTP seam therefore injects a
  released-interface-conformant resident runtime only in this card's route
  test. That test injection neither changes nor bypasses the default factory,
  and this card makes no claim that default composition is ready.
- The bounded diagnostic that established the predecessor was:
  `defaultLocalAgentRuntimeFactory` calls
  `createFactoryHeldContextBindingVerifier(createContextPackRegistry())`, which
  fails because its new registry has no registered descriptors. No fallback
  runtime, store, controller, authority, or write was introduced.

### V4 Intended GREEN

- Exact focused command:
  `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`
  exits `0`: **2 files / 19 tests passed**. This is a **+1 passing-test delta**
  from the inherited 18-test baseline, retaining the missing-authority
  counterfactual and the route's approval-suspended `waiting-for-approval`
  behavior without a terminal V2 handoff.

### V4 Recovery RED — Factory-Only Issuer Boundary

- Candidate `763e3b943786ab69d157afccef50fed06b4c96cb` failed the required
  repository mode during the Task137A command with one policy failure:
  `packages/local-runtime/src/agent-ontology-bootstrap-routes.ts may not import
  packages/local-runtime/src/mounted-artifact-authority-operation.ts`.
  Repository mode consequently stopped at `release command failed: Task137A`,
  before the expected record-26 closure diagnostic.
- Cause: the first GREEN made the route call the factory-only
  `issueMountedArtifactAuthorityOperationForFactory`. The released Task137
  authority grammar and Task140 ownership make that an invalid route-side
  composition tactic. The corrective tactic is to have the route consume only
  a factory-provided opaque mounted handoff binding from its existing runtime
  seam; the route neither issues nor inspects a factory operation. The
  test-only runtime factory may provide that released binding before Task140;
  production default composition remains deliberately unavailable.

### V4 Recovery GREEN — Runtime Consumer Seam

- The route no longer imports or calls
  `issueMountedArtifactAuthorityOperationForFactory`. It consumes an opaque,
  exact task/run binding only from its existing runtime object and stops that
  binding after use. It cannot create, inspect, mint, or substitute a mounted
  operation, store, controller, or witness.
- The route test's injected resident runtime creates the same released
  portable binding under test authority; a separate injected runtime without
  that binding now returns bounded HTTP `503` before any bootstrap dossier,
  approval request, final-output, handoff, or terminal effect. This remains a
  test-only predecessor bridge and does not make default factory composition
  ready.
- Recovery focused GREEN:
  `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`
  exits `0`: **2 files / 20 tests passed** (+2 from the inherited 18-test
  baseline).

### V4 Recovery RED — Pre-effect Opaque-Authority Validation

- Fresh independent architecture and execution reviews rejected candidate
  `72e39d0eedab1904be2d217fbc6029e374dab474`: a plain object carrying the
  public witness schema string reaches final-output/material writes before the
  V2 recorder rejects it, and a factory-issued witness whose currentness
  callback rejects reaches the approval-suspended dossier, tool-request, and
  waiting task-status events without any revalidation.
- The causal RED added both counterfactuals before source edits. Exact focused
  command `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts
  packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts` exited
  `1`: **2 files / 22 tests**, **2 failed / 20 passed**. The forged witness
  returned `external-effect-failed` with a newly appended failure event after
  material work; the stale factory witness returned `ok: true` with three new
  workflow events on the pending-approval path. Both tests require an empty
  event delta and zero material writes.
- The released-interface obstruction is exact and precedes any production
  edit. `consumeMountedSpecialistHandoffAuthorityWitness` is the only exposed
  opaque-witness validation path; it invokes `revalidate` and irrevocably marks
  the witness `consumed` (`packages/agent/src/specialist-handoff-authority.ts`
  lines 84-103). The required V2 recorder accepts only that original opaque
  witness and consumes it itself (`packages/agent/src/specialist-runner-kernel.ts`
  lines 952-960), after workflow material/final-output work
  (`packages/agent/src/ontology-bootstrap-workflow.ts` lines 752-823). The
  released portable binding exposes precisely one witness
  (`packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts`
  lines 293-310), with no non-consuming currentness readback or successor
  witness capability. Consuming it in Task123 preflight would make the later
  mandatory V2 recorder reject it as already consumed; creating/accepting a
  replacement, widening the workflow/runtime contract for a second witness,
  or revising the shared authority/recorder would violate this card's scope.
- Per the frozen ownership rule, no production GREEN is attempted from this
  RED until a released authority interface supplies a non-consuming preflight
  readback or an explicitly paired successor witness while preserving the V2
  terminal consumer.

### V4 Recovery GREEN — Exact Non-consuming Authority Preflight

- Released authority `RV-1-E-878` transfers the authority source/test and
  portable mounted-store source/test to this card, expanding its finite scope
  to exactly nine V4 paths while preserving causal RED
  `7a7509aa984e2d59ad212fa801c1dcaa2e996451`.
- The authority module now preflights only an exact factory-issued WeakMap
  witness in `available` state: it verifies the exact task, deterministic
  attempt, run, type, retry, and normalized authority binding, invokes mounted
  currentness, and burns rejected available members without exposing binding
  bytes or consuming a successful witness. The later V2 recorder remains the
  sole one-shot witness consumer.
- The portable layer proves the exact issued binding object, its witness and
  distinct material/manifest stores, the paired opaque controller/cursor, the
  complete task/run/attempt/type/retry tuple, and current mounted lineage. It
  performs only readback/currentness checks and burns its cursor on a forged,
  swapped, stale, or conflicting preflight.
- The ontology-bootstrap workflow invokes authority preflight before dossier,
  approval, waiting-status, final-output, or material effects; the route
  invokes portable preflight before entering that workflow. Approval suspension
  remains `waiting-for-approval`, and an approval-free run still passes the
  same preserved witness to the V2 final-output -> prepared -> recorded ->
  terminal lifecycle.
- GREEN focused command:
  `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts
  packages/agent/test/specialist-handoff-authority.test.ts
  packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts
  packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`
  exited `0`: **4 files / 58 tests passed**. The added authority and portable
  counterfactuals prove no-effect preflight plus later one-shot V2 consumption;
  the retained two workflow RED cases are now green.

### V4 Recovery RED — Route Admission Before Durable Effects

- After normal forward merge `ad32f7e844b6b52d935ad40381058a1a21dd18bb`
  of clean program authority `951aadb9388d3374ccedb686ebedccefe8b23b68`,
  the causal route tests reproduce the P1 from candidate
  `68d09db346833d38286204e319c20352e6b6c539` without changing production
  bytes.
- Exact V4 command:
  `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`
  exited `1`: **4 files / 59 tests**, **2 failed / 57 passed**.
- An injected real route runtime with no mounted-handoff provider returned
  `503` only after appending **13** durable events; the new full-ledger
  snapshot requires an exact zero event delta. A hostile accessor-backed
  structural handoff was also invoked by the route before the protected
  portable preflight; its test requires that accessor to remain unread and the
  same zero event delta. Both counterfactuals retain the real HTTP/runtime
  entry path and require failure before identity, task, ingestion, run,
  dossier/bootstrap, approval, material/manifest, or terminal effects.
- Root cause: `launchOntologyBootstrapRun` obtains and preflights the opaque
  mounted binding only after identity initialization, task creation,
  ingestion inspection/report, and specialist-run setup. Its
  `Partial<RuntimeMountedOntologyBootstrapHandoffProvider>` assertion also
  reads an unverified structural runtime capability. GREEN must establish a
  descriptor-checked runtime provider plus exact portable preflight directly
  after mounted-workspace availability, preserve the same opaque binding for
  the later workflow/V2 consumer, and stop it on every exit.
