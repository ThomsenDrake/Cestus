# Specification 16A-R2a-R2.1 — Public Records And Exact Normalization

Status: approved replacement record slice. Execute before R2.2a.

## Desired Behavior

Cestus defines the key-free public types and exact runtime normalization for the two
closed commitment profiles. This slice contains no byte snapshot, frame builder,
parser, ingestion service, key, HMAC, backend, or runtime behavior.

`packages/agent/src/secret-commitment-contract.ts` exports direct, non-generic types:

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

function normalizeSecretCommitmentPublicRecord(
  value: unknown
): SecretCommitmentPublicRecord | undefined;
```

Every ID is a non-empty Unicode scalar-value sequence. UTF-8 encode/fatal-decode
round trips identically without normalization, replacement, trimming, or case change.
Valid non-BMP, embedded NUL, NFC, and distinct NFD sequences succeed; lone surrogates
fail. Every hex member is lowercase ASCII, exactly 64 characters/32 decoded bytes.
Key versions are positive safe integers.

Normalization calls the real `node:util/types.isProxy` before any trap-capable
operation. A value succeeds only when it is non-null, non-array, non-Proxy, has
exactly `Object.prototype`, contains exactly the required own string keys, and every
required descriptor is enumerable data. Descriptor values are copied without
property reads. Accessors are never invoked. Symbols, non-enumerable, inherited,
missing, extra, wrong-profile/class/version, or invalid-field values fail.

Successful output is a new frozen plain exact own-data object. Implement three typed
normalizers and a typed common-record helper; do not use `any`, generic result types,
`Function`, `as string`, `as number`, double casts, or record/profile compatibility
evasion. Literal `as const` discriminants are unnecessary when construction narrows
directly.

## Observable Acceptance Examples

- One exact fixture for each record class normalizes to an equal but distinct frozen
  plain object. Mutating the caller afterward changes nothing returned.
- A requirement-to-generator inventory names every record field. For each class,
  generated tests remove each field, add each forbidden field, make each field
  non-enumerable, replace each field by an accessor with a zero-call counter, add
  enumerable/non-enumerable symbols, change the prototype, inherit a field, wrap the
  outer value in transparent and throwing/counter Proxies, and assert `undefined`
  without throws or trap/accessor calls. Generated case counts are asserted.
- Every ID field accepts ASCII, embedded NUL, non-BMP, NFC, and distinct NFD, and
  rejects empty, lone high surrogate, and lone low surrogate values.
- Every hex field rejects uppercase, odd, 62-character, 66-character, and non-hex
  text. Key versions reject zero, negative, fractional, unsafe, infinite, and NaN.
- Profile, contract version, and record class substitutions fail. Manifest records
  reject `manifestEntryId` and `publicEntryIdHex`; entry records require
  `publicEntryIdHex` and reject `manifestEntryId`; observation records reject
  authority-only fields.
- Compile-time fixtures prove direct `SecretCommitmentComputePort`, compute-result,
  and verify-result compatibility without casts or profile-narrower parameters.
- Before production implementation, the complete record/shape generator suite must
  compile against an exported normalizer scaffold and fail meaningful valid-fixture
  assertions. Primary Sol inspects the inventory, generated counts, and red output;
  missing coverage is a sizing exception, not repair work.

## Allowed Scope

- `packages/agent/src/secret-commitment-contract.ts`
- `packages/agent/test/secret-commitment-contract.test.ts`
- No byte helper, frame codec, parser, ingestion service, package/config/barrel, key,
  HMAC, backend, runtime, provider, storage, evidence, UI, PRR, legal, export, or
  destructive behavior.
- Preserve and do not inspect, reuse, copy, cherry-pick, merge, amend, or push any
  failed Specification 16/16A candidate.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/16-secret-commitment-backend.md`
- `packages/agent/src/domain-execution-dispatcher.ts` only for trap-safe exact-object
  convention.

## Risk Lane

Red. This fixes a cryptographic public-record trust boundary using only public
synthetic values; no real secret action is authorized.

## Targeted Verification

- `npm test -- packages/agent/test/secret-commitment-contract.test.ts`
- `npm run typecheck`
- `npm run factory:check`

Each exits zero using existing dependencies. Primary must inspect the complete test
inventory before accepting product implementation.

## Integration Verification

Update against latest local `neo`, obtain a fresh Sol `ship`, then run
`npm run verify` exactly once and reject candidate-caused regression. Integrate with
normal ancestry. No dependency install, push, external transfer, or live action.

## Escalation Conditions

Escalate for changed Specification 16 public records, missing trusted host classifier,
scope outside the two files, any real secret/external action, a `GAPS` handoff, or the
same concrete failure surviving two focused repairs.
