# Task 6 Claim: MVP Specialist Evidence Triage Runner

- Plan: `docs/superpowers/plans/2026-07-09-mvp-specialist-workflows-implementation.md`
- Design spec: `docs/superpowers/specs/2026-07-09-mvp-specialist-workflows-design.md`
- Task heading: Task 6: Evidence Triage Runner
- Worker identity: Codex GPT-5
- Branch: `codex/mvp-specialist-workflows-plan`
- Worktree: `/home/drake/.codex/worktrees/d901/Cestus`
- Branch base while working: `d87b378 feat: add prr and investigation specialist runners`
- Status: coordinator-verified and final re-review accepted; coordinator commit handoff in progress after the managed child sandbox could not write shared Git metadata. Task 7 was not started.

## Scope

- Implemented the resident-agent `evidence-triage` runner under the single `agent_default` identity.
- Kept outputs local and evidence-first: triage dossier, safe summaries, governance/quarantine flags, duplicate groups, evidence gaps, and assertion-candidate bundle hashes.
- Preserved all human/legal/provider/export/accepted-graph/destructive gates. The evidence-triage runner does not append governance, quarantine, assertion, provider-parse, PRR send, legal, export/publication, accepted graph, tool-completed, or scheduler execution events.
- Retrofitted Task 5 PRR negotiation and investigation planner outputs through the same mounted-workspace derivative-store interface because Task 6 review required real persisted specialist artifacts, not discarded hashes.
- Added registry/readiness vocabulary for the future `contradiction-claim-review` adapter family without registering or pretending an adapter exists.
- No Task 7 work was started.

## Implementation Summary

- Added `runEvidenceTriageWorkflow` with context packs for evidence summaries, governance locks, PRR production linkage, accepted graph duplicate checks, memory, task/run history, and workspace status.
- Added a shared descriptor-safe specialist derivative writer in `specialist-runner-kernel.ts`; it deterministically serializes JSON, rejects hostile getters/prototypes/cycles/sparse arrays/symbol keys/non-finite numbers, adapts the mounted workspace blob store into an exact `{contentHash,sizeBytes}` specialist store, and verifies returned content hash and byte count before ledger events reference artifacts.
- Evidence-triage artifacts include exact source provenance bundles derived from the authoritative provider preview: descriptor-safe evidence IDs, evidence/link event IDs, content hashes, related event IDs, artifact hashes, prompt artifact hash when present, and safe provider refs. `productionIds` are intentionally excluded because they are not authoritatively bound by the preview.
- Evidence triage is intentionally bounded local-only in this task. Model review booleans become local `nextSafeActions`; no inert governance/quarantine/assertion requests are appended, and provider-parse requests are not queued because the current adapter lacks an executable provider service contract.
- Evidence-triage successful local runs append terminal `agent.specialist-run.completed` events even when the handoff status is locally blocked by missing provider-parse service readiness. The separate next-action/handoff explains the deferred service; the run projection does not remain `running`.
- PRR negotiation now preflights the domain-supplied follow-up approval input before model invocation using descriptor-safe normalization plus the authoritative PRR preview builder. The same normalized input is used for `prr.followup.drafted` and the final authoritative preview, with only `messageSourceEventId` replaced by the drafted event.
- PRR follow-up tool requests bind exactly the correspondence adapter preview artifact hashes, including duplicate-hash dedupe matching the adapter. The local advisory artifact remains inspectable only through the handoff/derivative step and includes secret-safe `domainSourceBindings` tying it to the normalized domain-supplied snapshot without claiming it is the outgoing message body.
- PRR negotiation ready-for-review and waiting-for-approval branches append terminal `agent.specialist-run.completed` events for the local specialist work; pending send approval remains visible only on the separate tool-request projection.
- Investigation planner and PRR negotiation local artifacts are persisted through the same derivative-store interface, and post-model storage failures append terminal secret-safe failed events/handoffs without derivative steps or tool requests.

## Review Corrections Closed

- Removed evidence-triage executable review-request behavior for governance/quarantine/assertion and provider parse; these remain deferred non-executable local review suggestions.
- Added exact `contradiction-claim-review` readiness family mapping only for `diagnostic.investigative-signal.request` and `claim.contradiction-link.request`; accepted-graph review no longer satisfies contradiction-finder readiness.
- Corrected `diagnostic.investigative-signal.request` to the valid `ledger-review` + `ledger-review` permission pairing.
- Hardened preview/artifact normalization against nested accessors, custom prototypes, cycles, non-enumerable fields, symbols, duplicate bindings, duplicate event/hash arrays, and non-finite numbers before model/provider work.
- Added PRR preflight regressions proving hostile/stale follow-up previews fail before model invocation, derivative writes, `prr.followup.drafted`, specialist steps, or tool requests.
- Added adapter rebuild/execute regressions for PRR follow-up bindings, including duplicate underlying hashes.
- Converted model output that cites foreign evidence into a secret-safe `model-output-invalid` failed handoff/event rather than throwing after model completion.
- Added later derivative-write failure coverage for evidence triage, PRR negotiation, and investigation planner; failures append a safe failed handoff/event and no derivative step/tool event.
- Added descriptor-safe evidence ID snapshot coverage, including accessor and provider-time mutation regressions, so all artifacts use the exact preflight evidence IDs.
- Added terminal projection coverage for evidence triage and both PRR handoff branches so local successful runs do not remain `running`.

## Verification Evidence

- RED checkpoint: `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts` failed 2 new PRR preflight tests as expected because the old runner invoked the model/wrote a blob before rejecting hostile or stale preview input.
- GREEN PRR checkpoint: `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts` passed with 1 passed file / 10 passed tests.
- Focused registry/readiness checkpoint: `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/specialist-workflows.test.ts packages/agent/test/domain-execution-adapter-registry.test.ts packages/agent/test/specialist-runner-kernel.test.ts` passed with 5 passed files / 48 passed tests.
- Broader focused checkpoint: `npm test -- packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/specialist-workflows.test.ts packages/agent/test/domain-execution-adapter-registry.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/tool-gateway.test.ts` passed with 8 passed files / 96 passed tests.
- Typecheck: `npm run typecheck` passed.
- Final focused checkpoint: `npm test -- packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/specialist-workflows.test.ts packages/agent/test/domain-execution-adapter-registry.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts` passed with 8 passed / 2 skipped files and 96 passed / 2 skipped tests.
- Final hardening RED checkpoint: `npm test -- packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-runner-kernel.test.ts` initially failed after the exact writer hardening because raw mounted blob-store results include `path`; this proved callers needed the explicit specialist derivative-store adapter boundary.
- Final hardening GREEN checkpoint: `npm test -- packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-runner-kernel.test.ts` passed with 4 passed files and 35 passed tests.
- Final typecheck: `npm run typecheck` passed.
- Final focused checkpoint: `CESTUS_AGENT_LIVE_NOUS=0 npm test -- packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/domain-execution-adapter-registry.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/specialist-workflows.test.ts packages/agent/test/tool-gateway.test.ts` passed with 8 passed / 2 skipped files and 102 passed / 2 skipped tests.
- Diff hygiene: `git diff --check` passed.

## Live And Full Verification

- Coordinator evidence before the final terminal/provenance hardening was: evidence-triage Nous live passed 1/1, PRR Nous live passed 1/1, and `npm run verify` passed with typecheck, 165 passed / 3 skipped files, 1665 passed / 3 skipped tests, Vite build, and factory-readiness.
- Coordinator final verification on the exact current code:
  - Evidence triage real Nous live acceptance passed with 1 passed file / 1 passed test.
  - PRR negotiation real Nous live acceptance passed with 1 passed file / 1 passed test.
  - `npm run verify` passed with typecheck, 165 passed / 3 skipped files, 1671 passed / 3 skipped tests, Vite build, and factory-readiness.
  - `git diff --check` passed.

## Inline Review

- Performed a fresh inline review of the current diff against the final review requirements after the focused/typecheck/diff gates. Checked terminal completion events for evidence triage and PRR, local-only evidence-triage next actions, exact PRR adapter rebuild/request binding including duplicate hashes, descriptor-safe preview/evidence normalization, derivative-store exact-result hardening, production ID removal, and secret-safe provenance bindings.
- Final re-review verdict: no remaining blocking findings.
- Residual risk: no dedicated mounted-store adapter hostile-return test. The exact specialist writer hostile-return behavior is covered, and mounted blob-store adaptation is otherwise covered by workflow persistence and hash retrieval tests.

## Commit Handoff

- Codex attempted to stage the complete Task 6/Task 5 hardening diff after final verification evidence was recorded.
- `git add ...` failed with: `fatal: Unable to create '/home/drake/Projects/Cestus/.git/worktrees/Cestus7/index.lock': Read-only file system`.
- The coordinator took over from a writable shell after preserving the verified diff. The resulting repository history entry contains this claim and the complete reviewed change.

## Owned Files

- `packages/agent/src/evidence-triage-workflow.ts`
- `packages/agent/test/evidence-triage-workflow.test.ts`
- `packages/agent/test/evidence-triage-nous-live.test.ts`
- `packages/agent/src/specialist-runner-kernel.ts`
- `packages/agent/test/specialist-runner-kernel.test.ts`
- `packages/agent/src/prr-negotiation-workflow.ts`
- `packages/agent/test/prr-negotiation-workflow.test.ts`
- `packages/agent/test/prr-negotiation-nous-live.test.ts`
- `packages/agent/src/investigation-planner-workflow.ts`
- `packages/agent/test/investigation-planner-workflow.test.ts`
- `packages/agent/src/specialist-workflows.ts`
- `packages/agent/test/specialist-workflows.test.ts`
- `packages/agent/src/specialist-readiness.ts`
- `packages/agent/test/specialist-readiness.test.ts`
- `packages/agent/src/domain-execution-descriptors.ts`
- `packages/agent/test/domain-execution-adapter-registry.test.ts`
- `packages/agent/src/permission-policy.ts`
- `packages/agent/test/tool-gateway.test.ts`
- `packages/agent/src/index.ts`
