# Specification 16A-R2a-R2.2b — Exact Secret Commitment Frame Builders

Status: approved replacement slice 2 of 3 for superseded R2.2. Execute only after
R2.2a integrates.

## Desired Behavior

Cestus adds the three exact public frame-input contracts and builders to the integrated
agent contract. Builders consume but do not modify the R2.2a byte module. This slice
contains no parser, public-record change, ingestion, key, HMAC, backend, or runtime.

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

function buildSourceObservationFrame(input: unknown): Uint8Array | undefined;
function buildManifestAuthorityFrame(input: unknown): Uint8Array | undefined;
function buildEntryAuthorityFrame(input: unknown): Uint8Array | undefined;
```

The observation prefix is exact ASCII `cestus.source-observation.v1` plus NUL. Its
ascending fields are tag 1 workspace ID UTF-8, 2 source-collection ID UTF-8, 3 source
boundary revision UTF-8, 4 manifest-entry ID UTF-8, 5 raw 32-byte nonce, and 6 exact
observed bytes. The authority prefix is exact ASCII `source-manifest-authority.v1`
plus NUL. Tag 1 is ASCII `manifest` or `entry`; tags 2–4 are the three IDs; tag 5 is
raw 32-byte policy hash; tag 6 raw 32-byte public manifest ID; entry alone has tag 7
raw 32-byte public entry ID; tag 8 is the exact protected payload. Each field is one
tag byte, eight unsigned big-endian length bytes, then value bytes.

Each builder first uses one shared Proxy-first exact-object classifier. It accepts only
a non-null, non-array, non-Proxy exact `Object.prototype` object with exactly the shown
own enumerable data members and no symbols. It uses descriptor values, never property
reads. Missing, extra, inherited, accessor, symbol, or non-enumerable members reject
without traps/accessors. At module evaluation it captures the trusted
`node:util/types.isProxy`, `Array.isArray`, exact `Object.prototype`,
`Object.getPrototypeOf`, `Reflect.ownKeys`, and
`Object.getOwnPropertyDescriptor`. Missing/malformed captured intrinsics or any
classifier/reflection exception returns `undefined`; builders never use a live,
caller-controlled, or fallback classifier/reflection path.

IDs are non-empty Unicode scalar-value sequences with identical UTF-8 fatal round trip
and no normalization, replacement, trimming, or case change. Compute scalar UTF-8 byte
lengths with checked arithmetic without allocating encoded ID arrays. Reject lone
surrogates. Before any byte snapshot, frame allocation, encoding, or copy, call
R2.2a's trusted no-copy length helper for every fixed and payload field, then combine
those trusted lengths with prefix/header/class/ID lengths using checked arithmetic.
Reject a complete length above `8_454_144` at that point. Only an accepted complete
length permits R2.2a snapshots of every byte field; payload above `8_388_608` and
fixed fields not exactly 32 have already rejected through the length helper. Equal
limits are accepted. Write valid scalar strings directly into the allocated frame
with captured `TextEncoder.prototype.encodeInto`; write headers and copied bytes with
captured intrinsics. Catch classifier/reflection/encoding/allocation/copy failure and
return undefined.

Independent exact fixtures are literal test values, never production-generated:

- observation:
  `6365737475732e736f757263652d6f62736572766174696f6e2e76310001000000000000000157020000000000000001530300000000000000015204000000000000000145050000000000000020000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f060000000000000003610062`
- manifest:
  `736f757263652d6d616e69666573742d617574686f726974792e7631000100000000000000086d616e6966657374020000000000000001570300000000000000015304000000000000000152050000000000000020202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f060000000000000020404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f0800000000000000024d00`
- entry:
  `736f757263652d6d616e69666573742d617574686f726974792e763100010000000000000005656e747279020000000000000001570300000000000000015304000000000000000152050000000000000020202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f060000000000000020404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f070000000000000020606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f0800000000000000024500`

## Observable Acceptance Examples

- A complete test-first inventory compiles against undefined-return builder stubs;
  R2.1 and R2.2a stay green while exact literals and valid controls fail meaningfully.
- All three literal builders produce exactly 122, 169, and 207 bytes matching the
  literal hex above.
- Every builder outer member is generated as missing, extra, inherited,
  non-enumerable, accessor, symbol, wrong type, and Proxy; asserted counts and zero
  trap/accessor calls prove the exact boundary.
- Every ID occurrence accepts ASCII, embedded NUL, non-BMP, NFC, and distinct NFD;
  rejects empty, lone high/low surrogate, and non-string values. Inputs snapshot
  synchronously; later caller byte/string/object mutation cannot alter the frame.
- Fixed fields accept exactly 32 bytes and reject 0, 31, 33, and above. Payloads accept
  zero/populated fixed canonical views and reject payload limit plus one. Each builder
  exercises payload and complete-frame minus one/equal/plus one using independent
  expected length calculations.
- Across all nine byte-field occurrences (two observation, three manifest, four
  entry), generate Buffer, Uint8Array subclass, altered/cross-realm prototype,
  detached backing, transparent/throwing Proxy, SharedArrayBuffer-backed, and
  resizable/growable-backed cases. Every supported fixed-length and length-tracking
  backing form rejects. Counts are asserted per builder and per field; feature
  branches assert their supported-case counts and never silently omit one.
- Frame allocation, encodeInto, and copied-field write failures return undefined
  without throw. Dynamic module seams make each captured outer classifier/reflection
  operation throw and prove `undefined` without accessor/Proxy invocation. An
  over-limit frame proves zero byte-snapshot allocation/copy, frame-allocation,
  encoding, or copied-field-write calls; an equal-limit frame reaches those seams.
  Production builders never read caller byte properties or reclassify through a
  fallback path.

## Allowed Scope

- `packages/agent/src/secret-commitment-contract.ts`
- `packages/agent/test/secret-commitment-contract.test.ts`
- Consume but do not modify integrated R2.1 and R2.2a source/tests.
- No parser, ingestion, package/config/barrel, key/HMAC/backend/runtime/provider/store,
  evidence/UI/PRR/legal/export/destructive/external/live behavior.
- Preserve but do not inspect, reuse, copy, cherry-pick, merge, amend, or push the
  failed R2.2 candidate at `db1c3404`, its checkpoint `0be31114`, or any earlier
  Specification 16 candidate.

## Relevant Context Entry Points

- factory authority files; this specification; Specification 16 frame contract;
  integrated R2.1 and R2.2a source/tests.

## Risk Lane

Red. This constructs cryptographic public frames from synthetic bytes only; no real
secret or external action is authorized.

## Targeted Verification

- `npm test -- packages/agent/test/secret-commitment-contract.test.ts`
- `npm test -- packages/agent/test/secret-commitment-bytes.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Primary accepts the complete asserted red inventory before product behavior. All exit
zero after implementation using existing dependencies.

## Integration Verification

Update latest local `neo`, obtain fresh Sol `ship`, run `npm run verify` exactly once,
and integrate only without candidate-caused regression. No install, push, external
transfer, or live action.

## Escalation Conditions

Escalate for changed frames/exports/limits/backing policy, changes to R2.2a, scope
beyond two files, real secret/external action, `GAPS`, or the same failure after two
focused repairs.
