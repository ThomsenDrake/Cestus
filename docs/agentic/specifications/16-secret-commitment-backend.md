# Secret Commitment Backend And Security Posture

Status: approved.

## Desired Behavior

Cestus provides a workspace-scoped keyed-commitment service for protected
source observations without exposing commitment keys through the product API.
The service opens no source file, installs no model, redacts nothing, and
admits no evidence. Later specifications use it to bind a transient source
observation to an exact import decision without creating a stable secret hash
or offline guessing oracle.

The normal backend is the operating system Secret Service. The product-facing
port exposes only `createKey`, `rotateKey`, `computeCommitment`, and
`verifyCommitment`; callers never receive key bytes. Backend adapters may hold
key material only for the bounded operation needed to satisfy that port.

If Secret Service is unavailable, Cestus fails closed by default. A human may
activate a reduced-security file-backed backend only after two authenticated
confirmations of the same warning preview. The warning names the workspace,
device, storage path, missing primary backend, and risk of storing encrypted
key material on the same device. The second confirmation expires after 15
minutes, cannot be supplied by the resident, and cannot be replayed against a
changed preview or current posture.

The fallback creates a random 256-bit commitment key and encrypts it with
AES-256-GCM under a wrapping key derived from a human passphrase by Argon2id.
The version-one KDF uses a random 256-bit salt, 64 MiB memory, three iterations,
parallelism one, and a 32-byte output. The passphrase is required at every
runtime start, is never persisted, and never appears in arguments, environment,
logs, diagnostics, events, or crash output. Decrypted key material exists only
inside the bounded commitment adapter process or its private session keyring
and is cleared on shutdown.

The fallback directory is mode `0700`; its atomically published encrypted key
files are mode `0600`. Each file authenticates its format version, workspace,
key identifier, key version, KDF parameters, salt, nonce, ciphertext, and
security-posture identity as AEAD associated data. Partial writes, symlinks,
unexpected owners, hard links, permissive modes, malformed parameters, or
authentication failure leave the backend unavailable. There is no plaintext,
alternate-path, or no-encryption fallback.

Commitments use HMAC-SHA-256 over a canonical, length-delimited domain that
includes the commitment-contract version, workspace identity, source
collection identity, source-boundary revision, immutable manifest entry
identity, a fresh 256-bit observation nonce, and the exact observed bytes.
Public records contain the contract version, key identifier/version, nonce,
and HMAC output. Two observations of the same bytes are intentionally
non-comparable. Verification uses constant-time comparison.

Rotation creates a new current key version and retains older referenced keys
for verification. It never rewrites existing records or automatically deletes
old keys. A lost key makes its observations explicitly `unverifiable`; it does
not permit a guess, substitute key, or fallback digest. Re-observation under
current authority is required.

One append-only security-posture contract records the selected backend,
workspace binding, current key version, fallback warning/confirmation
identities, and activation state. Only an authenticated human may activate,
disable, rotate, or select the fallback. The resident may request review but
cannot approve or mutate posture. Identical request replay is idempotent;
stale or conflicting posture changes fail closed. Disabling the fallback
never deletes a key referenced by a durable observation and leaves a persistent
reduced-security warning on every protected-import preview while any fallback
key remains active or referenced.

This specification requires no TPM, secure enclave, or separate hardware.
Append-only product history, consume-time approval validation, evidence
provenance, provider gates, ontology truth gates, and no-fallback-write behavior
remain unchanged.

## Observable Acceptance Examples

- With a fake available Secret Service, an authenticated human creates a
  workspace key and a caller can compute and verify a commitment without any
  product API returning key bytes.
- The same bytes observed twice produce different public nonce/commitment
  pairs. Changing workspace, source collection, boundary revision, manifest
  entry, nonce, or bytes invalidates verification.
- Rotation makes the new version current while old observations continue to
  verify with retained old versions. Missing old material produces
  `unverifiable`, never a replacement commitment.
- An unavailable Secret Service permits no protected observation until the
  fallback is activated through two matching human confirmations. A resident
  confirmation, expired second confirmation, changed warning, stale posture,
  concurrent activation, or replay against another workspace fails.
- The fallback ciphertext cannot be opened with a wrong passphrase, modified
  associated data, permissive file mode, symlink, hard link, changed owner, or
  truncated write. No plaintext key or passphrase reaches a fake log, event,
  exception, environment snapshot, or process argument capture.
- A crash before atomic publication leaves the previous posture/key current; a
  crash after publication yields one complete authenticated key version.
- Constant-time verification is exercised through an injected comparison seam
  without treating timing measurements as a cryptographic proof.
- Disabling fallback use preserves every referenced encrypted key and keeps
  the reduced-security warning visible until no fallback-backed observation is
  active or referenced.
- Standard verification uses synthetic bytes and fake secret backends. It does
  not inspect a credential, open the attached SSD, download a model, invoke a
  provider, or start a listening runtime.

## Allowed Scope

- `packages/agent/src/os-secret-store.ts` and focused adjacent secret-store
  ports for the non-exporting commitment operations and Secret Service adapter.
- `packages/agent/test/os-secret-store.test.ts` and new focused commitment-port
  tests.
- `packages/ingestion/src/**` only for the canonical commitment domain,
  versioned public record, and injected commitment port; no source traversal or
  redaction behavior.
- `packages/ingestion/test/**` only for domain separation,
  non-correlation, rotation, loss, and constant-time-comparison seams.
- `packages/local-runtime/src/**` only for authenticated security-posture
  previews/decisions, fallback encrypted storage, runtime unlock, private
  adapter lifecycle, and persistent warnings.
- `packages/local-runtime/test/**` for actor authority, double confirmation,
  expiry, replay, concurrency, Argon2id/AEAD fixtures, permissions, atomicity,
  unlock cleanup, and secret-safe surfaces.
- `package.json` and `package-lock.json` only for a bounded Argon2id dependency
  or focused test wiring.
- Do not modify source scanning, model installation/inference, redaction,
  evidence admission, scheduler behavior, provider/OCR behavior, ontology
  truth, UI, PRR, legal, export, publication, or destructive operations.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/15-resident-source-boundary.md`
- `packages/agent/src/os-secret-store.ts`
- `packages/agent/src/tool-gateway.ts`
- `packages/ingestion/src/runtime.ts`
- `packages/local-runtime/src/runtime-factory.ts`
- `packages/local-runtime/src/ingestion-http-routes.ts`

## Risk Lane

Red. This slice creates and stores cryptographic key material. Human activation,
rotation, fallback selection, double confirmation, and runtime passphrase entry
remain red actions; build verification uses only fake backends and synthetic
material.

## Targeted Verification

- `npm test -- packages/agent/test/os-secret-store.test.ts packages/agent/test/secret-commitment-port.test.ts`
- `npm test -- packages/ingestion/test/secret-source-commitment.test.ts`
- `npm test -- packages/local-runtime/test/secret-commitment-posture.test.ts packages/local-runtime/test/secret-commitment-fallback.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves non-exporting product
operations, domain-separated non-correlatable commitments, retained-version
rotation, explicit loss behavior, Secret Service preference, double-confirmed
encrypted fallback, atomic persistence, persistent warnings, and zero source,
model, credential, provider, or live-runtime effects.

## Integration Verification

Update the candidate normally against latest `neo`, obtain a fresh Sol `ship`
verdict on the final diff, then run `npm run verify` once on the final merged
candidate. Compare with the current recorded baseline and latest `neo` CI;
reject any new or worsened failure. Integrate with normal Git history, push only
configured `origin`, observe CI, do not open a pull request, and do not
force-push. Real key creation, fallback activation, and passphrase use remain
separate human-gated actions.

## Escalation Conditions

Escalate for a product API that exports key bytes, a different cryptographic
construction or KDF posture, automatic fallback activation, removal of either
confirmation, stored passphrases, plaintext or fallback key writes, automatic
key deletion, a hardware requirement, real key/passphrase use during build,
unavailable required OS/cryptographic support, or the same concrete failure
surviving two focused repair attempts.
