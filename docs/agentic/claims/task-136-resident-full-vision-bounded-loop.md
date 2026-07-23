# Task136 Record-29 Bounded Resident Loop Claim

Status: implementing

Strict release frontier: 28 of 29

Record 29 status: unreleased

Product candidate: none

## Exact Authority

- Approved written design:
  `d475edd5cafd57a6f7db6c26aeeecb48bd9459cd`
- Reviewed implementation plan:
  `c5df0231c82264a9bfde33dcfc7e68b61b37c93f`
- Implementation authorization:
  `0955f28f9115885fc8859b7b223f3d91cf77bf03`
- Approved V4 authority candidate:
  `91ad47489ce5506f91821dcf57b8fc0a2a1352a0`
- V4 approval:
  `3227e93d038773ab16f9efcfa742ba7cda5aa046`
- V4 integration:
  `bf392124e556b60781b374579f09c7dfe19918a9`
- Integrated product authority:
  `765cf6a689a6d8fc866f7a7870461ee5366e54be`
- Task136 authority merge:
  `85b47c8ab2a1770da12a8bdaed589715ad4bcfb1`
- Task136 authority-merge first parent:
  `72e1ee6624c582218995e3e075e2303998811834`
- Task136 authority-merge second parent:
  `765cf6a689a6d8fc866f7a7870461ee5366e54be`

The authority merge is a history-preserving two-parent `--no-ff` merge. Both
the preserved Task136 base and integrated product authority are ancestors.
No reset, rebase, amend, squash, cherry-pick reconstruction, discarded
commit, or force-push is permitted.

## Frozen Product Ceiling

The exact product ceiling is 30 paths: 13 sources, 16 tests, and this one
claim.

### Thirteen sources

- `packages/agent/src/bounded-agent-loop.ts`
- `packages/agent/src/plan-observation-contracts.ts`
- `packages/agent/src/plan-observation-projection.ts`
- `packages/agent/src/resident-plan-candidate-provider.ts`
- `packages/agent/src/resident-loop-tool-gateway.ts`
- `packages/local-runtime/src/wake-supervisor-runtime.ts`
- `packages/local-runtime/src/mounted-wake-lifecycle-store.ts`
- `packages/agent/src/specialist-handoff-projection.ts`
- `packages/ontology/src/contracts.ts`
- `packages/local-runtime/src/resident-loop-factory-ports.ts`
- `packages/agent/src/domain-execution-dispatcher.ts`
- `packages/agent/src/task-orchestrator.ts`
- `packages/agent/src/task-orchestrator-projection.ts`

### Sixteen tests

- `packages/agent/test/bounded-agent-loop.test.ts`
- `packages/agent/test/plan-observation-contracts.test.ts`
- `packages/agent/test/plan-observation-projection.test.ts`
- `packages/agent/test/resident-plan-candidate-provider.test.ts`
- `packages/agent/test/resident-loop-tool-gateway.test.ts`
- `packages/agent/test/resident-loop-scheduler-completion-imports.test.ts`
- `packages/local-runtime/test/wake-supervisor-runtime.test.ts`
- `packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts`
- `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts`
- `packages/agent/test/specialist-handoff-projection.test.ts`
- `packages/ontology/test/agent-resident-loop-contracts.test.ts`
- `packages/local-runtime/test/resident-loop-factory-ports.test.ts`
- `packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts`
- `packages/agent/test/domain-execution-dispatcher.test.ts`
- `packages/agent/test/task-orchestrator-claims.test.ts`
- `packages/agent/test/task-orchestrator-projection.test.ts`

### One claim

- `docs/agentic/claims/task-136-resident-full-vision-bounded-loop.md`

The exact sixteen-test command is:

```bash
npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts packages/agent/test/resident-plan-candidate-provider.test.ts packages/agent/test/resident-loop-tool-gateway.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts packages/local-runtime/test/resident-loop-factory-ports.test.ts packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/task-orchestrator-claims.test.ts packages/agent/test/task-orchestrator-projection.test.ts
```

## Composition And Effect Limits

Acceptance requires the exported
`createResidentBoundedAgentLoopFactory` composition entrypoint to run
end-to-end against the real mounted fixture. Record 29 intentionally installs
no default runtime, route, HTTP, operator-status, scheduler-activation, or
other runtime call site. Real-mounted library executability is not runtime
activation.

No provider, credential, network, unrelated external-system, fallback store,
fallback write, local-write substitute, or pull-request activity is
authorized. Existing human approval and legal gates remain fail-closed. No
provider call, network call, external effect, fallback write, or product
source/test mutation occurred at this checkpoint.

## Fresh Authority-Byte Baseline

The fresh baseline is bound to authority merge
`85b47c8ab2a1770da12a8bdaed589715ad4bcfb1`. Both commands ran serially from
that exact tree with local Vitest `4.1.9`.

- `npm test -- --reporter=json
  --outputFile=/tmp/task136-product-full-85b47c8ab2a1770da12a8bdaed589715ad4bcfb1.vitest.json`
  exited `1`. Its JSON reported `success=false`, 504 files = 484 passed + 20
  failed + 0 skipped, and 3,231 tests = 3,180 passed + 46 failed + 5 skipped
  + 0 deferred.
- `npm run verify` exited `1`. Standalone typecheck passed before its inherited
  test cohort reported 241 test files = 228 passed + 10 failed + 3 skipped,
  and 3,231 tests = 3,178 passed + 48 failed + 5 skipped.
- The full corpus collected and produced the JSON report. A non-fatal missing
  TypeScript source-map warning did not prevent collection or later exact
  differential comparison. These inherited nonzero results are baseline
  evidence, not passing claims.
- Vitest JSON SHA-256:
  `6f097162388cbd9ddfb8f157b4b7e3d6ab3f38f883073dad7031de8f554293e7`
- npm-test log SHA-256:
  `ecb2f6ee60ab9f487ec72963622c3d0cab1ea4db1536b24f969a3ae1a02fdaad`
- verify log SHA-256:
  `5b49e3448519d0aac2ffb5e7f29f1900cc0e4ca08fa84d53e87616ec353873d9`

Task136 remains `implementing`. This authority and claim checkpoint is not a
product candidate, approval, integration, strict record 29, assurance-only
transition, publication, or product release.
