# Specification 16A-R2a-R2.2 — Trap-Safe Bytes And Exact Frame Codecs

> **Development authority:** This is a non-authoritative product-requirement
> source. Historical status, execution, role, risk, repair, review, integration,
> and verification text below does not govern current work. Follow \`AGENTS.md\`,
> Compound Engineering, and \`SECURITY.md\`.

Status: superseded by approved replacement Specifications 16A-R2a-R2.2a-R1,
16A-R2a-R2.2b, and 16A-R2a-R2.2c.

This document is not implementation input. Its approved exports, literal frames,
selected limits, fixed non-shared backing policy, product requirements, and safety
invariants are allocated without weakening across the three replacements. The failed
R2.2/R2.2a candidates and checkpoints are history only and must not
be inspected, reused, copied, cherry-picked, merged, amended, or pushed.

## Desired Behavior

After R2.1 integration, Cestus adds trap-safe byte snapshots, the three exact
Specification 16 frame builders, and the exact parser to the integrated agent
contract. It changes no public record or result type and contains no ingestion,
key, HMAC, backend, or runtime behavior.

The frame begins with the exact ASCII profile and one NUL. Each field is one tag,
eight unsigned big-endian length bytes, then the declared bytes. Observation tags:
1 workspace, 2 source, 3 boundary, 4 manifest entry, 5 raw 32-byte nonce, 6 observed
bytes. Manifest tags: 1 ASCII `manifest`, 2 workspace, 3 source, 4 boundary, 5 raw
32-byte policy hash, 6 raw 32-byte public manifest ID, 8 protected bytes. Entry uses
ASCII `entry` and adds tag 7 raw 32-byte public entry ID before tag 8.

Exports added in this slice are exactly these contracts and functions:

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

type ParsedSecretCommitmentFrame =
  | (Readonly<SourceObservationFrameInput> & {
      readonly profile: "cestus.source-observation.v1";
    })
  | (Readonly<ManifestAuthorityFrameInput> & {
      readonly profile: "source-manifest-authority.v1";
      readonly recordClass: "manifest";
    })
  | (Readonly<EntryAuthorityFrameInput> & {
      readonly profile: "source-manifest-authority.v1";
      readonly recordClass: "entry";
    });

function buildSourceObservationFrame(
  input: unknown
): Uint8Array | undefined;
function buildManifestAuthorityFrame(
  input: unknown
): Uint8Array | undefined;
function buildEntryAuthorityFrame(
  input: unknown
): Uint8Array | undefined;
function parseSecretCommitmentFrame(
  frame: unknown
): ParsedSecretCommitmentFrame | undefined;
```

Every builder rejects the outer value through one shared exact-object classifier.
It calls the real `node:util/types.isProxy` first and returns `undefined` for a Proxy
without invoking any Proxy trap. Only a non-null, non-array, non-Proxy value with
exactly `Object.prototype`, exactly the member names shown above as own enumerable
data properties, and no own symbols is accepted. Prototype, own-key, and descriptor
reflection occurs only after Proxy rejection. Missing, extra, inherited, accessor,
symbol, or non-enumerable members reject; descriptor values are used directly, so
the builder never performs a property read or invokes an accessor. All builders,
parsers, classifiers, and copy/allocation seams catch hostile or intrinsic failures
and return `undefined`, never throw.

Byte input classification uses real `node:util/types.isProxy` and `isUint8Array`.
Reject Proxy first, then require exact `Uint8Array.prototype`. Reject Buffer,
subclass, altered/cross-realm prototype, detached view, extra own string/symbol,
shadowed property, or noncanonical index descriptor without property/trap/accessor
execution. Snapshot using captured `%TypedArray%.prototype.length`, descriptor
preflight, fresh captured `Uint8Array`, and captured `Uint8Array.prototype.set` via
`Reflect.apply`; never use species `slice`, iteration, spread, `Array.from`,
`instanceof`, or caller `length`, buffer, constructor, iterator, slice, or set.

Only canonical Uint8Arrays backed by a fixed, non-shared `ArrayBuffer` are accepted.
Use the captured `%TypedArray%.prototype.buffer` getter and trusted intrinsic backing-
store classifiers/getters after Proxy rejection; never read caller `buffer` or backing-
store properties. Reject every `SharedArrayBuffer` backing, including a growable or
fixed shared backing. Reject every resizable/growable backing, including a fixed-
length view over a resizable buffer. Backing-store classification failure rejects.

Parser first performs the same Proxy-first canonical-Uint8Array classification and
obtains only the trusted intrinsic internal byte length. Before allocating or copying
any frame byte, it rejects a complete frame length over the selected complete-frame
ceiling. It then snapshots the complete accepted frame, validates the canonical
prefix/NUL and tag structure before decoding record class or allocating field copies,
rejects payload-ceiling, unsafe, overflowing, or remaining-byte lengths before field
allocation, and catches every allocation/copy failure. It returns only a frozen exact
discriminated member with fresh arrays.

### Selected resource and backing-buffer policy

The maximum accepted tag-6/tag-8 payload is exactly `8_388_608` bytes. The maximum
accepted complete frame is exactly `8_454_144` bytes. These are internal normative
limits, not additional exports.

Builders obtain trusted intrinsic byte lengths before snapshotting. A payload length
above `8_388_608` rejects before payload snapshot/allocation. Builders compute the
complete canonical frame length with checked safe-integer arithmetic and reject a
length above `8_454_144` before allocating the complete frame. The parser obtains the
trusted intrinsic frame length and rejects above `8_454_144` before snapshotting or
allocating any frame byte; after structural length decoding, tag 6 or 8 above
`8_388_608` rejects before field allocation. Equal-to-limit values remain permitted.

Every `SharedArrayBuffer`-backed view and every view over a resizable/growable backing
buffer is rejected, including fixed-length views. No concurrent, pointwise, or atomic
snapshot semantics are authorized. Only canonical Uint8Arrays backed by fixed,
non-shared ArrayBuffers can proceed to descriptor preflight and snapshot.

These selected values and rejection semantics require a fresh Sol review before any
test or product edit.

## Observable Acceptance Examples

- Independent literal fixtures use inputs `W/S/R/E`, nonce `00..1f`, observed
  `61 00 62`; policy `20..3f`, manifest ID `40..5f`, manifest payload `4d 00`; entry
  ID `60..7f`, entry payload `45 00`. Expected values are these literal hex strings,
  stored directly in tests and never generated by production builders:

  - observation:
    `6365737475732e736f757263652d6f62736572766174696f6e2e76310001000000000000000157020000000000000001530300000000000000015204000000000000000145050000000000000020000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f060000000000000003610062`
  - manifest:
    `736f757263652d6d616e69666573742d617574686f726974792e7631000100000000000000086d616e6966657374020000000000000001570300000000000000015304000000000000000152050000000000000020202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f060000000000000020404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f0800000000000000024d00`
  - entry:
    `736f757263652d6d616e69666573742d617574686f726974792e763100010000000000000005656e747279020000000000000001570300000000000000015304000000000000000152050000000000000020202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f060000000000000020404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f070000000000000020606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f0800000000000000024500`
- Before product implementation, a requirement-to-generator inventory compiles
  against undefined-return builder/parser stubs and meaningfully fails valid-fixture
  assertions. Primary inspects asserted generated counts.
- For all three literals: every cut before the final byte rejects; every prefix-byte
  mutation rejects; NUL delete/duplicate/displace/add rejects; each tag removal,
  duplicate, alteration, move to each noncanonical slot, and unknown insertion at
  every field boundary rejects; trailing bytes reject.
- Each field rejects truncation after tag and after each of eight length bytes,
  greater-than-safe, greater-than-remaining, and all-`ff` lengths plus inserted or
  deleted length bytes. Fixed fields reject lengths 0, 31, 33, overflow. Runtime
  invalid profiles and profile/frame swaps reject. Authority class empty, changed
  case, altered, truncated, and extended values reject.
- ID bytes cover ASCII, embedded NUL, non-BMP, NFC, distinct NFD, empty, unexpected
  continuation, truncated multibyte, overlong, surrogate encoding, and above
  U+10FFFF. Builder IDs reject lone surrogates.
- Each builder's outer input matrix covers null, array, Proxy, wrong prototype,
  inherited, missing, extra, symbol, non-enumerable, and accessor members. Proxy traps
  and accessors remain at zero calls. Every byte-bearing builder/parser field rejects
  Buffer, subclass, altered
  prototype, detached view, Proxy, extras, symbols, and shadowed accessors with zero
  trap/accessor calls. Normal zero/populated exact bytes snapshot. Tests exercise the
  selected shared/resizable rejection policy and both resource ceilings exactly at
  minus one, equal, and plus one. Tests include fixed and length-tracking views over a
  resizable ArrayBuffer when the runtime supports them, fixed and growable
  SharedArrayBuffer backing when supported, and ordinary fixed ArrayBuffer controls.
- Builders snapshot caller bytes and parser results contain independent arrays.
  Allocation and intrinsic-copy failure seams return `undefined`, never throw.

## Allowed Scope

- `packages/agent/src/secret-commitment-contract.ts`
- `packages/agent/test/secret-commitment-contract.test.ts`
- Consume but do not weaken R2.1 records/tests. No ingestion, manifest/config,
  dependency, key, HMAC, backend, runtime, provider, storage, evidence, UI, PRR,
  legal, export, or destructive behavior.
- Do not inspect, reuse, copy, cherry-pick, merge, amend, or push failed candidates.

## Relevant Context Entry Points

- factory authority files; this specification; Specification 16 umbrella; integrated
  R2.1 source/test; established trap-safe Node classifier examples.

## Risk Lane

Red. This is a hostile byte/cryptographic frame boundary using public synthetic bytes.

## Targeted Verification

- `npm test -- packages/agent/test/secret-commitment-contract.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

## Integration Verification

After fresh-Sol approval of the selected policy, implementation, and focused checks,
update local `neo`, obtain fresh Sol `ship`, run `npm run verify` exactly once, and
integrate only without candidate-caused regression. No install, push, external
transfer, or live action.

## Escalation Conditions

Escalate for changed frames/records/selected limits/backing policy, missing trusted
classifiers, scope beyond two files, real secret/external action, `GAPS`, or the same
failure after two focused repairs.
