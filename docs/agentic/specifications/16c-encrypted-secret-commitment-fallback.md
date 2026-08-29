# Encrypted Secret Commitment Fallback And Private Session Backend

> **Development authority:** This is a non-authoritative product-requirement
> source. Historical status, execution, role, risk, repair, review, integration,
> and verification text below does not govern current work. Follow \`AGENTS.md\`,
> Compound Engineering, and \`SECURITY.md\`.

Status: approved.

## Desired Behavior

Cestus implements the reduced-security encrypted-file backend without selecting or
activating it in production. The backend is rooted only at a fixed child of the
current factory-issued mounted workspace `configRoot`; callers supply no directory,
filename, or alternate path. Every operation revalidates the exact mounted tuple and
the current 16B posture journal.

The fallback adapter never returns decrypted key bytes. It creates, encrypts,
authenticates, opens, and uses a 256-bit key only inside bounded create/HMAC
operations compatible with the 16A backend interface. Decrypted key, derived wrapping
key, passphrase bytes, and private session state are non-enumerable/non-serializable
and cleared on success, failure, replacement, and explicit close. A closed adapter
cannot be reused.

Each version-one file implements the exact Specification 16 RFC 8785 JCS object,
UTF-8/no-BOM/exact-one-LF encoding, exact members, lowercase hex lengths, and exact
associated data. Encryption uses AES-256-GCM, a fresh random 32-byte Argon2id salt,
fresh random 12-byte nonce, 16-byte tag, and Argon2id version 19 with 65536 KiB,
three iterations, parallelism one, and 32-byte output.

The passphrase is read only through an injected private human-entry callback at
unlock/create time. It is the exact UTF-8 encoding of the entered Unicode scalar
sequence; no normalization, trimming, case conversion, or newline removal occurs.
Invalid scalar input rejects. The callback and tests never use process arguments,
environment variables, logs, events, diagnostics, public DTOs, or crash text.

Fallback directories are exactly `0700`; atomically published files are exactly
`0600`. Creation validates canonical parent ownership and link state, uses an
exclusive temporary file, fsyncs file and directory, publishes without overwriting
an existing version, rereads and authenticates the exact file, and then returns only
safe publication metadata. Symlinks, hard links, wrong owners, permissive modes,
partial files, changed identities, and open/stat races fail closed.

Nonce reuse under the same wrapping-key identity is rejected before encryption by a
durable exclusive nonce reservation in the 16B SQLite journal. Process memory is not
nonce authority. A failed encryption never promotes a nonce or key version to current
posture; existing current material remains unchanged. Files are retained unless a
future separately approved retention policy proves they are unreferenced. This slice
adds no deletion operation.

This slice does not activate fallback, implement confirmations, select a backend,
add routes, or make fallback current. Specification 16D performs that composition.

## Observable Acceptance Examples

- A fixed synthetic key/passphrase/random fixture produces the exact expected JCS
  file and AAD bytes and can perform a bounded HMAC after reopening, without any API
  returning the key.
- Wrong passphrase, changed workspace/key/version/posture, modified AAD, ciphertext,
  tag, salt, nonce, KDF, algorithm, declared lengths, case, escaping, member order,
  extra/duplicate/missing member, BOM, or LF policy fails before HMAC.
- Canonically distinct passphrases, including normalization variants, remain
  distinct; leading/trailing whitespace and a typed newline are preserved. Invalid
  Unicode scalar input rejects.
- Directory/file symlink, hard link, wrong owner, wrong type, non-exact mode,
  truncated write, pre-existing target, replacement race, and out-of-root path
  conditions fail closed with the prior current posture unchanged.
- Forced nonce reuse for the same wrapping-key identity is rejected before
  encryption after process reconstruction; a different fresh salt/nonce succeeds.
- A crash before rename leaves the prior key current and no partial target. A crash
  after rename yields one complete authenticated file that recovery rereads.
- Fake captures of arguments, environment, logs, events, diagnostics, exceptions,
  JSON serialization, and public object keys contain neither passphrase nor key.
- Closing or replacing the mounted runtime clears private buffers, closes journal
  access, and makes further fallback operations unavailable.
- No plaintext or alternate-path write is attempted when canonical storage is
  unavailable.

## Allowed Scope

- `packages/local-runtime/src/secret-commitment-fallback-format.ts` for exact JCS,
  AAD, parsing, and cross-implementation fixtures.
- `packages/local-runtime/src/secret-commitment-fallback.ts` for mounted encrypted
  storage, Argon2id/AEAD, atomic publication, private bounded HMAC, and cleanup.
- `packages/local-runtime/src/secret-commitment-posture-journal.ts` only for durable
  nonce reservation and publication metadata required by this slice.
- `packages/local-runtime/src/runtime-factory.ts` only for the private close and
  mounted-currentness lifecycle seam.
- Corresponding focused tests under `packages/local-runtime/test/`.
- `package.json` and `package-lock.json` only if required Node 26 Argon2id support is
  unavailable; built-in cryptography is preferred.
- Do not modify fallback activation/confirmation routes, ontology events, ingestion
  domain behavior, source scanning, evidence, UI, providers, PRR, legal, export, or
  destructive code.
- Do not inspect or reuse either preserved failed Specification 16 candidate.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/16-secret-commitment-backend.md`
- `docs/agentic/specifications/16a-secret-commitment-protocol.md`
- `docs/agentic/specifications/16b-secret-commitment-authority.md`
- `packages/local-runtime/src/runtime-factory.ts`
- `packages/local-runtime/src/secret-commitment-posture-journal.ts`

## Risk Lane

Red. The slice handles encrypted synthetic key material and passphrases. Verification
uses only fake human input and temporary fixtures; real passphrase entry, key creation,
or fallback activation remains separately human-gated.

## Targeted Verification

- `npm test -- packages/local-runtime/test/secret-commitment-fallback-format.test.ts packages/local-runtime/test/secret-commitment-fallback.test.ts`
- `npm test -- packages/local-runtime/test/secret-commitment-posture-journal.test.ts packages/agent/test/secret-commitment-port.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves exact JCS/AAD/Argon2id/AEAD,
mounted path/permission/owner/link safety, durable nonce protection, crash-safe
exclusive publication/reread, non-exporting HMAC, private cleanup, and secret-safe
surfaces without activation or live effects.

## Integration Verification

Update normally against latest `neo`, obtain a fresh Sol `ship` verdict on the
final diff, then run `npm run verify` once. Compare with the current recorded
baseline and latest `neo` CI; reject any new or worsened failure. Integrate with
normal Git history, push only configured `origin`, observe CI, do not open a pull
request, and do not force-push.

## Escalation Conditions

Escalate for a different cryptographic/KDF/file contract, returned key bytes,
passphrase persistence or unsafe input path, nonce authority held only in memory,
overwrite/deletion of an existing key version, plaintext or alternate writes,
unavailable required Argon2id/SQLite/filesystem support, real secret use, or the same
concrete failure surviving two focused repairs.
