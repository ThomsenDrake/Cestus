# Specification 16A-R2a-R2.2a — Trap-Safe Canonical Bytes

> **Development authority:** This is a non-authoritative product-requirement
> source. Historical status, execution, role, risk, repair, review, integration,
> and verification text below does not govern current work. Follow \`AGENTS.md\`,
> Compound Engineering, and \`SECURITY.md\`.

Status: superseded by approved Specification 16A-R2a-R2.2a-R1.

This document is not implementation input. R2.2a-R1 preserves both package-internal
functions, the closed limit type, exact limits, fixed non-shared backing policy,
scope, dependencies, and safety invariants while strengthening mandatory output
postcondition and test-oracle coverage. Failed R2.2a commits are history only and
must not be inspected, reused, copied, cherry-picked, merged, amended, or pushed.

## Desired Behavior

Cestus adds one package-internal canonical-byte snapshot module. It accepts only exact
Uint8Arrays backed by fixed, non-shared ArrayBuffers, enforces the selected fixed,
payload, and frame limits before allocation/copy, and returns a fresh snapshot. It
contains no frame prefix, tag, length codec, parser, public-record change, ingestion,
key, HMAC, backend, runtime, or public barrel export.

`packages/agent/src/secret-commitment-bytes.ts` exports only these package-internal
contracts for direct sibling-module use:

```ts
type SecretCommitmentByteLimit = 32 | 8_388_608 | 8_454_144;

function trustedCanonicalSecretCommitmentByteLength(
  value: unknown,
  maximumLength: SecretCommitmentByteLimit
): number | undefined;

function snapshotCanonicalSecretCommitmentBytes(
  value: unknown,
  maximumLength: SecretCommitmentByteLimit
): Uint8Array | undefined;
```

Neither symbol is re-exported from an agent barrel. Callers cannot supply any other
limit. `32` is the exact fixed-field length, not merely a maximum: the length helper
and snapshot reject values other than 32 when that limit is selected. The other two
limits are inclusive maxima.

At module evaluation, capture the real `node:util/types.isProxy`, `isUint8Array`,
`isAnyArrayBuffer`, and `isSharedArrayBuffer`; exact `Uint8Array.prototype`;
`%TypedArray%.prototype.length` and `.buffer` getters; `ArrayBuffer.prototype.resizable`
getter; `Reflect.apply`; `Reflect.ownKeys`; `Object.getPrototypeOf` and
`Object.getOwnPropertyDescriptor`; the `Uint8Array` constructor; and
`Uint8Array.prototype.set`. Missing or malformed required intrinsics fail closed at
call time without a fallback classifier or copy path.

Classification calls captured `isProxy` before every trap-capable operation. It then
requires captured `isUint8Array`, exact `Uint8Array.prototype`, a backing object that
captured classifiers prove is an ArrayBuffer and not SharedArrayBuffer, and captured
`resizable` getter result exactly `false`. Every SharedArrayBuffer backing rejects,
including fixed/growable and fixed-length/length-tracking views. Every resizable
ArrayBuffer backing rejects, including a fixed-length view. Detached views reject.
Never read caller `length`, `buffer`, constructor, iterator, slice, set, or any other
property.

The trusted intrinsic length is checked against the selected rule before `Reflect.ownKeys`,
snapshot allocation, or copy. Descriptor preflight then accepts exactly the canonical
integer index keys `0` through `length - 1`, with no extra own string or symbol key,
and canonical enumerable writable data descriptors containing the corresponding byte
value. It never invokes an accessor. Snapshot allocation uses the captured constructor,
then the captured intrinsic set with `Reflect.apply`. Every classifier, reflection,
allocation, or copy failure returns `undefined`, never throws.

## Observable Acceptance Examples

- The complete test-first inventory compiles against undefined-return stubs and has
  meaningful red valid-snapshot assertions before production behavior begins.
- Fixed, non-shared, non-resizable canonical Uint8Arrays of length 0, 1, 31, 32,
  `8_388_607`, `8_388_608`, `8_454_143`, and `8_454_144` exercise the applicable
  closed limit. Length 33 rejects for rule 32; payload/frame plus one rejects.
- Buffer, subclass, altered/cross-realm prototype, detached view, transparent and
  throwing Proxy, enumerable/non-enumerable extra string or symbol, shadowed
  `length`, `buffer`, `constructor`, `slice`, `set`, or `Symbol.iterator`, and every
  constructible noncanonical index descriptor reject without trap/accessor calls.
- Fixed and length-tracking views over resizable ArrayBuffer reject. Fixed and
  growable SharedArrayBuffer backing, including fixed-length and length-tracking
  views, reject when the runtime supports them. Feature branches assert their count;
  they never silently omit a supported case.
- Returned bytes are a fresh ArrayBuffer-backed copy. Caller mutation after return
  does not change it, and result mutation does not change the caller.
- Fresh dynamic module loads with a throwing captured constructor or captured set
  return `undefined` without throwing. Plus-one fixed/payload/frame inputs prove zero
  allocation/copy calls; equal inputs reach the instrumented seam. These tests restore
  every global/intrinsic deterministically.

## Allowed Scope

- `packages/agent/src/secret-commitment-bytes.ts`
- `packages/agent/test/secret-commitment-bytes.test.ts`
- No change to `secret-commitment-contract.ts`, its test, barrels, package/config,
  ingestion, key/HMAC/backend/runtime/provider/storage/network/evidence/UI/PRR/legal,
  or any live action.
- Preserve but do not inspect, reuse, copy, cherry-pick, merge, amend, or push the
  failed R2.2 candidate at `db1c3404`, its checkpoint `0be31114`, or any earlier
  Specification 16 candidate.

## Relevant Context Entry Points

- factory authority files; this specification; Specification 16 umbrella; integrated
  R2.1 source/test; current Node intrinsic availability.

## Risk Lane

Red. This is a hostile byte boundary using only synthetic public bytes; no real secret
or external action is authorized.

## Targeted Verification

- `npm test -- packages/agent/test/secret-commitment-bytes.test.ts`
- `npm run typecheck`
- `npm run factory:check`

Before production behavior, primary inspects asserted inventory counts, typecheck, and
meaningful red. Each exits zero after implementation using existing dependencies.

## Integration Verification

Update against latest local `neo`, obtain fresh Sol `ship`, run `npm run verify`
exactly once, and integrate only without candidate-caused regression. No install,
push, external transfer, or live action.

## Escalation Conditions

Escalate for changed limits/backing policy, unavailable trusted intrinsics, any public
export/barrel or file-scope expansion, real secret/external action, `GAPS`, or the same
failure after two focused repairs.
