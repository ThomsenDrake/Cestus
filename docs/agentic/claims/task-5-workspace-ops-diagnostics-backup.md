# Task 5 Claim: Diagnostics Inspect And Backup Manifest Checks

Plan: `docs/superpowers/plans/2026-07-06-portable-workspace-ops-implementation.md`
Task: Task 5: Diagnostics Inspect And Backup Manifest Checks
Worker: Codex implementing agent for this task
Branch: `codex/portable-workspace-ops-design` in an existing task-scoped worktree
Worktree: `/home/drake/.codex/worktrees/797e/Cestus`
Claimed-at: 2026-07-06T17:17:10Z
Status: ready-for-review

Owned files:
- `packages/workspace-ops/src/diagnostics.ts`
- `packages/workspace-ops/src/backup.ts`
- `packages/workspace-ops/src/index.ts`
- `packages/workspace-ops/test/diagnostics.test.ts`
- `packages/workspace-ops/test/backup.test.ts`
- `docs/agentic/claims/task-5-workspace-ops-diagnostics-backup.md`

Required commands:
- `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts`
- `npm run verify`

Command evidence:
- Red: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 1 because `../src/backup.js` and `../src/diagnostics.js` were missing.
- Green: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 0 with 2 test files and 5 tests passed.
- Verify repair: `npm run verify` first exited 2 during typecheck because diagnostics inspection returned input-side diagnostic arrays instead of normalized `WorkspaceDiagnosticDto` payload arrays, then because `allowedNextCommands` helper output was readonly.
- Final targeted green: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 0 with 2 test files and 5 tests passed.
- Verify: `npm run verify` exited 0 with typecheck passed, 76 test files and 646 tests passed, UI build succeeded, and factory-readiness passed.
- Code-quality review repair red: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 1 with 4 failing regressions proving raw canonical ledger event copies, private body text without token-like strings, invalid `exportedAt`, and unexpected keys could certify unsafe backup manifests as `ready`.
- Code-quality review repair green: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 0 with 2 test files and 9 tests passed.
- Code-quality review repair verify: `npm run verify` exited 0 with typecheck passed, 76 test files and 650 tests passed, UI build succeeded, and factory-readiness passed.
- Spec re-review repair red: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 1 with 7 failing regressions proving malformed manifests still reused unsafe fields, rollover `exportedAt` values certified as `ready`, and accessor-backed allowed fields were invoked.
- Spec re-review repair green: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 0 with 2 test files and 11 tests passed.
- Spec re-review verify repair: `npm run verify` first exited 2 during typecheck because normalized readonly coverage needed conversion to the mutable DTO payload array.
- Spec re-review final targeted green: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 0 with 2 test files and 11 tests passed.
- Spec re-review verify: `npm run verify` exited 0 with typecheck passed, 76 test files and 652 tests passed, UI build succeeded, and factory-readiness passed.
- Diagnostics accessor repair red: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 1 with 4 failing regressions proving accessor-backed durable event `type`, derived `message`, derived `relatedIds`, and derived `repairHint.allowedNextCommands` getters could throw private text before redaction.
- Diagnostics accessor repair green: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 0 with 2 test files and 15 tests passed.
- Diagnostics accessor verify repair: `npm run verify` first exited 2 during typecheck because an unknown derived category needed explicit narrowing before checking the workspace category set.
- Diagnostics accessor final targeted green: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 0 with 2 test files and 15 tests passed.
- Diagnostics accessor verify: `npm run verify` exited 0 with typecheck passed, 76 test files and 656 tests passed, UI build succeeded, and factory-readiness passed.
- Manifest round-trip repair red: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 1 with 1 failing regression proving `checkBackupManifest` degraded a fresh `exportWorkspaceManifest(...).payload` instead of certifying it as ready.
- Manifest round-trip repair green: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 0 with 2 test files and 16 tests passed.
- Manifest round-trip verify: `npm run verify` exited 0 with typecheck passed, 76 test files and 657 tests passed, UI build succeeded, and factory-readiness passed.
- Diagnostics private-text/timestamp repair red: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 1 with 2 failing regressions proving non-token private diagnostic text was echoed and no-millisecond export timestamps were not normalized.
- Diagnostics private-text/timestamp repair green: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 0 with 2 test files and 18 tests passed.
- Diagnostics private-text/timestamp verify: `npm run verify` exited 0 with typecheck passed, 76 test files and 659 tests passed, UI build succeeded, and factory-readiness passed.
- Manifest internals/diagnostic identifier repair red: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 1 with 6 failing regressions proving internally malformed exported manifests could certify as `ready`, durable secret-shaped diagnostic IDs could throw during envelope validation, and private-content diagnostic identifiers or related IDs could leak.
- Manifest internals/diagnostic identifier repair green: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 0 with 2 test files and 22 tests passed.
- Manifest internals/diagnostic identifier verify: `npm run verify` exited 0 with typecheck passed, 76 test files and 663 tests passed, UI build succeeded, and factory-readiness passed.
- Exported manifest artifact-coherence repair red: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 1 with 2 failing regressions proving duplicate or extra artifact summaries could certify as `ready` when section and top-level hashes were recomputed.
- Exported manifest artifact-coherence repair green: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 0 with 2 test files and 24 tests passed.
- Exported manifest artifact-coherence verify repair: `npm run verify` first exited 2 during typecheck because the new test helper used generic string categories instead of workspace-root category DTO types.
- Exported manifest artifact-coherence verify: `npm run verify` exited 0 with typecheck passed, 76 test files and 665 tests passed, UI build succeeded, and factory-readiness passed.
- Export self-checkability repair red: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 1 with 2 failing regressions proving duplicate `categoryBytes` emitted duplicate artifacts and workspace/layout layout-contract mismatches still exported `ready` manifests.
- Export self-checkability repair green: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 0 with 2 test files and 26 tests passed.
- Export self-checkability verify repair: `npm run verify` first exited 2 during typecheck because the runtime-negative layout mismatch fixture needed an explicit cast around the currently literal provisional layout type.
- Export self-checkability verify: `npm run verify` exited 0 with typecheck passed, 76 test files and 667 tests passed, UI build succeeded, and factory-readiness passed.

Self-review:
- Diagnostics inspection validates durable `diagnostic.recorded` events through ontology contracts, marks durable versus derived diagnostics explicitly, and turns invalid or secret-shaped diagnostic content into safe derived diagnostics.
- Backup manifest export returns only DTO-safe summaries and stable hashes; it does not include raw evidence bodies, ledger event payloads, blob paths, or canonical state copies.
- Backup checks report missing, mismatched, stale, incomplete, and secret-shaped backup manifests through `backup` diagnostics and a non-canonical `export-manifest` proposed action only.
- Canonical ledger/blob repairs remain proposed-only elsewhere; this task does not add repair execution, copying, restore flow, CLI, HTTP/UI, mount contract, or Task 6 behavior.
- Code-quality repair adds strict backup-manifest shape validation for allowed fields, safe identifiers, nonnegative ledger marks, known categories, and ISO `exportedAt`; raw-state/canonical-copy fields, private body fields, invalid dates, and unexpected keys now degrade with safe backup diagnostics and do not echo private content.
- Spec re-review repair tightens `exportedAt` to strict ISO instants that round-trip exactly and ensures backup checks only read normalized descriptor-derived manifest data after validation succeeds; accessor-backed manifests now degrade without invoking getters or echoing private text.
- Diagnostics accessor repair normalizes durable diagnostic events and derived diagnostics through descriptor-safe reads before validation or sanitization; accessor-backed inputs now become safe redacted derived error diagnostics without invoking getters or leaking thrown private text.
- Manifest round-trip repair lets backup checks accept the nested `ManifestExportDto` emitted by manifest export via descriptor-safe cloning, DTO schema validation, strict `exportedAt`, coverage coherence, and manifest hash validation while preserving the existing strict flat manifest path.
- Diagnostics private-text/timestamp repair conservatively redacts diagnostic messages that look like private body/interview/source material even without credential-shaped strings, and manifest export now normalizes valid datetimes to canonical ISO milliseconds before hashing and backup checks.
- Manifest internals/diagnostic identifier repair recomputes and compares exported manifest section hashes, requires included sections to match covered categories, requires artifact summaries for covered categories, and routes durable diagnostic IDs plus related IDs through the same credential/private-content identifier filter before DTO validation.
- Exported manifest artifact-coherence repair requires artifact summaries to correspond exactly to exported coverage categories, rejecting duplicate, extra, or missing artifact categories even when section hashes and manifest hashes have been recomputed.
- Export self-checkability repair normalizes duplicate category byte rows into one deterministic artifact summary per covered category and degrades workspace/layout layout-contract mismatches without emitting a manifest payload, so `ready` manifest exports remain accepted by backup checks.
