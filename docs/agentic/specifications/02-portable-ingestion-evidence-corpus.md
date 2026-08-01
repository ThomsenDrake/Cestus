# Portable Ingestion Evidence Corpus

Status: approved.

## Desired Behavior

Cestus can build a reviewable evidence corpus from a read-only local source
without trusting its folder structure as ontology truth. A user can mount or
create a portable workspace, register a source, run a hash-computing dry run,
approve raw import, import unique bytes into content-addressed storage, preserve
every occurrence, and observe local parse jobs and secret-safe diagnostics.
The product capability is verified with temporary fixtures; this slice does
not touch a user's real drive.

## Observable Acceptance Examples

- A fixture tree with duplicate bytes at two paths reports two occurrences,
  one unique content hash, and one projected evidence item after approval.
- Dry run copies no source bytes and appends no evidence item.
- Import is blocked until an explicit human raw-import approval exists.
- Repeating an approved import does not duplicate blobs, evidence, or the same
  batch/path/hash occurrence.
- If a path changes bytes on refresh, both old and new provenance remain.
- Safe archive children are imported with container provenance; traversal,
  absolute paths, expansion-limit breaches, and unsafe nesting are rejected.
- Local parsing begins after import; provider parsing remains blocked until an
  exact batch approval and never runs during standard verification.
- Source files remain byte-for-byte unchanged throughout the fixture run.

## Allowed Scope

- `packages/ingestion/src/**` and `packages/ingestion/test/**`.
- `packages/workspace/src/**` and focused workspace tests only for portable
  mount/layout behavior required by this vertical.
- `packages/local-runtime/src/ingestion-*`, the narrow ingestion HTTP wiring,
  and focused local-runtime tests.
- `packages/ui/src/ingestion/**` and focused ingestion UI tests.
- Do not access a real source drive, provider, credential, or external service.

## Relevant Context Entry Points

- `AGENTS.md`
- `packages/ingestion/src/runtime.ts`
- `packages/ingestion/src/source-registry.ts`
- `packages/ingestion/src/local-filesystem.ts`
- `packages/ingestion/src/archive-adapter.ts`
- `packages/ingestion/src/projection.ts`
- `packages/local-runtime/src/ingestion-runtime-factory.ts`
- `packages/ui/src/ingestion/IngestionWorkspace.tsx`

## Risk Lane

Yellow. The code path is local and reversible and verification uses disposable
fixtures; selecting or importing a real user source remains human-controlled.

## Targeted Verification

- `npm test -- packages/ingestion/test/runtime.test.ts packages/ingestion/test/runtime-import-stale-source.test.ts packages/ingestion/test/archive-adapter.test.ts packages/ingestion/test/projection.test.ts`
- `npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts packages/ui/test/ingestion-app-integration.test.tsx`
- `npm run typecheck`

Success means the named suites prove read-only source handling, approval,
deduplication, replay, and no provider use.

## Integration Verification

Run `npm run verify` against the latest `neo` and introduce no failure relative
to `docs/agentic/baselines/2026-08-01-integration-verification.md`.

## Escalation Conditions

Escalate before using a real source drive, transferring bytes externally,
using credentials, changing portable-workspace identity or no-fallback-write
semantics, performing destructive cleanup or migration, adding an unavailable
dependency, or after two failed focused repairs for the same cause.
