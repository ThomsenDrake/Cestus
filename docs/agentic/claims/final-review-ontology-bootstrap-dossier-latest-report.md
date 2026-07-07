# Final Review: Ontology Bootstrap Dossier Latest Report Guard

Plan: `docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md`
Review: Coordinator feedback on exported dossier-builder latest report validation
Branch: `codex/ontology-bootstrap-specialist`
Status: ready-for-review
Claimed-at: 2026-07-07T16:40:26Z
Worker: Codex

## Owned Files

- `packages/ontology-bootstrap/src/dossier-builder.ts`
- `packages/ontology-bootstrap/test/dossier-builder.test.ts`

## Review Fix

- Tightened the exported `buildOntologyBootstrapDossier` identity guard so a report-backed dossier requires `review.latestReportId === report.legacyReportId`.
- Missing `latestReportId` is now rejected before phase, candidate batch, question, or next-action derivation, including when `ontologyStagingApproved` is true.

## Verification

Red test:

```text
npm test -- packages/ontology-bootstrap/test/dossier-builder.test.ts
Test Files  1 failed (1)
Tests  1 failed | 4 passed (5)
```

Focused pass:

```text
npm test -- packages/ontology-bootstrap/test/dossier-builder.test.ts packages/ontology-bootstrap/test/read-model.test.ts packages/ontology-bootstrap/test/fake-runtime.test.ts packages/ontology-bootstrap/test/tool-previews.test.ts
Test Files  4 passed (4)
Tests  19 passed (19)
```

Full pass:

```text
npm run verify
typecheck passed
Test Files  109 passed (109)
Tests  987 passed (987)
tests passed
factory-readiness passed
```
