# Specification 16A-R2a-R1 — Trap-Safe Pure Secret Commitment Protocol

Status: approved replacement slice 1 of 2. Execute before Specification 16A-R2b.

## Desired Behavior

Cestus defines the dependency-neutral, key-free protocol layer for exactly
`cestus.source-observation.v1` and `source-manifest-authority.v1`. This slice
contains normative public types, strict hostile-shape normalization, exact binary
frame codecs, and a nonce-owning ingestion service over one injected synthetic
compute/verify port. It creates, selects, stores, rotates, looks up, and uses no real
commitment key and implements no mutation authority or Secret Service adapter.

### Normative public contracts

Implement direct discriminated unions without conditional generic results, `any`,
double casts, or casts that evade profile, record, service, or fake-port
compatibility. Successful records and result objects are new frozen plain exact
own-data objects.

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
  readonly nonceHex: string;
  readonly hmacHex: string;
}

interface ManifestAuthorityCommitmentRecord extends SecretCommitmentKeyReference {
  readonly profile: "source-manifest-authority.v1";
  readonly contractVersion: 1;
  readonly recordClass: "manifest";
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHashHex: string;
  readonly publicManifestIdHex: string;
  readonly hmacHex: string;
}

interface EntryAuthorityCommitmentRecord extends SecretCommitmentKeyReference {
  readonly profile: "source-manifest-authority.v1";
  readonly contractVersion: 1;
  readonly recordClass: "entry";
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceBoundaryRevision: string;
  readonly classificationPolicyHashHex: string;
  readonly publicManifestIdHex: string;
  readonly publicEntryIdHex: string;
  readonly hmacHex: string;
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

Every string ID is a non-empty Unicode scalar-value sequence. UTF-8 encoding and
fatal decoding must reproduce the identical sequence without normalization,
replacement, trimming, or case conversion. Valid non-BMP scalars and distinct NFC
and NFD sequences succeed unchanged. Lone high or low surrogates fail. Hex values
are lowercase ASCII and exactly 64 characters representing 32 bytes; uppercase,
odd, short, long, and non-hex values fail. Key versions are positive safe integers.

### Normative trap-safe shape boundary

All untrusted values are classified before any reflective, iterable, prototype,
descriptor, property, method, buffer, or constructor operation. Both production
files must import the established Node host primitives from `node:util/types`.

- Call `isProxy(value)` before any other operation that could invoke a JavaScript
  Proxy trap. If true, reject immediately. This applies recursively to the outer
  builder/parser/factory/method input, nested `port`, `nextNonce`, both port methods,
  every byte value, every public record, and every port result.
- Accept bytes only when `isProxy(value)` is false, `isUint8Array(value)` is true,
  and `Object.getPrototypeOf(value) === Uint8Array.prototype`. Buffer instances,
  subclasses, altered or cross-realm prototypes, and typed-array Proxies fail.
  Capture `Uint8Array.prototype.slice` once as a trusted intrinsic and call it with
  `Reflect.apply` to create the snapshot inside a fail-closed `try`; do not read or
  invoke caller-controlled `length`, numeric values, `buffer`, `byteLength`,
  `byteOffset`, `slice`, `constructor`, or iterator properties while copying. A
  detached view or intrinsic-copy exception rejects without escaping.
- After the intrinsic snapshot succeeds, inspect the original non-Proxy byte value's
  own descriptors without property reads. Its only allowed own keys are canonical
  decimal indices corresponding exactly to the copied length, and every such member
  must be an enumerable data descriptor. Reject symbols, holes, added string fields,
  and shadowed `length`, `buffer`, `slice`, `constructor`, or iterator members without
  invoking them. All later length and byte reads use only the fresh snapshot.
- Accept an ordinary object only when `isProxy(value)` is false, its prototype is
  exactly `Object.prototype`, every own key is a string in the required set, and
  each own descriptor is enumerable data. Inspect descriptors without reading
  properties. Reject inherited, accessor, symbol, non-enumerable, missing, and extra
  fields. Never fall back to duck typing or `instanceof` for hostile values.
- Accept injected functions only when `typeof value === "function"` and
  `isProxy(value)` is false. Close over the exact validated function references;
  never reread them from caller objects.
- Treat `isProxy` and `isUint8Array` as the trusted host classification seam. Do not
  mock, replace, inject, catch-and-ignore, or provide a reflection fallback for them.

Transparent Proxies and Proxies whose `getPrototypeOf`, `ownKeys`,
`getOwnPropertyDescriptor`, `get`, `has`, `apply`, `construct`, or iterator-related
traps throw or increment counters are rejected with zero trap calls. Builders,
parser, normalizer, factory, and all six service operations return their specified
fail-closed result and never throw for any hostile runtime input.

### Exact frame and record codecs

The codec implements the exact Specification 16 frames. Each frame begins with its
ASCII profile and one NUL. Every field is one unsigned tag byte, exactly eight
unsigned big-endian length bytes, then the declared bytes. Observation tags are
1 workspace ID, 2 source collection ID, 3 boundary revision, 4 manifest entry ID,
5 raw 32-byte nonce, and 6 observed bytes. Manifest tags are 1 ASCII `manifest`,
2 workspace, 3 source, 4 boundary, 5 raw 32-byte policy hash, 6 raw 32-byte public
manifest ID, and 8 protected canonical manifest bytes. Entry replaces the class by
ASCII `entry` and adds tag 7 raw 32-byte public entry ID before tag 8 protected
canonical entry bytes.

The codec exports exactly the required public types plus
`buildSourceObservationFrame`, `buildManifestAuthorityFrame`,
`buildEntryAuthorityFrame`, `parseSecretCommitmentFrame`, and
`normalizeSecretCommitmentPublicRecord`. Beyond those protocol exports it exposes
no key, backend, HMAC, digest, mutation, current-selection, Secret Service,
credential, fallback, or runtime operation.

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

Builders accept only exact inputs and snapshot all bytes before returning. The parser
first classifies and copies the complete frame, then validates the prefix, sole NUL,
tags, lengths, values, and final boundary without partial allocation or partial
results. Unsafe lengths, values larger than remaining bytes, any truncation, and
allocation overflow fail before value allocation. Parsed objects are frozen and
contain new byte copies. Normalization accepts exactly the three public record shapes
and returns new frozen records.

### Nonce-owning ingestion service

The service exports `CreateSecretSourceCommitmentServiceInput`,
`SecretSourceCommitmentService`, and `createSecretSourceCommitmentService`. The
factory input contains exactly a `SecretCommitmentComputePort` and
`nextNonce: () => Promise<Uint8Array>`. A valid factory returns a frozen service with
exactly six own data methods: `computeSourceObservation`,
`verifySourceObservation`, `computeManifestAuthority`,
`verifyManifestAuthority`, `computeEntryAuthority`, and `verifyEntryAuthority`.

The factory and six methods have these complete normative contracts; the superseded
R2a document is not an implementation input:

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
    readonly workspaceId: string;
    readonly sourceCollectionId: string;
    readonly sourceBoundaryRevision: string;
    readonly manifestEntryId: string;
    readonly observedBytes: Uint8Array;
  }): Promise<ComputeCommitmentResult>;
  verifySourceObservation(input: {
    readonly workspaceId: string;
    readonly sourceCollectionId: string;
    readonly sourceBoundaryRevision: string;
    readonly manifestEntryId: string;
    readonly observedBytes: Uint8Array;
    readonly record: SourceObservationCommitmentRecord;
  }): Promise<VerifyCommitmentResult>;
  computeManifestAuthority(input: {
    readonly workspaceId: string;
    readonly sourceCollectionId: string;
    readonly sourceBoundaryRevision: string;
    readonly classificationPolicyHash: Uint8Array;
    readonly publicManifestId: Uint8Array;
    readonly protectedCanonicalManifestBytes: Uint8Array;
  }): Promise<ComputeCommitmentResult>;
  verifyManifestAuthority(input: {
    readonly workspaceId: string;
    readonly sourceCollectionId: string;
    readonly sourceBoundaryRevision: string;
    readonly classificationPolicyHash: Uint8Array;
    readonly publicManifestId: Uint8Array;
    readonly protectedCanonicalManifestBytes: Uint8Array;
    readonly record: ManifestAuthorityCommitmentRecord;
  }): Promise<VerifyCommitmentResult>;
  computeEntryAuthority(input: {
    readonly workspaceId: string;
    readonly sourceCollectionId: string;
    readonly sourceBoundaryRevision: string;
    readonly classificationPolicyHash: Uint8Array;
    readonly publicManifestId: Uint8Array;
    readonly publicEntryId: Uint8Array;
    readonly protectedCanonicalEntryBytes: Uint8Array;
  }): Promise<ComputeCommitmentResult>;
  verifyEntryAuthority(input: {
    readonly workspaceId: string;
    readonly sourceCollectionId: string;
    readonly sourceBoundaryRevision: string;
    readonly classificationPolicyHash: Uint8Array;
    readonly publicManifestId: Uint8Array;
    readonly publicEntryId: Uint8Array;
    readonly protectedCanonicalEntryBytes: Uint8Array;
    readonly record: EntryAuthorityCommitmentRecord;
  }): Promise<VerifyCommitmentResult>;
}
```

Observation compute snapshots its exact input synchronously, obtains exactly one
nonce, snapshots the returned bytes immediately after the await and before any next
await or port call, and rejects a non-32-byte or previously accepted nonce before
port use. Observation verify uses only the normalized record nonce. Manifest and
entry operations never substitute record classes or public IDs. Before verify port
use, compare every record-carried public binding with the normalized request;
payload-only changes delegate so the port may return `mismatch`.

The port is hostile runtime data. Copy a complete frame before each port call. A
computed result is returned only after exact result and record normalization plus
profile, class, nonce, and public-binding checks. R2a-R1 structurally validates but
does not authorize the key reference; R2b owns authority validation. Exact valid,
`mismatch`, `unverifiable/key-lost`, rejection, and allowed unavailable results
propagate. Invalid input, malformed nonce, invalid builder output, malformed port
result, wrong profile/class, or binding substitution returns
`rejected/invalid-record`. A throwing nonce source returns
`unavailable/nonce-unavailable`. A throwing port method returns
`unavailable/backend-unavailable`. No rejected path performs a later port call.

All caller arrays, nonce arrays, frames, records, and port results are untrusted and
are normalized into new snapshots at their first permitted boundary. Later mutation
of any retained source object cannot alter a frame observed by the port, a record
given to verification, or a result returned by the service.

## Observable Acceptance Examples

### Independent exact-byte fixtures

Tests hard-code, without calling any production builder/parser/normalizer to create
an expected value, the complete frames for these inputs:

- Observation: `W`, `S`, `R`, `E`; nonce bytes `00` through `1f`; observed bytes
  `61 00 62`.
- Manifest: `W`, `S`, `R`; policy bytes `20` through `3f`; public manifest bytes
  `40` through `5f`; protected bytes `4d 00`.
- Entry: the manifest bindings plus public entry bytes `60` through `7f`; protected
  bytes `45 00`.

The expected hex literals are respectively:

```text
6365737475732e736f757263652d6f62736572766174696f6e2e76310001000000000000000157020000000000000001530300000000000000015204000000000000000145050000000000000020000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f060000000000000003610062
736f757263652d6d616e69666573742d617574686f726974792e7631000100000000000000086d616e6966657374020000000000000001570300000000000000015304000000000000000152050000000000000020202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f060000000000000020404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f0800000000000000024d00
736f757263652d6d616e69666573742d617574686f726974792e763100010000000000000005656e747279020000000000000001570300000000000000015304000000000000000152050000000000000020202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f060000000000000020404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f070000000000000020606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f0800000000000000024500
```

The synthetic port records exact copied frames and uses queued exact results. Test
expectations compare its frames directly with these literals; they never use a
production builder as an expected-frame oracle.

### Complete hostile and malformed matrix

Table generators must assert all of the following without throws or side effects:

- For each of the three literal frames, truncate at every byte offset from zero
  through final-byte-minus-one. Alter every prefix byte. Delete, duplicate, displace,
  and add a NUL. Remove and duplicate each required tag. Move each tag to every
  noncanonical position. Alter each tag value and insert an unknown tag at every
  field boundary. Append trailing material. Supply each invalid runtime profile and
  pass every valid frame with the other valid profile to prove profile/frame mismatch
  rejection. For authority frames, test empty, altered, case-changed, truncated, and
  extended record-class bytes independently of tag structure.
- For every field, truncate after its tag and after each of its eight length bytes;
  encode a length greater than `Number.MAX_SAFE_INTEGER`, greater than remaining
  bytes, and the all-`ff` overflow value; insert/delete a length byte to prove no
  shorter or longer form. For every fixed 32-byte nonce/hash/public ID field, test
  lengths 0, 31, 33, and an overflowing declaration.
- For every ID field, test empty bytes, every malformed UTF-8 family (unexpected
  continuation, truncated multibyte, overlong, UTF-8 surrogate, and above U+10FFFF),
  and valid ASCII, embedded NUL, non-BMP, NFC, and distinct NFD round trips. Builder
  inputs reject lone high/low surrogates and preserve valid scalar sequences.
- For each builder input, parser profile/frame argument, normalizer input, factory,
  service method, public record class, and port-result union member, test null, array,
  non-plain prototype, inherited field, every missing field, every extra field,
  enumerable and non-enumerable symbols, every non-enumerable string field, and an
  accessor in every field position whose counter remains zero. Test transparent and
  throwing/counter Proxy wrappers for the outer object and every nested object,
  function, record, result, and byte field; all Proxy trap counters remain zero.
- For every byte-bearing argument and nested byte field, reject Buffer, a Uint8Array
  subclass, an altered-prototype Uint8Array, a transferred/detached Uint8Array, and a
  typed-array Proxy. Add own throwing/counter accessors for `length`, `buffer`,
  `byteLength`, `byteOffset`, `slice`, `constructor`, and `Symbol.iterator`, plus an
  extra string or symbol member; reject with every counter zero. The real trusted
  `isProxy`/`isUint8Array` imports are not mocked. A normal zero-length or populated
  exact Uint8Array still snapshots successfully through the captured intrinsic.
- For each record class and each 32-byte hex member, test uppercase, odd, short,
  long, and non-hex text. Test zero, negative, fractional, unsafe, infinite, and NaN
  key versions; empty/lone-surrogate IDs; wrong profile/contract/class; every
  missing/extra member; manifest presence of `publicEntryIdHex` or
  `manifestEntryId`; and entry absence of `publicEntryIdHex`.
- For every compute/verify result variant, accept only its exact own-data shape and
  allowed reason. Reject missing/extra/accessor/symbol/proxy results. For computed
  results, independently substitute profile, class, nonce, each public binding, and
  each valid-but-different key reference. Only the last remains structurally valid in
  R2a-R1. For each verify method, substitute every public binding before port use and
  change only its payload to prove normal delegation and possible `mismatch`.

### Barrier-paused snapshot matrix

Use explicit deferred barriers in the synthetic nonce source and port, not timing
sleeps. Prove separately that:

1. each method snapshots all request arrays and the verify record synchronously
   before its first await or port call;
2. observation compute snapshots the resolved nonce before the port call;
3. the port receives a new frame copy and a normalized record copy, so mutation by
   the caller or port cannot alter service-owned state;
4. a mutable port-result object and computed record are normalized into new frozen
   objects before return, and later mutation of the retained result cannot change the
   returned value; and
5. two concurrently pending observation computes with independent nonce resolutions
   cannot observe one another's mutable inputs, and an equal nonce content is
   reserved by an atomic synchronous check-and-add section before either port call,
   so exactly one is accepted by one service instance even when both nonce promises
   resolve in the same turn. Once reserved, that nonce remains consumed even if its
   later builder or port result rejects or is unavailable.

All six methods round trip through a `SecretCommitmentComputePort` fake implemented
without `any`, double casts, profile-narrower parameters, or production-code fixture
oracles. Tests assert no real key, HMAC, credential, store, provider, network,
filesystem source, evidence, runtime, socket, PRR, legal, export, or destructive
operation occurs.

## Allowed Scope

- `packages/agent/src/secret-commitment-contract.ts`
- `packages/agent/test/secret-commitment-contract.test.ts`
- `packages/ingestion/src/secret-source-commitment.ts`
- `packages/ingestion/test/secret-source-commitment.test.ts`
- The two production files may import only the established Node host classifiers
  from `node:util/types` and the named in-repository protocol dependency. No package
  manifest or dependency change is allowed.
- Do not modify `os-secret-store.ts`, local-runtime, source scanning, evidence, UI,
  ontology truth, provider/OCR, PRR, legal, export, publication, or destructive
  behavior.
- Preserve but do not inspect, reuse, merge, amend, or push any failed Specification
  16/16A candidate.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/16-secret-commitment-backend.md`
- established trap-safe examples in `packages/agent/src/domain-execution-dispatcher.ts`
  and `packages/agent/src/resident-loop-tool-gateway.ts`
- `packages/ingestion/src/runtime.ts`

## Risk Lane

Red. This defines a cryptographic public-record and hostile-input boundary using only
public synthetic bytes and a synthetic port. Any real key, HMAC, credential, Secret
Service, fallback storage, or runtime action remains separately gated in 16A-R2b or
later slices.

## Targeted Verification

- `npm test -- packages/agent/test/secret-commitment-contract.test.ts`
- `npm test -- packages/ingestion/test/secret-source-commitment.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Every command must exit zero using the existing local dependency installation. Tests
must prove every acceptance example without external byte transfer or live action.

## Integration Verification

Update normally against latest local `neo`, obtain a fresh Sol `ship` verdict, then
run `npm run verify` exactly once. Reject candidate-caused new or worsened failures
against the recorded latest-neo baseline. Integrate with normal Git ancestry. Do not
install dependencies, open a pull request, force-push, push while external transfer
is prohibited, or perform any live action.

## Escalation Conditions

Escalate for a changed Specification 16 frame or public-record contract; unavailable
trusted Node host classifiers; any dependency/package change; any real key, HMAC,
credential, store, provider, network, runtime, or external action; scope outside the
four implementation files; or the same concrete failure surviving two focused
repairs.
