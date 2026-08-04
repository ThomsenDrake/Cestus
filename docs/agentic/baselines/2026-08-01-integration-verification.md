# Integration Verification Baseline — 2026-08-01

Status: non-authoritative baseline debt record.

This record preserves the final cleanup candidate's comparison to latest `neo`.
It is not factory authority and does not waive a new or worsened failure.

## Provenance

- Latest `neo` base: `960504052c9a28aa35345fe906d7ad47f6901c19`.
- Verify CI: [run 30892734349](https://github.com/ThomsenDrake/Cestus/actions/runs/30892734349).
- Cleanup content commit: `ca9e6930b5f16904534f24b09a1a73847b6053e9`.
- Focused fixture-repair commit: `db2cda626c88f7e082c9b43897a9b8ed0209e7a2`.

## Latest `neo` CI

Typecheck passed. Vitest reported 6 failed, 240 passed, 3 skipped files (249),
and 14 failed, 3,648 passed, 5 skipped tests (3,667):

- `packages/agent/test/evidence-triage-workflow.test.ts`
- `packages/agent/test/runtime.test.ts`
- `packages/local-runtime/test/agent-http-routes.test.ts`
- `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`
- `packages/local-runtime/test/server.test.ts`
- `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts`

## One Broad Candidate Run

`npm run verify` ran once at `ca9e6930…`: typecheck passed, then Vitest stopped
with 7 failed, 238 passed, 3 skipped files (248), and 15 failed, 3,629 passed,
5 skipped tests (3,649). It included exactly the six CI failure files above
plus the cleanup-caused fixture failure
`packages/ui/test/request-data-boundary.test.ts`.

That fixture was repaired at `db2cda62…`. The targeted
`npx vitest run packages/ui/test/request-data-boundary.test.ts` then passed one
file and all seven tests; `npm run factory:check` and skill validation passed
afterward. No second broad run occurred. UI build and final readiness were not
reached in the broad chain because known Vitest failures stop `npm run verify`;
focused readiness validation passed separately.

## Final Candidate Comparison

After the targeted repair, arithmetic against that one broad run establishes
the final candidate baseline as 6 failed, 239 passed, 3 skipped files (248),
and 14 failed, 3,630 passed, 5 skipped tests (3,649). Relative to latest `neo`
CI, the only count delta is removal of the expressly retired passing file
`packages/local-runtime/test/check-resident-task-prerequisites.test.ts`, which
contained 18 passing tests. No product failure was added or worsened.
