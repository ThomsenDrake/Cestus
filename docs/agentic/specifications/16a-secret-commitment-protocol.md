# Closed Secret Commitment Protocol And Secret Service Adapter

Status: approved.

## Desired Behavior

Cestus defines the complete non-exporting commitment protocol used by later
protected-source slices. The product-facing port exposes only `createKey`,
`rotateKey`, `computeCommitment(profile, frame)`, and
`verifyCommitment(profile, frame, publicRecord)`. It accepts exactly
`cestus.source-observation.v1` and `source-manifest-authority.v1`; it exposes no
key export, generic HMAC, digest, raw protected SHA-256, caller-defined domain,
or arbitrary backend operation.

The internal backend contract never returns key bytes. A backend creates and
retains versions and performs a bounded HMAC operation internally, returning
only safe key metadata, availability or loss state, and the 32-byte HMAC output.
The default adapter wraps a closed operating-system Secret Service client. Tests
use a fake client holding synthetic key bytes; no test or public helper can read
those bytes back through the adapter.

Backends retain and address key material by exact key identifier and version, and
report only safe publication metadata. They never select which backend or version
is current. The injected append-only posture authority is the sole selector of the
current backend, key identifier, and version: this slice supplies a strict fake
authority fixture and Specification 16B supplies its mounted durable production
implementation. A reconstructed port resolves current selection through that same
authority and addresses the backend by the selected exact version. No process-local
port or backend-current variable may select authority. Creation is idempotent for
one exact request identity, rotation creates one next version, and a stale or
conflicting expected version fails before key generation. Old versions remain
addressable for verification. Missing old material returns `unverifiable` without
substituting current material.

Every create or rotate call consumes an injected one-shot mutation-authority
port. This slice supplies only a strict interface and fake human-authority
fixture; Specification 16B supplies the mounted durable production authority.
Without a current authority decision, create and rotate fail before the backend
is called. Compute resolves the current backend and version only through the
injected authority. Verify addresses only the backend and exact version named by
the public record after authority validates that record's durable selection or
reference. Neither operation creates or selects a key implicitly.

Commitment frames and public records implement the exact binary and public
contracts from the Specification 16 umbrella. IDs are non-empty Unicode scalar
sequences encoded as UTF-8 without normalization. Tags occur once in ascending
order and use an unsigned 64-bit big-endian length. Missing, extra, duplicate,
out-of-order, overflowing, truncated, invalid-UTF-8, or trailing material fails
before HMAC.

Source-observation records expose only profile, contract version, key identity
and version, workspace/source/boundary/entry bindings, the fresh 32-byte nonce,
and HMAC. Manifest-authority records expose only profile, contract version, key
identity and version, record class, workspace/source/boundary bindings, policy
hash, public manifest ID, optional public entry ID, and HMAC. Records are exact,
immutable own-data objects. Verification uses an injected constant-time
comparison seam for valid comparable commitments.

This slice does not create mounted posture storage, encrypted fallback files,
runtime routes, passphrase handling, source traversal, evidence, or provider
behavior. Until 16B is integrated, production mutation authority remains
unavailable and the protocol is usable only with explicit fake fixtures.

## Observable Acceptance Examples

- A fake available Secret Service plus one fake human authority decision creates
  version one, computes an exact known HMAC fixture, and verifies it without any
  product API or enumerable/serializable object exposing key bytes.
- Reconstructing the port over the same fake Secret Service and replayed fake
  authority preserves the current selection. Backend metadata alone never selects
  a current version. An identical create replay is idempotent; stale or concurrent
  create and rotation requests generate no additional key.
- Rotation selects version two while a version-one record still verifies. Removing
  version-one material yields `unverifiable`, never a version-two HMAC.
- Exact byte fixtures cover observation, manifest, and entry frames. Changing
  field order, tag, length, UTF-8, class, policy hash, public ID, protected bytes,
  nonce, workspace, source collection, boundary revision, entry, or observed
  bytes rejects or invalidates verification.
- The same observed bytes with two different 32-byte nonces produce different
  public records and commitments.
- Both closed profiles work; a third profile, raw digest, arbitrary HMAC request,
  malformed public record, inherited/accessor field, extra field, or generic
  binding object is rejected before backend use.
- The injected comparison seam is invoked exactly for valid comparable records
  and not treated as a timing proof.
- Standard verification uses only synthetic bytes and fake authority/Secret
  Service clients. It does not touch a credential, passphrase, SSD, provider,
  model, network, or listening runtime.

## Allowed Scope

- `packages/agent/src/os-secret-store.ts` only for a focused adjacent closed
  Secret Service commitment-client seam without changing exact-use credential
  behavior.
- `packages/agent/src/secret-commitment-port.ts` for the non-exporting backend,
  authority, port, strict parser, and public-record contracts.
- `packages/agent/test/os-secret-store.test.ts` and
  `packages/agent/test/secret-commitment-port.test.ts`.
- `packages/ingestion/src/secret-source-commitment.ts` for canonical frame
  builders and injected compute/verify domain service.
- `packages/ingestion/test/secret-source-commitment.test.ts`.
- `package.json` and `package-lock.json` only for focused test wiring; no crypto
  dependency is expected.
- Do not modify local-runtime, source scanning, evidence admission, scheduling,
  UI, ontology truth, provider/OCR, PRR, legal, export, or destructive behavior.
- Do not inspect or reuse either preserved failed Specification 16 candidate.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/16-secret-commitment-backend.md`
- `packages/agent/src/os-secret-store.ts`
- `packages/agent/test/os-secret-store.test.ts`
- `packages/ingestion/src/runtime.ts`

## Risk Lane

Red. The slice defines cryptographic and key-authority boundaries, but build
verification may create only synthetic keys inside fake backends. Any real Secret
Service key creation remains separately human-gated.

## Targeted Verification

- `npm test -- packages/agent/test/os-secret-store.test.ts packages/agent/test/secret-commitment-port.test.ts`
- `npm test -- packages/ingestion/test/secret-source-commitment.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and the tests prove exact protocol bytes,
closed profiles and records, non-exporting Secret Service operations, durable fake
versions, retained-version verification, loss behavior, authority gating, and
constant-time comparison without live effects.

## Integration Verification

Update normally against latest `neo`, obtain a fresh Sol `ship` verdict on the
final diff, then run `npm run verify` once. Compare with the current recorded
baseline and latest `neo` CI; reject any new or worsened failure. Integrate with
normal Git history, push only configured `origin`, observe CI, do not open a pull
request, and do not force-push.

## Escalation Conditions

Escalate for a key-exporting or generic crypto API, changed frame or public-record
contract, process-local version authority, automatic key creation, unavailable
required Node cryptography, real key use during build, scope outside the named
agent/ingestion files, or the same concrete failure surviving two focused repairs.
