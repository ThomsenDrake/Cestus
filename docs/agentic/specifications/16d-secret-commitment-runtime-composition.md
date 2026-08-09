# Secret Commitment Runtime Composition And Protected Operation Gates

Status: approved.

## Desired Behavior

Cestus composes Specifications 16A through 16C into the mounted local runtime and
completes every remaining umbrella Specification 16 behavior. Secret Service is the
normal selected backend. When it is unavailable, protected commitment operations
fail closed until an authenticated human activates the encrypted fallback through
two confirmations of one exact current warning preview.

The protected authenticated-human warning preview names the safe workspace ID,
device ID, exact canonical fallback storage path derived from the current mounted
`configRoot`, missing Secret Service backend, current posture identity/head, and
reduced-security risk. The exact path appears only at this protected human boundary;
ordinary DTOs, logs, events, errors, and diagnostics remain path-safe. The resident
may request this review preview but cannot confirm or mutate. The journal durably
assigns an exact preview-request identity, first-confirmation identity, and
second-confirmation identity, binding each to the actor, workspace, device,
canonical path, missing backend, preview hash, posture head, and expiry. Both
confirmations require the same authenticated human and exact preview. The second
expires after 15 minutes and fails after workspace replacement, posture change,
backend recovery/change, changed warning, replay, or concurrency. Strict journal
replay reconstructs these identities and never treats either confirmation alone as
activation authority.

Fallback activation consumes the matching durable two-confirmation chain, then uses
a journal reservation before key generation, invokes the 16C private passphrase
callback and encrypted backend, atomically publishes and authenticates the exact key
file, and only then appends activation bound to those preview and confirmation
identities. A crash or conflicting loser cannot make an unverified or foreign file
current. Identical replay returns the existing result; conflicting replay fails.

The runtime factory derives all authority paths from its factory-issued mounted
workspace capture and wires the selected backend, posture authority, compute/verify
service, private unlock session, and persistent warning. The handle closes the
private session and journal and clears secret buffers before closing the ledger.
Replacement or closure makes all former commitment services unavailable.

Only an authenticated human may create, rotate, select, activate, or disable a
backend. Safe local-runtime handlers expose review and mutation decisions without
accepting a storage path, key, passphrase, generic crypto input, or resident-supplied
actor identity. Passphrase entry is available only through the private runtime-start
human-input callback; it never travels through HTTP, CLI arguments, environment,
events, diagnostics, logs, or public DTOs.

At every runtime start, an active or referenced fallback version remains locked
until fresh private human passphrase input authenticates its encrypted material.
Neither journal replay nor a previous session unlock carries passphrase authority
across restart. Missing, cancelled, or wrong input leaves compute and verification
for that fallback version unavailable and fails closed; it never selects Secret
Service, a digest, or another key as a substitute. Secret buffers are cleared after
failed input and on shutdown.

Compute and verify are injected into ingestion as a narrow service. Runtime
composition injects the fresh 32-byte nonce source required by Specification
16A-R2a-R2.3; the ingestion service acquires exactly one nonce for each compute attempt,
and compute-operation callers cannot supply or override it. Source observation
returns only the exact public record. The service opens no source file and admits no
evidence. Consume-time calls reread mounted currentness, posture head, selected
backend/version, activation proof, and referenced-key availability before HMAC.

Rotation retains old backend-specific versions. Verification routes only to the
backend and version named by the durable record; it never substitutes another
backend or current key. Disabling fallback prevents new fallback commitments but
does not delete referenced encrypted versions and leaves the reduced-security
warning visible while any fallback-backed record remains referenced.

All ordinary previews, responses, logs, diagnostics, events, and errors remain
secret/path safe. Append-only product history, evidence provenance, provider gates,
ontology truth, PRR/legal gates, and no-fallback-write behavior remain unchanged.

## Observable Acceptance Examples

- With fake available Secret Service, an authenticated human creates version one
  through the composed service; compute/verify work after runtime reconstruction and
  no product surface returns key bytes.
- With Secret Service unavailable, compute/create fails before fallback activation.
  A resident confirmation, expired second confirmation, changed preview/head,
  foreign workspace, recovered backend, concurrent activation, or different human
  fails without selecting fallback.
- Two exact human confirmations plus fake private passphrase input publish/reread one
  encrypted version and make it current. Identical retry is idempotent.
- Journal replay reconstructs the exact preview, first-confirmation,
  second-confirmation, reservation, publication, and activation bindings. An
  expired, reordered, actor-changed, preview-changed, or confirmation-free chain
  cannot activate fallback.
- Crash seams before reservation, after reservation, before rename, after rename,
  after authenticated reread, and before final activation always recover either the
  prior current authority or one complete matching new authority.
- Runtime shutdown and mounted replacement close the journal/backend, zero private
  buffers, and reject former services. Captured arguments, environment, logs,
  events, diagnostics, errors, responses, and serialized handles contain no key or
  passphrase.
- Rotation under Secret Service or fallback makes one new version current while old
  records verify. Missing old material returns `unverifiable`.
- After runtime reconstruction, every active or referenced fallback version is
  locked until fresh private passphrase input succeeds. Missing, cancelled, or wrong
  input prevents both compute and verify and exposes no secret through captured
  surfaces.
- Disabling fallback preserves referenced encrypted files, prevents new fallback
  commitments, and keeps the reduced-security warning on the protected-operation
  preview while any fallback version remains active or referenced.
- Route and service calls reject caller-controlled path, passphrase, key, backend
  internals, actor spoofing, generic HMAC/digest, unsupported profiles, and raw
  protected SHA-256.
- The composed observation service injects the nonce source, uses exact 16A
  frames/records, rejects any caller nonce input, and produces different nonces for
  same-byte observations; changing any binding invalidates verification.
- Standard verification never opens the attached SSD, reads a source file, looks up
  a real credential/secret, downloads a model, invokes a provider, transfers bytes,
  starts a listening server, or performs any PRR/legal/export/destructive action.

## Allowed Scope

- `packages/local-runtime/src/secret-commitment-runtime.ts` for composition,
  consume-time gates, activation recovery, warning projection, and private lifecycle.
- `packages/local-runtime/src/runtime-factory.ts` for handle construction/closure and
  factory-issued commitment capture.
- `packages/local-runtime/src/ingestion-http-routes.ts` only for authenticated safe
  review/decision handlers; no second auth or approval system.
- Corresponding focused local-runtime tests, including route and factory tests.
- `packages/ingestion/src/runtime.ts` and
  `packages/ingestion/src/secret-source-commitment.ts` only for the narrow injected
  compute/verify service; corresponding focused tests.
- 16A–16C commitment modules/tests only for concrete integration corrections.
- Do not modify source traversal/redaction, evidence admission, scheduler behavior,
  ontology truth, UI, provider/OCR, PRR, legal, export, publication, or destructive
  operations.
- Do not inspect or reuse either preserved failed Specification 16 candidate.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/16-secret-commitment-backend.md`
- `docs/agentic/specifications/16a-secret-commitment-protocol.md`
- `docs/agentic/specifications/16b-secret-commitment-authority.md`
- `docs/agentic/specifications/16c-encrypted-secret-commitment-fallback.md`
- `packages/local-runtime/src/runtime-factory.ts`
- `packages/local-runtime/src/ingestion-http-routes.ts`
- `packages/ingestion/src/runtime.ts`

## Risk Lane

Red. This slice composes human authority and secret backends. Tests use only fakes;
real key creation, fallback activation, passphrase entry, source access, provider use,
or external effects remain separately human-gated.

## Targeted Verification

- `npm test -- packages/local-runtime/test/secret-commitment-runtime.test.ts packages/local-runtime/test/secret-commitment-runtime-recovery.test.ts`
- `npm test -- packages/local-runtime/test/secret-commitment-http-routes.test.ts packages/local-runtime/test/runtime-factory.test.ts`
- `npm test -- packages/agent/test/secret-commitment-port.test.ts packages/ingestion/test/secret-source-commitment.test.ts`
- `npm test -- packages/local-runtime/test/secret-commitment-posture-journal.test.ts packages/local-runtime/test/secret-commitment-authority.test.ts packages/local-runtime/test/secret-commitment-fallback.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves default Secret Service behavior,
human authority, double confirmation, crash/replay recovery, mounted composition,
private unlock/zeroization, consume-time gates, retained versions, persistent
warnings for active and referenced fallback versions, restart passphrase enforcement,
durable confirmation provenance, exact protocol behavior, and zero live effects.

## Integration Verification

Update normally against latest `neo`, obtain a fresh Sol `ship` verdict on the
final diff, then run `npm run verify` once. Compare with the current recorded
baseline and latest `neo` CI; reject any new or worsened failure. Integrate with
normal Git history, push only configured `origin`, observe CI, do not open a pull
request, and do not force-push. Specifications 17 through 28 become unblocked only
after this integration and CI comparison.

## Escalation Conditions

Escalate for automatic or resident fallback activation, fewer confirmations,
passphrase/key/path transport through public inputs, changed crypto/protocol posture,
non-mounted or fallback authority, deletion of referenced keys, source/provider/live
effects, inability to implement crash-safe composition within the allowed files, or
the same concrete failure surviving two focused repairs.
