# Durable Mounted Secret Commitment Authority

Status: approved.

## Desired Behavior

Cestus supplies the production mutation authority and durable posture needed by
Specification 16A's closed commitment port for the normal Secret Service backend.
The sole posture authority is a dedicated append-only SQLite CAS journal located
under one fixed child of the current factory-issued mounted workspace `configRoot`.
It is not the ontology ledger, an in-memory map, a caller path, or a fallback file.

Every operation revalidates the exact factory-issued mounted tuple: handle/capture
currentness, workspace ID, root, manifest path, ledger path, config root, and
portable-storage configuration. Replacement, closure, mismatch, non-portable
storage, symlinked authority path, or unavailable journal fails before a backend
call or append. Journal files and parent directories use fixed safe permissions and
ownership, with no alternate write path.

The journal stores exact versioned events for mutation request, reservation,
backend publication proof, activation, disablement, and reference observation. Its
strict schema also supports the durable warning-preview request and first- and
second-confirmation identities that Specification 16D assigns before fallback
activation. Replay strictly validates event shapes, sequence, previous head,
request identity, workspace, backend, key ID/version, expected posture, actor,
expiry, preview binding, and publication proof. Unknown, malformed,
duplicate-conflicting, skipped, reordered, expired, or impossible events make
authority unavailable. Projections are rebuilt only by replay.

Only an authenticated human may create, rotate, or select the Secret Service
backend. The resident may request a safe review preview but cannot confirm or
mutate. Identical request replay returns the already durable result. Stale or
conflicting requests and concurrent different requests fail closed.

Mutation ordering is crash-safe: append one exclusive reservation through a SQLite
transaction before key generation; call the non-exporting Secret Service adapter;
reread authenticated safe key metadata from the backend; then append activation
through CAS. A crash or loser may leave one unreferenced backend version, but it can
never make that version current, overwrite another version, or generate a second
version for identical replay. Recovery recognizes a durable published version and
completes only its matching reserved transition.

The selected backend, key identifier, and current key version come only from
journal replay. A port or authority reconstructed after restart resolves the same
selection. Backend metadata proves retained material and publication only; it can
never select current authority. Older referenced Secret Service versions remain
available for verification; rotation never rewrites records or deletes keys.

This slice does not implement or activate encrypted fallback, accept a passphrase,
add runtime HTTP decisions, or read source content. Secret Service unavailability
leaves protected commitment operations unavailable. Specification 16C adds the
encrypted backend and 16D composes both backends into the runtime.

## Observable Acceptance Examples

- A mounted fixture and fake Secret Service allow an authenticated human to create
  version one. Journal replay after process reconstruction selects the same version
  and the 16A port computes and verifies a commitment.
- Safe backend metadata without a matching journal activation never selects a
  current key. Strict replay reconstructs every supported warning-preview and
  confirmation identity without granting fallback activation on its own.
- Resident/system mutation, mismatched actor identity, foreign workspace, changed
  mounted tuple, stale head, and concurrent different create or rotate requests fail
  before the fake Secret Service generates material.
- Identical create/rotate replay returns the existing durable result without a
  second event or backend version.
- A crash before reservation creates no backend material. A crash after reservation
  but before backend publication preserves the prior current version. A crash after
  backend publication but before activation recovers the exact reserved version after
  authenticated reread.
- Malformed, unknown, extra-field, reordered, chain-breaking, duplicate-conflicting,
  or foreign-workspace journal rows fail closed and produce no mutation authority.
- Closing or replacing the mounted runtime invalidates the authority and closes its
  SQLite journal; subsequent reads and mutations fail.
- Rotation retains the old version for verification and makes only the new version
  current. Missing old Secret Service material remains explicitly `unverifiable`.
- Secret Service unavailable or publication reread mismatch leaves posture
  unavailable with no fallback selection.
- Ordinary events, diagnostics, previews, exceptions, and serialized authority
  state contain safe IDs and metadata only, never key material.

## Allowed Scope

- `packages/local-runtime/src/secret-commitment-posture-journal.ts` for the fixed
  mounted SQLite append-only CAS journal and strict replay.
- `packages/local-runtime/src/secret-commitment-authority.ts` for human previews,
  reservations, publication recovery, activation, rotation, selection, and safe
  read models.
- `packages/local-runtime/src/runtime-factory.ts` only to issue/revalidate the exact
  mounted commitment-authority capture and close registered journal resources.
- `packages/local-runtime/test/secret-commitment-posture-journal.test.ts`,
  `packages/local-runtime/test/secret-commitment-authority.test.ts`, and focused
  runtime-factory tests.
- `packages/agent/src/secret-commitment-port.ts` and its tests only for the minimum
  16A authority/backend metadata integration discovered during implementation.
- Do not modify ontology event schemas, encrypted fallback storage, ingestion routes,
  source scanning, evidence, UI, providers, PRR, legal, export, or destructive code.
- Do not inspect or reuse either preserved failed Specification 16 candidate.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/16-secret-commitment-backend.md`
- `docs/agentic/specifications/16a-secret-commitment-protocol.md`
- `packages/local-runtime/src/runtime-factory.ts`
- `packages/ontology/src/event-ledger.ts` only to confirm why the posture journal is
  separate; do not change it.
- `packages/agent/src/secret-commitment-port.ts`

## Risk Lane

Red. The slice controls durable human authority for cryptographic keys. Verification
uses only fake Secret Service material; any live key creation or rotation remains
separately human-gated.

## Targeted Verification

- `npm test -- packages/local-runtime/test/secret-commitment-posture-journal.test.ts packages/local-runtime/test/secret-commitment-authority.test.ts`
- `npm test -- packages/agent/test/secret-commitment-port.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves mounted-only durable replay/CAS,
human authority, idempotency, concurrency, crash recovery, Secret Service preference,
retained versions, closure/replacement rejection, and key-free surfaces.

## Integration Verification

Update normally against latest `neo`, obtain a fresh Sol `ship` verdict on the
final diff, then run `npm run verify` once. Compare with the current recorded
baseline and latest `neo` CI; reject any new or worsened failure. Integrate with
normal Git history, push only configured `origin`, observe CI, do not open a pull
request, and do not force-push.

## Escalation Conditions

Escalate for use of the ontology ledger, caller-controlled or fallback posture
storage, in-memory current authority, backend mutation before a durable reservation,
automatic/non-human authority, key deletion, inability to obtain crash-safe SQLite
transactions within the allowed scope, real key use, or the same concrete failure
surviving two focused repairs.
