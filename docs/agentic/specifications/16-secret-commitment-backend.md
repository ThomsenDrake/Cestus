# Secret Commitment Backend And Security Posture

Status: approved umbrella contract; implementation execution is superseded by
Specifications 16A-R2a-R1, 16A-R2b, and 16B through 16D.

## Approved Implementation Decomposition

This document remains the complete product and safety contract for secret
commitments. Direct implementation as one factory slice is superseded by five
approved executable specifications, processed in this exact order:

1. Specification 16A-R2a-R1 — pure commitment protocol and ingestion domain service;
2. Specification 16A-R2b — authority-owned mutation and Secret Service boundary;
3. Specification 16B — durable mounted key and posture authority;
4. Specification 16C — encrypted fallback storage and private session backend;
5. Specification 16D — runtime composition and protected-operation gates.

The decomposition changes only delivery shape. It does not weaken, defer beyond
16D, or reinterpret any requirement below. Specifications 17 through 28 remain
blocked until 16D is integrated and its CI comparison is accepted. Preserved
failed Specification 16 and 16A candidates are history only and are not
implementation input for 16A-R2a-R1 through 16D.

## Desired Behavior

Cestus provides a workspace-scoped keyed-commitment service for protected
source observations without exposing commitment keys through the product API.
The service opens no source file, installs no model, redacts nothing, and
admits no evidence. Later specifications use it to bind a transient source
observation to an exact import decision without creating a stable secret hash
or offline guessing oracle.

The normal backend is the operating system Secret Service. The product-facing
port exposes only `createKey`, `rotateKey`, `computeCommitment(profile, frame)`,
and `verifyCommitment(profile, frame, publicRecord)`; callers never receive key
bytes. `profile` is closed to exactly `cestus.source-observation.v1` and
`source-manifest-authority.v1`; there is no generic HMAC, digest, export, or
caller-defined-domain operation. Backend adapters may hold key material only
for the bounded operation needed to satisfy that port.

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

The passphrase is the exact UTF-8 encoding of the human-entered Unicode scalar
sequence; Cestus performs no Unicode normalization, trimming, case conversion,
or implicit trailing-newline removal. Invalid Unicode input is rejected. Each
encryption uses a fresh cryptographically random 96-bit GCM nonce under the
newly derived wrapping key and a 128-bit authentication tag. Nonce reuse for
the same wrapping-key identity is rejected before encryption.

The fallback directory is mode `0700`; its atomically published encrypted key
files are mode `0600`. AES-GCM authenticates ciphertext through the ordinary
AEAD construction; its associated data separately authenticates the format
version, workspace, key identifier/version, KDF parameters, salt, nonce,
ciphertext/tag algorithms and declared lengths, and security-posture identity.
Partial writes, symlinks,
unexpected owners, hard links, permissive modes, malformed parameters, or
authentication failure leave the backend unavailable. There is no plaintext,
alternate-path, or no-encryption fallback.

The version-one file is an RFC 8785 JSON Canonicalization Scheme (JCS) object,
encoded as UTF-8 with no BOM and exactly one trailing LF. Before that LF its
exact members are `formatVersion`, `workspaceId`, `keyId`, `keyVersion`, `kdf`,
`salt`, `nonce`, `ciphertext`, `tag`, and `securityPostureId`. `formatVersion`
is `1`; `kdf` is exactly `{"algorithm":"argon2id","version":19,
"memoryKiB":65536,"iterations":3,"parallelism":1,"outputBytes":32}`.
Extra/duplicate members, non-JCS escaping or number/string encoding, and a
different LF policy are rejected. Binary values are lowercase hexadecimal
with exact decoded lengths: salt 32 bytes, nonce 12, ciphertext 32, and tag 16.

Associated data is the RFC 8785 encoding, with no trailing LF, of exactly
`formatVersion`, `workspaceId`, `keyId`, `keyVersion`, `kdf`, `salt`, `nonce`,
`securityPostureId`, `cipherAlgorithm:"aes-256-gcm"`,
`ciphertextBytes:32`, and `tagBytes:16`. The `ciphertext` and `tag` values are
not associated-data members; GCM authenticates them through its ciphertext and
tag inputs. RFC 8785 supplies member ordering, JSON escaping, Unicode, and
integer serialization, so no private length-prefix convention is left to an
adapter. Malformed encodings, incorrect lengths, truncated tags, and a
duplicate nonce under the same key-file identity fail before decryption.

Commitments use HMAC-SHA-256 over an exact binary frame. It begins with ASCII
`cestus.source-observation.v1` plus one NUL byte. Each following field is one
unsigned-byte tag, one unsigned 64-bit big-endian byte length, then that many
bytes: tag 1 workspace ID UTF-8, 2 source-collection ID UTF-8, 3 boundary
revision UTF-8, 4 immutable manifest-entry ID UTF-8, 5 the raw 32-byte fresh
observation nonce, and 6 the exact observed bytes. IDs are their authoritative
stored Unicode scalar sequences encoded as UTF-8 with no normalization. Tags
must appear exactly once in ascending order; missing/extra tags, non-minimal or
overflowing lengths, invalid ID UTF-8, and trailing bytes are rejected.
For `source-manifest-authority.v1`, the frame begins with ASCII
`source-manifest-authority.v1` plus one NUL byte. Each following field has the
same unsigned-byte-tag/unsigned-64-bit-big-endian-length/value encoding. Tags
1 through 6 appear once in ascending order: 1 record class as ASCII
`manifest` or `entry`, 2 workspace ID UTF-8, 3 source-collection ID UTF-8, 4
source-boundary revision UTF-8, 5 the raw 32-byte canonical classification-
policy SHA-256, and 6 the raw 32-byte public manifest ID. A `manifest` frame
then has exactly tag 8, the exact protected canonical manifest bytes. An
`entry` frame then has exactly tag 7, the raw 32-byte public entry ID, followed
by tag 8, the exact protected canonical entry bytes. Tags must be ordered;
record classes, public-ID lengths, policy-hash length, UTF-8, and trailing
bytes are validated before HMAC. Specification 19 alone supplies those
protected canonical bytes and public IDs. A caller can compute or verify only
one of these two closed profiles and only with its complete exact frame; it
cannot substitute a raw protected SHA-256 or ask the port to reveal key bytes.

Public records contain the profile, contract version, key identifier/version,
and profile-permitted public binding values plus HMAC output: the
source-observation profile additionally contains its nonce; the
source-manifest-authority profile contains its record class and public
manifest/entry ID as applicable. Two observations of the same bytes are
intentionally non-comparable. Verification uses constant-time comparison.

Rotation creates a new current key version and retains older referenced keys
for verification. It never rewrites existing records or automatically deletes
old keys. A lost key makes its observations explicitly `unverifiable`; it does
not permit a guess, substitute key, or fallback digest. Re-observation under
current authority is required.

One append-only security-posture contract records the selected backend,
workspace binding, current key version, fallback warning/confirmation
identities, and activation state. Only an authenticated human may create,
activate, disable, rotate, or select a key/backend, including the fallback. The resident may request review but
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
- Cross-implementation fixtures use the exact tagged big-endian HMAC frame and
  RFC 8785 fallback-file/associated-data bytes; altered tags, field order,
  lengths, escaping, KDF members, or trailing-LF policy fail closed.
- Fixtures prove that the non-exporting port accepts both and only the closed
  `cestus.source-observation.v1` and `source-manifest-authority.v1` profiles.
  Manifest and entry frames with a swapped class, policy hash, public ID, or
  protected canonical bytes fail verification without exposing a key or a raw
  protected SHA-256.
- Rotation makes the new version current while old observations continue to
  verify with retained old versions. Missing old material produces
  `unverifiable`, never a replacement commitment.
- An unavailable Secret Service permits no protected observation until the
  fallback is activated through two matching human confirmations. A resident
  confirmation, expired second confirmation, changed warning, stale posture,
  concurrent activation, or replay against another workspace fails.
- The fallback ciphertext cannot be opened with a wrong passphrase, modified
  associated data, permissive file mode, symlink, hard link, changed owner, or
  truncated write/tag. Invalid UTF-8 passphrases, normalization differences,
  malformed canonical fields/lengths, and forced nonce reuse fail closed. No
  plaintext key or passphrase reaches a fake log, event,
  exception, environment snapshot, or process argument capture.
- A crash before atomic publication leaves the previous posture/key current; a
  crash after publication yields one complete authenticated key version.
- Constant-time verification is exercised through an injected comparison seam
  without treating timing measurements as a cryptographic proof.
- Disabling fallback use preserves every referenced encrypted key and keeps
  the reduced-security warning visible until no fallback-backed observation is
  active or referenced.
- Resident/system key creation, stale or concurrent create, and conflicting
  replay fail before key generation or posture mutation.
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
