# Specification 16A-R2a-R2.2c — Exact Secret Commitment Frame Parser

Status: approved replacement slice 3 of 3 for superseded R2.2. Execute only after
R2.2a and R2.2b integrate.

## Desired Behavior

Cestus adds the exact parser and parsed-frame union to the integrated public agent
contract. It consumes but does not modify R2.1 records, R2.2a bytes, or R2.2b builders.

```ts
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

function parseSecretCommitmentFrame(
  frame: unknown
): ParsedSecretCommitmentFrame | undefined;
```

The accepted frames are exactly the R2.2b observation, manifest, and entry frame
formats and literal bytes. The parser first calls R2.2a's frame snapshot. Therefore a
Proxy, noncanonical view/backing, detached view, or trusted length over `8_454_144`
rejects before frame allocation/copy. It recognizes only the two exact ASCII prefixes
and one NUL; validates complete canonical tag order/count and every eight-byte
unsigned big-endian length before decoding class or IDs or allocating field copies;
and rejects unsafe, overflowing, greater-than-remaining, payload-over-limit, fixed-
width, truncated, duplicate, missing, unknown, moved, or trailing data.

Only after structural validation, decode ID fields with a captured fatal UTF-8
TextDecoder. Each must be non-empty and re-encode identically without normalization,
replacement, trimming, or case change. Authority class bytes must be exact ASCII
`manifest` or `entry`. Copy byte fields into fresh fixed, non-shared ArrayBuffers with
captured intrinsics, then return a new frozen exact plain discriminated object. No
returned byte array aliases the input frame or another returned field. Every decode,
allocation, or copy failure returns undefined, never throws.

The three independent literal fixtures are copied verbatim from R2.2b into tests; the
parser test never calls a production builder to create expected input or output.

## Observable Acceptance Examples

- Before parser behavior, an asserted requirement-to-generator inventory compiles
  against an undefined-return parser stub. Integrated R2.1/R2.2a/R2.2b remain green;
  exact literals, valid UTF-8, valid limits, and snapshots fail meaningfully.
- All three literal frames parse to exact frozen plain objects with exact own keys,
  profile/class/IDs, and fresh byte arrays. Input mutation after synchronous return
  changes nothing parsed; result arrays have independent buffers.
- Literal lengths are 122/169/207. Every cut before the final byte rejects (498).
  Every ASCII prefix-byte mutation rejects (84). NUL delete/duplicate/displace/add,
  and trailing bytes reject for each literal.
- Across all 21 fields generate and assert: removal (21), duplication (21), tag
  alteration (21), move to every noncanonical slot (128), unknown insertion at every
  field boundary (24), truncation after tag and each of eight length bytes (189),
  greater-than-safe/greater-than-remaining/all-ff lengths (63), and inserted/deleted
  length bytes (42). Six fixed fields reject lengths 0/31/33/overflow (24).
- Profile/frame swaps reject. Manifest/entry classes reject empty, changed case,
  altered, truncated, and extended bytes. Each ID occurrence covers ASCII, embedded
  NUL, non-BMP, NFC, distinct NFD, empty, unexpected continuation, truncated
  multibyte, overlong, surrogate encoding, and above U+10FFFF.
- Parser input repeats R2.2a hostile view/backing controls at the public boundary with
  zero trap/accessor calls. Complete-frame and tag-6/tag-8 payload limits are tested at
  minus one/equal/plus one; plus one proves no snapshot/field allocation/copy at the
  prohibited stage.
- Fresh dynamic module loads prove fatal decoder, result-field allocation, and
  intrinsic-copy failures return undefined without throwing. No expected value is
  produced by a production builder, parser, or normalizer.

## Allowed Scope

- `packages/agent/src/secret-commitment-contract.ts`
- `packages/agent/test/secret-commitment-contract.test.ts`
- Consume but do not modify integrated R2.1, R2.2a, or R2.2b source/tests.
- No builder/frame change, ingestion, package/config/barrel, key/HMAC/backend/runtime,
  provider/store/network/evidence/UI/PRR/legal/export/destructive/live behavior.
- Preserve but do not inspect, reuse, copy, cherry-pick, merge, amend, or push the
  failed R2.2 candidate at `db1c3404`, its checkpoint `0be31114`, or any earlier
  Specification 16 candidate.

## Relevant Context Entry Points

- factory authority files; this specification; Specification 16 frame contract;
  integrated R2.1/R2.2a/R2.2b source/tests.

## Risk Lane

Red. This parses hostile public bytes at a cryptographic frame boundary; no real secret
or external action is authorized.

## Targeted Verification

- `npm test -- packages/agent/test/secret-commitment-contract.test.ts`
- `npm test -- packages/agent/test/secret-commitment-bytes.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Primary accepts the complete asserted red matrix before parser behavior. All exit zero
after implementation using existing dependencies.

## Integration Verification

Update latest local `neo`, obtain fresh Sol `ship`, run `npm run verify` exactly once,
and integrate only without candidate-caused regression. No install, push, external
transfer, or live action.

## Escalation Conditions

Escalate for changed frames/exports/limits/backing policy, changes to integrated prior
slices, scope beyond two files, real secret/external action, `GAPS`, or the same
failure after two focused repairs.
