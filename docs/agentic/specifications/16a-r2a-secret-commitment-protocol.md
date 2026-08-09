# Specification 16A-R2a — Pure Secret Commitment Protocol

Status: approved replacement slice 1 of 2. Execute before Specification 16A-R2b.

## Desired Behavior

Cestus defines the dependency-free, key-free protocol layer for the two closed
commitment profiles `cestus.source-observation.v1` and
`source-manifest-authority.v1`. This slice contains only normative public types,
strict record normalization, exact binary frame codecs, and a nonce-owning
ingestion domain service over an injected synthetic compute/verify port. It does
not create, select, store, rotate, look up, or use a real commitment key and does
not implement mutation authority or a Secret Service adapter.

The following contracts are normative. Implement them as direct discriminated
unions without conditional generic result types and without casts that evade
profile, record, or fake-port compatibility. Every listed record is returned as
an immutable plain exact own-data object. Runtime input rejects null, arrays,
proxies, non-plain prototypes, inherited fields, accessors without invoking them,
symbol keys, non-enumerable fields, and missing or extra fields.

```ts
type SecretCommitmentProfile =
  | "cestus.source-observation.v1"
  | "source-manifest-authority.v1";

interface SecretCommitmentKeyReference {
  readonly backendId: string;
  readonly keyId: string;
  readonly keyVersion: number; // positive safe integer
}

interface SourceObservationCommitmentRecord extends SecretCommitmentKeyReference {
  readonly profile: "cestus.source-observation.v1";
  readonly contractVersion: 1;
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly manifestEntryId: string;
  readonly nonceHex: string; // lowercase, exactly 32 decoded bytes
  readonly hmacHex: string;  // lowercase, exactly 32 decoded bytes
}

interface ManifestAuthorityCommitmentRecord extends SecretCommitmentKeyReference {
  readonly profile: "source-manifest-authority.v1";
  readonly contractVersion: 1;
  readonly recordClass: "manifest";
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHashHex: string; // 32 decoded bytes
  readonly publicManifestIdHex: string;          // 32 decoded bytes
  readonly hmacHex: string;                      // 32 decoded bytes
}

interface EntryAuthorityCommitmentRecord extends SecretCommitmentKeyReference {
  readonly profile: "source-manifest-authority.v1";
  readonly contractVersion: 1;
  readonly recordClass: "entry";
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHashHex: string; // 32 decoded bytes
  readonly publicManifestIdHex: string;          // 32 decoded bytes
  readonly publicEntryIdHex: string;             // 32 decoded bytes
  readonly hmacHex: string;                      // 32 decoded bytes
}

type SecretCommitmentPublicRecord =
  | SourceObservationCommitmentRecord
  | ManifestAuthorityCommitmentRecord
  | EntryAuthorityCommitmentRecord;

type ComputeCommitmentResult =
  | { readonly status: "computed"; readonly record: SecretCommitmentPublicRecord }
  | { readonly status: "rejected"; readonly reason:
      | "invalid-profile" | "invalid-frame" | "invalid-record" }
  | { readonly status: "unavailable"; readonly reason:
      | "authority-unavailable" | "backend-unavailable" | "key-unavailable"
      | "nonce-unavailable" };

type VerifyCommitmentResult =
  | { readonly status: "valid" }
  | { readonly status: "mismatch" }
  | { readonly status: "unverifiable"; readonly reason: "key-lost" }
  | { readonly status: "rejected"; readonly reason:
      | "invalid-profile" | "invalid-frame" | "invalid-record"
      | "record-reference-invalid" }
  | { readonly status: "unavailable"; readonly reason:
      | "authority-unavailable" | "backend-unavailable" };

interface SecretCommitmentComputePort {
  computeCommitment(
    profile: SecretCommitmentProfile,
    frame: Uint8Array
  ): Promise<ComputeCommitmentResult>;
  verifyCommitment(
    profile: SecretCommitmentProfile,
    frame: Uint8Array,
    publicRecord: SecretCommitmentPublicRecord
  ): Promise<VerifyCommitmentResult>;
}
```

All string IDs are non-empty Unicode scalar-value sequences. Strict UTF-8 encode
then fatal-decode must reproduce the identical sequence without normalization,
replacement, trimming, or case conversion. Lone surrogates fail. Hex strings are
lowercase ASCII with exact length and reject uppercase, odd, non-hex, or wrong
length. Input and output byte arrays are copied before asynchronous use.

The frame codec implements Specification 16 exactly. Observation frames contain
the ASCII profile plus one NUL and tags 1 through 6. Manifest frames contain the
authority profile plus one NUL and tags 1,2,3,4,5,6,8. Entry frames contain tags
1,2,3,4,5,6,7,8. Every tag has exactly one unsigned byte, exactly eight unsigned
big-endian length bytes, and the declared value. No alternate, shorter, longer,
signed, floating, or text length form exists. Parsing rejects altered prefixes,
missing/doubled/displaced/extra NULs, missing/extra/duplicate/out-of-order tags,
unsafe or overflowing lengths before allocation, truncation at every boundary,
wrong fixed lengths, invalid record class or UTF-8, and trailing material.

The codec exports exactly `buildSourceObservationFrame`,
`buildManifestAuthorityFrame`, `buildEntryAuthorityFrame`,
`parseSecretCommitmentFrame`, and `normalizeSecretCommitmentPublicRecord`.
Builders accept exact own-data inputs matching the fields below except `profile`
and `recordClass`, which each builder fixes. The parser returns one frozen union
member with copied byte arrays; it never returns a mutable `Map` or a partially
validated field bag.

```ts
interface SourceObservationFrameInput {
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly manifestEntryId: string;
  readonly nonce: Uint8Array;
  readonly observedBytes: Uint8Array;
}

interface ManifestAuthorityFrameInput {
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHash: Uint8Array;
  readonly publicManifestId: Uint8Array;
  readonly protectedCanonicalManifestBytes: Uint8Array;
}

interface EntryAuthorityFrameInput {
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHash: Uint8Array;
  readonly publicManifestId: Uint8Array;
  readonly publicEntryId: Uint8Array;
  readonly protectedCanonicalEntryBytes: Uint8Array;
}

function buildSourceObservationFrame(
  input: SourceObservationFrameInput
): Uint8Array | undefined;
function buildManifestAuthorityFrame(
  input: ManifestAuthorityFrameInput
): Uint8Array | undefined;
function buildEntryAuthorityFrame(
  input: EntryAuthorityFrameInput
): Uint8Array | undefined;

type ParsedSecretCommitmentFrame =
  | {
      readonly profile: "cestus.source-observation.v1";
      readonly workspaceId: string;
      readonly sourceCollectionId: string;
      readonly sourceBoundaryRevision: string;
      readonly manifestEntryId: string;
      readonly nonce: Uint8Array;
      readonly observedBytes: Uint8Array;
    }
  | {
      readonly profile: "source-manifest-authority.v1";
      readonly recordClass: "manifest";
      readonly workspaceId: string;
      readonly sourceCollectionId: string;
      readonly sourceBoundaryRevision: string;
      readonly classificationPolicyHash: Uint8Array;
      readonly publicManifestId: Uint8Array;
      readonly protectedCanonicalManifestBytes: Uint8Array;
    }
  | {
      readonly profile: "source-manifest-authority.v1";
      readonly recordClass: "entry";
      readonly workspaceId: string;
      readonly sourceCollectionId: string;
      readonly sourceBoundaryRevision: string;
      readonly classificationPolicyHash: Uint8Array;
      readonly publicManifestId: Uint8Array;
      readonly publicEntryId: Uint8Array;
      readonly protectedCanonicalEntryBytes: Uint8Array;
    };

function parseSecretCommitmentFrame(
  profile: SecretCommitmentProfile,
  frame: Uint8Array
): ParsedSecretCommitmentFrame | undefined;

function normalizeSecretCommitmentPublicRecord(
  value: unknown
): SecretCommitmentPublicRecord | undefined;
```

Each builder returns `undefined` for any invalid or hostile exact input, invalid ID,
wrong fixed byte length, accessor/symbol/proxy shape, or allocation overflow. It
never throws or returns a partial frame. A successful builder snapshots every byte
array and returns a new array; later caller mutation cannot change it.

The ingestion service exposes exactly six profile-specific methods:
`computeSourceObservation`, `verifySourceObservation`,
`computeManifestAuthority`, `verifyManifestAuthority`,
`computeEntryAuthority`, and `verifyEntryAuthority`. Observation compute obtains
exactly 32 fresh bytes from injected `nextNonce(): Promise<Uint8Array>`; callers
cannot provide a nonce. It copies the output and rejects malformed or repeated
nonces within the service before port use. Observation verify validates the exact
complete record, extracts its nonce, rebuilds the frame from caller-supplied
bindings and observed bytes, and delegates to the injected port. Manifest and
entry methods are separate and reject class or public-ID substitution.

The service interface is normative. Each method accepts an exact own-data input;
the manifest and entry methods deliberately use different protected-byte and
public-ID members.

```ts
interface CreateSecretSourceCommitmentServiceInput {
  readonly port: SecretCommitmentComputePort;
  readonly nextNonce: () => Promise<Uint8Array>;
}

function createSecretSourceCommitmentService(
  input: unknown
): SecretSourceCommitmentService | undefined;

interface SecretSourceCommitmentService {
  computeSourceObservation(input: {
    readonly workspaceId: string; readonly sourceCollectionId: string;
    readonly sourceBoundaryRevision: string; readonly manifestEntryId: string;
    readonly observedBytes: Uint8Array;
  }): Promise<ComputeCommitmentResult>;
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
  }): Promise<ComputeCommitmentResult>;
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
  }): Promise<ComputeCommitmentResult>;
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

The factory accepts only an exact own-data object whose `port` has exact own data
methods `computeCommitment` and `verifyCommitment` and whose `nextNonce` is an own
data function. Invalid/proxy/prototype/inherited/accessor/symbol/extra/missing
factory input returns `undefined` without invoking an accessor. A successful
factory closes over normalized function references and returns a frozen service.

Service failure mapping is exact:

- invalid or hostile method input, builder rejection, malformed/repeated nonce,
  or malformed/wrong-profile/wrong-class/public-binding-substituted record returns
  `{ status: "rejected", reason: "invalid-record" }` without further port use;
- a throwing nonce source returns
  `{ status: "unavailable", reason: "nonce-unavailable" }` without port use;
- a throwing compute/verify port method returns
  `{ status: "unavailable", reason: "backend-unavailable" }`;
- a port result that is not one exact member of the applicable result union returns
  `{ status: "rejected", reason: "invalid-record" }`;
- exact `rejected`, `unavailable`, `mismatch`, `unverifiable`, and `valid` port
  results otherwise propagate unchanged after applicable record/binding checks,
  including a port-provided `rejected/record-reference-invalid` result.

A mutable nonce or input byte array is not rejected merely for being mutable.
The service copies it synchronously before the next await or port call. Tests mutate
the retained source arrays while the synthetic port is barrier-paused and prove the
port-observed frame remains the original snapshot. Repetition means equal 32-byte
nonce content previously accepted by that service instance, not object identity.

The service treats injected port results as untrusted runtime data despite their
TypeScript type. A computed result is returned only after strict record
normalization and confirmation that profile, class, nonce, and every public binding
match the exact request/frame. A malformed, wrong-profile, wrong-class, or
public-binding-substituted result becomes `rejected/invalid-record`. R2a has no
trusted expected key reference: it validates `backendId`, `keyId`, and `keyVersion`
structurally but does not reject a different valid reference. R2b alone validates
that reference against authority. The synthetic test port
implements `SecretCommitmentComputePort` directly without `any`, double casts, or
profile-narrower method parameters.

Before any verify port call, each service method compares every record-carried
public binding against its request. Observation compares workspace, source,
boundary, and manifest-entry IDs; its nonce comes only from the record. Manifest
compares class, workspace, source, boundary, policy-hash bytes, and public manifest
ID. Entry compares those plus public entry ID. Any mismatch returns
`rejected/invalid-record` without port use. Observed bytes and protected canonical
payload bytes are not carried in the public record; changing only a payload builds
the changed frame and delegates normally so the port can return `mismatch`.

## Observable Acceptance Examples

- Independent literal byte fixtures assert the complete observation, manifest,
  and entry frames, including every prefix, NUL, tag, eight-byte length, value,
  class, and final byte. Expected bytes are not produced by the codec under test.
- Table-driven codec cases cover every missing, extra, duplicate, reordered, and
  altered tag; each truncated prefix/tag/length/value boundary; unsafe/overflowing
  length; wrong nonce/hash/public-ID length; invalid UTF-8 and lone surrogates;
  altered NUL/prefix; invalid class; and trailing bytes without throwing.
- Record normalization accepts one exact immutable fixture for each record class
  and rejects hostile shapes, every missing/extra field, unsafe key versions, bad
  IDs, wrong contract/profile/class, malformed hex, manifest entry-ID presence,
  and entry entry-ID absence without invoking an accessor or injected port.
- All six service methods round trip through a strict synthetic port. Exact frame
  copies observed by that port equal the independent fixtures. Manifest and entry
  operations cannot substitute each other.
- Two observation computes with identical bindings and bytes receive different
  nonces and records. Short, long, or repeated nonce content is rejected; a
  throwing source is unavailable. Mutable/aliased arrays are snapshotted, and
  caller mutation after invocation cannot change the frame observed by the port.
- Observation verification uses only the record nonce. Changing record nonce,
  workspace, source, boundary, entry, or observed bytes rejects or invalidates the
  result. Public binding substitutions reject before port use; changing only
  observed bytes delegates and may mismatch. A valid but different key reference
  is structurally accepted here and is authority-validated only by R2b.
- Exports contain no create, rotate, backend, HMAC, digest, key-export, authority,
  current-selection, Secret Service, credential, fallback, or runtime operation.

## Allowed Scope

- `packages/agent/src/secret-commitment-contract.ts`
- `packages/agent/test/secret-commitment-contract.test.ts`
- `packages/ingestion/src/secret-source-commitment.ts`
- `packages/ingestion/test/secret-source-commitment.test.ts`
- Do not modify `os-secret-store.ts`, package manifests, local-runtime, source
  scanning, evidence, UI, ontology truth, provider/OCR, PRR, legal, export,
  publication, or destructive behavior.
- Preserve but do not inspect or reuse any failed Specification 16/16A candidate.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/16-secret-commitment-backend.md`
- `packages/ingestion/src/runtime.ts`

## Risk Lane

Red. This slice fixes a cryptographic public-record boundary, but uses only public
synthetic bytes and a synthetic injected port. Any real key or HMAC operation
remains separately gated in Specification 16A-R2b.

## Targeted Verification

- `npm test -- packages/agent/test/secret-commitment-contract.test.ts`
- `npm test -- packages/ingestion/test/secret-source-commitment.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Every command must exit zero using the existing local dependency installation.
Tests must prove every acceptance example without secret, credential, storage,
provider, network, or live-runtime effects.

## Integration Verification

Update normally against latest local `neo`, obtain a fresh Sol `ship` verdict,
then run `npm run verify` once. Reject candidate-caused new or worsened failures
against the recorded baseline. Integrate with normal Git ancestry. Do not install
dependencies, open a pull request, force-push, or transfer external bytes.

## Escalation Conditions

Escalate for a changed Specification 16 frame/public-record contract, any secret
or real HMAC operation, exported mutation/backend/runtime behavior, unavailable
existing local dependencies, scope outside the four named files, or the same
concrete failure surviving two focused repairs.
