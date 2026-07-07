# Final Review: Ontology Bootstrap Dossier Boundary Fix

Plan: `docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md`
Review: Coordinator feedback on exported dossier-builder identity validation
Branch: `codex/ontology-bootstrap-specialist`
Status: ready-for-review
Claimed-at: 2026-07-07T16:04:34Z
Worker: Codex

## Owned Files

- `packages/ontology-bootstrap/src/dossier-builder.ts`
- `packages/ontology-bootstrap/test/dossier-builder.test.ts`

## Review Fix

- Added direct report/review identity validation at the exported `buildOntologyBootstrapDossier` boundary before phase, candidate batch, question, or next-action derivation.
- The builder now rejects review source collection mismatches and `review.latestReportId` mismatches when present.

## Verification

Red test:

```text
npm test -- packages/ontology-bootstrap/test/dossier-builder.test.ts
Test Files  1 failed (1)
Tests  2 failed | 2 passed (4)
```

Focused pass:

```text
npm test -- packages/ontology-bootstrap/test/dossier-builder.test.ts packages/ontology-bootstrap/test/read-model.test.ts packages/ontology-bootstrap/test/fake-runtime.test.ts packages/ontology-bootstrap/test/tool-previews.test.ts
Test Files  4 passed (4)
Tests  18 passed (18)
```

Full pass:

```text
npm run verify
typecheck passed
Test Files  109 passed (109)
Tests  986 passed (986)
tests passed
factory-readiness passed
```
