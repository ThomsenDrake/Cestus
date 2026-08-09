# Specification 16A-R1 — Closed Secret Commitment Protocol And Secret Service Adapter

Status: approved replacement. This specification supersedes Specification 16A's
implementation shape. Specifications 16B through 16D and the Specification 16
umbrella remain product and safety authority.

## Desired Behavior

Cestus defines a type-correct, non-exporting commitment protocol for the two
closed profiles `cestus.source-observation.v1` and
`source-manifest-authority.v1`. The product-facing port exposes only
`createKey`, `rotateKey`, `computeCommitment(profile, frame)`, and
`verifyCommitment(profile, frame, publicRecord)`. It exposes no key export,
generic HMAC, digest, raw protected SHA-256, caller-selected domain, or arbitrary
backend operation. Production and fake ports implement the same discriminated
contracts and compile under the repository typecheck without casts that bypass
the closed profile or record types.

The following TypeScript-shaped contracts are normative. Every listed object is
an immutable, plain, exact own-data object with no prototype other than
`Object.prototype`, no inherited, accessor, symbol, proxy, non-enumerable, missing,
or extra properties. Every `*Id` is a non-empty Unicode scalar-value sequence.
`keyVersion` is a positive safe integer; `expectedCurrentVersion` is zero for
creation or a positive safe integer for rotation. Every `*Hex` is lowercase ASCII
hexadecimal with exactly the decoded length stated by its name or description.

```ts
type SecretCommitmentProfile =
  | "cestus.source-observation.v1"
  | "source-manifest-authority.v1";

interface SecretCommitmentKeyReference {
  readonly backendId: string;
  readonly keyId: string;
  readonly keyVersion: number;
}

interface SourceObservationCommitmentRecord extends SecretCommitmentKeyReference {
  readonly profile: "cestus.source-observation.v1";
  readonly contractVersion: 1;
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly manifestEntryId: string;
  readonly nonceHex: string;       // exactly 32 decoded bytes
  readonly hmacHex: string;        // exactly 32 decoded bytes
}

interface ManifestAuthorityCommitmentRecord extends SecretCommitmentKeyReference {
  readonly profile: "source-manifest-authority.v1";
  readonly contractVersion: 1;
  readonly recordClass: "manifest";
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHashHex: string; // exactly 32 decoded bytes
  readonly publicManifestIdHex: string;          // exactly 32 decoded bytes
  readonly hmacHex: string;                      // exactly 32 decoded bytes
}

interface EntryAuthorityCommitmentRecord extends SecretCommitmentKeyReference {
  readonly profile: "source-manifest-authority.v1";
  readonly contractVersion: 1;
  readonly recordClass: "entry";
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHashHex: string; // exactly 32 decoded bytes
  readonly publicManifestIdHex: string;          // exactly 32 decoded bytes
  readonly publicEntryIdHex: string;             // exactly 32 decoded bytes
  readonly hmacHex: string;                      // exactly 32 decoded bytes
}

type SecretCommitmentPublicRecord =
  | SourceObservationCommitmentRecord
  | ManifestAuthorityCommitmentRecord
  | EntryAuthorityCommitmentRecord;

interface SecretCommitmentMutationRequest {
  readonly contractVersion: 1;
  readonly decisionId: string;
  readonly mutationKind: "create-key" | "rotate-key";
  readonly requestId: string;
  readonly workspaceId: string;
  readonly expectedCurrentVersion: number;
  readonly backendId: string;
  readonly keyId: string;
}

interface SecretCommitmentMutationDecision
  extends SecretCommitmentMutationRequest {
  readonly actorId: string;
  readonly actorKind: "human";
}

type KeyMutationResult =
  | { readonly status: "created"; readonly key: SecretCommitmentKeyReference }
  | { readonly status: "replayed"; readonly key: SecretCommitmentKeyReference }
  | { readonly status: "blocked"; readonly reason:
      | "authority-unavailable" | "decision-invalid" | "decision-mismatch"
      | "stale-version" | "reservation-conflict" }
  | { readonly status: "unavailable"; readonly reason:
      | "backend-unavailable" | "outcome-unreconciled"
      | "publication-unavailable" };

type ComputeCommitmentResult<P extends SecretCommitmentProfile> =
  | { readonly status: "computed"; readonly record:
      P extends "cestus.source-observation.v1"
        ? SourceObservationCommitmentRecord
        : ManifestAuthorityCommitmentRecord | EntryAuthorityCommitmentRecord }
  | { readonly status: "rejected"; readonly reason:
      | "invalid-profile" | "invalid-frame" | "invalid-record" }
  | { readonly status: "unavailable"; readonly reason:
      | "authority-unavailable" | "backend-unavailable" | "key-unavailable" };

type VerifyCommitmentResult =
  | { readonly status: "valid" }
  | { readonly status: "mismatch" }
  | { readonly status: "unverifiable"; readonly reason: "key-lost" }
  | { readonly status: "rejected"; readonly reason:
      | "invalid-profile" | "invalid-frame" | "invalid-record"
      | "record-reference-invalid" }
  | { readonly status: "unavailable"; readonly reason:
      | "authority-unavailable" | "backend-unavailable" };

interface SecretCommitmentPort {
  createKey(request: SecretCommitmentMutationRequest): Promise<KeyMutationResult>;
  rotateKey(request: SecretCommitmentMutationRequest): Promise<KeyMutationResult>;
  computeCommitment<P extends SecretCommitmentProfile>(
    profile: P,
    frame: Uint8Array
  ): Promise<ComputeCommitmentResult<P>>;
  verifyCommitment<P extends SecretCommitmentProfile>(
    profile: P,
    frame: Uint8Array,
    publicRecord: P extends "cestus.source-observation.v1"
      ? SourceObservationCommitmentRecord
      : ManifestAuthorityCommitmentRecord | EntryAuthorityCommitmentRecord
  ): Promise<VerifyCommitmentResult>;
}
```

The fake authority implements the same production authority interface consumed
by `SecretCommitmentPort`. Its separate test-only staging harness accepts an
unknown candidate decision, strictly normalizes it to the normative decision
shape, and models completion of an already authenticated boundary. A create or
rotate caller supplies only `SecretCommitmentMutationRequest`; caller-supplied
`actorId` or `actorKind` is an extra-property rejection and can never authenticate
a mutation. The port resolves `decisionId` through the trusted injected authority
and atomically compares every remaining decision/request field before reservation.
Specification 16B must replace the staging harness with mounted authentication;
the product port and result contracts do not change.

The internal backend creates and retains exact key identifiers and versions and
performs bounded HMAC-SHA-256 internally. It returns only safe key metadata,
availability or loss state, and a 32-byte HMAC. The adjacent Secret Service
adapter wraps a closed client that supports create, existence/version lookup,
and bounded HMAC without exporting key bytes. Standard tests exercise that
adapter through a fake Secret Service client holding only synthetic key bytes;
no product API, adapter result, enumerable field, serializer, accessor, symbol,
diagnostic, or error exposes them.

The backend and closed Secret Service seam are also normative and type-compatible
between production and fakes. `createExactKey` receives the intended positive
version, never chooses one, and returns only an exact-key result. `lookupExactKey`
is the required reconciliation operation. `computeExactHmac` returns exactly 32
bytes or a closed safe state. The adapter rejects a returned reference that differs
from its input in any field and rejects every malformed result before authority or
comparison use.

```ts
type BackendCreateResult =
  | { readonly status: "created"; readonly key: SecretCommitmentKeyReference }
  | { readonly status: "already-present"; readonly key: SecretCommitmentKeyReference }
  | { readonly status: "unavailable" };

type BackendLookupResult =
  | { readonly status: "present"; readonly key: SecretCommitmentKeyReference }
  | { readonly status: "missing" }
  | { readonly status: "ambiguous" }
  | { readonly status: "unavailable" };

type BackendHmacResult =
  | { readonly status: "computed"; readonly hmac: Uint8Array }
  | { readonly status: "missing" }
  | { readonly status: "unavailable" };

interface SecretCommitmentBackend {
  createExactKey(key: SecretCommitmentKeyReference): Promise<BackendCreateResult>;
  lookupExactKey(key: SecretCommitmentKeyReference): Promise<BackendLookupResult>;
  computeExactHmac(
    key: SecretCommitmentKeyReference,
    frame: Uint8Array
  ): Promise<BackendHmacResult>;
}
```

The fake Secret Service client implements the corresponding closed client seam
behind this backend and may retain synthetic bytes privately. Its methods use the
same exact inputs and result unions. The adapter must independently normalize
unknown client results rather than trust TypeScript declarations. The fake
authority implements the production reservation/read/reference interface; only
its test harness exposes decision staging and deterministic counters/scheduling.
Neither fake adds an operation that exports key bytes or selects current state.

An injected append-only posture authority is the sole selector of the current
backend, key identifier, and version. This slice supplies strict in-memory fake
authority and fake human-decision fixtures only; Specification 16B supplies the
mounted durable implementation. Backend metadata and process-local state never
select current authority. Reconstructing the port over replayed fake authority
resolves the same selection. Verify addresses only the exact backend, key ID,
and version in a validated public record; lost old material returns
`unverifiable` and never substitutes the current key.

Every create or rotate consumes one current mutation decision. A decision is an
immutable exact own-data record bound to all of: an authenticated actor identity,
actor kind exactly `human`, mutation kind exactly `create-key` or `rotate-key`,
request identity, workspace identity, expected current version, and the intended
backend/key identity. Decisions from `agent`, `system`, `extractor`, a different
human, a different mutation kind or request, a stale expected version, or any
substituted binding fail before reservation, key generation, publication, or
selection. One request replay is idempotent only when every binding is identical.

The authority owns one atomic reservation state machine:
`reserved -> generating -> reconciling | generated -> published`. A reservation
fixes the complete request/decision identity and expected version. Before-effect
backend failure retains a `reserved` retryable state for only the identical
request. If creation might have occurred before an error, the reservation becomes
`reconciling`; retry must query exact backend/key/version existence and may not
generate. Exactly-present moves to `generated`, exactly-absent moves to `reserved`,
and ambiguous, malformed, throwing, or unavailable lookup remains `reconciling`
and returns `outcome-unreconciled`. Successful generated metadata is retained
across publication failure, and the identical request retries publication without
generation. A competing request remains blocked in every nonterminal state.
Publication alone consumes the decision and selects the key; identical replay of
a published request returns `replayed`. Two independently authorized contenders
for the same expected version therefore yield one reservation winner, no more than
one effective backend generation, and one publication. Rotation creates exactly
the next version and retains old versions. Compute and verify never create keys.

Frame builders and parsers implement the exact binary contracts from
Specification 16. Every ID must be a non-empty Unicode scalar-value sequence:
encoding as UTF-8 and strictly decoding it must reproduce the identical sequence,
with no normalization, replacement character introduced for an unpaired
surrogate, trimming, or case change. Tags occur once in ascending order and use
an unsigned 64-bit big-endian length. Missing, extra, duplicate, out-of-order,
non-minimal, overflowing, wrong-length, truncated, invalid-UTF-8, or trailing
material fails before backend use.

For this fixed-width encoding, “non-minimal” means any attempted length encoding
other than exactly eight bytes: fewer bytes is truncation and a ninth byte is
parsed only as the declared value, next tag, or forbidden trailing material. No
variable-width, signed, floating, or text length representation is accepted.

The ingestion domain service owns profile-specific compute and verify operations,
not a generic binding object. For source observations it obtains a nonce from an
injected source that returns exactly 32 fresh bytes; callers cannot supply a
nonce. It copies the nonce, rejects malformed output and reuse within the service,
builds the exact frame, and returns the complete public record. Verification
validates the entire exact record, extracts and binds that record's nonce, rebuilds
the exact observation frame from the supplied bindings and observed bytes, and
delegates to the closed port. Runtime CSPRNG composition remains Specification
16D scope.

For manifest authority, separate manifest and entry compute/verify operations
build the exact Specification 16 frames. Manifest operations bind class
`manifest`, the 32-byte policy hash, 32-byte public manifest ID, and protected
canonical manifest bytes. Entry operations bind class `entry`, the same fields,
the additional 32-byte public entry ID, and protected canonical entry bytes.
Verification derives the class and public IDs only from the validated complete
record and rejects cross-class, missing, extra, or substituted bindings.

The ingestion service has exactly the following six domain operations plus its
injected `ObservationNonceSource.nextNonce(): Promise<Uint8Array>`. Every input is
an exact own-data object; byte arrays are copied before asynchronous use. The
observation compute input intentionally has no nonce member.

```ts
interface SecretSourceCommitmentService {
  computeSourceObservation(input: {
    readonly workspaceId: string; readonly sourceCollectionId: string;
    readonly sourceBoundaryRevision: string; readonly manifestEntryId: string;
    readonly observedBytes: Uint8Array;
  }): Promise<ComputeCommitmentResult<"cestus.source-observation.v1">>;
  verifySourceObservation(input: {
    readonly workspaceId: string; readonly sourceCollectionId: string;
    readonly sourceBoundaryRevision: string; readonly manifestEntryId: string;
    readonly observedBytes: Uint8Array;
    readonly record: SourceObservationCommitmentRecord;
  }): Promise<VerifyCommitmentResult>;
  computeManifestAuthority(input: {
    readonly workspaceId: string; readonly sourceCollectionId: string;
    readonly sourceBoundaryRevision: string;
    readonly classificationPolicyHash: Uint8Array;
    readonly publicManifestId: Uint8Array;
    readonly protectedCanonicalManifestBytes: Uint8Array;
  }): Promise<ComputeCommitmentResult<"source-manifest-authority.v1">>;
  verifyManifestAuthority(input: {
    readonly workspaceId: string; readonly sourceCollectionId: string;
    readonly sourceBoundaryRevision: string;
    readonly classificationPolicyHash: Uint8Array;
    readonly publicManifestId: Uint8Array;
    readonly protectedCanonicalManifestBytes: Uint8Array;
    readonly record: ManifestAuthorityCommitmentRecord;
  }): Promise<VerifyCommitmentResult>;
  computeEntryAuthority(input: {
    readonly workspaceId: string; readonly sourceCollectionId: string;
    readonly sourceBoundaryRevision: string;
    readonly classificationPolicyHash: Uint8Array;
    readonly publicManifestId: Uint8Array; readonly publicEntryId: Uint8Array;
    readonly protectedCanonicalEntryBytes: Uint8Array;
  }): Promise<ComputeCommitmentResult<"source-manifest-authority.v1">>;
  verifyEntryAuthority(input: {
    readonly workspaceId: string; readonly sourceCollectionId: string;
    readonly sourceBoundaryRevision: string;
    readonly classificationPolicyHash: Uint8Array;
    readonly publicManifestId: Uint8Array; readonly publicEntryId: Uint8Array;
    readonly protectedCanonicalEntryBytes: Uint8Array;
    readonly record: EntryAuthorityCommitmentRecord;
  }): Promise<VerifyCommitmentResult>;
}
```

Public records are immutable exact own-data objects. Source-observation records
contain only profile, contract version, exact key identity/version,
workspace/source/boundary/entry bindings, 32-byte nonce, and 32-byte HMAC.
Manifest records contain only profile, contract version, exact key
identity/version, class, workspace/source/boundary bindings, 32-byte policy hash,
32-byte public manifest ID, no entry ID, and 32-byte HMAC. Entry records add the
required 32-byte public entry ID. Binary public fields have one specified
lowercase-hex representation and reject uppercase, odd, non-hex, or wrong-length
values. Verification invokes the injected constant-time comparison seam exactly
once only after both commitments are valid and comparable.

This slice does not create mounted posture storage, encrypted fallback files,
runtime routes, live nonce sources, passphrase handling, source traversal,
evidence, or provider behavior. Until 16B is integrated, production mutation
authority remains unavailable and the protocol is usable only with explicit fake
fixtures.

## Observable Acceptance Examples

- Exact byte fixtures assert every byte, including prefixes, NUL separators,
  tags, eight-byte big-endian lengths, values, and final byte, for observation,
  manifest, and entry frames. The manifest fixture omits tag 7; the entry fixture
  contains tag 7 before tag 8. The expected bytes are independent literals, not
  generated by the production encoder under test. Altered profile bytes and
  missing, doubled, displaced, or extra NUL bytes are rejected.
- Table-driven parser tests reject every missing tag, extra tag, duplicate tag,
  out-of-order tag, altered tag, truncated prefix/tag/length/value, trailing byte,
  non-minimal or greater-than-safe/allocation length, wrong fixed-length nonce,
  hash, public ID, or HMAC, invalid UTF-8, empty ID, and lone high or low surrogate
  before HMAC or comparison.
- Public-record tests reject null, arrays, non-plain prototypes, proxies, inherited
  properties, accessors without invoking them, symbol keys, non-enumerable extras,
  missing/extra keys, wrong contract/profile/class, unsafe key versions, uppercase,
  odd, non-hex, and wrong-length binary strings before backend use.
- A fake available Secret Service adapter plus one exact human decision creates
  version one and computes a known HMAC fixture. The adapter itself is exercised,
  and key bytes are absent from all public/reflected/serialized/error surfaces.
- Decision tests independently change actor identity, actor kind (`agent`,
  `system`, or `extractor`), mutation kind, request ID, workspace, backend/key ID,
  and expected version; every change fails before reservation and backend use.
  Decision and mutation-request tests also reject null, arrays, proxies,
  non-plain prototypes, inherited properties, accessors without invocation,
  symbol keys, non-enumerable/extra/missing fields, invalid IDs, and unsafe or
  non-integral versions.
- Two separately staged, independently authorized concurrent create contenders
  for expected version zero result in exactly one successful reservation, one
  generated key, and one published version. The same is proven for concurrent
  rotation contenders. The losing decision is not consumed as a successful
  mutation and cannot authorize a substituted request.
- Identical replay returns the original publication without another generation.
  A forced failure before creation retains an exact-request retryable reservation.
  A failure after creation but before a success return forces lookup reconciliation
  before any retry; present, missing, ambiguous, malformed, throwing, and
  unavailable lookups exercise every state. A failure before publication retains
  generated metadata and republishes without regeneration. Another request cannot
  steal any retained reservation, and decision consumption occurs only after one
  publication.
- Rotation selects version two while a version-one record still verifies.
  Removing version-one material produces `unverifiable`, never a version-two HMAC.
- Observation compute requests two nonces for identical bindings and bytes and
  yields different records. Repeated nonce output, fewer/more than 32 bytes,
  mutable-output aliasing, and thrown nonce sources fail closed without HMAC.
  Observation verify extracts the record nonce; changing the record nonce or any
  workspace/source/boundary/entry/observed-byte binding invalidates verification.
- Manifest and entry compute/verify round trips use exact known frames. Changing
  class, policy hash, public manifest ID, public entry ID, protected canonical
  bytes, workspace, source, or boundary invalidates verification. Manifest/entry
  record or frame substitution is rejected before backend use.
- A third profile, generic HMAC input, raw digest, caller-provided observation
  nonce, generic binding object, or backend-current selector is absent from the
  exported type/runtime surface.
- Secret Service adapter tests cover created, already-present, present, missing,
  ambiguous, unavailable, and thrown client results; wrong backend/key/version,
  wrong HMAC length, null/array/proxy/prototype/inherited/accessor/symbol/
  non-enumerable/extra/missing result shapes are rejected without invoking hostile
  accessors, publishing metadata, comparing HMACs, or exposing synthetic key bytes.
- Standard verification uses only synthetic bytes and fake authority, nonce, and
  Secret Service clients. It touches no credential, passphrase, attached storage,
  provider, model, network, or listening runtime.

## Allowed Scope

- `packages/agent/src/os-secret-store.ts` only for the adjacent closed Secret
  Service commitment-client seam without changing exact-use credential behavior.
- `packages/agent/src/secret-commitment-port.ts` for the closed backend,
  reservation/publication authority contracts, type-correct fake authority,
  protocol port, strict record parser, and public-record contracts.
- `packages/agent/test/os-secret-store.test.ts` and
  `packages/agent/test/secret-commitment-port.test.ts`.
- `packages/ingestion/src/secret-source-commitment.ts` for exact frame
  builders/parsers and the profile-specific injected compute/verify service.
- `packages/ingestion/test/secret-source-commitment.test.ts`.
- `package.json` and `package-lock.json` only for focused test wiring; no new
  dependency is expected and dependency installation is prohibited for this run.
- Do not modify local-runtime, source scanning, evidence admission, scheduling,
  UI, ontology truth, provider/OCR, PRR, legal, export, or destructive behavior.
- Preserve but do not inspect, reuse, merge, or push any failed Specification 16
  or 16A candidate.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/16-secret-commitment-backend.md`
- `packages/ontology/src/contracts.ts` only for the existing actor-kind vocabulary
- `packages/agent/src/os-secret-store.ts`
- `packages/agent/test/os-secret-store.test.ts`
- `packages/ingestion/src/runtime.ts`

## Risk Lane

Red. This slice defines cryptographic, mutation-authority, and key-selection
boundaries, but verification may use only synthetic keys in fake backends. Any
real Secret Service key creation remains separately human-gated.

## Targeted Verification

- `npm test -- packages/agent/test/os-secret-store.test.ts packages/agent/test/secret-commitment-port.test.ts`
- `npm test -- packages/ingestion/test/secret-source-commitment.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero using the existing local dependency
installation and the tests prove all acceptance examples, including exact bytes,
strict hostile-shape rejection, human-decision binding, probative concurrency,
type-compatible fakes, ingestion verification, and the fake Secret Service
adapter, without live effects.

## Integration Verification

Update normally against latest `neo`, obtain a fresh Sol `ship` verdict on the
final diff, then run `npm run verify` once. Compare with the current recorded
baseline and latest `neo` CI; reject any new or worsened failure. Integrate with
normal Git history, push only configured `origin`, observe CI, do not open a pull
request, and do not force-push. Do not run `npm ci`, install dependencies, or
perform any live secret/provider/runtime action.

## Escalation Conditions

Escalate for a key-exporting or generic crypto API, changed Specification 16
frame/public-record contract, process-local version authority, automatic key
creation, a different decision-binding or reservation settlement model,
unavailable required Node cryptography or existing local dependencies, real key
use during build, scope outside the named files, or the same concrete failure
surviving two focused repair attempts.
